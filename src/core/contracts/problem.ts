export type ProblemSourceId =
  | "leetcode-cn"
  | "leetcode-global"
  | "luogu"
  | "codeforces"
  | "atcoder"
  | "nowcoder"
  | "local-markdown"
  | "warmup-pack"
  | `external:${string}`;

export type ProblemIoMode = "stdio" | "function" | "interactive";

export type DocumentCompleteness = "full" | "samples_only" | "metadata_only";

export type SupportedLanguage = "python" | "cpp" | "c" | "rust" | "java" | "generic";

export interface ProblemSample {
  id: string;
  input: string;
  expectedOutput?: string;
  explanation?: string;
  isOriginal: boolean;
}

export interface FunctionSignatureMeta {
  entryName: string;
  params: Array<{ name: string; type: string }>;
  returnType: string;
  codeSnippets: Record<string, string>;
}

export interface ProblemDocument {
  schemaVersion: "problem-doc/v2";
  problemKey: string;
  source: ProblemSourceId;
  sourceId: string;
  canonicalUrl?: string;
  title: string;
  locale: "zh-CN" | "en-US" | "ja-JP" | "mixed";
  completeness: DocumentCompleteness;
  ioMode: ProblemIoMode;
  /** Strictly blocked from entering autocomplete contexts by type & gate tests. */
  statementMarkdown?: string;
  samples: ProblemSample[];
  functionMeta?: FunctionSignatureMeta;
  constraints?: {
    timeLimitMs?: number;
    memoryLimitMb?: number;
  };
  difficulty?: {
    rawLabel?: string;
    numericRating?: number;
    normalizedTier?: 1 | 2 | 3 | 4 | 5;
  };
  rawTags: string[];
  conceptTags?: string[];
  provenance: {
    ingestChannel:
      | "builtin-adapter"
      | "localhost-bridge"
      | "clipboard"
      | "markdown-file"
      | "warmup-builtin"
      | "external-slot";
    fetchedAt: string;
    isPaidOnly?: boolean;
  };
}

export type AdapterErrorCode =
  | "NOT_FOUND"
  | "AUTH_REQUIRED"
  | "PAID_ONLY"
  | "ANTIBOT_BLOCKED"
  | "RATE_LIMITED"
  | "SCHEMA_DRIFT"
  | "NETWORK_ERROR";

export class ProblemAdapterError extends Error {
  constructor(
    public readonly code: AdapterErrorCode,
    public readonly source: ProblemSourceId,
    message: string
  ) {
    super(message);
    this.name = "ProblemAdapterError";
  }
}

export interface AdapterCapabilities {
  search: boolean;
  problemLists: boolean;
  directStatementFetch: boolean;
  directSamplesFetch: boolean;
  ioModes: ProblemIoMode[];
  supportsOptionalUserSession: boolean;
}

export interface ProblemSearchQuery {
  keyword?: string;
  tags?: string[];
  minTier?: number;
  maxTier?: number;
  page?: number;
}

export interface ProblemSourceAdapter {
  readonly id: ProblemSourceId;
  readonly displayName: string;
  readonly capabilities: AdapterCapabilities;
  canHandleUrl(url: string): boolean;
  resolveRef(input: string): { sourceId: string; canonicalUrl?: string } | null;
  fetchProblem(
    ref: string,
    opts?: { forceRefresh?: boolean; signal?: AbortSignal }
  ): Promise<ProblemDocument>;
  search?(
    query: ProblemSearchQuery,
    signal?: AbortSignal
  ): Promise<{ items: ProblemDocument[]; total?: number }>;
  fetchProblemList?(
    listId: string,
    signal?: AbortSignal
  ): Promise<{ id: string; title: string; items: ProblemDocument[] }>;
  healthCheck?(
    signal?: AbortSignal
  ): Promise<{ ok: boolean; code?: AdapterErrorCode; message?: string }>;
}
