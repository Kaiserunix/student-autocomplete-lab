import { spawn } from "node:child_process";

export interface ProcessCommand {
  command: string;
  args: string[];
}

export interface ProcessRunOptions {
  cwd?: string;
  timeoutMs: number;
  maxOutputBytes?: number;
}

export interface ProcessRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
  errorCode?: string;
}

export type ProcessRunner = (
  command: string,
  args: string[],
  options: ProcessRunOptions
) => Promise<ProcessRunResult>;

const defaultMaxOutputBytes = 256 * 1024;

export function runBoundedProcess(
  command: string,
  args: string[],
  options: ProcessRunOptions
): Promise<ProcessRunResult> {
  return new Promise((resolve) => {
    const maxOutputBytes = options.maxOutputBytes ?? defaultMaxOutputBytes;
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stderr: Buffer<ArrayBufferLike> = Buffer.alloc(0);
    let stdoutTruncated = false;
    let stderrTruncated = false;
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer | string) => {
      const appended = appendBounded(stdout, chunk, maxOutputBytes);
      stdout = appended.value;
      stdoutTruncated ||= appended.truncated;
    });
    child.stderr.on("data", (chunk: Buffer | string) => {
      const appended = appendBounded(stderr, chunk, maxOutputBytes);
      stderr = appended.value;
      stderrTruncated ||= appended.truncated;
    });
    child.on("error", (error: NodeJS.ErrnoException) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: null,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        timedOut,
        stdoutTruncated,
        stderrTruncated,
        errorCode: error.code
      });
    });
    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        timedOut,
        stdoutTruncated,
        stderrTruncated
      });
    });
  });
}

function appendBounded(
  current: Buffer<ArrayBufferLike>,
  chunk: Buffer<ArrayBufferLike> | string,
  limit: number
): { value: Buffer<ArrayBufferLike>; truncated: boolean } {
  const incoming = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  const remaining = Math.max(0, limit - current.length);
  if (remaining === 0) {
    return { value: current, truncated: incoming.length > 0 };
  }

  return {
    value: Buffer.concat([current, incoming.subarray(0, remaining)]),
    truncated: incoming.length > remaining
  };
}
