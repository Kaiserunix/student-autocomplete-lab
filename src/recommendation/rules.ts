import type { StudentProfile } from "../teaching/studentProfile";
import type { StudentSkill } from "../teaching/studentSkill";
import { normalizePainPointLabel } from "../teaching/teachingTaxonomy";
import { buildRecommendationCandidate, candidateKey } from "./candidatePool";
import { buildRecommendationReasons, buildStableRecommendationResult, recommendationResultFromRanked } from "./explain";
import {
  canIncreaseDifficulty,
  collectLowHintSuccessSkills,
  collectRepeatedFailurePainPoints,
  collectTransferReadySkills,
  resolveTransferEvidenceStatus,
  scoreSkillTransfer
} from "./transfer";
import type {
  ProblemRecommendation,
  ProblemRecommendationResult,
  RankedPainPoint,
  RecommendNextProblemsInput,
  RecommendationCandidate,
  RecommendationDifficultyChange,
  RecommendationStrategy
} from "./schema";

const DEFAULT_LIMIT = 5;

export { buildRecommendationCandidate } from "./candidatePool";
export type {
  ProblemRecommendation,
  ProblemRecommendationResult,
  RankedPainPoint,
  RecommendNextProblemsInput,
  RecommendationCandidate,
  RecommendationCandidateInput,
  RecommendationDifficultyChange,
  RecommendationResult,
  RecommendationSource,
  RecommendationStrategy,
  RecommendationTransferEvidenceStatus
} from "./schema";

export function recommendNextProblems(input: RecommendNextProblemsInput): ProblemRecommendationResult {
  const topPainPoints = rankPainPoints(input.profile, input.studentSkill);
  const transferReadySkills = collectTransferReadySkills(input.studentSkill);
  const lowHintSuccessSkills = collectLowHintSuccessSkills(input.attemptEvents ?? []);
  const repeatedFailurePainPoints = collectRepeatedFailurePainPoints(input.attemptEvents ?? []);
  const targetDifficulty = resolveTargetDifficulty(topPainPoints, {
    hasUpgradeEvidence: transferReadySkills.length > 0 || lowHintSuccessSkills.length > 0,
    hasRepeatedFailure: topPainPoints.some((painPoint) => repeatedFailurePainPoints.includes(painPoint.label))
  });
  const excludedProblemIds = collectExcludedProblemIds(input);
  const excludedKeys = collectExcludedProblemKeys(input);
  const candidates = input.candidates
    .map(buildRecommendationCandidate)
    .filter((candidate) => !excludedProblemIds.includes(candidate.id.toUpperCase()))
    .filter((candidate) => !excludedKeys.has(candidateKey(candidate)));
  const strategy: RecommendationStrategy = {
    topPainPoints,
    targetDifficulty,
    transferReadySkills,
    lowHintSuccessSkills,
    repeatedFailurePainPoints,
    excludedProblemIds
  };
  const scoredRecommendations = candidates
    .map((candidate) => scoreCandidate(candidate, strategy, input.studentSkill))
    .filter((recommendation) => !isBlindHarderRecommendation(recommendation, strategy));
  const hasPainMatchedCandidate = scoredRecommendations.some((recommendation) => recommendation.matchedPainPoints.length > 0);
  const recommendations = scoredRecommendations
    .filter((recommendation) => !hasPainMatchedCandidate || recommendation.matchedPainPoints.length > 0)
    .sort(sortRecommendation)
    .slice(0, normalizeLimit(input.limit));

  return {
    strategy,
    recommendations,
    results: recommendations.map(recommendationResultFromRanked)
  };
}

function scoreCandidate(
  problem: RecommendationCandidate,
  strategy: RecommendationStrategy,
  studentSkill?: StudentSkill
): ProblemRecommendation {
  const painPointWeights = new Map(strategy.topPainPoints.map((painPoint) => [painPoint.label, painPoint.weight]));
  const matchedPainPoints = problem.targetPainPoints.filter((painPoint) => painPointWeights.has(painPoint));
  const painPointScore = roundScore(
    matchedPainPoints.reduce((sum, painPoint) => sum + (painPointWeights.get(painPoint) ?? 0) * 18, 0)
  );
  const { score: difficultyScore, signal: difficultySignal, change: difficultyChange } = scoreDifficulty(problem, strategy);
  const { score: transferScore, signal: transferSignal } = scoreSkillTransfer(problem, studentSkill);
  const repeatPenalty = problem.id ? 0 : -10;
  const score = roundScore(painPointScore + difficultyScore + transferScore + repeatPenalty);
  const reasons = buildRecommendationReasons({ problem, matchedPainPoints, difficultySignal, transferSignal });
  const targetSkill = chooseTargetSkill(problem, matchedPainPoints);
  const transferEvidenceStatus = resolveTransferEvidenceStatus(problem, studentSkill);
  const whyNotHarder = explainWhyNotHarder(problem, strategy, difficultyChange, transferEvidenceStatus);
  const whyNotRepeat = explainWhyNotRepeat(strategy);

  return {
    problem,
    score,
    matchedPainPoints,
    reasons,
    difficultySignal,
    transferSignal,
    recommendation: buildStableRecommendationResult({
      problem,
      matchedPainPoints,
      reasons,
      targetSkill,
      difficultyChange,
      transferEvidenceStatus,
      whyNotHarder,
      whyNotRepeat
    }),
    breakdown: {
      painPointScore,
      difficultyScore,
      transferScore,
      repeatPenalty
    }
  };
}

function isBlindHarderRecommendation(
  recommendation: ProblemRecommendation,
  strategy: RecommendationStrategy
): boolean {
  return (
    recommendation.recommendation.difficultyChange === "up" &&
    !canIncreaseDifficulty(recommendation.problem, strategy.transferReadySkills, strategy.lowHintSuccessSkills)
  );
}

function explainWhyNotHarder(
  problem: RecommendationCandidate,
  strategy: RecommendationStrategy,
  difficultyChange: RecommendationDifficultyChange,
  transferEvidenceStatus: string
): string {
  if (difficultyChange === "up") {
    return strategy.transferReadySkills.length > 0 || strategy.lowHintSuccessSkills.length > 0
      ? `已有迁移或低提示成功证据（${transferEvidenceStatus}），允许小幅上探。`
      : "没有足够迁移证据，不应该盲目推荐更难题。";
  }

  if (strategy.repeatedFailurePainPoints.length > 0) {
    return `存在重复失败痛点：${strategy.repeatedFailurePainPoints.join(" / ")}，先用同阶或更窄题稳定。`;
  }

  if (typeof problem.difficulty === "number" && problem.difficulty < strategy.targetDifficulty) {
    return "候选难度更低，用来修补基础痛点，而不是提前加压。";
  }

  return "当前没有足够迁移证据，先保持同难度练习。";
}

function explainWhyNotRepeat(strategy: RecommendationStrategy): string {
  if (strategy.excludedProblemIds.length === 0) {
    return "当前没有近期完成/放弃/删除记录；推荐会避开当前题。";
  }

  return `已排除当前题和近期题：${strategy.excludedProblemIds.slice(0, 6).join(" / ")}。`;
}

function rankPainPoints(profile: StudentProfile, studentSkill?: StudentSkill): RankedPainPoint[] {
  const merged = new Map<string, RankedPainPoint>();

  for (const [label, state] of Object.entries(profile.painPoints)) {
    const normalized = normalizePainPointLabel(label);
    merged.set(normalized, {
      label: normalized,
      count: state.count,
      score: state.score,
      weight: painPointWeight(state.count, state.score)
    });
  }

  for (const [label, state] of Object.entries(studentSkill?.errorModel ?? {})) {
    const normalized = normalizePainPointLabel(label);
    const previous = merged.get(normalized);
    const count = Math.max(previous?.count ?? 0, state.count);
    const score = Math.max(previous?.score ?? 0, state.score);
    merged.set(normalized, {
      label: normalized,
      count,
      score,
      weight: painPointWeight(count, score)
    });
  }

  return [...merged.values()]
    .sort((left, right) => right.weight - left.weight || left.label.localeCompare(right.label))
    .slice(0, 5);
}

function painPointWeight(count: number, score: number): number {
  return roundScore(Math.max(0, count) * 0.8 + Math.max(0, score));
}

function resolveTargetDifficulty(
  topPainPoints: RankedPainPoint[],
  input: { hasUpgradeEvidence: boolean; hasRepeatedFailure: boolean }
): number {
  const strongest = topPainPoints[0]?.weight ?? 0;
  if (input.hasRepeatedFailure) {
    return 1;
  }

  if (input.hasUpgradeEvidence) {
    return strongest >= 5 ? 2 : 3;
  }

  if (strongest >= 5) {
    return 1;
  }

  if (strongest >= 2) {
    return 2;
  }

  return 1;
}

function scoreDifficulty(
  problem: RecommendationCandidate,
  strategy: RecommendationStrategy
): { score: number; signal: string; change: RecommendationDifficultyChange } {
  if (typeof problem.difficulty !== "number") {
    return {
      score: 0,
      signal: `目标难度 ${strategy.targetDifficulty}；候选题暂无难度数据`,
      change: "same"
    };
  }

  const gap = Math.abs(problem.difficulty - strategy.targetDifficulty);
  const challengeAllowed = canIncreaseDifficulty(problem, strategy.transferReadySkills, strategy.lowHintSuccessSkills);
  const change = difficultyChange(problem.difficulty, strategy.targetDifficulty);
  const tooHardPenalty = !challengeAllowed && problem.difficulty > strategy.targetDifficulty + 1 ? -50 : 0;
  const cautiousUpPenalty = !challengeAllowed && problem.difficulty > strategy.targetDifficulty ? -18 : 0;
  const failureNarrowingBonus =
    strategy.repeatedFailurePainPoints.some((painPoint) => problem.targetPainPoints.includes(painPoint)) &&
    problem.difficulty <= strategy.targetDifficulty
      ? 10
      : 0;
  const score = roundScore(18 - gap * 12 + tooHardPenalty + cautiousUpPenalty + failureNarrowingBonus);
  const label = challengeAllowed && problem.difficulty > strategy.targetDifficulty ? "允许上探" : "稳态练习";

  return {
    score,
    signal: `目标难度 ${strategy.targetDifficulty}，候选难度 ${problem.difficulty}，${label}`,
    change
  };
}

function chooseTargetSkill(problem: RecommendationCandidate, matchedPainPoints: string[]): string {
  if (problem.skillTargets.length === 0) {
    return matchedPainPoints[0] ?? "general-practice";
  }

  const matchedSkill = problem.skillTargets.find((skill) =>
    matchedPainPoints.some((painPoint) => problem.targetPainPoints.includes(painPoint) && skill.includes(painPoint))
  );
  return matchedSkill ?? problem.skillTargets[0];
}

function collectExcludedProblemIds(input: RecommendNextProblemsInput): string[] {
  const excluded = new Set<string>();
  if (input.currentProblemId) {
    excluded.add(input.currentProblemId.toUpperCase());
  }

  for (const problemId of [
    ...(input.recentlySeenProblemIds ?? []),
    ...(input.archivedProblemIds ?? []),
    ...(input.completedProblemIds ?? []),
    ...(input.deletedProblemIds ?? [])
  ]) {
    excluded.add(problemId.toUpperCase());
  }

  for (const event of input.attemptEvents ?? []) {
    if (
      event.outcome === "ac" ||
      event.outcome === "completed" ||
      event.outcome === "removed" ||
      event.outcome === "abandoned" ||
      event.outcome === "revealed"
    ) {
      excluded.add(event.problemId.toUpperCase());
    }
  }

  return [...excluded].sort();
}

function collectExcludedProblemKeys(input: RecommendNextProblemsInput): Set<string> {
  const excluded = new Set<string>();
  for (const event of input.attemptEvents ?? []) {
    if (
      event.outcome === "ac" ||
      event.outcome === "completed" ||
      event.outcome === "removed" ||
      event.outcome === "abandoned" ||
      event.outcome === "revealed"
    ) {
      excluded.add(candidateKey({ platform: event.platform as RecommendationCandidate["platform"], id: event.problemId }));
    }
  }

  return excluded;
}

function difficultyChange(candidateDifficulty: number, targetDifficulty: number): RecommendationDifficultyChange {
  if (candidateDifficulty > targetDifficulty) {
    return "up";
  }

  if (candidateDifficulty < targetDifficulty) {
    return "down";
  }

  return "same";
}

function sortRecommendation(left: ProblemRecommendation, right: ProblemRecommendation): number {
  return (
    right.score - left.score ||
    (left.problem.difficulty ?? 99) - (right.problem.difficulty ?? 99) ||
    left.problem.id.localeCompare(right.problem.id)
  );
}

function normalizeLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) {
    return DEFAULT_LIMIT;
  }

  return Math.max(1, Math.min(Math.floor(limit), 10));
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}
