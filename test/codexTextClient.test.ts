import { describe, expect, test } from "vitest";
import type { AppServerNotification, AppServerRequest } from "../src/codex/appServerProtocol";
import { CodexTextClient, type CodexTextAppServer } from "../src/codex/codexTextClient";

class FakeTextAppServer implements CodexTextAppServer {
  readonly calls: Array<{ method: string; params?: unknown; timeoutMs?: number }> = [];
  readonly errors: Array<{ id: string | number; code: number; message: string }> = [];
  failDelete = false;
  private readonly notificationListeners = new Set<(message: AppServerNotification) => void>();
  private readonly requestListeners = new Set<(message: AppServerRequest) => void>();
  private nextThread = 1;
  private nextTurn = 1;

  async request<T>(method: string, params?: unknown, timeoutMs?: number): Promise<T> {
    this.calls.push({ method, params, timeoutMs });
    if (method === "thread/start") {
      return { thread: { id: `thread-${this.nextThread++}` } } as T;
    }
    if (method === "turn/start") {
      return { turn: { id: `turn-${this.nextTurn++}`, status: "inProgress", items: [] } } as T;
    }
    if (method === "thread/delete" && this.failDelete) {
      throw new Error("cleanup failed");
    }
    return {} as T;
  }

  onNotification(listener: (message: AppServerNotification) => void): { dispose(): void } {
    this.notificationListeners.add(listener);
    return { dispose: () => this.notificationListeners.delete(listener) };
  }

  onRequest(listener: (message: AppServerRequest) => void): { dispose(): void } {
    this.requestListeners.add(listener);
    return { dispose: () => this.requestListeners.delete(listener) };
  }

  respondError(id: string | number, code: number, message: string): void {
    this.errors.push({ id, code, message });
  }

  notify(method: string, params: unknown): void {
    for (const listener of this.notificationListeners) {
      listener({ kind: "notification", method, params });
    }
  }

  serverRequest(id: number, method: string, params: unknown): void {
    for (const listener of this.requestListeners) {
      listener({ kind: "request", id, method, params });
    }
  }
}

describe("Codex text client", () => {
  test("runs one ephemeral read-only turn and returns only the final agent message", async () => {
    const appServer = new FakeTextAppServer();
    const transport = new CodexTextClient(appServer, "C:/runtime/student-autocomplete");

    const pending = transport.generate({
      purpose: "autocomplete",
      model: "gpt-5.3-codex-spark",
      prompt: "return code only",
      maxOutputTokens: 64,
      temperature: 0,
      timeoutMs: 2_500
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    appServer.notify("item/completed", {
      completedAtMs: Date.now(),
      threadId: "thread-1",
      turnId: "turn-1",
      item: { type: "agentMessage", id: "commentary", phase: "commentary", text: "working" }
    });
    appServer.notify("item/completed", {
      completedAtMs: Date.now(),
      threadId: "thread-1",
      turnId: "turn-1",
      item: { type: "agentMessage", id: "final", phase: "final_answer", text: "return a + b" }
    });
    appServer.notify("turn/completed", {
      threadId: "thread-1",
      turn: { id: "turn-1", status: "completed", items: [] }
    });

    await expect(pending).resolves.toBe("return a + b");
    expect(appServer.calls[0]).toMatchObject({
      method: "thread/start",
      params: {
        model: "gpt-5.3-codex-spark",
        cwd: "C:/runtime/student-autocomplete",
        approvalPolicy: "never",
        sandbox: "read-only",
        ephemeral: true
      }
    });
    expect(appServer.calls[1]).toMatchObject({
      method: "turn/start",
      params: {
        threadId: "thread-1",
        input: [{ type: "text", text: "return code only" }]
      }
    });
    expect(appServer.calls.at(-1)).toMatchObject({
      method: "thread/delete",
      params: { threadId: "thread-1" }
    });
  });

  test.each([
    "commandExecution",
    "fileChange",
    "mcpToolCall",
    "dynamicToolCall",
    "collabAgentToolCall",
    "subAgentActivity",
    "webSearch",
    "imageView",
    "imageGeneration"
  ])("rejects %s tool activity, interrupts the turn, and deletes the thread", async (type) => {
    const appServer = new FakeTextAppServer();
    const transport = new CodexTextClient(appServer, "C:/runtime/student-autocomplete");
    const pending = transport.generate({
      purpose: "analysis",
      model: "gpt-5.3-codex",
      prompt: "explain this code",
      maxOutputTokens: 200,
      temperature: 0,
      timeoutMs: 500
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    appServer.notify("item/completed", {
      completedAtMs: Date.now(),
      threadId: "thread-1",
      turnId: "turn-1",
      item: { type, id: "tool-1" }
    });

    await expect(pending).rejects.toThrow(`tool activity: ${type}`);
    expect(appServer.calls).toContainEqual(expect.objectContaining({
      method: "turn/interrupt",
      params: { threadId: "thread-1", turnId: "turn-1" }
    }));
    expect(appServer.calls.at(-1)).toMatchObject({
      method: "thread/delete",
      params: { threadId: "thread-1" }
    });
  });

  test("rejects matching approval requests without consuming unrelated auth requests", async () => {
    const appServer = new FakeTextAppServer();
    const transport = new CodexTextClient(appServer, "C:/runtime/student-autocomplete");
    const pending = transport.generate({
      purpose: "analysis",
      model: "gpt-5.3-codex",
      prompt: "explain",
      maxOutputTokens: 200,
      temperature: 0,
      timeoutMs: 500
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    appServer.serverRequest(90, "account/chatgptAuthTokens/refresh", {});
    expect(appServer.errors).toEqual([]);
    appServer.serverRequest(91, "item/commandExecution/requestApproval", {
      threadId: "thread-1",
      turnId: "turn-1"
    });

    await expect(pending).rejects.toThrow("requestApproval");
    expect(appServer.errors).toEqual([{
      id: 91,
      code: -32600,
      message: "Tool activity is disabled for text generation."
    }]);
  });

  test("aborts an active turn before deleting its thread", async () => {
    const appServer = new FakeTextAppServer();
    const controller = new AbortController();
    const transport = new CodexTextClient(appServer, "C:/runtime/student-autocomplete");
    const pending = transport.generate({
      purpose: "autocomplete",
      model: "gpt-5.3-codex-spark",
      prompt: "complete",
      maxOutputTokens: 64,
      temperature: 0,
      timeoutMs: 500,
      signal: controller.signal
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    controller.abort();

    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(appServer.calls.slice(-2).map((call) => call.method)).toEqual([
      "turn/interrupt",
      "thread/delete"
    ]);
  });

  test("times out an active turn before deleting its thread", async () => {
    const appServer = new FakeTextAppServer();
    const transport = new CodexTextClient(appServer, "C:/runtime/student-autocomplete");
    const pending = transport.generate({
      purpose: "autocomplete",
      model: "gpt-5.3-codex-spark",
      prompt: "complete",
      maxOutputTokens: 64,
      temperature: 0,
      timeoutMs: 20
    });

    await expect(pending).rejects.toThrow("timed out");
    expect(appServer.calls.slice(-2).map((call) => call.method)).toEqual([
      "turn/interrupt",
      "thread/delete"
    ]);
  });

  test("preserves the turn failure when thread cleanup also fails", async () => {
    const appServer = new FakeTextAppServer();
    appServer.failDelete = true;
    const transport = new CodexTextClient(appServer, "C:/runtime/student-autocomplete");
    const pending = transport.generate({
      purpose: "analysis",
      model: "gpt-5.3-codex",
      prompt: "explain",
      maxOutputTokens: 200,
      temperature: 0,
      timeoutMs: 500
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    appServer.notify("turn/completed", {
      threadId: "thread-1",
      turn: {
        id: "turn-1",
        status: "failed",
        items: [],
        error: { message: "upstream unavailable" }
      }
    });

    await expect(pending).rejects.toThrow("upstream unavailable");
  });
});
