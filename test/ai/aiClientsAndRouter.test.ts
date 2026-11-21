import { describe, expect, it } from "vitest";
import {
  AiClientError,
  DEFAULT_AI_ROUTER_CONFIG,
  ModelRouter,
  listAnthropicModels,
  listOpenAiCompatModels,
  requestAnthropicMessage,
  requestOpenAiCompatChat,
  requestOpenAiCompatFim,
  resolveRoleRoute,
  streamAnthropicMessage,
  streamOpenAiCompatChat
} from "../../src/core/ai";

function makeSseResponse(chunks: string[]): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });
  return new Response(stream, {
    status: 200,
    headers: { "content-type": "text/event-stream" }
  });
}

describe("OpenAI-compatible & Ollama client", () => {
  it("completes non-streaming chat and FIM requests with DeepSeek /v1 and /beta", async () => {
    const calls: Array<{ url: string; headers: Record<string, string>; body?: Record<string, unknown> }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      const headers = (init?.headers ?? {}) as Record<string, string>;
      const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
      calls.push({ url, headers, body });

      if (url.endsWith("/v1/chat/completions")) {
        return new Response(
          JSON.stringify({
            model: "deepseek-chat",
            choices: [{ message: { content: "Socratic hint" }, finish_reason: "stop" }],
            usage: { prompt_tokens: 12, completion_tokens: 4, total_tokens: 16 }
          }),
          { status: 200 }
        );
      }
      if (url.endsWith("/beta/completions")) {
        return new Response(
          JSON.stringify({
            model: "deepseek-chat",
            choices: [{ text: "return a + b", finish_reason: "stop" }]
          }),
          { status: 200 }
        );
      }
      return new Response("not found", { status: 404 });
    };

    const chatRes = await requestOpenAiCompatChat(
      {
        provider: "openai-compatible",
        baseUrl: "https://api.deepseek.com/v1",
        model: "deepseek-chat",
        apiKey: "sk-chat-key-123456"
      },
      { messages: [{ role: "user", content: "hi" }], maxTokens: 32 },
      { fetchImpl: fetchMock }
    );
    expect(chatRes.text).toBe("Socratic hint");
    expect(chatRes.usage?.totalTokens).toBe(16);

    const fimRes = await requestOpenAiCompatFim(
      {
        provider: "openai-compatible",
        baseUrl: "https://api.deepseek.com/beta",
        model: "deepseek-chat",
        apiKey: "sk-fim-key-987654"
      },
      { prefix: "def add(a, b):\n    ", suffix: "\n", maxTokens: 16 },
      { fetchImpl: fetchMock }
    );
    expect(fimRes.text).toBe("return a + b");
    expect(fimRes.renderer).toBe("deepseek-fim");
    expect(calls[0]?.headers.authorization).toBe("Bearer sk-chat-key-123456");
    expect(calls[1]?.headers.authorization).toBe("Bearer sk-fim-key-987654");
    expect(calls[1]?.body?.suffix).toBe("\n");
  });

  it("streams OpenAI-compatible SSE chunks accurately even across split frames", async () => {
    const fetchMock: typeof fetch = async () =>
      makeSseResponse([
        'data: {"model":"deepseek-chat","choices":[{"delta":{"content":"Check "}}]}\n\n',
        'data: {"choices":[{"delta":{"content":"your "}}]}\n',
        'data: {"choices":[{"delta":{"content":"boundary!"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n'
      ]);

    const deltas: string[] = [];
    const res = await streamOpenAiCompatChat(
      {
        provider: "openai-compatible",
        baseUrl: "https://api.deepseek.com/v1",
        model: "deepseek-chat",
        apiKey: "sk-stream-test-1234"
      },
      { messages: [{ role: "user", content: "hint" }] },
      (chunk) => deltas.push(chunk),
      { fetchImpl: fetchMock }
    );

    expect(deltas).toEqual(["Check ", "your ", "boundary!"]);
    expect(res.text).toBe("Check your boundary!");
    expect(res.finishReason).toBe("stop");
  });

  it("supports local Ollama without an API key and falls back to /api/tags on /v1/models 404", async () => {
    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "http://localhost:11434/v1/models") {
        return new Response("Not Found", { status: 404 });
      }
      if (url === "http://localhost:11434/api/tags") {
        return new Response(
          JSON.stringify({ models: [{ name: "qwen2.5-coder:7b" }, { name: "deepseek-r1:8b" }] }),
          { status: 200 }
        );
      }
      return new Response("unexpected", { status: 500 });
    };

    const modelsRes = await listOpenAiCompatModels(
      {
        provider: "ollama",
        baseUrl: "http://localhost:11434",
        model: "qwen2.5-coder:7b"
      },
      { fetchImpl: fetchMock }
    );

    expect(modelsRes.endpoint).toBe("http://localhost:11434/api/tags");
    expect(modelsRes.models.map((m) => m.id)).toEqual(["qwen2.5-coder:7b", "deepseek-r1:8b"]);
  });
});

describe("Anthropic Native Messages client", () => {
  it("extracts system messages, sends x-api-key + anthropic-version, and streams deltas", async () => {
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: Record<string, unknown> = {};

    const fetchMock: typeof fetch = async (input, init) => {
      const url = String(input);
      capturedHeaders = (init?.headers ?? {}) as Record<string, string>;
      if (url.endsWith("/v1/models")) {
        return new Response(JSON.stringify({ data: [{ id: "claude-sonnet-4-5", display_name: "Claude Sonnet" }] }), {
          status: 200
        });
      }
      capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      if (capturedBody.stream === true) {
        return makeSseResponse([
          'event: message_start\ndata: {"type":"message_start","message":{"model":"claude-sonnet-4-5"}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Trace "}}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"index 0."}}\n\n',
          'event: message_delta\ndata: {"type":"message_delta","delta":{"stop_reason":"end_turn"}}\n\n'
        ]);
      }
      return new Response(
        JSON.stringify({
          model: "claude-sonnet-4-5",
          content: [{ type: "text", text: "OK" }],
          stop_reason: "end_turn",
          usage: { input_tokens: 10, output_tokens: 2 }
        }),
        { status: 200 }
      );
    };

    const cfg = {
      provider: "anthropic" as const,
      baseUrl: "https://api.anthropic.com",
      model: "claude-sonnet-4-5",
      apiKey: "sk-ant-test-secret-0001"
    };

    const models = await listAnthropicModels(cfg, { fetchImpl: fetchMock });
    expect(models.models[0]?.id).toBe("claude-sonnet-4-5");
    expect(capturedHeaders["x-api-key"]).toBe("sk-ant-test-secret-0001");
    expect(capturedHeaders["anthropic-version"]).toBe("2023-06-01");

    const msg = await requestAnthropicMessage(
      cfg,
      {
        messages: [
          { role: "system", content: "Never leak code." },
          { role: "user", content: "Help me." }
        ]
      },
      { fetchImpl: fetchMock }
    );
    expect(msg.text).toBe("OK");
    expect(capturedBody.system).toBe("Never leak code.");
    expect(capturedBody.messages).toEqual([{ role: "user", content: "Help me." }]);

    const deltas: string[] = [];
    const streamed = await streamAnthropicMessage(
      cfg,
      { messages: [{ role: "user", content: "stream" }] },
      (chunk) => deltas.push(chunk),
      { fetchImpl: fetchMock }
    );
    expect(deltas).toEqual(["Trace ", "index 0."]);
    expect(streamed.text).toBe("Trace index 0.");
    expect(streamed.finishReason).toBe("end_turn");
  });
});

describe("ModelRouter strict Chat / FIM isolation", () => {
  it("routes Chat and FIM to independent providers, baseUrls, models, and API keys", async () => {
    const requests: Array<{ url: string; auth?: string; xApiKey?: string }> = [];
    const fetchMock: typeof fetch = async (input, init) => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      requests.push({
        url: String(input),
        auth: headers.authorization,
        xApiKey: headers["x-api-key"]
      });
      if (String(input).includes("anthropic")) {
        return new Response(JSON.stringify({ content: [{ type: "text", text: "Anthropic coach" }] }), { status: 200 });
      }
      return new Response(JSON.stringify({ choices: [{ text: "return x * 2" }] }), { status: 200 });
    };

    const router = new ModelRouter(
      {
        chat: {
          provider: "anthropic",
          baseUrl: "https://api.anthropic.com/v1",
          model: "claude-sonnet-4-5",
          apiKey: "sk-ant-chat-only-key"
        },
        fim: {
          provider: "openai-compatible",
          baseUrl: "https://api.deepseek.com/beta",
          model: "deepseek-chat",
          apiKey: "sk-deepseek-fim-only-key"
        }
      },
      { fetchImpl: fetchMock }
    );

    const chatRes = await router.completeChat({ messages: [{ role: "user", content: "hint" }] });
    const fimRes = await router.completeFim({ prefix: "def dbl(x):\n    " });

    expect(chatRes.text).toBe("Anthropic coach");
    expect(fimRes.text).toBe("return x * 2");
    expect(requests[0]).toEqual({
      url: "https://api.anthropic.com/v1/messages",
      auth: undefined,
      xApiKey: "sk-ant-chat-only-key"
    });
    expect(requests[1]).toEqual({
      url: "https://api.deepseek.com/beta/completions",
      auth: "Bearer sk-deepseek-fim-only-key",
      xApiKey: undefined
    });

    // Mutating chat role must NOT affect FIM role
    router.updateRoleConfig("chat", {
      provider: "ollama",
      baseUrl: "http://localhost:11434/v1",
      model: "qwen2.5:7b"
    });
    expect(router.getRoleConfig("fim").apiKey).toBe("sk-deepseek-fim-only-key");
    expect(router.getRoleConfig("fim").baseUrl).toBe("https://api.deepseek.com/beta");
  });

  it("blocks DeepSeek FIM on /v1 with deterministic DEEPSEEK_FIM_BETA_REQUIRED before network", async () => {
    let networkCalled = false;
    const router = new ModelRouter(
      {
        chat: { ...DEFAULT_AI_ROUTER_CONFIG.chat, apiKey: "sk-chat-123456" },
        fim: {
          provider: "openai-compatible",
          baseUrl: "https://api.deepseek.com/v1",
          model: "deepseek-chat",
          apiKey: "sk-fim-123456"
        }
      },
      {
        fetchImpl: async () => {
          networkCalled = true;
          return new Response("should not call", { status: 500 });
        }
      }
    );

    const route = resolveRoleRoute("fim", router.getRoleConfig("fim"));
    expect(route.configurationIssue).toBe("deepseek-fim-beta-required");
    await expect(router.completeFim({ prefix: "x = " })).rejects.toMatchObject({
      code: "DEEPSEEK_FIM_BETA_REQUIRED"
    } satisfies Partial<AiClientError>);
    expect(networkCalled).toBe(false);
  });
});
