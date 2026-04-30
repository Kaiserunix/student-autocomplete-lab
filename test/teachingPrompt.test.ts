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

    expect(prompt).toContain("MiMo");
    expect(prompt).toContain("P1030");
    expect(prompt).toContain("student_code");
    expect(prompt).toContain("local_evidence");
    expect(prompt).toContain("pain_points");
    expect(prompt).toContain("JSON only");
    expect(prompt).toContain("Do not provide a full solution");
    expect(prompt).toContain("Inspect the final output or return expression");
    expect(prompt).toContain("prefer traversal_order_confusion");
    expect(prompt).toContain("Do not use child_indexing");
    expect(prompt).toContain("prefer duplicate_handling");
    expect(prompt).toContain("prefer high_precision_carry_order");
    expect(prompt).toContain("prefer greedy_choice_model");
    expect(prompt).toContain("prefer disjoint_set_union_semantics");
    expect(prompt).toContain("prefer graph_adjacency_model");
    expect(prompt).toContain("binary-tree-traversal-reconstruction");
    expect(prompt).toContain("ordered-multiset-semantics");
  });

  test("can explicitly request Simplified Chinese JSON string values", () => {
    const prompt = buildTeachingDiagnosisPrompt({
      problem: {
        id: "P1030",
        title: "求先序排列",
        summary: "Given inorder and postorder traversal strings, output preorder."
      },
      language: "python",
      studentCode: "return left + right + root",
      ojVerdict: {
        status: "WA"
      },
      localEvidence: [],
      studentProfile: {
        painPointCounts: {}
      },
      responseLanguage: "zh-CN"
    });

    expect(prompt).toContain("Output language: Simplified Chinese");
    expect(prompt).toContain("write hint, evidence");
  });
});
