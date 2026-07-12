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
