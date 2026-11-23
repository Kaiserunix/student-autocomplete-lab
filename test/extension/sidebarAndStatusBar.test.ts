import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  HostToWebviewMessage,
  LocalRunResult,
  RunnerEngine,
  SidebarStateSnapshot,
  ToolchainProbe
} from "../../src/core/contracts";
import { DEFAULT_AI_ROUTER_CONFIG, ModelRouter } from "../../src/core/ai";
import { TriggerSignalTracker } from "../../src/core/autocomplete";
import { CoachService, HintLadderMachine, InMemoryHintLadderStore } from "../../src/core/coach";
import { InMemoryLearningEventStore, InMemoryUserOverridesStore } from "../../src/core/learner";
import {
  ManagedModuleController,
  SoundController,
  StarterVisualPresetManager,
  StylishRankEngine
} from "../../src/experience";
import { ProblemRepository } from "../../src/problems";
import {
  createMockExtensionContext,
  createMockTextDocument,
  createMockTextEditor,
  createMockVscodeState,
  MockUri
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
  buildReaderWebviewHtml
} from "../../src/extension/problemReaderPanel";
import {
  buildWebviewHtml,
  generateNonce,
  SidebarController
} from "../../src/extension/sidebarController";
import { StatusBarController } from "../../src/extension/statusBarController";
import {
  SecretKeyStore,
  VscodeMementoAdapter,
  VscodeWorkspaceConfigAdapter
} from "../../src/extension/vscodeAdapters";
import { WorkspaceFileController } from "../../src/extension/workspaceFileController";

const UNICODE_EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

describe("SidebarController HTML CSP security, StatusBarController & host message loop", () => {
  let tempDir: string;

  beforeEach(async () => {
    mockState.harness?.reset();
    tempDir = await mkdtemp(join(tmpdir(), "algo-coach-sidebar-test-"));
  });

  afterEach(async () => {
    vi.useRealTimers();
    await rm(tempDir, { recursive: true, force: true });
  });

  it("generates strict nonce-gated CSP HTML with zero external scripts or unsafe-inline", () => {
    const nonce1 = generateNonce();
    const nonce2 = generateNonce();
    expect(nonce1).toHaveLength(32);
    expect(nonce1).not.toBe(nonce2);

    const html = buildWebviewHtml({
      cspSource: "vscode-webview://test-origin",
      scriptUri: "vscode-webview://test-origin/dist/webview.js",
      styleUri: "vscode-webview://test-origin/dist/webview.css",
      assetsUri: "vscode-webview://test-origin/resources/ui",
      nonce: nonce1,
      uiLanguage: "zh-CN"
    });

    expect(html).toContain(`default-src 'none'`);
    expect(html).toContain(`script-src 'nonce-${nonce1}'`);
    expect(html).toContain(`style-src vscode-webview://test-origin`);
    expect(html).toContain(`<meta name="ac-assets" content="vscode-webview://test-origin/resources/ui">`);
    expect(html).toContain(`<script nonce="${nonce1}" src="vscode-webview://test-origin/dist/webview.js"></script>`);
    expect(html).toContain(`<div id="app"></div>`);

    const htmlNoAssets = buildWebviewHtml({
      cspSource: "vscode-webview://test-origin",
      scriptUri: "vscode-webview://test-origin/dist/webview.js",
      styleUri: "vscode-webview://test-origin/dist/webview.css",
      nonce: nonce1
    });
    expect(htmlNoAssets).not.toContain('name="ac-assets"');

    // Security redlines
    expect(html).not.toContain("unsafe-inline");
    expect(html).not.toContain("unsafe-eval");
    expect(html).not.toMatch(/<script[^>]+src=["']https?:\/\//i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);

    const readerHtml = buildReaderWebviewHtml({
      cspSource: "vscode-webview://reader-origin",
      scriptUri: "vscode-webview://reader-origin/dist/reader.js",
      styleUri: "vscode-webview://reader-origin/dist/webview.css",
      assetsUri: 'vscode-webview://reader-origin/resources/ui"><img src=x>',
      nonce: nonce2,
      title: 'P1001 <script>bad()</script>',
      uiLanguage: "zh-CN"
    });
    expect(readerHtml).toContain(`default-src 'none'`);
    expect(readerHtml).toContain(`script-src 'nonce-${nonce2}'`);
    expect(readerHtml).toContain(
      `<meta name="ac-assets" content="vscode-webview://reader-origin/resources/ui&quot;&gt;&lt;img src=x&gt;">`
    );
    expect(readerHtml).toContain(`<div id="reader-app"></div>`);
    expect(readerHtml).not.toContain("unsafe-inline");
    expect(readerHtml).not.toContain("<script>bad()");
    expect(readerHtml).not.toContain("<img src=x>");
    expect(readerHtml).not.toMatch(/\son[a-z]+\s*=/i);
  });

  it("enforces zero Unicode Emoji, Codicons, auto-hiding mute & 6s status-bar whisper in StatusBarController", () => {
    vi.useFakeTimers();
    const statusBar = new StatusBarController();

    const baseFlags = {
      preset: "focus" as const,
      uiLanguage: "zh-CN" as const,
      starterPackEnabled: false,
      shortcutHintsEnabled: true,
      ghostTextMode: "adaptive" as const,
      strictWordAccept: false,
      microFriction: "off" as const,
      coachStrictness: "standard" as const,
      patternMapperEnabled: true,
      mockInterviewEnabled: false,
      stylishRankEnabled: true,
      typingSoundEnabled: false,
      typingSoundPack: "muted-brown" as const,
      typingSoundVolume: 0.25,
      celebrationSoundEnabled: false,
      celebrationSoundVolume: 0.35
    };

    const rankEngine = new StylishRankEngine({ problemKey: "warmup:stdio-sum" });
    statusBar.updatePreset(baseFlags);
    statusBar.updateStylishRank(baseFlags, rankEngine.getState());
    statusBar.updateAudioIndicator(new SoundController().getStatusBarIndicator());

    const [presetItem, rankItem, muteItem, whisperItem] = mockState.harness!.statusBarItems;
    expect(presetItem!.visible).toBe(true);
    expect(presetItem!.text).toContain("$(mortar-board)");
    expect(presetItem!.command).toBe("algoCoach.selectPreset");

    expect(rankItem!.visible).toBe(true);
    expect(rankItem!.text).toBe("D · Draft");
    expect(rankItem!.tooltip).toContain("D · Draft");

    // Mute indicator must remain hidden (zero footprint) when all sounds are disabled
    expect(muteItem!.visible).toBe(false);

    // Enable sound -> shows $(unmute), muted -> shows $(mute)
    const activeSound = new SoundController({ typingSoundEnabled: true });
    statusBar.updateAudioIndicator(activeSound.getStatusBarIndicator());
    expect(muteItem!.visible).toBe(true);
    expect(muteItem!.text).toBe("$(unmute)");

    activeSound.toggleMute();
    statusBar.updateAudioIndicator(activeSound.getStatusBarIndicator());
    expect(muteItem!.text).toBe("$(mute)");

    // Disabling stylishRankEnabled hides rank item cleanly
    statusBar.updateStylishRank({ ...baseFlags, stylishRankEnabled: false }, rankEngine.getState());
    expect(rankItem!.visible).toBe(false);

    // Shortcut whisper appears for 6s and auto-hides without firing VS Code Toast
    statusBar.showShortcutWhisper({
      tipId: "run-samples",
      channel: "statusBar",
      durationMs: 6000,
      shortcutLabel: "Ctrl+Alt+R",
      text: "快捷键: Ctrl+Alt+R 运行本地样例",
      tooltip: "点击查看",
      shownAtMs: Date.now()
    });
    expect(whisperItem!.visible).toBe(true);
    expect(whisperItem!.text).toContain("$(lightbulb)");
    expect(mockState.harness!.vscodeMock.window.showInformationMessage).not.toHaveBeenCalled();

    vi.advanceTimersByTime(6000);
    expect(whisperItem!.visible).toBe(false);

    // Zero Unicode Emoji across all status bar texts and tooltips
    for (const item of mockState.harness!.statusBarItems) {
      expect(UNICODE_EMOJI_RE.test(item.text)).toBe(false);
      expect(UNICODE_EMOJI_RE.test(item.tooltip ?? "")).toBe(false);
    }

    statusBar.dispose();
  });

  it("routes WebviewToHostMessage end-to-end across warmup, runner, submit, coach, OLM & AI config", async () => {
    const context = createMockExtensionContext(tempDir, resolve("."));
    mockState.harness!.setWorkspaceFolders([tempDir]);

    const config = new VscodeWorkspaceConfigAdapter();
    const memento = new VscodeMementoAdapter(
      context.globalState as unknown as import("vscode").Memento
    );
    const secrets = new SecretKeyStore(context.secrets);
    const visualPresetManager = new StarterVisualPresetManager(config, memento);
    const managedModules = new ManagedModuleController();
    const mockFetch = vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("codeforces.com/api/user.status")) {
        return new Response(
          JSON.stringify({
            status: "OK",
            result: [
              {
                id: 987654,
                contestId: 1433,
                creationTimeSeconds: Math.floor(Date.now() / 1000),
                problem: { index: "G" },
                verdict: "OK",
                passedTestCount: 42,
                timeConsumingMillis: 120,
                memoryConsumedBytes: 8 * 1024 * 1024
              }
            ]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.endsWith("/models")) {
        return new Response(
          JSON.stringify({ data: [{ id: "deepseek-chat" }] }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.endsWith("/chat/completions")) {
        return new Response(
          JSON.stringify({
            model: "deepseek-chat",
            choices: [{ message: { content: "OK" }, finish_reason: "stop" }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      if (url.endsWith("/completions")) {
        return new Response(
          JSON.stringify({
            model: "deepseek-chat",
            choices: [{ text: "return a + b", finish_reason: "stop" }]
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      }
      return new Response("Not Found", { status: 404 });
    });

    const problemRepository = new ProblemRepository({
      cacheDir: join(tempDir, "problems"),
      fetchImpl: mockFetch as unknown as typeof fetch
    });
    const eventStore = new InMemoryLearningEventStore();
    const overridesStore = new InMemoryUserOverridesStore();
    const triggerTracker = new TriggerSignalTracker();
    const statusBar = new StatusBarController();
    const workspaceFiles = new WorkspaceFileController({
      storageDir: tempDir,
      memento
    });
    await workspaceFiles.init();

    const modelRouter = new ModelRouter(DEFAULT_AI_ROUTER_CONFIG);
    const coachService = new CoachService({
      hintLadder: new HintLadderMachine({ store: new InMemoryHintLadderStore() }),
      modelRouter
    });

    const mockRunResult: LocalRunResult = {
      schemaVersion: "local-run/v2",
      source: "local_runner",
      problemKey: "warmup:stdio-sum",
      language: "python",
      mode: "stdio",
      codeHash: "hash-ac-1",
      compileOk: true,
      allPassed: true,
      originalTotal: 3,
      originalPassed: 3,
      customTotal: 1,
      customPassed: 1,
      cases: [
        {
          id: "orig-1",
          isOriginal: true,
          verdict: "AC",
          durationMs: 12,
          input: "3\n1 2\n-5 5\n100 250\n",
          expected: "3\n0\n350\n",
          actual: "3\n0\n350\n",
          stderr: ""
        },
        {
          id: "orig-2",
          isOriginal: true,
          verdict: "AC",
          durationMs: 10,
          input: "2\n0 0\n-1000000000000 -1000000000000\n",
          expected: "0\n-2000000000000\n",
          actual: "0\n-2000000000000\n",
          stderr: ""
        },
        {
          id: "orig-3",
          isOriginal: true,
          verdict: "AC",
          durationMs: 11,
          input: "2\n1000000000000 1000000000000\n999999999999 -1000000000000\n",
          expected: "2000000000000\n-1\n",
          actual: "2000000000000\n-1\n",
          stderr: ""
        },
        {
          id: "custom-1",
          isOriginal: false,
          verdict: "AC",
          durationMs: 9,
          input: "1\n7 8\n",
          expected: "15\n",
          actual: "15\n",
          stderr: ""
        }
      ],
      memoryNote: "mock",
      timestamp: new Date().toISOString()
    };

    const runnerEngine: RunnerEngine = {
      engineId: "mock-runner",
      runSamples: vi.fn(async () => mockRunResult),
      probeToolchains: vi.fn(async (): Promise<ToolchainProbe[]> => [
        { language: "python", available: true, command: "python3", version: "3.12", installHint: "" }
      ])
    };

    let audioMuted = false;
    const postedMessages: HostToWebviewMessage[] = [];

    const sidebar = new SidebarController({
      extensionUri: MockUri.file(resolve(".")) as unknown as import("vscode").Uri,
      storageDir: tempDir,
      config,
      secrets,
      visualPresetManager,
      managedModules,
      problemRepository,
      runnerEngine,
      modelRouter,
      coachService,
      eventStore,
      overridesStore,
      triggerTracker,
      workspaceFiles,
      statusBar,
      getShortcutCoach: () => undefined,
      getSoundController: () => managedModules.getInstance<SoundController>("soundController"),
      getAudioMuted: () => audioMuted,
      setAudioMuted: (m) => {
        audioMuted = m;
      },
      fetchImpl: mockFetch as unknown as typeof fetch
    });

    managedModules.register({
      id: "soundController",
      isEnabled: (flags) => flags.typingSoundEnabled || flags.celebrationSoundEnabled,
      create: (flags) =>
        new SoundController({
          ...flags,
          focused: true,
          muted: audioMuted,
          onEmit: (payload) => sidebar.dispatchSound(payload)
        }),
      onUpdate: (inst, flags) => inst.applyFeatureFlags(flags)
    });

    await sidebar.init();

    // Attach mock webview view
    const mockWebviewView = {
      webview: {
        cspSource: "vscode-webview://unit-test",
        options: {},
        html: "",
        asWebviewUri: (u: MockUri) => u,
        postMessage: vi.fn(async (msg: HostToWebviewMessage) => {
          postedMessages.push(msg);
          return true;
        }),
        onDidReceiveMessage: vi.fn(() => ({ dispose: () => undefined }))
      },
      onDidDispose: vi.fn(() => ({ dispose: () => undefined }))
    };
    sidebar.resolveWebviewView(mockWebviewView as unknown as import("vscode").WebviewView);
    expect(mockWebviewView.webview.html).toContain('<meta name="ac-assets" content="');
    expect(mockWebviewView.webview.html).toMatch(/resources[\\/]ui/);

    const lastSyncedState = (): SidebarStateSnapshot => {
      const syncs = postedMessages.filter(
        (m): m is Extract<HostToWebviewMessage, { type: "state/sync" }> => m.type === "state/sync"
      );
      expect(syncs.length).toBeGreaterThan(0);
      return syncs[syncs.length - 1]!.payload;
    };

    // 1. webview/ready -> state/sync
    await sidebar.handleMessage({ type: "webview/ready" });
    expect(lastSyncedState().flags.preset).toBe("focus");

    // 2. Enable celebrationSoundEnabled & strictWordAccept via flag/update
    await sidebar.handleMessage({
      type: "flag/update",
      payload: { key: "celebrationSoundEnabled", value: true }
    });
    await sidebar.handleMessage({
      type: "flag/update",
      payload: { key: "strictWordAccept", value: true }
    });
    expect(managedModules.isActive("soundController")).toBe(true);
    expect(
      mockState.harness!.executedCommands.some(
        (c) =>
          c.command === "setContext" &&
          c.args[0] === "algoCoach.strictWordAccept" &&
          c.args[1] === true
      )
    ).toBe(true);

    // 3. Apply & restore beginner visual preset
    await sidebar.handleMessage({ type: "starter/applyVisualPreset" });
    expect(lastSyncedState().visualPresetApplied).toBe(true);
    await sidebar.handleMessage({ type: "starter/restoreVisualPreset" });
    expect(lastSyncedState().visualPresetApplied).toBe(false);

    // 4. Load 3-problem warmup pack & add custom sample (auto-switches to workspace tab)
    await sidebar.handleMessage({ type: "starter/loadWarmupPack" });
    expect(lastSyncedState().activeProblem?.problemKey).toBe("warmup:stdio-sum");
    expect(lastSyncedState().problems.length).toBe(3);
    expect(
      postedMessages.some((m) => m.type === "ui/switchTab" && m.payload.tab === "workspace")
    ).toBe(true);

    await sidebar.handleMessage({
      type: "problem/addSample",
      payload: { problemKey: "warmup:stdio-sum", input: "1\n7 8\n", expectedOutput: "15\n" }
    });
    expect(lastSyncedState().activeProblem?.samples.length).toBe(4);

    // 5. Run samples -> drives StylishRankEngine & SoundController sfx/play
    await sidebar.handleMessage({ type: "runner/runSamples" });
    const afterRun = lastSyncedState();
    expect(afterRun.lastRun?.allPassed).toBe(true);
    expect(afterRun.stylishRank?.score).toBeGreaterThan(0);
    expect(
      postedMessages.some((m) => m.type === "sfx/play" && m.payload.kind === "chime_pass")
    ).toBe(true);

    // 6. Coach hint request -> advances hintLevel L0 -> L1 & updates hintCeiling to SS
    await sidebar.handleMessage({
      type: "coach/request",
      payload: { action: "hint", stuckCategory: "no_idea" }
    });
    const afterHint = lastSyncedState();
    expect(afterHint.hintLevel).toBe(1);
    expect(afterHint.stylishRank?.hintCeiling).toBe("SS");

    // 7. Implicit giveUp without confirmGiveUp is refused; explicit confirmGiveUp unlocks & caps at C
    await sidebar.handleMessage({
      type: "coach/request",
      payload: { action: "giveUp", confirmGiveUp: false }
    });
    expect(lastSyncedState().stylishRank?.hintCeiling).toBe("SS");
    expect(lastSyncedState().giveUpUnlocked).toBe(false);

    await sidebar.handleMessage({
      type: "coach/request",
      payload: { action: "giveUp", confirmGiveUp: true }
    });
    expect(lastSyncedState().stylishRank?.hintCeiling).toBe("C");
    expect(lastSyncedState().giveUpUnlocked).toBe(true);

    // 8. Report manual verdict -> persists terminal LearningEventV2, updates OLM snapshot, exposes recentEvents & 1-click undoEventId
    await sidebar.handleMessage({
      type: "submit/reportVerdict",
      payload: { verdict: "AC" }
    });
    const events = await eventStore.readAll();
    const acEvent = events.find((e) => e.verdict === "AC" && e.kind === "attempt_completed");
    expect(acEvent).toBeDefined();
    expect(lastSyncedState().learnerSnapshot.totalTerminalEvents).toBeGreaterThanOrEqual(2);
    expect(lastSyncedState().recentEvents?.[0]?.eventId).toBe(acEvent!.eventId);
    expect(
      postedMessages.some(
        (m) => m.type === "toast/inline" && m.payload.undoEventId === acEvent!.eventId
      )
    ).toBe(true);

    // 9. OLM overrides: mute misconception & upsert code habit
    await sidebar.handleMessage({
      type: "learner/muteMisconception",
      payload: { misconceptionId: "loop.off_by_one", muted: true }
    });
    await sidebar.handleMessage({
      type: "learner/upsertCodeHabit",
      payload: { id: "h1", language: "python", ruleText: "Use sys.stdin.read()", enabled: true }
    });
    expect(lastSyncedState().userOverrides.mutedMisconceptionIds["loop.off_by_one"]).toBeDefined();
    expect(lastSyncedState().userOverrides.autocompleteCodeHabits).toHaveLength(1);

    // 10. Save AI config safely -> keys isolated in SecretStorage, never in state snapshot
    await sidebar.handleMessage({
      type: "ai/saveConfig",
      payload: {
        chat: {
          provider: "openai-compatible",
          baseUrl: "https://api.deepseek.com/v1",
          model: "deepseek-chat",
          apiKey: "sk-chat-isolated-secret"
        },
        fim: {
          provider: "openai-compatible",
          baseUrl: "https://api.deepseek.com/beta",
          model: "deepseek-chat",
          apiKey: "sk-fim-isolated-secret"
        },
        codeforcesHandle: "jiangly"
      }
    });
    const afterAiSave = lastSyncedState();
    expect(afterAiSave.aiConfig.chat.hasApiKey).toBe(true);
    expect(afterAiSave.aiConfig.fim.hasApiKey).toBe(true);
    expect(JSON.stringify(afterAiSave)).not.toContain("sk-chat-isolated-secret");
    expect(JSON.stringify(afterAiSave)).not.toContain("sk-fim-isolated-secret");

    // 11. Copy & open submit on a LeetCode problem strips local debug blocks & opens whitelisted URL
    await problemRepository.saveProblem({
      schemaVersion: "problem-doc/v2",
      problemKey: "lc-cn:two-sum",
      source: "leetcode-cn",
      sourceId: "two-sum",
      canonicalUrl: "https://leetcode.cn/problems/two-sum/",
      title: "Two Sum",
      locale: "zh-CN",
      completeness: "full",
      ioMode: "function",
      samples: [],
      rawTags: ["array"],
      provenance: { ingestChannel: "builtin-adapter", fetchedAt: new Date().toISOString() }
    });
    await sidebar.handleMessage({
      type: "problem/select",
      payload: { problemKey: "lc-cn:two-sum", openFile: false }
    });
    const pyDoc = createMockTextDocument({
      fsPath: join(tempDir, "practice", "lc-cn_two-sum.py"),
      languageId: "python",
      content: "class Solution:\n    def twoSum(self, nums, target):\n        return [0, 1]\n\nif __name__ == '__main__':\n    print(1)\n"
    });
    mockState.harness!.setActiveTextEditor(createMockTextEditor(pyDoc));
    await sidebar.handleMessage({ type: "submit/copyAndOpen" });

    expect(mockState.harness!.getClipboard()).not.toContain("__main__");
    expect(mockState.harness!.openedExternalUrls).toContain("https://leetcode.cn/problems/two-sum/");

    // 12. Audio mute toggle & test sound
    await sidebar.handleMessage({ type: "audio/toggleMute" });
    expect(lastSyncedState().audioMuted).toBe(true);

    await sidebar.handleMessage({
      type: "audio/testSound",
      payload: { kind: "key_normal" }
    });
    expect(
      postedMessages.some((m) => m.type === "sfx/play" && m.payload.kind === "key_normal")
    ).toBe(true);

    // 13. 3-step AI health check runs against mock fetch & never leaks API keys
    await sidebar.handleMessage({ type: "ai/runHealthCheck" });
    const afterHealth = lastSyncedState();
    expect(afterHealth.lastHealthCheck?.ok).toBe(true);
    expect(afterHealth.lastHealthCheck?.steps.map((s) => s.step)).toEqual(["models", "chat", "fim"]);
    expect(JSON.stringify(afterHealth.lastHealthCheck)).not.toContain("sk-");

    // 14. Codeforces public verdict sync -> idempotent cf-sub-<id> event & officialAc === true
    await problemRepository.saveProblem({
      schemaVersion: "problem-doc/v2",
      problemKey: "cf:1433G",
      source: "codeforces",
      sourceId: "1433G",
      canonicalUrl: "https://codeforces.com/contest/1433/problem/G",
      title: "Reducing Delivery Cost",
      locale: "en-US",
      completeness: "metadata_only",
      ioMode: "stdio",
      samples: [],
      rawTags: ["graphs", "shortest paths"],
      provenance: { ingestChannel: "builtin-adapter", fetchedAt: new Date().toISOString() }
    });
    await sidebar.handleMessage({
      type: "problem/select",
      payload: { problemKey: "cf:1433G", openFile: false }
    });
    await sidebar.handleMessage({ type: "submit/syncCodeforces" });
    await sidebar.handleMessage({ type: "submit/syncCodeforces" }); // idempotent dedup!
    const cfEvents = (await eventStore.readAll()).filter((e) => e.eventId === "cf-sub-987654");
    expect(cfEvents).toHaveLength(1);
    expect(cfEvents[0]?.verdictSource).toBe("official_oj");
    expect(lastSyncedState().stylishRank?.officialAc).toBe(true);

    // 15. Curated sheet load, clipboard merge, preference update, habit delete & event void
    await sidebar.handleMessage({ type: "problem/loadSheet", payload: { sheetId: "hot-100" } });
    expect(lastSyncedState().problems.length).toBeGreaterThan(20);

    await sidebar.handleMessage({
      type: "problem/importClipboard",
      payload: {
        text: "# Reducing Delivery Cost\nGiven a weighted graph with n vertices.\n\n### Sample Input 1\n```\n1 2\n```\n### Sample Output 1\n```\n3\n```\n",
        mergeWithActive: true
      }
    });
    expect(lastSyncedState().activeProblem?.statementMarkdown).toContain("Given a weighted graph");

    await sidebar.handleMessage({
      type: "learner/updatePreferences",
      payload: { hintStyle: "dry_run_first", targetGoal: "contest_icpc_oi" }
    });
    expect(lastSyncedState().userOverrides.teachingPreferences.hintStyle).toBe("dry_run_first");

    await sidebar.handleMessage({ type: "learner/deleteCodeHabit", payload: { id: "h1" } });
    expect(lastSyncedState().userOverrides.autocompleteCodeHabits).toHaveLength(0);

    await sidebar.handleMessage({ type: "learner/voidEvent", payload: { eventId: "cf-sub-987654" } });
    expect(lastSyncedState().userOverrides.voidedEventIds).toContain("cf-sub-987654");

    // 16. Split ProblemReaderPanel opens beside editor, syncs on updates, copies to clipboard, and respects dismissal
    expect(mockState.harness!.webviewPanels.length).toBeGreaterThanOrEqual(1);
    const readerPanel = mockState.harness!.webviewPanels[0]!;
    expect(readerPanel.viewType).toBe("algoCoach.problemReader");
    expect(readerPanel.webview.html).toContain("reader.js");
    expect(readerPanel.webview.html).toContain('<meta name="ac-assets" content="');
    expect(readerPanel.webview.html).toMatch(/resources[\\/]ui/);
    expect(readerPanel.postedMessages.some((m) => (m as { type?: string }).type === "reader/sync")).toBe(true);

    // Copy sample text via sidebar & reader messages
    await sidebar.handleMessage({
      type: "clipboard/copy",
      payload: { text: "3\n1 2\n", label: "Sample #1" }
    });
    expect(mockState.harness!.getClipboard()).toBe("3\n1 2\n");

    // Reader 1-click clipboard merge routes through handleReaderMessage (reading system clipboard when text is "")
    await problemRepository.saveProblem({
      schemaVersion: "problem-doc/v2",
      problemKey: "lc-cn:meta-only-reader",
      source: "leetcode-cn",
      sourceId: "meta-only-reader",
      title: "Meta Only Reader",
      locale: "zh-CN",
      completeness: "metadata_only",
      ioMode: "function",
      samples: [],
      rawTags: ["array"],
      provenance: { ingestChannel: "builtin-adapter", fetchedAt: new Date().toISOString() }
    });
    await sidebar.handleMessage({
      type: "problem/select",
      payload: { problemKey: "lc-cn:meta-only-reader", openFile: false }
    });
    await mockState.harness!.vscodeMock.env.clipboard.writeText(
      "# Meta Only Reader\nFull problem statement pasted from Reader clipboard.\n"
    );
    await sidebar.handleReaderMessage({
      type: "problem/importClipboard",
      payload: { text: "", mergeWithActive: true }
    });
    expect(lastSyncedState().activeProblem?.statementMarkdown).toContain(
      "Full problem statement pasted from Reader clipboard."
    );

    // Closing the reader panel remembers user dismissal until explicitly opened again
    readerPanel.dispose();
    const countAfterClose = mockState.harness!.webviewPanels.length;
    await sidebar.handleMessage({
      type: "problem/select",
      payload: { problemKey: "warmup:two-sum", openFile: true }
    });
    expect(mockState.harness!.webviewPanels.length).toBe(countAfterClose);

    // Explicit problem/openReader re-opens a fresh panel beside the editor
    await sidebar.handleMessage({ type: "problem/openReader" });
    expect(mockState.harness!.webviewPanels.length).toBe(countAfterClose + 1);

    sidebar.dispose();
    workspaceFiles.dispose();
    statusBar.dispose();
    managedModules.dispose();
  });

  it("emits warn toasts on selectProblem lazy-hydration failure and importProblemRef partial completeness", async () => {
    const context = createMockExtensionContext(tempDir, resolve("."));
    mockState.harness!.setWorkspaceFolders([tempDir]);

    const config = new VscodeWorkspaceConfigAdapter();
    const memento = new VscodeMementoAdapter(
      context.globalState as unknown as import("vscode").Memento
    );
    const secrets = new SecretKeyStore(context.secrets);
    const visualPresetManager = new StarterVisualPresetManager(config, memento);
    const managedModules = new ManagedModuleController();
    const problemRepository = new ProblemRepository({
      cacheDir: join(tempDir, "problems-ux")
    });
    const workspaceFiles = new WorkspaceFileController({ storageDir: tempDir, memento });
    await workspaceFiles.init();
    const statusBar = new StatusBarController();

    const postedMessages: HostToWebviewMessage[] = [];
    const sidebar = new SidebarController({
      extensionUri: MockUri.file(resolve(".")) as unknown as import("vscode").Uri,
      storageDir: tempDir,
      config,
      secrets,
      visualPresetManager,
      managedModules,
      problemRepository,
      runnerEngine: {
        engineId: "noop",
        runSamples: vi.fn(),
        probeToolchains: vi.fn(async () => [])
      },
      modelRouter: new ModelRouter(DEFAULT_AI_ROUTER_CONFIG),
      coachService: new CoachService({
        hintLadder: new HintLadderMachine({ store: new InMemoryHintLadderStore() }),
        modelRouter: new ModelRouter(DEFAULT_AI_ROUTER_CONFIG)
      }),
      eventStore: new InMemoryLearningEventStore(),
      overridesStore: new InMemoryUserOverridesStore(),
      triggerTracker: new TriggerSignalTracker(),
      workspaceFiles,
      statusBar,
      getShortcutCoach: () => undefined,
      getSoundController: () => undefined,
      getAudioMuted: () => false,
      setAudioMuted: () => undefined
    });
    await sidebar.init();

    const mockWebviewView = {
      webview: {
        cspSource: "vscode-webview://unit-test",
        options: {},
        html: "",
        asWebviewUri: (u: MockUri) => u,
        postMessage: vi.fn(async (msg: HostToWebviewMessage) => {
          postedMessages.push(msg);
          return true;
        }),
        onDidReceiveMessage: vi.fn(() => ({ dispose: () => undefined }))
      },
      onDidDispose: vi.fn(() => ({ dispose: () => undefined }))
    };
    sidebar.resolveWebviewView(mockWebviewView as unknown as import("vscode").WebviewView);

    const toasts = () =>
      postedMessages.filter(
        (m): m is Extract<HostToWebviewMessage, { type: "toast/inline" }> => m.type === "toast/inline"
      );

    // 1. selectProblem: lazy hydration failure posts a warn toast but still opens the cached metadata_only problem
    await problemRepository.saveProblem({
      schemaVersion: "problem-doc/v2",
      problemKey: "cf:1900A",
      source: "codeforces",
      sourceId: "1900A",
      canonicalUrl: "https://codeforces.com/contest/1900/problem/A",
      title: "Cover in Water",
      locale: "en-US",
      completeness: "metadata_only",
      ioMode: "stdio",
      samples: [],
      rawTags: ["greedy"],
      provenance: { ingestChannel: "builtin-adapter", fetchedAt: new Date().toISOString() }
    });
    const importSpy = vi
      .spyOn(problemRepository, "importProblem")
      .mockRejectedValueOnce(new Error("Network timeout"));

    await sidebar.selectProblem("cf:1900A", false);
    expect(sidebar.getActiveProblem()?.problemKey).toBe("cf:1900A");
    const hydrateToast = toasts().at(-1);
    expect(hydrateToast?.payload.level).toBe("warn");
    expect(hydrateToast?.payload.text).toContain("Network timeout");

    // 2. importProblemRef: partial completeness (metadata_only) emits warn guidance mentioning Competitive Companion & Paste Statement
    importSpy.mockResolvedValueOnce({
      schemaVersion: "problem-doc/v2",
      problemKey: "cf:1900B",
      source: "codeforces",
      sourceId: "1900B",
      canonicalUrl: "https://codeforces.com/contest/1900/problem/B",
      title: "Laura and Operations",
      locale: "en-US",
      completeness: "metadata_only",
      ioMode: "stdio",
      samples: [],
      rawTags: ["math"],
      provenance: { ingestChannel: "builtin-adapter", fetchedAt: new Date().toISOString() }
    });
    await sidebar.importProblemRef("CF1900B", "codeforces");
    const partialToastZh = toasts().at(-1);
    expect(partialToastZh?.payload.level).toBe("warn");
    expect(partialToastZh?.payload.text).toContain("Competitive Companion");
    expect(partialToastZh?.payload.text).toContain("粘贴题面");

    // 3. en-US full import emits info toast; en-US samples_only emits warn toast mentioning Paste Statement
    await sidebar.updateFeatureFlag("uiLanguage", "en-US");
    importSpy.mockResolvedValueOnce({
      schemaVersion: "problem-doc/v2",
      problemKey: "lc-cn:two-sum",
      source: "leetcode-cn",
      sourceId: "two-sum",
      title: "Two Sum",
      locale: "zh-CN",
      completeness: "samples_only",
      ioMode: "function",
      samples: [{ id: "s1", input: "[2,7]\n9", expectedOutput: "[0,1]", isOriginal: true }],
      rawTags: ["array"],
      provenance: { ingestChannel: "builtin-adapter", fetchedAt: new Date().toISOString() }
    });
    await sidebar.importProblemRef("two-sum", "leetcode-cn");
    const partialToastEn = toasts().at(-1);
    expect(partialToastEn?.payload.level).toBe("warn");
    expect(partialToastEn?.payload.text).toContain("Competitive Companion");
    expect(partialToastEn?.payload.text).toContain("Paste Statement");

    importSpy.mockResolvedValueOnce({
      schemaVersion: "problem-doc/v2",
      problemKey: "luogu:P1001",
      source: "luogu",
      sourceId: "P1001",
      title: "A+B Problem",
      locale: "zh-CN",
      completeness: "full",
      ioMode: "stdio",
      statementMarkdown: "Given a and b, output a + b.",
      samples: [{ id: "s1", input: "1 2\n", expectedOutput: "3\n", isOriginal: true }],
      rawTags: ["入门"],
      provenance: { ingestChannel: "builtin-adapter", fetchedAt: new Date().toISOString() }
    });
    await sidebar.importProblemRef("P1001", "luogu");
    const fullToastEn = toasts().at(-1);
    expect(fullToastEn?.payload.level).toBe("info");
    expect(fullToastEn?.payload.text).toContain("Imported: A+B Problem");

    sidebar.dispose();
    workspaceFiles.dispose();
    statusBar.dispose();
    managedModules.dispose();
  });
});
