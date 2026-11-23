import type { OfficialVerdictEvent, OfficialVerdictStatus } from "../core/contracts";
import { DEFAULT_HTTP_TIMEOUT_MS, fetchWithTimeout } from "../problems/adapters/httpClient";
import { validateSubmissionUrl } from "./targetRegistry";

export interface CodeforcesSubmissionTarget {
  contestId: number;
  problemIndex: string;
  contestKind?: "contest" | "gym";
  problemKey?: string;
}

export interface CodeforcesPollOptions {
  handle: string;
  target: CodeforcesSubmissionTarget;
  /** Unix timestamp in seconds when user triggered submit (matches submissions >= submittedAfterSeconds - 5). */
  submittedAfterSeconds: number;
  maxAttempts?: number;
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface CodeforcesPollDependencies {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export type CodeforcesPollResult =
  | {
      status: "judged";
      submissionId: number;
      event: OfficialVerdictEvent;
    }
  | { status: "timeout" }
  | { status: "aborted" };

interface RawCfSubmission {
  id?: unknown;
  contestId?: unknown;
  creationTimeSeconds?: unknown;
  problem?: { index?: unknown };
  verdict?: unknown;
  passedTestCount?: unknown;
  timeConsumingMillis?: unknown;
  memoryConsumedBytes?: unknown;
}

interface ParsedCfSubmission {
  id: number;
  contestId: number;
  creationTimeSeconds: number;
  problemIndex: string;
  verdict?: string;
  passedTestCount?: number;
  timeConsumingMillis?: number;
  memoryConsumedBytes?: number;
}

interface CfUserStatusResponse {
  status?: unknown;
  comment?: unknown;
  result?: unknown;
}

const HANDLE_RE = /^[A-Za-z0-9_.-]{1,64}$/;

/**
 * Maps official Codeforces API verdict strings into Algo Coach v2 `OfficialVerdictStatus`.
 * Returns `undefined` while submission is still in queue / `TESTING` / `SUBMITTED`.
 */
export function normalizeCodeforcesVerdict(
  rawVerdict: string | undefined
): OfficialVerdictStatus | undefined {
  if (!rawVerdict || rawVerdict === "TESTING" || rawVerdict === "SUBMITTED") {
    return undefined;
  }

  switch (rawVerdict) {
    case "OK":
      return "AC";
    case "WRONG_ANSWER":
      return "WA";
    case "TIME_LIMIT_EXCEEDED":
    case "IDLENESS_LIMIT_EXCEEDED":
      return "TLE";
    case "MEMORY_LIMIT_EXCEEDED":
      return "MLE";
    case "COMPILATION_ERROR":
      return "CE";
    case "RUNTIME_ERROR":
    case "FAILED":
    case "CRASHED":
    case "SECURITY_VIOLATED":
      return "RE";
    default:
      return "OTHER";
  }
}

function parseRawSubmission(item: unknown): ParsedCfSubmission | undefined {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return undefined;
  }
  const s = item as RawCfSubmission;
  if (
    typeof s.id !== "number" ||
    typeof s.contestId !== "number" ||
    typeof s.creationTimeSeconds !== "number" ||
    typeof s.problem?.index !== "string"
  ) {
    return undefined;
  }
  return {
    id: s.id,
    contestId: s.contestId,
    creationTimeSeconds: s.creationTimeSeconds,
    problemIndex: s.problem.index.toUpperCase(),
    ...(typeof s.verdict === "string" ? { verdict: s.verdict } : {}),
    ...(typeof s.passedTestCount === "number" ? { passedTestCount: s.passedTestCount } : {}),
    ...(typeof s.timeConsumingMillis === "number"
      ? { timeConsumingMillis: s.timeConsumingMillis }
      : {}),
    ...(typeof s.memoryConsumedBytes === "number"
      ? { memoryConsumedBytes: s.memoryConsumedBytes }
      : {})
  };
}

function buildSubmissionUrl(target: CodeforcesSubmissionTarget, submissionId: number): string {
  const prefix = target.contestKind === "gym" ? "gym" : "contest";
  return `https://codeforces.com/${prefix}/${target.contestId}/submission/${submissionId}`;
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function buildOfficialVerdictEvent(
  target: CodeforcesSubmissionTarget,
  submission: ParsedCfSubmission,
  verdict: OfficialVerdictStatus
): OfficialVerdictEvent {
  const normalizedIndex = target.problemIndex.toUpperCase();
  const problemKey =
    target.problemKey ??
    (target.contestKind === "gym"
      ? `cf:gym:${target.contestId}${normalizedIndex}`
      : `cf:${target.contestId}${normalizedIndex}`);

  const url = buildSubmissionUrl(target, submission.id);
  const safeSubmissionUrl = validateSubmissionUrl(url, "codeforces") ? url : undefined;
  const memoryKb =
    submission.memoryConsumedBytes !== undefined
      ? Math.round(submission.memoryConsumedBytes / 1024)
      : undefined;

  return {
    schemaVersion: "official-verdict/v2",
    source: "official_oj",
    problemKey,
    platform: "codeforces",
    ...(safeSubmissionUrl ? { submissionUrl: safeSubmissionUrl } : {}),
    verdict,
    ...(submission.passedTestCount !== undefined ? { passedTests: submission.passedTestCount } : {}),
    ...(submission.timeConsumingMillis !== undefined
      ? { runtimeMs: submission.timeConsumingMillis }
      : {}),
    ...(memoryKb !== undefined ? { memoryKb } : {}),
    observedVia: "public_api",
    timestamp: new Date(submission.creationTimeSeconds * 1000).toISOString()
  };
}

/**
 * Single-shot check against the zero-login public Codeforces `user.status` API.
 */
export async function fetchLatestCodeforcesVerdict(
  options: Pick<
    CodeforcesPollOptions,
    "handle" | "target" | "submittedAfterSeconds" | "timeoutMs" | "signal"
  >,
  dependencies: Pick<CodeforcesPollDependencies, "fetchImpl"> = {}
): Promise<{ status: "judged"; submissionId: number; event: OfficialVerdictEvent } | { status: "pending" }> {
  const handle = options.handle.trim();
  if (!HANDLE_RE.test(handle)) {
    throw new Error(`Invalid Codeforces handle: "${options.handle}".`);
  }

  const fetchImpl = dependencies.fetchImpl ?? fetch;
  const endpoint = `https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=20`;
  const response = await fetchWithTimeout(
    fetchImpl,
    endpoint,
    {
      headers: { accept: "application/json" },
      signal: options.signal
    },
    options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`Codeforces user.status request failed with HTTP ${response.status}.`);
  }

  const payload = (await response.json()) as CfUserStatusResponse;
  if (payload.status !== "OK" || !Array.isArray(payload.result)) {
    throw new Error(
      `Codeforces user.status returned invalid payload: ${String(payload.comment ?? payload.status)}`
    );
  }

  const wantedIndex = options.target.problemIndex.toUpperCase();
  const matched = payload.result
    .map(parseRawSubmission)
    .find(
      (candidate): candidate is ParsedCfSubmission =>
        candidate !== undefined &&
        candidate.contestId === options.target.contestId &&
        candidate.problemIndex === wantedIndex &&
        candidate.creationTimeSeconds >= options.submittedAfterSeconds - 5
    );

  if (!matched) {
    return { status: "pending" };
  }

  const verdict = normalizeCodeforcesVerdict(matched.verdict);
  if (!verdict) {
    return { status: "pending" };
  }

  return {
    status: "judged",
    submissionId: matched.id,
    event: buildOfficialVerdictEvent(options.target, matched, verdict)
  };
}

/**
 * Zero-login, zero-cookie poller for official Codeforces verdicts via `user.status` public API.
 */
export async function pollCodeforcesOfficialVerdict(
  options: CodeforcesPollOptions,
  dependencies: CodeforcesPollDependencies = {}
): Promise<CodeforcesPollResult> {
  const handle = options.handle.trim();
  if (!HANDLE_RE.test(handle)) {
    throw new Error(`Invalid Codeforces handle: "${options.handle}".`);
  }

  const sleep = dependencies.sleep ?? defaultSleep;
  const maxAttempts = Math.max(1, options.maxAttempts ?? 24);
  const intervalMs = Math.max(2000, options.intervalMs ?? 2500);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      return { status: "aborted" };
    }

    const res = await fetchLatestCodeforcesVerdict(
      {
        handle,
        target: options.target,
        submittedAfterSeconds: options.submittedAfterSeconds,
        timeoutMs: options.timeoutMs,
        signal: options.signal
      },
      dependencies
    );

    if (res.status === "judged") {
      return res;
    }

    if (attempt + 1 < maxAttempts) {
      await sleep(intervalMs, options.signal);
    }
  }

  return options.signal?.aborted ? { status: "aborted" } : { status: "timeout" };
}
