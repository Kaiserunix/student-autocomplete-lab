import { runTeachingCycleWithStudentSkill } from "../teachingCycle";
import { auditTeachingDiagnosisContext } from "./contextBundle";
import { coachDiagnosisActionToAttemptKind } from "./reducer";
import type { CoachDiagnosisWorkflowInput, CoachDiagnosisWorkflowResult } from "./schema";

export async function runCoachDiagnosisWorkflow(
  input: CoachDiagnosisWorkflowInput
): Promise<CoachDiagnosisWorkflowResult> {
  const cycle = await runTeachingCycleWithStudentSkill(
    input.context,
    input.profile,
    input.studentSkill,
    input.diagnose,
    {
      occurredAt: input.occurredAt,
      patchSource: input.patchSource
    }
  );

  return {
    report: cycle.report,
    updatedProfile: cycle.updatedProfile,
    updatedStudentSkill: cycle.updatedStudentSkill,
    studentSkillMerge: cycle.studentSkillMerge,
    attemptEventInput: {
      problemKey: input.problemKey,
      problemId: input.context.problem.id,
      platform: input.platform,
      kind: coachDiagnosisActionToAttemptKind(input.action),
      occurredAt: input.occurredAt,
      action: input.action,
      painPoints: cycle.report.painPoints.map((painPoint) => painPoint.label),
      model: input.patchSource
    },
    audit: auditTeachingDiagnosisContext(input.action, input.context)
  };
}
