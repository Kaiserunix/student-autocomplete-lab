import { describe, expect, test } from "vitest";
import {
  requestMimoAutocomplete,
  requestMimoAutocompleteDetailed
} from "../src/autocomplete/mimoAutocomplete";
import { createEmptyStudentSkill } from "../src/teaching/studentSkill";

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

  test("uses a composed Python tail and exact DeepSeek FIM suffix", async () => {
    const calls: Array<{ init?: RequestInit }> = [];
    const fakeFetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ init });
      return new Response(JSON.stringify({
        choices: [{ text: "total += values[i]" }]
      }), { status: 200 });
    };
    const skill = createEmptyStudentSkill("student-a", "2026-07-14T00:00:00.000Z");
    skill.codeHabits.languageRules.python = ["Check loop boundary."];

    const result = await requestMimoAutocompleteDetailed(
      {
        format: "openai-completions",
        baseUrl: "https://api.deepseek.com/beta",
        apiKey: "test-key",
        model: "deepseek-v4-flash"
      },
      {
        prefix: "for i in range(n):\n    ",
        suffix: "\nprint(total)",
        language: "python",
        filePath: "C:\\private\\P1030.py",
        studentSkill: skill
      },
      fakeFetch as typeof fetch
    );
    const body = JSON.parse(String(calls[0].init?.body));

    expect(body.prompt).toContain("# skill tail:");
    expect(body.suffix).toBe("\nprint(total)");
    expect(result.status).toBe("success");
    expect(result.suggestion).toBe("total += values[i]");
    expect(JSON.stringify(result.audit)).not.toContain("P1030");
    expect(JSON.stringify(result.audit)).not.toContain("for i");
  });

  test("reports validator rejection separately from model-empty", async () => {
    let calls = 0;
    const fakeFetch = async (): Promise<Response> => {
      calls += 1;
      return new Response(JSON.stringify({
        choices: [{ text: "Here is the code:\nreturn answer" }]
      }), { status: 200 });
    };

    const result = await requestMimoAutocompleteDetailed(
      {
        baseUrl: "https://api.example.test/v1",
        apiKey: "test-key",
        model: "completion-model"
      },
      {
        prefix: "def solve():\n    ",
        suffix: "",
        language: "python",
        filePath: "solution.py"
      },
      fakeFetch as typeof fetch
    );

    expect(result).toMatchObject({
      status: "validator-rejected",
      suggestion: "",
      rejectionReason: "explanation"
    });
    expect(calls).toBe(1);
  });
});
