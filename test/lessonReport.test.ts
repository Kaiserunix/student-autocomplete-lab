import { describe, expect, test } from "vitest";
import { parseLessonReport, requestMimoLessonReport } from "../src/teaching/lessonReport";

describe("lesson report", () => {
  test("parses the abandoned-stage teaching report", () => {
    const report = parseLessonReport(
      JSON.stringify({
        standard_approach: "先把题目转成二维状态，再按行列遍历。",
        pain_points: [
          {
            label: "loop_boundary",
            confidence: 0.84,
            evidence: "循环跳过了最后一列。"
          }
        ],
        minimal_fix_path: ["先只修循环终点。", "再用样例手推最后一列。"],
        reference_solution: {
          language: "python",
          code: "n = int(input())\nprint(n)\n"
        },
        remedial_exercise: {
          type: "micro_drill",
          title: "三分钟边界练习",
          prompt: "写出 0..n-1 与 1..n 的循环范围。",
          reason: "先把循环边界稳定下来。"
        },
        archive_reason: "abandoned"
      })
    );

    expect(report.painPoints[0].label).toBe("loop_boundary");
    expect(report.minimalFixPath).toHaveLength(2);
    expect(report.referenceSolution?.code).toContain("print");
    expect(report.remedialExercise.type).toBe("micro_drill");
    expect(report.archiveReason).toBe("abandoned");
  });

  test("calls MiMo chat completions with a Chinese lesson-stage prompt", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  standard_approach: "用后序最后一个字符做根，再切左右子树。",
                  pain_points: [
                    {
                      label: "root_identification",
                      confidence: 0.9,
                      evidence: "代码从中序开头拿根。"
                    }
                  ],
                  minimal_fix_path: ["先改根的来源。"],
                  reference_solution: {
                    language: "python",
                    code: "def build(...): pass"
                  },
                  remedial_exercise: {
                    type: "problem",
                    problem_id: "P1305",
                    title: "新二叉树",
                    prompt: "先练直接输出前序。",
                    reason: "降低重构题的认知负担。"
                  },
                  archive_reason: "abandoned"
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const report = await requestMimoLessonReport(
      {
        baseUrl: "https://mimo.example.test/v1",
        apiKey: "secret",
        model: "mimo-v2.5"
      },
      {
        problem: { id: "P1030", title: "求先序排列", summary: "中序 + 后序 -> 前序" },
        language: "python",
        studentCode: "root = inorder[0]",
        studentProfile: { painPointCounts: { subtree_boundary: 2 }, activeSkills: [] },
        studentRequest: "我完全卡住了",
        hintCount: 2
      },
      fakeFetch as typeof fetch
    );

    const body = JSON.parse(String(calls[0].init?.body));
    expect(calls[0].url).toBe("https://mimo.example.test/v1/chat/completions");
    expect(body.messages[1].content).toContain("讲解/补救阶段");
    expect(body.messages[1].content).toContain("我完全卡住了");
    expect(report.painPoints[0].label).toBe("root_identification");
  });
});
