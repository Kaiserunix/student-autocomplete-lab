import { describe, expect, test } from "vitest";
import { verifyPracticeReport } from "../src/practice/practiceVerifier";

describe("practice verifier", () => {
  test("keeps pain-point events only for wrong submissions that fail local oracle tests", async () => {
    const result = await verifyPracticeReport(
      {
        problemId: "P4913",
        referenceSolution: "reference",
        wrongSubmissions: [
          {
            code: "wrong-depth",
            expectedError: "off by one",
            painPoints: ["depth_definition"]
          },
          {
            code: "accidentally-correct",
            expectedError: "should fail",
            painPoints: ["child_indexing"]
          }
        ],
        skillUpdateCandidate: {
          name: "binary-tree-depth",
          rules: ["Count a single node as depth 1."]
        }
      },
      {
        testCases: [{ input: "case", expectedOutput: "ok\n", note: "fake case" }],
        runSubmission: async (code) => ({
          exitCode: 0,
          stdout: code === "wrong-depth" ? "bad\n" : "ok\n",
          stderr: "",
          timedOut: false
        })
      }
    );

    expect(result.referencePassed).toBe(true);
    expect(result.wrongSubmissionResults).toHaveLength(2);
    expect(result.wrongSubmissionResults[0].failedAsExpected).toBe(true);
    expect(result.wrongSubmissionResults[1].failedAsExpected).toBe(false);
    expect(result.verifiedPainPointCounts).toEqual({ depth_definition: 1 });
    expect(result.learningEvents).toEqual([
      expect.objectContaining({
        problemId: "P4913",
        painPoint: "depth_definition",
        source: "verified_fixture"
      })
    ]);
  });
});
