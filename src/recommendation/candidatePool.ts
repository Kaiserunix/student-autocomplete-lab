import type { ProblemRecord, ProblemPlatform } from "../problemBank/types";
import { normalizePainPointLabel } from "../teaching/teachingTaxonomy";
import type { RecommendationCandidate, RecommendationCandidateInput, RecommendationSource } from "./schema";

export const painPointToSkill: Record<string, string> = {
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

export const builtInRecommendationCandidates: RecommendationCandidateInput[] = [
  luogu("P1427", "小鱼的数字游戏", 1, ["array", "sentinel-input", "output-order"], [
    "output_order",
    "sentinel_input"
  ]),
  luogu("P1428", "小鱼比可爱", 1, ["array"], ["array_indexing", "loop_boundary"]),
  luogu("P1161", "开灯", 1, ["array", "simulation"], ["array_indexing", "loop_boundary"]),
  luogu("P5727", "【深基5.例3】冰雹猜想", 1, ["sequence", "output-order"], ["output_order", "loop_boundary"]),
  luogu("P5730", "【深基5.例10】显示屏", 2, ["simulation", "output-format"], ["output_format"]),
  luogu("P5731", "【深基5.习6】蛇形方阵", 2, ["matrix", "simulation"], ["array_indexing", "output_format"]),
  luogu("P5732", "【深基5.习7】杨辉三角", 2, ["matrix", "recursion"], ["array_indexing", "loop_boundary"]),
  luogu("P5735", "【深基7.例1】距离函数", 1, ["geometry"], ["numeric_input_type", "distance_formula", "output_format"]),
  luogu("P2141", "[NOIP 2014 普及组] 珠心算测验", 2, ["counting"], [
    "duplicate_handling",
    "bruteforce_no_growth"
  ]),
  luogu("P1614", "爱与愁的心痛", 2, ["prefix", "sliding-window"], ["time_complexity_mismatch", "loop_boundary"]),
  luogu("P1205", "[USACO1.2] Transformations", 2, ["matrix", "simulation"], ["array_indexing", "output_format"]),
  luogu("P1047", "[NOIP 2005 普及组] 校门外的树", 2, ["interval", "array"], [
    "array_indexing",
    "loop_boundary"
  ]),
  luogu("P1305", "新二叉树", 1, ["binary-tree", "traversal"], [
    "traversal_order_confusion",
    "recursion_base_case"
  ]),
  luogu("P4913", "【深基16.例3】二叉树深度", 1, ["binary-tree", "depth", "recursion"], [
    "depth_definition",
    "child_indexing",
    "recursion_base_case",
    "needs_teacher_review"
  ]),
  luogu("P1030", "[NOIP 2001 普及组] 求先序排列", 2, ["binary-tree", "traversal", "reconstruction"], [
    "traversal_order_confusion",
    "root_identification",
    "subtree_boundary"
  ]),
  luogu("P1827", "[USACO3.4] 美国血统 American Heritage", 2, ["binary-tree", "traversal", "reconstruction"], [
    "traversal_order_confusion",
    "root_identification",
    "subtree_boundary"
  ]),
  luogu("P1229", "遍历问题", 3, ["binary-tree", "traversal", "counting"], [
    "traversal_order_confusion",
    "subtree_boundary"
  ]),
  luogu("P1364", "医院设置", 3, ["tree", "weighted-cost"], ["tree_distance", "weighted_cost", "undirected_tree_edges"]),
  luogu("P3884", "[JLOI2009] 二叉树问题", 3, ["binary-tree", "distance"], [
    "depth_definition",
    "tree_distance",
    "undirected_tree_edges"
  ]),
  luogu("P1185", "绘制二叉树", 3, ["binary-tree", "output-format"], [
    "output_format",
    "recursion_base_case"
  ]),
  luogu("P2249", "【深基13.例1】查找", 2, ["binary-search"], ["binary_search_invariant"]),
  luogu("P1601", "A+B Problem（高精）", 2, ["high-precision"], ["high_precision_carry_order", "output_order"]),
  luogu("P2240", "【深基12.例1】部分背包问题", 2, ["greedy"], ["greedy_choice_model"]),
  luogu("P1219", "[USACO1.5] 八皇后 Checker Challenge", 3, ["search"], ["search_state_pruning"]),
  luogu("P5318", "【深基18.例3】查找文献", 2, ["graph", "search"], ["graph_adjacency_model", "search_state_pruning"]),
  luogu("P1551", "亲戚", 2, ["dsu"], ["disjoint_set_union_semantics"]),
  luogu("P3369", "【模板】普通平衡树", 4, ["data-structure"], [
    "duplicate_handling",
    "rank_query_semantics",
    "data_structure_semantics"
  ])
];

export function buildRecommendationCandidate(input: RecommendationCandidateInput): RecommendationCandidate {
  const targetPainPoints = unique([
    ...(input.targetPainPoints ?? []),
    ...inferPainPointsFromTags(input.tags),
    ...inferPainPointsFromTitle(input.title)
  ]).map(normalizePainPointLabel);

  const skillTargets = unique([
    ...(input.skillTargets ?? []),
    ...targetPainPoints.map((painPoint) => painPointToSkill[painPoint]).filter((skill): skill is string => Boolean(skill))
  ]);

  return {
    ...input,
    source: input.source ?? sourceFromPlatform(input.platform),
    targetPainPoints: unique(targetPainPoints),
    skillTargets
  };
}

export function recommendationCandidatesFromProblems(problems: ProblemRecord[]): RecommendationCandidateInput[] {
  return problems.map((problem) => ({
    platform: problem.platform,
    id: problem.id,
    title: problem.title,
    sourceUrl: problem.sourceUrl,
    difficulty: problem.difficulty,
    tags: problem.tags,
    reason: "来自当前练习队列，优先考虑可立即切换练习。"
  }));
}

export function mergeRecommendationCandidates(
  primary: RecommendationCandidateInput[],
  fallback: RecommendationCandidateInput[] = builtInRecommendationCandidates
): RecommendationCandidateInput[] {
  const result = new Map<string, RecommendationCandidateInput>();
  for (const candidate of fallback) {
    result.set(candidateKey(candidate), candidate);
  }
  for (const candidate of primary) {
    result.set(candidateKey(candidate), candidate);
  }

  return [...result.values()];
}

export function candidateKey(candidate: Pick<RecommendationCandidateInput, "platform" | "id">): string {
  return `${candidate.platform}:${candidate.id.toUpperCase()}`;
}

function luogu(
  id: string,
  title: string,
  difficulty: number,
  tags: string[],
  targetPainPoints: string[]
): RecommendationCandidateInput {
  return {
    platform: "luogu",
    id,
    title,
    sourceUrl: `https://www.luogu.com.cn/problem/${id}`,
    difficulty,
    tags,
    targetPainPoints
  };
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

function sourceFromPlatform(platform: ProblemPlatform): RecommendationSource {
  return platform;
}

function normalizeTag(tag: string): string {
  return String(tag).trim().toLowerCase().replace(/[\s_]+/g, "-");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}
