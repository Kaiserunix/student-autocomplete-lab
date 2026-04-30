import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import {
  parseSelfEvolutionSamples,
  runSelfEvolutionTrial
} from "../src/teaching/selfEvolutionTrial";

const SAMPLE_PATH = path.join("fixtures", "practice", "self-evolution", "wrong-python-samples.json");

describe("self-evolution teaching trial", () => {
  test("loads subagent-generated wrong-code samples with stable metadata", async () => {
    const text = await readFile(SAMPLE_PATH, "utf8");
    const samples = parseSelfEvolutionSamples(text);

    expect(samples).toHaveLength(5);
    expect(samples.map((sample) => sample.problemId)).toContain("P3369");
    expect(samples.every((sample) => sample.wrongCode.includes("\n"))).toBe(true);
  });

  test("feeds accumulated student history back into later diagnoses", async () => {
    const text = await readFile(SAMPLE_PATH, "utf8");
    const traversalSample = parseSelfEvolutionSamples(text).find((sample) => sample.problemId === "P1030");

    if (!traversalSample) {
      throw new Error("P1030 traversal sample is required for this trial.");
    }

    const result = await runSelfEvolutionTrial([traversalSample, traversalSample, traversalSample], {
      studentId: "self-evolution-test",
      occurredAt: "2026-04-30T00:00:00.000Z"
    });

    expect(result.steps.map((step) => step.profileBefore.painPointCounts.traversal_order_confusion ?? 0)).toEqual([
      0,
      1,
      2
    ]);
    expect(result.painPointCounts.traversal_order_confusion).toBe(3);
    expect(result.recommendationCounts.P1305).toBe(3);
    expect(result.readySkills).toContain("binary-tree-traversal-reconstruction");
    expect(result.finalProfile.skillCandidates["binary-tree-traversal-reconstruction"]).toMatchObject({
      count: 3,
      status: "ready"
    });
  });
});
