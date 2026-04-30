import { describe, expect, test } from "vitest";
import type { JourneyDiagnosisCase } from "../src/teaching/journeyTrial";
import {
  buildTransferValidationProbes,
  scoreTransferValidationProbe,
  summarizeTransferValidation
} from "../src/teaching/transferValidation";

describe("transfer validation", () => {
  test("selects unseen same-skill cases only after a skill is ready", () => {
    const training = [caseFor("T106-core", "P1601", "high-precision-carry-order")];
    const transfer = [
      caseFor("T106-long", "P2142", "high-precision-carry-order"),
      caseFor("T110-long", "P2240", "greedy-choice-proof-check")
    ];

    const probes = buildTransferValidationProbes(training, transfer, ["high-precision-carry-order"]);

    expect(probes).toHaveLength(1);
    expect(probes[0]).toMatchObject({
      skillCandidate: "high-precision-carry-order",
      transferCase: { caseId: "T106-long", problemId: "P2142" },
      baselineHintCount: 3
    });
  });

  test("scores whether diagnosis transfers to the unseen case with fewer estimated hints", () => {
    const probe = buildTransferValidationProbes(
      [caseFor("T106-core", "P1601", "high-precision-carry-order")],
      [caseFor("T106-long", "P2142", "high-precision-carry-order")],
      ["high-precision-carry-order"]
    )[0];

    const score = scoreTransferValidationProbe(probe, {
      studentErrorModel: "学生仍然按正序逐位相加，说明进位方向模型没有稳定。",
      painPoints: [
        {
          label: "high_precision_carry_order",
          confidence: 0.9,
          evidence: "Code iterates from left to right and drops final carry."
        }
      ],
      hint: "先把两个数字反向或从末尾开始处理。",
      skillUpdate: {
        candidate: "high-precision-carry-order",
        reason: "同类未见题仍命中进位顺序模型。",
        rules: ["从最低位开始处理进位。"]
      }
    });

    expect(score.passed).toBe(true);
    expect(score.hintReduction).toBe(2);
    expect(score.estimatedHintCount).toBe(1);
  });

  test("summarizes transfer pass rate and average hint reduction", () => {
    const probes = buildTransferValidationProbes(
      [caseFor("T106-core", "P1601", "high-precision-carry-order")],
      [caseFor("T106-long", "P2142", "high-precision-carry-order")],
      ["high-precision-carry-order"]
    );
    const scores = [
      scoreTransferValidationProbe(probes[0], {
        painPoints: [{ label: "high_precision_carry_order", confidence: 0.8, evidence: "same issue" }],
        hint: "从末位开始。",
        skillUpdate: { candidate: "high-precision-carry-order", reason: "hit", rules: ["carry"] }
      })
    ];

    expect(summarizeTransferValidation(scores)).toMatchObject({
      probeCount: 1,
      transferPassRate: 1,
      averageHintReduction: 2
    });
  });
});

function caseFor(caseId: string, problemId: string, skill: string): JourneyDiagnosisCase {
  return {
    caseId,
    trainingId: "106",
    trainingTitle: "高精度",
    problemId,
    problemTitle: problemId,
    stage: "algorithm",
    expectedPainPoints: ["high_precision_carry_order"],
    expectedSkillCandidate: skill,
    acceptedSkillCandidates: [],
    wrongCode: "print('bad')",
    studentRequest: "迁移验证"
  };
}
