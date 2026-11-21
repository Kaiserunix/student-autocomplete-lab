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
  onProblem?: (doc: ProblemDocument, raw: CompetitiveCompanionPayload) => void | Promise<void>;
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
  private readonly onProblem?: (
    doc: ProblemDocument,
    raw: CompetitiveCompanionPayload
  ) => void | Promise<void>;

  private server: Server | null = null;
  private boundPort: number | null = null;
  private readonly receivedProblems: ProblemDocument[] = [];

  constructor(options: LocalhostBridgeOptions = {}) {
    this.preferredPort = options.preferredPort ?? DEFAULT_BRIDGE_PORT;
    this.maxPortAttempts = Math.max(1, options.maxPortAttempts ?? DEFAULT_MAX_PORT_ATTEMPTS);
    this.maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES;
    this.pairingToken = options.pairingToken;
    this.onProblem = options.onProblem;
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

  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // 1. Strict DNS Rebinding & loopback defense
    if (!isAllowedLoopbackHost(req.headers.host) || !isLoopbackRemoteAddress(req.socket.remoteAddress)) {
      this.sendJson(res, 403, { ok: false, error: "Forbidden: invalid Host or non-loopback origin." });
      return;
    }

    if (req.method === "GET" && (req.url === "/health" || req.url === "/")) {
      this.sendJson(res, 200, {
        ok: true,
        service: "algo-coach-localhost-bridge",
        port: this.boundPort
      });
      return;
    }

    if (req.method !== "POST") {
      this.sendJson(res, 405, { ok: false, error: "Method Not Allowed. Send POST JSON payload." });
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
