import { beforeEach, describe, expect, test, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  executeCommand: vi.fn(async () => undefined),
  loadModelEnv: vi.fn(async () => ({})),
  routeAutocomplete: vi.fn(() => ({
    config: { format: "codex-app-server" },
    capabilities: { renderer: "codex-text" }
  })),
  requestAutocomplete: vi.fn(),
  buildInput: vi.fn(() => ({
    prefix: "int total = 0;\n        total+=",
    suffix: "\n    }",
    language: "c",
    filePath: "C:/workspace/smoke.c"
  }))
}));

vi.mock("vscode", () => ({
  workspace: {
    workspaceFolders: [{ uri: { fsPath: "C:/workspace" } }]
  },
  commands: {
    executeCommand: mocks.executeCommand
  },
  InlineCompletionTriggerKind: {
    Invoke: 0,
    Automatic: 1
  },
  InlineCompletionItem: class InlineCompletionItem {
    constructor(
      public readonly insertText: string,
      public readonly range?: unknown
    ) {}
  },
  Range: class Range {
    constructor(
      public readonly start: unknown,
      public readonly end: unknown
    ) {}
  }
}));

vi.mock("../src/config/vscodeModelEnv", () => ({
  loadModelEnvFromVsCode: mocks.loadModelEnv
}));

vi.mock("../src/models/modelRouter", () => ({
  routeAutocompleteModel: mocks.routeAutocomplete
}));

vi.mock("../src/autocomplete/context", () => ({
  buildAutocompleteInputFromText: mocks.buildInput
}));

vi.mock("../src/autocomplete/mimoAutocomplete", () => ({
  requestMimoAutocompleteDetailed: mocks.requestAutocomplete
}));

import { createMimoInlineCompletionProvider } from "../src/autocomplete/inlineProvider";

describe("inline provider cancellation lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requestAutocomplete.mockReset();
  });

  test("cancels an unstable debounce without starting the model, then serves the stable request", async () => {
    mocks.requestAutocomplete.mockResolvedValue(successfulResult());
    const provider = createMimoInlineCompletionProvider({
      extensionContext: {} as never,
      oauthTransport: {} as never,
      loadStudentSkill: async () => ({}) as never,
      automaticDebounceMs: 20,
      minAutomaticIntervalMs: 0
    });
    const unstableCancellation = createCancellationToken();
    const document = createDocument();
    const position = { line: 6, character: 15 } as never;

    const unstableCall = provider.provideInlineCompletionItems(
      document as never,
      position,
      { triggerKind: 1, selectedCompletionInfo: undefined },
      unstableCancellation.token as never
    );
    unstableCancellation.cancel();

    await expect(Promise.resolve(unstableCall)).resolves.toEqual([]);
    expect(mocks.requestAutocomplete).not.toHaveBeenCalled();

    const stableCall = await Promise.resolve(provider.provideInlineCompletionItems(
      document as never,
      position,
      { triggerKind: 1, selectedCompletionInfo: undefined },
      createCancellationToken().token as never
    ));

    expect(mocks.requestAutocomplete).toHaveBeenCalledTimes(1);
    expect(mocks.executeCommand).not.toHaveBeenCalled();
    expect(Array.isArray(stableCall)).toBe(true);
    if (!Array.isArray(stableCall)) {
      throw new Error("Expected an inline completion array.");
    }
    expect(stableCall).toHaveLength(1);
    expect(stableCall[0]).toMatchObject({
      insertText: " values[i];",
      range: {
        start: position,
        end: position
      }
    });
  });

  test("aborts an in-flight provider request and reports no Ghost Text or error event", async () => {
    let requestSignal: AbortSignal | undefined;
    mocks.requestAutocomplete.mockImplementationOnce((_config, input) => {
      requestSignal = input.signal;
      return new Promise((_resolve, reject) => {
        input.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    });
    const onEvent = vi.fn();
    const provider = createMimoInlineCompletionProvider({
      extensionContext: {} as never,
      oauthTransport: {} as never,
      loadStudentSkill: async () => ({}) as never,
      automaticDebounceMs: 0,
      minAutomaticIntervalMs: 0,
      onEvent
    });
    const cancellation = createCancellationToken();

    const call = provider.provideInlineCompletionItems(
      createDocument() as never,
      { line: 6, character: 15 } as never,
      { triggerKind: 1, selectedCompletionInfo: undefined },
      cancellation.token as never
    );
    await vi.waitFor(() => expect(mocks.requestAutocomplete).toHaveBeenCalledTimes(1));
    cancellation.cancel();

    await expect(Promise.resolve(call)).resolves.toEqual([]);
    expect(requestSignal?.aborted).toBe(true);
    expect(onEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: "error" }));
    expect(mocks.executeCommand).not.toHaveBeenCalled();
  });

  test("lets the stable request acquire the slot after an in-flight request is cancelled", async () => {
    mocks.requestAutocomplete.mockImplementationOnce((_config, input) => {
      return new Promise((_resolve, reject) => {
        input.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        }, { once: true });
      });
    });
    mocks.requestAutocomplete.mockResolvedValue(successfulResult());
    const provider = createMimoInlineCompletionProvider({
      extensionContext: {} as never,
      oauthTransport: {} as never,
      loadStudentSkill: async () => ({}) as never,
      automaticDebounceMs: 0,
      minAutomaticIntervalMs: 0
    });
    const cancelled = createCancellationToken();
    const position = { line: 6, character: 15 } as never;
    const firstCall = provider.provideInlineCompletionItems(
      createDocument() as never,
      position,
      { triggerKind: 1, selectedCompletionInfo: undefined },
      cancelled.token as never
    );
    await vi.waitFor(() => expect(mocks.requestAutocomplete).toHaveBeenCalledTimes(1));
    cancelled.cancel();

    const stableCall = provider.provideInlineCompletionItems(
      createDocument() as never,
      position,
      { triggerKind: 1, selectedCompletionInfo: undefined },
      createCancellationToken().token as never
    );

    await expect(Promise.resolve(firstCall)).resolves.toEqual([]);
    const stableResult = await Promise.resolve(stableCall);
    expect(mocks.requestAutocomplete).toHaveBeenCalledTimes(2);
    expect(Array.isArray(stableResult)).toBe(true);
    if (!Array.isArray(stableResult)) {
      throw new Error("Expected an inline completion array.");
    }
    expect(stableResult[0]).toMatchObject({ insertText: " values[i];" });
  });

  test("preserves the selected completion range and filter text for fuzzy editor matches", async () => {
    mocks.requestAutocomplete.mockResolvedValue({
      ...successfulResult(),
      suggestion: "return total;"
    });
    const provider = createMimoInlineCompletionProvider({
      extensionContext: {} as never,
      oauthTransport: {} as never,
      loadStudentSkill: async () => ({}) as never,
      automaticDebounceMs: 0,
      minAutomaticIntervalMs: 0
    });
    const position = { line: 6, character: 8 };
    const selectedRange = {
      start: { line: 6, character: 4 },
      end: position
    };
    const document = {
      ...createDocument(),
      lineAt: () => ({ text: "    rtrn" }),
      getText: () => "int total = 0;\n    rtrn"
    };

    const result = await Promise.resolve(provider.provideInlineCompletionItems(
      document as never,
      position as never,
      {
        triggerKind: 0,
        selectedCompletionInfo: {
          range: selectedRange as never,
          text: "return"
        }
      },
      createCancellationToken().token as never
    ));

    expect(Array.isArray(result)).toBe(true);
    if (!Array.isArray(result)) {
      throw new Error("Expected an inline completion array.");
    }
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      insertText: "return total;",
      range: selectedRange,
      filterText: "rtrn total;"
    });
  });
});

function successfulResult() {
  return {
    status: "success" as const,
    suggestion: "total += values[i];",
    audit: {
      route: "autocomplete" as const,
      language: "c" as const,
      renderer: "codex-text" as const,
      includedRuleIds: [],
      excludedRules: [],
      learnerRuleCount: 0,
      learnerRuleBudget: 2,
      learnerCharacterCount: 0,
      learnerCharacterBudget: 160,
      enforcementKinds: []
    }
  };
}

function createDocument() {
  return {
    languageId: "c",
    version: 1,
    uri: {
      fsPath: "C:/workspace/smoke.c",
      toString: () => "file:///C:/workspace/smoke.c"
    },
    lineAt: () => ({ text: "        total+=" }),
    offsetAt: () => 88,
    getText: () => "int total = 0;\n        total+="
  };
}

function createCancellationToken() {
  let cancelled = false;
  let listener: (() => void) | undefined;
  return {
    token: {
      get isCancellationRequested() {
        return cancelled;
      },
      onCancellationRequested(callback: () => void) {
        listener = callback;
        return { dispose: () => undefined };
      }
    },
    cancel() {
      cancelled = true;
      listener?.();
    }
  };
}
