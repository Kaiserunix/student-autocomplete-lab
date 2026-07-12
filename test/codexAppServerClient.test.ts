import { PassThrough } from "node:stream";
import { describe, expect, test } from "vitest";
import {
  CodexAppServerClient,
  type AppServerProcess
} from "../src/codex/appServerClient";

class FakeAppServerProcess implements AppServerProcess {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  private readonly exitListeners: Array<(code: number | null, signal: NodeJS.Signals | null) => void> = [];
  private buffer = "";
  private readonly messages: Array<Record<string, unknown>> = [];

  constructor() {
    this.stdin.on("data", (chunk) => {
      this.buffer += chunk.toString();
      const lines = this.buffer.split("\n");
      this.buffer = lines.pop() ?? "";
      for (const line of lines.filter(Boolean)) {
        const message = JSON.parse(line) as Record<string, unknown>;
        this.messages.push(message);
        if (message.method === "initialize") {
          queueMicrotask(() => this.emitJson({ id: message.id, result: { userAgent: "test" } }));
        }
      }
    });
  }

  sent(): Array<Record<string, unknown>> {
    return this.messages;
  }

  emitJson(message: unknown): void {
    this.stdout.write(`${JSON.stringify(message)}\n`);
  }

  emitLine(line: string): void {
    this.stdout.write(`${line}\n`);
  }

  exit(code: number | null): void {
    for (const listener of this.exitListeners) {
      listener(code, null);
    }
  }

  once(event: "exit", listener: (code: number | null, signal: NodeJS.Signals | null) => void): this {
    if (event === "exit") {
      this.exitListeners.push(listener);
    }
    return this;
  }

  kill(): boolean {
    for (const listener of this.exitListeners) {
      listener(0, null);
    }
    return true;
  }
}

describe("Codex app-server client", () => {
  test("initializes once and correlates JSON-RPC responses", async () => {
    const fake = new FakeAppServerProcess();
    const client = new CodexAppServerClient({
      executablePath: "codex",
      codexHome: "C:/tmp/codex-home",
      runtimeCwd: "C:/tmp/codex-runtime",
      clientVersion: "0.1.0-beta.1",
      ensureDirectory: async () => undefined,
      spawnProcess: () => fake
    });

    await client.start();
    expect(fake.sent()).toEqual([
      {
        method: "initialize",
        id: 1,
        params: {
          clientInfo: {
            name: "student_autocomplete_lab",
            title: "Student Autocomplete Lab",
            version: "0.1.0-beta.1"
          }
        }
      },
      { method: "initialized", params: {} }
    ]);

    const pending = client.request("account/read", { refreshToken: false });
    await new Promise<void>((resolve) => setImmediate(resolve));
    fake.emitJson({ id: 2, result: { account: null, requiresOpenaiAuth: true } });
    await expect(pending).resolves.toEqual({ account: null, requiresOpenaiAuth: true });

    await client.dispose();
  });

  test("forwards notifications while isolating malformed output", async () => {
    const fake = new FakeAppServerProcess();
    const logs: string[] = [];
    const notifications: unknown[] = [];
    const client = new CodexAppServerClient({
      executablePath: "codex",
      codexHome: "C:/tmp/codex-home",
      runtimeCwd: "C:/tmp/codex-runtime",
      clientVersion: "0.1.0-beta.1",
      ensureDirectory: async () => undefined,
      spawnProcess: () => fake,
      onLog: (entry) => logs.push(entry.event)
    });
    client.onNotification((message) => notifications.push(message));

    await client.start();
    fake.emitLine("not-json");
    fake.emitJson({ method: "account/updated", params: { authMode: null } });
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(logs).toContain("malformed-message");
    expect(notifications).toContainEqual({
      kind: "notification",
      method: "account/updated",
      params: { authMode: null }
    });
    await client.dispose();
  });

  test("forwards server requests and can reject them explicitly", async () => {
    const fake = new FakeAppServerProcess();
    const requests: Array<{ id: string | number; method: string }> = [];
    const client = new CodexAppServerClient({
      executablePath: "codex",
      codexHome: "C:/tmp/codex-home",
      runtimeCwd: "C:/tmp/codex-runtime",
      clientVersion: "0.1.0-beta.1",
      ensureDirectory: async () => undefined,
      spawnProcess: () => fake
    });
    client.onRequest((message) => requests.push({ id: message.id, method: message.method }));

    await client.start();
    fake.emitJson({
      id: 91,
      method: "item/commandExecution/requestApproval",
      params: { threadId: "thread-1", turnId: "turn-1" }
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    client.respondError(91, -32600, "Tool activity is disabled.");

    expect(requests).toEqual([{
      id: 91,
      method: "item/commandExecution/requestApproval"
    }]);
    expect(fake.sent()).toContainEqual({
      id: 91,
      error: { code: -32600, message: "Tool activity is disabled." }
    });
    await client.dispose();
  });

  test("rejects timed-out and in-flight requests after a process crash", async () => {
    const fake = new FakeAppServerProcess();
    const client = new CodexAppServerClient({
      executablePath: "codex",
      codexHome: "C:/tmp/codex-home",
      runtimeCwd: "C:/tmp/codex-runtime",
      clientVersion: "0.1.0-beta.1",
      ensureDirectory: async () => undefined,
      spawnProcess: () => fake
    });
    await client.start();

    await expect(client.request("slow", {}, 5)).rejects.toThrow("timed out");
    const inFlight = client.request("account/read", {});
    await new Promise<void>((resolve) => setImmediate(resolve));
    fake.exit(1);
    await expect(inFlight).rejects.toThrow("exited with code 1");
  });
});
