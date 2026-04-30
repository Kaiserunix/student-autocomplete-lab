import { describe, expect, test } from "vitest";
import { requestChatCompletionText } from "../src/models/chatCompletionsClient";

describe("OpenAI-compatible chat completions client", () => {
  test("posts a chat completions request and returns choices[0].message.content", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const usageEvents: unknown[] = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "{\"ok\":true}" } }],
          usage: {
            prompt_tokens: 12,
            completion_tokens: 5,
            total_tokens: 17
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const text = await requestChatCompletionText(
      {
        baseUrl: "https://mimo.example.test/v1",
        apiKey: "secret",
        model: "mimo-v2.5-pro"
      },
      {
        messages: [{ role: "user", content: "Return JSON." }],
        maxTokens: 512,
        temperature: 0.2,
        responseFormat: { type: "json_object" },
        onUsage: (usage) => usageEvents.push(usage)
      },
      fakeFetch as typeof fetch
    );

    expect(text).toBe("{\"ok\":true}");
    expect(calls[0].url).toBe("https://mimo.example.test/v1/chat/completions");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      model: "mimo-v2.5-pro",
      messages: [{ role: "user", content: "Return JSON." }],
      max_tokens: 512,
      temperature: 0.2,
      response_format: { type: "json_object" }
    });
    expect(usageEvents).toEqual([
      {
        source: "openai-chat",
        promptTokens: 12,
        completionTokens: 5,
        totalTokens: 17
      }
    ]);
  });

  test("posts an Anthropic Native messages request and returns the first text block", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const usageEvents: unknown[] = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          content: [{ type: "text", text: "{\"ok\":true}" }],
          usage: {
            input_tokens: 9,
            output_tokens: 4
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const text = await requestChatCompletionText(
      {
        format: "anthropic-messages",
        baseUrl: "https://api.anthropic.com/v1",
        apiKey: "anthropic-secret",
        model: "claude-sonnet-4-5"
      },
      {
        messages: [
          { role: "system", content: "Return JSON only." },
          { role: "user", content: "Say ok." }
        ],
        maxTokens: 512,
        temperature: 0.2,
        responseFormat: { type: "json_object" },
        onUsage: (usage) => usageEvents.push(usage)
      },
      fakeFetch as typeof fetch
    );

    const headers = calls[0].init?.headers as Record<string, string>;
    const body = JSON.parse(String(calls[0].init?.body));
    expect(text).toBe("{\"ok\":true}");
    expect(calls[0].url).toBe("https://api.anthropic.com/v1/messages");
    expect(headers["x-api-key"]).toBe("anthropic-secret");
    expect(headers["anthropic-version"]).toBe("2023-06-01");
    expect(body).toMatchObject({
      model: "claude-sonnet-4-5",
      max_tokens: 512,
      temperature: 0.2,
      system: "Return JSON only.",
      messages: [{ role: "user", content: "Say ok." }]
    });
    expect(body.response_format).toBeUndefined();
    expect(usageEvents).toEqual([
      {
        source: "anthropic-messages",
        inputTokens: 9,
        outputTokens: 4,
        promptTokens: 9,
        completionTokens: 4,
        totalTokens: 13
      }
    ]);
  });
});
