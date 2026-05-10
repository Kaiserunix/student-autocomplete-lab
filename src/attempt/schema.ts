import type { ProblemPlatform } from "../problemBank/types";
import type { AttemptEvent, AttemptOutcome } from "../teaching/attemptEvent";

export type AttemptSessionSchemaVersion = "attempt-session/v1";
export type AttemptSessionStatus = "active" | "archived" | "deleted";
export type CoachThreadTurnRole = "student" | "assistant" | "system";

export interface AttemptSessionProblemRef {
  problemKey: string;
  problemId: string;
  platform: ProblemPlatform | string;
  title?: string;
}

export interface CoachThreadTurn {
  role: CoachThreadTurnRole;
  kind: AttemptEvent["kind"] | "manual_note";
  text: string;
  occurredAt: string;
  model?: string;
}

export interface AttemptSession extends AttemptSessionProblemRef {
  schemaVersion: AttemptSessionSchemaVersion;
  sessionId: string;
  createdAt: string;
  updatedAt: string;
  status: AttemptSessionStatus;
  latestOutcome?: AttemptOutcome;
  eventIds: string[];
  coachThread: CoachThreadTurn[];
}

export interface AttemptStorePaths {
  eventsPath: string;
  sessionsPath: string;
}
