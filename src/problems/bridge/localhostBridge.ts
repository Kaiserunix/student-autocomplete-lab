import { createHash } from "node:crypto";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type {
  DocumentCompleteness,
  FunctionSignatureMeta,
  ProblemDocument,
  ProblemSample,
  ProblemSourceId
} from "../../core/contracts";
import { parseCodeforcesRef } from "../adapters/codeforcesAdapter";
import { normalizeLuoguPid } from "../adapters/luoguAdapter";
import type {
  OfficialVerdictEvent,
  OfficialVerdictStatus
} from "../../core/contracts";
import {
  PLATFORM_HTTPS_HOST_WHITELIST,
  validateSubmissionUrl
} from "../../submitBridge/targetRegistry";

/**
 * Standard Competitive Companion JSON payload plus optional Algo Coach extension fields
 * (`statementMarkdown`, `rawTags`, `functionMeta`).
 */
export interface CompetitiveCompanionPayload {
  name?: string;
  group?: string;
  url?: string;
  interactive?: boolean;
  memoryLimit?: number;
  timeLimit?: number;
  tests?: Array<{
    input?: string;
    output?: string;
  }>;
  testType?: string;
  input?: { type?: string; fileName?: string };
  output?: { type?: string; fileName?: string };
  batch?: { id?: string; size?: number };
  /** Optional statement Markdown sent by companion browser bridge or userscript. */
  statementMarkdown?: string;
  rawTags?: string[];
  functionMeta?: FunctionSignatureMeta;
}

export interface LocalhostBridgeOptions {
  /** Preferred port to listen on (default 27121). Pass 0 for OS-assigned ephemeral port. */
  preferredPort?: number;
  /** How many sequential ports to attempt on EADDRINUSE (default 10). */
  maxPortAttempts?: number;
  /** Maximum JSON request body bytes (default 2 MiB). */
  maxBodyBytes?: number;
  /** Optional pairing token; if set, POST requests must include header `x-algo-coach-token`. */
  pairingToken?: string;
  /** Dedicated token for authenticated POST /verdict requests (falls back to pairingToken if unset). */
  verdictToken?: string;
  onProblem?: (doc: ProblemDocument, raw: CompetitiveCompanionPayload) => void | Promise<void>;
  onVerdict?: (verdict: NormalizedBridgeVerdict) => void | Promise<void>;
}

export interface BridgeVerdictPayload {
  platform?: ProblemSourceId | string;
  sourceId?: string;
  problemKey?: string;
  problemUrl?: string;
  submissionUrl?: string;
  submissionId?: string | number;
  verdict: string;
  passedTests?: number;
  runtimeMs?: number;
  memoryKb?: number;
  timestamp?: string;
}

export interface NormalizedBridgeVerdict {
  event: OfficialVerdictEvent;
  sourceId?: string;
  submissionId?: string;
  dedupKey?: string;
}

const VERDICT_OJ_HOSTS = new Set<string>(
  Object.values(PLATFORM_HTTPS_HOST_WHITELIST).flat()
);

function isSupportedVerdictPlatform(
  platform: string
): platform is keyof typeof PLATFORM_HTTPS_HOST_WHITELIST {
  return Object.prototype.hasOwnProperty.call(PLATFORM_HTTPS_HOST_WHITELIST, platform);
}

/**
 * Validates browser `Origin` headers for `/verdict` preflight and POST requests.
 * Only exact HTTPS origins of the 6 supported OJs or browser extension origins are allowed.
 */
export function isAllowedVerdictCorsOrigin(origin: string | undefined): boolean {
  if (!origin || typeof origin !== "string") {
    return false;
  }
  const trimmed = origin.trim();
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return false;
  }

  if (parsed.protocol === "chrome-extension:" || parsed.protocol === "moz-extension:") {
    return (
      /^[a-z0-9-]+$/i.test(parsed.hostname) &&
      (parsed.pathname === "" || parsed.pathname === "/") &&
      !parsed.search &&
      !parsed.hash &&
      !parsed.port &&
      trimmed === `${parsed.protocol}//${parsed.hostname}`
    );
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.port ||
    parsed.origin !== trimmed
  ) {
    return false;
  }

  return VERDICT_OJ_HOSTS.has(parsed.hostname.toLowerCase());
}

/**
 * Normalizes human-readable OJ verdict labels sent by the companion userscript
 * into `OfficialVerdictStatus`. Returns `undefined` for blank or pending states.
 */
export function normalizeBridgeVerdictText(rawVerdict: unknown): OfficialVerdictStatus | undefined {
  if (typeof rawVerdict !== "string") {
    return undefined;
  }
  const trimmed = rawVerdict.trim();
  if (!trimmed) {
    return undefined;
  }
  const upper = trimmed.toUpperCase();
  if (
    upper === "PENDING" ||
    upper === "JUDGING" ||
    upper === "WAITING" ||
    upper === "WJ" ||
    upper === "TESTING" ||
    upper === "SUBMITTED" ||
    trimmed.includes("评测中") ||
    trimmed.includes("等待评测")
  ) {
    return undefined;
  }

  if (
    upper === "AC" ||
    upper === "OK" ||
    upper === "ACCEPTED" ||
    trimmed.includes("通过") ||
    trimmed.includes("答案正确")
  ) {
    return "AC";
  }
  if (
    upper === "WA" ||
    upper === "WRONG ANSWER" ||
    upper === "WRONG_ANSWER" ||
    trimmed.includes("解答错误") ||
    trimmed.includes("答案错误")
  ) {
    return "WA";
  }
  if (
    upper === "TLE" ||
    upper === "TIME LIMIT EXCEEDED" ||
    upper === "TIME_LIMIT_EXCEEDED" ||
    trimmed.includes("超出时间限制") ||
    trimmed.includes("运行超时")
  ) {
    return "TLE";
  }
  if (
    upper === "MLE" ||
    upper === "MEMORY LIMIT EXCEEDED" ||
    upper === "MEMORY_LIMIT_EXCEEDED" ||
    trimmed.includes("超出内存限制") ||
    trimmed.includes("内存超限")
  ) {
    return "MLE";
  }
  if (
    upper === "RE" ||
    upper === "RUNTIME ERROR" ||
    upper === "RUNTIME_ERROR" ||
    trimmed.includes("执行出错") ||
    trimmed.includes("运行错误")
  ) {
    return "RE";
  }
  if (
    upper === "CE" ||
    upper === "COMPILE ERROR" ||
    upper === "COMPILER ERROR" ||
    upper === "COMPILATION ERROR" ||
    upper === "COMPILATION_ERROR" ||
    trimmed.includes("编译出错") ||
    trimmed.includes("编译错误")
  ) {
    return "CE";
  }
  if (upper === "OTHER" || upper === "OLE" || upper === "PRESENTATION ERROR") {
    return "OTHER";
  }
  return undefined;
}

function normalizeNonNegativeInt(raw: unknown): number | undefined {
  if (typeof raw !== "number" || !Number.isFinite(raw) || raw < 0) {
    return undefined;
  }
  return Math.floor(raw);
}

/**
 * Validates and normalizes an incoming browser companion payload into an `OfficialVerdictEvent`.
 */
export function normalizeBridgeVerdictPayload(raw: unknown): NormalizedBridgeVerdict | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return null;
  }
  const item = raw as Record<string, unknown>;
  const verdict = normalizeBridgeVerdictText(item.verdict);
  if (!verdict) {
    return null;
  }

  const rawUrl =
    typeof item.problemUrl === "string" && item.problemUrl.trim()
      ? item.problemUrl.trim()
      : typeof item.submissionUrl === "string" && item.submissionUrl.trim()
        ? item.submissionUrl.trim()
        : undefined;
  const inferred = rawUrl ? inferProblemIdentityFromUrl(rawUrl, "") : undefined;

  const explicitPlatform =
    typeof item.platform === "string" ? item.platform.trim().toLowerCase() : "";
  const platformCandidate = explicitPlatform || (inferred?.source ?? "");
  if (!isSupportedVerdictPlatform(platformCandidate)) {
    return null;
  }
  const platform: ProblemSourceId = platformCandidate;

  const explicitProblemKey =
    typeof item.problemKey === "string" &&
    item.problemKey.trim().startsWith(`${platform}:`) &&
    !/\s/.test(item.problemKey.trim())
      ? item.problemKey.trim()
      : undefined;

  const rawSourceId =
    typeof item.sourceId === "string" && item.sourceId.trim() && !/\s/.test(item.sourceId.trim())
      ? item.sourceId.trim()
      : undefined;

  const inferredSourceId =
    inferred && inferred.source === platform && inferred.sourceId ? inferred.sourceId : undefined;
  const keyDerivedSourceId = explicitProblemKey
    ? explicitProblemKey.slice(platform.length + 1)
    : undefined;
  const sourceId = rawSourceId ?? inferredSourceId ?? keyDerivedSourceId;

  const problemKey =
    explicitProblemKey ??
    (inferred && inferred.source === platform ? inferred.problemKey : undefined) ??
    (sourceId ? `${platform}:${sourceId}` : undefined);

  if (!problemKey) {
    return null;
  }

  const submissionUrl =
    typeof item.submissionUrl === "string" &&
    validateSubmissionUrl(item.submissionUrl.trim(), platform)
      ? item.submissionUrl.trim()
      : undefined;

  let submissionId: string | undefined;
  if (typeof item.submissionId === "number" && Number.isSafeInteger(item.submissionId) && item.submissionId > 0) {
    submissionId = String(item.submissionId);
  } else if (
    typeof item.submissionId === "string" &&
    /^[A-Za-z0-9_-]{1,64}$/.test(item.submissionId.trim())
  ) {
    submissionId = item.submissionId.trim();
  }

  const passedTests = normalizeNonNegativeInt(item.passedTests);
  const runtimeMs = normalizeNonNegativeInt(item.runtimeMs);
  const memoryKb = normalizeNonNegativeInt(item.memoryKb);
  const timestamp =
    typeof item.timestamp === "string" && !Number.isNaN(Date.parse(item.timestamp))
      ? new Date(item.timestamp).toISOString()
      : new Date().toISOString();

  return {
    event: {
      schemaVersion: "official-verdict/v2",
      source: "official_oj",
      problemKey,
      platform,
      ...(submissionUrl ? { submissionUrl } : {}),
      verdict,
      ...(passedTests !== undefined ? { passedTests } : {}),
      ...(runtimeMs !== undefined ? { runtimeMs } : {}),
      ...(memoryKb !== undefined ? { memoryKb } : {}),
      observedVia: "browser_extension",
      timestamp
    },
    ...(sourceId ? { sourceId } : {}),
    ...(submissionId ? { submissionId, dedupKey: `bridge-${platform}-${submissionId}` } : {})
  };
}

const DEFAULT_BRIDGE_PORT = 27121;
const DEFAULT_MAX_PORT_ATTEMPTS = 10;
const DEFAULT_MAX_BODY_BYTES = 2 * 1024 * 1024;

/**
 * Strict DNS Rebinding guard: validates HTTP Host header belongs strictly to local loopback.
 */
export function isAllowedLoopbackHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) {
    return false;
  }
  const normalized = hostHeader.trim().toLowerCase();
  return (
    /^127\.0\.0\.1(?::\d{1,5})?$/.test(normalized) ||
    /^localhost(?::\d{1,5})?$/.test(normalized) ||
    /^\[::1\](?::\d{1,5})?$/.test(normalized)
  );
}

function isLoopbackRemoteAddress(addr: string | undefined): boolean {
  if (!addr) {
    return false;
  }
  return addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";
}

function inferProblemIdentityFromUrl(
  url: string | undefined,
  fallbackName: string
): { source: ProblemSourceId; sourceId: string; problemKey: string; canonicalUrl?: string } {
  const trimmedUrl = url?.trim();
  if (trimmedUrl) {
    // Codeforces
    const cf = parseCodeforcesRef(trimmedUrl);
    if (cf) {
      return {
        source: "codeforces",
        sourceId: cf.sourceId,
        problemKey: `cf:${cf.sourceId}`,
        canonicalUrl: cf.canonicalUrl
      };
    }

    try {
      const parsed = new URL(trimmedUrl);
      const host = parsed.hostname.toLowerCase();

      // AtCoder
      if (host === "atcoder.jp") {
        const atMatch = parsed.pathname.match(/^\/contests\/([a-z0-9_-]+)\/tasks\/([a-z0-9_-]+)/i);
        if (atMatch?.[1] && atMatch?.[2]) {
          const taskId = atMatch[2].toLowerCase();
          return {
            source: "atcoder",
            sourceId: taskId,
            problemKey: `atcoder:${taskId}`,
            canonicalUrl: `https://atcoder.jp/contests/${atMatch[1].toLowerCase()}/tasks/${taskId}`
          };
        }
      }

      // Luogu
      if (host === "www.luogu.com.cn" || host === "luogu.com.cn") {
        const lgMatch = parsed.pathname.match(/^\/problem\/([A-Za-z0-9_]+)/);
        if (lgMatch?.[1]) {
          const pid = normalizeLuoguPid(lgMatch[1]);
          return {
            source: "luogu",
            sourceId: pid,
            problemKey: `luogu:${pid}`,
            canonicalUrl: `https://www.luogu.com.cn/problem/${encodeURIComponent(pid)}`
          };
        }
      }

      // NowCoder
      if (host === "ac.nowcoder.com" || host === "www.nowcoder.com" || host === "nowcoder.com") {
        const acmProb = parsed.pathname.match(/^\/acm\/problem\/(\d+)/i);
        if (acmProb?.[1]) {
          return {
            source: "nowcoder",
            sourceId: `acm-${acmProb[1]}`,
            problemKey: `nowcoder:acm-${acmProb[1]}`,
            canonicalUrl: `https://ac.nowcoder.com/acm/problem/${acmProb[1]}`
          };
        }
        const acmContest = parsed.pathname.match(/^\/acm\/contest\/(\d+)\/([A-Za-z0-9]+)/i);
        if (acmContest?.[1] && acmContest?.[2]) {
          const id = `contest-${acmContest[1]}-${acmContest[2].toUpperCase()}`;
          return {
            source: "nowcoder",
            sourceId: id,
            problemKey: `nowcoder:${id}`,
            canonicalUrl: `https://ac.nowcoder.com/acm/contest/${acmContest[1]}/${acmContest[2].toUpperCase()}`
          };
        }
        const practice = parsed.pathname.match(/^\/(?:practice|questionTerminal)\/([a-f0-9]+)/i);
        if (practice?.[1]) {
          const id = `practice-${practice[1].toLowerCase()}`;
          return {
            source: "nowcoder",
            sourceId: id,
            problemKey: `nowcoder:${id}`,
            canonicalUrl: `https://www.nowcoder.com/practice/${practice[1].toLowerCase()}`
          };
        }
      }

      // LeetCode Global / CN
      if (host === "leetcode.com" || host === "www.leetcode.com" || host === "leetcode.cn" || host === "www.leetcode.cn") {
        const lcMatch = parsed.pathname.match(/^\/problems\/([a-z0-9-]+)/i);
        if (lcMatch?.[1]) {
          const slug = lcMatch[1].toLowerCase();
          const isCn = host.endsWith("leetcode.cn");
          return {
            source: isCn ? "leetcode-cn" : "leetcode-global",
            sourceId: slug,
            problemKey: `${isCn ? "lc-cn" : "lc-global"}:${slug}`,
            canonicalUrl: `https://${isCn ? "leetcode.cn" : "leetcode.com"}/problems/${slug}/`
          };
        }
      }
    } catch {
      // Fallback below
    }
  }

  const hash = createHash("sha256")
    .update(trimmedUrl || fallbackName || "bridge-problem")
    .digest("hex")
    .slice(0, 10);
  return {
    source: "local-markdown",
    sourceId: `bridge-${hash}`,
    problemKey: `local:bridge-${hash}`,
    ...(trimmedUrl && /^https?:\/\//i.test(trimmedUrl) ? { canonicalUrl: trimmedUrl } : {})
  };
}

export function normalizeCompetitiveCompanionPayload(
  payload: CompetitiveCompanionPayload
): ProblemDocument {
  const title = (payload.name ?? "").trim() || "Untitled Bridge Problem";
  const identity = inferProblemIdentityFromUrl(payload.url, title);

  const samples: ProblemSample[] = Array.isArray(payload.tests)
    ? payload.tests
        .filter((t) => t && typeof t === "object" && typeof t.input === "string")
        .map((t, idx) => ({
          id: `sample-${idx + 1}`,
          input: (t.input ?? "").replace(/\r\n/g, "\n").replace(/\n+$/, ""),
          ...(typeof t.output === "string"
            ? { expectedOutput: t.output.replace(/\r\n/g, "\n").replace(/\n+$/, "") }
            : {}),
          isOriginal: true
        }))
    : [];

  const statementMarkdown =
    typeof payload.statementMarkdown === "string" && payload.statementMarkdown.trim().length > 0
      ? payload.statementMarkdown.replace(/\r\n/g, "\n").trim()
      : undefined;

  const completeness: DocumentCompleteness = statementMarkdown
    ? "full"
    : samples.length > 0
      ? "samples_only"
      : "metadata_only";

  const ioMode = payload.interactive
    ? "interactive"
    : identity.source === "leetcode-cn" || identity.source === "leetcode-global"
      ? "function"
      : "stdio";

  const timeLimitMs =
    typeof payload.timeLimit === "number" && Number.isFinite(payload.timeLimit) && payload.timeLimit > 0
      ? Math.round(payload.timeLimit)
      : undefined;
  const memoryLimitMb =
    typeof payload.memoryLimit === "number" && Number.isFinite(payload.memoryLimit) && payload.memoryLimit > 0
      ? Math.round(payload.memoryLimit)
      : undefined;

  const rawTags: string[] = [];
  if (Array.isArray(payload.rawTags)) {
    for (const tag of payload.rawTags) {
      if (typeof tag === "string" && tag.trim()) {
        rawTags.push(tag.trim());
      }
    }
  }
  if (typeof payload.group === "string" && payload.group.trim()) {
    rawTags.push(payload.group.trim());
  }

  const locale =
    /[\u4e00-\u9fff]/.test(`${title} ${statementMarkdown ?? ""}`) ? "zh-CN" : "en-US";

  return {
    schemaVersion: "problem-doc/v2",
    problemKey: identity.problemKey,
    source: identity.source,
    sourceId: identity.sourceId,
    ...(identity.canonicalUrl ? { canonicalUrl: identity.canonicalUrl } : {}),
    title,
    locale,
    completeness,
    ioMode,
    ...(statementMarkdown ? { statementMarkdown } : {}),
    samples,
    ...(payload.functionMeta ? { functionMeta: payload.functionMeta } : {}),
    ...(timeLimitMs !== undefined || memoryLimitMb !== undefined
      ? {
          constraints: {
            ...(timeLimitMs !== undefined ? { timeLimitMs } : {}),
            ...(memoryLimitMb !== undefined ? { memoryLimitMb } : {})
          }
        }
      : {}),
    rawTags: [...new Set(rawTags)],
    provenance: {
      ingestChannel: "localhost-bridge",
      fetchedAt: new Date().toISOString()
    }
  };
}

export class LocalhostBridge {
  private readonly preferredPort: number;
  private readonly maxPortAttempts: number;
  private readonly maxBodyBytes: number;
  private readonly pairingToken?: string;
  private readonly verdictToken?: string;
  private readonly onProblem?: (
    doc: ProblemDocument,
    raw: CompetitiveCompanionPayload
  ) => void | Promise<void>;
  private readonly onVerdict?: (verdict: NormalizedBridgeVerdict) => void | Promise<void>;

  private server: Server | null = null;
  private boundPort: number | null = null;
  private readonly receivedProblems: ProblemDocument[] = [];
  private readonly receivedVerdicts: OfficialVerdictEvent[] = [];

  constructor(options: LocalhostBridgeOptions = {}) {
    this.preferredPort = options.preferredPort ?? DEFAULT_BRIDGE_PORT;
    this.maxPortAttempts = Math.max(1, options.maxPortAttempts ?? DEFAULT_MAX_PORT_ATTEMPTS);
    this.maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    this.pairingToken = options.pairingToken;
    this.verdictToken = options.verdictToken;
    this.onProblem = options.onProblem;
    this.onVerdict = options.onVerdict;
  }

  getPort(): number | null {
    return this.boundPort;
  }

  isRunning(): boolean {
    return this.server !== null && this.boundPort !== null;
  }

  getReceivedProblems(): ProblemDocument[] {
    return [...this.receivedProblems];
  }

  getReceivedVerdicts(): OfficialVerdictEvent[] {
    return [...this.receivedVerdicts];
  }

  async start(): Promise<number> {
    if (this.server && this.boundPort !== null) {
      return this.boundPort;
    }

    const attempts = this.preferredPort === 0 ? 1 : this.maxPortAttempts;
    let lastError: unknown;

    for (let offset = 0; offset < attempts; offset += 1) {
      const candidatePort = this.preferredPort === 0 ? 0 : this.preferredPort + offset;
      try {
        const port = await this.listenOnPort(candidatePort);
        this.boundPort = port;
        return port;
      } catch (error) {
        lastError = error;
        const code = (error as NodeJS.ErrnoException)?.code;
        if (code === "EADDRINUSE" && offset + 1 < attempts) {
          continue;
        }
        throw error;
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Failed to bind LocalhostBridge to any available 127.0.0.1 port.");
  }

  async stop(): Promise<void> {
    const srv = this.server;
    this.server = null;
    this.boundPort = null;
    if (!srv) {
      return;
    }
    await new Promise<void>((resolve, reject) => {
      srv.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  private listenOnPort(port: number): Promise<number> {
    return new Promise<number>((resolve, reject) => {
      const srv = createServer((req, res) => {
        void this.handleRequest(req, res);
      });

      const onError = (err: Error) => {
        srv.removeListener("listening", onListening);
        reject(err);
      };

      const onListening = () => {
        srv.removeListener("error", onError);
        this.server = srv;
        const addr = srv.address();
        const actualPort = typeof addr === "object" && addr ? addr.port : port;
        resolve(actualPort);
      };

      srv.once("error", onError);
      srv.once("listening", onListening);
      srv.listen(port, "127.0.0.1");
    });
  }

  private applyVerdictCorsHeaders(res: ServerResponse, origin: string | undefined): boolean {
    if (!origin) {
      return true;
    }
    if (!isAllowedVerdictCorsOrigin(origin)) {
      return false;
    }
    res.setHeader("access-control-allow-origin", origin);
    res.setHeader("vary", "Origin");
    res.setHeader("access-control-allow-methods", "POST, OPTIONS");
    res.setHeader("access-control-allow-headers", "content-type, x-algo-coach-token");
    return true;
  }

  private async handleVerdictPost(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const rawOrigin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
    if (!this.applyVerdictCorsHeaders(res, rawOrigin)) {
      this.sendJson(res, 403, { ok: false, error: "Forbidden: untrusted Origin for /verdict." });
      return;
    }

    const expectedToken = this.verdictToken ?? this.pairingToken;
    const suppliedToken = req.headers["x-algo-coach-token"];
    if (!expectedToken || suppliedToken !== expectedToken) {
      this.sendJson(res, 401, { ok: false, error: "Unauthorized: invalid verdict token." });
      return;
    }

    let rawBody: string;
    try {
      rawBody = await this.readBodyWithLimit(req);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const status = /limit|large|413/i.test(msg) ? 413 : 400;
      this.sendJson(res, status, { ok: false, error: msg });
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawBody);
    } catch {
      this.sendJson(res, 400, { ok: false, error: "Invalid JSON payload." });
      return;
    }

    const normalized = normalizeBridgeVerdictPayload(parsed);
    if (!normalized) {
      this.sendJson(res, 400, { ok: false, error: "Unsupported or incomplete verdict payload." });
      return;
    }

    this.receivedVerdicts.push(normalized.event);
    await this.onVerdict?.(normalized);
    this.sendJson(res, 200, {
      ok: true,
      route: "/verdict",
      problemKey: normalized.event.problemKey,
      verdict: normalized.event.verdict
    });
  }

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // 1. Strict DNS Rebinding & loopback defense
    if (!isAllowedLoopbackHost(req.headers.host) || !isLoopbackRemoteAddress(req.socket.remoteAddress)) {
      this.sendJson(res, 403, { ok: false, error: "Forbidden: invalid Host or non-loopback origin." });
      return;
    }

    const pathname = (req.url ?? "/").split("?")[0] || "/";

    if (req.method === "OPTIONS" && pathname === "/verdict") {
      const rawOrigin = typeof req.headers.origin === "string" ? req.headers.origin : undefined;
      if (!this.applyVerdictCorsHeaders(res, rawOrigin)) {
        this.sendJson(res, 403, { ok: false, error: "Forbidden: untrusted Origin." });
        return;
      }
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.method === "GET" && (pathname === "/health" || pathname === "/")) {
      this.sendJson(res, 200, {
        ok: true,
        service: "algo-coach-localhost-bridge",
        port: this.boundPort,
        verdictEndpoint: Boolean(this.verdictToken ?? this.pairingToken)
      });
      return;
    }

    if (req.method !== "POST") {
      this.sendJson(res, 405, { ok: false, error: "Method Not Allowed. Send POST JSON payload." });
      return;
    }

    if (pathname === "/verdict") {
      await this.handleVerdictPost(req, res);
      return;
    }

    if (pathname !== "/") {
      this.sendJson(res, 404, { ok: false, error: "Not Found." });
      return;
    }

    if (this.pairingToken) {
      const supplied = req.headers["x-algo-coach-token"];
      if (supplied !== this.pairingToken) {
        this.sendJson(res, 401, { ok: false, error: "Unauthorized: invalid pairing token." });
        return;
      }
    }

    let rawBody: string;
    try {
      rawBody = await this.readBodyWithLimit(req);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const status = msg === "PAYLOAD_TOO_LARGE" ? 413 : 400;
      this.sendJson(res, status, { ok: false, error: msg });
      return;
    }

    let parsed: CompetitiveCompanionPayload;
    try {
      const json = JSON.parse(rawBody) as unknown;
      if (!json || typeof json !== "object" || Array.isArray(json)) {
        throw new Error("Body must be a JSON object.");
      }
      parsed = json as CompetitiveCompanionPayload;
    } catch {
      this.sendJson(res, 400, { ok: false, error: "Invalid JSON payload." });
      return;
    }

    const doc = normalizeCompetitiveCompanionPayload(parsed);
    this.receivedProblems.push(doc);
    if (this.receivedProblems.length > 50) {
      this.receivedProblems.shift();
    }

    if (this.onProblem) {
      try {
        await this.onProblem(doc, parsed);
      } catch (error) {
        this.sendJson(res, 500, {
          ok: false,
          error: `Bridge handler error: ${error instanceof Error ? error.message : String(error)}`
        });
        return;
      }
    }

    this.sendJson(res, 200, {
      ok: true,
      problemKey: doc.problemKey,
      completeness: doc.completeness,
      sampleCount: doc.samples.length
    });
  }

  private readBodyWithLimit(req: IncomingMessage): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let totalBytes = 0;
      let settled = false;

      req.on("data", (chunk: Buffer) => {
        if (settled) return;
        totalBytes += chunk.length;
        if (totalBytes > this.maxBodyBytes) {
          settled = true;
          reject(new Error("PAYLOAD_TOO_LARGE"));
          req.destroy();
          return;
        }
        chunks.push(chunk);
      });

      req.on("end", () => {
        if (settled) return;
        settled = true;
        resolve(Buffer.concat(chunks).toString("utf8"));
      });

      req.on("error", (err) => {
        if (settled) return;
        settled = true;
        reject(err);
      });
    });
  }

  private sendJson(res: ServerResponse, statusCode: number, body: Record<string, unknown>): void {
    const serialized = JSON.stringify(body);
    res.writeHead(statusCode, {
      "content-type": "application/json; charset=utf-8",
      "content-length": Buffer.byteLength(serialized)
    });
    res.end(serialized);
  }
}
