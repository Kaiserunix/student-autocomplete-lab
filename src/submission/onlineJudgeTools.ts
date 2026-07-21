import { getSubmissionPlatformCapability } from "./submissionTarget";
import type { OjCliResult, OjToolAvailability, SubmissionTarget } from "./types";
import {
  runBoundedProcess,
  type ProcessCommand,
  type ProcessRunner,
  type ProcessRunResult
} from "./processHost";

export function buildOjAvailabilityCommand(): ProcessCommand {
  return { command: "oj", args: ["--version"] };
}

export function buildOjSubmitCommand(target: SubmissionTarget, filePath: string): ProcessCommand {
  return {
    command: "oj",
    args: ["submit", "--yes", "--no-open", "--wait", "0", target.canonicalUrl, filePath]
  };
}

export function parseOjSubmitOutput(
  target: SubmissionTarget,
  exitCode: number | null,
  output: string
): OjCliResult {
  const platform = getSubmissionPlatformCapability(target.platform);
  if (/you are not logged in|login required/i.test(output)) {
    return {
      status: "login_required",
      message: `${platform.displayName} 登录已失效，请先重新登录。`
    };
  }

  const successUrl = /success/i.test(output) ? findSubmissionUrl(target, output) : undefined;
  if (exitCode === 0 && successUrl) {
    return {
      status: "submitted",
      submissionUrl: successUrl,
      message: `代码已提交到 ${platform.displayName}。`
    };
  }

  return {
    status: "failed",
    message: "oj 未能确认提交成功；不会自动重试，请检查登录和题目链接。"
  };
}

export async function checkOnlineJudgeTools(
  runner: ProcessRunner = runBoundedProcess
): Promise<OjToolAvailability> {
  const command = buildOjAvailabilityCommand();
  const result = await runner(command.command, command.args, {
    timeoutMs: 5_000,
    maxOutputBytes: 4_096
  });

  if (result.errorCode === "ENOENT") {
    return {
      available: false,
      message: "未找到 oj 命令，请先安装 online-judge-tools。"
    };
  }
  if (result.timedOut) {
    return {
      available: false,
      message: "oj 健康检查超时。"
    };
  }
  if (result.exitCode !== 0) {
    return {
      available: false,
      message: "oj 命令不可用，请检查 online-judge-tools 安装。"
    };
  }

  const version = parseVersion(`${result.stdout}\n${result.stderr}`);
  return {
    available: true,
    message: version ? `online-judge-tools ${version} 可用。` : "online-judge-tools 可用。",
    version
  };
}

export async function submitWithOnlineJudgeTools(
  target: SubmissionTarget,
  filePath: string,
  cwd: string,
  runner: ProcessRunner = runBoundedProcess
): Promise<OjCliResult> {
  const command = buildOjSubmitCommand(target, filePath);
  const result = await runner(command.command, command.args, {
    cwd,
    timeoutMs: 120_000,
    maxOutputBytes: 256 * 1024
  });

  if (result.errorCode === "ENOENT") {
    return { status: "unavailable", message: "未找到 oj 命令，请先安装 online-judge-tools。" };
  }
  if (result.timedOut) {
    const platform = getSubmissionPlatformCapability(target.platform);
    return {
      status: "failed",
      message: `oj 提交等待超时；不会自动重试，请先检查 ${platform.displayName} 提交记录。`
    };
  }

  return parseOjSubmitOutput(target, result.exitCode, combinedOutput(result));
}

function findSubmissionUrl(target: SubmissionTarget, output: string): string | undefined {
  const candidates = output.match(/https:\/\/[^\s]+/gi) ?? [];
  for (const candidate of candidates) {
    const value = trimUrlPunctuation(candidate);
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      continue;
    }
    if (isSubmissionUrlForTarget(target, parsed)) {
      return parsed.toString().replace(/\/$/, "");
    }
  }
  return undefined;
}

function isSubmissionUrlForTarget(target: SubmissionTarget, parsed: URL): boolean {
  const hostname = parsed.hostname.toLowerCase();
  if (target.platform === "codeforces") {
    if (hostname !== "codeforces.com" && hostname !== "www.codeforces.com") {
      return false;
    }
    const prefix = target.contestKind === "gym" ? "gym" : "contest";
    return new RegExp(`^/${prefix}/${target.contestId}/(?:my|submission/\\d+)/?$`).test(parsed.pathname);
  }
  if (hostname !== "atcoder.jp" && hostname !== "www.atcoder.jp") {
    return false;
  }
  return new RegExp(`^/contests/${escapeRegExp(target.contestId)}/submissions/(?:me|\\d+)/?$`)
    .test(parsed.pathname);
}

function combinedOutput(result: ProcessRunResult): string {
  return `${result.stdout}\n${result.stderr}`;
}

function parseVersion(output: string): string | undefined {
  return output.match(/(?:online-judge-tools|\boj\b)\s+v?([0-9]+(?:\.[0-9]+)*)/i)?.[1];
}

function trimUrlPunctuation(value: string): string {
  return value.replace(/[),.;]+$/, "");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
