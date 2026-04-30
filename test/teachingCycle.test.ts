import { describe, expect, test } from "vitest";
import { runTeachingCycle, runTeachingCycleWithStudentSkill } from "../src/teaching/teachingCycle";
import { createEmptyStudentProfile } from "../src/teaching/studentProfile";
import { createEmptyStudentSkill } from "../src/teaching/studentSkill";

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

  test("can update the inspectable Student Skill beside the legacy profile", async () => {
    const result = await runTeachingCycleWithStudentSkill(
      {
        problem: { id: "P1030", title: "求先序排列", summary: "inorder + postorder -> preorder" },
        language: "python",
        studentCode: "return left + right + root",
        ojVerdict: { status: "WA", passedTests: 1, totalTests: 3 },
        localEvidence: [],
        studentProfile: { painPointCounts: {}, activeSkills: [] }
      },
      createEmptyStudentProfile("student-a"),
      createEmptyStudentSkill("student-a", "2026-05-01T00:00:00.000Z"),
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
        }
      }),
      {
        occurredAt: "2026-05-01T00:01:00.000Z",
        patchSource: "mimo-v2.5"
      }
    );

    expect(result.updatedProfile.painPoints.traversal_order_confusion.count).toBe(1);
    expect(result.updatedStudentSkill.errorModel.traversal_order_confusion.count).toBe(1);
    expect(result.studentSkillMerge.changeSummary).toContain("skill:binary-tree-traversal-reconstruction");
    expect(result.updatedStudentSkill.skills["binary-tree-traversal-reconstruction"]).toMatchObject({
      status: "candidate",
      sourcePainPoints: ["traversal_order_confusion"]
    });
  });
});
