import { fetchLuoguProblem } from "../problemBank/luoguClient";
import { searchLuoguProblemSets, searchLuoguProblems } from "../problemBank/luoguSearchClient";
import type { ProblemRecord, ProblemSearchResult, ProblemSetSearchResult } from "../problemBank/types";
import { normalizePainPointLabel } from "../teaching/teachingTaxonomy";

export interface ProblemToolSummary {
  platform: "luogu" | "leetcode";
  id: string;
  title: string;
  sourceUrl: string;
  difficulty?: number;
  tags: string[];
  reason?: string;
}

export interface RecommendProblemsInput {
  painPoint: string;
  limit?: number;
  currentProblemId?: string;
}

export interface ProblemRecommendationResult {
  painPoint: string;
  searchHints: string[];
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

interface RecommendationBucket {
  hints: string[];
  problems: ProblemToolSummary[];
}

const PROBLEM_POOL: Record<string, ProblemToolSummary> = {
  P1305: luoguProblem("P1305", "新二叉树", "Practice reading child triples and emitting preorder directly.", ["binary-tree", "traversal"]),
  P1030: luoguProblem(
    "P1030",
    "[NOIP 2001 普及组] 求先序排列",
    "Practice reconstructing preorder from inorder and postorder boundaries.",
    ["binary-tree", "traversal", "reconstruction"]
  ),
  P1827: luoguProblem(
    "P1827",
    "[USACO3.4] 美国血统 American Heritage",
    "Practice traversal reconstruction with named nodes after the simpler preorder exercises.",
    ["binary-tree", "traversal", "reconstruction"]
  ),
  P1229: luoguProblem("P1229", "遍历问题", "Practice reasoning about ambiguous traversals.", [
    "binary-tree",
    "traversal",
    "counting"
  ]),
  P4913: luoguProblem("P4913", "【深基16.例3】二叉树深度", "Practice child indexing and recursive depth definitions.", [
    "binary-tree",
    "recursion"
  ]),
  P1364: luoguProblem("P1364", "医院设置", "Practice weighted tree distance and trying each root candidate.", [
    "tree",
    "distance",
    "weighted-cost"
  ]),
  P3884: luoguProblem("P3884", "[JLOI2009] 二叉树问题", "Practice depth, width, and distance queries on a binary tree.", [
    "binary-tree",
    "distance"
  ]),
  P1185: luoguProblem("P1185", "绘制二叉树", "Practice recursive layout and strict output formatting.", [
    "binary-tree",
    "output-format"
  ]),
  P1427: luoguProblem("P1427", "小鱼的数字游戏", "Practice sentinel input and reversed output order.", [
    "array",
    "sentinel-input",
    "output-order"
  ]),
  P5731: luoguProblem("P5731", "【深基5.习6】蛇形方阵", "Practice matrix traversal and strict row formatting.", [
    "matrix",
    "simulation",
    "output-format"
  ]),
  P5730: luoguProblem("P5730", "【深基5.例10】显示屏", "Practice fixed-width rendering and multi-line output formatting.", [
    "simulation",
    "output-format"
  ]),
  P5727: luoguProblem("P5727", "【深基5.例3】冰雹猜想", "Practice sentinel-like sequence generation and reversed reporting.", [
    "sequence",
    "output-order"
  ])
};

const RECOMMENDATION_BUCKETS: Record<string, RecommendationBucket> = {
  traversal_order_confusion: bucket(["二叉树 遍历", "先序 中序 后序", "traversal reconstruction"], [
    "P1305",
    "P1030",
    "P1827",
    "P1229"
  ]),
  root_identification: bucket(["二叉树 根节点", "中序 后序 求先序"], ["P1030", "P1827", "P1305"]),
  subtree_boundary: bucket(["二叉树 子树边界", "遍历重建"], ["P1030", "P1827", "P1229"]),
  depth_definition: bucket(["二叉树 深度", "递归 深度"], ["P4913", "P3884", "P1305"]),
  child_indexing: bucket(["二叉树 编号 子节点", "数组存树"], ["P4913", "P1305", "P3884"]),
  recursion_base_case: bucket(["递归 终止条件 二叉树", "空子树"], ["P4913", "P1305", "P1030"]),
  tree_distance: bucket(["树 距离", "二叉树 距离"], ["P1364", "P3884", "P4913"]),
  weighted_cost: bucket(["树 加权距离", "换根 枚举"], ["P1364", "P3884"]),
  undirected_tree_edges: bucket(["树 无向边", "孩子转边"], ["P1364", "P3884"]),
  output_order: bucket(["输出顺序", "倒序输出"], ["P1427", "P5731", "P1185"]),
  output_format: bucket(["输出格式", "矩阵 输出"], ["P5731", "P1185", "P5730"]),
  sentinel_input: bucket(["哨兵输入", "0 结束 输入"], ["P1427", "P5727"]),
  needs_teacher_review: bucket(["二叉树 入门", "递归 基础", "输出格式"], ["P4913", "P1305", "P1427"])
};

export function recommendProblemsByPainPoint(input: RecommendProblemsInput): ProblemRecommendationResult {
  const painPoint = normalizePainPointLabel(input.painPoint);
  const limit = normalizeLimit(input.limit, 5, 10);
  const currentProblemId = input.currentProblemId?.trim().toUpperCase();
  const bucket = RECOMMENDATION_BUCKETS[painPoint] ?? RECOMMENDATION_BUCKETS.needs_teacher_review;
  const items = bucket.problems.filter((problem) => problem.id !== currentProblemId).slice(0, limit);

  return {
    painPoint,
    searchHints: bucket.hints,
    items
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

function bucket(hints: string[], ids: string[]): RecommendationBucket {
  return {
    hints,
    problems: ids.map((id) => PROBLEM_POOL[id]).filter((problem): problem is ProblemToolSummary => Boolean(problem))
  };
}

function luoguProblem(id: string, title: string, reason: string, tags: string[]): ProblemToolSummary {
  return {
    platform: "luogu",
    id,
    title,
    sourceUrl: `https://www.luogu.com.cn/problem/${id}`,
    tags,
    reason
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
