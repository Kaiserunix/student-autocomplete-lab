import { describe, expect, test } from "vitest";
import { requestChatCompletionText } from "../src/models/chatCompletionsClient";

describe("OpenAI-compatible chat completions client", () => {
  test("posts a chat completions request and returns choices[0].message.content", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: "{\"ok\":true}" } }]
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
        responseFormat: { type: "json_object" }
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
  });
});
