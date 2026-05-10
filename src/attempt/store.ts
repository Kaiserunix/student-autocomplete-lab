import { appendJsonlRecord, readJsonlRecords, writeJsonlRecords } from "../storage/jsonlStore";
import type { AttemptEvent } from "../teaching/attemptEvent";
import { createAttemptSession, statusFromAttemptEvent } from "./session";
import type { AttemptSession, AttemptSessionProblemRef, AttemptStorePaths, CoachThreadTurn } from "./schema";

export async function loadAttemptSessions(path: string): Promise<AttemptSession[]> {
  return dedupeSessions(await readJsonlRecords<AttemptSession>(path));
}

export async function loadAttemptSession(path: string, problemKey: string): Promise<AttemptSession | undefined> {
  return (await loadAttemptSessions(path)).find((session) => session.problemKey === problemKey);
}

export async function loadOrCreateAttemptSession(
  path: string,
  problem: AttemptSessionProblemRef,
  now = new Date().toISOString()
): Promise<AttemptSession> {
  return (await loadAttemptSession(path, problem.problemKey)) ?? createAttemptSession(problem, now);
}

export async function upsertAttemptSession(path: string, session: AttemptSession): Promise<void> {
  const sessions = await loadAttemptSessions(path);
  const next = new Map<string, AttemptSession>();
  for (const existing of sessions) {
    next.set(existing.problemKey, existing);
  }
  next.set(session.problemKey, session);
  await writeJsonlRecords(path, [...next.values()]);
}

export async function ensureAttemptSession(path: string, problem: AttemptSessionProblemRef): Promise<AttemptSession> {
  const session = await loadOrCreateAttemptSession(path, problem);
  await upsertAttemptSession(path, session);
  return session;
}

export async function appendAttemptEventToSession(input: {
  paths: AttemptStorePaths;
  problem: AttemptSessionProblemRef;
  event: AttemptEvent;
  coachThreadTurns?: CoachThreadTurn[];
}): Promise<AttemptSession> {
  await appendJsonlRecord(input.paths.eventsPath, input.event);

  const existing = await loadOrCreateAttemptSession(input.paths.sessionsPath, input.problem, input.event.occurredAt);
  const eventIds = existing.eventIds.includes(input.event.eventId)
    ? existing.eventIds
    : [...existing.eventIds, input.event.eventId];
  const status = statusFromAttemptEvent(input.event);
  const session: AttemptSession = {
    ...existing,
    problemId: input.problem.problemId,
    platform: input.problem.platform,
    title: input.problem.title ?? existing.title,
    updatedAt: input.event.occurredAt,
    status: status === "active" ? existing.status : status,
    latestOutcome: input.event.outcome,
    eventIds,
    coachThread: [...existing.coachThread, ...(input.coachThreadTurns ?? [])]
  };

  await upsertAttemptSession(input.paths.sessionsPath, session);
  return session;
}

function dedupeSessions(sessions: AttemptSession[]): AttemptSession[] {
  const next = new Map<string, AttemptSession>();
  for (const session of sessions) {
    next.set(session.problemKey, session);
  }

  return [...next.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}
