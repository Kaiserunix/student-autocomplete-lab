import { applyTeachingDiagnosis, StudentProfile } from "./studentProfile";
import {
  applyStudentSkillPatch,
  buildStudentSkillPatchFromDiagnosis,
  StudentSkill,
  StudentSkillMergeResult
} from "./studentSkill";
import { TeachingDiagnosisReport } from "./teachingReport";
import { TeachingDiagnosisContext } from "./types";

export interface TeachingCycleResult {
  provider: "teaching-cycle";
  report: TeachingDiagnosisReport;
  updatedProfile: StudentProfile;
}

export interface TeachingCycleWithStudentSkillResult extends TeachingCycleResult {
  updatedStudentSkill: StudentSkill;
  studentSkillMerge: StudentSkillMergeResult;
}

export interface TeachingCycleStudentSkillOptions {
  occurredAt?: string;
  patchSource?: string;
}

export async function runTeachingCycle(
  context: TeachingDiagnosisContext,
  profile: StudentProfile,
  diagnose: (context: TeachingDiagnosisContext) => Promise<TeachingDiagnosisReport>,
  occurredAt = new Date().toISOString()
): Promise<TeachingCycleResult> {
  const report = await diagnose(context);

  return {
    provider: "teaching-cycle",
    report,
    updatedProfile: applyTeachingDiagnosis(profile, report, occurredAt)
  };
}

export async function runTeachingCycleWithStudentSkill(
  context: TeachingDiagnosisContext,
  profile: StudentProfile,
  studentSkill: StudentSkill,
  diagnose: (context: TeachingDiagnosisContext) => Promise<TeachingDiagnosisReport>,
  options: TeachingCycleStudentSkillOptions = {}
): Promise<TeachingCycleWithStudentSkillResult> {
  const occurredAt = options.occurredAt ?? new Date().toISOString();
  const report = await diagnose(context);
  const studentSkillMerge = applyStudentSkillPatch(
    studentSkill,
    buildStudentSkillPatchFromDiagnosis(report, {
      source: options.patchSource ?? "teacher",
      occurredAt,
      problemId: context.problem.id,
      topic: context.problem.summary
    })
  );

  return {
    provider: "teaching-cycle",
    report,
    updatedProfile: applyTeachingDiagnosis(profile, report, occurredAt),
    updatedStudentSkill: studentSkillMerge.skill,
    studentSkillMerge
  };
}
