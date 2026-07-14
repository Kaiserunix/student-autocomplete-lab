import { randomUUID } from "node:crypto";
import type {
  CodeforcesTarget,
  EditorSubmissionIdentity,
  OjSubmissionPreview
} from "./types";

export interface CreateSubmissionPreviewInput {
  problemKey: string;
  target: CodeforcesTarget;
  editor: EditorSubmissionIdentity;
  codeforcesHandle?: string;
}

export interface SubmissionConfirmationStoreOptions {
  now?: () => number;
  createId?: () => string;
  ttlMs?: number;
}

export class SubmissionConfirmationStore {
  private readonly previews = new Map<string, OjSubmissionPreview>();
  private readonly consumed = new Set<string>();
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly ttlMs: number;

  public constructor(options: SubmissionConfirmationStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? randomUUID;
    this.ttlMs = options.ttlMs ?? 120_000;
  }

  public create(input: CreateSubmissionPreviewInput): OjSubmissionPreview {
    const createdAtMs = this.now();
    const confirmationId = this.createId();
    const handle = input.codeforcesHandle?.trim();
    const preview: OjSubmissionPreview = {
      confirmationId,
      problemKey: input.problemKey,
      target: { ...input.target },
      editor: { ...input.editor },
      codeforcesHandle: handle || undefined,
      createdAt: new Date(createdAtMs).toISOString(),
      expiresAt: new Date(createdAtMs + this.ttlMs).toISOString()
    };
    this.previews.set(confirmationId, preview);
    return clonePreview(preview);
  }

  public consume(confirmationId: string, editor: EditorSubmissionIdentity): OjSubmissionPreview {
    const preview = this.previews.get(confirmationId);
    if (!preview) {
      if (this.consumed.has(confirmationId)) {
        throw new Error("这次提交确认已经使用，请重新预览。");
      }
      throw new Error("找不到这次提交确认，请重新预览。");
    }

    if (this.now() > Date.parse(preview.expiresAt)) {
      this.previews.delete(confirmationId);
      throw new Error("这次提交确认已过期，请重新预览。");
    }

    if (!sameEditor(preview.editor, editor)) {
      throw new Error("预览后代码已变化，请重新预览再提交。");
    }

    this.previews.delete(confirmationId);
    this.consumed.add(confirmationId);
    return clonePreview(preview);
  }
}

function sameEditor(expected: EditorSubmissionIdentity, actual: EditorSubmissionIdentity): boolean {
  return (
    expected.uri === actual.uri &&
    expected.filePath === actual.filePath &&
    expected.version === actual.version &&
    expected.languageId === actual.languageId &&
    expected.codeSize === actual.codeSize
  );
}

function clonePreview(preview: OjSubmissionPreview): OjSubmissionPreview {
  return {
    ...preview,
    target: { ...preview.target },
    editor: { ...preview.editor }
  };
}
