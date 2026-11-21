import { describe, expect, test } from "vitest";
import { buildFixtureTeachingContext } from "../src/teaching/fixtureTeachingContext";
import {
  loadCoachingAcceptanceSuite,
  runAutocompleteBoundaryCase,
  runDiagnosisAcceptanceCase,
  runFollowUpAcceptanceCase,
  runFullCoachingAcceptanceSuite,
  runHintVsGiveUpContrastCase,
  verifyPracticeFixtureSet
} from "./harness/coachingAcceptanceHarness";

describe("deterministic algorithm-coaching acceptance fixtures", () => {
  test("executes the full coaching acceptance suite with zero failures", async () => {
    const suite = await loadCoachingAcceptanceSuite();
    const summary = await runFullCoachingAcceptanceSuite(suite, {
      verifyPracticeWithPython: false
    });

    expect(summary.failures).toEqual([]);
    expect(summary.totalChecks).toBeGreaterThanOrEqual(31);
    expect(summary.passedChecks).toBe(summary.totalChecks);
  });

  test("covers all 16 diagnosis scenarios across Python, C++, C, and Rust", async () => {
    const suite = await loadCoachingAcceptanceSuite();
    expect(suite.diagnosisCases.length).toBeGreaterThanOrEqual(16);

    const languages = new Set(suite.diagnosisCases.map((item) => item.language));
    expect(languages).toEqual(new Set(["python", "cpp", "c", "rust"]));

    for (const item of suite.diagnosisCases) {
      const outcome = await runDiagnosisAcceptanceCase(item);
      expect(outcome.failures, `Diagnosis case ${item.caseId}`).toEqual([]);
    }
  });

  test("covers follow-up, hint-vs-giveUp contrast, and autocomplete boundaries", async () => {
    const suite = await loadCoachingAcceptanceSuite();
    expect(suite.followUpCases.length).toBeGreaterThanOrEqual(4);
    expect(suite.hintVsGiveUpContrastCases.length).toBeGreaterThanOrEqual(3);
    expect(suite.autocompleteBoundaryCases.length).toBeGreaterThanOrEqual(8);

    for (const item of suite.followUpCases) {
      const outcome = await runFollowUpAcceptanceCase(item);
      expect(outcome.failures, `Follow-up case ${item.caseId}`).toEqual([]);
    }
    for (const item of suite.hintVsGiveUpContrastCases) {
      const outcome = runHintVsGiveUpContrastCase(item);
      expect(outcome.failures, `Contrast case ${item.caseId}`).toEqual([]);
    }
    for (const item of suite.autocompleteBoundaryCases) {
      const outcome = await runAutocompleteBoundaryCase(item);
      expect(outcome.failures, `Autocomplete case ${item.caseId}`).toEqual([]);
    }
  });

  test("verifies all 10 Python practice fixtures against local oracles and teaching context builder", async () => {
    const suite = await loadCoachingAcceptanceSuite();
    expect(suite.practiceFixtureIds).toHaveLength(10);

    const [practiceOutcome, binarySearchCtx] = await Promise.all([
      verifyPracticeFixtureSet(suite.practiceFixtureIds),
      buildFixtureTeachingContext("fixtures/practice/P2249.codex.json", 0, undefined, {
        runSubmission: async (code) => ({
          exitCode: 0,
          stdout: code.includes("break") ? "1 3 -1\n" : "1 2 -1\n",
          stderr: "",
          timedOut: false
        })
      })
    ]);
    const { results, failures } = practiceOutcome;
    expect(failures).toEqual([]);
    expect(results).toHaveLength(10);
    expect(results.every((item) => item.referencePassed)).toBe(true);

    expect(binarySearchCtx.problem.id).toBe("P2249");
    expect(binarySearchCtx.problem.title).toBe("查找");
    expect(binarySearchCtx.ojVerdict.status).toBe("WA");
    expect(binarySearchCtx.localEvidence.some((item) => !item.passed)).toBe(true);
  }, 120_000);
});
