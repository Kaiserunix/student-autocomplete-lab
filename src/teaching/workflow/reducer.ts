import type { AttemptEventKind } from "../attemptEvent";
import type { CoachDiagnosisWorkflowAction } from "./schema";

export function coachDiagnosisActionToAttemptKind(action: CoachDiagnosisWorkflowAction): AttemptEventKind {
  return action === "specific" ? "specific_hint_requested" : "hint_requested";
}
