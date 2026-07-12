import type {
  ProblemRecommendation,
  RecommendationCandidate,
  RecommendationDifficultyChange,
  RecommendationResult,
  RecommendationTransferEvidenceStatus
} from "./schema";

export function buildRecommendationReasons(input: {
  problem: RecommendationCandidate;
  matchedPainPoints: string[];
  difficultySignal: string;
  transferSignal: string;
}): string[] {
  return [
    input.matchedPainPoints.length > 0
      ? `痛点匹配：${input.matchedPainPoints.join(" / ")}`
      : "痛点匹配：弱，作为补充练习",
    `难度阶梯：${input.difficultySignal}`,
    `迁移证据：${input.transferSignal}`,
    input.problem.reason
  ].filter((item): item is string => Boolean(item));
}

export function buildStableRecommendationResult(input: {
  problem: RecommendationCandidate;
  matchedPainPoints: string[];
  reasons: string[];
  targetSkill: string;
  difficultyChange: RecommendationDifficultyChange;
  transferEvidenceStatus: RecommendationTransferEvidenceStatus;
  whyNotHarder: string;
  whyNotRepeat: string;
}): RecommendationResult {
  return {
    problemId: input.problem.id,
    title: input.problem.title,
    source: input.problem.source,
    reason: input.reasons.join("；"),
    targetSkill: input.targetSkill,
    difficultyChange: input.difficultyChange,
    transferEvidenceStatus: input.transferEvidenceStatus,
    whyNotHarder: input.whyNotHarder,
    whyNotRepeat: input.whyNotRepeat
  };
}

export function recommendationResultFromRanked(item: ProblemRecommendation): RecommendationResult {
  return item.recommendation;
}
