import type { ProblemPlatform } from "../problemBank/types";
import type { AttemptEvent } from "./attemptEvent";
import type { StudentProfile } from "./studentProfile";
import type { StudentSkill } from "./studentSkill";
import { normalizePainPointLabel } from "./teachingTaxonomy";

export interface RecommendationCandidateInput {
  platform: ProblemPlatform;
  id: string;
  title: string;
  sourceUrl?: string;
  difficulty?: number;
  tags: string[];
  targetPainPoints?: string[];
  skillTargets?: string[];
  reason?: string;
}

export interface RecommendationCandidate extends RecommendationCandidateInput {
  targetPainPoints: string[];
  skillTargets: string[];
}

export interface RecommendNextProblemsInput {
  profile: StudentProfile;
  studentSkill?: StudentSkill;
  attemptEvents?: AttemptEvent[];
  candidates: RecommendationCandidateInput[];
  currentProblemId?: string;
  limit?: number;
}

export interface RankedPainPoint {
  label: string;
  count: number;
  score: number;
  weight: number;
}

export interface ProblemRecommendation {
  problem: RecommendationCandidate;
  score: number;
  matchedPainPoints: string[];
  reasons: string[];
  difficultySignal: string;
  transferSignal: string;
  breakdown: {
    painPointScore: number;
    difficultyScore: number;
    transferScore: number;
    repeatPenalty: number;
  };
}

export interface RecommendationStrategy {
  topPainPoints: RankedPainPoint[];
  targetDifficulty: number;
  transferReadySkills: string[];
  excludedProblemIds: string[];
}

export interface ProblemRecommendationResult {
  strategy: RecommendationStrategy;
  recommendations: ProblemRecommendation[];
}

const DEFAULT_LIMIT = 5;

const PAIN_POINT_TO_SKILL: Record<string, string> = {
  traversal_order_confusion: "binary-tree-traversal-reconstruction",
  root_identification: "binary-tree-traversal-reconstruction",
  subtree_boundary: "binary-tree-traversal-reconstruction",
  depth_definition: "binary-tree-depth-numbered-children",
  child_indexing: "binary-tree-depth-numbered-children",
  recursion_base_case: "recursion-base-case-pattern",
  output_order: "sentinel-input-output-order",
  sentinel_input: "sentinel-input-output-order",
  output_format: "format-output-checklist",
  loop_boundary: "python-loop-boundary-check",
  array_indexing: "array-indexing-checklist",
  time_complexity_mismatch: "complexity-upgrade-from-bruteforce",
  complexity_gap: "complexity-upgrade-from-bruteforce",
  bruteforce_no_growth: "complexity-upgrade-from-bruteforce",
  tree_distance: "tree-weighted-distance",
  weighted_cost: "tree-weighted-distance",
  undirected_tree_edges: "graph-undirected-edge-model",
  graph_adjacency_model: "graph-adjacency-model",
  search_state_pruning: "search-state-boundary-check",
  duplicate_handling: "ordered-multiset-semantics",
  rank_query_semantics: "ordered-multiset-semantics",
  data_structure_semantics: "ordered-multiset-semantics",
  binary_search_invariant: "binary-search-boundary-check",
  high_precision_carry_order: "high-precision-carry-order",
  greedy_choice_model: "greedy-choice-proof-check",
  numeric_input_type: "numeric-geometry-formatting",
  distance_formula: "numeric-geometry-formatting"
};

const TAG_TO_PAIN_POINTS: Record<string, string[]> = {
  array: ["array_indexing", "loop_boundary"],
  "output-order": ["output_order"],
  reverse: ["output_order"],
  "sentinel-input": ["sentinel_input"],
  simulation: ["output_format", "array_indexing"],
  matrix: ["array_indexing", "output_format"],
  "binary-tree": ["recursion_base_case"],
  tree: ["tree_distance", "undirected_tree_edges", "recursion_base_case"],
  traversal: ["traversal_order_confusion"],
  reconstruction: ["root_identification", "subtree_boundary"],
  depth: ["depth_definition"],
  recursion: ["recursion_base_case"],
  "output-format": ["output_format"],
  "data-structure": ["data_structure_semantics"],
  counting: ["duplicate_handling", "bruteforce_no_growth"],
  graph: ["graph_adjacency_model", "search_state_pruning"],
  search: ["search_state_pruning"],
  dsu: ["disjoint_set_union_semantics"],
  greedy: ["greedy_choice_model"],
  "binary-search": ["binary_search_invariant"],
  "high-precision": ["high_precision_carry_order"]
};

export function buildRecommendationCandidate(input: RecommendationCandidateInput): RecommendationCandidate {
  const targetPainPoints = unique([
    ...(input.targetPainPoints ?? []),
    ...inferPainPointsFromTags(input.tags),
    ...inferPainPointsFromTitle(input.title)
  ]).map(normalizePainPointLabel);

  const skillTargets = unique([
    ...(input.skillTargets ?? []),
    ...targetPainPoints.map((painPoint) => PAIN_POINT_TO_SKILL[painPoint]).filter((skill): skill is string => Boolean(skill))
  ]);

  return {
    ...input,
    targetPainPoints: unique(targetPainPoints),
    skillTargets
  };
}

export function recommendNextProblems(input: RecommendNextProblemsInput): ProblemRecommendationResult {
  const topPainPoints = rankPainPoints(input.profile, input.studentSkill);
  const targetDifficulty = resolveTargetDifficulty(topPainPoints, input.studentSkill);
  const excludedProblemIds = collectExcludedProblemIds(input.currentProblemId, input.attemptEvents ?? []);
  const candidates = input.candidates
    .map(buildRecommendationCandidate)
    .filter((candidate) => !excludedProblemIds.includes(candidate.id.toUpperCase()));
  const strategy: RecommendationStrategy = {
    topPainPoints,
    targetDifficulty,
    transferReadySkills: collectTransferReadySkills(input.studentSkill),
    excludedProblemIds
  };
  const recommendations = candidates
    .map((candidate) => scoreCandidate(candidate, strategy, input.studentSkill))
    .sort(sortRecommendation)
    .slice(0, normalizeLimit(input.limit));

  return {
    strategy,
    recommendations
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
  const { score: difficultyScore, signal: difficultySignal } = scoreDifficulty(problem, strategy);
  const { score: transferScore, signal: transferSignal } = scoreTransfer(problem, studentSkill);
  const repeatPenalty = problem.id ? 0 : -10;
  const score = roundScore(painPointScore + difficultyScore + transferScore + repeatPenalty);

  return {
    problem,
    score,
    matchedPainPoints,
    reasons: buildReasons(problem, matchedPainPoints, difficultySignal, transferSignal),
    difficultySignal,
    transferSignal,
    breakdown: {
      painPointScore,
      difficultyScore,
      transferScore,
      repeatPenalty
    }
  };
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

function resolveTargetDifficulty(topPainPoints: RankedPainPoint[], studentSkill?: StudentSkill): number {
  const strongest = topPainPoints[0]?.weight ?? 0;
  if (hasStrongTransferEvidence(studentSkill)) {
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
): { score: number; signal: string } {
  if (typeof problem.difficulty !== "number") {
    return {
      score: 0,
      signal: `目标难度 ${strategy.targetDifficulty}；候选题暂无难度数据`
    };
  }

  const gap = Math.abs(problem.difficulty - strategy.targetDifficulty);
  const challengeAllowed = strategy.transferReadySkills.some((skill) => problem.skillTargets.includes(skill));
  const tooHardPenalty = !challengeAllowed && problem.difficulty > strategy.targetDifficulty + 1 ? -24 : 0;
  const score = roundScore(18 - gap * 12 + tooHardPenalty);
  const label = challengeAllowed && problem.difficulty > strategy.targetDifficulty ? "允许上探" : "稳态练习";

  return {
    score,
    signal: `目标难度 ${strategy.targetDifficulty}，候选难度 ${problem.difficulty}，${label}`
  };
}

function scoreTransfer(
  problem: RecommendationCandidate,
  studentSkill?: StudentSkill
): { score: number; signal: string } {
  if (!studentSkill || problem.skillTargets.length === 0) {
    return {
      score: 0,
      signal: "暂无迁移证据"
    };
  }

  let score = 0;
  const signals: string[] = [];
  for (const skillName of problem.skillTargets) {
    const skill = studentSkill.skills[skillName];
    if (skill?.status === "disabled") {
      score -= 80;
      signals.push(`${skillName} 已禁用`);
      continue;
    }

    if (skill?.status === "active") {
      score += 8;
      signals.push(`${skillName} 已启用`);
    }

    const transfer = studentSkill.transferEvidence[skillName];
    if (transfer && transfer.probes > 0) {
      const passRate = transfer.passed / transfer.probes;
      if (passRate >= 0.66 && transfer.estimatedHintReduction > 0) {
        score += 18 + transfer.estimatedHintReduction * 4;
        signals.push(`迁移证据 ${skillName} ${transfer.passed}/${transfer.probes}`);
      } else {
        score += 3;
        signals.push(`迁移待验证 ${skillName} ${transfer.passed}/${transfer.probes}`);
      }
    }
  }

  return {
    score: roundScore(score),
    signal: signals.join("；") || "暂无迁移证据"
  };
}

function buildReasons(
  problem: RecommendationCandidate,
  matchedPainPoints: string[],
  difficultySignal: string,
  transferSignal: string
): string[] {
  return [
    matchedPainPoints.length > 0
      ? `痛点匹配：${matchedPainPoints.join(" / ")}`
      : "痛点匹配：弱，作为补充练习",
    `难度阶梯：${difficultySignal}`,
    `迁移证据：${transferSignal}`,
    problem.reason
  ].filter((item): item is string => Boolean(item));
}

function collectTransferReadySkills(studentSkill?: StudentSkill): string[] {
  if (!studentSkill) {
    return [];
  }

  return unique(
    Object.entries(studentSkill.transferEvidence)
      .filter(([, transfer]) => transfer.probes > 0 && transfer.passed / transfer.probes >= 0.66)
      .filter(([, transfer]) => transfer.estimatedHintReduction > 0)
      .map(([skillName]) => skillName)
  );
}

function hasStrongTransferEvidence(studentSkill?: StudentSkill): boolean {
  return collectTransferReadySkills(studentSkill).length > 0;
}

function collectExcludedProblemIds(currentProblemId: string | undefined, events: AttemptEvent[]): string[] {
  const excluded = new Set<string>();
  if (currentProblemId) {
    excluded.add(currentProblemId.toUpperCase());
  }

  for (const event of events) {
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

function sortRecommendation(left: ProblemRecommendation, right: ProblemRecommendation): number {
  return (
    right.score - left.score ||
    (left.problem.difficulty ?? 99) - (right.problem.difficulty ?? 99) ||
    left.problem.id.localeCompare(right.problem.id)
  );
}

function inferPainPointsFromTags(tags: string[]): string[] {
  return tags.flatMap((tag) => TAG_TO_PAIN_POINTS[normalizeTag(tag)] ?? []);
}

function inferPainPointsFromTitle(title: string): string[] {
  const text = title.toLowerCase();
  const result: string[] = [];
  if (/先序|中序|后序|遍历|重建/.test(text)) {
    result.push("traversal_order_confusion");
  }
  if (/深度/.test(text)) {
    result.push("depth_definition");
  }
  if (/输出|显示|方阵/.test(text)) {
    result.push("output_format");
  }
  if (/数字游戏|倒序/.test(text)) {
    result.push("output_order", "sentinel_input");
  }

  return result;
}

function normalizeTag(tag: string): string {
  return String(tag).trim().toLowerCase().replace(/[\s_]+/g, "-");
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

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
