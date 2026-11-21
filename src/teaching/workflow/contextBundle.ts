import type { CoachFollowUpContext } from "../coachFollowUp";
import type { LessonReport } from "../lessonReport";
import type { TeachingDiagnosisContext } from "../types";
import { buildTeachingWorkflowAudit } from "./audit";

export function auditTeachingDiagnosisContext(action: string, context: TeachingDiagnosisContext) {
  return buildTeachingWorkflowAudit({
    action,
    included: [
      "problem.summary",
      "student_code",
      "student_profile",
      "oj_verdict",
      context.teacherPack ? "teacher_pack_reference" : "",
      context.localEvidence.length > 0 ? "local_evidence" : ""
    ],
    excluded: [
      "standard_answer",
      "full_teacher_pack",
      "autocomplete_prompt",
      "raw_internal_test_records"
    ]
  });
}

export function auditCoachFollowUpContext(context: CoachFollowUpContext) {
  return buildTeachingWorkflowAudit({
    action: "follow_up",
    included: [
      "problem_statement",
      "student_code",
      "student_profile",
      context.previousCoachTurn?.trim() ? "recent_hints" : "",
      context.teacherPack ? "teacher_pack_reference" : ""
    ],
    excluded: [
      "standard_answer",
      "autocomplete_prompt",
      "student_skill_mutation",
      "raw_internal_test_records"
    ]
  });
}

export function auditLessonReportContext(report: LessonReport, hasTeacherPack = false) {
  return buildTeachingWorkflowAudit({
    action: "lesson_report",
    included: [
      "problem_statement",
      "student_code",
      "student_profile",
      hasTeacherPack ? "teacher_pack_reference" : ""
    ],
    excluded: [
      report.referenceSolution?.code ? "standard_answer_auto_reveal" : "standard_answer",
      "autocomplete_prompt",
      "raw_internal_test_records"
    ]
  });
}

export function auditSolutionScoreContext(action: "solution_score" | "completion_review") {
  return buildTeachingWorkflowAudit({
    action,
    included: [
      "problem_statement",
      "student_code",
      "attempt_stats",
      "oj_verdict",
      "student_profile"
    ],
    excluded: [
      "standard_answer",
      "autocomplete_prompt",
      "raw_internal_test_records"
    ]
  });
}

export function auditOptimizationReviewContext() {
  return buildTeachingWorkflowAudit({
    action: "optimization_review",
    included: [
      "problem_statement",
      "student_code",
      "archived_reason",
      "previous_score_summary",
      "student_profile"
    ],
    excluded: [
      "standard_answer",
      "autocomplete_prompt",
      "raw_internal_test_records"
    ]
  });
}

export function auditSubmissionJudgeContext(reviewStage: "active" | "archived") {
  return buildTeachingWorkflowAudit({
    action: `submission_judge_${reviewStage}`,
    included: [
      "problem_statement",
      "student_code",
      "student_profile"
    ],
    excluded: [
      "official_oj_verdict",
      "standard_answer",
      "autocomplete_prompt",
      "student_skill_mutation",
      "raw_internal_test_records"
    ]
  });
}
