import type {
  OfficialVerdictEvent,
  OfficialVerdictStatus,
  ProblemDocument,
  ProblemSourceId
} from "../core/contracts";
import { parseCodeforcesRef } from "../problems/adapters/codeforcesAdapter";
import { DEFAULT_HTTP_TIMEOUT_MS, fetchWithTimeout } from "../problems/adapters/httpClient";
import {
  fetchLatestCodeforcesVerdict,
  type CodeforcesPollDependencies
} from "./codeforcesPublicPoller";
import { validateSubmissionUrl } from "./targetRegistry";

export const PUBLIC_VERDICT_PLATFORMS: readonly ProblemSourceId[] = [
  "codeforces",
  "leetcode-cn",
  "leetcode-global",
  "atcoder"
];

export interface OjPublicHandles {
  codeforces?: string;
  leetcodeCn?: string;
  leetcodeGlobal?: string;
  atcoder?: string;
}

export interface PublicVerdictFetchDependencies {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export type PublicVerdictFetchResult =
  | {
      status: "judged";
      submissionId: string;
      dedupKey: string;
      event: OfficialVerdictEvent;
    }
  | { status: "pending" };

export type PublicVerdictPollResult =
  | {
      status: "judged";
      submissionId: string;
      dedupKey: string;
      event: OfficialVerdictEvent;
    }
  | { status: "timeout" }
  | { status: "aborted" };

export interface PublicVerdictFetchOptions {
  problem: ProblemDocument;
  handle: string;
  submittedAfterSeconds: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface PublicVerdictPollOptions {
  problem: ProblemDocument;
  handles: OjPublicHandles;
  submittedAfterSeconds: number;
  maxAttempts?: number;
  intervalMs?: number;
  timeoutMs?: number;
  signal?: AbortSignal;
}

const HANDLE_RE = /^[A-Za-z0-9_.-]{1,64}$/;
const DEFAULT_POLL_MAX_ATTEMPTS = 18;
const DEFAULT_POLL_INTERVAL_MS = 5_000;

const LEETCODE_CN_QUERY = `
query recentSubmissions($userSlug: String!) {
  recentSubmissions(userSlug: $userSlug) {
    id
    status
    lang
    submitTime
    question {
      questionFrontendId
      titleSlug
    }
  }
}
`.trim();

const LEETCODE_GLOBAL_QUERY = `
query recentSubmissionList($username: String!, $limit: Int!) {
  recentSubmissionList(username: $username, limit: $limit) {
    id
    title
    titleSlug
    statusDisplay
    lang
    timestamp
  }
}
`.trim();

export function supportsPublicVerdictSync(platform: ProblemSourceId): boolean {
  return PUBLIC_VERDICT_PLATFORMS.includes(platform);
}

export function resolveHandleForPlatform(
  handles: OjPublicHandles,
  platform: ProblemSourceId
): string | undefined {
  let raw: string | undefined;
  switch (platform) {
    case "codeforces":
      raw = handles.codeforces;
      break;
    case "leetcode-cn":
      raw = handles.leetcodeCn;
      break;
    case "leetcode-global":
      raw = handles.leetcodeGlobal;
      break;
    case "atcoder":
      raw = handles.atcoder;
      break;
    default:
      return undefined;
  }
  const trimmed = raw?.trim();
  return trimmed ? trimmed : undefined;
}

function validateHandle(handle: string, platformLabel: string): string {
  const trimmed = handle.trim();
  if (!HANDLE_RE.test(trimmed)) {
    throw new Error(`Invalid ${platformLabel} handle.`);
  }
  return trimmed;
}

function parseUnixSeconds(raw: unknown): number | undefined {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    return Math.floor(raw);
  }
  if (typeof raw === "string" && /^\d+$/.test(raw.trim())) {
    const parsed = Number.parseInt(raw.trim(), 10);
    return Number.isSafeInteger(parsed) ? parsed : undefined;
  }
  return undefined;
}

function parseSubmissionId(raw: unknown): string | undefined {
  if (typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0) {
    return String(raw);
  }
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    if (/^[A-Za-z0-9_-]{1,64}$/.test(trimmed)) {
      return trimmed;
    }
  }
  return undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}

function sleepWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
  }
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, Math.max(0, ms));
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("Aborted"), { name: "AbortError" }));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function buildPublicApiEvent(input: {
  problemKey: string;
  platform: ProblemSourceId;
  verdict: OfficialVerdictStatus;
  submissionUrl?: string;
  runtimeMs?: number;
  timestampMs?: number;
}): OfficialVerdictEvent {
  const safeUrl =
    input.submissionUrl && validateSubmissionUrl(input.submissionUrl, input.platform)
      ? input.submissionUrl
      : undefined;

  return {
    schemaVersion: "official-verdict/v2",
    source: "official_oj",
    problemKey: input.problemKey,
    platform: input.platform,
    ...(safeUrl ? { submissionUrl: safeUrl } : {}),
    verdict: input.verdict,
    ...(input.runtimeMs !== undefined ? { runtimeMs: input.runtimeMs } : {}),
    observedVia: "public_api",
    timestamp: new Date(input.timestampMs ?? Date.now()).toISOString()
  };
}

export function extractLeetCodeSlug(problem: ProblemDocument): string {
  const urlMatch = problem.canonicalUrl?.match(
    /^https:\/\/(?:www\.)?leetcode\.(?:cn|com)\/problems\/([a-z0-9-]+)/i
  );
  const candidate = (urlMatch?.[1] ?? problem.sourceId).trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(candidate)) {
    throw new Error("Unable to resolve LeetCode problem slug for verdict sync.");
  }
  return candidate;
}

export function extractAtCoderTask(problem: ProblemDocument): {
  contestId?: string;
  taskId: string;
} {
  const urlMatch = problem.canonicalUrl?.match(
    /^https:\/\/atcoder\.jp\/contests\/([a-z0-9_-]+)\/tasks\/([a-z0-9_-]+)/i
  );
  if (urlMatch?.[1] && urlMatch?.[2]) {
    return {
      contestId: urlMatch[1].toLowerCase(),
      taskId: urlMatch[2].toLowerCase()
    };
  }

  const rawId = problem.sourceId.trim().toLowerCase();
  const slashParts = rawId.split("/");
  if (slashParts.length === 2 && slashParts[0] && slashParts[1]) {
    return { contestId: slashParts[0], taskId: slashParts[1] };
  }

  const inferred = rawId.match(/^([a-z0-9-]+?)_[a-z0-9]+$/);
  if (/^[a-z0-9_-]+$/.test(rawId)) {
    return {
      ...(inferred?.[1] ? { contestId: inferred[1] } : {}),
      taskId: rawId
    };
  }

  throw new Error("Unable to resolve AtCoder task ID for verdict sync.");
}

/**
 * Maps LeetCode CN `recentSubmissions.status` codes (`A_10`, `A_11`, ...) and string names
 * into `OfficialVerdictStatus`. Returns `undefined` if still pending/judging.
 */
export function normalizeLeetCodeCnStatus(rawStatus: unknown): OfficialVerdictStatus | undefined {
  if (typeof rawStatus !== "string") {
    return undefined;
  }
  const normalized = rawStatus.trim().toUpperCase();
  if (!normalized || normalized === "PENDING" || normalized === "JUDGING" || normalized === "STARTED") {
    return undefined;
  }

  switch (normalized) {
    case "A_10":
    case "ACCEPTED":
    case "AC":
    case "OK":
      return "AC";
    case "A_11":
    case "WRONG_ANSWER":
    case "WRONG ANSWER":
    case "WA":
      return "WA";
    case "A_12":
    case "MEMORY_LIMIT_EXCEEDED":
    case "MEMORY LIMIT EXCEEDED":
    case "MLE":
      return "MLE";
    case "A_14":
    case "TIME_LIMIT_EXCEEDED":
    case "TIME LIMIT EXCEEDED":
    case "TLE":
      return "TLE";
    case "A_15":
    case "RUNTIME_ERROR":
    case "RUNTIME ERROR":
    case "RE":
      return "RE";
    case "A_20":
    case "COMPILE_ERROR":
    case "COMPILE ERROR":
    case "CE":
      return "CE";
    default:
      return "OTHER";
  }
}

export async function fetchLatestLeetCodeCnVerdict(
  options: {
    handle: string;
    titleSlug: string;
    problemKey?: string;
    submittedAfterSeconds: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  },
  deps: PublicVerdictFetchDependencies = {}
): Promise<PublicVerdictFetchResult> {
  const handle = validateHandle(options.handle, "LeetCode CN");
  const titleSlug = options.titleSlug.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(titleSlug)) {
    throw new Error("Invalid LeetCode CN titleSlug.");
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const response = await fetchWithTimeout(
    fetchImpl,
    "https://leetcode.cn/graphql/",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        origin: "https://leetcode.cn",
        referer: "https://leetcode.cn/",
        "user-agent": "AlgoCoach/1.0"
      },
      body: JSON.stringify({
        query: LEETCODE_CN_QUERY,
        variables: { userSlug: handle }
      }),
      signal: options.signal
    },
    options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`LeetCode CN verdict query returned HTTP ${response.status}`);
  }

  const body = (await response.json()) as {
    data?: { recentSubmissions?: unknown };
    errors?: Array<{ message?: unknown }>;
  };

  if (Array.isArray(body.errors) && body.errors.length > 0 && !body.data?.recentSubmissions) {
    const msg = typeof body.errors[0]?.message === "string" ? body.errors[0].message : "GraphQL error";
    throw new Error(`LeetCode CN GraphQL error: ${msg}`);
  }

  const rows = Array.isArray(body.data?.recentSubmissions) ? body.data.recentSubmissions : [];
  let latest:
    | {
        id: string;
        submitTime: number;
        status: unknown;
      }
    | undefined;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const id = parseSubmissionId(item.id);
    const submitTime = parseUnixSeconds(item.submitTime);
    const question =
      item.question && typeof item.question === "object"
        ? (item.question as Record<string, unknown>)
        : undefined;
    const rowSlug =
      typeof question?.titleSlug === "string" ? question.titleSlug.trim().toLowerCase() : "";

    if (!id || submitTime === undefined || rowSlug !== titleSlug) continue;
    if (submitTime < options.submittedAfterSeconds - 5) continue;

    if (!latest || submitTime > latest.submitTime) {
      latest = { id, submitTime, status: item.status };
    }
  }

  if (!latest) {
    return { status: "pending" };
  }

  const verdict = normalizeLeetCodeCnStatus(latest.status);
  if (!verdict) {
    return { status: "pending" };
  }

  return {
    status: "judged",
    submissionId: latest.id,
    dedupKey: `lccn-sub-${latest.id}`,
    event: buildPublicApiEvent({
      problemKey: options.problemKey ?? `leetcode-cn:${titleSlug}`,
      platform: "leetcode-cn",
      verdict,
      submissionUrl: `https://leetcode.cn/problems/${titleSlug}/submissions/`,
      timestampMs: latest.submitTime * 1000
    })
  };
}

/**
 * Maps LeetCode Global `statusDisplay` text into `OfficialVerdictStatus`.
 */
export function normalizeLeetCodeGlobalStatus(
  rawStatus: unknown
): OfficialVerdictStatus | undefined {
  if (typeof rawStatus !== "string") {
    return undefined;
  }
  const normalized = rawStatus.trim().toLowerCase();
  if (!normalized || normalized === "pending" || normalized === "judging") {
    return undefined;
  }

  switch (normalized) {
    case "accepted":
    case "ac":
      return "AC";
    case "wrong answer":
    case "wrong_answer":
    case "wa":
      return "WA";
    case "time limit exceeded":
    case "time_limit_exceeded":
    case "tle":
      return "TLE";
    case "memory limit exceeded":
    case "memory_limit_exceeded":
    case "mle":
      return "MLE";
    case "runtime error":
    case "runtime_error":
    case "re":
      return "RE";
    case "compile error":
    case "compile_error":
    case "ce":
      return "CE";
    default:
      return "OTHER";
  }
}

export async function fetchLatestLeetCodeGlobalVerdict(
  options: {
    handle: string;
    titleSlug: string;
    problemKey?: string;
    submittedAfterSeconds: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  },
  deps: PublicVerdictFetchDependencies = {}
): Promise<PublicVerdictFetchResult> {
  const handle = validateHandle(options.handle, "LeetCode Global");
  const titleSlug = options.titleSlug.trim().toLowerCase();
  if (!/^[a-z0-9-]+$/.test(titleSlug)) {
    throw new Error("Invalid LeetCode Global titleSlug.");
  }

  const fetchImpl = deps.fetchImpl ?? fetch;
  const response = await fetchWithTimeout(
    fetchImpl,
    "https://leetcode.com/graphql/",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        origin: "https://leetcode.com",
        referer: "https://leetcode.com/",
        "user-agent": "AlgoCoach/1.0"
      },
      body: JSON.stringify({
        query: LEETCODE_GLOBAL_QUERY,
        variables: { username: handle, limit: 20 }
      }),
      signal: options.signal
    },
    options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`LeetCode Global verdict query returned HTTP ${response.status}`);
  }

  const body = (await response.json()) as {
    data?: { recentSubmissionList?: unknown };
    errors?: Array<{ message?: unknown }>;
  };

  if (Array.isArray(body.errors) && body.errors.length > 0 && !body.data?.recentSubmissionList) {
    const msg = typeof body.errors[0]?.message === "string" ? body.errors[0].message : "GraphQL error";
    throw new Error(`LeetCode Global GraphQL error: ${msg}`);
  }

  const rows = Array.isArray(body.data?.recentSubmissionList)
    ? body.data.recentSubmissionList
    : [];
  let latest:
    | {
        id: string;
        timestamp: number;
        statusDisplay: unknown;
      }
    | undefined;

  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const id = parseSubmissionId(item.id);
    const timestamp = parseUnixSeconds(item.timestamp);
    const rowSlug = typeof item.titleSlug === "string" ? item.titleSlug.trim().toLowerCase() : "";

    if (!id || timestamp === undefined || rowSlug !== titleSlug) continue;
    if (timestamp < options.submittedAfterSeconds - 5) continue;

    if (!latest || timestamp > latest.timestamp) {
      latest = { id, timestamp, statusDisplay: item.statusDisplay };
    }
  }

  if (!latest) {
    return { status: "pending" };
  }

  const verdict = normalizeLeetCodeGlobalStatus(latest.statusDisplay);
  if (!verdict) {
    return { status: "pending" };
  }

  return {
    status: "judged",
    submissionId: latest.id,
    dedupKey: `lc-sub-${latest.id}`,
    event: buildPublicApiEvent({
      problemKey: options.problemKey ?? `leetcode-global:${titleSlug}`,
      platform: "leetcode-global",
      verdict,
      submissionUrl: `https://leetcode.com/submissions/detail/${encodeURIComponent(latest.id)}/`,
      timestampMs: latest.timestamp * 1000
    })
  };
}

/**
 * Maps Kenkoooo / AtCoder submission results (`AC`, `WA`, `TLE`, `MLE`, `RE`, `CE`, `WJ`, `12/40`)
 * into `OfficialVerdictStatus`. Returns `undefined` while waiting or partially judged.
 */
export function normalizeAtCoderResult(rawResult: unknown): OfficialVerdictStatus | undefined {
  if (typeof rawResult !== "string") {
    return undefined;
  }
  const normalized = rawResult.trim().toUpperCase();
  if (!normalized || normalized === "WJ" || normalized === "WR" || /^\d+\/\d+$/.test(normalized)) {
    return undefined;
  }

  switch (normalized) {
    case "AC":
      return "AC";
    case "WA":
      return "WA";
    case "TLE":
      return "TLE";
    case "MLE":
      return "MLE";
    case "RE":
      return "RE";
    case "CE":
      return "CE";
    default:
      return "OTHER";
  }
}

export async function fetchLatestAtCoderVerdict(
  options: {
    handle: string;
    taskId: string;
    contestId?: string;
    problemKey?: string;
    submittedAfterSeconds: number;
    timeoutMs?: number;
    signal?: AbortSignal;
  },
  deps: PublicVerdictFetchDependencies = {}
): Promise<PublicVerdictFetchResult> {
  const handle = validateHandle(options.handle, "AtCoder");
  const taskId = options.taskId.trim().toLowerCase();
  if (!/^[a-z0-9_-]+$/.test(taskId)) {
    throw new Error("Invalid AtCoder taskId.");
  }

  const fromSecond = Math.max(0, Math.floor(options.submittedAfterSeconds) - 5);
  const endpoint = `https://kenkoooo.com/atcoder/atcoder-api/v3/user/submissions?user=${encodeURIComponent(handle)}&from_second=${fromSecond}`;

  const fetchImpl = deps.fetchImpl ?? fetch;
  const response = await fetchWithTimeout(
    fetchImpl,
    endpoint,
    {
      method: "GET",
      headers: {
        accept: "application/json",
        "user-agent": "AlgoCoach/1.0"
      },
      signal: options.signal
    },
    options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS
  );

  if (!response.ok) {
    throw new Error(`AtCoder verdict API returned HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload)) {
    throw new Error("AtCoder verdict API returned an unexpected payload.");
  }

  let latest:
    | {
        id: string;
        numericId: number;
        epochSecond: number;
        contestId?: string;
        result: unknown;
        executionTime?: number;
      }
    | undefined;

  for (const row of payload) {
    if (!row || typeof row !== "object") continue;
    const item = row as Record<string, unknown>;
    const id = parseSubmissionId(item.id);
    const epochSecond = parseUnixSeconds(item.epoch_second);
    const problemId =
      typeof item.problem_id === "string" ? item.problem_id.trim().toLowerCase() : "";

    if (!id || epochSecond === undefined || problemId !== taskId) continue;
    if (epochSecond < options.submittedAfterSeconds - 5) continue;

    const numericId = Number.parseInt(id, 10);
    const contestId =
      typeof item.contest_id === "string" && /^[a-z0-9_-]+$/i.test(item.contest_id.trim())
        ? item.contest_id.trim().toLowerCase()
        : options.contestId;
    const executionTime =
      typeof item.execution_time === "number" &&
      Number.isFinite(item.execution_time) &&
      item.execution_time >= 0
        ? Math.floor(item.execution_time)
        : undefined;

    if (
      !latest ||
      epochSecond > latest.epochSecond ||
      (epochSecond === latest.epochSecond &&
        Number.isFinite(numericId) &&
        numericId > latest.numericId)
    ) {
      latest = {
        id,
        numericId: Number.isFinite(numericId) ? numericId : 0,
        epochSecond,
        contestId,
        result: item.result,
        executionTime
      };
    }
  }

  if (!latest) {
    return { status: "pending" };
  }

  const verdict = normalizeAtCoderResult(latest.result);
  if (!verdict) {
    return { status: "pending" };
  }

  const submissionUrl = latest.contestId
    ? `https://atcoder.jp/contests/${latest.contestId}/submissions/${encodeURIComponent(latest.id)}`
    : undefined;

  return {
    status: "judged",
    submissionId: latest.id,
    dedupKey: `ac-sub-${latest.id}`,
    event: buildPublicApiEvent({
      problemKey: options.problemKey ?? `atcoder:${taskId}`,
      platform: "atcoder",
      verdict,
      submissionUrl,
      runtimeMs: latest.executionTime,
      timestampMs: latest.epochSecond * 1000
    })
  };
}

export async function fetchLatestPublicVerdict(
  options: PublicVerdictFetchOptions,
  deps: PublicVerdictFetchDependencies = {}
): Promise<PublicVerdictFetchResult> {
  const { problem } = options;

  switch (problem.source) {
    case "codeforces": {
      const parsed =
        parseCodeforcesRef(problem.canonicalUrl ?? "") ?? parseCodeforcesRef(problem.sourceId);
      if (!parsed) {
        throw new Error("Cannot parse Codeforces contest/problem reference.");
      }
      const cfDeps: CodeforcesPollDependencies = {
        fetchImpl: deps.fetchImpl,
        sleep: deps.sleep
      };
      const result = await fetchLatestCodeforcesVerdict(
        {
          handle: options.handle,
          target: {
            contestId: parsed.contestId,
            problemIndex: parsed.index,
            contestKind: parsed.isGym ? "gym" : "contest",
            problemKey: problem.problemKey
          },
          submittedAfterSeconds: options.submittedAfterSeconds,
          timeoutMs: options.timeoutMs,
          signal: options.signal
        },
        cfDeps
      );
      if (result.status === "pending") {
        return { status: "pending" };
      }
      return {
        status: "judged",
        submissionId: String(result.submissionId),
        dedupKey: `cf-sub-${result.submissionId}`,
        event: result.event
      };
    }

    case "leetcode-cn": {
      return fetchLatestLeetCodeCnVerdict(
        {
          handle: options.handle,
          titleSlug: extractLeetCodeSlug(problem),
          problemKey: problem.problemKey,
          submittedAfterSeconds: options.submittedAfterSeconds,
          timeoutMs: options.timeoutMs,
          signal: options.signal
        },
        deps
      );
    }

    case "leetcode-global": {
      return fetchLatestLeetCodeGlobalVerdict(
        {
          handle: options.handle,
          titleSlug: extractLeetCodeSlug(problem),
          problemKey: problem.problemKey,
          submittedAfterSeconds: options.submittedAfterSeconds,
          timeoutMs: options.timeoutMs,
          signal: options.signal
        },
        deps
      );
    }

    case "atcoder": {
      const task = extractAtCoderTask(problem);
      return fetchLatestAtCoderVerdict(
        {
          handle: options.handle,
          taskId: task.taskId,
          contestId: task.contestId,
          problemKey: problem.problemKey,
          submittedAfterSeconds: options.submittedAfterSeconds,
          timeoutMs: options.timeoutMs,
          signal: options.signal
        },
        deps
      );
    }

    default:
      throw new Error(`Public verdict sync is not supported for platform: ${problem.source}`);
  }
}

export async function pollPublicOfficialVerdict(
  options: PublicVerdictPollOptions,
  deps: PublicVerdictFetchDependencies = {}
): Promise<PublicVerdictPollResult> {
  const handle = resolveHandleForPlatform(options.handles, options.problem.source);
  if (!handle) {
    throw new Error(`Missing public handle for platform ${options.problem.source}`);
  }

  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts ?? DEFAULT_POLL_MAX_ATTEMPTS));
  const intervalMs = Math.max(0, options.intervalMs ?? DEFAULT_POLL_INTERVAL_MS);
  const sleep = deps.sleep ?? sleepWithSignal;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    if (options.signal?.aborted) {
      return { status: "aborted" };
    }

    try {
      const result = await fetchLatestPublicVerdict(
        {
          problem: options.problem,
          handle,
          submittedAfterSeconds: options.submittedAfterSeconds,
          timeoutMs: options.timeoutMs,
          signal: options.signal
        },
        deps
      );

      if (result.status === "judged") {
        return result;
      }
    } catch (error) {
      if (isAbortError(error) || options.signal?.aborted) {
        return { status: "aborted" };
      }
      // Transient HTTP/network errors retry within the bounded poll window unless exhausted.
    }

    if (attempt + 1 < maxAttempts) {
      try {
        await sleep(intervalMs, options.signal);
      } catch (error) {
        if (isAbortError(error) || options.signal?.aborted) {
          return { status: "aborted" };
        }
      }
    }
  }

  return { status: "timeout" };
}
