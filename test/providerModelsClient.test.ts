import { describe, expect, test } from "vitest";
import { listProviderModels } from "../src/models/providerModelsClient";

describe("provider model listing client", () => {
  test("lists OpenAI-compatible models without exposing the API key", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          object: "list",
          data: [
            { id: "mimo-v2.5", owned_by: "mimo" },
            { id: "mimo-v2.5-tts", owned_by: "mimo" },
            { id: "mimo-v2.5-pro", owned_by: "mimo" }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const result = await listProviderModels(
      {
        mode: "openai-compatible",
        baseUrl: "https://token-plan-cn.xiaomimimo.com/v1",
        apiKey: "secret-key",
        anthropicVersion: "2023-06-01"
      },
      fakeFetch as typeof fetch
    );

    expect(calls[0].url).toBe("https://token-plan-cn.xiaomimimo.com/v1/models");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer secret-key");
    expect(JSON.stringify(result)).not.toContain("secret-key");
    expect(result.models.map((model) => model.id)).toEqual(["mimo-v2.5", "mimo-v2.5-pro", "mimo-v2.5-tts"]);
    expect(result.models.find((model) => model.id === "mimo-v2.5")?.recommendedFor).toContain("chat");
    expect(result.models.find((model) => model.id.includes("tts"))?.isAudioModel).toBe(true);
  });

  test("lists Anthropic Native models using Anthropic headers", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          data: [
            { id: "claude-sonnet-4-5", display_name: "Claude Sonnet 4.5", created_at: "2026-01-01T00:00:00Z" }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const result = await listProviderModels(
      {
        mode: "anthropic-native",
        baseUrl: "https://api.anthropic.com/v1",
        apiKey: "anthropic-secret",
        anthropicVersion: "2023-06-01"
      },
      fakeFetch as typeof fetch
    );

    const headers = calls[0].init?.headers as Record<string, string>;
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/models");
    expect(headers["x-api-key"]).toBe("anthropic-secret");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(result.models).toEqual([
      {
        id: "claude-sonnet-4-5",
        owner: "Claude Sonnet 4.5",
        created: "2026-01-01T00:00:00Z",
        rawProvider: "anthropic-native",
        isAudioModel: false,
        recommendedFor: ["chat", "autocomplete"]
      }
    ]);
  });

  test("explains common model-listing HTTP failures", async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response(JSON.stringify({ error: { message: "bad key" } }), {
        status: 401,
        headers: { "content-type": "application/json" }
      });

    await expect(
      listProviderModels(
        {
          mode: "openai",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "bad-key"
        },
        fakeFetch as typeof fetch
      )
    ).rejects.toThrow("API Key 可能无效或无权限");
  });
});
