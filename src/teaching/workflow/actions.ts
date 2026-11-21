import { hasSubstantiveStudentCode, normalizeScoreOjVerdict } from "../solutionScoreGate";
import { applyTeachingDiagnosis } from "../studentProfile";
import {
  applyStudentSkillPatch,
  studentSkillSummaryForTeaching
} from "../studentSkill";
import { runTeachingCycleWithStudentSkill } from "../teachingCycle";
import {
  auditCoachFollowUpContext,
  auditLessonReportContext,
  auditOptimizationReviewContext,
  auditSolutionScoreContext,
  auditSubmissionJudgeContext,
  auditTeachingDiagnosisContext
} from "./contextBundle";
import {
  buildStudentSkillPatchFromLessonReport,
  buildStudentSkillPatchFromOptimization,
  buildStudentSkillPatchFromSolutionScore,
  describeCoachActionPurpose,
  enforceFollowUpBoundary,
  enforcePedagogicalHintBoundary,
  optimizationPainPoints,
  optimizationSkillUpdate,
  resolveHintLadderStage
} from "./pedagogyPolicy";
import { coachDiagnosisActionToAttemptKind } from "./reducer";
import type {
  CoachDiagnosisWorkflowInput,
  CoachDiagnosisWorkflowResult,
  CoachFollowUpWorkflowInput,
  CoachFollowUpWorkflowResult,
  LessonReportWorkflowInput,
  LessonReportWorkflowResult,
  OptimizationReviewWorkflowInput,
  OptimizationReviewWorkflowResult,
  SolutionScoreWorkflowInput,
  SolutionScoreWorkflowResult,
  SubmissionJudgeWorkflowInput,
  SubmissionJudgeWorkflowResult
} from "./schema";

export async function runCoachDiagnosisWorkflow(
  input: CoachDiagnosisWorkflowInput
): Promise<CoachDiagnosisWorkflowResult> {
  const hintStage = resolveHintLadderStage({
    action: input.action,
    hintCount: input.hintCount
  });
  let spoilerRedacted = false;

  const cycle = await runTeachingCycleWithStudentSkill(
    input.context,
    input.profile,
    input.studentSkill,
    async (context) => {
      const rawReport = await input.diagnose(context);
      const bounded = enforcePedagogicalHintBoundary(
        rawReport,
        hintStage,
        input.responseLanguage ?? "zh"
      );
      spoilerRedacted = bounded.spoilerRedacted;
      return bounded.report;
    },
    {
      occurredAt: input.occurredAt,
      patchSource: input.patchSource
    }
  );

  const kind = coachDiagnosisActionToAttemptKind(input.action);
  const studentTurnText =
    input.studentRequest?.trim() ||
    describeCoachActionPurpose(input.action, input.responseLanguage ?? "zh", {
      hintCount: input.hintCount
    });

  return {
    report: cycle.report,
    hintStage,
    spoilerRedacted,
    updatedProfile: cycle.updatedProfile,
    updatedStudentSkill: cycle.updatedStudentSkill,
    studentSkillMerge: cycle.studentSkillMerge,
    attemptEventInput: {
      problemKey: input.problemKey,
      problemId: input.context.problem.id,
      platform: input.platform,
      kind,
      occurredAt: input.occurredAt,
      action: input.action,
      painPoints: cycle.report.painPoints.map((painPoint) => painPoint.label),
      model: input.patchSource
    },
    coachThreadTurns: [
      {
        role: "student",
        kind,
        text: studentTurnText,
        occurredAt: input.occurredAt
      },
      {
        role: "assistant",
        kind,
        text: compactMultiline([
          cycle.report.hint,
          cycle.report.specificHint,
          cycle.report.checkpoint
        ]),
        occurredAt: input.occurredAt,
        model: input.patchSource
      }
    ],
    audit: auditTeachingDiagnosisContext(input.action, input.context)
  };
}

export async function runCoachFollowUpWorkflow(
  input: CoachFollowUpWorkflowInput
): Promise<CoachFollowUpWorkflowResult> {
  const hintStage = resolveHintLadderStage({
    action: "followUp",
    hintCount: input.hintCount
  });
  const rawReport = await input.followUp(input.context);
  const bounded = enforceFollowUpBoundary(rawReport, input.responseLanguage ?? "zh");
  const requestText =
    input.context.studentRequest.trim() || "请把上一条提示讲得更详细但更容易懂。";

  return {
    report: bounded.report,
    hintStage,
    spoilerRedacted: bounded.spoilerRedacted,
    studentSkill: input.studentSkill,
    attemptEventInput: {
      problemKey: input.problemKey,
      problemId: input.context.problem.id,
      platform: input.platform,
      kind: "follow_up_requested",
      occurredAt: input.occurredAt,
      action: "followUp",
      painPoints: [],
      model: input.model
    },
    coachThreadTurns: [
      {
        role: "student",
        kind: "follow_up_requested",
        text: requestText,
        occurredAt: input.occurredAt
      },
      {
        role: "assistant",
        kind: "follow_up_requested",
        text: compactMultiline([
          bounded.report.answer,
          bounded.report.tinyExample,
          bounded.report.nextAction
        ]),
        occurredAt: input.occurredAt,
        model: input.model
      }
    ],
    audit: auditCoachFollowUpContext(input.context)
  };
}

export async function runLessonReportWorkflow(
  input: LessonReportWorkflowInput
): Promise<LessonReportWorkflowResult> {
  const report = await input.generateLesson(input.context);
  const updatedProfile = applyTeachingDiagnosis(
    input.profile,
    {
      painPoints: report.painPoints,
      hint: report.minimalFixPath[0] ?? report.standardApproach,
      recommendation: report.remedialExercise.problemId
        ? {
            problemId: report.remedialExercise.problemId,
            reason: report.remedialExercise.reason
          }
        : undefined
    },
    input.occurredAt
  );
  const studentSkillMerge = applyStudentSkillPatch(
    input.studentSkill,
    buildStudentSkillPatchFromLessonReport(report, {
      source: input.patchSource,
      occurredAt: input.occurredAt,
      problemId: input.context.problem.id,
      topic: input.context.problem.summary
    })
  );

  return {
    report,
    hintStage: "level-4-lesson",
    updatedProfile,
    updatedStudentSkill: studentSkillMerge.skill,
    studentSkillMerge,
    attemptEventInput: {
      problemKey: input.problemKey,
      problemId: input.context.problem.id,
      platform: input.platform,
      kind: "lesson_reported",
      outcome: report.archiveReason,
      occurredAt: input.occurredAt,
      painPoints: report.painPoints.map((painPoint) => painPoint.label),
      model: input.patchSource
    },
    coachThreadTurns: [
      {
        role: "student",
        kind: "lesson_reported",
        text: input.context.studentRequest?.trim() || "我放弃了，需要讲解/补救。",
        occurredAt: input.occurredAt
      },
      {
        role: "assistant",
        kind: "lesson_reported",
        text: compactMultiline([report.standardApproach, ...report.minimalFixPath]),
        occurredAt: input.occurredAt,
        model: input.patchSource
      }
    ],
    audit: auditLessonReportContext(report, input.hasTeacherPack)
  };
}

export async function runSolutionScoreWorkflow(
  input: SolutionScoreWorkflowInput
): Promise<SolutionScoreWorkflowResult> {
  if (!hasSubstantiveStudentCode(input.studentCode)) {
    throw new Error(
      "当前学生代码看起来还是模板或空 pass，不能做学习评分。先写一点真实代码；如果已经卡住，请用“给点提示”或“我放弃了”。"
    );
  }

  const safeOjVerdict = normalizeScoreOjVerdict(input.ojVerdict);
  const rawReport = await input.scoreSolution({
    problem: input.problem,
    language: input.language,
    studentCode: input.studentCode,
    studentProfile: studentSkillSummaryForTeaching(input.studentSkill),
    ojVerdict: safeOjVerdict,
    attemptStats: input.attemptStats,
    studentRequest: input.studentRequest
  });
  const report = {
    ...rawReport,
    ojResult: safeOjVerdict.status
  };

  const updatedProfile = applyTeachingDiagnosis(
    input.profile,
    {
      painPoints: report.painPoints,
      hint: report.nextAction,
      recommendation: report.recommendation
    },
    input.occurredAt
  );
  const studentSkillMerge = applyStudentSkillPatch(
    input.studentSkill,
    buildStudentSkillPatchFromSolutionScore(
      report,
      input.attemptStats,
      input.studentSkill,
      {
        source: input.patchSource,
        occurredAt: input.occurredAt,
        problemId: input.problem.id,
        topic: input.problem.summary
      }
    )
  );

  const isArchivedReview = Boolean(input.isArchivedReview);
  const isCompletionReview = Boolean(input.isCompletionReview);
  const shouldArchive = (safeOjVerdict.status === "AC" || isCompletionReview) && !isArchivedReview;

  return {
    report,
    shouldArchive,
    updatedProfile,
    updatedStudentSkill: studentSkillMerge.skill,
    studentSkillMerge,
    attemptEventInput: {
      problemKey: input.problemKey,
      problemId: input.problem.id,
      platform: input.platform,
      kind: "solution_scored",
      outcome:
        isArchivedReview || isCompletionReview
          ? "completed"
          : report.ojResult === "AC"
            ? "ac"
            : "active",
      ojStatus: report.ojResult,
      learningScore: report.learningScore,
      occurredAt: input.occurredAt,
      painPoints: report.painPoints.map((painPoint) => painPoint.label),
      model: input.patchSource,
      note: isCompletionReview ? "completion_review" : isArchivedReview ? "archived_review" : undefined
    },
    coachThreadTurns: [
      {
        role: "student",
        kind: "solution_scored",
        text:
          input.studentRequest?.trim() ||
          (isCompletionReview ? "我已完成，进行复盘。" : "请做学习评分。"),
        occurredAt: input.occurredAt
      },
      {
        role: "assistant",
        kind: "solution_scored",
        text: compactMultiline([
          report.summary,
          report.nextAction,
          report.complexityAssessment.reason
        ]),
        occurredAt: input.occurredAt,
        model: input.patchSource
      }
    ],
    audit: auditSolutionScoreContext(isCompletionReview ? "completion_review" : "solution_score")
  };
}

export async function runOptimizationReviewWorkflow(
  input: OptimizationReviewWorkflowInput
): Promise<OptimizationReviewWorkflowResult> {
  if (!hasSubstantiveStudentCode(input.studentCode)) {
    throw new Error("当前学生代码看起来还是模板或空 pass，不能做优化复盘。先打开真实作答代码。");
  }

  const report = await input.reviewOptimization({
    problem: input.problem,
    language: input.language,
    studentCode: input.studentCode,
    archivedReason: input.archivedReason,
    previousScoreSummary: input.previousScoreSummary,
    studentProfile: studentSkillSummaryForTeaching(input.studentSkill),
    studentRequest: input.studentRequest
  });

  const painPoints = optimizationPainPoints(report);
  const updatedProfile =
    painPoints.length > 0
      ? applyTeachingDiagnosis(
          input.profile,
          {
            painPoints,
            hint: report.nextStep,
            skillUpdate: optimizationSkillUpdate(report)
          },
          input.occurredAt
        )
      : input.profile;

  const skillPatch = buildStudentSkillPatchFromOptimization(report, {
    source: input.patchSource,
    occurredAt: input.occurredAt,
    problemId: input.problem.id,
    topic: input.problem.summary
  });
  const studentSkillMerge = skillPatch
    ? applyStudentSkillPatch(input.studentSkill, skillPatch)
    : undefined;

  return {
    report,
    painPoints,
    updatedProfile,
    updatedStudentSkill: studentSkillMerge ? studentSkillMerge.skill : input.studentSkill,
    studentSkillMerge,
    attemptEventInput: {
      problemKey: input.problemKey,
      problemId: input.problem.id,
      platform: input.platform,
      kind: "optimization_reviewed",
      outcome: input.archivedReason as "completed" | "abandoned" | "revealed" | "removed",
      occurredAt: input.occurredAt,
      painPoints: painPoints.map((painPoint) => painPoint.label),
      model: input.patchSource,
      note: report.verdict
    },
    coachThreadTurns: [
      {
        role: "student",
        kind: "optimization_reviewed",
        text: input.studentRequest?.trim() || "请复盘这道已归档题是否还需要优化。",
        occurredAt: input.occurredAt
      },
      {
        role: "assistant",
        kind: "optimization_reviewed",
        text: compactMultiline([report.summary, report.nextStep, report.verdict]),
        occurredAt: input.occurredAt,
        model: input.patchSource
      }
    ],
    audit: auditOptimizationReviewContext()
  };
}

export async function runSubmissionJudgeWorkflow(
  input: SubmissionJudgeWorkflowInput
): Promise<SubmissionJudgeWorkflowResult> {
  const report = await input.judgeSubmission(input.context);

  return {
    report,
    reviewStage: input.reviewStage,
    isEstimateOnly: true,
    audit: auditSubmissionJudgeContext(input.reviewStage)
  };
}

function compactMultiline(values: Array<string | undefined>): string {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n");
}
