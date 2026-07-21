import type { AppServerNotification, AppServerRequest, AppServerRequestId } from "./appServerProtocol";
import type { Disposable } from "./appServerClient";
import type { ModelTextRequest, ModelTextTransport } from "../models/modelTextTransport";

export interface CodexTextAppServer {
  request<T>(method: string, params?: unknown, timeoutMs?: number): Promise<T>;
  onNotification(listener: (message: AppServerNotification) => void): Disposable;
  onRequest(listener: (message: AppServerRequest) => void): Disposable;
  respondError(id: AppServerRequestId, code: number, message: string): void;
}

interface ThreadStartResult {
  thread?: { id?: unknown };
}

interface TurnStartResult {
  turn?: { id?: unknown };
}

interface CompletionState {
  finalMessages: string[];
  compatibilityMessages: string[];
}

const TEXT_ONLY_INSTRUCTIONS = [
  "Return only the requested text.",
  "Do not run commands, modify files, browse the web, call tools, or delegate to another agent."
].join(" ");

const TOOL_ITEM_TYPES = new Set([
  "commandExecution",
  "fileChange",
  "mcpToolCall",
  "dynamicToolCall",
  "collabAgentToolCall",
  "subAgentActivity",
  "webSearch",
  "imageView",
  "imageGeneration"
]);

const TOOL_SERVER_REQUEST_METHODS = new Set([
  "item/commandExecution/requestApproval",
  "item/fileChange/requestApproval",
  "item/tool/requestUserInput",
  "mcpServer/elicitation/request",
  "item/permissions/requestApproval",
  "item/tool/call",
  "applyPatchApproval",
  "execCommandApproval"
]);

export class CodexTextClient implements ModelTextTransport {
  constructor(
    private readonly appServer: CodexTextAppServer,
    private readonly runtimeCwd: string,
    private readonly modelProvider?: string
  ) {}

  async generate(request: ModelTextRequest): Promise<string> {
    const deadline = Date.now() + request.timeoutMs;
    const threadResult = await this.appServer.request<ThreadStartResult>(
      "thread/start",
      {
        model: request.model,
        ...(this.modelProvider ? { modelProvider: this.modelProvider } : {}),
        cwd: this.runtimeCwd,
        approvalPolicy: "never",
        sandbox: "read-only",
        ephemeral: true,
        developerInstructions: TEXT_ONLY_INSTRUCTIONS
      },
      remainingMs(deadline)
    );
    const threadId = requiredId(threadResult.thread?.id, "thread/start");
    const state: CompletionState = { finalMessages: [], compatibilityMessages: [] };
    let turnId: string | undefined;
    let completedByTurn = false;
    let settleCompletion: ((value: string) => void) | undefined;
    let rejectCompletion: ((error: Error) => void) | undefined;
    const completion = new Promise<string>((resolve, reject) => {
      settleCompletion = resolve;
      rejectCompletion = reject;
    });
    const notifications = this.appServer.onNotification((message) => {
      handleNotification(message, threadId, turnId, state, settleCompletion!, rejectCompletion!, () => {
        completedByTurn = true;
      });
    });
    const serverRequests = this.appServer.onRequest((message) => {
      const params = asRecord(message.params);
      if (
        !TOOL_SERVER_REQUEST_METHODS.has(message.method)
        || !params
        || params.threadId !== threadId
        || (turnId && params.turnId !== undefined && params.turnId !== turnId)
      ) {
        return;
      }
      this.appServer.respondError(message.id, -32600, "Tool activity is disabled for text generation.");
      rejectCompletion?.(new Error(`Codex text generation rejected server request: ${message.method}`));
    });

    try {
      throwIfAborted(request.signal);
      const turnResult = await this.appServer.request<TurnStartResult>(
        "turn/start",
        {
          threadId,
          input: [{ type: "text", text: request.prompt }],
          ...(request.purpose === "autocomplete" ? { effort: "low", summary: "none" } : {})
        },
        remainingMs(deadline)
      );
      turnId = requiredId(turnResult.turn?.id, "turn/start");
      try {
        throwIfAborted(request.signal);
        return await withDeadlineAndAbort(completion, deadline, request.signal);
      } catch (error) {
        if (!completedByTurn) {
          await bestEffortRequest(
            this.appServer,
            "turn/interrupt",
            { threadId, turnId },
            remainingMs(deadline, 1_000)
          );
        }
        throw error;
      }
    } finally {
      notifications.dispose();
      serverRequests.dispose();
      try {
        await this.appServer.request("thread/delete", { threadId }, remainingMs(deadline, 1_000));
      } catch {
        // Best-effort cleanup must not replace the generation result or its original failure.
      }
    }
  }
}

function handleNotification(
  message: AppServerNotification,
  threadId: string,
  turnId: string | undefined,
  state: CompletionState,
  resolve: (value: string) => void,
  reject: (error: Error) => void,
  markTurnCompleted: () => void
): void {
  const params = asRecord(message.params);
  if (!params || params.threadId !== threadId) {
    return;
  }
  if (message.method === "item/completed") {
    if (turnId && params.turnId !== turnId) {
      return;
    }
    const item = asRecord(params.item);
    if (!item) {
      return;
    }
    if (typeof item.type === "string" && TOOL_ITEM_TYPES.has(item.type)) {
      reject(new Error(`Codex text generation rejected tool activity: ${item.type}.`));
      return;
    }
    if (item.type !== "agentMessage" || typeof item.text !== "string") {
      return;
    }
    if (item.phase === "final_answer") {
      state.finalMessages.push(item.text);
    } else if (item.phase !== "commentary") {
      state.compatibilityMessages.push(item.text);
    }
    return;
  }
  if (message.method !== "turn/completed") {
    return;
  }
  const turn = asRecord(params.turn);
  if (!turn || (turnId && turn.id !== turnId)) {
    return;
  }
  markTurnCompleted();
  if (turn.status !== "completed") {
    const turnError = asRecord(turn.error);
    const detail = typeof turnError?.message === "string" ? `: ${turnError.message}` : "";
    reject(new Error(`Codex text generation ended with status ${String(turn.status ?? "unknown")}${detail}.`));
    return;
  }
  const messages = state.finalMessages.length > 0 ? state.finalMessages : state.compatibilityMessages;
  resolve(messages.join("\n"));
}

function requiredId(value: unknown, method: string): string {
  if (typeof value !== "string" || !value) {
    throw new Error(`Codex app-server returned an invalid ${method} response.`);
  }
  return value;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function remainingMs(deadline: number, fallback = 1): number {
  return Math.max(fallback, deadline - Date.now());
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw abortError();
  }
}

function withDeadlineAndAbort<T>(promise: Promise<T>, deadline: number, signal?: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (settle: () => void) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      settle();
    };
    const timer = setTimeout(
      () => finish(() => reject(new Error("Codex text generation timed out."))),
      remainingMs(deadline)
    );
    const onAbort = () => finish(() => reject(abortError()));
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error))
    );
  });
}

async function bestEffortRequest(
  appServer: CodexTextAppServer,
  method: string,
  params: unknown,
  timeoutMs: number
): Promise<void> {
  try {
    await appServer.request(method, params, timeoutMs);
  } catch {
    // The original generation failure remains authoritative.
  }
}

function abortError(): Error {
  const error = new Error("Codex text generation was aborted.");
  error.name = "AbortError";
  return error;
}
