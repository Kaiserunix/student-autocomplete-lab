import { describe, expect, test } from "vitest";
import {
  generateLongitudinalSelfEvolutionSamples,
  runLongitudinalSelfEvolutionBatch,
  selectLongitudinalBatch
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
    expect(Object.keys(result.finalStudentSkill.skills).length).toBeGreaterThan(0);
    expect(result.usage.totalTokens).toBe(0);
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
});
