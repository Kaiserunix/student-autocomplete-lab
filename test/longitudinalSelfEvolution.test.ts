import { describe, expect, test } from "vitest";
import {
  generateLongitudinalSelfEvolutionSamples,
  runLongitudinalSelfEvolutionBatch,
  selectLongitudinalBatch,
  summarizeLongitudinalMismatches
} from "../src/teaching/longitudinalSelfEvolution";

describe("longitudinal self-evolution", () => {
  test("generates one thousand gradually harder code samples", () => {
    const samples = generateLongitudinalSelfEvolutionSamples(1000);

    expect(samples).toHaveLength(1000);
    expect(new Set(samples.map((sample) => sample.problemId)).size).toBe(200);
    expect(samples[0]).toMatchObject({
      sampleId: "long-0001",
      stage: 1,
      difficulty: 1,
      expectedOjStatus: "WA",
      expectedPrimaryPainPoint: expect.any(String),
      expectedSkillCandidate: expect.any(String),
      bruteForceAllowed: expect.any(Boolean),
      recommendationRange: expect.any(Array)
    });
    expect(samples[0].minimumCounterexample).toMatchObject({
      input: expect.any(String),
      expectedOutput: expect.any(String),
      actualOutput: expect.any(String)
    });
    expect(samples.at(-1)).toMatchObject({
      sampleId: "long-1000",
      stage: 10
    });
    expect(new Set(samples.map((sample) => sample.sampleId)).size).toBe(1000);
    expect(samples[0].wrongCode).not.toBe(samples[399].wrongCode);
    expect(samples[900].difficulty).toBeGreaterThan(samples[0].difficulty);
  });

  test("selects resumable batches by offset and limit", () => {
    const samples = generateLongitudinalSelfEvolutionSamples(1000);
    const batch = selectLongitudinalBatch(samples, { offset: 120, limit: 25 });

    expect(batch).toHaveLength(25);
    expect(batch[0].sampleId).toBe("long-0121");
    expect(batch.at(-1)?.sampleId).toBe("long-0145");
  });

  test("fixture batch updates Student Skill while preserving step evidence", async () => {
    const samples = generateLongitudinalSelfEvolutionSamples(40);
    const result = await runLongitudinalSelfEvolutionBatch(samples.slice(0, 12), {
      studentId: "longitudinal-test",
      occurredAt: "2026-05-01T00:00:00.000Z"
    });

    expect(result.sampleCount).toBe(12);
    expect(result.finalStudentSkill.revision).toBe(12);
    expect(result.steps[0]).toMatchObject({
      sampleId: "long-0001",
      studentSkillRevision: 1
    });
    expect(result.steps.some((step) => step.skillCandidateHit)).toBe(true);
    expect(result.steps[0]).toHaveProperty("expectedRecommendationRange");
    expect(result.steps[0]).toHaveProperty("recommendationHit");
    expect(Object.keys(result.finalStudentSkill.skills).length).toBeGreaterThan(0);
    expect(result.usage.totalTokens).toBe(0);
    expect(result.mismatchSummary).toMatchObject({
      providerErrorCount: 0,
      jsonRetryOrParseErrorCount: 0
    });
  });

  test("normalizes broad recursion skill into binary-tree depth skill before scoring and Student Skill merge", async () => {
    const sample = generateLongitudinalSelfEvolutionSamples(40)[5];

    const result = await runLongitudinalSelfEvolutionBatch([sample], {
      studentId: "longitudinal-depth-specificity",
      occurredAt: "2026-05-01T00:00:00.000Z",
      diagnose: () => ({
        painPoints: [
          {
            label: "recursion_base_case",
            confidence: 0.92,
            evidence: "Empty child depth is counted incorrectly."
          }
        ],
        hint: "先定义空孩子深度。",
        skillUpdate: {
          candidate: "recursion-base-case-pattern",
          reason: "MiMo selected the broad recursion skill.",
          rules: ["Empty child contributes 0; real node contributes 1."]
        },
        recommendation: {
          problemId: "P4913",
          reason: "Practice tree depth on numbered children."
        }
      })
    });

    expect(sample).toMatchObject({
      problemId: "SIM-0002",
      expectedSkillCandidate: "binary-tree-depth-numbered-children"
    });
    expect(result.steps[0]).toMatchObject({
      actualSkillCandidate: "binary-tree-depth-numbered-children",
      skillCandidateHit: true
    });
    expect(result.finalStudentSkill.skills["binary-tree-depth-numbered-children"]).toMatchObject({
      name: "binary-tree-depth-numbered-children"
    });
    expect(result.finalStudentSkill.skills["recursion-base-case-pattern"]).toBeUndefined();
  });

  test("treats depth definition as equivalent primary evidence for binary-tree depth samples", async () => {
    const sample = generateLongitudinalSelfEvolutionSamples(40)[5];

    const result = await runLongitudinalSelfEvolutionBatch([sample], {
      studentId: "longitudinal-depth-primary-equivalence",
      occurredAt: "2026-05-01T00:00:00.000Z",
      diagnose: () => ({
        painPoints: [
          {
            label: "depth_definition",
            confidence: 0.95,
            evidence: "The code uses a wrong depth definition for empty children."
          }
        ],
        hint: "先统一深度定义。",
        skillUpdate: {
          candidate: "binary-tree-depth-numbered-children",
          reason: "Depth definition on numbered-child trees.",
          rules: ["Empty child contributes depth 0."]
        }
      })
    });

    expect(sample.expectedPrimaryPainPoint).toBe("recursion_base_case");
    expect(result.steps[0]).toMatchObject({
      actualPainPoints: ["depth_definition"],
      primaryPainPointHit: true,
      skillCandidateHit: true
    });
    expect(result.scores.primaryPainPointAccuracy).toBe(1);
  });

  test("records a failed live diagnosis step instead of aborting the batch", async () => {
    const samples = generateLongitudinalSelfEvolutionSamples(40).slice(0, 2);

    const result = await runLongitudinalSelfEvolutionBatch(samples, {
      studentId: "longitudinal-live-error-tolerance",
      occurredAt: "2026-05-01T00:00:00.000Z",
      diagnose: (sample) => {
        if (sample.sampleId === "long-0001") {
          throw new Error("Chat completion request failed: HTTP 502");
        }

        return {
          painPoints: [
            {
              label: sample.expectedPrimaryPainPoint,
              confidence: 0.9,
              evidence: "Recovered on the next sample."
            }
          ],
          hint: "继续定位。",
          skillUpdate: {
            candidate: sample.expectedSkillCandidate,
            reason: "Recovered candidate.",
            rules: ["Keep going after a transient model error."]
          }
        };
      }
    });

    expect(result.sampleCount).toBe(2);
    expect(result.steps[0]).toMatchObject({
      sampleId: "long-0001",
      diagnosisError: expect.stringContaining("HTTP 502"),
      painPointHit: false,
      skillCandidateHit: false
    });
    expect(result.steps[1]).toMatchObject({
      sampleId: "long-0002",
      painPointHit: true,
      skillCandidateHit: true
    });
    expect(result.errorCount).toBe(1);
    expect(result.mismatchSummary.providerErrorCount).toBe(1);
    expect(result.mismatchSummary.diagnosisErrors[0]).toMatchObject({
      sampleId: "long-0001",
      category: "provider"
    });
  });

  test("summarizes mismatch pairs for beta calibration reports", () => {
    const summary = summarizeLongitudinalMismatches([
      {
        index: 0,
        sampleId: "long-0001",
        problemId: "SIM-0001",
        stage: 1,
        difficulty: 1,
        expectedPainPoints: ["traversal_order_confusion"],
        actualPainPoints: ["child_indexing"],
        painPointHit: false,
        primaryPainPointHit: false,
        expectedSkillCandidate: "binary-tree-traversal-reconstruction",
        actualSkillCandidate: "binary-tree-depth-numbered-children",
        skillCandidateHit: false,
        expectedRecommendationRange: ["P1305", "P1030"],
        recommendation: "P4913",
        recommendationHit: false,
        studentSkillRevision: 0,
        activeSkills: [],
        changeSummary: []
      },
      {
        index: 1,
        sampleId: "long-0002",
        problemId: "SIM-0002",
        stage: 1,
        difficulty: 1,
        expectedPainPoints: ["traversal_order_confusion"],
        actualPainPoints: ["child_indexing"],
        painPointHit: false,
        primaryPainPointHit: false,
        expectedSkillCandidate: "binary-tree-traversal-reconstruction",
        actualSkillCandidate: "binary-tree-depth-numbered-children",
        skillCandidateHit: false,
        expectedRecommendationRange: ["P1305", "P1030"],
        recommendation: "P4913",
        recommendationHit: false,
        studentSkillRevision: 0,
        activeSkills: [],
        changeSummary: [],
        diagnosisError: "Invalid JSON response"
      }
    ]);

    expect(summary.skillMismatchPairs[0]).toMatchObject({
      expected: "binary-tree-traversal-reconstruction",
      actual: "binary-tree-depth-numbered-children",
      count: 2
    });
    expect(summary.primaryPainPointMismatchPairs[0]).toMatchObject({
      expected: "traversal_order_confusion",
      actual: "child_indexing",
      count: 2
    });
    expect(summary.recommendationMismatchPairs[0]).toMatchObject({
      expected: "P1305|P1030",
      actual: "P4913",
      count: 2
    });
    expect(summary.jsonRetryOrParseErrorCount).toBe(1);
  });
});
