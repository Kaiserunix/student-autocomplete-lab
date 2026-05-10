import * as path from "node:path";
import { appendJsonlRecord, readJsonlRecordsLenient, type InvalidJsonlRecord } from "../storage/jsonlStore";

export const internalTestSchemaVersion = "internal-test/v1" as const;

export type InternalTestEventKind =
  | "extension_activated"
  | "autocomplete_event"
  | "ai_coach"
  | "lesson_report"
  | "solution_score"
  | "optimization_review"
  | "archive"
  | "skill_feedback"
  | "recommendation"
  | "submission_judge"
  | "state_loaded";

export interface InternalTestBuildInfo {
  packageName: string;
  displayName?: string;
  version?: string;
}

export interface InternalTestWorkspaceInfo {
  folder?: string;
}

export interface InternalTestEventInput {
  kind: InternalTestEventKind;
  problemKey?: string;
  problemId?: string;
  platform?: string;
  action?: string;
  outcome?: string;
  ojStatus?: string;
  learningScore?: number;
  painPoints?: string[];
  model?: string;
  durationMs?: number;
  note?: string;
  payload?: Record<string, unknown>;
}

export interface InternalTestEvent extends InternalTestEventInput {
  schemaVersion: typeof internalTestSchemaVersion;
  eventId: string;
  occurredAt: string;
  build: InternalTestBuildInfo;
  workspace: InternalTestWorkspaceInfo;
}

export interface InternalTestSummary {
  enabled: boolean;
  eventsPath?: string;
  totalEvents: number;
  byKind: Partial<Record<InternalTestEventKind, number>>;
  problemCount: number;
  hintCount: number;
  giveUpCount: number;
  solutionScoreCount: number;
  skillFeedbackCount: number;
  recommendationCount: number;
  autocompleteRequestCount: number;
  invalidRecordCount: number;
  invalidRecords?: InvalidJsonlRecord[];
  models: string[];
  firstAt?: string;
  lastAt?: string;
  privacyNotice: string;
}

export interface InternalTestRecorderOptions extends InternalTestBuildInfo {
  globalStoragePath: string;
  workspaceFolder?: string;
  env?: Record<string, string | undefined>;
}

export interface InternalTestRecorder {
  enabled: boolean;
  eventsPath: string;
  record(event: InternalTestEventInput): Promise<void>;
  summary(): Promise<InternalTestSummary>;
}

export function isInternalTestBuild(input: {
  packageName: string;
  env?: Record<string, string | undefined>;
}): boolean {
  const env = input.env ?? process.env;
  return input.packageName.endsWith("-internal") || env.STUDENT_AUTOCOMPLETE_INTERNAL_TEST === "1";
}

export function createInternalTestRecorder(options: InternalTestRecorderOptions): InternalTestRecorder {
  const enabled = isInternalTestBuild({ packageName: options.packageName, env: options.env });
  const eventsPath = path.join(options.globalStoragePath, "internalTestEvents.jsonl");
  const build: InternalTestBuildInfo = {
    packageName: options.packageName,
    displayName: options.displayName,
    version: options.version
  };
  const workspace: InternalTestWorkspaceInfo = {
    folder: options.workspaceFolder
  };

  return {
    enabled,
    eventsPath,
    async record(event: InternalTestEventInput): Promise<void> {
      if (!enabled) {
        return;
      }

      await appendJsonlRecord(eventsPath, {
        ...event,
        schemaVersion: internalTestSchemaVersion,
        eventId: makeInternalTestEventId(event),
        occurredAt: new Date().toISOString(),
        build,
        workspace
      });
    },
    async summary(): Promise<InternalTestSummary> {
      if (!enabled) {
        return emptyInternalTestSummary(false, eventsPath);
      }

      const { records, invalidRecords } = await readJsonlRecordsLenient<InternalTestEvent>(eventsPath);
      return summarizeInternalTestEvents(records, { enabled, eventsPath, invalidRecords });
    }
  };
}

export function summarizeInternalTestEvents(
  events: InternalTestEvent[],
  options: { enabled?: boolean; eventsPath?: string; invalidRecords?: InvalidJsonlRecord[] } = {}
): InternalTestSummary {
  const byKind: Partial<Record<InternalTestEventKind, number>> = {};
  const problemKeys = new Set<string>();
  const models = new Set<string>();
  let firstAt: string | undefined;
  let lastAt: string | undefined;

  for (const event of events) {
    byKind[event.kind] = (byKind[event.kind] ?? 0) + 1;
    if (event.problemKey) {
      problemKeys.add(event.problemKey);
    }
    if (event.model) {
      models.add(event.model);
    }
    if (!firstAt || event.occurredAt < firstAt) {
      firstAt = event.occurredAt;
    }
    if (!lastAt || event.occurredAt > lastAt) {
      lastAt = event.occurredAt;
    }
  }

  return {
    enabled: options.enabled ?? true,
    eventsPath: options.eventsPath,
    totalEvents: events.length,
    byKind,
    problemCount: problemKeys.size,
    hintCount: events.filter((event) => event.kind === "ai_coach" && ["hint", "specific"].includes(event.action ?? "")).length,
    giveUpCount: events.filter((event) => event.kind === "lesson_report" || event.action === "giveUp").length,
    solutionScoreCount: byKind.solution_score ?? 0,
    skillFeedbackCount: byKind.skill_feedback ?? 0,
    recommendationCount: byKind.recommendation ?? 0,
    autocompleteRequestCount: events.filter((event) => event.kind === "autocomplete_event" && event.action === "request").length,
    invalidRecordCount: options.invalidRecords?.length ?? 0,
    invalidRecords: options.invalidRecords,
    models: Array.from(models).sort(),
    firstAt,
    lastAt,
    privacyNotice: "内测记录只写入本地 JSONL，不自动上传；可能包含题号、模型、痛点、反馈备注和工作区路径。"
  };
}

function emptyInternalTestSummary(enabled: boolean, eventsPath?: string): InternalTestSummary {
  return {
    enabled,
    eventsPath,
    totalEvents: 0,
    byKind: {},
    problemCount: 0,
    hintCount: 0,
    giveUpCount: 0,
    solutionScoreCount: 0,
    skillFeedbackCount: 0,
    recommendationCount: 0,
    autocompleteRequestCount: 0,
    invalidRecordCount: 0,
    invalidRecords: [],
    models: [],
    privacyNotice: "正式版默认不记录内测事件；内测记录只写入本地 JSONL，不自动上传。"
  };
}

function makeInternalTestEventId(event: InternalTestEventInput): string {
  const problem = event.problemKey ?? event.problemId ?? "global";
  const random = Math.random().toString(36).slice(2, 8);
  return `${Date.now()}-${event.kind}-${problem}-${random}`;
}
