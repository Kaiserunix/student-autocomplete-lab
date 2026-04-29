import { describe, expect, test } from "vitest";
import { requestResponseText } from "../src/models/responsesClient";

describe("OpenAI Responses client", () => {
  test("posts a responses request and returns output_text", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          output_text: "{\"problem_id\":\"P1427\"}"
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    };

    const text = await requestResponseText(
      {
        baseUrl: "https://api.openai.test/v1",
        apiKey: "test-key",
        model: "gpt-4.1-nano"
      },
      {
        prompt: "Return JSON only.",
        maxOutputTokens: 512,
        temperature: 0.2
      },
      fakeFetch as typeof fetch
    );

    expect(text).toBe("{\"problem_id\":\"P1427\"}");
    expect(calls[0].url).toBe("https://api.openai.test/v1/responses");
    expect(calls[0].init?.method).toBe("POST");
    expect((calls[0].init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      model: "gpt-4.1-nano",
      max_output_tokens: 512,
      temperature: 0.2
    });
  });
});
