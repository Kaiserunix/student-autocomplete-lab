import { describe, expect, test } from "vitest";
import { runTeachingCycle } from "../src/teaching/teachingCycle";
import { createEmptyStudentProfile } from "../src/teaching/studentProfile";

describe("teaching cycle", () => {
  test("diagnoses a student attempt and updates the student profile", async () => {
    const result = await runTeachingCycle(
      {
        problem: { id: "P1030", title: "求先序排列", summary: "inorder + postorder -> preorder" },
        language: "python",
        studentCode: "return left + right + root",
        ojVerdict: { status: "WA", passedTests: 1, totalTests: 3 },
        localEvidence: [],
        studentProfile: { painPointCounts: {}, activeSkills: [] }
      },
      createEmptyStudentProfile("student-a"),
      async () => ({
        painPoints: [
          {
            label: "traversal_order_confusion",
            confidence: 0.9,
            evidence: "The code returns postorder instead of preorder."
          }
        ],
        hint: "先确认先序遍历的输出顺序。",
        skillUpdate: {
          candidate: "binary-tree-traversal-reconstruction",
          reason: "Traversal order confusion appeared again.",
          rules: ["Preorder emits root before children."]
        },
        recommendation: {
          problemId: "P1305",
          reason: "Practice direct preorder traversal."
        }
      }),
      "2026-04-30T00:00:00.000Z"
    );

    expect(result.provider).toBe("teaching-cycle");
    expect(result.report.hint).toContain("先确认");
    expect(result.updatedProfile.painPoints.traversal_order_confusion.count).toBe(1);
    expect(result.updatedProfile.skillCandidates["binary-tree-traversal-reconstruction"].status).toBe("candidate");
  });
});
