import { randomUUID } from "node:crypto";
import type { CodeforcesTarget } from "../../../src/submission/types";
import {
  OjConsoleError,
  type DemoScenario,
  type SourceRecord,
  type SubmissionMode,
  type SubmissionPreview
} from "./contracts";

export interface CreatePrototypePreviewInput {
  source: SourceRecord;
  target: CodeforcesTarget;
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
}

interface StoredConfirmation {
  preview: SubmissionPreview;
  sourceContentDigest: string;
}

export class PrototypeConfirmationStore {
  private readonly records = new Map<string, StoredConfirmation>();
  private readonly consumed = new Set<string>();
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly ttlMs: number;

  public constructor(options: PrototypeConfirmationStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? randomUUID;
    this.ttlMs = options.ttlMs ?? 120_000;
  }

  public create(input: CreatePrototypePreviewInput): SubmissionPreview {
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
    if (
      stored.preview.source.sourceId !== source.metadata.sourceId ||
      stored.preview.source.digest !== source.metadata.digest ||
      stored.sourceContentDigest !== source.contentDigest
    ) {
      throw new OjConsoleError("confirmation_mismatch", "预览后源码已变化，请重新预览。", 409);
    }

    this.records.delete(confirmationId);
    this.consumed.add(confirmationId);
    return {
      ...clonePreview(stored.preview),
      sourceId: stored.preview.source.sourceId,
      sourceContentDigest: stored.sourceContentDigest
    };
  }

  public stats(): { pending: number; consumed: number } {
    return { pending: this.records.size, consumed: this.consumed.size };
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
