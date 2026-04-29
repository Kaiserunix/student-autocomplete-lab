export interface LearningEvent {
  problemId: string;
  painPoint: string;
  source: "verified_fixture" | "student_submission" | "hint_request";
  language: string;
  evidence: string;
  occurredAt: string;
}

export function formatLearningEventsJsonl(events: LearningEvent[]): string {
  return events.map((event) => JSON.stringify(event)).join("\n") + (events.length > 0 ? "\n" : "");
}
