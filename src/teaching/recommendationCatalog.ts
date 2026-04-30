import type { ProblemRecord } from "../problemBank/types";
import type { RecommendationCandidateInput } from "./recommendationEngine";

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

function candidateKey(candidate: RecommendationCandidateInput): string {
  return `${candidate.platform}:${candidate.id.toUpperCase()}`;
}
