import { describe, expect, test } from "vitest";
import { summarizePracticeReport } from "../src/practice/practiceSummary";

describe("practice summary", () => {
  test("counts pain points from wrong submissions", () => {
    const summary = summarizePracticeReport({
      problemId: "P1427",
      referenceSolution: "nums = []",
      wrongSubmissions: [
        {
          code: "print(nums)",
          expectedError: "wrong format",
          painPoints: ["output_format", "output_order"]
        },
        {
          code: "nums.reverse()",
          expectedError: "mutates too early",
          painPoints: ["output_order"]
        }
      ],
      skillUpdateCandidate: {
        name: "python-output-order",
        rules: ["Confirm output order before printing."]
      }
    });

    expect(summary.problemId).toBe("P1427");
    expect(summary.wrongSubmissionCount).toBe(2);
    expect(summary.painPointCounts).toEqual({
      output_format: 1,
      output_order: 2
    });
    expect(summary.topPainPoint).toBe("output_order");
  });
});
