import { describe, expect, test } from "vitest";
import { parsePracticeGeneration } from "../src/practice/practiceReport";

describe("practice report parser", () => {
  test("parses generated practice JSON", () => {
    const report = parsePracticeGeneration(
      JSON.stringify({
        problem_id: "P1427",
        reference_solution: "nums=[]",
        wrong_submissions: [
          {
            code: "print(nums)",
            expected_error: "wrong output order",
            pain_points: ["output_order"]
          }
        ],
        skill_update_candidate: {
          name: "python-output-order",
          rules: ["Check output order before printing."]
        }
      })
    );

    expect(report.problemId).toBe("P1427");
    expect(report.wrongSubmissions[0].painPoints).toEqual(["output_order"]);
    expect(report.skillUpdateCandidate?.name).toBe("python-output-order");
  });
});
