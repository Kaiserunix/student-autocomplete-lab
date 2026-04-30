import { describe, expect, test } from "vitest";
import { parseSubmissionJudgeReport, requestMimoSubmissionJudge } from "../src/teaching/submissionJudge";

describe("submission judge", () => {
  test("parses a conservative AI submission judgment", () => {
    const report = parseSubmissionJudgeReport(
      JSON.stringify({
        verdict: "likely_wa",
        confidence: 0.72,
        summary: "输出格式可能不匹配。",
        issues: [
          {
            label: "output_format",
            severity: "medium",
            evidence: "代码没有处理数字之间的点阵间隔。",
            fix_hint: "先手推一位和两位数字的输出。"
          }
        ],
        test_suggestions: [
          {
            input: "2\n01\n",
            expected_behavior: "应该输出 5 行点阵。",
            reason: "覆盖多位数字间隔。"
          }
        ],
        next_action: "先本地运行样例。"
      })
    );

    expect(report.verdict).toBe("likely_wa");
    expect(report.issues[0].label).toBe("output_format");
    expect(report.testSuggestions[0].input).toContain("01");
  });

  test("calls MiMo chat completions with Chinese-first submission review prompt", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  verdict: "needs_run",
                  confidence: 0.55,
                  summary: "需要运行样例确认。",
                  issues: [],
                  test_suggestions: [],
                  next_action: "运行样例并贴出结果。"
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const report = await requestMimoSubmissionJudge(
      {
        baseUrl: "https://mimo.example.test/v1",
        apiKey: "secret",
        model: "mimo-v2.5"
      },
      {
        problem: {
          id: "P5730",
          title: "显示屏",
          summary: "输出 5 行点阵。"
        },
        language: "python",
        studentCode: "print('todo')",
        studentProfile: {
          painPointCounts: {
            output_format: 2
          }
        }
      },
      fakeFetch as typeof fetch
    );

    const body = JSON.parse(String(calls[0].init?.body));
    expect(calls[0].url).toBe("https://mimo.example.test/v1/chat/completions");
    expect(body.messages[1].content).toContain("简体中文");
    expect(report.verdict).toBe("needs_run");
  });
});
