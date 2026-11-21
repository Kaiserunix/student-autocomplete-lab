import type { AttemptEventKind } from "../attemptEvent";
import type { CoachPedagogyAction } from "./pedagogyPolicy";
import type { CoachDiagnosisWorkflowAction } from "./schema";

export function coachDiagnosisActionToAttemptKind(action: CoachDiagnosisWorkflowAction): AttemptEventKind {
  return action === "specific" ? "specific_hint_requested" : "hint_requested";
}

export function coachActionToAttemptEventKind(
  action: CoachPedagogyAction
): "hint_requested" | "specific_hint_requested" | "follow_up_requested" | "recommendation_requested" {
  if (action === "specific") {
    return "specific_hint_requested";
  }
  if (action === "followUp") {
    return "follow_up_requested";
  }
  if (action === "recommend") {
    return "recommendation_requested";
  }
  return "hint_requested";
}
