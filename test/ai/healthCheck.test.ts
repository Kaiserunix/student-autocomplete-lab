import { describe, expect, it } from "vitest";
import { runAiHealthCheck } from "../../src/core/ai";

describe("3-Step AI Health Check", () => {
  it("passes all 3 steps (models -> chatSmoke -> fimSmoke) with DeepSeek /v1 Chat and /beta FIM", async () => {
    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://api.deepseek.com/v1/models") {
        return new Response(JSON.stringify({ data: [{ id: "deepseek-chat" }, { id: "deepseek-reasoner" }] }), {
          status: 200
        });
      }
      if (url === "https://api.deepseek.com/v1/chat/completions") {
        return new Response(JSON.stringify({ model: "deepseek-chat", choices: [{ message: { content: "OK" } }] }), {
          status: 200
        });
      }
      if (url === "https://api.deepseek.com/beta/completions") {
        return new Response(JSON.stringify({ model: "deepseek-chat", choices: [{ text: "return a + b" }] }), {
          status: 200
        });
      }
      return new Response("unexpected", { status: 404 });
    };

    const result = await runAiHealthCheck(
      {
        chat: {
          provider: "openai-compatible",
          baseUrl: "https://api.deepseek.com/v1",
          model: "deepseek-chat",
          apiKey: "sk-chat-secret-alpha99"
        },
        fim: {
          provider: "openai-compatible",
          baseUrl: "https://api.deepseek.com/beta",
          model: "deepseek-chat",
          apiKey: "sk-fim-secret-beta88"
        }
      },
      { fetchImpl: fetchMock, now: "2026-11-22T00:00:00.000Z" }
    );

    expect(result.allPassed).toBe(true);
    expect(result.models.status).toBe("pass");
    expect(result.models.count).toBe(2);
    expect(result.chatSmoke.status).toBe("pass");
    expect(result.fimSmoke.status).toBe("pass");
    expect(result.fimSmoke.renderer).toBe("deepseek-fim");

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain("sk-chat-secret-alpha99");
    expect(serialized).not.toContain("sk-fim-secret-beta88");
  });

  it("precisely catches deepseek-fim-beta-required when DeepSeek FIM is misconfigured to /v1 and gives bilingual guidance", async () => {
    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url === "https://api.deepseek.com/v1/models") {
        return new Response(JSON.stringify({ data: [{ id: "deepseek-chat" }] }), { status: 200 });
      }
      if (url === "https://api.deepseek.com/v1/chat/completions") {
        return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), { status: 200 });
      }
      throw new Error("Should not call /v1/completions for DeepSeek FIM");
    };

    const result = await runAiHealthCheck(
      {
        chat: {
          provider: "openai-compatible",
          baseUrl: "https://api.deepseek.com/v1",
          model: "deepseek-chat",
          apiKey: "sk-chat-secret-1111"
        },
        fim: {
          provider: "openai-compatible",
          baseUrl: "https://api.deepseek.com/v1",
          model: "deepseek-chat",
          apiKey: "sk-fim-secret-2222"
        }
      },
      { fetchImpl: fetchMock }
    );

    expect(result.allPassed).toBe(false);
    expect(result.models.status).toBe("pass");
    expect(result.chatSmoke.status).toBe("pass");
    expect(result.fimSmoke.status).toBe("fail");
    expect(result.fimSmoke.issueCode).toBe("deepseek-fim-beta-required");
    expect(result.fimSmoke.errorHint).toContain("https://api.deepseek.com/beta");
    expect(result.fimSmoke.errorHintEn).toContain("https://api.deepseek.com/beta");
  });

  it("redacts all Chat and FIM API keys even when upstream error responses echo secrets back", async () => {
    const chatKey = "sk-live-chat-SUPERSECRET999";
    const fimKey = "sk-ant-fim-TOPSECRET777";

    const fetchMock: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes("/models")) {
        return new Response(`Invalid token: Bearer ${chatKey} and x-api-key=${fimKey}`, { status: 401 });
      }
      if (url.includes("/chat/completions")) {
        return new Response(`Rejected key ${chatKey}`, { status: 403 });
      }
      return new Response(`Unauthorized ${fimKey} for endpoint`, { status: 401 });
    };

    const result = await runAiHealthCheck(
      {
        chat: {
          provider: "openai-compatible",
          baseUrl: "https://api.example.com/v1",
          model: "gpt-4o-mini",
          apiKey: chatKey
        },
        fim: {
          provider: "anthropic",
          baseUrl: "https://api.anthropic.com/v1",
          model: "claude-haiku-4-5",
          apiKey: fimKey
        }
      },
      { fetchImpl: fetchMock }
    );

    expect(result.allPassed).toBe(false);
    const dumped = JSON.stringify(result);
    expect(dumped).not.toContain(chatKey);
    expect(dumped).not.toContain(fimKey);
    expect(dumped).not.toContain("SUPERSECRET999");
    expect(dumped).not.toContain("TOPSECRET777");
    expect(result.models.error).toContain("[redacted]");
    expect(result.chatSmoke.error).toContain("[redacted]");
    expect(result.fimSmoke.error).toContain("[redacted]");
  });

  it("flags cross-origin missing FIM key with dedicated key guidance and passes local Ollama without keys", async () => {
    const crossOriginRes = await runAiHealthCheck(
      {
        chat: {
          provider: "openai-compatible",
          baseUrl: "https://api.openai.com/v1",
          model: "gpt-4o-mini",
          apiKey: "sk-openai-chat-only"
        },
        fim: {
          provider: "openai-compatible",
          baseUrl: "https://api.deepseek.com/beta",
          model: "deepseek-chat"
        }
      },
      {
        fetchImpl: async (input) => {
          if (String(input).endsWith("/models")) {
            return new Response(JSON.stringify({ data: [{ id: "gpt-4o-mini" }] }), { status: 200 });
          }
          return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), { status: 200 });
        }
      }
    );

    expect(crossOriginRes.fimSmoke.status).toBe("fail");
    expect(crossOriginRes.fimSmoke.keyState).toBe("missing");
    expect(crossOriginRes.fimSmoke.errorHint).toContain("FIM 专用 API Key");
    expect(crossOriginRes.fimSmoke.errorHintEn).toContain("FIM API key");

    const ollamaRes = await runAiHealthCheck(
      {
        chat: {
          provider: "ollama",
          baseUrl: "http://localhost:11434/v1",
          model: "qwen2.5-coder:7b"
        },
        fim: {
          provider: "ollama",
          baseUrl: "http://localhost:11434/v1",
          model: "qwen2.5-coder:7b"
        }
      },
      {
        fetchImpl: async (input) => {
          const url = String(input);
          if (url.endsWith("/models")) {
            return new Response(JSON.stringify({ data: [{ id: "qwen2.5-coder:7b" }] }), { status: 200 });
          }
          if (url.endsWith("/chat/completions")) {
            return new Response(JSON.stringify({ choices: [{ message: { content: "OK" } }] }), { status: 200 });
          }
          return new Response(JSON.stringify({ choices: [{ text: "return a + b" }] }), { status: 200 });
        }
      }
    );

    expect(ollamaRes.allPassed).toBe(true);
    expect(ollamaRes.models.keyState).toBe("not_required");
    expect(ollamaRes.fimSmoke.keyState).toBe("not_required");
  });
});
