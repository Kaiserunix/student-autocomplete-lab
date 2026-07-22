import type { OjVerdict } from "./types";

export type AttemptEventKind =
  | "hint_requested"
  | "specific_hint_requested"
  | "follow_up_requested"
  | "recommendation_requested"
  | "lesson_reported"
  | "solution_scored"
  | "optimization_reviewed"
  | "archived";

export type AttemptOutcome = "active" | "abandoned" | "revealed" | "ac" | "completed" | "removed";

export interface AttemptEventInput {
  problemKey: string;
  problemId: string;
  platform: string;
  kind: AttemptEventKind;
  occurredAt: string;
  action?: string;
  outcome?: AttemptOutcome;
  ojStatus?: OjVerdict["status"];
  learningScore?: number;
  painPoints?: string[];
  model?: string;
  note?: string;
}

export interface AttemptEvent extends AttemptEventInput {
  eventId: string;
  outcome: AttemptOutcome;
  painPoints: string[];
}

export interface AttemptStats {
  hintCount: number;
  gaveUp: boolean;
  revealedAnswer: boolean;
  latestOutcome?: AttemptOutcome;
  latestLearningScore?: number;
  painPointCounts: Record<string, number>;
}

export function buildAttemptEvent(input: AttemptEventInput): AttemptEvent {
  return {
    ...input,
    eventId: makeAttemptEventId(input),
    outcome: input.outcome ?? (input.kind === "solution_scored" && input.ojStatus === "AC" ? "ac" : "active"),
    painPoints: unique(input.painPoints ?? [])
  };
}

export function summarizeAttemptEvents(events: AttemptEvent[], problemKey: string): AttemptStats {
  const relevant = events.filter((event) => event.problemKey === problemKey);
  const painPointCounts: Record<string, number> = {};

  for (const event of relevant) {
    for (const painPoint of event.painPoints) {
      painPointCounts[painPoint] = (painPointCounts[painPoint] ?? 0) + 1;
    }
  }

  const latest = [...relevant].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0];
  const latestScored = [...relevant]
    .filter((event) => event.kind === "solution_scored" && event.learningScore !== undefined)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))[0];

  return {
    hintCount: relevant.filter(
      (event) =>
        event.kind === "hint_requested" || event.kind === "specific_hint_requested" || event.kind === "follow_up_requested"
    ).length,
    gaveUp: relevant.some((event) => event.outcome === "abandoned"),
    revealedAnswer: relevant.some((event) => event.outcome === "revealed"),
    latestOutcome: latest?.outcome,
    latestLearningScore: latestScored?.learningScore,
    painPointCounts
  };
}

function makeAttemptEventId(input: AttemptEventInput): string {
  return [input.occurredAt, input.problemKey, input.kind, input.outcome ?? "active"].join("|");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0))).sort();
}
