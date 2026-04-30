import { describe, expect, test } from "vitest";
import { localizeTeachingDiagnosisReport } from "../src/sidebar/localizeTeachingReport";

describe("localized teaching report", () => {
  test("keeps MiMo content but gives common pain points Chinese display labels", () => {
    const localized = localizeTeachingDiagnosisReport({
      painPoints: [
        {
          label: "traversal_order_confusion",
          confidence: 0.95,
          evidence: "The code returns left + right + root."
        }
      ],
      hint: "Check the order of root, left and right.",
      skillUpdate: {
        candidate: "binary-tree-traversal",
        reason: "Traversal order is mixed.",
        rules: ["Preorder is root + left + right."]
      },
      recommendation: {
        problemId: "P1305",
        reason: "Practice direct preorder traversal."
      }
    });

    expect(localized.hintTitle).toBe("下一步提示");
    expect(localized.painPoints[0]).toMatchObject({
      label: "traversal_order_confusion",
      displayLabel: "遍历顺序混淆"
    });
    expect(localized.skillTitle).toBe("Skill 候选");
    expect(localized.recommendationTitle).toBe("推荐下一题");
    expect(localized.rawHint).toContain("Check the order");
  });

  test("falls back to readable Chinese text for unknown labels", () => {
    const localized = localizeTeachingDiagnosisReport({
      painPoints: [
        {
          label: "custom_loop_boundary",
          confidence: 0.7,
          evidence: "Loop stops early."
        }
      ],
      hint: "Inspect the last iteration."
    });

    expect(localized.painPoints[0].displayLabel).toBe("custom loop boundary");
  });
});
