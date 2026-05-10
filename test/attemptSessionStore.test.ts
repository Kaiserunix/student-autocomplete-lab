import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import {
  appendAttemptEventToSession,
  ensureAttemptSession,
  loadAttemptSessions
} from "../src/attempt/store";
import { createStudentAutocompleteStoragePaths } from "../src/storage/StoragePaths";
import { readJsonlRecords } from "../src/storage/jsonlStore";
import { buildAttemptEvent, type AttemptEvent } from "../src/teaching/attemptEvent";

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "student-attempt-session-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("attempt session store", () => {
  test("creates a durable session for an imported problem", async () => {
    const paths = createStudentAutocompleteStoragePaths(tempDir);

    const session = await ensureAttemptSession(paths.attemptSessions, {
      problemKey: "luogu:P1001",
      problemId: "P1001",
      platform: "luogu",
      title: "A+B Problem"
    });

    expect(session.sessionId).toBe("attempt:luogu:P1001");
    await expect(loadAttemptSessions(paths.attemptSessions)).resolves.toMatchObject([
      {
        problemKey: "luogu:P1001",
        problemId: "P1001",
        status: "active",
        eventIds: []
      }
    ]);
  });

  test("keeps the legacy attempt event ledger while updating the session", async () => {
    const paths = createStudentAutocompleteStoragePaths(tempDir);
    const event = buildAttemptEvent({
      problemKey: "luogu:P1001",
      problemId: "P1001",
      platform: "luogu",
      kind: "hint_requested",
      occurredAt: "2026-05-10T10:00:00.000Z",
      painPoints: ["output_format"]
    });

    const session = await appendAttemptEventToSession({
      paths: {
        eventsPath: paths.attemptEvents,
        sessionsPath: paths.attemptSessions
      },
      problem: {
        problemKey: "luogu:P1001",
        problemId: "P1001",
        platform: "luogu",
        title: "A+B Problem"
      },
      event,
      coachThreadTurns: [
        {
          role: "assistant",
          kind: "hint_requested",
          text: "先检查输出格式。",
          occurredAt: event.occurredAt,
          model: "fixture"
        }
      ]
    });

    expect(session.eventIds).toEqual([event.eventId]);
    expect(session.coachThread).toHaveLength(1);
    await expect(readJsonlRecords<AttemptEvent>(paths.attemptEvents)).resolves.toEqual([event]);
  });

  test("deduplicates multiple writes for the same problem into one latest session", async () => {
    const paths = createStudentAutocompleteStoragePaths(tempDir);
    const problem = {
      problemKey: "luogu:P1001",
      problemId: "P1001",
      platform: "luogu",
      title: "A+B Problem"
    };

    await appendAttemptEventToSession({
      paths: { eventsPath: paths.attemptEvents, sessionsPath: paths.attemptSessions },
      problem,
      event: buildAttemptEvent({
        problemKey: problem.problemKey,
        problemId: problem.problemId,
        platform: problem.platform,
        kind: "hint_requested",
        occurredAt: "2026-05-10T10:00:00.000Z"
      })
    });
    await appendAttemptEventToSession({
      paths: { eventsPath: paths.attemptEvents, sessionsPath: paths.attemptSessions },
      problem,
      event: buildAttemptEvent({
        problemKey: problem.problemKey,
        problemId: problem.problemId,
        platform: problem.platform,
        kind: "solution_scored",
        outcome: "completed",
        occurredAt: "2026-05-10T10:05:00.000Z"
      })
    });

    const sessions = await loadAttemptSessions(paths.attemptSessions);
    expect(sessions).toHaveLength(1);
    expect(sessions[0]).toMatchObject({
      problemKey: problem.problemKey,
      status: "archived",
      latestOutcome: "completed"
    });
    expect(sessions[0].eventIds).toHaveLength(2);
  });
});
