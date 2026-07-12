import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createInterface, type Interface as ReadLineInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import {
  parseAppServerMessage,
  type AppServerNotification,
  type AppServerRequestId,
  type AppServerResponse
} from "./appServerProtocol";

export interface AppServerProcess {
  stdin: Writable;
  stdout: Readable;
  stderr: Readable;
  once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this;
  kill(signal?: NodeJS.Signals | number): boolean;
}

export type AppServerProcessFactory = (
  executablePath: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv }
) => AppServerProcess;

export interface SafeCodexLogEntry {
  level: "info" | "error";
  event: string;
  message?: string;
}

export interface Disposable {
  dispose(): void;
}

export interface CodexAppServerClientOptions {
  executablePath: string;
  codexHome: string;
  runtimeCwd: string;
  clientVersion: string;
  requestTimeoutMs?: number;
  spawnProcess?: AppServerProcessFactory;
  ensureDirectory?: (path: string) => Promise<void>;
  onLog?: (entry: SafeCodexLogEntry) => void;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
  timer: NodeJS.Timeout;
}

export class CodexAppServerClient {
  private readonly options: CodexAppServerClientOptions;
  private readonly pending = new Map<AppServerRequestId, PendingRequest>();
  private readonly notificationListeners = new Set<(message: AppServerNotification) => void>();
  private process?: AppServerProcess;
  private stdoutLines?: ReadLineInterface;
  private stderrLines?: ReadLineInterface;
  private startPromise?: Promise<void>;
  private nextRequestId = 1;
  private stopping = false;

  constructor(options: CodexAppServerClientOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    if (this.process) {
      return;
    }
    if (!this.startPromise) {
      this.startPromise = this.startProcess().catch((error) => {
        this.startPromise = undefined;
        throw error;
      });
    }
    await this.startPromise;
  }

  async request<T>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
    await this.start();
    return this.requestRaw<T>(method, params, timeoutMs);
  }

  notify(method: string, params?: unknown): void {
    if (!this.process) {
      throw new Error("Codex app-server is not started.");
    }
    this.write({ method, ...(params !== undefined ? { params } : {}) });
  }

  onNotification(listener: (message: AppServerNotification) => void): Disposable {
    this.notificationListeners.add(listener);
    return {
      dispose: () => this.notificationListeners.delete(listener)
    };
  }

  async dispose(): Promise<void> {
    this.stopping = true;
    this.stdoutLines?.close();
    this.stderrLines?.close();
    this.rejectPending(new Error("Codex app-server client was disposed."));
    const child = this.process;
    this.process = undefined;
    this.startPromise = undefined;
    if (child) {
      child.stdin.end();
      child.kill();
    }
  }

  private async startProcess(): Promise<void> {
    const ensureDirectory = this.options.ensureDirectory ?? ((target) => mkdir(target, { recursive: true }).then(() => undefined));
    await Promise.all([ensureDirectory(this.options.codexHome), ensureDirectory(this.options.runtimeCwd)]);
    const spawnProcess = this.options.spawnProcess ?? defaultSpawnProcess;
    const child = spawnProcess(this.options.executablePath, ["app-server"], {
      cwd: this.options.runtimeCwd,
      env: { ...process.env, CODEX_HOME: this.options.codexHome }
    });
    this.process = child;
    this.stopping = false;
    this.stdoutLines = createInterface({ input: child.stdout });
    this.stdoutLines.on("line", (line) => this.handleLine(line));
    this.stderrLines = createInterface({ input: child.stderr });
    this.stderrLines.on("line", (line) => {
      const message = sanitizeDiagnostic(line);
      if (message) {
        this.options.onLog?.({ level: "error", event: "stderr", message });
      }
    });
    child.once("exit", (code, signal) => this.handleExit(code, signal));

    await this.requestRaw("initialize", {
      clientInfo: {
        name: "student_autocomplete_lab",
        title: "Student Autocomplete Lab",
        version: this.options.clientVersion
      }
    });
    this.notify("initialized", {});
    this.options.onLog?.({ level: "info", event: "started" });
  }

  private requestRaw<T>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
    if (!this.process) {
      return Promise.reject(new Error("Codex app-server is not started."));
    }
    const id = this.nextRequestId++;
    const waitMs = timeoutMs ?? this.options.requestTimeoutMs ?? 15_000;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Codex app-server request timed out: ${method}`));
      }, waitMs);
      this.pending.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer
      });
      try {
        this.write({ method, id, ...(params !== undefined ? { params } : {}) });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  private write(message: Record<string, unknown>): void {
    if (!this.process) {
      throw new Error("Codex app-server is not started.");
    }
    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleLine(line: string): void {
    const message = parseAppServerMessage(line);
    if (!message) {
      this.options.onLog?.({ level: "error", event: "malformed-message" });
      return;
    }
    if (message.kind === "response") {
      this.settleResponse(message);
      return;
    }
    if (message.kind === "notification") {
      for (const listener of this.notificationListeners) {
        listener(message);
      }
      return;
    }
    this.options.onLog?.({ level: "error", event: "unsupported-server-request", message: message.method });
  }

  private settleResponse(response: AppServerResponse): void {
    const pending = this.pending.get(response.id);
    if (!pending) {
      return;
    }
    clearTimeout(pending.timer);
    this.pending.delete(response.id);
    if (response.error) {
      pending.reject(new Error(response.error.message || `Codex app-server error ${response.error.code ?? "unknown"}`));
      return;
    }
    pending.resolve(response.result);
  }

  private handleExit(code: number | null, signal: NodeJS.Signals | null): void {
    this.process = undefined;
    this.startPromise = undefined;
    this.stdoutLines?.close();
    this.stderrLines?.close();
    if (this.stopping) {
      return;
    }
    const detail = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
    this.rejectPending(new Error(`Codex app-server exited with ${detail}.`));
    this.options.onLog?.({ level: "error", event: "exited", message: detail });
  }

  private rejectPending(error: Error): void {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}

function defaultSpawnProcess(
  executablePath: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv }
): AppServerProcess {
  return spawn(executablePath, args, {
    cwd: options.cwd,
    env: options.env,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true
  });
}

function sanitizeDiagnostic(line: string): string | undefined {
  const compact = line.replace(/https?:\/\/\S+/gi, "[url]").replace(/\s+/g, " ").trim();
  return compact ? compact.slice(0, 300) : undefined;
}
