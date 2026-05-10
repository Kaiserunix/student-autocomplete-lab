import { fetchLuoguProblem } from "../problemBank/luoguClient";
import { searchLuoguProblemSets, searchLuoguProblems } from "../problemBank/luoguSearchClient";
import type { ProblemRecord, ProblemSearchResult, ProblemSetSearchResult } from "../problemBank/types";
import { builtInRecommendationCandidates } from "../recommendation/candidatePool";
import { recommendNextProblems } from "../recommendation/rules";
import { normalizePainPointLabel } from "../teaching/teachingTaxonomy";

export interface ProblemToolSummary {
  platform: "luogu" | "leetcode";
  id: string;
  title: string;
  sourceUrl: string;
  difficulty?: number;
  tags: string[];
  reason?: string;
  score?: number;
  matchedPainPoints?: string[];
  difficultySignal?: string;
  transferSignal?: string;
}

export interface RecommendProblemsInput {
  painPoint: string;
  painPointCounts?: Record<string, number>;
  transferEvidence?: Record<string, { probes: number; passed: number; estimatedHintReduction?: number }>;
  limit?: number;
  currentProblemId?: string;
}

export interface ProblemRecommendationResult {
  painPoint: string;
  searchHints: string[];
  strategy: ReturnType<typeof recommendNextProblems>["strategy"];
  items: ProblemToolSummary[];
}

export interface SearchLuoguProblemsInput {
  keyword: string;
  limit?: number;
}

export interface SearchLuoguProblemsResult {
  platform: "luogu";
  query: string;
  total: number;
  items: ProblemToolSummary[];
}

export interface SearchLuoguProblemSetsInput {
  keyword: string;
  limit?: number;
}

export interface SearchLuoguProblemSetsResult {
  platform: "luogu";
  query: string;
  total: number;
  items: Array<{
    id: string;
    title: string;
    sourceUrl: string;
    problemCount: number;
  }>;
}

export interface FetchLuoguProblemInput {
  pid: string;
  maxStatementChars?: number;
}

export interface FetchProblemResult extends ProblemRecord {
  truncated: boolean;
}

const SEARCH_HINTS_BY_PAIN_POINT: Record<string, string[]> = {
  traversal_order_confusion: ["二叉树 遍历", "先序 中序 后序", "traversal reconstruction"],
  root_identification: ["二叉树 根节点", "中序 后序 求先序"],
  subtree_boundary: ["二叉树 子树边界", "遍历重建"],
  depth_definition: ["二叉树 深度", "递归 深度"],
  child_indexing: ["二叉树 编号 子节点", "数组存树"],
  recursion_base_case: ["递归 终止条件 二叉树", "空子树"],
  tree_distance: ["树 距离", "二叉树 距离"],
  weighted_cost: ["树 加权距离", "换根 枚举"],
  undirected_tree_edges: ["树 无向边", "孩子转边"],
  output_order: ["输出顺序", "倒序输出"],
  output_format: ["输出格式", "矩阵 输出"],
  sentinel_input: ["哨兵输入", "0 结束 输入"],
  array_indexing: ["数组 下标", "数组 模拟"],
  loop_boundary: ["循环边界", "数组 计数"],
  duplicate_handling: ["去重 重复元素", "计数"],
  bruteforce_no_growth: ["复杂度 优化", "计数模型"],
  needs_teacher_review: ["二叉树 入门", "递归 基础", "输出格式"]
};

export function recommendProblemsByPainPoint(input: RecommendProblemsInput): ProblemRecommendationResult {
  const painPoint = normalizePainPointLabel(input.painPoint);
  const limit = normalizeLimit(input.limit, 5, 10);
  const profile = {
    studentId: "mcp-student",
    painPoints: Object.fromEntries(
      Object.entries({ [painPoint]: 1, ...(input.painPointCounts ?? {}) }).map(([label, count]) => [
        normalizePainPointLabel(label),
        {
          count,
          score: count,
          lastSeen: new Date(0).toISOString()
        }
      ])
    ),
    skillCandidates: {}
  };
  const studentSkill = input.transferEvidence
    ? {
        schemaVersion: "student-skill/v1" as const,
        studentId: "mcp-student",
        revision: 0,
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
        hardRules: {
          autocompleteMayReadProblemStatement: false as const,
          allowFullSolutionAutocomplete: false as const,
          disabledSkills: []
        },
        capabilityMap: { topics: {} },
        errorModel: {},
        codeHabits: { globalRules: [], languageRules: {} },
        teachingPreferences: { responseLanguage: "zh-CN" as const, maxDefaultHintDepth: 1, notes: [] },
        skills: {},
        transferEvidence: Object.fromEntries(
          Object.entries(input.transferEvidence).map(([skillName, transfer]) => [
            skillName,
            {
              probes: transfer.probes,
              passed: transfer.passed,
              estimatedHintReduction: transfer.estimatedHintReduction ?? 0,
              lastSeen: new Date(0).toISOString()
            }
          ])
        ),
        correctionLog: []
      }
    : undefined;
  const ranked = recommendNextProblems({
    profile,
    studentSkill,
    candidates: builtInRecommendationCandidates,
    currentProblemId: input.currentProblemId,
    limit
  });

  return {
    painPoint,
    searchHints: SEARCH_HINTS_BY_PAIN_POINT[painPoint] ?? SEARCH_HINTS_BY_PAIN_POINT.needs_teacher_review,
    strategy: ranked.strategy,
    items: ranked.recommendations.map((recommendation) => ({
      platform: recommendation.problem.platform as "luogu" | "leetcode",
      id: recommendation.problem.id,
      title: recommendation.problem.title,
      sourceUrl: recommendation.problem.sourceUrl ?? "",
      difficulty: recommendation.problem.difficulty,
      tags: recommendation.problem.tags,
      reason: recommendation.reasons.join("；"),
      score: recommendation.score,
      matchedPainPoints: recommendation.matchedPainPoints,
      difficultySignal: recommendation.difficultySignal,
      transferSignal: recommendation.transferSignal
    }))
  };
}

export async function searchLuoguProblemsForMcp(
  input: SearchLuoguProblemsInput,
  fetchImpl: typeof fetch = fetch
): Promise<SearchLuoguProblemsResult> {
  const keyword = requireNonEmpty(input.keyword, "keyword");
  const limit = normalizeLimit(input.limit, 8, 20);
  const results = await searchLuoguProblems(keyword, fetchImpl);

  return {
    platform: "luogu",
    query: keyword,
    total: results.total,
    items: results.items.slice(0, limit).map(formatLuoguProblemSearchResult)
  };
}

export async function searchLuoguProblemSetsForMcp(
  input: SearchLuoguProblemSetsInput,
  fetchImpl: typeof fetch = fetch
): Promise<SearchLuoguProblemSetsResult> {
  const keyword = requireNonEmpty(input.keyword, "keyword");
  const limit = normalizeLimit(input.limit, 8, 20);
  const results = await searchLuoguProblemSets(keyword, fetchImpl);

  return {
    platform: "luogu",
    query: keyword,
    total: results.total,
    items: results.items.slice(0, limit).map(formatLuoguProblemSetSearchResult)
  };
}

export async function fetchLuoguProblemForMcp(
  input: FetchLuoguProblemInput,
  fetchImpl: typeof fetch = fetch
): Promise<FetchProblemResult> {
  const pid = requireNonEmpty(input.pid, "pid").toUpperCase();
  const maxStatementChars = normalizeLimit(input.maxStatementChars, 4000, 20000);
  const problem = await fetchLuoguProblem(pid, fetchImpl);
  const statement = trimText(problem.statement, maxStatementChars);

  return {
    ...problem,
    statement,
    truncated: statement.length < problem.statement.length
  };
}

function formatLuoguProblemSearchResult(result: ProblemSearchResult): ProblemToolSummary {
  return {
    platform: "luogu",
    id: result.id,
    title: result.title,
    sourceUrl: result.sourceUrl,
    difficulty: result.difficulty,
    tags: result.tags
  };
}

function formatLuoguProblemSetSearchResult(result: ProblemSetSearchResult): SearchLuoguProblemSetsResult["items"][number] {
  return {
    id: result.id,
    title: result.title,
    sourceUrl: result.sourceUrl,
    problemCount: result.problemCount
  };
}

function requireNonEmpty(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${name} is required.`);
  }

  return normalized;
}

function normalizeLimit(value: number | undefined, fallback: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.max(1, Math.min(Math.floor(value), max));
}

function trimText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }

  return text.slice(0, maxChars);
}
