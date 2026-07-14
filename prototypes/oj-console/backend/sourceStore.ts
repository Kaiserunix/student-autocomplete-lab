import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { OjConsoleError, type SourceMetadata, type SourceRecord } from "./contracts";

export interface SourceStoreOptions {
  now?: () => number;
  createId?: () => string;
  ttlMs?: number;
  maxEntries?: number;
  maxSourceBytes?: number;
  maxTotalBytes?: number;
}

const languageByExtension: Record<string, string> = {
  ".c": "c",
  ".cc": "cpp",
  ".cpp": "cpp",
  ".cxx": "cpp",
  ".py": "python",
  ".py3": "python",
  ".java": "java",
  ".kt": "kotlin",
  ".rs": "rust",
  ".go": "go",
  ".js": "javascript",
  ".ts": "typescript",
  ".cs": "csharp",
  ".swift": "swift"
};

export class SourceStore {
  private readonly records = new Map<string, SourceRecord>();
  private readonly now: () => number;
  private readonly createId: () => string;
  private readonly ttlMs: number;
  private readonly maxEntries: number;
  private readonly maxSourceBytes: number;
  private readonly maxTotalBytes: number;

  public constructor(options: SourceStoreOptions = {}) {
    this.now = options.now ?? Date.now;
    this.createId = options.createId ?? randomUUID;
    this.ttlMs = options.ttlMs ?? 300_000;
    this.maxEntries = options.maxEntries ?? 8;
    this.maxSourceBytes = options.maxSourceBytes ?? 1024 * 1024;
    this.maxTotalBytes = options.maxTotalBytes ?? 4 * 1024 * 1024;
  }

  public add(fileNameInput: string, sourceBytes: Buffer): SourceMetadata {
    this.pruneExpired();
    const fileName = sanitizeFileName(fileNameInput);
    const language = languageForFileName(fileName);
    if (sourceBytes.length === 0) {
      throw new OjConsoleError("invalid_request", "源码文件不能为空。");
    }
    if (sourceBytes.length > this.maxSourceBytes) {
      throw new OjConsoleError("source_too_large", "单个源码文件不能超过 1 MiB。", 413);
    }
    if (this.records.size >= this.maxEntries) {
      throw new OjConsoleError("source_limit_reached", `本次运行最多保留 ${this.maxEntries} 个源码文件。`, 409);
    }
    const currentBytes = this.totalBytes();
    if (currentBytes + sourceBytes.length > this.maxTotalBytes) {
      throw new OjConsoleError("source_limit_reached", "本次运行的源码总量不能超过 4 MiB。", 409);
    }

    const createdAt = this.now();
    const sourceId = this.createId();
    const contentDigest = createHash("sha256").update(sourceBytes).digest("hex");
    const metadata: SourceMetadata = {
      sourceId,
      fileName,
      language,
      byteSize: sourceBytes.length,
      digest: contentDigest.slice(0, 12),
      expiresAt: new Date(createdAt + this.ttlMs).toISOString()
    };
    this.records.set(sourceId, {
      metadata,
      bytes: Buffer.from(sourceBytes),
      contentDigest
    });
    return cloneMetadata(metadata);
  }

  public read(sourceId: string): SourceRecord {
    const record = this.records.get(sourceId);
    if (!record) {
      throw new OjConsoleError("source_missing", "找不到源码文件，请重新选择。", 404);
    }
    if (this.now() > Date.parse(record.metadata.expiresAt)) {
      this.records.delete(sourceId);
      throw new OjConsoleError("source_missing", "这个源码文件已过期，请重新选择。", 404);
    }
    return cloneRecord(record);
  }

  public stats(): { count: number; totalBytes: number } {
    this.pruneExpired();
    return { count: this.records.size, totalBytes: this.totalBytes() };
  }

  private pruneExpired(): void {
    for (const [sourceId, record] of this.records) {
      if (this.now() > Date.parse(record.metadata.expiresAt)) {
        this.records.delete(sourceId);
      }
    }
  }

  private totalBytes(): number {
    let total = 0;
    for (const record of this.records.values()) {
      total += record.metadata.byteSize;
    }
    return total;
  }
}

function sanitizeFileName(value: string): string {
  if (!value || value.includes("\0")) {
    throw new OjConsoleError("invalid_request", "源码文件名不正确。");
  }
  const fileName = path.posix.basename(value.replaceAll("\\", "/")).trim();
  if (!fileName || fileName === "." || fileName === "..") {
    throw new OjConsoleError("invalid_request", "源码文件名不正确。");
  }
  return fileName;
}

function languageForFileName(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  const language = languageByExtension[extension];
  if (!language) {
    throw new OjConsoleError("invalid_request", `不支持源码后缀：${extension || "无后缀"}。`);
  }
  return language;
}

function cloneMetadata(metadata: SourceMetadata): SourceMetadata {
  return { ...metadata };
}

function cloneRecord(record: SourceRecord): SourceRecord {
  return {
    metadata: cloneMetadata(record.metadata),
    bytes: Buffer.from(record.bytes),
    contentDigest: record.contentDigest
  };
}
