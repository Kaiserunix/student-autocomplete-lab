import type { ProblemRecord } from "../problemBank/types";
import type { AttemptEvent } from "../teaching/attemptEvent";
import type { AttemptSession, AttemptSessionProblemRef, AttemptSessionStatus } from "./schema";

export function makeAttemptSessionId(problemKey: string): string {
  return `attempt:${problemKey}`;
}

export function problemRefFromRecord(
  problemKey: string,
  problem: Pick<ProblemRecord, "id" | "platform" | "title">
): AttemptSessionProblemRef {
  return {
    problemKey,
    problemId: problem.id,
    platform: problem.platform,
    title: problem.title
  };
}

export function createAttemptSession(
  problem: AttemptSessionProblemRef,
  now = new Date().toISOString()
): AttemptSession {
  return {
    schemaVersion: "attempt-session/v1",
    sessionId: makeAttemptSessionId(problem.problemKey),
    problemKey: problem.problemKey,
    problemId: problem.problemId,
    platform: problem.platform,
    title: problem.title,
    createdAt: now,
    updatedAt: now,
    status: "active",
    eventIds: [],
    coachThread: []
  };
}

export function statusFromAttemptEvent(event: AttemptEvent): AttemptSessionStatus {
  if (event.outcome === "removed") {
    return "deleted";
  }
  if (event.outcome !== "active" || event.kind === "archived" || event.kind === "lesson_reported") {
    return "archived";
  }

  return "active";
}
