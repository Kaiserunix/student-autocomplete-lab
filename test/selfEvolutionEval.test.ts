import { readFile } from "node:fs/promises";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import { evaluateSelfEvolutionTrial } from "../src/teaching/selfEvolutionEval";
import { parseSelfEvolutionSamples, runSelfEvolutionTrial } from "../src/teaching/selfEvolutionTrial";

const SAMPLE_PATH = path.join("fixtures", "practice", "self-evolution", "wrong-python-samples.json");

describe("self-evolution eval", () => {
  test("scores fixture-oracle diagnoses as a perfect baseline", async () => {
    const samples = parseSelfEvolutionSamples(await readFile(SAMPLE_PATH, "utf8"));
    const selected = samples.slice(0, 3);
    const trial = await runSelfEvolutionTrial(selected, {
      occurredAt: "2026-04-30T00:00:00.000Z"
    });

    const evaluation = evaluateSelfEvolutionTrial(selected, trial);

    expect(evaluation.scores).toEqual({
      painPointAccuracy: 1,
      primaryPainPointAccuracy: 1,
      recommendationAccuracy: 1,
      skillCandidateAccuracy: 1,
      perfectStepAccuracy: 1
    });
    expect(evaluation.biasRecords).toEqual([]);
    expect(evaluation.promptPatchCandidates).toEqual([]);
  });

  test("records model drift as a prompt patch candidate", async () => {
    const samples = parseSelfEvolutionSamples(await readFile(SAMPLE_PATH, "utf8"));
    const traversalSample = samples.find((sample) => sample.problemId === "P1030");

    if (!traversalSample) {
      throw new Error("P1030 traversal sample is required for this eval.");
    }

    const trial = await runSelfEvolutionTrial([traversalSample], {
      occurredAt: "2026-04-30T00:00:00.000Z",
      diagnose: () => ({
        painPoints: [
          {
            label: "child_indexing",
            confidence: 0.9,
            evidence: "The right subtree postorder slice is suspicious."
          }
        ],
        hint: "Check the subtree index split.",
        skillUpdate: {
          candidate: "child_indexing",
          reason: "The model blamed child indexing.",
          rules: ["Check child subtree ranges."]
        },
        recommendation: {
          problemId: "P4913",
          reason: "Practice child indexing."
        }
      })
    });

    const evaluation = evaluateSelfEvolutionTrial([traversalSample], trial);

    expect(evaluation.scores).toEqual({
      painPointAccuracy: 0,
      primaryPainPointAccuracy: 0,
      recommendationAccuracy: 0,
      skillCandidateAccuracy: 0,
      perfectStepAccuracy: 0
    });
    expect(evaluation.biasRecords).toEqual([
      expect.objectContaining({
        problemId: "P1030",
        expectedPrimaryPainPoint: "traversal_order_confusion",
        actualPrimaryPainPoint: "child_indexing",
        expectedRecommendation: "P1305",
        actualRecommendation: "P4913"
      })
    ]);
    expect(evaluation.biasRecords[0].codeEvidence).toContain("left + right + root");
    expect(evaluation.promptPatchCandidates).toEqual([
      expect.objectContaining({
        expectedPrimaryPainPoint: "traversal_order_confusion",
        actualPrimaryPainPoint: "child_indexing",
        occurrences: 1
      })
    ]);
    expect(evaluation.promptPatchCandidates[0].promptPatchCandidate).toContain("prefer traversal_order_confusion");
  });

  test("normalizes skill-candidate naming drift before scoring", async () => {
    const samples = parseSelfEvolutionSamples(await readFile(SAMPLE_PATH, "utf8"));
    const traversalSample = samples.find((sample) => sample.problemId === "P1030");

    if (!traversalSample) {
      throw new Error("P1030 traversal sample is required for this eval.");
    }

    const trial = await runSelfEvolutionTrial([traversalSample], {
      occurredAt: "2026-04-30T00:00:00.000Z",
      diagnose: () => ({
        painPoints: [
          {
            label: "traversal_order_confusion",
            confidence: 0.9,
            evidence: "The code returns left + right + root."
          }
        ],
        hint: "Check the traversal output order.",
        skillUpdate: {
          candidate: "traversal_order_confusion",
          reason: "The model used a label as the skill name.",
          rules: ["Check traversal output order."]
        },
        recommendation: {
          problemId: "P1305",
          reason: "Practice preorder traversal."
        }
      })
    });

    const evaluation = evaluateSelfEvolutionTrial([traversalSample], trial);

    expect(evaluation.scores).toMatchObject({
      painPointAccuracy: 1,
      primaryPainPointAccuracy: 1,
      recommendationAccuracy: 1,
      skillCandidateAccuracy: 1,
      perfectStepAccuracy: 1
    });
    expect(evaluation.biasRecords).toEqual([]);
    expect(evaluation.promptPatchCandidates).toEqual([]);
  });

  test("counts a secondary expected pain point as a pain-point hit", async () => {
    const samples = parseSelfEvolutionSamples(await readFile(SAMPLE_PATH, "utf8"));
    const geometrySample = samples.find((sample) => sample.problemId === "P5735");

    if (!geometrySample) {
      throw new Error("P5735 geometry sample is required for this eval.");
    }

    const trial = await runSelfEvolutionTrial([geometrySample], {
      occurredAt: "2026-04-30T00:00:00.000Z",
      diagnose: () => ({
        painPoints: [
          {
            label: "output_format",
            confidence: 0.85,
            evidence: "The answer is printed without fixed decimal precision."
          }
        ],
        hint: "Check the required decimal precision.",
        skillUpdate: {
          candidate: "output_format",
          reason: "The model focused on formatting.",
          rules: ["Match required decimal precision."]
        },
        recommendation: {
          problemId: "P5735",
          reason: "Practice geometry output formatting."
        }
      })
    });

    const evaluation = evaluateSelfEvolutionTrial([geometrySample], trial);

    expect(evaluation.steps[0]).toMatchObject({
      painPointHit: true,
      primaryPainPointHit: false
    });
    expect(evaluation.scores.painPointAccuracy).toBe(1);
    expect(evaluation.scores.primaryPainPointAccuracy).toBe(0);
    expect(evaluation.promptPatchCandidates).toEqual([]);
  });
});
