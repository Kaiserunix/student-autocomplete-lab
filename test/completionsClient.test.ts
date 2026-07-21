import { describe, expect, test } from "vitest";
import { requestCompletion } from "../src/models/completionsClient";

describe("OpenAI-compatible completions client", () => {
  test("posts a completions request and returns the first text choice", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          choices: [{ text: "return a + b\n" }]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    };

    const text = await requestCompletion(
      {
        baseUrl: "https://api.example.test/v1",
        apiKey: "test-key",
        model: "mimo-v2.5-pro"
      },
      {
        prompt: "def add(a, b):\n    ",
        maxTokens: 64,
        temperature: 0.1,
        stop: ["</suffix>"]
      },
      fakeFetch as typeof fetch
    );

    expect(text).toBe("return a + b\n");
    expect(calls[0].url).toBe("https://api.example.test/v1/completions");
    expect(calls[0].init?.method).toBe("POST");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      model: "mimo-v2.5-pro",
      prompt: "def add(a, b):\n    ",
      max_tokens: 64,
      temperature: 0.1,
      stop: ["</suffix>"]
    });
  });

  test("can use OpenAI chat completions for autocomplete", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ choices: [{ message: { content: "return a + b\n" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    const text = await requestCompletion(
      {
        format: "openai-chat",
        baseUrl: "https://api.openai.com/v1",
        apiKey: "openai-key",
        model: "gpt-4.1-mini"
      },
      {
        prompt: "def add(a, b):\n    ",
        maxTokens: 64,
        temperature: 0.1
      },
      fakeFetch as typeof fetch
    );

    expect(text).toBe("return a + b\n");
    expect(calls[0].url).toBe("https://api.openai.com/v1/chat/completions");
  });

  test("sends suffix for DeepSeek FIM completions on the beta endpoint", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ choices: [{ text: "return a + b" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    const text = await requestCompletion(
      {
        format: "openai-completions",
        baseUrl: "https://api.deepseek.com/beta",
        apiKey: "deepseek-key",
        model: "deepseek-v4-flash"
      },
      {
        prompt: "def add(a, b):\n    ",
        suffix: "\nprint(add(1, 2))",
        maxTokens: 64,
        temperature: 0
      },
      fakeFetch as typeof fetch
    );

    expect(text).toBe("return a + b");
    expect(calls[0].url).toBe("https://api.deepseek.com/beta/completions");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      model: "deepseek-v4-flash",
      prompt: "def add(a, b):\n    ",
      suffix: "\nprint(add(1, 2))"
    });
  });

  test("does not send suffix to non-FIM completions endpoints", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ choices: [{ text: "return a + b" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    await requestCompletion(
      {
        format: "openai-completions",
        baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
        apiKey: "mimo-key",
        model: "mimo-v2.5-pro"
      },
      {
        prompt: "def add(a, b):\n    ",
        suffix: "\nprint(add(1, 2))",
        maxTokens: 64,
        temperature: 0
      },
      fakeFetch as typeof fetch
    );

    expect(JSON.parse(String(calls[0].init?.body))).not.toHaveProperty("suffix");
  });

  test("can use Anthropic Native messages for autocomplete", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ content: [{ type: "text", text: "return a + b\n" }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    const text = await requestCompletion(
      {
        format: "anthropic-messages",
        baseUrl: "https://api.anthropic.com/v1",
        apiKey: "anthropic-key",
        model: "claude-haiku-4-5"
      },
      {
        prompt: "def add(a, b):\n    ",
        maxTokens: 64,
        temperature: 0.1
      },
      fakeFetch as typeof fetch
    );

    const headers = calls[0].init?.headers as Record<string, string>;
    expect(text).toBe("return a + b\n");
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(headers["x-api-key"]).toBe("anthropic-key");
  });

  test("explains OpenAI-compatible completion fetch failures with endpoint and model", async () => {
    const fakeFetch = async (): Promise<Response> => {
      throw new TypeError("fetch failed");
    };

    await expect(
      requestCompletion(
        {
          format: "openai-completions",
          baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
          apiKey: "secret-key",
          model: "mimo-v2.5"
        },
        {
          prompt: "def add(a, b):\n    ",
          maxTokens: 64,
          temperature: 0
        },
        fakeFetch as typeof fetch
      )
    ).rejects.toThrow(/Completion request failed before HTTP response/);

    await expect(
      requestCompletion(
        {
          format: "openai-completions",
          baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
          apiKey: "secret-key",
          model: "mimo-v2.5"
        },
        {
          prompt: "def add(a, b):\n    ",
          maxTokens: 64,
          temperature: 0
        },
        fakeFetch as typeof fetch
      )
    ).rejects.not.toThrow("secret-key");
  });

  test("uses the rendered system instruction for chat autocomplete", async () => {
    const calls: Array<{ init?: RequestInit }> = [];
    const fakeFetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ init });
      return new Response(JSON.stringify({
        choices: [{ message: { content: "return value" } }]
      }), { status: 200 });
    };

    await requestCompletion(
      {
        format: "openai-chat",
        baseUrl: "https://api.example.test/v1",
        apiKey: "test-key",
        model: "chat-model"
      },
      {
        systemInstruction: "[head] local code only",
        prompt: "<prefix>\nvalue = \n</prefix>",
        maxTokens: 64,
        temperature: 0
      },
      fakeFetch as typeof fetch
    );

    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.messages[0]).toEqual({
      role: "system",
      content: "[head] local code only"
    });
  });

  test("uses normalized capabilities rather than re-detecting suffix support", async () => {
    const calls: Array<{ init?: RequestInit }> = [];
    const fakeFetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ init });
      return new Response(JSON.stringify({ choices: [{ text: "value" }] }), { status: 200 });
    };

    await requestCompletion(
      {
        format: "openai-completions",
        baseUrl: "https://api.deepseek.com/beta",
        apiKey: "test-key",
        model: "deepseek-v4-flash"
      },
      {
        capabilities: {
          renderer: "generic-completion",
          requestShape: "completion",
          supportsSystemInstruction: false,
          supportsFimSuffix: false,
          supportsStopSequences: true,
          prefixCacheFriendly: true
        },
        prompt: "value = ",
        suffix: "\nprint(value)",
        maxTokens: 64,
        temperature: 0
      },
      fakeFetch as typeof fetch
    );

    expect(JSON.parse(String(calls[0].init?.body))).not.toHaveProperty("suffix");
  });

  test("uses the rendered system instruction for Anthropic autocomplete", async () => {
    const calls: Array<{ init?: RequestInit }> = [];
    const fakeFetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ init });
      return new Response(JSON.stringify({
        content: [{ type: "text", text: "return value" }]
      }), { status: 200 });
    };

    await requestCompletion(
      {
        format: "anthropic-messages",
        baseUrl: "https://api.anthropic.com/v1",
        apiKey: "test-key",
        model: "claude-fast"
      },
      {
        systemInstruction: "[head] local code only",
        prompt: "<prefix>\nvalue = \n</prefix>",
        maxTokens: 64,
        temperature: 0
      },
      fakeFetch as typeof fetch
    );

    expect(JSON.parse(String(calls[0].init?.body)).system)
      .toBe("[head] local code only");
  });

  test("serializes an explicit Codex system instruction without changing legacy callers", async () => {
    const prompts: string[] = [];
    const transport = {
      generate: async (request: { prompt: string }): Promise<string> => {
        prompts.push(request.prompt);
        return "value";
      }
    };

    await requestCompletion(
      {
        mode: "openai",
        authMode: "codex-oauth",
        model: "gpt-5.3-codex-spark",
        format: "codex-app-server",
        transport
      },
      {
        systemInstruction: "[head] local code only",
        prompt: "value = ",
        maxTokens: 64,
        temperature: 0
      }
    );

    expect(prompts).toEqual([
      "<system>\n[head] local code only\n</system>\nvalue = "
    ]);
  });
});
