import { spawn, type ChildProcess } from "node:child_process";

export const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024; // 1 MiB OLE hard cap
export const DEFAULT_TIMEOUT_MS = 3000;

export interface SandboxRunOptions {
  command: string;
  args?: string[];
  cwd?: string;
  stdin?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  env?: Record<string, string | undefined>;
  /** Forces PYTHONUTF8=1 and PYTHONIOENCODING=utf-8 to prevent Windows CP936/GBK crashes. */
  injectPythonUtf8?: boolean;
  signal?: AbortSignal;
}

export interface SandboxRunResult {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  outputLimitExceeded: boolean;
  aborted: boolean;
  spawnError?: string;
}

/**
 * Terminates a child process AND all of its descendant processes reliably across platforms:
 * - Windows: `taskkill /PID <pid> /T /F` (shell: false) with `child.kill()` fallback.
 * - POSIX: negative PID group kill `process.kill(-pid, "SIGKILL")` (requires `detached: true`).
 */
export function killProcessTree(child: ChildProcess, platform: NodeJS.Platform = process.platform): void {
  const pid = child.pid;
  if (pid === undefined) {
    try {
      child.kill("SIGKILL");
    } catch {
      // already exited
    }
    return;
  }

  if (platform === "win32") {
    try {
      const killer = spawn("taskkill", ["/PID", String(pid), "/T", "/F"], {
        shell: false,
        windowsHide: true,
        stdio: "ignore"
      });
      killer.on("error", () => {
        try {
          child.kill();
        } catch {
          // ignore
        }
      });
    } catch {
      try {
        child.kill();
      } catch {
        // ignore
      }
    }
    return;
  }

  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      child.kill("SIGKILL");
    } catch {
      // ignore
    }
  }
}

export async function runSandboxedProcess(options: SandboxRunOptions): Promise<SandboxRunResult> {
  const timeoutMs = Math.max(50, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const maxOutputBytes = Math.max(1024, options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES);

  if (options.signal?.aborted) {
    return {
      exitCode: null,
      signal: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
      timedOut: false,
      outputLimitExceeded: false,
      aborted: true
    };
  }

  const mergedEnv: NodeJS.ProcessEnv = {
    ...process.env,
    ...(options.env ?? {})
  };
  if (options.injectPythonUtf8) {
    mergedEnv.PYTHONUTF8 = "1";
    mergedEnv.PYTHONIOENCODING = "utf-8";
  }

  const isPosix = process.platform !== "win32";
  const startTime = process.hrtime.bigint();

  return new Promise<SandboxRunResult>((resolve) => {
    let child: ChildProcess;
    try {
      child = spawn(options.command, options.args ?? [], {
        cwd: options.cwd,
        env: mergedEnv,
        shell: false,
        windowsHide: true,
        detached: isPosix,
        stdio: ["pipe", "pipe", "pipe"]
      });
    } catch (error) {
      resolve({
        exitCode: null,
        signal: null,
        stdout: "",
        stderr: "",
        durationMs: 0,
        timedOut: false,
        outputLimitExceeded: false,
        aborted: false,
        spawnError: error instanceof Error ? error.message : String(error)
      });
      return;
    }

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let timedOut = false;
    let outputLimitExceeded = false;
    let aborted = false;
    let killed = false;
    let settled = false;

    const triggerKill = () => {
      if (killed) return;
      killed = true;
      killProcessTree(child);
    };

    const cleanup = () => {
      clearTimeout(timer);
      if (options.signal) {
        options.signal.removeEventListener("abort", onAbort);
      }
    };

    const finish = (
      exitCode: number | null,
      sig: NodeJS.Signals | null,
      spawnError?: string
    ) => {
      if (settled) return;
      settled = true;
      cleanup();
      const elapsedNs = process.hrtime.bigint() - startTime;
      const durationMs = Math.max(0, Math.round(Number(elapsedNs) / 1_000_000));
      resolve({
        exitCode,
        signal: sig,
        stdout: Buffer.concat(stdoutChunks).toString("utf8"),
        stderr: Buffer.concat(stderrChunks).toString("utf8"),
        durationMs,
        timedOut,
        outputLimitExceeded,
        aborted,
        ...(spawnError ? { spawnError } : {})
      });
    };

    const onAbort = () => {
      aborted = true;
      triggerKill();
    };
    if (options.signal) {
      options.signal.addEventListener("abort", onAbort, { once: true });
    }

    const timer = setTimeout(() => {
      timedOut = true;
      triggerKill();
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (outputLimitExceeded) {
        return;
      }
      if (stdoutBytes + chunk.length > maxOutputBytes) {
        const remaining = maxOutputBytes - stdoutBytes;
        if (remaining > 0) {
          stdoutChunks.push(chunk.subarray(0, remaining));
          stdoutBytes += remaining;
        }
        outputLimitExceeded = true;
        triggerKill();
        return;
      }
      stdoutChunks.push(chunk);
      stdoutBytes += chunk.length;
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderrBytes >= maxOutputBytes) {
        return;
      }
      const remaining = maxOutputBytes - stderrBytes;
      if (chunk.length > remaining) {
        stderrChunks.push(chunk.subarray(0, remaining));
        stderrBytes += remaining;
      } else {
        stderrChunks.push(chunk);
        stderrBytes += chunk.length;
      }
    });

    child.on("error", (err) => {
      finish(null, null, err.message);
    });

    child.on("close", (code, sig) => {
      finish(code, sig);
    });

    // Feed stdin safely (ignore EPIPE if process terminates before reading stdin)
    if (child.stdin) {
      child.stdin.on("error", () => {
        // Ignore broken pipe when child exits early
      });
      if (options.stdin !== undefined && options.stdin.length > 0) {
        child.stdin.write(options.stdin);
      }
      child.stdin.end();
    }
  });
}
