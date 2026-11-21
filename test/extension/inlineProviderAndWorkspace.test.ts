import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FeatureFlags } from "../../src/core/contracts";
import { ModelRouter } from "../../src/core/ai";
import { TriggerSignalTracker } from "../../src/core/autocomplete";
import {
  createMemoryMementoPort,
  getWarmupProblemByKey,
  StylishRankEngine
} from "../../src/experience";
import {
  createMockTextDocument,
  createMockTextEditor,
  createMockVscodeState,
  MockPosition
} from "./mockVscode";

const mockState = vi.hoisted(() => ({
  harness: null as ReturnType<typeof createMockVscodeState> | null
}));

vi.mock("vscode", async () => {
  const { createMockVscodeState: factory } = await import("./mockVscode");
  const harness = factory();
  mockState.harness = harness;
  return harness.vscodeMock;
});

import {
  AlgoCoachInlineCompletionProvider,
  type SelectPlaceholderCommandArgs
} from "../../src/extension/inlineProvider";
import { WorkspaceFileController } from "../../src/extension/workspaceFileController";

const BASE_FLAGS: FeatureFlags = {
  preset: "focus",
  uiLanguage: "zh-CN",
  starterPackEnabled: false,
  shortcutHintsEnabled: false,
  ghostTextMode: "adaptive",
  strictWordAccept: false,
  microFriction: "off",
  coachStrictness: "standard",
  patternMapperEnabled: true,
  mockInterviewEnabled: false,
  stylishRankEnabled: true,
  typingSoundEnabled: false,
  typingSoundPack: "muted-brown",
  typingSoundVolume: 0.25,
  celebrationSoundEnabled: false,
  celebrationSoundVolume: 0.35
};

function makeCancellationToken() {
  return {
    isCancellationRequested: false,
    onCancellationRequested: () => ({ dispose: () => undefined })
  } as unknown as import("vscode").CancellationToken;
}

describe("AlgoCoachInlineCompletionProvider & WorkspaceFileController", () => {
  let tempDir: string;

  beforeEach(async () => {
    mockState.harness?.reset();
    tempDir = await mkdtemp(join(tmpdir(), "algo-coach-inline-ws-test-"));
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("returns empty immediately when ghostTextMode is off", async () => {
    const fetchMock = vi.fn();
    const router = new ModelRouter(
      {
        chat: { provider: "openai-compatible", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", apiKey: "sk-chat" },
        fim: { provider: "openai-compatible", baseUrl: "https://api.deepseek.com/beta", model: "deepseek-chat", apiKey: "sk-fim" }
      },
      { fetchImpl: fetchMock as unknown as typeof fetch }
    );

    const provider = new AlgoCoachInlineCompletionProvider({
      getFlags: () => ({ ...BASE_FLAGS, ghostTextMode: "off" }),
      getModelRouter: () => router,
      getCodeHabits: () => [],
      triggerTracker: new TriggerSignalTracker()
    });

    const doc = createMockTextDocument({
      fsPath: join(tempDir, "solution.cpp"),
      languageId: "cpp",
      content: "for (int i = 0; "
    });
    const items = await provider.provideInlineCompletionItems(
      doc as unknown as import("vscode").TextDocument,
      new MockPosition(0, 16) as unknown as import("vscode").Position,
      { triggerKind: 0 } as unknown as import("vscode").InlineCompletionContext,
      makeCancellationToken()
    );

    expect(items).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
    provider.dispose();
  });

  it("emits plain-text placeholder completion (no SnippetString), selects placeholder on accept & feeds Rank/Tracker", async () => {
    let nowMs = 10_000;
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          model: "deepseek-chat",
          choices: [{ text: "/* 条件 */) {", finish_reason: "stop" }]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );

    const router = new ModelRouter(
      {
        chat: { provider: "openai-compatible", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat", apiKey: "sk-chat" },
        fim: { provider: "openai-compatible", baseUrl: "https://api.deepseek.com/beta", model: "deepseek-chat", apiKey: "sk-fim" }
      },
      { fetchImpl: fetchMock as unknown as typeof fetch }
    );

    const tracker = new TriggerSignalTracker();
    const rankEngine = new StylishRankEngine({
      problemKey: "cf:100A",
      now: () => nowMs
    });

    // Give learner a baseline score first so penalties/credits are observable
    rankEngine.recordHandTypedLines({
      lines: [
        "int left = 0, right = n - 1;",
        "long long total_sum = 0;",
        "vector<int> prefix(n + 1, 0);"
      ],
      lspErrorCount: 0,
      nowMs
    });
    const scoreBefore = rankEngine.getState().score;

    const provider = new AlgoCoachInlineCompletionProvider({
      getFlags: () => BASE_FLAGS,
      getModelRouter: () => router,
      getCodeHabits: () => [],
      triggerTracker: tracker,
      now: () => nowMs,
      onGhostTextAccepted: (evt) => {
        rankEngine.recordGhostTextAccept(evt);
      }
    });

    const docBefore = createMockTextDocument({
      fsPath: join(tempDir, "solution.cpp"),
      languageId: "cpp",
      content: "void solve() {\n    if ("
    });

    const items = await provider.provideInlineCompletionItems(
      docBefore as unknown as import("vscode").TextDocument,
      new MockPosition(1, 8) as unknown as import("vscode").Position,
      { triggerKind: 0 } as unknown as import("vscode").InlineCompletionContext,
      makeCancellationToken()
    );

    expect(items).toHaveLength(1);
    const item = items[0]!;
    // Must be plain string (NOT SnippetString) to avoid VS Code Bug #272709
    expect(typeof item.insertText).toBe("string");
    expect(item.insertText).toBe("/* 条件 */) {");
    expect(item.command?.command).toBe("algoCoach.internal.selectPlaceholder");

    const cmdArgs = item.command?.arguments?.[0] as SelectPlaceholderCommandArgs;
    expect(cmdArgs.placeholder?.text).toBe("/* 条件 */");

    // Simulate VS Code having inserted the plain-text completion at line 1, col 8
    const docAfter = createMockTextDocument({
      fsPath: join(tempDir, "solution.cpp"),
      languageId: "cpp",
      content: "void solve() {\n    if (/* 条件 */) {"
    });
    const editor = createMockTextEditor(docAfter);
    mockState.harness!.setActiveTextEditor(editor);

    // Advance 600ms (deliberate review > 450ms -> no Blind Tab penalty)
    nowMs += 600;
    provider.handleSelectPlaceholder(cmdArgs);

    // Editor selection must highlight exactly `/* 条件 */` at line 1, chars [8..16]
    expect(editor.selection.start.line).toBe(1);
    expect(editor.selection.start.character).toBe(8);
    expect(editor.selection.end.line).toBe(1);
    expect(editor.selection.end.character).toBe(16);
    expect(docAfter.getText(editor.selection)).toBe("/* 条件 */");
    expect(tracker.snapshot(nowMs).consecutiveBlindAcceptsIn3Min).toBe(1);

    // Word-by-word accept resets blind-accept streak & adds +8 pts in StylishRankEngine
    nowMs += 300;
    provider.handleRecordWordAccept("vector<int>");
    expect(tracker.snapshot(nowMs).consecutiveBlindAcceptsIn3Min).toBe(0);
    expect(rankEngine.getState().score).toBe(scoreBefore + 8);

    provider.dispose();
  });

  it("creates starter practice files without overwriting user code, tracks active editor, and persists custom samples", async () => {
    mockState.harness!.setWorkspaceFolders([tempDir]);
    const memento = createMemoryMementoPort();
    const activeEvents: Array<{ problemKey?: string; language: string }> = [];

    const controller = new WorkspaceFileController({
      storageDir: tempDir,
      memento,
      onActiveContextChanged: (ctx) => {
        activeEvents.push({ problemKey: ctx.problemKey, language: ctx.language });
      }
    });
    await controller.init();

    const warmup1 = getWarmupProblemByKey("warmup:stdio-sum")!;
    const opened1 = await controller.openOrCreatePracticeFile(warmup1, "python");

    expect(opened1.created).toBe(true);
    expect(opened1.filePath).toBe(join(tempDir, "practice", "warmup_stdio-sum.py"));
    const starterContent = await readFile(opened1.filePath, "utf8");
    expect(starterContent).toContain("def solve()");

    // Simulate user editing their code; re-opening must NOT overwrite user code
    await writeFile(opened1.filePath, "# custom user solution\nprint(42)\n", "utf8");
    const reopened = await controller.openOrCreatePracticeFile(warmup1, "python");
    expect(reopened.created).toBe(false);
    expect(await readFile(reopened.filePath, "utf8")).toContain("# custom user solution");

    // Open second problem in C++ and switch back to first -> activeContext tracks problemKey + language
    const warmup2 = getWarmupProblemByKey("warmup:two-sum")!;
    const opened2 = await controller.openOrCreatePracticeFile(warmup2, "cpp");
    expect(opened2.filePath).toBe(join(tempDir, "practice", "warmup_two-sum.cpp"));
    expect(activeEvents.some((e) => e.problemKey === "warmup:two-sum" && e.language === "cpp")).toBe(true);

    // Custom samples persistence & original sample integrity
    const added = await controller.addCustomSample(warmup1.problemKey, "1\n10 20\n", "30\n");
    expect(added.isOriginal).toBe(false);

    const merged = controller.mergeSamplesForProblem(warmup1);
    expect(merged.filter((s) => s.isOriginal)).toHaveLength(3);
    expect(merged.filter((s) => !s.isOriginal)).toHaveLength(1);

    // Reloading a fresh controller reads persisted custom-samples.json cleanly
    const controller2 = new WorkspaceFileController({ storageDir: tempDir, memento });
    await controller2.init();
    expect(controller2.getCustomSamples(warmup1.problemKey)).toHaveLength(1);

    // Deleting an original sample ID is ignored (original samples are read-only)
    expect(await controller2.deleteCustomSample(warmup1.problemKey, "orig-1")).toBe(false);
    // Deleting the custom sample succeeds
    expect(await controller2.deleteCustomSample(warmup1.problemKey, added.id)).toBe(true);
    expect(controller2.getCustomSamples(warmup1.problemKey)).toHaveLength(0);

    controller.dispose();
    controller2.dispose();
  });
});
