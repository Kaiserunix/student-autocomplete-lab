import * as vscode from "vscode";
import { checkOnlineJudgeTools } from "../submission/onlineJudgeTools";
import {
  getSubmissionPlatformCapability,
  parseSubmissionTarget
} from "../submission/submissionTarget";
import type { SubmissionPlatform } from "../submission/types";
import { PrototypeConfirmationStore } from "./confirmationStore";
import {
  OjConsoleError,
  type DemoScenario,
  type OjToolStatusView,
  type SourceMetadata,
  type SubmissionJobView,
  type SubmissionMode,
  type SubmissionPreview
} from "./contracts";
import { runDemoSubmission, type DemoSubmissionInput } from "./demoSubmission";
import { RealModeGate } from "./modeGate";
import { runRealSubmission, type RealSubmissionInput } from "./realSubmission";
import { SourceStore } from "./sourceStore";
import { SubmissionJobStore } from "./submissionJobs";

export interface OjConsoleStatusView {
  tool: OjToolStatusView;
  realModeUnlocked: boolean;
}

export interface OjConsoleServiceOptions {
  runtimeRoot: string;
  onJobChange?: (job: SubmissionJobView) => void;
  sourceStore?: SourceStore;
  confirmations?: PrototypeConfirmationStore;
  modeGate?: RealModeGate;
  jobs?: SubmissionJobStore;
  checkTool?: typeof checkOnlineJudgeTools;
  runDemo?: (input: Omit<DemoSubmissionInput, "sleep">) => Promise<void>;
  runReal?: (input: RealSubmissionInput) => Promise<void>;
  openLoginTerminal?: (platform: SubmissionPlatform) => void;
}

const demoScenarios = new Set<DemoScenario>([
  "accepted",
  "wrong_answer",
  "compile_error",
  "unknown",
  "login_required"
]);

export class OjConsoleService {
  private readonly runtimeRoot: string;
  private readonly sources: SourceStore;
  private readonly confirmations: PrototypeConfirmationStore;
  private readonly modeGate: RealModeGate;
  private readonly jobs: SubmissionJobStore;
  private readonly checkTool: typeof checkOnlineJudgeTools;
  private readonly runDemo: (input: Omit<DemoSubmissionInput, "sleep">) => Promise<void>;
  private readonly runReal: (input: RealSubmissionInput) => Promise<void>;
  private readonly openLogin: (platform: SubmissionPlatform) => void;
  private cachedStatusTool: OjToolStatusView | undefined;
  private cachedStatusToolUntil = 0;
  private pendingStatusTool: Promise<OjToolStatusView> | undefined;

  public constructor(options: OjConsoleServiceOptions) {
    this.runtimeRoot = options.runtimeRoot;
    this.sources = options.sourceStore ?? new SourceStore();
    this.confirmations = options.confirmations ?? new PrototypeConfirmationStore();
    this.modeGate = options.modeGate ?? new RealModeGate();
    this.jobs = options.jobs ?? new SubmissionJobStore({ onChange: options.onJobChange });
    this.checkTool = options.checkTool ?? checkOnlineJudgeTools;
    this.runDemo = options.runDemo ?? ((input) => runDemoSubmission(input));
    this.runReal = options.runReal ?? ((input) => runRealSubmission(input));
    this.openLogin = options.openLoginTerminal ?? ((platform) => openVsCodeLoginTerminal(platform));
  }

  public async getStatus(): Promise<OjConsoleStatusView> {
    const tool = await this.checkStatusTool();
    return {
      tool,
      realModeUnlocked: this.modeGate.isUnlocked()
    };
  }

  public addSource(fileName: unknown, bytes: Uint8Array): SourceMetadata {
    if (typeof fileName !== "string" || !fileName.trim()) {
      throw new OjConsoleError("invalid_request", "缺少源码文件名。");
    }
    if (!(bytes instanceof Uint8Array) || bytes.length === 0) {
      throw new OjConsoleError("invalid_request", "源码内容不能为空。");
    }
    if (bytes.length > 1024 * 1024) {
      throw new OjConsoleError("source_too_large", "单个源码文件不能超过 1 MiB。", 413);
    }
    return this.sources.add(fileName, Buffer.from(bytes));
  }

  public async createPreview(body: Record<string, unknown>): Promise<SubmissionPreview> {
    const source = this.sources.read(requireString(body, "sourceId"));
    const mode = requireMode(body.mode);
    let target;
    try {
      target = parseSubmissionTarget(requireString(body, "problemUrl"));
    } catch (error) {
      throw new OjConsoleError(
        "target_invalid",
        error instanceof Error ? error.message : "题目链接不正确。"
      );
    }
    const selectedPlatform = body.platform === undefined
      ? target.platform
      : requirePlatform(body.platform);
    if (selectedPlatform !== target.platform) {
      throw new OjConsoleError("target_invalid", "所选平台与题目链接不一致。");
    }
    const codeforcesHandle = optionalString(body.codeforcesHandle);
    if (target.platform !== "codeforces" && codeforcesHandle) {
      throw new OjConsoleError("invalid_request", "AtCoder 提交不使用 Codeforces handle。");
    }
    if (mode === "real") {
      this.requireTrustedWorkspace();
      this.modeGate.requireUnlocked();
      const tool = await this.checkTool();
      if (!tool.available) {
        throw new OjConsoleError("tool_unavailable", tool.message, 503);
      }
      return this.confirmations.create({
        source,
        target,
        mode,
        codeforcesHandle,
        toolVersion: tool.version
      });
    }
    const scenario = requireScenario(body.scenario);
    return this.confirmations.create({
      source,
      target,
      mode,
      scenario,
      codeforcesHandle
    });
  }

  public async confirm(body: Record<string, unknown>): Promise<{ jobId: string }> {
    const confirmationId = requireString(body, "confirmationId");
    const source = this.sources.read(this.confirmations.sourceIdFor(confirmationId));
    const confirmed = this.confirmations.consume(confirmationId, source);
    if (confirmed.mode === "real") {
      this.requireTrustedWorkspace();
      this.modeGate.requireUnlocked();
    }
    const job = this.jobs.create({
      mode: confirmed.mode,
      scenario: confirmed.scenario,
      source: confirmed.source,
      target: confirmed.target,
      codeforcesHandle: confirmed.codeforcesHandle
    });
    if (confirmed.mode === "demo") {
      this.startJob(job.jobId, () => this.runDemo({
        jobs: this.jobs,
        jobId: job.jobId,
        scenario: confirmed.scenario ?? "accepted"
      }));
    } else {
      this.startJob(job.jobId, () => this.runReal({
        jobs: this.jobs,
        jobId: job.jobId,
        source,
        target: confirmed.target,
        codeforcesHandle: confirmed.codeforcesHandle,
        runtimeRoot: this.runtimeRoot
      }));
    }
    return { jobId: job.jobId };
  }

  public unlockRealMode(body: Record<string, unknown>): { realModeUnlocked: boolean } {
    this.requireTrustedWorkspace();
    this.modeGate.unlock(requireString(body, "phrase"));
    return { realModeUnlocked: true };
  }

  public async openLoginTerminal(body: Record<string, unknown>): Promise<{ opened: boolean; platform: SubmissionPlatform }> {
    this.requireTrustedWorkspace();
    this.modeGate.requireUnlocked();
    const tool = await this.checkTool();
    if (!tool.available) {
      throw new OjConsoleError("tool_unavailable", tool.message, 503);
    }
    const platform = requirePlatform(body.platform);
    this.openLogin(platform);
    return { opened: true, platform };
  }

  public getJob(jobId: string): SubmissionJobView {
    return this.jobs.get(jobId);
  }

  private startJob(jobId: string, operation: () => Promise<void>): void {
    void operation().catch(() => {
      const state = this.jobs.get(jobId).state;
      if (["submitted", "accepted", "rejected", "unknown", "failed"].includes(state)) {
        return;
      }
      this.jobs.update(jobId, {
        state: "failed",
        message: "提交任务执行失败；不会自动重试。"
      });
    });
  }

  private requireTrustedWorkspace(): void {
    if (!vscode.workspace.isTrusted) {
      throw new OjConsoleError("workspace_untrusted", "当前工作区不受信任，已禁止真实提交相关操作。", 403);
    }
  }

  private async checkStatusTool(): Promise<OjToolStatusView> {
    const now = Date.now();
    if (this.cachedStatusTool && now < this.cachedStatusToolUntil) {
      return this.cachedStatusTool;
    }
    if (!this.pendingStatusTool) {
      this.pendingStatusTool = this.checkTool().then((tool) => {
        this.cachedStatusTool = tool;
        this.cachedStatusToolUntil = Date.now() + 5_000;
        return tool;
      }).finally(() => {
        this.pendingStatusTool = undefined;
      });
    }
    return this.pendingStatusTool;
  }
}

function openVsCodeLoginTerminal(platform: SubmissionPlatform): void {
  const capability = getSubmissionPlatformCapability(platform);
  const terminal = vscode.window.createTerminal({ name: "OJ 登录" });
  terminal.sendText(`oj login ${capability.loginUrl}`, true);
  terminal.show();
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

function requirePlatform(value: unknown): SubmissionPlatform {
  const platform = value ?? "codeforces";
  if (platform !== "codeforces" && platform !== "atcoder") {
    throw new OjConsoleError("invalid_request", "platform 必须是 codeforces 或 atcoder。");
  }
  return platform;
}

function requireScenario(value: unknown): DemoScenario {
  const scenario = value ?? "accepted";
  if (typeof scenario !== "string" || !demoScenarios.has(scenario as DemoScenario)) {
    throw new OjConsoleError("invalid_request", "演示场景不受支持。");
  }
  return scenario as DemoScenario;
}
