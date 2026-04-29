import { describe, expect, test } from "vitest";
import { buildTeachingDiagnosisPrompt } from "../src/teaching/teachingPrompt";

describe("teaching diagnosis prompt", () => {
  test("asks MiMo to diagnose from evidence without revealing the full answer", () => {
    const prompt = buildTeachingDiagnosisPrompt({
      problem: {
        id: "P1030",
        title: "求先序排列",
        summary: "Given inorder and postorder traversal strings, output preorder."
      },
      language: "python",
      studentCode: "return left + right + root",
      ojVerdict: {
        status: "WA",
        passedTests: 1,
        totalTests: 3
      },
      localEvidence: [
        {
          note: "sample-like reconstruction",
          expectedOutput: "ABCD",
          actualOutput: "BDCA",
          stderr: "",
          passed: false
        }
      ],
      studentProfile: {
        painPointCounts: {
          subtree_boundary: 2
        },
        activeSkills: ["binary-tree-traversal-reconstruction"]
      }
    });

    expect(prompt).toContain("MiMo Pro");
    expect(prompt).toContain("P1030");
    expect(prompt).toContain("student_code");
    expect(prompt).toContain("local_evidence");
    expect(prompt).toContain("pain_points");
    expect(prompt).toContain("JSON only");
    expect(prompt).toContain("Do not provide a full solution");
  });
});
