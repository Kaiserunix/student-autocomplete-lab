import type { OjCliResult, OjToolAvailability } from "./types";
import {
  runBoundedProcess,
  type ProcessCommand,
  type ProcessRunner,
  type ProcessRunResult
} from "./processHost";

export function buildOjAvailabilityCommand(): ProcessCommand {
  return { command: "oj", args: ["--version"] };
}

export function buildOjSubmitCommand(url: string, filePath: string): ProcessCommand {
  return {
    command: "oj",
    args: ["submit", "--yes", "--no-open", "--wait", "0", url, filePath]
  };
}

export function parseOjSubmitOutput(exitCode: number | null, output: string): OjCliResult {
  if (/you are not logged in|login required/i.test(output)) {
    return {
      status: "login_required",
      message: "Codeforces 登录已失效，请先重新登录。"
    };
  }

  const successUrl = output.match(/success:\s*result:\s*(https:\/\/codeforces\.com\/[^\s]+)/i)?.[1];
  if (exitCode === 0 && successUrl) {
    return {
      status: "submitted",
      submissionUrl: trimUrlPunctuation(successUrl),
      message: "代码已提交到 Codeforces。"
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
  url: string,
  filePath: string,
  cwd: string,
  runner: ProcessRunner = runBoundedProcess
): Promise<OjCliResult> {
  const command = buildOjSubmitCommand(url, filePath);
  const result = await runner(command.command, command.args, {
    cwd,
    timeoutMs: 120_000,
    maxOutputBytes: 256 * 1024
  });

  if (result.errorCode === "ENOENT") {
    return { status: "unavailable", message: "未找到 oj 命令，请先安装 online-judge-tools。" };
  }
  if (result.timedOut) {
    return { status: "failed", message: "oj 提交等待超时；不会自动重试，请先检查 Codeforces 提交记录。" };
  }

  return parseOjSubmitOutput(result.exitCode, combinedOutput(result));
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
