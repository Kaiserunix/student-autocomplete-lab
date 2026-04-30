import { describe, expect, test } from "vitest";
import { parseOptimizationReport, requestMimoOptimizationReport } from "../src/teaching/optimizationReport";

describe("optimization report", () => {
  test("parses a no-need optimization verdict for simple problems", () => {
    const report = parseOptimizationReport(
      JSON.stringify({
        verdict: "no_need",
        summary: "这题本身就是基础输入输出，当前解法无需优化。",
        time_complexity: {
          current: "O(1)",
          target: "O(1)",
          action: "不需要优化时间复杂度。"
        },
        memory: {
          current: "O(1)",
          target: "O(1)",
          action: "不需要额外内存优化。"
        },
        code_quality: {
          verdict: "ok",
          action: "保持直接写法即可。"
        },
        next_step: "进入下一题。"
      })
    );

    expect(report.verdict).toBe("no_need");
    expect(report.optimizationNeeded).toBe(false);
    expect(report.timeComplexity.action).toContain("不需要");
  });

  test("parses an optimization-needed verdict", () => {
    const report = parseOptimizationReport(
      JSON.stringify({
        verdict: "optimize",
        summary: "暴力枚举能过样例，但应学习计数优化。",
        time_complexity: {
          current: "O(n^2)",
          target: "O(n)",
          action: "把双重枚举改成频次数组或集合查询。"
        },
        memory: {
          current: "O(n)",
          target: "O(n)",
          action: "内存无需额外压缩。"
        },
        code_quality: {
          verdict: "needs_cleanup",
          action: "把读入、统计、输出拆成清晰步骤。"
        },
        next_step: "先写出目标复杂度，再改循环结构。"
      })
    );

    expect(report.verdict).toBe("optimize");
    expect(report.optimizationNeeded).toBe(true);
    expect(report.timeComplexity.target).toBe("O(n)");
  });

  test("calls MiMo with an archived-problem optimization prompt", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  verdict: "no_need",
                  summary: "题目太简单，无须优化。",
                  time_complexity: { current: "O(1)", target: "O(1)", action: "无需优化。" },
                  memory: { current: "O(1)", target: "O(1)", action: "无需优化。" },
                  code_quality: { verdict: "ok", action: "保持清晰即可。" },
                  next_step: "继续下一题。"
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const report = await requestMimoOptimizationReport(
      {
        baseUrl: "https://mimo.example.test/v1",
        apiKey: "secret",
        model: "mimo-v2.5",
        format: "openai-chat"
      },
      {
        problem: {
          id: "P1001",
          title: "A+B Problem",
          summary: "输入两个整数，输出和。"
        },
        language: "python",
        studentCode: "a, b = map(int, input().split())\nprint(a + b)",
        archivedReason: "completed",
        previousScoreSummary: "AC · 90/100",
        studentProfile: { painPointCounts: {}, activeSkills: [] },
        studentRequest: "还能优化吗？"
      },
      fakeFetch as typeof fetch
    );

    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.messages[1].content).toContain("已归档题目");
    expect(body.messages[1].content).toContain("时间复杂度");
    expect(body.messages[1].content).toContain("内存");
    expect(body.messages[1].content).toContain("无需优化");
    expect(body.messages[1].content).toContain("bisect");
    expect(body.messages[1].content).toContain("O(log n)");
    expect(report.optimizationNeeded).toBe(false);
  });
});
