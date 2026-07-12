import type { TeachingDiagnosisReport } from "../teaching/teachingReport";

export interface LocalizedTeachingPainPoint {
  label: string;
  displayLabel: string;
  confidence: number;
  evidence: string;
}

export interface LocalizedTeachingDiagnosisReport {
  hintTitle: string;
  specificHintTitle: string;
  checkpointTitle: string;
  microStepsTitle: string;
  painTitle: string;
  evidenceTitle: string;
  skillTitle: string;
  recommendationTitle: string;
  rawHint: string;
  rawSpecificHint?: string;
  rawCheckpoint?: string;
  microSteps?: string[];
  painPoints: LocalizedTeachingPainPoint[];
  skillUpdate?: TeachingDiagnosisReport["skillUpdate"];
  recommendation?: TeachingDiagnosisReport["recommendation"];
}

const painPointLabels: Record<string, string> = {
  traversal_order_confusion: "遍历顺序混淆",
  output_format: "输出格式",
  output_order: "输出顺序",
  loop_boundary: "循环边界",
  recursion_base_case: "递归出口",
  depth_definition: "深度定义",
  subtree_boundary: "子树边界",
  input_parsing: "输入解析",
  sentinel_input: "哨兵输入",
  distance_formula: "公式建模",
  duplicate_handling: "重复值处理",
  rank_query_semantics: "排名查询语义",
  time_complexity_mismatch: "时间复杂度不匹配",
  complexity_gap: "复杂度差距",
  bruteforce_no_growth: "暴力解法迁移不足",
  array_indexing: "数组下标"
};

export function localizeTeachingDiagnosisReport(report: TeachingDiagnosisReport): LocalizedTeachingDiagnosisReport {
  return {
    hintTitle: "下一步提示",
    specificHintTitle: "更具体的下一步",
    checkpointTitle: "自检点",
    microStepsTitle: "微步骤",
    painTitle: "痛点判断",
    evidenceTitle: "证据",
    skillTitle: "Skill 候选",
    recommendationTitle: "推荐下一题",
    rawHint: report.hint,
    rawSpecificHint: report.specificHint,
    rawCheckpoint: report.checkpoint,
    microSteps: report.microSteps,
    painPoints: report.painPoints.map((painPoint) => ({
      ...painPoint,
      displayLabel: painPointLabels[painPoint.label] ?? painPoint.label.replaceAll("_", " ")
    })),
    skillUpdate: report.skillUpdate,
    recommendation: report.recommendation
  };
}
