export const ojPlatformIds = ["luogu", "leetcode", "nowcoder", "codeforces", "atcoder"] as const;

export type OjPlatformId = (typeof ojPlatformIds)[number];

export const ojCapabilityNames = [
  "searchProblems",
  "fetchProblem",
  "importProblem",
  "fetchProfile",
  "listSubmissions",
  "localRun",
  "platformRun",
  "prepareSubmission",
  "commitSubmission",
  "pollSubmission"
] as const;

export type OjCapabilityName = (typeof ojCapabilityNames)[number];
export type OjCapabilityStatus = "available" | "auth_required" | "unsupported" | "disabled_by_policy" | "degraded";
export type OjOperationRisk =
  | "R0_public_read"
  | "R1_private_read"
  | "R2_local_execute"
  | "R3_prepare_write"
  | "R4_real_submit";

export interface OjSourceRef {
  kind: "official_api" | "official_open_platform" | "page_adapter" | "browser_companion" | "community_adapter" | "manual";
  adapterId: string;
  adapterVersion: string;
  fetchedAt: string;
  sourceUrl: string;
  etag?: string;
  rawRef?: string;
  confidence: "authoritative" | "derived" | "user_supplied";
}

export interface OjProblemRef {
  schemaVersion: "oj.problem-ref/v1";
  platform: OjPlatformId;
  site?: "global" | "cn";
  nativeId: string;
  canonicalId: string;
  url: string;
  contest?: { nativeId: string; index?: string };
  source: OjSourceRef;
}

export interface OjProblemSummary {
  schemaVersion: "oj.problem-summary/v1";
  ref: OjProblemRef;
  title: string;
  difficulty?: { scale: string; value?: number; label?: string };
  tags: Array<{ namespace: "platform" | "canonical"; id?: string; slug: string; name: string }>;
  contestLabel?: string;
  acceptance?: { accepted?: number; submissions?: number; ratio?: number };
  source: OjSourceRef;
}

export interface OjTextBlock {
  text: string;
  format: "markdown" | "html" | "text";
  locale: string;
  truncated: boolean;
  originalChars?: number;
  sha256: string;
}

export interface OjProblemDocument {
  schemaVersion: "oj.problem-document/v1";
  ref: OjProblemRef;
  title: string;
  locale: string;
  access: "public" | "auth_required" | "premium" | "contest_only" | "unknown";
  difficulty?: { scale: string; value?: number; label?: string };
  tags: OjProblemSummary["tags"];
  content: { statement: OjTextBlock; input?: OjTextBlock; output?: OjTextBlock; notes?: OjTextBlock };
  constraints: string[];
  samples: Array<{ ordinal: number; input: string; output: string; explanation?: string }>;
  limits: { timeMs?: number; memoryBytes?: number };
  io: { mode: "stdin_stdout" | "function" | "file" | "interactive"; inputFile?: string; outputFile?: string };
  starterCode: Array<{ languageKey: string; platformLanguageId: string; code: string }>;
  source: OjSourceRef;
}

export interface OjCapability {
  name: OjCapabilityName;
  status: OjCapabilityStatus;
  toolName?: string;
  transport: "remote_http" | "local_stdio";
  auth: "none" | "oauth2" | "api_key" | "session_cookie" | "browser";
  risk: OjOperationRisk;
  compliance: "official" | "unofficial" | "restricted" | "unknown";
  reason?: string;
  checkedAt: string;
}

export interface OjCapabilities {
  schemaVersion: "oj.capabilities/v1";
  providerId: string;
  providerVersion: string;
  platform: OjPlatformId;
  protocolVersion: string;
  operations: Record<OjCapabilityName, OjCapability>;
  languages: Array<{ languageKey: string; platformLanguageId: string; displayName: string }>;
  source: OjSourceRef;
}

export interface OjSearchResult {
  schemaVersion: "oj.search-result/v1";
  requestId: string;
  items: OjProblemSummary[];
  nextCursor?: string;
  source: OjSourceRef;
}

export interface OjProviderHealth {
  schemaVersion: "oj.provider-health/v1";
  providerId: string;
  platform: OjPlatformId;
  checkedAt: string;
  overall: "healthy" | "degraded" | "unavailable" | "auth_required";
  layers: {
    transport: "pass" | "fail";
    protocol: "pass" | "fail";
    schema: "pass" | "drift" | "unknown";
    auth: "not_required" | "valid" | "expired" | "missing" | "challenge";
    upstream: "pass" | "timeout" | "rate_limited" | "blocked" | "fail";
  };
  latencyMs?: number;
  retryAfterMs?: number;
  message: string;
}

export interface OjError {
  schemaVersion: "oj.error/v1";
  code: string;
  layer: string;
  message: string;
  retryPolicy?: string;
  userAction?: string;
  platform?: OjPlatformId;
  providerId?: string;
}

export type OjMcpTransportConfig =
  | {
      kind: "remote_http";
      endpoint: string;
      headers?: Record<string, string>;
    }
  | {
      kind: "local_stdio";
      command: string;
      args: string[];
      cwd?: string;
      env?: Record<string, string>;
    };

export interface OjProviderDescriptor {
  platform: OjPlatformId;
  label: string;
  dialect: "canonical-v1" | "luogu-v0.2";
  transport?: OjMcpTransportConfig;
  unavailableReason?: string;
}

export interface OjProviderStatusView {
  platform: OjPlatformId;
  label: string;
  configured: boolean;
  transport?: OjMcpTransportConfig["kind"];
  endpoint?: string;
  overall: "unknown" | OjProviderHealth["overall"];
  searchStatus: OjCapabilityStatus;
  fetchStatus: OjCapabilityStatus;
  message: string;
  checkedAt?: string;
}

export interface OjMcpToolResult {
  isError?: boolean;
  payload: unknown;
}

export interface OjMcpSession {
  readonly serverName?: string;
  readonly serverVersion?: string;
  listTools(timeoutMs?: number): Promise<string[]>;
  callTool(name: string, args: Record<string, unknown>, timeoutMs?: number): Promise<OjMcpToolResult>;
  close(): Promise<void>;
}

export type OjMcpSessionFactory = (descriptor: OjProviderDescriptor) => Promise<OjMcpSession>;
