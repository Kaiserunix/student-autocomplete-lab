import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { LearningEventV2 } from "../contracts";

export interface AppendEventResult {
  appended: boolean;
  duplicate: boolean;
  eventId: string;
}

export interface LearningEventStore {
  append(event: LearningEventV2): Promise<AppendEventResult>;
  appendBatch(events: readonly LearningEventV2[]): Promise<{ appendedCount: number; duplicateCount: number }>;
  readAll(): Promise<LearningEventV2[]>;
  hasEventId(eventId: string): Promise<boolean>;
}

/**
 * Deduplicates events strictly by `eventId` (first occurrence wins)
 * and sorts chronologically by timestamp with stable tie-breaking.
 */
export function deduplicateLearningEvents(events: readonly LearningEventV2[]): LearningEventV2[] {
  const seen = new Set<string>();
  const unique: Array<{ event: LearningEventV2; order: number; ts: number }> = [];

  for (let index = 0; index < events.length; index += 1) {
    const event = events[index];
    if (!event || !event.eventId || seen.has(event.eventId)) {
      continue;
    }
    seen.add(event.eventId);
    const parsedTs = Date.parse(event.timestamp);
    unique.push({
      event,
      order: index,
      ts: Number.isNaN(parsedTs) ? 0 : parsedTs
    });
  }

  unique.sort((a, b) => (a.ts !== b.ts ? a.ts - b.ts : a.order - b.order));
  return unique.map((item) => item.event);
}

export function validateLearningEvent(event: LearningEventV2): void {
  if (event.schemaVersion !== "2.0") {
    throw new Error(`Unsupported LearningEventV2 schemaVersion: ${String(event.schemaVersion)}`);
  }
  if (!event.eventId || !event.eventId.trim()) {
    throw new Error("LearningEventV2 requires a non-empty eventId.");
  }
  if (!event.timestamp || Number.isNaN(Date.parse(event.timestamp))) {
    throw new Error(`LearningEventV2 requires a valid ISO timestamp, got: ${String(event.timestamp)}`);
  }
  if (!event.problemRef?.problemKey || !event.problemRef.problemKey.trim()) {
    throw new Error("LearningEventV2 requires a non-empty problemRef.problemKey.");
  }
}

export class InMemoryLearningEventStore implements LearningEventStore {
  private readonly events: LearningEventV2[] = [];
  private readonly seenIds = new Set<string>();

  constructor(initialEvents: readonly LearningEventV2[] = []) {
    for (const event of initialEvents) {
      validateLearningEvent(event);
      if (!this.seenIds.has(event.eventId)) {
        this.seenIds.add(event.eventId);
        this.events.push(structuredClone(event));
      }
    }
  }

  public async append(event: LearningEventV2): Promise<AppendEventResult> {
    validateLearningEvent(event);
    if (this.seenIds.has(event.eventId)) {
      return { appended: false, duplicate: true, eventId: event.eventId };
    }
    this.seenIds.add(event.eventId);
    this.events.push(structuredClone(event));
    return { appended: true, duplicate: false, eventId: event.eventId };
  }

  public async appendBatch(
    events: readonly LearningEventV2[]
  ): Promise<{ appendedCount: number; duplicateCount: number }> {
    let appendedCount = 0;
    let duplicateCount = 0;
    for (const event of events) {
      const res = await this.append(event);
      if (res.appended) {
        appendedCount += 1;
      } else {
        duplicateCount += 1;
      }
    }
    return { appendedCount, duplicateCount };
  }

  public async readAll(): Promise<LearningEventV2[]> {
    return deduplicateLearningEvents(this.events).map((evt) => structuredClone(evt));
  }

  public async hasEventId(eventId: string): Promise<boolean> {
    return this.seenIds.has(eventId);
  }
}

/**
 * Immutable append-only JSONL storage (`learningEvents.v2.jsonl`)
 * with strict `eventId` idempotent deduplication.
 */
export class JsonlLearningEventStore implements LearningEventStore {
  private readonly filePath: string;
  private knownIdsLoaded = false;
  private readonly knownIds = new Set<string>();

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  public get path(): string {
    return this.filePath;
  }

  public async append(event: LearningEventV2): Promise<AppendEventResult> {
    validateLearningEvent(event);
    await this.ensureIndexLoaded();
    if (this.knownIds.has(event.eventId)) {
      return { appended: false, duplicate: true, eventId: event.eventId };
    }

    await mkdir(dirname(this.filePath), { recursive: true });
    const line = `${JSON.stringify(event)}\n`;
    await appendFile(this.filePath, line, "utf8");
    this.knownIds.add(event.eventId);
    return { appended: true, duplicate: false, eventId: event.eventId };
  }

  public async appendBatch(
    events: readonly LearningEventV2[]
  ): Promise<{ appendedCount: number; duplicateCount: number }> {
    await this.ensureIndexLoaded();
    const toWrite: LearningEventV2[] = [];
    let duplicateCount = 0;

    for (const event of events) {
      validateLearningEvent(event);
      if (this.knownIds.has(event.eventId)) {
        duplicateCount += 1;
        continue;
      }
      this.knownIds.add(event.eventId);
      toWrite.push(event);
    }

    if (toWrite.length > 0) {
      await mkdir(dirname(this.filePath), { recursive: true });
      const block = toWrite.map((evt) => JSON.stringify(evt)).join("\n") + "\n";
      await appendFile(this.filePath, block, "utf8");
    }

    return {
      appendedCount: toWrite.length,
      duplicateCount
    };
  }

  public async readAll(): Promise<LearningEventV2[]> {
    const rawEvents = await this.readRawLines();
    this.knownIds.clear();
    for (const evt of rawEvents) {
      this.knownIds.add(evt.eventId);
    }
    this.knownIdsLoaded = true;
    return deduplicateLearningEvents(rawEvents);
  }

  public async hasEventId(eventId: string): Promise<boolean> {
    await this.ensureIndexLoaded();
    return this.knownIds.has(eventId);
  }

  private async ensureIndexLoaded(): Promise<void> {
    if (this.knownIdsLoaded) {
      return;
    }
    const rawEvents = await this.readRawLines();
    this.knownIds.clear();
    for (const evt of rawEvents) {
      this.knownIds.add(evt.eventId);
    }
    this.knownIdsLoaded = true;
  }

  private async readRawLines(): Promise<LearningEventV2[]> {
    let content: string;
    try {
      content = await readFile(this.filePath, "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ENOENT") {
        return [];
      }
      throw error;
    }

    const parsed: LearningEventV2[] = [];
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }
      try {
        const obj = JSON.parse(line) as Partial<LearningEventV2>;
        if (obj.schemaVersion === "2.0" && typeof obj.eventId === "string" && obj.eventId.length > 0) {
          parsed.push(obj as LearningEventV2);
        }
      } catch {
        // Ignore truncated/corrupt trailing line gracefully without crashing reader
      }
    }
    return parsed;
  }
}
