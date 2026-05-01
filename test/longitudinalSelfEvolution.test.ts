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
    expect(samples[0]).toMatchObject({
      sampleId: "long-0001",
      stage: 1,
      difficulty: 1
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
});
