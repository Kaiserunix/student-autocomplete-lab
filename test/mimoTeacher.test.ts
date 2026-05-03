import { describe, expect, test } from "vitest";
import { requestMimoTeachingDiagnosis } from "../src/teaching/mimoTeacher";

describe("MiMo teaching diagnosis", () => {
  test("calls MiMo completions and parses the teaching report", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  pain_points: [
                    {
                      label: "root_identification",
                      confidence: 0.82,
                      evidence: "student picks root from inorder[0]"
                    }
                  ],
                  hint: "先确认后序遍历的最后一个字符代表什么。",
                  skill_update: {
                    candidate: "binary-tree-traversal-reconstruction",
                    reason: "root identification is unstable",
                    rules: ["Use the last postorder item as the current root."]
                  },
                  recommendation: {
                    problem_id: "P1305",
                    reason: "Practice preorder output before reconstruction."
                  }
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const report = await requestMimoTeachingDiagnosis(
      {
        baseUrl: "https://mimo.example.test/v1",
        apiKey: "secret",
        model: "mimo-v2.5-pro"
      },
      {
        problem: { id: "P1030", title: "求先序排列", summary: "inorder + postorder -> preorder" },
        language: "python",
        studentCode: "root = in_s[0]",
        ojVerdict: { status: "WA", passedTests: 1, totalTests: 3 },
        localEvidence: [],
        studentProfile: { painPointCounts: {}, activeSkills: [] }
      },
      fakeFetch as typeof fetch
    );

    expect(report.painPoints[0].label).toBe("root_identification");
    expect(calls[0].url).toBe("https://mimo.example.test/v1/chat/completions");
    expect(JSON.parse(String(calls[0].init?.body))).toMatchObject({
      model: "mimo-v2.5-pro",
      temperature: 0.2
    });
  });

  test("adds context when MiMo returns non-JSON text", async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response(JSON.stringify({ choices: [{ message: { content: "" } }] }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });

    await expect(
      requestMimoTeachingDiagnosis(
        {
          baseUrl: "https://mimo.example.test/v1",
          apiKey: "secret",
          model: "mimo-v2.5-pro"
        },
        {
          problem: { id: "P1030", title: "求先序排列", summary: "inorder + postorder -> preorder" },
          language: "python",
          studentCode: "root = in_s[0]",
          ojVerdict: { status: "WA" },
          localEvidence: [],
          studentProfile: { painPointCounts: {}, activeSkills: [] }
        },
        fakeFetch as typeof fetch
      )
    ).rejects.toThrow(/MiMo teaching diagnosis returned invalid JSON/);
  });

  test("uses problem context to normalize broad recursion skills into binary-tree depth skills", async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  pain_points: [
                    {
                      label: "recursion_base_case",
                      confidence: 0.9,
                      evidence: "empty child contributes one extra layer"
                    }
                  ],
                  hint: "先把空孩子深度定为 0。",
                  skill_update: {
                    candidate: "recursion-base-case-pattern",
                    reason: "The issue is a recursive base case.",
                    rules: ["Empty child is depth 0."]
                  }
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );

    const report = await requestMimoTeachingDiagnosis(
      {
        baseUrl: "https://mimo.example.test/v1",
        apiKey: "secret",
        model: "mimo-v2.5"
      },
      {
        problem: {
          id: "P4913",
          title: "二叉树深度",
          summary: "Recursive base cases and binary tree depth definitions with numbered children."
        },
        language: "python",
        studentCode: "def depth(u): return max(depth(l[u]), depth(r[u]))",
        ojVerdict: { status: "WA" },
        localEvidence: [],
        studentProfile: { painPointCounts: {}, activeSkills: [] }
      },
      fakeFetch as typeof fetch
    );

    expect(report.skillUpdate?.candidate).toBe("binary-tree-depth-numbered-children");
  });
});
