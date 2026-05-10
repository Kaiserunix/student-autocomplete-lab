import type { AttemptEventInput } from "../attemptEvent";
import type { StudentProfile } from "../studentProfile";
import type { StudentSkill, StudentSkillMergeResult } from "../studentSkill";
import type { TeachingDiagnosisReport } from "../teachingReport";
import type { TeachingDiagnosisContext } from "../types";

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
  diagnose: (context: TeachingDiagnosisContext) => Promise<TeachingDiagnosisReport>;
}

export interface CoachDiagnosisWorkflowResult {
  report: TeachingDiagnosisReport;
  updatedProfile: StudentProfile;
  updatedStudentSkill: StudentSkill;
  studentSkillMerge: StudentSkillMergeResult;
  attemptEventInput: AttemptEventInput;
  audit: TeachingWorkflowAudit;
}
