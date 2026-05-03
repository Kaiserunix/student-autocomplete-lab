import { TeachingDiagnosisReport } from "./teachingReport";

export const CANONICAL_PAIN_POINTS = [
  "recursion_base_case",
  "child_indexing",
  "depth_definition",
  "traversal_order_confusion",
  "subtree_boundary",
  "root_identification",
  "tree_distance",
  "weighted_cost",
  "undirected_tree_edges",
  "output_order",
  "output_format",
  "loop_boundary",
  "array_indexing",
  "branch_condition_coverage",
  "binary_search_invariant",
  "high_precision_carry_order",
  "greedy_choice_model",
  "search_state_pruning",
  "graph_adjacency_model",
  "disjoint_set_union_semantics",
  "sentinel_input",
  "numeric_input_type",
  "distance_formula",
  "duplicate_handling",
  "rank_query_semantics",
  "data_structure_semantics",
  "time_complexity_mismatch",
  "complexity_gap",
  "bruteforce_no_growth",
  "needs_teacher_review"
] as const;

export const ALLOWED_RECOMMENDATIONS = [
  "P1305",
  "P4913",
  "P1030",
  "P1364",
  "P1427",
  "P5735",
  "P3369",
  "P5711",
  "P2249",
  "P1601",
  "P2240",
  "P1219",
  "P5318",
  "P1551",
  "P2141"
] as const;

export const PREFERRED_SKILL_CANDIDATES = [
  "binary-tree-traversal-reconstruction",
  "binary-tree-depth-numbered-children",
  "sentinel-input-output-order",
  "numeric-geometry-formatting",
  "format-output-checklist",
  "python-loop-boundary-check",
  "array-indexing-checklist",
  "branch-boundary-check",
  "binary-search-boundary-check",
  "high-precision-carry-order",
  "greedy-choice-proof-check",
  "search-state-boundary-check",
  "graph-adjacency-model",
  "disjoint-set-union-model",
  "recursion-base-case-pattern",
  "ordered-multiset-semantics",
  "complexity-upgrade-from-bruteforce",
  "tree-weighted-distance",
  "graph-undirected-edge-model",
  "evidence-first-debugging"
] as const;

export interface TeachingTaxonomyNormalizeOptions {
  currentProblemId?: string;
  problemSummary?: string;
}

const REUSABLE_SKILL_BY_PAIN_POINT: Record<string, string> = {
  traversal_order_confusion: "binary-tree-traversal-reconstruction",
  root_identification: "binary-tree-traversal-reconstruction",
  subtree_boundary: "binary-tree-traversal-reconstruction",
  recursion_base_case: "recursion-base-case-pattern",
  depth_definition: "binary-tree-depth-numbered-children",
  child_indexing: "binary-tree-depth-numbered-children",
  loop_boundary: "python-loop-boundary-check",
  array_indexing: "array-indexing-checklist",
  branch_condition_coverage: "branch-boundary-check",
  binary_search_invariant: "binary-search-boundary-check",
  high_precision_carry_order: "high-precision-carry-order",
  greedy_choice_model: "greedy-choice-proof-check",
  search_state_pruning: "search-state-boundary-check",
  graph_adjacency_model: "graph-adjacency-model",
  disjoint_set_union_semantics: "disjoint-set-union-model",
  sentinel_input: "sentinel-input-output-order",
  output_order: "sentinel-input-output-order",
  numeric_input_type: "numeric-geometry-formatting",
  distance_formula: "numeric-geometry-formatting",
  output_format: "format-output-checklist",
  duplicate_handling: "ordered-multiset-semantics",
  rank_query_semantics: "ordered-multiset-semantics",
  data_structure_semantics: "ordered-multiset-semantics",
  time_complexity_mismatch: "complexity-upgrade-from-bruteforce",
  complexity_gap: "complexity-upgrade-from-bruteforce",
  bruteforce_no_growth: "complexity-upgrade-from-bruteforce",
  tree_distance: "tree-weighted-distance",
  weighted_cost: "tree-weighted-distance",
  undirected_tree_edges: "graph-undirected-edge-model",
  needs_teacher_review: "evidence-first-debugging"
};

const PAIN_POINT_ALIASES: Record<string, string> = {
  binary_tree_traversal_order_confusion: "traversal_order_confusion",
  incorrect_preorder_concatenation: "traversal_order_confusion",
  preorder_postorder_confusion: "traversal_order_confusion",
  wrong_traversal_order: "traversal_order_confusion",
  postorder_instead_of_preorder: "traversal_order_confusion",
  recursion_base_case_and_depth_definition: "recursion_base_case",
  output_order_and_sentinel_handling: "sentinel_input",
  loop_bounds: "loop_boundary",
  off_by_one: "loop_boundary",
  branch_boundary: "branch_condition_coverage",
  condition_boundary: "branch_condition_coverage",
  missing_equal_case: "branch_condition_coverage",
  binary_search_boundary: "binary_search_invariant",
  binary_search_gap: "binary_search_invariant",
  binary_search_missing: "binary_search_invariant",
  carry_order: "high_precision_carry_order",
  high_precision_order: "high_precision_carry_order",
  carry_handling: "high_precision_carry_order",
  greedy_choice: "greedy_choice_model",
  wrong_greedy_choice: "greedy_choice_model",
  search_termination: "search_state_pruning",
  missing_visited: "search_state_pruning",
  graph_edge_direction: "graph_adjacency_model",
  directed_edge_only: "graph_adjacency_model",
  missing_reverse_edge: "graph_adjacency_model",
  adjacency_list_model: "graph_adjacency_model",
  union_find_semantics: "disjoint_set_union_semantics",
  dsu_semantics: "disjoint_set_union_semantics",
  transitive_relation: "disjoint_set_union_semantics",
  connectivity_query: "disjoint_set_union_semantics",
  connected_component_semantics: "disjoint_set_union_semantics",
  array_index: "array_indexing",
  index_out_of_bounds: "array_indexing",
  sentinel_handling: "sentinel_input",
  matrix_like_input_and_decimal_format: "output_format",
  decimal_format: "output_format",
  euclidean_distance_formula: "distance_formula",
  sorted_set_multiset_confusion: "duplicate_handling",
  balanced_tree_concept_misused_as_sorted_set: "duplicate_handling",
  wrong_root_source: "root_identification",
  wrong_subtree_slice: "subtree_boundary",
  brute_force_no_growth: "bruteforce_no_growth",
  brute_force_only: "bruteforce_no_growth",
  complexity_mismatch: "time_complexity_mismatch"
};

const SKILL_ALIASES: Record<string, string> = {
  tree_traversal_order: "binary-tree-traversal-reconstruction",
  tree_traversal_reconstruction: "binary-tree-traversal-reconstruction",
  binary_tree_traversal_reconstruction: "binary-tree-traversal-reconstruction",
  binary_tree_depth_numbered_children: "binary-tree-depth-numbered-children",
  tree_depth_definition: "binary-tree-depth-numbered-children",
  tree_weighted_distance: "tree-weighted-distance"
};

const FALLBACK_RECOMMENDATIONS: Record<string, string> = {
  traversal_order_confusion: "P1305",
  root_identification: "P1030",
  subtree_boundary: "P1030",
  depth_definition: "P4913",
  child_indexing: "P4913",
  recursion_base_case: "P4913",
  branch_condition_coverage: "P5711",
  binary_search_invariant: "P2249",
  high_precision_carry_order: "P1601",
  greedy_choice_model: "P2240",
  search_state_pruning: "P1219",
  graph_adjacency_model: "P5318",
  disjoint_set_union_semantics: "P1551",
  output_order: "P1427",
  sentinel_input: "P1427",
  numeric_input_type: "P5735",
  distance_formula: "P5735",
  output_format: "P5735",
  loop_boundary: "P1428",
  array_indexing: "P1428",
  duplicate_handling: "P3369",
  rank_query_semantics: "P3369",
  data_structure_semantics: "P3369",
  time_complexity_mismatch: "P2141",
  complexity_gap: "P2141",
  bruteforce_no_growth: "P2141",
  tree_distance: "P1364",
  weighted_cost: "P1364",
  undirected_tree_edges: "P1364"
};

const FALLBACK_RECOMMENDATION_REASONS: Record<string, string> = {
  traversal_order_confusion: "Practice direct preorder traversal before returning to traversal reconstruction.",
  root_identification: "Practice identifying the root from traversal definitions.",
  subtree_boundary: "Practice subtree boundary splitting in traversal reconstruction.",
  depth_definition: "Practice binary-tree depth definitions on small trees.",
  child_indexing: "Practice numbered child arrays and one-based node indexing.",
  recursion_base_case: "Practice empty-child base cases in recursive tree functions.",
  branch_condition_coverage: "Practice covering equality, zero, and mutually exclusive condition branches.",
  binary_search_invariant: "Practice binary search boundaries and the loop invariant before using linear scans.",
  high_precision_carry_order: "Practice digit order, carry handling, and final reversal in high-precision arithmetic.",
  greedy_choice_model: "Practice proving the greedy choice before coding the sorted loop.",
  search_state_pruning: "Practice visited states, termination conditions, and pruning in search.",
  graph_adjacency_model: "Practice building the correct adjacency model before traversing the graph.",
  disjoint_set_union_semantics: "Practice union-find parent/root semantics before using set-like shortcuts.",
  output_order: "Practice reverse output order with sentinel input.",
  sentinel_input: "Practice excluding sentinel values before output.",
  numeric_input_type: "Practice keeping decimal input as numeric data, not integers.",
  distance_formula: "Practice matching the required distance formula before formatting.",
  output_format: "Practice exact output formatting separately from the algorithm.",
  loop_boundary: "Practice loop boundaries on a small array before expanding the solution.",
  array_indexing: "Practice mapping input positions to array indexes before adding logic.",
  duplicate_handling: "Practice ordered multiset behavior where equal values remain present.",
  rank_query_semantics: "Practice rank and kth semantics with repeated values.",
  data_structure_semantics: "Practice choosing the data-structure semantics before optimizing.",
  time_complexity_mismatch: "Practice matching the intended complexity before moving on.",
  complexity_gap: "Practice the same idea with a problem where brute force stops helping.",
  bruteforce_no_growth: "Practice turning a passing brute-force solution into a transferable counting model.",
  tree_distance: "Practice edge-count distance on a weighted tree.",
  weighted_cost: "Practice multiplying distance by each node weight.",
  undirected_tree_edges: "Practice converting child links into undirected tree edges."
};

const BROAD_PAIN_POINTS_SHOULD_STAY_CURRENT = new Set(["output_format", "numeric_input_type", "distance_formula", "needs_teacher_review"]);
const TREE_TRAVERSAL_PAIN_POINTS = new Set(["traversal_order_confusion", "root_identification", "subtree_boundary"]);

export function normalizeTeachingDiagnosisReport(
  report: TeachingDiagnosisReport,
  options: TeachingTaxonomyNormalizeOptions = {}
): TeachingDiagnosisReport {
  const painPoints = report.painPoints.map((painPoint) => ({
    ...painPoint,
    label: normalizePainPointLabel(painPoint.label)
  }));
  const topPainPoint = painPoints[0]?.label;
  const recommendation = report.recommendation
    ? {
        ...report.recommendation,
        problemId: normalizeRecommendation(report.recommendation.problemId, topPainPoint, options.currentProblemId),
        reason: normalizeRecommendationReason(report.recommendation.reason, topPainPoint, options.currentProblemId)
      }
    : undefined;

  return {
    ...report,
    painPoints,
    skillUpdate: report.skillUpdate
      ? {
          ...report.skillUpdate,
          candidate: normalizeSkillCandidate(report.skillUpdate.candidate, painPoints.map((painPoint) => painPoint.label), options)
        }
      : undefined,
    recommendation
  };
}

export function normalizePainPointLabel(label: string): string {
  const normalized = label.trim().toLowerCase().replace(/[-\s]+/g, "_");
  if ((CANONICAL_PAIN_POINTS as readonly string[]).includes(normalized)) {
    return normalized;
  }

  return PAIN_POINT_ALIASES[normalized] ?? "needs_teacher_review";
}

function normalizeSkillCandidate(
  candidate: string,
  painPoints: string[],
  options: TeachingTaxonomyNormalizeOptions
): string {
  const normalized = candidate.trim().toLowerCase().replace(/[-\s]+/g, "_");
  const normalizedPainPoint = normalizePainPointLabel(normalized);
  const aliased = SKILL_ALIASES[normalized];
  const topPainPoint = painPoints[0];

  if (aliased) {
    return aliased;
  }

  if (hasTraversalPainPoint(painPoints)) {
    return "binary-tree-traversal-reconstruction";
  }

  if (shouldPreferBinaryTreeDepthSkill(candidate, normalized, normalizedPainPoint, painPoints, options)) {
    return "binary-tree-depth-numbered-children";
  }

  if (topPainPoint && isPainPointLikeCandidate(normalized) && REUSABLE_SKILL_BY_PAIN_POINT[topPainPoint]) {
    return REUSABLE_SKILL_BY_PAIN_POINT[topPainPoint];
  }

  if (normalizedPainPoint !== "needs_teacher_review" && REUSABLE_SKILL_BY_PAIN_POINT[normalizedPainPoint]) {
    return REUSABLE_SKILL_BY_PAIN_POINT[normalizedPainPoint];
  }

  if (topPainPoint && isPainPointLikeCandidate(normalized)) {
    return REUSABLE_SKILL_BY_PAIN_POINT[topPainPoint] ?? candidate.trim();
  }

  if (topPainPoint && REUSABLE_SKILL_BY_PAIN_POINT[topPainPoint]) {
    return REUSABLE_SKILL_BY_PAIN_POINT[topPainPoint];
  }

  return candidate.trim();
}

function hasTraversalPainPoint(painPoints: string[]): boolean {
  return painPoints.some((painPoint) => TREE_TRAVERSAL_PAIN_POINTS.has(painPoint));
}

function shouldPreferBinaryTreeDepthSkill(
  candidate: string,
  normalizedCandidate: string,
  normalizedPainPoint: string,
  painPoints: string[],
  options: TeachingTaxonomyNormalizeOptions
): boolean {
  if (!isBinaryTreeDepthContext(options)) {
    return false;
  }

  const candidateIsBroadRecursion =
    candidate.trim() === "recursion-base-case-pattern" ||
    normalizedCandidate === "recursion_base_case_pattern" ||
    normalizedPainPoint === "recursion_base_case";
  const painPointsAreDepthRelated =
    painPoints.includes("recursion_base_case") || painPoints.includes("depth_definition") || painPoints.includes("child_indexing");

  return candidateIsBroadRecursion && painPointsAreDepthRelated;
}

function isBinaryTreeDepthContext(options: TeachingTaxonomyNormalizeOptions): boolean {
  const haystack = `${options.currentProblemId ?? ""} ${options.problemSummary ?? ""}`.toLowerCase();
  if (!haystack) {
    return false;
  }

  return (
    haystack.includes("binary tree depth") ||
    haystack.includes("tree depth definitions") ||
    haystack.includes("numbered child") ||
    haystack.includes("numbered children") ||
    haystack.includes("p4913") ||
    haystack.includes("p3884") ||
    (haystack.includes("二叉树") && haystack.includes("深度")) ||
    (haystack.includes("tree") && haystack.includes("depth") && haystack.includes("children"))
  );
}

function isPainPointLikeCandidate(normalizedCandidate: string): boolean {
  return (
    (CANONICAL_PAIN_POINTS as readonly string[]).includes(normalizedCandidate) ||
    PAIN_POINT_ALIASES[normalizedCandidate] !== undefined
  );
}

function normalizeRecommendation(problemId: string, painPoint?: string, currentProblemId?: string): string {
  const normalized = problemId.trim().toUpperCase();
  const painPointRecommendation = painPoint && FALLBACK_RECOMMENDATIONS[painPoint];

  if (currentProblemId && painPoint && BROAD_PAIN_POINTS_SHOULD_STAY_CURRENT.has(painPoint)) {
    return currentProblemId;
  }

  if (painPointRecommendation) {
    return painPointRecommendation;
  }

  if ((ALLOWED_RECOMMENDATIONS as readonly string[]).includes(normalized)) {
    return normalized;
  }

  return currentProblemId ?? "P4913";
}

function normalizeRecommendationReason(reason: string, painPoint?: string, currentProblemId?: string): string {
  if (currentProblemId && painPoint && BROAD_PAIN_POINTS_SHOULD_STAY_CURRENT.has(painPoint)) {
    return "先留在当前题，把这个格式/读入问题用一个最小样例定位清楚，再进入下一题。";
  }

  if (painPoint && FALLBACK_RECOMMENDATION_REASONS[painPoint]) {
    return FALLBACK_RECOMMENDATION_REASONS[painPoint];
  }

  return reason;
}
