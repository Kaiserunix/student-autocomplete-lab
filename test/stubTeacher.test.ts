import { describe, expect, test } from "vitest";
import { stubTeachingDiagnosis } from "../src/teaching/stubTeacher";

describe("stub teaching diagnosis", () => {
  test("produces a deterministic traversal-order diagnosis for local trials", async () => {
    const report = await stubTeachingDiagnosis({
      problem: { id: "P1030", title: "求先序排列", summary: "inorder + postorder -> preorder" },
      language: "python",
      studentCode: "return left + right + root",
      ojVerdict: { status: "WA", passedTests: 1, totalTests: 3 },
      localEvidence: [],
      studentProfile: { painPointCounts: {}, activeSkills: [] }
    });

    expect(report.painPoints[0].label).toBe("traversal_order_confusion");
    expect(report.skillUpdate?.candidate).toBe("binary-tree-traversal-reconstruction");
    expect(report.recommendation?.problemId).toBe("P1305");
  });
});
