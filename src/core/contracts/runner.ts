import type { ProblemDocument, ProblemSample, ProblemSourceId, SupportedLanguage } from "./problem";

export type SampleVerdict = "AC" | "WA" | "TLE" | "RE" | "OLE" | "CE" | "SKIPPED";

export type DiffMode = "token" | "exact" | "float-epsilon" | "json-unordered";

export interface SampleCaseResult {
  id: string;
  isOriginal: boolean;
  verdict: SampleVerdict;
  durationMs: number;
  peakMemoryKb?: number;
  input: string;
  expected?: string;
  actual: string;
  stderr: string;
  diffSummary?: string;
}

export interface LocalRunResult {
  schemaVersion: "local-run/v2";
  source: "local_runner";
  problemKey: string;
  language: SupportedLanguage;
  mode: "stdio" | "leetcode_harness";
  codeHash: string;
  compileOk: boolean;
  compileStderr?: string;
  compileTimeMs?: number;
  skippedReason?: "missing_toolchain" | "unsupported_harness" | "unsupported_language";
  allPassed: boolean;
  originalTotal: number;
  originalPassed: number;
  customTotal: number;
  customPassed: number;
  cases: SampleCaseResult[];
  memoryNote: string;
  timestamp: string;
}

export interface RunnerRequest {
  problem: ProblemDocument;
  language: SupportedLanguage;
  sourceCode: string;
  samples: ProblemSample[];
  timeoutMs?: number;
  diffMode?: DiffMode;
  floatEpsilon?: number;
  cacheDir: string;
  signal?: AbortSignal;
}

export interface ToolchainProbe {
  language: Exclude<SupportedLanguage, "generic">;
  available: boolean;
  command?: string;
  version?: string;
  installHint: string;
}

/**
 * Clean runner engine contract so P0/P1 NodeRunnerEngine can be swapped
 * seamlessly with an optional P2 Rust native sandbox sidecar (algo-judge-core).
 */
export interface RunnerEngine {
  readonly engineId: string;
  runSamples(request: RunnerRequest): Promise<LocalRunResult>;
  probeToolchains(): Promise<ToolchainProbe[]>;
}

export type OfficialVerdictStatus = "AC" | "WA" | "TLE" | "MLE" | "RE" | "CE" | "OTHER";

export interface OfficialVerdictEvent {
  schemaVersion: "official-verdict/v2";
  source: "official_oj";
  problemKey: string;
  platform: ProblemSourceId;
  submissionUrl?: string;
  verdict: OfficialVerdictStatus;
  passedTests?: number;
  runtimeMs?: number;
  memoryKb?: number;
  observedVia: "public_api" | "browser_extension" | "manual_report";
  timestamp: string;
}
