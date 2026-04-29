import { describe, expect, test } from "vitest";
import { parseTeachingDiagnosisReport } from "../src/teaching/teachingReport";

describe("teaching diagnosis report parser", () => {
  test("parses MiMo JSON into a stable teaching report", () => {
    const report = parseTeachingDiagnosisReport(
      JSON.stringify({
        pain_points: [
          {
            label: "traversal_order_confusion",
            confidence: 0.86,
            evidence: "Student returns left + right + root."
          }
        ],
        hint: "先确认先序遍历的第一个字符应该是谁。",
        skill_update: {
          candidate: "binary-tree-traversal-reconstruction",
          reason: "Repeated traversal-order confusion.",
          rules: ["Preorder emits root before recursive children."]
        },
        recommendation: {
          problem_id: "P1305",
          reason: "Practice preorder traversal before reconstruction."
        }
      })
    );

    expect(report.painPoints[0].label).toBe("traversal_order_confusion");
    expect(report.painPoints[0].confidence).toBe(0.86);
    expect(report.skillUpdate?.candidate).toBe("binary-tree-traversal-reconstruction");
    expect(report.recommendation?.problemId).toBe("P1305");
  });

  test("rejects reports without pain points", () => {
    expect(() => parseTeachingDiagnosisReport('{"hint":"too vague"}')).toThrow(/pain_points/);
  });
});
