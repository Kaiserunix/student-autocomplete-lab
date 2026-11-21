import type { CoachThreadTurn } from "../../attempt/schema";
import type { AttemptEventInput } from "../attemptEvent";
import type { CoachFollowUpContext, CoachFollowUpReport } from "../coachFollowUp";
import type { LessonReport, LessonReportContext } from "../lessonReport";
import type { OptimizationReport, OptimizationReportContext } from "../optimizationReport";
import type { SolutionAttemptStats, SolutionScoreContext, SolutionScoreReport } from "../solutionScore";
import type { StudentProfile } from "../studentProfile";
import type { StudentSkill, StudentSkillMergeResult } from "../studentSkill";
import type { SubmissionJudgeContext, SubmissionJudgeReport } from "../submissionJudge";
import type { TeachingDiagnosisReport } from "../teachingReport";
import type { OjVerdict, TeachingDiagnosisContext, TeachingProblemContext } from "../types";
import type { CoachPedagogyLanguage, HintLadderStage } from "./pedagogyPolicy";

export type CoachDiagnosisWorkflowAction = "hint" | "specific";

export interface TeachingWorkflowAudit {
  action: string;
  included: string[];
  excluded: string[];
}

export interface CoachDiagnosisWorkflowInput {
  action: CoachDiagnosisWorkflowAction;
  problemKey: string;
  platform: string;
  context: TeachingDiagnosisContext;
  profile: StudentProfile;
  studentSkill: StudentSkill;
  occurredAt: string;
  patchSource: string;
  hintCount?: number;
  studentRequest?: string;
  responseLanguage?: CoachPedagogyLanguage;
  diagnose: (context: TeachingDiagnosisContext) => Promise<TeachingDiagnosisReport>;
}

export interface CoachDiagnosisWorkflowResult {
  report: TeachingDiagnosisReport;
  hintStage: HintLadderStage;
  spoilerRedacted: boolean;
  updatedProfile: StudentProfile;
  updatedStudentSkill: StudentSkill;
  studentSkillMerge: StudentSkillMergeResult;
  attemptEventInput: AttemptEventInput;
  coachThreadTurns: CoachThreadTurn[];
  audit: TeachingWorkflowAudit;
}

export interface CoachFollowUpWorkflowInput {
  problemKey: string;
  platform: string;
  context: CoachFollowUpContext;
  studentSkill: StudentSkill;
  occurredAt: string;
  model: string;
  hintCount?: number;
  responseLanguage?: CoachPedagogyLanguage;
  followUp: (context: CoachFollowUpContext) => Promise<CoachFollowUpReport>;
}

export interface CoachFollowUpWorkflowResult {
  report: CoachFollowUpReport;
  hintStage: HintLadderStage;
  spoilerRedacted: boolean;
  studentSkill: StudentSkill;
  attemptEventInput: AttemptEventInput;
  coachThreadTurns: CoachThreadTurn[];
  audit: TeachingWorkflowAudit;
}

export interface LessonReportWorkflowInput {
  problemKey: string;
  platform: string;
  context: LessonReportContext;
  profile: StudentProfile;
  studentSkill: StudentSkill;
  occurredAt: string;
  patchSource: string;
  hasTeacherPack?: boolean;
  generateLesson: (context: LessonReportContext) => Promise<LessonReport>;
}

export interface LessonReportWorkflowResult {
  report: LessonReport;
  hintStage: "level-4-lesson";
  updatedProfile: StudentProfile;
  updatedStudentSkill: StudentSkill;
  studentSkillMerge: StudentSkillMergeResult;
  attemptEventInput: AttemptEventInput;
  coachThreadTurns: CoachThreadTurn[];
  audit: TeachingWorkflowAudit;
}

export interface SolutionScoreWorkflowInput {
  problemKey: string;
  platform: string;
  problem: TeachingProblemContext;
  language: string;
  studentCode: string;
  ojVerdict?: OjVerdict;
  attemptStats: SolutionAttemptStats;
  studentRequest?: string;
  isArchivedReview?: boolean;
  isCompletionReview?: boolean;
  profile: StudentProfile;
  studentSkill: StudentSkill;
  occurredAt: string;
  patchSource: string;
  scoreSolution: (context: SolutionScoreContext) => Promise<SolutionScoreReport>;
}

export interface SolutionScoreWorkflowResult {
  report: SolutionScoreReport;
  shouldArchive: boolean;
  updatedProfile: StudentProfile;
  updatedStudentSkill: StudentSkill;
  studentSkillMerge: StudentSkillMergeResult;
  attemptEventInput: AttemptEventInput;
  coachThreadTurns: CoachThreadTurn[];
  audit: TeachingWorkflowAudit;
}

export interface OptimizationReviewWorkflowInput {
  problemKey: string;
  platform: string;
  problem: TeachingProblemContext;
  language: string;
  studentCode: string;
  archivedReason: string;
  previousScoreSummary?: string;
  studentRequest?: string;
  profile: StudentProfile;
  studentSkill: StudentSkill;
  occurredAt: string;
  patchSource: string;
  reviewOptimization: (context: OptimizationReportContext) => Promise<OptimizationReport>;
}

export interface OptimizationReviewWorkflowResult {
  report: OptimizationReport;
  painPoints: TeachingDiagnosisReport["painPoints"];
  updatedProfile: StudentProfile;
  updatedStudentSkill: StudentSkill;
  studentSkillMerge?: StudentSkillMergeResult;
  attemptEventInput: AttemptEventInput;
  coachThreadTurns: CoachThreadTurn[];
  audit: TeachingWorkflowAudit;
}

export interface SubmissionJudgeWorkflowInput {
  problemKey: string;
  platform: string;
  reviewStage: "active" | "archived";
  context: SubmissionJudgeContext;
  model: string;
  judgeSubmission: (context: SubmissionJudgeContext) => Promise<SubmissionJudgeReport>;
}

export interface SubmissionJudgeWorkflowResult {
  report: SubmissionJudgeReport;
  reviewStage: "active" | "archived";
  isEstimateOnly: true;
  audit: TeachingWorkflowAudit;
}
