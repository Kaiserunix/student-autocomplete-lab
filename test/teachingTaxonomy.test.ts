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
});
