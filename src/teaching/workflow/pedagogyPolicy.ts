import type { CoachThreadTurn } from "../../attempt/schema";
import type { CoachFollowUpReport } from "../coachFollowUp";
import type { LessonReport } from "../lessonReport";
import type { OptimizationReport } from "../optimizationReport";
import type { SolutionAttemptStats, SolutionScoreReport } from "../solutionScore";
import type {
  StudentSkill,
  StudentSkillPatch,
  StudentSkillPatchMeta,
  StudentSkillTransferPatch
} from "../studentSkill";
import { isStudentSkillDisabled } from "../studentSkillLifecycle";
import type { TeachingDiagnosisReport, TeachingPainPoint } from "../teachingReport";

export type CoachPedagogyAction = "hint" | "specific" | "followUp" | "giveUp" | "recommend";
export type CoachPedagogyLanguage = "zh" | "en" | "raw";
export type HintLadderStage =
  | "level-1-nudge"
  | "level-2-concrete"
  | "level-3-guided-repair"
  | "level-4-lesson";

const FENCED_CODE_BLOCK_PATTERN = /```[\w+-]*\r?\n([\s\S]*?)```/g;
const FULL_SOLUTION_SIGNATURE_PATTERN =
  /\b(int\s+main\s*\(|void\s+solve\s*\(|def\s+solve\s*\(|fn\s+main\s*\(|if\s+__name__\s*==\s*["']__main__["'])/i;

const PAIN_POINT_DEFAULT_SKILL: Record<string, string> = {
  loop_boundary: "python-loop-boundary-check",
  traversal_order_confusion: "binary-tree-traversal-reconstruction",
  root_identification: "binary-tree-traversal-reconstruction",
  subtree_boundary: "binary-tree-traversal-reconstruction",
  depth_definition: "binary-tree-depth-numbered-children",
  recursion_base_case: "recursion-base-case-pattern",
  duplicate_handling: "ordered-multiset-semantics",
  branch_condition_coverage: "branch-coverage-checklist",
  high_precision_carry_order: "high-precision-carry-order",
  greedy_choice_model: "greedy-exchange-check",
  binary_search_invariant: "binary-search-boundary-invariant",
  time_complexity_mismatch: "complexity-upgrade-from-bruteforce",
  bruteforce_no_growth: "complexity-upgrade-from-bruteforce",
  search_state_pruning: "search-visited-and-pruning-guard",
  disjoint_set_union_semantics: "disjoint-set-connectivity-model",
  graph_adjacency_model: "graph-bidirectional-adjacency-check"
};

export function resolveHintLadderStage(input: {
  action: CoachPedagogyAction;
  hintCount?: number;
}): HintLadderStage {
  const hintCount = Math.max(0, Math.floor(input.hintCount ?? 0));

  if (input.action === "giveUp") {
    return "level-4-lesson";
  }

  if (input.action === "specific") {
    return hintCount >= 2 ? "level-3-guided-repair" : "level-2-concrete";
  }

  if (input.action === "followUp") {
    return hintCount >= 2 ? "level-3-guided-repair" : "level-2-concrete";
  }

  return hintCount >= 1 ? "level-2-concrete" : "level-1-nudge";
}

export function describeCoachActionPurpose(
  action: CoachPedagogyAction,
  responseLanguage: CoachPedagogyLanguage = "zh",
  options: { hintCount?: number } = {}
): string {
  const languageInstruction =
    responseLanguage === "zh"
      ? "输出语言：简体中文。"
      : responseLanguage === "en"
        ? "Output language: English."
        : "输出语言：保留模型原文。";
  const stage = resolveHintLadderStage({ action, hintCount: options.hintCount });

  if (action === "specific") {
    const stageNote =
      stage === "level-3-guided-repair"
        ? "当前处于第 3 级引导修复阶段：明确指出需要局部检查的代码区域与不变量，但仍禁止直接给完整解法。"
        : "";
    return [
      "学生点击「再具体点」：上一条提示不够具体，但不要变成完整讲解。",
      "请沿同一个主痛点继续收窄，优先填写 specific_hint。",
      "指出当前代码里的具体变量、循环、条件、return 或输出表达式；回答控制在 2-3 个短句。",
      "不要切换到完整解法，不要粘完整 AC 代码。",
      stageNote,
      languageInstruction
    ].join("");
  }

  if (action === "followUp") {
    return [
      "学生点击「追问 AI」：这是基于上一轮 AI 回复的继续追问。",
      "追问可以详细回答，但必须讲给新手听：先回答学生额外输入里的具体问题，再用小例子或小步骤解释。",
      "如果学生觉得太难，要少用术语；必须使用术语时，立刻用白话解释。",
      "仍然不要粘完整 AC 代码。",
      languageInstruction
    ].join("");
  }

  if (action === "giveUp") {
    return `学生点击「我放弃了」：先给标准思路轮廓，再指出学生代码痛点和下一次要练的技能，不要生成完整可提交代码。${languageInstruction}`;
  }

  if (action === "recommend") {
    return `学生点击「推荐下一题」：重点根据历史痛点和当前代码推荐下一道题。${languageInstruction}`;
  }

  const stageNote =
    stage === "level-2-concrete"
      ? "学生此前已请求过提示，可结合一个最小反例或具体条件帮其定位，但仍保持简短。"
      : "";
  return [
    "学生点击「简单提示」：给一个很短、可执行但不泄题的基础提示。",
    "只写 1-2 个短句，包含观察到的症状、当前代码锚点、下一步要改的小范围。",
    "不要只说“检查边界/注意输入输出/再读题”。",
    stageNote,
    languageInstruction
  ].join("");
}

export function summarizeSessionCoachThread(
  turns: readonly CoachThreadTurn[] | undefined,
  maxTurns = 4
): string {
  if (!turns || turns.length === 0 || maxTurns <= 0) {
    return "";
  }

  return turns
    .slice(-maxTurns)
    .map((turn) => {
      const roleLabel =
        turn.role === "student" ? "学生" : turn.role === "assistant" ? "教练" : "系统";
      return `[${roleLabel}] ${turn.text.replace(/\s+/g, " ").trim()}`;
    })
    .filter((line) => line.length > 4)
    .join("\n");
}

export function mergeCoachRequestPurpose(
  basePurpose: string,
  studentRequest?: string,
  previousCoachTurn?: string,
  sessionTurns?: readonly CoachThreadTurn[]
): string {
  const trimmedRequest = studentRequest?.trim();
  const trimmedPrevious =
    previousCoachTurn?.trim() || summarizeSessionCoachThread(sessionTurns);
  const parts = [basePurpose];

  if (trimmedPrevious) {
    parts.push(`上一轮 AI 回复摘要：\n${trimmedPrevious}`);
  }
  if (trimmedRequest) {
    parts.push(`学生额外输入：${trimmedRequest}`);
  }

  return parts.join("\n");
}

export function enforcePedagogicalHintBoundary(
  report: TeachingDiagnosisReport,
  stage: HintLadderStage,
  responseLanguage: CoachPedagogyLanguage = "zh"
): { report: TeachingDiagnosisReport; spoilerRedacted: boolean } {
  if (stage === "level-4-lesson") {
    return { report, spoilerRedacted: false };
  }

  const hintSanitized = redactLeakedSolutionBlocks(report.hint, responseLanguage);
  const specificSanitized = report.specificHint
    ? redactLeakedSolutionBlocks(report.specificHint, responseLanguage)
    : undefined;
  const checkpointSanitized = report.checkpoint
    ? redactLeakedSolutionBlocks(report.checkpoint, responseLanguage)
    : undefined;
  const microSteps =
    stage === "level-1-nudge" && report.microSteps && report.microSteps.length > 2
      ? report.microSteps.slice(0, 2)
      : report.microSteps;

  const spoilerRedacted = Boolean(
    hintSanitized.redacted ||
      specificSanitized?.redacted ||
      checkpointSanitized?.redacted
  );

  if (!spoilerRedacted && microSteps === report.microSteps) {
    return { report, spoilerRedacted: false };
  }

  return {
    report: {
      ...report,
      hint: hintSanitized.text,
      specificHint: specificSanitized?.text,
      checkpoint: checkpointSanitized?.text,
      microSteps
    },
    spoilerRedacted
  };
}

export function enforceFollowUpBoundary(
  report: CoachFollowUpReport,
  responseLanguage: CoachPedagogyLanguage = "zh"
): { report: CoachFollowUpReport; spoilerRedacted: boolean } {
  const answerSanitized = redactLeakedSolutionBlocks(report.answer, responseLanguage);
  const exampleSanitized = report.tinyExample
    ? redactLeakedSolutionBlocks(report.tinyExample, responseLanguage)
    : undefined;
  const spoilerRedacted = Boolean(answerSanitized.redacted || exampleSanitized?.redacted);

  if (!spoilerRedacted) {
    return { report, spoilerRedacted: false };
  }

  return {
    report: {
      ...report,
      answer: answerSanitized.text,
      tinyExample: exampleSanitized?.text
    },
    spoilerRedacted
  };
}

export function buildStudentSkillPatchFromLessonReport(
  report: LessonReport,
  meta: StudentSkillPatchMeta
): StudentSkillPatch {
  const primaryPainPoint = report.painPoints[0]?.label;
  const candidateName = primaryPainPoint
    ? PAIN_POINT_DEFAULT_SKILL[primaryPainPoint] ?? `remediate-${primaryPainPoint.replace(/_/g, "-")}`
    : undefined;

  return {
    ...meta,
    painPoints: report.painPoints.map((painPoint) => ({
      label: painPoint.label,
      confidence: painPoint.confidence,
      evidence: painPoint.evidence
    })),
    skills: candidateName
      ? [
          {
            name: candidateName,
            reason: report.remedialExercise.reason || report.standardApproach,
            rules: report.minimalFixPath.slice(0, 2),
            sourcePainPoints: report.painPoints.map((painPoint) => painPoint.label),
            confidence: report.painPoints.reduce((sum, item) => sum + item.confidence, 0)
          }
        ]
      : undefined,
    teachingPreferenceNotes: [
      `lesson_${report.archiveReason}: ${report.remedialExercise.title}`
    ]
  };
}

export function buildStudentSkillPatchFromSolutionScore(
  report: SolutionScoreReport,
  attemptStats: SolutionAttemptStats,
  existingSkill: StudentSkill,
  meta: StudentSkillPatchMeta
): StudentSkillPatch {
  const currentPainLabels = new Set(report.painPoints.map((painPoint) => painPoint.label));
  const complexityNeedsUpgrade =
    report.complexityAssessment.verdict === "complexity_gap" ||
    currentPainLabels.has("bruteforce_no_growth") ||
    currentPainLabels.has("time_complexity_mismatch");

  const transferEvidence: StudentSkillTransferPatch[] = [];
  const lowHintIndependentSuccess =
    report.ojResult === "AC" &&
    !attemptStats.gaveUp &&
    !attemptStats.revealedAnswer &&
    !complexityNeedsUpgrade &&
    attemptStats.hintCount <= 1;

  if (lowHintIndependentSuccess) {
    for (const entry of Object.values(existingSkill.skills)) {
      if (isStudentSkillDisabled(entry.status)) {
        continue;
      }
      const avoidedPreviousPain =
        entry.sourcePainPoints.length > 0 &&
        entry.sourcePainPoints.every((label) => !currentPainLabels.has(label));
      if (avoidedPreviousPain) {
        transferEvidence.push({
          skillName: entry.name,
          probes: 1,
          passed: 1,
          estimatedHintReduction: attemptStats.hintCount === 0 ? 1 : 0.5
        });
      }
    }
  }

  return {
    ...meta,
    painPoints: report.painPoints.map((painPoint) => ({
      label: painPoint.label,
      confidence: painPoint.confidence,
      evidence: painPoint.evidence
    })),
    skills: complexityNeedsUpgrade
      ? [
          {
            name: "complexity-upgrade-from-bruteforce",
            reason: report.complexityAssessment.reason,
            rules: [
              "先写出当前时间复杂度和目标时间复杂度。",
              "只改一个核心循环或数据结构，不整题重写。"
            ],
            sourcePainPoints:
              report.painPoints.length > 0
                ? report.painPoints.map((painPoint) => painPoint.label)
                : ["time_complexity_mismatch"],
            confidence: 0.75
          }
        ]
      : undefined,
    transferEvidence: transferEvidence.length > 0 ? transferEvidence : undefined
  };
}

export function optimizationPainPoints(report: OptimizationReport): TeachingPainPoint[] {
  if (!report.optimizationNeeded) {
    return [];
  }

  const label = isBruteforceOptimization(report) ? "bruteforce_no_growth" : "time_complexity_mismatch";

  return [
    {
      label,
      confidence: 0.72,
      evidence: report.timeComplexity.action
    }
  ];
}

export function optimizationSkillUpdate(report: OptimizationReport):
  | {
      candidate: string;
      reason: string;
      rules: string[];
    }
  | undefined {
  if (!report.optimizationNeeded) {
    return undefined;
  }

  const bruteForceRelated = isBruteforceOptimization(report);
  return {
    candidate: bruteForceRelated ? "complexity-upgrade-from-bruteforce" : "post-ac-optimization-review",
    reason: bruteForceRelated
      ? "已归档题目的优化复盘显示：学生需要把通过样例或 AC 的暴力写法继续抽象成可迁移的复杂度模型。"
      : "已归档题目的优化复盘显示：学生需要在 AC 后判断复杂度、内存和代码质量是否真的值得继续投入。",
    rules: [
      "先写出当前时间复杂度和目标时间复杂度。",
      "只改一个核心循环或数据结构，不整题重写。",
      "简单题若已匹配训练目标，应明确跳过优化，进入下一题。"
    ]
  };
}

export function buildStudentSkillPatchFromOptimization(
  report: OptimizationReport,
  meta: StudentSkillPatchMeta
): StudentSkillPatch | undefined {
  const painPoints = optimizationPainPoints(report);
  const skillUpdate = optimizationSkillUpdate(report);
  if (painPoints.length === 0 && !skillUpdate) {
    return undefined;
  }

  return {
    ...meta,
    painPoints: painPoints.map((painPoint) => ({
      label: painPoint.label,
      confidence: painPoint.confidence,
      evidence: painPoint.evidence
    })),
    skills: skillUpdate
      ? [
          {
            name: skillUpdate.candidate,
            reason: skillUpdate.reason,
            rules: skillUpdate.rules,
            sourcePainPoints: painPoints.map((painPoint) => painPoint.label),
            confidence: 0.72
          }
        ]
      : undefined
  };
}

export function isBruteforceOptimization(report: OptimizationReport): boolean {
  return /暴力|枚举|brute|bruteforce|双重|三重/i.test(
    [report.summary, report.timeComplexity.current, report.timeComplexity.target, report.timeComplexity.action].join(" ")
  );
}

function redactLeakedSolutionBlocks(
  text: string,
  responseLanguage: CoachPedagogyLanguage
): { text: string; redacted: boolean } {
  let redacted = false;
  const placeholder =
    responseLanguage === "en"
      ? "[Full solution code omitted during hint mode; focus on the local code anchor above.]"
      : "[提示阶段已折叠多行实现代码；请先按上方锚点尝试修改，若需参考实现可点击「我卡住了」。]";

  const sanitized = text.replace(FENCED_CODE_BLOCK_PATTERN, (fullMatch, codeBody: string) => {
    const nonEmptyLines = codeBody
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (nonEmptyLines.length >= 4 || FULL_SOLUTION_SIGNATURE_PATTERN.test(codeBody)) {
      redacted = true;
      return placeholder;
    }
    return fullMatch;
  });

  return {
    text: sanitized,
    redacted
  };
}
