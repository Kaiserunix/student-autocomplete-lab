import { describe, expect, test } from "vitest";
import { requestMimoAutocomplete } from "../src/autocomplete/mimoAutocomplete";

describe("MiMo autocomplete pipeline", () => {
  test("builds a MiMo prompt, requests completion, and filters noisy continuation", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          choices: [
            {
              text: " return a + b\n\ndef subtract(a, b):\n    return a - b"
            }
          ]
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" }
        }
      );
    };

    const suggestion = await requestMimoAutocomplete(
      {
        baseUrl: "https://api.example.test/v1",
        apiKey: "test-key",
        model: "mimo-v2.5-pro"
      },
      {
        prefix: "def add(a, b):\n    ",
        suffix: "\nprint(add(1, 2))",
        language: "python",
        filePath: "trial.py",
        habits: ["Prefer direct Python."]
      },
      fakeFetch as typeof fetch
    );

    expect(suggestion).toBe("return a + b");
    expect(JSON.parse(String(calls[0].init?.body)).prompt).not.toContain("print(add(1, 2))");
  });
});
