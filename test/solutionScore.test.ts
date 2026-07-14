import { describe, expect, test } from "vitest";
import { parseSolutionScoreReport, requestMimoSolutionScore } from "../src/teaching/solutionScore";

describe("solution score", () => {
  test("parses learning score separately from OJ verdict", () => {
    const report = parseSolutionScoreReport(
      JSON.stringify({
        oj_result: "AC",
        learning_score: 64,
        rubric: {
          correctness: 90,
          complexity_match: 45,
          idea_growth: 55,
          code_quality: 70,
          independence: 60
        },
        complexity_assessment: {
          observed: "O(n^2) 暴力枚举",
          expected: "O(n log n) 或计数优化",
          verdict: "complexity_gap",
          reason: "本题核心是从暴力走向更可迁移的统计模型。"
        },
        pain_points: [
          {
            label: "bruteforce_no_growth",
            confidence: 0.78,
            evidence: "AC 依赖小数据，没有提炼优化思路。"
          }
        ],
        summary: "OJ 通过了，但算法收获偏低。",
        next_action: "补一题同类优化题。",
        recommendation: {
          problem_id: "P2141",
          reason: "练习去重与计数。"
        }
      })
    );

    expect(report.ojResult).toBe("AC");
    expect(report.learningScore).toBe(64);
    expect(report.complexityAssessment.verdict).toBe("complexity_gap");
    expect(report.painPoints[0].label).toBe("bruteforce_no_growth");
  });

  test("keeps usable scores when the model omits a concrete recommendation problem", () => {
    const report = parseSolutionScoreReport(
      JSON.stringify({
        oj_result: "UNKNOWN",
        learning_score: 90,
        rubric: {
          correctness: 95,
          complexity_match: 100,
          idea_growth: 80,
          code_quality: 90,
          independence: 100
        },
        complexity_assessment: {
          observed: "O(n)",
          expected: "O(n)",
          verdict: "matched",
          reason: "复杂度符合题目要求。"
        },
        pain_points: [
          {
            label: "needs_teacher_review",
            confidence: 0.4,
            evidence: "模型没有足够证据给出下一题。"
          }
        ],
        summary: "评分内容可用，但没有具体推荐题号。",
        next_action: "继续完成当前题。",
        recommendation: {
          reason: "先复盘当前题。"
        }
      })
    );

    expect(report.learningScore).toBe(90);
    expect(report.recommendation).toBeUndefined();
  });

  test("accepts camelCase recommendation ids and fallback recommendation reasons", () => {
    const report = parseSolutionScoreReport(
      JSON.stringify({
        oj_result: "AC",
        learning_score: 76,
        rubric: {
          correctness: 90,
          complexity_match: 70,
          idea_growth: 70,
          code_quality: 80,
          independence: 70
        },
        complexity_assessment: {
          observed: "O(n^2)",
          expected: "O(n^2)",
          verdict: "acceptable_bruteforce",
          reason: "本题数据范围允许。"
        },
        pain_points: [],
        summary: "可以进入同类练习。",
        next_action: "做下一题。",
        recommendation: {
          problemId: "P1428"
        }
      })
    );

    expect(report.recommendation).toEqual({
      problemId: "P1428",
      reason: "模型未给出推荐理由。"
    });
  });

  test("calls MiMo with AC scoring rubric and attempt stats", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  oj_result: "AC",
                  learning_score: 82,
                  rubric: {
                    correctness: 95,
                    complexity_match: 80,
                    idea_growth: 80,
                    code_quality: 82,
                    independence: 75
                  },
                  complexity_assessment: {
                    observed: "O(n)",
                    expected: "O(n)",
                    verdict: "matched",
                    reason: "复杂度符合题目训练目标。"
                  },
                  pain_points: [],
                  summary: "这次 AC 能证明基础模型已经掌握。",
                  next_action: "进入下一题。",
                  recommendation: {
                    problem_id: "P5728",
                    reason: "继续练组合枚举。"
                  }
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const report = await requestMimoSolutionScore(
      {
        baseUrl: "https://mimo.example.test/v1",
        apiKey: "secret",
        model: "mimo-v2.5"
      },
      {
        problem: { id: "P2141", title: "珠心算测验", summary: "统计能否由两个数相加得到" },
        language: "python",
        studentCode: "print(ans)",
        studentProfile: { painPointCounts: {}, activeSkills: [] },
        ojVerdict: { status: "AC" },
        attemptStats: { hintCount: 1, gaveUp: false, revealedAnswer: false }
      },
      fakeFetch as typeof fetch
    );

    const body = JSON.parse(String(calls[0].init?.body));
    expect(body.messages[1].content).toContain("学习评分");
    expect(body.messages[1].content).toContain("hintCount");
    expect(report.learningScore).toBe(82);
  });
});
