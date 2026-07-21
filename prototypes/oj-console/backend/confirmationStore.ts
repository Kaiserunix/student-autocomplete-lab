import { randomUUID } from "node:crypto";
import type { SubmissionTarget } from "../../../src/submission/types";
import {
  OjConsoleError,
  type DemoScenario,
  type SourceRecord,
  type SubmissionMode,
  type SubmissionPreview
} from "./contracts";

export interface CreatePrototypePreviewInput {
  source: SourceRecord;
  target: SubmissionTarget;
  mode: SubmissionMode;
  scenario?: DemoScenario;
  codeforcesHandle?: string;
  toolVersion?: string;
}

export interface ConsumedPrototypeConfirmation extends SubmissionPreview {
  sourceId: string;
  sourceContentDigest: string;
}

export interface PrototypeConfirmationStoreOptions {
  now?: () => number;
  createId?: () => string;
  ttlMs?: number;
  consumedTtlMs?: number;
  maxPending?: number;
}

interface StoredConfirmation {
  preview: SubmissionPreview;
  sourceContentDigest: string;
}

export class PrototypeConfirmationStore {
  private readonly records = new Map<string, StoredConfirmation>();
  private readonly consumed = new Map<string, number>();
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly ttlMs: number;
  private readonly consumedTtlMs: number;
  private readonly maxPending: number;

  public constructor(options: PrototypeConfirmationStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? randomUUID;
    this.ttlMs = options.ttlMs ?? 120_000;
    this.consumedTtlMs = options.consumedTtlMs ?? this.ttlMs;
    this.maxPending = options.maxPending ?? 16;
  }

  public create(input: CreatePrototypePreviewInput): SubmissionPreview {
    this.pruneExpired();
    if (this.records.size >= this.maxPending) {
      throw new OjConsoleError("confirmation_limit_reached", `待确认预览最多保留 ${this.maxPending} 个。`, 409);
    }
    const createdAtMs = this.now();
    const confirmationId = this.createId();
    const handle = normalizeHandle(input.codeforcesHandle);
    const preview: SubmissionPreview = {
      confirmationId,
      mode: input.mode,
      ...(input.scenario ? { scenario: input.scenario } : {}),
      source: { ...input.source.metadata },
      target: { ...input.target },
      ...(handle ? { codeforcesHandle: handle } : {}),
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(createdAtMs + this.ttlMs).toISOString(),
      ...(input.toolVersion ? { toolVersion: input.toolVersion } : {})
    };
    this.records.set(confirmationId, {
      preview,
      sourceContentDigest: input.source.contentDigest
    });
    return clonePreview(preview);
  }

  public consume(confirmationId: string, source: SourceRecord): ConsumedPrototypeConfirmation {
    const stored = this.requirePending(confirmationId);
    if (
      stored.preview.source.sourceId !== source.metadata.sourceId ||
      stored.preview.source.digest !== source.metadata.digest ||
      stored.sourceContentDigest !== source.contentDigest
    ) {
      throw new OjConsoleError("confirmation_mismatch", "预览后源码已变化，请重新预览。", 409);
    }

    this.records.delete(confirmationId);
    this.consumed.set(confirmationId, this.now() + this.consumedTtlMs);
    return {
      ...clonePreview(stored.preview),
      sourceId: stored.preview.source.sourceId,
      sourceContentDigest: stored.sourceContentDigest
    };
  }

  public sourceIdFor(confirmationId: string): string {
    return this.requirePending(confirmationId).preview.source.sourceId;
  }

  public stats(): { pending: number; consumed: number } {
    this.pruneExpired();
    return { pending: this.records.size, consumed: this.consumed.size };
  }

  private requirePending(confirmationId: string): StoredConfirmation {
    this.pruneConsumed();
    const stored = this.records.get(confirmationId);
    if (!stored) {
      if (this.consumed.has(confirmationId)) {
        throw new OjConsoleError("confirmation_consumed", "这次提交确认已经使用，请重新预览。", 409);
      }
      throw new OjConsoleError("confirmation_missing", "找不到这次提交确认，请重新预览。", 404);
    }
    if (this.now() > Date.parse(stored.preview.expiresAt)) {
      this.records.delete(confirmationId);
      throw new OjConsoleError("confirmation_expired", "这次提交确认已过期，请重新预览。", 409);
    }
    return stored;
  }

  private pruneExpired(): void {
    const now = this.now();
    for (const [confirmationId, stored] of this.records) {
      if (now > Date.parse(stored.preview.expiresAt)) {
        this.records.delete(confirmationId);
      }
    }
    this.pruneConsumed(now);
  }

  private pruneConsumed(now = this.now()): void {
    for (const [confirmationId, expiresAt] of this.consumed) {
      if (now > expiresAt) {
        this.consumed.delete(confirmationId);
      }
    }
  }
}

function normalizeHandle(value: string | undefined): string | undefined {
  const handle = value?.trim();
  if (!handle) {
    return undefined;
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(handle)) {
    throw new OjConsoleError("invalid_request", "Codeforces handle 格式不正确。");
  }
  return handle;
}

function clonePreview(preview: SubmissionPreview): SubmissionPreview {
  return {
    ...preview,
    source: { ...preview.source },
    target: { ...preview.target }
  };
}
