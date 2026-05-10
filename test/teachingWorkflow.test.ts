import { describe, expect, test } from "vitest";
import { createEmptyStudentProfile } from "../src/teaching/studentProfile";
import { createEmptyStudentSkill } from "../src/teaching/studentSkill";
import { runCoachDiagnosisWorkflow } from "../src/teaching/workflow/actions";

describe("teaching workflow", () => {
  test("runs a coach diagnosis workflow and returns an attempt event plus audit", async () => {
    const result = await runCoachDiagnosisWorkflow({
      action: "specific",
      problemKey: "luogu:P1030",
      platform: "luogu",
      context: {
        problem: { id: "P1030", title: "求先序排列", summary: "inorder + postorder -> preorder" },
        language: "python",
        studentCode: "return left + right + root",
        ojVerdict: { status: "WA", passedTests: 1, totalTests: 3 },
        localEvidence: [],
        studentProfile: { painPointCounts: {}, activeSkills: [] }
      },
      profile: createEmptyStudentProfile("student-a"),
      studentSkill: createEmptyStudentSkill("student-a", "2026-05-01T00:00:00.000Z"),
      occurredAt: "2026-05-01T00:01:00.000Z",
      patchSource: "fixture-teacher",
      diagnose: async () => ({
        painPoints: [
          {
            label: "traversal_order_confusion",
            confidence: 0.9,
            evidence: "The code returns postorder instead of preorder."
          }
        ],
        hint: "先确认先序遍历的输出顺序。",
        specificHint: "当前表达式把 root 放在最后了。",
        skillUpdate: {
          candidate: "binary-tree-traversal-reconstruction",
          reason: "Traversal order confusion appeared again.",
          rules: ["Preorder emits root before children."]
        }
      })
    });

    expect(result.report.specificHint).toContain("root");
    expect(result.attemptEventInput).toMatchObject({
      problemKey: "luogu:P1030",
      problemId: "P1030",
      platform: "luogu",
      kind: "specific_hint_requested",
      model: "fixture-teacher",
      painPoints: ["traversal_order_confusion"]
    });
    expect(result.updatedStudentSkill.errorModel.traversal_order_confusion.count).toBe(1);
    expect(result.audit.included).toContain("student_code");
    expect(result.audit.excluded).toContain("autocomplete_prompt");
  });
});
