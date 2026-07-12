import { describe, expect, test } from "vitest";
import { buildFixtureTeachingContext } from "../src/teaching/fixtureTeachingContext";

describe("fixture teaching context", () => {
  test("builds a student attempt context from a verified wrong submission", async () => {
    const context = await buildFixtureTeachingContext("fixtures/practice/P1030.codex.json", 0, undefined, {
      runSubmission: async () => ({
        exitCode: 0,
        stdout: "wrong\n",
        stderr: "",
        timedOut: false
      })
    });

    expect(context.problem.id).toBe("P1030");
    expect(context.ojVerdict.status).toBe("WA");
    expect(context.ojVerdict.totalTests).toBeGreaterThan(0);
    expect(context.studentCode).toContain("left + right + root");
    expect(context.localEvidence.some((item) => !item.passed)).toBe(true);
  });
});
