import { describe, expect, test } from "vitest";
import { normalizeTeachingDiagnosisReport } from "../src/teaching/teachingTaxonomy";

describe("teaching taxonomy", () => {
  test("normalizes MiMo free-form labels into stable project labels", () => {
    const normalized = normalizeTeachingDiagnosisReport({
      painPoints: [
        {
          label: "incorrect_preorder_concatenation",
          confidence: 0.9,
          evidence: "Student returned left + right + root."
        }
      ],
      hint: "Check traversal order.",
      skillUpdate: {
        candidate: "tree_traversal_order",
        reason: "Traversal order is confused.",
        rules: ["Preorder is root-left-right."]
      },
      recommendation: {
        problemId: "P4913",
        reason: "Practice traversal."
      }
    });

    expect(normalized.painPoints[0].label).toBe("traversal_order_confusion");
    expect(normalized.skillUpdate?.candidate).toBe("binary-tree-traversal-reconstruction");
    expect(normalized.recommendation?.problemId).toBe("P1305");
    expect(normalized.recommendation?.reason).toContain("preorder");
  });

  test("does not default broad formatting pain points to P5735 when a current problem exists", () => {
    const normalized = normalizeTeachingDiagnosisReport(
      {
        painPoints: [
          {
            label: "output_format",
            confidence: 0.75,
            evidence: "The display output spacing is suspicious."
          }
        ],
        hint: "检查输出格式。",
        recommendation: {
          problemId: "P5735",
          reason: "Practice formatting."
        }
      },
      {
        currentProblemId: "P5730"
      }
    );

    expect(normalized.recommendation?.problemId).toBe("P5730");
    expect(normalized.recommendation?.reason).toContain("留在当前题");
  });

  test("maps raw MiMo pain-point-like skill names to reusable skill candidates", () => {
    const normalized = normalizeTeachingDiagnosisReport(
      {
        painPoints: [
          {
            label: "data_structure_semantics",
            confidence: 0.85,
            evidence: "The code treats a multiset operation family as a plain list operation."
          }
        ],
        hint: "先确认可重复集合语义。",
        skillUpdate: {
          candidate: "data_structure_semantics",
          reason: "MiMo returned the raw pain point as the skill name.",
          rules: ["检查 rank/kth/predecessor/successor 的语义。"]
        },
        recommendation: {
          problemId: "P3369",
          reason: "Practice ordered multiset."
        }
      },
      {
        currentProblemId: "P3369"
      }
    );

    expect(normalized.skillUpdate?.candidate).toBe("ordered-multiset-semantics");
  });

  test("prefers the diagnosed top pain point when MiMo returns a different raw pain point as skill", () => {
    const normalized = normalizeTeachingDiagnosisReport({
      painPoints: [
        {
          label: "traversal_order_confusion",
          confidence: 0.9,
          evidence: "return left + right + root"
        }
      ],
      hint: "先看返回顺序。",
      skillUpdate: {
        candidate: "output_order",
        reason: "MiMo used a broad output-order label as the skill name.",
        rules: ["确认根节点输出位置。"]
      }
    });

    expect(normalized.skillUpdate?.candidate).toBe("binary-tree-traversal-reconstruction");
  });

  test("maps descriptive MiMo skill names through the top pain point", () => {
    const normalized = normalizeTeachingDiagnosisReport({
      painPoints: [
        {
          label: "distance_formula",
          confidence: 0.9,
          evidence: "The code uses Manhattan distance."
        }
      ],
      hint: "换成欧氏距离。",
      skillUpdate: {
        candidate: "geometric_distance_formula",
        reason: "MiMo created a descriptive skill name.",
        rules: ["Distinguish Manhattan and Euclidean distance."]
      }
    });

    expect(normalized.skillUpdate?.candidate).toBe("numeric-geometry-formatting");
  });

  test("prefers binary-tree depth skill over generic recursion when the problem context is tree depth", () => {
    const normalized = normalizeTeachingDiagnosisReport(
      {
        painPoints: [
          {
            label: "recursion_base_case",
            confidence: 0.92,
            evidence: "The empty child is counted as depth 1."
          }
        ],
        hint: "空孩子的深度应为 0。",
        skillUpdate: {
          candidate: "recursion-base-case-pattern",
          reason: "MiMo returned the broad recursion skill.",
          rules: ["Define the empty subtree before adding the current node."]
        }
      },
      {
        currentProblemId: "P4913",
        problemSummary: "Recursive base cases and binary tree depth definitions with numbered children."
      }
    );

    expect(normalized.skillUpdate?.candidate).toBe("binary-tree-depth-numbered-children");
  });

  test("keeps generic recursion skill for non-tree recursion contexts", () => {
    const normalized = normalizeTeachingDiagnosisReport(
      {
        painPoints: [
          {
            label: "recursion_base_case",
            confidence: 0.9,
            evidence: "The Fibonacci recursion never reaches a base case for n=0."
          }
        ],
        hint: "先补递归出口。",
        skillUpdate: {
          candidate: "recursion-base-case-pattern",
          reason: "Generic recursion base case.",
          rules: ["Write the base cases before the recursive call."]
        }
      },
      {
        problemSummary: "Fibonacci recursion and recurrence relation practice."
      }
    );

    expect(normalized.skillUpdate?.candidate).toBe("recursion-base-case-pattern");
  });

  test("keeps traversal reconstruction more specific than tree-depth context when traversal pain points are present", () => {
    const normalized = normalizeTeachingDiagnosisReport(
      {
        painPoints: [
          {
            label: "traversal_order_confusion",
            confidence: 0.9,
            evidence: "The solution returns left + right + root."
          },
          {
            label: "recursion_base_case",
            confidence: 0.7,
            evidence: "The recursive split also needs a base case."
          }
        ],
        hint: "先修输出根节点的位置。",
        skillUpdate: {
          candidate: "recursion-base-case-pattern",
          reason: "MiMo picked the broad recursion label.",
          rules: ["Preorder emits root before children."]
        }
      },
      {
        currentProblemId: "P1030",
        problemSummary: "Binary tree traversal reconstruction; tree depth is not the target skill here."
      }
    );

    expect(normalized.skillUpdate?.candidate).toBe("binary-tree-traversal-reconstruction");
  });
});
