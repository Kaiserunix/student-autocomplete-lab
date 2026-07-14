import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, RequestListener, ServerResponse } from "node:http";
import { parseCodeforcesProblemUrl } from "../../../src/submission/codeforcesTarget";
import { checkOnlineJudgeTools } from "../../../src/submission/onlineJudgeTools";
import { PrototypeConfirmationStore } from "./confirmationStore";
import {
  OjConsoleError,
  type DemoScenario,
  type SubmissionMode
} from "./contracts";
import { runDemoSubmission, type DemoSubmissionInput } from "./demoSubmission";
import { openCodeforcesLoginTerminal } from "./loginTerminal";
import { RealModeGate } from "./modeGate";
import { runRealSubmission, type RealSubmissionInput } from "./realSubmission";
import { SourceStore } from "./sourceStore";
import { SubmissionJobStore } from "./submissionJobs";

export interface OjConsoleApiOptions {
  token: string;
  runtimeRoot: string;
  startedAt?: string;
  sourceStore?: SourceStore;
  confirmations?: PrototypeConfirmationStore;
  modeGate?: RealModeGate;
  jobs?: SubmissionJobStore;
  checkTool?: typeof checkOnlineJudgeTools;
  runDemo?: (input: Omit<DemoSubmissionInput, "sleep">) => Promise<void>;
  runReal?: (input: RealSubmissionInput) => Promise<void>;
  openLogin?: () => void;
}

const demoScenarios = new Set<DemoScenario>([
  "accepted",
  "wrong_answer",
  "compile_error",
  "unknown",
  "login_required"
]);

export function createOjConsoleApi(options: OjConsoleApiOptions): RequestListener {
  const sources = options.sourceStore ?? new SourceStore();
  const confirmations = options.confirmations ?? new PrototypeConfirmationStore();
  const modeGate = options.modeGate ?? new RealModeGate();
  const jobs = options.jobs ?? new SubmissionJobStore();
  const checkTool = options.checkTool ?? checkOnlineJudgeTools;
  const runDemo = options.runDemo ?? ((input) => runDemoSubmission(input));
  const runReal = options.runReal ?? ((input) => runRealSubmission(input));
  const openLogin = options.openLogin ?? (() => openCodeforcesLoginTerminal());
  const startedAt = options.startedAt ?? new Date().toISOString();

  return (request, response) => {
    void handleRequest(request, response).catch((error: unknown) => {
      sendError(response, error);
    });
  };

  async function handleRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    response.setHeader("cache-control", "no-store");
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    if (!url.pathname.startsWith("/api/")) {
      throw new OjConsoleError("not_found", "找不到这个接口。", 404);
    }
    requireToken(request, options.token);
    requireAllowedOrigin(request);

    if (request.method === "GET" && url.pathname === "/api/status") {
      const tool = await checkTool();
      sendJson(response, 200, {
        version: "0.1",
        startedAt,
        mode: modeGate.isUnlocked() ? "real_unlocked" : "demo",
        realModeUnlocked: modeGate.isUnlocked(),
        platform: "codeforces",
        tool,
        sources: sources.stats(),
        confirmations: confirmations.stats(),
        jobs: jobs.count()
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/source") {
      requireMediaType(request, "application/octet-stream");
      const fileName = requireHeader(request, "x-source-name");
      const bytes = await readBody(request, 1024 * 1024);
      sendJson(response, 201, sources.add(fileName, bytes));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/preview") {
      const body = await readJsonObject(request);
      const source = sources.read(requireString(body, "sourceId"));
      const mode = requireMode(body.mode);
      let target;
      try {
        target = parseCodeforcesProblemUrl(requireString(body, "problemUrl"));
      } catch (error) {
        throw new OjConsoleError(
          "target_invalid",
          error instanceof Error ? error.message : "Codeforces 题目链接不正确。"
        );
      }
      const codeforcesHandle = optionalString(body.codeforcesHandle);
      if (mode === "real") {
        modeGate.requireUnlocked();
        const tool = await checkTool();
        if (!tool.available) {
          throw new OjConsoleError("tool_unavailable", tool.message, 503);
        }
        sendJson(response, 201, confirmations.create({
          source,
          target,
          mode,
          codeforcesHandle,
          toolVersion: tool.version
        }));
        return;
      }
      const scenario = requireScenario(body.scenario);
      sendJson(response, 201, confirmations.create({
        source,
        target,
        mode,
        scenario,
        codeforcesHandle
      }));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/real-mode/unlock") {
      const body = await readJsonObject(request);
      modeGate.unlock(requireString(body, "phrase"));
      sendJson(response, 200, { realModeUnlocked: true });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/confirm") {
      const body = await readJsonObject(request);
      const confirmationId = requireString(body, "confirmationId");
      const source = sources.read(confirmations.sourceIdFor(confirmationId));
      const confirmed = confirmations.consume(confirmationId, source);
      const job = jobs.create({
        mode: confirmed.mode,
        scenario: confirmed.scenario,
        source: confirmed.source,
        target: confirmed.target,
        codeforcesHandle: confirmed.codeforcesHandle
      });
      if (confirmed.mode === "demo") {
        startJob(job.jobId, () => runDemo({
          jobs,
          jobId: job.jobId,
          scenario: confirmed.scenario ?? "accepted"
        }));
      } else {
        startJob(job.jobId, () => runReal({
          jobs,
          jobId: job.jobId,
          source,
          target: confirmed.target,
          codeforcesHandle: confirmed.codeforcesHandle,
          runtimeRoot: options.runtimeRoot
        }));
      }
      sendJson(response, 202, { jobId: job.jobId });
      return;
    }

    const jobMatch = url.pathname.match(/^\/api\/submissions\/([^/]+)$/);
    if (request.method === "GET" && jobMatch) {
      sendJson(response, 200, jobs.get(decodeURIComponent(jobMatch[1])));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/login-terminal") {
      await readJsonObject(request);
      modeGate.requireUnlocked();
      const tool = await checkTool();
      if (!tool.available) {
        throw new OjConsoleError("tool_unavailable", tool.message, 503);
      }
      openLogin();
      sendJson(response, 202, { opened: true });
      return;
    }

    throw new OjConsoleError("not_found", "找不到这个接口。", 404);
  }

  function startJob(jobId: string, operation: () => Promise<void>): void {
    void operation().catch(() => {
      const state = jobs.get(jobId).state;
      if (["accepted", "rejected", "unknown", "failed"].includes(state)) {
        return;
      }
      jobs.update(jobId, {
        state: "failed",
        message: "提交任务执行失败；不会自动重试。"
      });
    });
  }
}

function requireToken(request: IncomingMessage, expected: string): void {
  const actual = request.headers["x-oj-console-token"];
  if (typeof actual !== "string" || !safeEqual(actual, expected)) {
    throw new OjConsoleError("unauthorized", "缺少或无效的本地会话令牌。", 401);
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function requireAllowedOrigin(request: IncomingMessage): void {
  const origin = request.headers.origin;
  if (!origin) {
    return;
  }
  const expected = `http://${request.headers.host ?? ""}`;
  if (origin !== expected) {
    throw new OjConsoleError("origin_rejected", "拒绝非本地页面发起的请求。", 403);
  }
}

function requireMediaType(request: IncomingMessage, expected: string): void {
  const mediaType = String(request.headers["content-type"] ?? "").split(";", 1)[0].trim().toLowerCase();
  if (mediaType !== expected) {
    throw new OjConsoleError("invalid_request", `Content-Type 必须是 ${expected}。`, 415);
  }
}

function requireHeader(request: IncomingMessage, name: string): string {
  const value = request.headers[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new OjConsoleError("invalid_request", `缺少请求头 ${name}。`);
  }
  return value;
}

async function readJsonObject(request: IncomingMessage): Promise<Record<string, unknown>> {
  requireMediaType(request, "application/json");
  const bytes = await readBody(request, 16 * 1024);
  try {
    const value = JSON.parse(bytes.toString("utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("not an object");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new OjConsoleError("invalid_request", "请求 JSON 格式不正确。");
  }
}

function readBody(request: IncomingMessage, maxBytes: number): Promise<Buffer> {
  const contentLength = Number(request.headers["content-length"] ?? 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    request.resume();
    return Promise.reject(new OjConsoleError("source_too_large", "请求内容超过允许大小。", 413));
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    let tooLarge = false;
    request.on("data", (chunk: Buffer | string) => {
      const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      total += bytes.length;
      if (total > maxBytes) {
        tooLarge = true;
        return;
      }
      chunks.push(bytes);
    });
    request.on("end", () => {
      if (tooLarge) {
        reject(new OjConsoleError("source_too_large", "请求内容超过允许大小。", 413));
        return;
      }
      resolve(Buffer.concat(chunks));
    });
    request.on("error", () => reject(new OjConsoleError("invalid_request", "读取请求失败。")));
  });
}

function requireString(body: Record<string, unknown>, key: string): string {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new OjConsoleError("invalid_request", `${key} 必须是非空字符串。`);
  }
  return value.trim();
}

function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new OjConsoleError("invalid_request", "可选字段必须是字符串。");
  }
  return value.trim() || undefined;
}

function requireMode(value: unknown): SubmissionMode {
  if (value !== "demo" && value !== "real") {
    throw new OjConsoleError("invalid_request", "mode 必须是 demo 或 real。");
  }
  return value;
}

function requireScenario(value: unknown): DemoScenario {
  const scenario = value ?? "accepted";
  if (typeof scenario !== "string" || !demoScenarios.has(scenario as DemoScenario)) {
    throw new OjConsoleError("invalid_request", "演示场景不受支持。");
  }
  return scenario as DemoScenario;
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  if (response.headersSent || response.destroyed) {
    return;
  }
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.end(JSON.stringify(body));
}

function sendError(response: ServerResponse, error: unknown): void {
  const known = error instanceof OjConsoleError;
  sendJson(response, known ? error.status : 500, {
    error: {
      code: known ? error.code : "internal_error",
      message: known ? error.message : "本地 OJ 服务发生内部错误。"
    }
  });
}
