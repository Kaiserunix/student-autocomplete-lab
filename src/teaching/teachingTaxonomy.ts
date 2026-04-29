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
  "sentinel_input",
  "needs_teacher_review"
] as const;

export const ALLOWED_RECOMMENDATIONS = ["P1305", "P4913", "P1030", "P1364"] as const;

const PAIN_POINT_ALIASES: Record<string, string> = {
  incorrect_preorder_concatenation: "traversal_order_confusion",
  preorder_postorder_confusion: "traversal_order_confusion",
  wrong_traversal_order: "traversal_order_confusion",
  postorder_instead_of_preorder: "traversal_order_confusion",
  wrong_root_source: "root_identification",
  wrong_subtree_slice: "subtree_boundary"
};

const SKILL_ALIASES: Record<string, string> = {
  tree_traversal_order: "binary-tree-traversal-reconstruction",
  tree_traversal_reconstruction: "binary-tree-traversal-reconstruction",
  binary_tree_traversal_reconstruction: "binary-tree-traversal-reconstruction",
  binary_tree_depth_numbered_children: "binary-tree-depth-numbered-children",
  tree_weighted_distance: "tree-weighted-distance"
};

const FALLBACK_RECOMMENDATIONS: Record<string, string> = {
  traversal_order_confusion: "P1305",
  root_identification: "P1030",
  subtree_boundary: "P1030",
  depth_definition: "P4913",
  child_indexing: "P4913",
  recursion_base_case: "P4913",
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
  tree_distance: "Practice edge-count distance on a weighted tree.",
  weighted_cost: "Practice multiplying distance by each node weight.",
  undirected_tree_edges: "Practice converting child links into undirected tree edges."
};

export function normalizeTeachingDiagnosisReport(report: TeachingDiagnosisReport): TeachingDiagnosisReport {
  const painPoints = report.painPoints.map((painPoint) => ({
    ...painPoint,
    label: normalizePainPointLabel(painPoint.label)
  }));
  const topPainPoint = painPoints[0]?.label;
  const recommendation = report.recommendation
    ? {
        ...report.recommendation,
        problemId: normalizeRecommendation(report.recommendation.problemId, topPainPoint),
        reason: normalizeRecommendationReason(report.recommendation.reason, topPainPoint)
      }
    : undefined;

  return {
    ...report,
    painPoints,
    skillUpdate: report.skillUpdate
      ? {
          ...report.skillUpdate,
          candidate: normalizeSkillCandidate(report.skillUpdate.candidate)
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

function normalizeSkillCandidate(candidate: string): string {
  const normalized = candidate.trim().toLowerCase().replace(/[-\s]+/g, "_");
  return SKILL_ALIASES[normalized] ?? candidate.trim();
}

function normalizeRecommendation(problemId: string, painPoint?: string): string {
  const normalized = problemId.trim().toUpperCase();
  const painPointRecommendation = painPoint && FALLBACK_RECOMMENDATIONS[painPoint];

  if (painPointRecommendation) {
    return painPointRecommendation;
  }

  if ((ALLOWED_RECOMMENDATIONS as readonly string[]).includes(normalized)) {
    return normalized;
  }

  return "P4913";
}

function normalizeRecommendationReason(reason: string, painPoint?: string): string {
  if (painPoint && FALLBACK_RECOMMENDATION_REASONS[painPoint]) {
    return FALLBACK_RECOMMENDATION_REASONS[painPoint];
  }

  return reason;
}
