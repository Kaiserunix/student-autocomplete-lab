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
});
