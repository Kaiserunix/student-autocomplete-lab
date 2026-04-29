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
});
