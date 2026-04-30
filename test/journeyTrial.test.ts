import { describe, expect, test } from "vitest";
import type { ProblemSetRecord } from "../src/problemBank/types";
import {
  buildJourneyDiagnosisCases,
  buildJourneyOptimizationCases,
  JOURNEY_TRAINING_IDS,
  scoreJourneyDiagnosis,
  scoreJourneyOptimization
} from "../src/teaching/journeyTrial";

describe("journey trial", () => {
  test("builds one diagnosis case per Luogu training from 100 to 116", () => {
    const cases = buildJourneyDiagnosisCases(fakeProblemSets());

    expect(cases).toHaveLength(17);
    expect(cases.map((item) => item.trainingId)).toEqual(JOURNEY_TRAINING_IDS);
    expect(cases[0]).toMatchObject({
      caseId: "T100-core",
      trainingId: "100",
      stage: "beginner",
      expectedSkillCandidate: "numeric-geometry-formatting"
    });
    expect(cases[16]).toMatchObject({
      trainingId: "116",
      stage: "data-structure",
      expectedSkillCandidate: "graph-adjacency-model"
    });
  });

  test("can build an expanded long-run diagnosis set", () => {
    const standardCases = buildJourneyDiagnosisCases(fakeProblemSets());
    const longCases = buildJourneyDiagnosisCases(fakeProblemSets(), { variant: "long" });

    expect(longCases.length).toBeGreaterThan(standardCases.length);
    expect(longCases.some((item) => item.caseId === "T114-traversal")).toBe(true);
    expect(longCases.some((item) => item.acceptedSkillCandidates.includes("python-loop-boundary-check"))).toBe(true);
  });

  test("scores diagnosis and optimization reports against journey expectations", () => {
    const diagnosisCase = buildJourneyDiagnosisCases(fakeProblemSets()).find((item) => item.trainingId === "108");
    if (!diagnosisCase) {
      throw new Error("training 108 case is required");
    }

    const diagnosisScore = scoreJourneyDiagnosis(diagnosisCase, {
      painPoints: [
        {
          label: "time_complexity_mismatch",
          confidence: 0.8,
          evidence: "Triple nested loop."
        }
      ],
      hint: "先写出目标复杂度。",
      skillUpdate: {
        candidate: "complexity-upgrade-from-bruteforce",
        reason: "暴力枚举需要升级。",
        rules: ["写出当前复杂度和目标复杂度。"]
      }
    });

    expect(diagnosisScore.painPointHit).toBe(true);
    expect(diagnosisScore.skillCandidateHit).toBe(true);

    const optimizationCase = buildJourneyOptimizationCases(fakeProblemSets()).find((item) => item.trainingId === "111");
    if (!optimizationCase) {
      throw new Error("training 111 optimization case is required");
    }

    const optimizationScore = scoreJourneyOptimization(optimizationCase, {
      verdict: "optimize",
      optimizationNeeded: true,
      summary: "线性扫描不适合二分题。",
      timeComplexity: { current: "O(nq)", target: "O(q log n)", action: "使用二分。" },
      memory: { current: "O(n)", target: "O(n)", action: "无需优化。" },
      codeQuality: { verdict: "ok", action: "结构清晰。" },
      nextStep: "改成二分查找。"
    });

    expect(optimizationScore.verdictHit).toBe(true);
  });
});

function fakeProblemSets(): ProblemSetRecord[] {
  return JOURNEY_TRAINING_IDS.map((id) => ({
    platform: "luogu",
    id,
    title: `training ${id}`,
    sourceUrl: `https://www.luogu.com.cn/training/${id}`,
    description: "",
    problemCount: 1,
    problems: [
      {
        id: `P${id}`,
        title: `problem ${id}`,
        sourceUrl: `https://www.luogu.com.cn/problem/P${id}`,
        tags: []
      }
    ]
  }));
}
