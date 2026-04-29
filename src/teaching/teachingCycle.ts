import { applyTeachingDiagnosis, StudentProfile } from "./studentProfile";
import { TeachingDiagnosisReport } from "./teachingReport";
import { TeachingDiagnosisContext } from "./types";

export interface TeachingCycleResult {
  provider: "teaching-cycle";
  report: TeachingDiagnosisReport;
  updatedProfile: StudentProfile;
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
