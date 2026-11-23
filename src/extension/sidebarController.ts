import { randomBytes } from "node:crypto";
import { join } from "node:path";
import * as vscode from "vscode";
import type {
  CoachAction,
  CoachResponsePayload,
  FeatureFlags,
  HintLevel,
  HostToWebviewMessage,
  LearnerSnapshotV2,
  LearningEventV2,
  LearningEventVerdict,
  LocalRunResult,
  OfficialVerdictEvent,
  OfficialVerdictStatus,
  PresetMode,
  ProblemDocument,
  ProblemReaderSnapshot,
  ProblemSourceId,
  ReaderToHostMessage,
  RecommendationCandidate,
  RecommendationItem,
  RunnerEngine,
  SampleVerdict,
  SidebarBridgeStatus,
  SidebarHealthCheckSummary,
  SidebarRecentEvent,
  SidebarSearchResults,
  SidebarStateSnapshot,
  SoundEventKind,
  StuckCategory,
  SupportedLanguage,
  ToastActionCta,
  ToolchainProbe,
  UserOverridesV2,
  WebviewToHostMessage
} from "../core/contracts";
import {
  ModelRouter,
  runAiHealthCheck,
  type AiHealthCheckResult,
  type AiHealthCheckStep
} from "../core/ai";
import type { TriggerSignalTracker } from "../core/autocomplete";
import { analyzeProblemPattern, type CoachService } from "../core/coach";
import {
  createDefaultUserOverrides,
  deriveLearnerSnapshot,
  muteMisconception,
  normalizeConceptTags,
  recommendNextProblems,
  removeCodeHabit,
  unmuteMisconception,
  updateTeachingPreferences,
  upsertCodeHabit,
  voidLearningEvent,
  type LearningEventStore,
  type UserOverridesStore
} from "../core/learner";
import {
  applyPresetToConfig,
  FEATURE_FLAG_CONFIG_KEYS,
  getWarmupProblems,
  resolveFeatureFlags,
  SoundController,
  StylishRankEngine,
  type ManagedModuleController,
  type ShortcutCoach,
  type SoundDispatchPayload,
  type StarterVisualPresetManager,
  type StylishRankTransition,
  type WorkspaceConfigPort
} from "../experience";
import {
  curatedEntryToMetadataDocument,
  getCuratedSheet,
  listCuratedSheets,
  type NormalizedBridgeVerdict,
  type ProblemRepository
} from "../problems";
import {
  COMPANION_USERSCRIPT_FILENAME,
  buildCompanionUserscript,
  createManualVerdictEvent,
  fetchLatestPublicVerdict,
  isAllowedSubmitUrl,
  pollPublicOfficialVerdict,
  prepareSubmitPayload,
  resolveHandleForPlatform,
  resolveSubmitTarget,
  supportsPublicVerdictSync,
  type OjPublicHandles
} from "../submitBridge";
import { syncStrictWordAcceptContext } from "./inlineProvider";
import { ProblemReaderPanel } from "./problemReaderPanel";
import type { StatusBarController } from "./statusBarController";
import {
  AI_CONFIG_KEYS,
  buildSidebarAiConfigView,
  readAiRouterConfig,
  resolveDefaultConfigTarget,
  saveAiConfigSafely,
  type SecretKeyStore
} from "./vscodeAdapters";
import type { ActiveEditorContext, WorkspaceFileController } from "./workspaceFileController";

const WALKTHROUGH_ID = "kaiserunix.algo-coach#algoCoach.starterPack";

export function generateNonce(): string {
  return randomBytes(16).toString("hex");
}

export interface WebviewHtmlParams {
  cspSource: string;
  scriptUri: string;
  styleUri: string;
  assetsUri?: string;
  nonce: string;
  uiLanguage?: "zh-CN" | "en-US";
}

function escapeAttr(raw: string): string {
  return raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Pure Webview HTML shell generator with strict nonce-based CSP and zero external scripts.
 */
export function buildWebviewHtml(params: WebviewHtmlParams): string {
  const lang = params.uiLanguage === "en-US" ? "en" : "zh-CN";
  const assetsMeta = params.assetsUri
    ? [`  <meta name="ac-assets" content="${escapeAttr(params.assetsUri)}">`]
    : [];
  const csp = [
    "default-src 'none'",
    `img-src ${params.cspSource} data:`,
    `style-src ${params.cspSource}`,
    `script-src 'nonce-${params.nonce}'`,
    `font-src ${params.cspSource}`
  ].join("; ");

  return [
    "<!DOCTYPE html>",
    `<html lang="${lang}">`,
    "<head>",
    '  <meta charset="UTF-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0">',
    `  <meta http-equiv="Content-Security-Policy" content="${csp}">`,
    ...assetsMeta,
    "  <title>Algo Coach</title>",
    `  <link rel="stylesheet" href="${params.styleUri}">`,
    "</head>",
    "<body>",
    '  <div id="app"></div>',
    `  <script nonce="${params.nonce}" src="${params.scriptUri}"></script>`,
    "</body>",
    "</html>"
  ].join("\n");
}

export interface SidebarControllerDeps {
  extensionUri: vscode.Uri;
  storageDir: string;
  config: WorkspaceConfigPort;
  secrets: SecretKeyStore;
  visualPresetManager: StarterVisualPresetManager;
  managedModules: ManagedModuleController;
  problemRepository: ProblemRepository;
  runnerEngine: RunnerEngine;
  modelRouter: ModelRouter;
  coachService: CoachService;
  eventStore: LearningEventStore;
  overridesStore: UserOverridesStore;
  triggerTracker: TriggerSignalTracker;
  workspaceFiles: WorkspaceFileController;
  statusBar: StatusBarController;
  getShortcutCoach: () => ShortcutCoach | undefined;
  getSoundController: () => SoundController | undefined;
  getAudioMuted: () => boolean;
  setAudioMuted: (muted: boolean) => void;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

function mapOfficialVerdictToLearningVerdict(verdict: OfficialVerdictStatus): LearningEventVerdict {
  switch (verdict) {
    case "AC":
      return "AC";
    case "WA":
      return "WA";
    case "TLE":
      return "TLE";
    case "CE":
      return "CE";
    case "MLE":
    case "RE":
    case "OTHER":
      return "RE";
  }
}

function pickPrimaryFailureVerdict(result: LocalRunResult): SampleVerdict {
  if (result.skippedReason) {
    return "SKIPPED";
  }
  if (!result.compileOk) {
    return "CE";
  }
  if (result.allPassed) {
    return "AC";
  }
  const failing = result.cases.find((c) => c.verdict !== "AC" && c.verdict !== "SKIPPED");
  return failing?.verdict ?? "WA";
}

function mapHealthCheckToSidebarSummary(
  result: AiHealthCheckResult,
  uiLanguage: "zh-CN" | "en-US"
): SidebarHealthCheckSummary {
  const isEn = uiLanguage === "en-US";
  const formatStep = (
    stepName: "models" | "chat" | "fim",
    raw: AiHealthCheckStep
  ): SidebarHealthCheckSummary["steps"][number] => {
    const ok = raw.status === "pass";
    let message: string;
    if (ok) {
      if (stepName === "models") {
        message = isEn
          ? `Connected (${raw.count ?? 0} models)`
          : `接口连通（可用模型 ${raw.count ?? 0} 个）`;
      } else {
        const preview = raw.sampleOutputPreview ? ` -> ${raw.sampleOutputPreview}` : "";
        message = isEn ? `Passed${preview}` : `冒烟通过${preview}`;
      }
    } else {
      message = raw.error ?? (isEn ? "Check failed" : "检查失败");
    }
    const remediation = !ok ? (isEn ? raw.errorHintEn : raw.errorHint) : undefined;
    return {
      step: stepName,
      ok,
      latencyMs: raw.latencyMs,
      ...(raw.issueCode ? { code: raw.issueCode } : {}),
      message,
      ...(remediation ? { remediation } : {})
    };
  };

  return {
    ranAt: result.checkedAt,
    ok: result.allPassed,
    steps: [
      formatStep("models", result.models),
      formatStep("chat", result.chatSmoke),
      formatStep("fim", result.fimSmoke)
    ]
  };
}

const SEARCHABLE_SOURCES: readonly ProblemSourceId[] = [
  "leetcode-cn",
  "leetcode-global",
  "luogu",
  "codeforces",
  "atcoder"
];

function shortSourceLabel(source: ProblemSourceId, isEn: boolean): string {
  switch (source) {
    case "leetcode-cn":
      return isEn ? "LC-CN" : "力扣";
    case "leetcode-global":
      return "LC";
    case "luogu":
      return isEn ? "Luogu" : "洛谷";
    case "codeforces":
      return "CF";
    case "atcoder":
      return isEn ? "AC" : "AtCoder";
    case "nowcoder":
      return isEn ? "NC" : "牛客";
    default:
      return source;
  }
}

/**
 * Lightweight VS Code WebviewViewProvider (`algoCoach.sidebar`) that renders the strict-CSP
 * webview shell and routes all `WebviewToHostMessage` actions to real domain services.
 */
export class SidebarController implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = "algoCoach.sidebar";

  private readonly sessionId: string;
  private readonly now: () => number;
  private readonly readerPanel: ProblemReaderPanel;
  private view: vscode.WebviewView | undefined;
  private readonly viewDisposables: vscode.Disposable[] = [];

  private flags: FeatureFlags;
  private activeProblem: ProblemDocument | undefined;
  private activeFilePath: string | undefined;
  private activeLanguage: SupportedLanguage = "python";
  private problemsCache: ProblemDocument[] = [];
  private lastRunByProblem = new Map<string, LocalRunResult>();
  private lastRunByProblemLang = new Map<string, LocalRunResult>();
  private coachHistoryByProblem = new Map<string, CoachResponsePayload[]>();
  private latestMisconceptionsByProblem = new Map<string, string[]>();
  private rankEngines = new Map<string, StylishRankEngine>();
  private sessionStartMsByProblem = new Map<string, number>();
  private lastSubmitSecByProblem = new Map<string, number>();

  private coachBusy = false;
  private runnerBusy = false;
  private verdictSyncing = false;
  private readonly verdictPollAborts = new Map<string, AbortController>();
  private searchBusy = false;
  private searchResults: SidebarSearchResults | undefined;
  private userOverrides: UserOverridesV2;
  private learnerSnapshot: LearnerSnapshotV2;
  private recommendations: RecommendationItem[] = [];
  private recentEvents: SidebarRecentEvent[] = [];
  private lastHealthCheck: SidebarHealthCheckSummary | undefined;
  private toolchains: ToolchainProbe[] = [];
  private bridgeStatus: SidebarBridgeStatus = { listening: false };
  private statusBanner: SidebarStateSnapshot["statusBanner"];
  private disposed = false;

  constructor(private readonly deps: SidebarControllerDeps) {
    this.sessionId = `sess-${Date.now()}-${randomBytes(4).toString("hex")}`;
    this.now = deps.now ?? (() => Date.now());
    this.flags = resolveFeatureFlags(deps.config);
    this.userOverrides = createDefaultUserOverrides(new Date(this.now()).toISOString());
    this.learnerSnapshot = deriveLearnerSnapshot([], this.userOverrides, new Date(this.now()));
    this.readerPanel = new ProblemReaderPanel({
      extensionUri: deps.extensionUri,
      onMessage: (msg) => this.handleReaderMessage(msg)
    });
  }

  async init(): Promise<void> {
    this.problemsCache = await this.deps.problemRepository.listCachedProblems();
    this.userOverrides = await this.deps.overridesStore.load();
    await this.recomputeLearnerState();

    // Sync active editor context if a practice file is already open
    const activeSnapshot = this.deps.workspaceFiles.getActiveCodeSnapshot();
    if (activeSnapshot) {
      this.activeFilePath = activeSnapshot.filePath;
      this.activeLanguage = activeSnapshot.language;
      if (activeSnapshot.problemKey) {
        const matched = await this.deps.problemRepository.getCachedProblem(activeSnapshot.problemKey);
        if (matched) {
          this.setActiveProblemInternal(matched);
        }
      }
    }

    if (!this.activeProblem && this.problemsCache[0]) {
      this.setActiveProblemInternal(this.problemsCache[0]);
    }

    this.refreshFlagsAndModules();
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.disposeViewListeners();
    this.view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.deps.extensionUri, "dist"),
        vscode.Uri.joinPath(this.deps.extensionUri, "resources")
      ]
    };

    const scriptUri = webviewView.webview
      .asWebviewUri(vscode.Uri.joinPath(this.deps.extensionUri, "dist", "webview.js"))
      .toString();
    const styleUri = webviewView.webview
      .asWebviewUri(vscode.Uri.joinPath(this.deps.extensionUri, "dist", "webview.css"))
      .toString();
    const assetsUri = webviewView.webview
      .asWebviewUri(vscode.Uri.joinPath(this.deps.extensionUri, "resources", "ui"))
      .toString();

    webviewView.webview.html = buildWebviewHtml({
      cspSource: webviewView.webview.cspSource,
      scriptUri,
      styleUri,
      assetsUri,
      nonce: generateNonce(),
      uiLanguage: this.flags.uiLanguage
    });

    this.viewDisposables.push(
      webviewView.webview.onDidReceiveMessage((msg: unknown) => {
        if (msg && typeof msg === "object" && typeof (msg as { type?: unknown }).type === "string") {
          void this.handleMessage(msg as WebviewToHostMessage);
        }
      }),
      webviewView.onDidDispose(() => {
        if (this.view === webviewView) {
          this.view = undefined;
        }
        this.disposeViewListeners();
      })
    );
  }

  getFlags(): FeatureFlags {
    return this.flags;
  }

  getActiveProblem(): ProblemDocument | undefined {
    return this.activeProblem;
  }

  getKnownProblemKeys(): string[] {
    return this.problemsCache.map((p) => p.problemKey);
  }

  getUserOverrides(): UserOverridesV2 {
    return this.userOverrides;
  }

  getStylishRankEngine(problemKey?: string): StylishRankEngine | undefined {
    const key = problemKey ?? this.activeProblem?.problemKey;
    if (!key) {
      return undefined;
    }
    return this.rankEngines.get(key);
  }

  setBridgeStatus(status: SidebarBridgeStatus): void {
    this.bridgeStatus = status;
    void this.syncState();
  }

  /**
   * Re-resolves FeatureFlags from VS Code configuration, immediately disposes any
   * disabled modules via ManagedModuleController, syncs strictWordAccept & StatusBar.
   */
  refreshFlagsAndModules(): FeatureFlags {
    this.flags = resolveFeatureFlags(this.deps.config);
    this.deps.managedModules.sync(this.flags);
    void syncStrictWordAcceptContext(this.flags.strictWordAccept);

    const soundCtrl = this.deps.getSoundController();
    if (soundCtrl) {
      soundCtrl.setMuted(this.deps.getAudioMuted());
      const currentRank = this.getStylishRankEngine()?.getState().effectiveRank;
      if (currentRank) {
        soundCtrl.setCurrentRank(currentRank);
      }
      this.deps.statusBar.updateAudioIndicator(soundCtrl.getStatusBarIndicator());
    } else {
      this.deps.statusBar.updateAudioIndicator(undefined);
    }

    this.deps.statusBar.updatePreset(this.flags);
    this.deps.statusBar.updateStylishRank(this.flags, this.getStylishRankEngine()?.getState());
    return this.flags;
  }

  async reloadAiConfigFromSettings(): Promise<void> {
    const routerConfig = await readAiRouterConfig(this.deps.config, this.deps.secrets);
    this.deps.modelRouter.updateRoleConfig("chat", routerConfig.chat);
    this.deps.modelRouter.updateRoleConfig("fim", routerConfig.fim);
    await this.syncState();
  }

  syncActiveEditorContext(ctx: ActiveEditorContext): void {
    this.activeFilePath = ctx.filePath;
    if (ctx.language !== "generic") {
      this.activeLanguage = ctx.language;
    }
    if (ctx.problemKey && ctx.problemKey !== this.activeProblem?.problemKey) {
      void this.deps.problemRepository.getCachedProblem(ctx.problemKey).then((doc) => {
        if (doc) {
          this.setActiveProblemInternal(doc);
          void this.syncState();
        }
      });
      return;
    }
    void this.syncState();
  }

  applyRankTransition(transition: StylishRankTransition | undefined): void {
    if (!transition) {
      return;
    }
    const soundCtrl = this.deps.getSoundController();
    if (soundCtrl) {
      soundCtrl.handleRankTransition(transition, this.now());
    }
    this.deps.statusBar.updateStylishRank(this.flags, transition.state);
  }

  dispatchSound(payload: SoundDispatchPayload): void {
    this.postMessage({
      type: "sfx/play",
      payload: {
        kind: payload.kind,
        pack: payload.pack,
        volume: payload.volume,
        gainDbOffset: payload.gainDb,
        pitchJitter: Number((payload.playbackRate - 1).toFixed(4)),
        overtone: payload.harmonicAccent
      }
    });
  }

  postToast(
    level: "info" | "warn" | "error",
    text: string,
    undoEventId?: string,
    cta?: ToastActionCta
  ): void {
    this.statusBanner = {
      level,
      text,
      ...(undoEventId ? { undoEventId } : {}),
      ...(cta ? { cta } : {})
    };
    if (this.view && !this.disposed) {
      this.postMessage({
        type: "toast/inline",
        payload: {
          level,
          text,
          ...(undoEventId ? { undoEventId } : {}),
          ...(cta ? { cta } : {})
        }
      });
      return;
    }
    if (!this.disposed) {
      if (level === "error") {
        void vscode.window.showErrorMessage(text);
      } else if (level === "warn") {
        void vscode.window.showWarningMessage(text);
      } else {
        void vscode.window.showInformationMessage(text);
      }
    }
  }

  postMessage(message: HostToWebviewMessage): void {
    if (!this.view || this.disposed) {
      return;
    }
    void this.view.webview.postMessage(message);
  }

  async getStateSnapshot(): Promise<SidebarStateSnapshot> {
    const target = resolveDefaultConfigTarget();
    const activeProblemWithSamples = this.activeProblem
      ? {
          ...this.activeProblem,
          samples: this.deps.workspaceFiles.mergeSamplesForProblem(this.activeProblem)
        }
      : undefined;

    const hintState = this.activeProblem
      ? await this.deps.coachService.getHintState(this.activeProblem.problemKey)
      : undefined;
    const hintLevel: HintLevel = hintState?.currentLevel ?? 0;

    const aiConfig = await buildSidebarAiConfigView(this.deps.config, this.deps.secrets);
    const rankState = this.flags.stylishRankEnabled
      ? this.getStylishRankEngine()?.getState()
      : undefined;

    const curatedSheets = listCuratedSheets().map((sheet) => ({
      id: sheet.id,
      title: this.flags.uiLanguage === "zh-CN" ? sheet.titleZh : sheet.title,
      source: sheet.defaultSource,
      count: sheet.items.length
    }));
    const submitTarget = this.activeProblem ? resolveSubmitTarget(this.activeProblem) : null;
    const activeSubmitUrl =
      submitTarget && isAllowedSubmitUrl(submitTarget.submitUrl, submitTarget.platform)
        ? submitTarget.submitUrl
        : undefined;

    return {
      flags: this.flags,
      visualPresetApplied: this.deps.visualPresetManager.isPresetCurrentlyApplied(target),
      audioMuted: this.deps.getAudioMuted(),
      ...(activeProblemWithSamples ? { activeProblem: activeProblemWithSamples } : {}),
      ...(activeSubmitUrl ? { activeSubmitUrl } : {}),
      ...(this.activeFilePath ? { activeFilePath: this.activeFilePath } : {}),
      activeLanguage: this.activeLanguage,
      problems: this.problemsCache,
      ...(this.searchBusy ? { searchBusy: true } : {}),
      ...(this.searchResults ? { searchResults: this.searchResults } : {}),
      ...(this.activeProblem && this.getLastRunForProblem(this.activeProblem.problemKey, this.activeLanguage)
        ? { lastRun: this.getLastRunForProblem(this.activeProblem.problemKey, this.activeLanguage) }
        : {}),
      hintLevel,
      giveUpUnlocked: hintState?.giveUpUnlocked ?? false,
      coachHistory: this.activeProblem
        ? [...(this.coachHistoryByProblem.get(this.activeProblem.problemKey) ?? [])]
        : [],
      coachBusy: this.coachBusy,
      runnerBusy: this.runnerBusy,
      verdictSyncing: this.verdictSyncing,
      learnerSnapshot: this.learnerSnapshot,
      userOverrides: this.userOverrides,
      recommendations: this.recommendations,
      recentEvents: this.recentEvents,
      ...(rankState ? { stylishRank: rankState } : {}),
      aiConfig,
      ...(this.lastHealthCheck ? { lastHealthCheck: this.lastHealthCheck } : {}),
      toolchains: this.toolchains,
      bridgeStatus: this.bridgeStatus,
      curatedSheets,
      ...(this.statusBanner ? { statusBanner: this.statusBanner } : {})
    };
  }

  async syncState(): Promise<void> {
    if (this.disposed) {
      return;
    }
    const snapshot = await this.getStateSnapshot();
    this.postMessage({
      type: "state/sync",
      payload: snapshot
    });
    this.readerPanel.syncIfOpen(this.toReaderSnapshot(snapshot));
  }

  private toReaderSnapshot(snapshot: SidebarStateSnapshot): ProblemReaderSnapshot {
    return {
      ...(snapshot.activeProblem ? { problem: snapshot.activeProblem } : {}),
      uiLanguage: snapshot.flags.uiLanguage,
      ...(snapshot.activeLanguage ? { activeLanguage: snapshot.activeLanguage } : {}),
      ...(snapshot.lastRun ? { lastRun: snapshot.lastRun } : {}),
      hintLevel: snapshot.hintLevel,
      runnerBusy: snapshot.runnerBusy,
      coachBusy: snapshot.coachBusy
    };
  }

  async openProblemReader(problemKey?: string, preserveFocus = false): Promise<void> {
    if (problemKey && problemKey !== this.activeProblem?.problemKey) {
      const matched = await this.deps.problemRepository.getCachedProblem(problemKey);
      if (matched) {
        this.setActiveProblemInternal(matched);
      }
    }
    if (!this.activeProblem) {
      this.postToast(
        "warn",
        this.isEn()
          ? "Select or import a problem before opening Split Reader."
          : "请先导入或选择一道题目，再打开宽屏分屏读题。"
      );
      return;
    }
    const snapshot = await this.getStateSnapshot();
    this.readerPanel.openOrReveal(this.toReaderSnapshot(snapshot), {
      preserveFocus,
      explicitUserAction: !preserveFocus
    });
  }

  async handleReaderMessage(message: ReaderToHostMessage): Promise<void> {
    try {
      switch (message.type) {
        case "reader/ready": {
          const snapshot = await this.getStateSnapshot();
          this.readerPanel.syncIfOpen(this.toReaderSnapshot(snapshot));
          return;
        }
        case "runner/runSamples":
          await this.runActiveSamples(false);
          return;
        case "submit/copyAndOpen":
          await this.copyAndOpenSubmit(true);
          return;
        case "coach/request":
          await vscode.commands.executeCommand("algoCoach.sidebar.focus");
          await this.requestCoach(message.payload, false);
          return;
        case "clipboard/copy":
          await this.copyTextToClipboard(message.payload.text, message.payload.label, true);
          return;
        case "problem/importClipboard":
          await this.importClipboardStatement(
            message.payload.text,
            Boolean(message.payload.mergeWithActive),
            true
          );
          return;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.readerPanel.postToast("error", msg);
    }
  }

  private async copyTextToClipboard(
    text: string,
    label: string | undefined,
    fromReader: boolean
  ): Promise<void> {
    await vscode.env.clipboard.writeText(text);
    const toastText = label
      ? this.isEn()
        ? `Copied ${label}.`
        : `已复制 ${label}。`
      : this.isEn()
        ? "Copied to clipboard."
        : "已复制到剪贴板。";
    if (fromReader) {
      this.readerPanel.postToast("info", toastText);
    } else {
      this.postToast("info", toastText);
    }
  }

  // -------------------------------------------------------------------------
  // Webview Message Router (covers 100% of WebviewToHostMessage union)
  // -------------------------------------------------------------------------

  async handleMessage(message: WebviewToHostMessage): Promise<void> {
    try {
      switch (message.type) {
        case "webview/ready":
          await this.syncState();
          return;

        case "preset/select":
          await this.selectPreset(message.payload.preset);
          return;

        case "flag/update":
          await this.updateFeatureFlag(message.payload.key, message.payload.value);
          return;

        case "starter/applyVisualPreset":
          await this.applyVisualPreset();
          return;

        case "starter/restoreVisualPreset":
          await this.restoreVisualPreset();
          return;

        case "starter/openWalkthrough":
          await this.openWalkthrough();
          return;

        case "starter/loadWarmupPack":
          await this.loadWarmupPack();
          return;

        case "problem/select":
          await this.selectProblem(
            message.payload.problemKey,
            message.payload.openFile !== false,
            message.payload.language
          );
          return;

        case "problem/importRef":
          await this.importProblemRef(
            message.payload.input,
            message.payload.source,
            message.payload.language
          );
          return;

        case "problem/importClipboard":
          await this.importClipboardStatement(
            message.payload.text,
            Boolean(message.payload.mergeWithActive)
          );
          return;

        case "problem/loadSheet":
          await this.loadCuratedSheet(message.payload.sheetId);
          return;

        case "problem/search":
          await this.searchProblems(
            message.payload.sources ?? message.payload.source,
            message.payload.keyword
          );
          return;

        case "problem/clearSearch":
          this.searchResults = undefined;
          await this.syncState();
          return;

        case "problem/addSample":
          await this.deps.workspaceFiles.addCustomSample(
            message.payload.problemKey,
            message.payload.input,
            message.payload.expectedOutput
          );
          this.clearLastRunsForProblem(message.payload.problemKey);
          this.postToast(
            "info",
            this.isEn() ? "Custom sample added." : "已添加自定义样例。"
          );
          await this.syncState();
          return;

        case "problem/deleteSample": {
          const deleted = await this.deps.workspaceFiles.deleteCustomSample(
            message.payload.problemKey,
            message.payload.sampleId
          );
          if (deleted) {
            this.clearLastRunsForProblem(message.payload.problemKey);
          }
          await this.syncState();
          return;
        }

        case "problem/openReader":
          await this.openProblemReader(message.payload?.problemKey, false);
          return;

        case "clipboard/copy":
          await this.copyTextToClipboard(message.payload.text, message.payload.label, false);
          return;

        case "runner/runSamples":
          await this.runActiveSamples(true);
          return;

        case "runner/checkToolchains":
          await this.checkToolchains();
          return;

        case "submit/copyAndOpen":
          await this.copyAndOpenSubmit(true);
          return;

        case "submit/copyOnly":
          await this.copyAndOpenSubmit(false);
          return;

        case "submit/reportVerdict":
          await this.reportManualVerdict(message.payload.verdict);
          return;

        case "submit/syncVerdict":
        case "submit/syncCodeforces":
          await this.syncOfficialVerdict();
          return;

        case "bridge/copyUserscript":
          await this.copyCompanionUserscript();
          return;

        case "coach/request":
          await this.requestCoach(message.payload, true);
          return;

        case "learner/muteMisconception":
          await this.handleMuteMisconception(
            message.payload.misconceptionId,
            message.payload.muted
          );
          return;

        case "learner/voidEvent":
          await this.handleVoidEvent(message.payload.eventId);
          return;

        case "learner/updatePreferences":
          this.userOverrides = await this.deps.overridesStore.update((cur) =>
            updateTeachingPreferences(cur, message.payload, this.nowIso())
          );
          await this.recomputeLearnerState();
          await this.syncState();
          return;

        case "learner/upsertCodeHabit":
          this.userOverrides = await this.deps.overridesStore.update((cur) =>
            upsertCodeHabit(cur, message.payload, this.nowIso())
          );
          await this.syncState();
          return;

        case "learner/deleteCodeHabit":
          this.userOverrides = await this.deps.overridesStore.update((cur) =>
            removeCodeHabit(cur, message.payload.id, this.nowIso())
          );
          await this.syncState();
          return;

        case "ai/saveConfig":
          await this.saveAiConfig(message.payload);
          return;

        case "ai/runHealthCheck":
          await this.runAiHealthCheckAction();
          return;

        case "audio/toggleMute":
          await this.toggleAudioMute();
          return;

        case "audio/testSound":
          this.playTestSound(message.payload.kind);
          return;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.postToast("error", msg);
      await this.syncState();
    }
  }

  // -------------------------------------------------------------------------
  // Reusable Host Actions (invoked by both Webview messages and VS Code commands)
  // -------------------------------------------------------------------------

  async selectPreset(preset: PresetMode): Promise<void> {
    const target = resolveDefaultConfigTarget();
    await applyPresetToConfig(this.deps.config, preset, target, true);
    this.refreshFlagsAndModules();
    this.postToast(
      "info",
      this.isEn() ? `Switched preset to ${preset}.` : `已切换模式预设为 ${preset}。`
    );
    await this.syncState();
  }

  async updateFeatureFlag(
    key: Extract<WebviewToHostMessage, { type: "flag/update" }>["payload"]["key"],
    value: unknown
  ): Promise<void> {
    const configKey = FEATURE_FLAG_CONFIG_KEYS[key];
    if (!configKey) {
      return;
    }
    const target = resolveDefaultConfigTarget();
    await this.deps.config.update(configKey, value, target);
    this.refreshFlagsAndModules();
    await this.syncState();
  }

  async applyVisualPreset(): Promise<void> {
    const target = resolveDefaultConfigTarget();
    const res = await this.deps.visualPresetManager.apply(target);
    this.postToast(
      "info",
      this.isEn()
        ? `Applied beginner visual preset (${res.appliedKeys.length} native VS Code settings, restorable).`
        : `已应用新手视觉预设（${res.appliedKeys.length} 项 VS Code 原生设置，可一键无损还原）。`
    );
    await this.syncState();
  }

  async restoreVisualPreset(): Promise<void> {
    const target = resolveDefaultConfigTarget();
    const res = await this.deps.visualPresetManager.restore(target);
    if (!res.restored) {
      this.postToast(
        "warn",
        this.isEn()
          ? "No previous visual preset snapshot found to restore."
          : "未找到可还原的视觉预设快照。"
      );
    } else {
      this.postToast(
        "info",
        this.isEn()
          ? `Restored ${res.restoredKeys.length} VS Code visual settings.`
          : `已无损还原 ${res.restoredKeys.length} 项 VS Code 视觉设置。`
      );
    }
    await this.syncState();
  }

  async openWalkthrough(): Promise<void> {
    await vscode.commands.executeCommand(
      "workbench.action.openWalkthrough",
      WALKTHROUGH_ID,
      false
    );
  }

  async loadWarmupPack(): Promise<void> {
    const warmups = getWarmupProblems(this.flags.uiLanguage);
    for (const doc of warmups) {
      await this.deps.problemRepository.saveProblem(doc);
    }
    this.problemsCache = await this.deps.problemRepository.listCachedProblems();
    const first = warmups[0];
    if (first) {
      await this.activateAndOpenProblem(first, true);
      this.postMessage({ type: "ui/switchTab", payload: { tab: "workspace" } });
    }
    this.postToast(
      "info",
      this.isEn()
        ? `Loaded ${warmups.length}-problem Beginner Warmup Pack.`
        : `已加载 ${warmups.length} 题新手热身包并打开第 1 题练习文件。`
    );
    await this.syncState();
  }

  async selectProblem(
    problemKey: string,
    openFile = true,
    language?: SupportedLanguage
  ): Promise<void> {
    let doc = await this.deps.problemRepository.getCachedProblem(problemKey);
    if (!doc) {
      const fromSearch = this.searchResults?.items.find((p) => p.problemKey === problemKey);
      if (fromSearch) {
        await this.deps.problemRepository.saveProblem(fromSearch);
        this.problemsCache = await this.deps.problemRepository.listCachedProblems();
        doc = fromSearch;
      }
    }
    if (!doc) {
      this.postToast(
        "warn",
        this.isEn() ? `Problem not found: ${problemKey}` : `未找到题目：${problemKey}`
      );
      await this.syncState();
      return;
    }

    // Hydrate metadata-only curated sheet entries on demand when selected
    if (doc.completeness === "metadata_only" && (doc.canonicalUrl || doc.sourceId)) {
      try {
        doc = await this.deps.problemRepository.importProblem(
          doc.canonicalUrl ?? doc.sourceId,
          { preferredSource: doc.source }
        );
        this.problemsCache = await this.deps.problemRepository.listCachedProblems();
      } catch (err) {
        // Keep metadata_only doc offline without blocking the user, while surfacing why live fetch failed
        const rawReason = err instanceof Error ? err.message : String(err);
        const reason = rawReason.length > 140 ? `${rawReason.slice(0, 137)}...` : rawReason;
        this.postToast(
          "warn",
          this.isEn()
            ? `Opened cached metadata (live fetch failed: ${reason}).`
            : `已打开本地元信息（联网拉取题面失败：${reason}）。`
        );
      }
    }

    await this.activateAndOpenProblem(doc, openFile, language);
    await this.syncState();
  }

  async importProblemRef(
    input: string,
    source?: ProblemSourceId,
    language?: SupportedLanguage
  ): Promise<ProblemDocument> {
    const trimmed = input.trim();
    if (!trimmed) {
      throw new Error(this.isEn() ? "Please enter a problem URL, ID, or Markdown." : "请输入题目链接、题号或 Markdown。");
    }

    let doc: ProblemDocument;
    try {
      doc = await this.deps.problemRepository.importProblem(trimmed, {
        preferredSource: source
      });
    } catch (err) {
      // If user pasted raw Markdown text into the import box, parse it seamlessly
      if (trimmed.includes("\n") && trimmed.length >= 24) {
        doc = await this.deps.problemRepository.importFromMarkdown(trimmed);
      } else {
        throw err;
      }
    }

    this.problemsCache = await this.deps.problemRepository.listCachedProblems();
    await this.activateAndOpenProblem(doc, true, language);
    this.postMessage({ type: "ui/switchTab", payload: { tab: "workspace" } });
    if (doc.completeness !== "full") {
      const partialZh =
        doc.completeness === "samples_only"
          ? `已导入样例（${doc.title}），暂缺完整题面，可使用 Competitive Companion 或「粘贴题面」补全。`
          : `已导入题目元信息（${doc.title}），暂缺完整题面，可使用 Competitive Companion 或「粘贴题面」补全。`;
      const partialEn =
        doc.completeness === "samples_only"
          ? `Imported samples only (${doc.title}). Complete the statement via Competitive Companion or Paste Statement.`
          : `Imported metadata only (${doc.title}). Fetch full statement via Competitive Companion or Paste Statement.`;
      this.postToast("warn", this.isEn() ? partialEn : partialZh);
    } else {
      this.postToast(
        "info",
        this.isEn() ? `Imported: ${doc.title}` : `已导入题目：${doc.title}`
      );
    }
    await this.syncState();
    return doc;
  }

  async importClipboardStatement(
    text: string,
    mergeWithActive: boolean,
    fromReader = false
  ): Promise<void> {
    const notify = (level: "info" | "warn" | "error", msg: string): void => {
      if (fromReader) {
        this.readerPanel.postToast(level, msg);
      } else {
        this.postToast(level, msg);
      }
    };
    const rawText = text.trim() || (await vscode.env.clipboard.readText()).trim();
    if (!rawText) {
      notify(
        "warn",
        this.isEn() ? "Clipboard is empty." : "剪贴板为空，请先复制题面或样例。"
      );
      await this.syncState();
      return;
    }

    const doc =
      mergeWithActive && this.activeProblem
        ? await this.deps.problemRepository.mergeClipboardStatement(
            this.activeProblem.problemKey,
            rawText
          )
        : await this.deps.problemRepository.importFromMarkdown(rawText);

    this.problemsCache = await this.deps.problemRepository.listCachedProblems();
    await this.activateAndOpenProblem(doc, !mergeWithActive);
    notify(
      "info",
      mergeWithActive
        ? this.isEn()
          ? `Merged statement into ${doc.title}.`
          : `已将剪贴板题面合并到 ${doc.title}。`
        : this.isEn()
          ? `Imported from clipboard: ${doc.title}.`
          : `已从剪贴板导入：${doc.title}。`
    );
    await this.syncState();
  }

  async handleBridgeProblem(doc: ProblemDocument): Promise<void> {
    const saved = await this.deps.problemRepository.ingestFromBridge(doc);
    this.problemsCache = await this.deps.problemRepository.listCachedProblems();
    await this.activateAndOpenProblem(saved, true);
    this.postMessage({ type: "ui/switchTab", payload: { tab: "workspace" } });
    this.postToast(
      "info",
      this.isEn()
        ? `Received from browser bridge: ${saved.title}`
        : `已通过本地桥接导入：${saved.title}`
    );
    await this.syncState();
  }

  async handleBridgeVerdict(verdict: NormalizedBridgeVerdict): Promise<void> {
    if (this.disposed) {
      return;
    }

    let problem = await this.findProblemMatch({
      problemKey: verdict.event.problemKey,
      source: verdict.event.platform,
      sourceId: verdict.sourceId
    });
    this.cancelBackgroundVerdictPoll(problem?.problemKey ?? verdict.event.problemKey);

    if (!problem) {
      problem = {
        schemaVersion: "problem-doc/v2",
        problemKey: verdict.event.problemKey,
        source: verdict.event.platform,
        sourceId: verdict.sourceId ?? verdict.event.problemKey,
        ...(verdict.event.submissionUrl ? { canonicalUrl: verdict.event.submissionUrl } : {}),
        title: verdict.sourceId ?? verdict.event.problemKey,
        locale: "mixed",
        completeness: "metadata_only",
        ioMode: "stdio",
        samples: [],
        rawTags: [],
        provenance: {
          ingestChannel: "localhost-bridge",
          fetchedAt: verdict.event.timestamp
        }
      };
    }

    const canonicalEvent =
      problem.problemKey === verdict.event.problemKey
        ? verdict.event
        : { ...verdict.event, problemKey: problem.problemKey };

    const eventId = await this.ingestOfficialVerdict(problem, canonicalEvent, verdict.dedupKey);
    this.postToast(
      canonicalEvent.verdict === "AC" ? "info" : "warn",
      this.isEn()
        ? `Auto-synced ${problem.title}: ${canonicalEvent.verdict}.`
        : `已自动回传 ${problem.title} 官方结果：${canonicalEvent.verdict}。`,
      eventId
    );
    await this.syncState();
  }

  async copyCompanionUserscript(): Promise<void> {
    const token = await this.deps.secrets.ensureBridgeVerdictToken();
    const configuredPort = this.deps.config.get<number>(AI_CONFIG_KEYS.bridgePort, 27121) ?? 27121;
    const port = this.bridgeStatus.port ?? (configuredPort > 0 ? configuredPort : 27121);
    const script = buildCompanionUserscript({ port, token });
    await vscode.env.clipboard.writeText(script);
    this.postToast(
      "info",
      this.isEn()
        ? `Copied ${COMPANION_USERSCRIPT_FILENAME} (port ${port}). Paste into Tampermonkey / Violentmonkey to auto-sync verdicts across all 6 OJs.`
        : `已复制 6 平台回传脚本 ${COMPANION_USERSCRIPT_FILENAME}（端口 ${port}）。在油猴 / Violentmonkey 新建脚本粘贴保存即可自动回传 6 平台结果。`
    );
  }

  async loadCuratedSheet(sheetId: string): Promise<void> {
    const sheet = getCuratedSheet(sheetId);
    if (!sheet) {
      this.postToast("warn", this.isEn() ? `Unknown sheet: ${sheetId}` : `未知题单：${sheetId}`);
      await this.syncState();
      return;
    }

    const docs: ProblemDocument[] = [];
    for (const item of sheet.items) {
      const metaDoc = curatedEntryToMetadataDocument(item, sheet.defaultSource);
      const existing = await this.deps.problemRepository.getCachedProblem(metaDoc.problemKey);
      if (existing) {
        docs.push(existing);
      } else {
        await this.deps.problemRepository.saveProblem(metaDoc);
        docs.push(metaDoc);
      }
    }

    this.problemsCache = await this.deps.problemRepository.listCachedProblems();
    if (!this.activeProblem && docs[0]) {
      this.setActiveProblemInternal(docs[0]);
    }
    this.postToast(
      "info",
      this.isEn()
        ? `Loaded ${sheet.title} (${docs.length} problems).`
        : `已加载 ${sheet.titleZh}（共 ${docs.length} 题）。`
    );
    await this.syncState();
  }

  async searchProblems(
    sourceOrSources: ProblemSourceId | readonly ProblemSourceId[] | undefined,
    keyword: string
  ): Promise<void> {
    const trimmed = keyword.trim();
    if (!trimmed) {
      await this.syncState();
      return;
    }

    const rawList = Array.isArray(sourceOrSources)
      ? sourceOrSources
      : sourceOrSources
        ? [sourceOrSources]
        : [];
    const targets = [...new Set(rawList.filter((s) => SEARCHABLE_SOURCES.includes(s)))];
    if (targets.length === 0) {
      targets.push("leetcode-cn", "luogu", "codeforces");
    }

    this.searchBusy = true;
    await this.syncState();

    try {
      const perSourceLimit = targets.length > 1 ? 6 : 12;
      const settled = await Promise.allSettled(
        targets.map((src) =>
          this.deps.problemRepository
            .search(src, { keyword: trimmed, page: 1 })
            .then((res) => ({ src, items: res.items.slice(0, perSourceLimit) }))
        )
      );

      const buckets: Array<{ src: ProblemSourceId; items: ProblemDocument[] }> = [];
      const failedSources: ProblemSourceId[] = [];
      for (let i = 0; i < targets.length; i++) {
        const res = settled[i]!;
        if (res.status === "fulfilled") {
          buckets.push(res.value);
        } else {
          failedSources.push(targets[i]!);
        }
      }

      // Interleave hits round-robin across platforms so every source shows up near the top
      const interleaved: ProblemDocument[] = [];
      const seenKeys = new Set<string>();
      const maxLen = buckets.reduce((m, b) => Math.max(m, b.items.length), 0);
      for (let idx = 0; idx < maxLen; idx++) {
        for (const b of buckets) {
          const item = b.items[idx];
          if (item && !seenKeys.has(item.problemKey)) {
            seenKeys.add(item.problemKey);
            interleaved.push(item);
          }
        }
      }

      this.searchResults = {
        keyword: trimmed,
        sources: targets,
        items: interleaved,
        failedSources
      };

      const en = this.isEn();
      const hitSummary = buckets
        .filter((b) => b.items.length > 0)
        .map((b) => `${shortSourceLabel(b.src, en)} ${b.items.length}`)
        .join(" · ");
      const failSummary = failedSources
        .map((s) => shortSourceLabel(s, en))
        .join(", ");

      let msg = en
        ? `Found ${interleaved.length} result(s)${hitSummary ? ` (${hitSummary})` : ""}.`
        : `搜到 ${interleaved.length} 道题目${hitSummary ? `（${hitSummary}）` : ""}。`;
      if (failedSources.length > 0) {
        msg += en ? ` Unavailable: ${failSummary}.` : ` ${failSummary} 暂不可用。`;
      }
      this.postToast(interleaved.length === 0 ? "warn" : "info", msg);
    } finally {
      this.searchBusy = false;
      await this.syncState();
    }
  }

  async runActiveSamples(triggeredFromSidebar = false): Promise<LocalRunResult | undefined> {
    if (triggeredFromSidebar) {
      this.deps.getShortcutCoach()?.recordSidebarClick("runSamples", this.now());
    }

    const problem = this.activeProblem;
    if (!problem) {
      this.postToast(
        "warn",
        this.isEn()
          ? "Select or import a problem before running samples."
          : "请先导入或选择一道题目，再运行本地样例。"
      );
      await this.syncState();
      return undefined;
    }

    const codeSnapshot = this.deps.workspaceFiles.getActiveCodeSnapshot();
    if (!codeSnapshot || codeSnapshot.language === "generic") {
      this.postToast(
        "warn",
        this.isEn()
          ? "Open a supported solution file (.py/.cpp/.c/.java/.rs/.js/.ts) in the editor first."
          : "请先在编辑器中打开当前题目的代码文件（支持 py/cpp/c/java/rs/js/ts）。"
      );
      await this.syncState();
      return undefined;
    }

    if (codeSnapshot.problemKey && codeSnapshot.problemKey !== problem.problemKey) {
      this.postToast(
        "warn",
        this.isEn()
          ? `Active editor belongs to "${codeSnapshot.problemKey}", not "${problem.title}". Switch editor or select that problem first.`
          : `当前编辑器文件属于题目「${codeSnapshot.problemKey}」，与当前题目「${problem.title}」不一致，请先切换文件或题目后再运行。`
      );
      await this.syncState();
      return undefined;
    }

    const samples = this.deps.workspaceFiles.mergeSamplesForProblem(problem);
    if (samples.length === 0) {
      this.postToast(
        "warn",
        this.isEn()
          ? "No samples available for this problem. Add a custom sample first."
          : "当前题目暂无样例，请先添加至少 1 组样例。"
      );
      await this.syncState();
      return undefined;
    }

    this.runnerBusy = true;
    this.activeFilePath = codeSnapshot.filePath;
    this.activeLanguage = codeSnapshot.language;
    await this.syncState();

    try {
      const timeoutMs = this.deps.config.get<number>(AI_CONFIG_KEYS.runnerTimeoutMs, 3000);
      const cacheDir = join(this.deps.storageDir, "runner-cache");
      const result = await this.deps.runnerEngine.runSamples({
        problem,
        language: codeSnapshot.language,
        sourceCode: codeSnapshot.code,
        samples,
        timeoutMs,
        cacheDir
      });

      this.setLastRunForProblem(problem.problemKey, codeSnapshot.language, result);

      if (result.skippedReason) {
        const detail = result.compileStderr?.trim();
        let message: string;
        let cta: ToastActionCta | undefined;
        if (result.skippedReason === "missing_toolchain") {
          message =
            detail ||
            (this.isEn()
              ? "Required compiler/runtime not found. Check Settings -> AI & Env."
              : "未检测到可用的本地编译器或运行环境，请前往「设置 -> AI 与环境」检查配置。");
          cta = {
            label: this.isEn() ? "Open Env Settings" : "打开环境体检",
            tab: "settings",
            subKey: "sub.settings",
            subVal: "env",
            drawerId: "settings-toolchain"
          };
        } else if (result.skippedReason === "unsupported_harness") {
          message =
            detail ||
            (this.isEn()
              ? "Function-mode harness metadata is incomplete for this problem."
              : "当前函数模式题目缺少签名元数据，暂无法直接自动包装运行。");
        } else {
          message =
            detail ||
            (this.isEn()
              ? "This language is not supported by the local runner."
              : "当前语言暂不支持本地样例运行。");
        }
        this.postToast("warn", message, undefined, cta);
        return result;
      }

      // 1. Feed TriggerSignalTracker WA/RE/CE cooldown window (or clear on AC)
      const primaryVerdict = pickPrimaryFailureVerdict(result);
      this.deps.triggerTracker.recordLocalRunVerdict(primaryVerdict, this.now());

      // 2. Drive StylishRankEngine + rank transition sound
      const rankEngine = this.ensureRankEngine(problem);
      const transition = rankEngine.recordLocalRun(result, {
        sourceCode: codeSnapshot.code,
        nowMs: this.now()
      });
      this.applyRankTransition(transition);

      // Auto-confirm offline verified solve for warmup / local markdown problems when eligible
      if (
        (problem.source === "warmup-pack" || problem.source === "local-markdown") &&
        result.allPassed &&
        transition.state.customEdgePassedCount >= 2
      ) {
        const verifiedTransition = rankEngine.markOfflineVerifiedSolve(this.now());
        this.applyRankTransition(verifiedTransition);
      }

      // 3. Drive SoundController local AC chime
      this.deps.getSoundController()?.handleLocalRunResult(result, this.now());

      const passedCount = result.cases.filter((c) => c.verdict === "AC").length;
      this.postToast(
        result.allPassed ? "info" : "warn",
        result.allPassed
          ? this.isEn()
            ? `All ${passedCount}/${result.cases.length} local samples passed.`
            : `本地样例全部通过（${passedCount}/${result.cases.length}）。`
          : this.isEn()
            ? `Local run: ${passedCount}/${result.cases.length} passed (${primaryVerdict}).`
            : `本地样例运行完成：${passedCount}/${result.cases.length} 通过（${primaryVerdict}）。`
      );
      return result;
    } finally {
      this.runnerBusy = false;
      await this.syncState();
    }
  }

  async checkToolchains(openSettingsDrawer = false): Promise<ToolchainProbe[]> {
    this.toolchains = await this.deps.runnerEngine.probeToolchains();
    const availableCount = this.toolchains.filter((t) => t.available).length;
    const cta: ToastActionCta = {
      label: this.isEn() ? "Open Env Settings" : "查看环境体检",
      tab: "settings",
      subKey: "sub.settings",
      subVal: "env",
      drawerId: "settings-toolchain"
    };
    if (openSettingsDrawer) {
      this.postMessage({
        type: "ui/switchTab",
        payload: {
          tab: "settings",
          subKey: "sub.settings",
          subVal: "env",
          drawerId: "settings-toolchain"
        }
      });
    }
    this.postToast(
      availableCount > 0 ? "info" : "warn",
      this.isEn()
        ? `Toolchain Doctor: ${availableCount}/${this.toolchains.length} languages available.`
        : `编译环境体检完成：${availableCount}/${this.toolchains.length} 种语言可用。`,
      undefined,
      cta
    );
    await this.syncState();
    return this.toolchains;
  }

  async copyAndOpenSubmit(openBrowser = true): Promise<void> {
    const problem = this.activeProblem;
    if (!problem) {
      this.postToast(
        "warn",
        this.isEn() ? "Select a problem before submitting." : "请先选择当前题目再执行提交。"
      );
      await this.syncState();
      return;
    }

    const codeSnapshot = this.deps.workspaceFiles.getActiveCodeSnapshot();
    if (!codeSnapshot || codeSnapshot.language === "generic") {
      this.postToast(
        "warn",
        this.isEn()
          ? "Open a supported solution file first."
          : "请先打开当前题目的代码文件（非通用文本）。"
      );
      await this.syncState();
      return;
    }

    if (codeSnapshot.problemKey && codeSnapshot.problemKey !== problem.problemKey) {
      this.postToast(
        "warn",
        this.isEn()
          ? `Active editor belongs to "${codeSnapshot.problemKey}", not "${problem.title}". Switch editor or select that problem first.`
          : `当前编辑器文件属于题目「${codeSnapshot.problemKey}」，与当前题目「${problem.title}」不一致，请先切换后再复制提交。`
      );
      await this.syncState();
      return;
    }

    const prepared = prepareSubmitPayload(problem, codeSnapshot.code, codeSnapshot.language);
    await vscode.env.clipboard.writeText(prepared.cleanedCode);
    const submittedAfterSeconds = Math.floor(this.now() / 1000);

    if (
      openBrowser &&
      prepared.target &&
      isAllowedSubmitUrl(prepared.target.submitUrl, prepared.target.platform)
    ) {
      this.lastSubmitSecByProblem.set(problem.problemKey, submittedAfterSeconds);
      await vscode.env.openExternal(vscode.Uri.parse(prepared.target.submitUrl));
      const autoPollEnabled =
        this.deps.config.get<boolean>(AI_CONFIG_KEYS.autoPollVerdict, true) !== false;
      const configuredHandle = resolveHandleForPlatform(
        this.readOjPublicHandles(),
        problem.source
      );
      if (
        autoPollEnabled &&
        supportsPublicVerdictSync(problem.source) &&
        configuredHandle
      ) {
        this.startBackgroundVerdictPoll(problem, submittedAfterSeconds);
      }
      this.postToast(
        "info",
        this.isEn()
          ? `Copied clean code (${prepared.removedBlocks} debug block(s) stripped) & opened submit page. Not signed in there? Use "Copy URL" in your logged-in browser.`
          : `已复制纯净代码（清理 ${prepared.removedBlocks} 处调试块）并打开提交页。若未在默认浏览器登录，可点「复制链接」到常用浏览器打开。`
      );
    } else if (!openBrowser) {
      this.postToast(
        "info",
        this.isEn()
          ? `Copied clean code only (${prepared.removedBlocks} debug block(s) stripped). Paste in your logged-in browser.`
          : `已仅复制纯净代码（清理 ${prepared.removedBlocks} 处调试块），请切到已登录浏览器粘贴提交。`
      );
    } else {
      if (openBrowser) {
        this.lastSubmitSecByProblem.set(problem.problemKey, submittedAfterSeconds);
      }
      this.postToast(
        "info",
        this.isEn()
          ? `Copied clean code (${prepared.removedBlocks} debug block(s) stripped). Paste on your OJ manually.`
          : `已复制纯净代码（清理 ${prepared.removedBlocks} 处本地调试块），请粘贴至目标 OJ 提交。`
      );
    }

    await this.syncState();
  }

  async reportManualVerdict(verdict: OfficialVerdictStatus): Promise<void> {
    const problem = this.activeProblem;
    if (!problem) {
      return;
    }
    this.cancelBackgroundVerdictPoll(problem.problemKey);

    const event = createManualVerdictEvent({
      problemKey: problem.problemKey,
      platform: problem.source,
      verdict
    });
    const eventId = await this.ingestOfficialVerdict(problem, event);
    this.postToast(
      verdict === "AC" ? "info" : "warn",
      this.isEn()
        ? `Recorded official verdict: ${verdict}.`
        : `已回填官方评测结果：${verdict}。`,
      eventId
    );
    await this.syncState();
  }

  async syncCodeforcesVerdict(): Promise<void> {
    return this.syncOfficialVerdict();
  }

  async syncOfficialVerdict(): Promise<void> {
    const problem = this.activeProblem;
    if (!problem || !supportsPublicVerdictSync(problem.source)) {
      this.postToast(
        "warn",
        this.isEn()
          ? "Zero-login public verdict sync supports Codeforces, LeetCode CN/Global, and AtCoder. For Luogu/NowCoder, use the 6-OJ companion userscript or manual buttons."
          : "免登录公开同步支持 Codeforces / 力扣中国 / LeetCode Global / AtCoder；洛谷与牛客请使用 6 平台回传脚本或手动回填。"
      );
      await this.syncState();
      return;
    }

    const handles = this.readOjPublicHandles();
    const handle = resolveHandleForPlatform(handles, problem.source);
    const label = shortSourceLabel(problem.source, this.isEn());
    if (!handle) {
      this.postToast(
        "warn",
        this.isEn()
          ? `Configure your public ${label} handle in Settings first.`
          : `请先在「设置」中填写公开 ${label} 用户名（Handle）。`,
        undefined,
        {
          label: this.isEn() ? "Open Settings" : "去配置 Handle",
          tab: "settings",
          subKey: "sub.settings",
          subVal: "env"
        }
      );
      await this.syncState();
      return;
    }

    this.cancelBackgroundVerdictPoll(problem.problemKey);
    this.verdictSyncing = true;
    await this.syncState();

    const submittedAfterSeconds =
      this.lastSubmitSecByProblem.get(problem.problemKey) ??
      Math.floor(this.now() / 1000) - 3600;

    try {
      const result = await fetchLatestPublicVerdict(
        {
          problem,
          handle,
          submittedAfterSeconds
        },
        { fetchImpl: this.deps.fetchImpl }
      );

      if (result.status === "pending") {
        this.postToast(
          "info",
          this.isEn()
            ? `No newly judged ${label} submission found yet for @${handle}.`
            : `暂未在 @${handle} 的 ${label} 公开记录中查到新的已判结果，请稍后再试。`
        );
        return;
      }

      const targetProblem =
        (await this.findProblemMatch({
          problemKey: result.event.problemKey,
          source: result.event.platform,
          sourceId: problem.sourceId
        })) ?? problem;
      const eventId = await this.ingestOfficialVerdict(targetProblem, result.event, result.dedupKey);
      this.postToast(
        result.event.verdict === "AC" ? "info" : "warn",
        this.isEn()
          ? `Synced ${label} #${result.submissionId}: ${result.event.verdict}.`
          : `已同步 ${label} 提交 #${result.submissionId}：${result.event.verdict}。`,
        eventId
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      this.postToast(
        "warn",
        this.isEn() ? `${label} verdict sync failed: ${msg}` : `${label} 结果同步失败：${msg}`
      );
    } finally {
      this.verdictSyncing = false;
      await this.syncState();
    }
  }

  private readOjPublicHandles(): OjPublicHandles {
    return {
      codeforces: (this.deps.config.get<string>(AI_CONFIG_KEYS.codeforcesHandle) ?? "").trim(),
      leetcodeCn: (this.deps.config.get<string>(AI_CONFIG_KEYS.leetcodeCnHandle) ?? "").trim(),
      leetcodeGlobal: (
        this.deps.config.get<string>(AI_CONFIG_KEYS.leetcodeGlobalHandle) ?? ""
      ).trim(),
      atcoder: (this.deps.config.get<string>(AI_CONFIG_KEYS.atcoderHandle) ?? "").trim()
    };
  }

  private cancelBackgroundVerdictPoll(problemKey?: string): void {
    if (problemKey) {
      const controller = this.verdictPollAborts.get(problemKey);
      if (controller) {
        controller.abort();
        this.verdictPollAborts.delete(problemKey);
      }
      return;
    }
    for (const controller of this.verdictPollAborts.values()) {
      controller.abort();
    }
    this.verdictPollAborts.clear();
  }

  private startBackgroundVerdictPoll(
    problem: ProblemDocument,
    submittedAfterSeconds: number
  ): void {
    const key = problem.problemKey;
    this.cancelBackgroundVerdictPoll(key);
    const controller = new AbortController();
    this.verdictPollAborts.set(key, controller);
    const handles = this.readOjPublicHandles();
    const label = shortSourceLabel(problem.source, this.isEn());

    void (async () => {
      try {
        const result = await pollPublicOfficialVerdict(
          {
            problem,
            handles,
            submittedAfterSeconds,
            signal: controller.signal
          },
          { fetchImpl: this.deps.fetchImpl }
        );
        if (this.disposed || controller.signal.aborted || result.status !== "judged") {
          return;
        }
        if (this.verdictPollAborts.get(key) === controller) {
          this.verdictPollAborts.delete(key);
        }
        const eventId = await this.ingestOfficialVerdict(problem, result.event, result.dedupKey);
        this.postToast(
          result.event.verdict === "AC" ? "info" : "warn",
          this.isEn()
            ? `Auto-synced ${label} #${result.submissionId}: ${result.event.verdict}.`
            : `已自动同步 ${label} 提交 #${result.submissionId}：${result.event.verdict}。`,
          eventId
        );
        await this.syncState();
      } catch {
        // Background polling fails silently so manual sync/report remain unimpeded.
      } finally {
        if (this.verdictPollAborts.get(key) === controller) {
          this.verdictPollAborts.delete(key);
        }
      }
    })();
  }

  async requestCoach(
    payload: {
      action: CoachAction;
      stuckCategory?: StuckCategory;
      studentQuestion?: string;
      confirmGiveUp?: boolean;
    },
    triggeredFromSidebar = false
  ): Promise<CoachResponsePayload | undefined> {
    if (triggeredFromSidebar && payload.action === "hint") {
      this.deps.getShortcutCoach()?.recordSidebarClick("requestHint", this.now());
    } else if (!triggeredFromSidebar) {
      this.postMessage({ type: "ui/switchTab", payload: { tab: "coach" } });
    }

    const problem = this.activeProblem;
    if (!problem) {
      this.postToast(
        "warn",
        this.isEn()
          ? "Select or import a problem before asking the coach."
          : "请先导入或选择一道题目再使用苏格拉底教练。"
      );
      await this.syncState();
      return undefined;
    }

    const codeSnapshot = this.deps.workspaceFiles.getActiveCodeSnapshot();
    const studentCode = codeSnapshot?.code ?? "";
    const language = codeSnapshot?.language ?? this.activeLanguage;
    const existingHistory = this.coachHistoryByProblem.get(problem.problemKey) ?? [];
    const lastTurn = existingHistory[existingHistory.length - 1];
    const requestId = `coach-${Date.now()}-${randomBytes(3).toString("hex")}`;

    this.coachBusy = true;
    await this.syncState();

    try {
      const response = await this.deps.coachService.respond(
        {
          action: payload.action,
          problem,
          language,
          studentCode,
          studentMessage: payload.studentQuestion,
          previousCoachTurn: lastTurn ? `${lastTurn.headline}\n${lastTurn.guidance}` : undefined,
          localRunResult: this.getLastRunForProblem(problem.problemKey, language),
          stuckCategory: payload.stuckCategory,
          strictness: this.flags.coachStrictness,
          uiLanguage: this.flags.uiLanguage,
          explicitGiveUp: payload.confirmGiveUp === true,
          learnerSnapshot: this.learnerSnapshot,
          userOverrides: this.userOverrides,
          now: this.nowIso()
        },
        (delta) => {
          this.postMessage({
            type: "coach/streamDelta",
            payload: { requestId, delta }
          });
        }
      );

      this.coachHistoryByProblem.set(problem.problemKey, [...existingHistory, response]);
      if (response.misconceptionIds.length > 0) {
        this.latestMisconceptionsByProblem.set(problem.problemKey, response.misconceptionIds);
      }

      // Sync hint ceiling / give-up ceiling with StylishRankEngine
      const rankEngine = this.ensureRankEngine(problem);
      if (payload.action === "giveUp" && payload.confirmGiveUp === true) {
        this.applyRankTransition(rankEngine.recordGiveUp(this.now()));
        await this.appendLearningEventForProblem({
          problem,
          language,
          kind: "attempt_abandoned",
          verdict: "ABANDONED",
          verdictSource: "manual_report",
          revealedSolution: true,
          misconceptionIds: response.misconceptionIds,
          summary: response.headline
        });
        await this.recomputeLearnerState();
      } else if (payload.action === "hint") {
        this.applyRankTransition(rankEngine.recordHintUsed(response.hintLevel, this.now()));
        await this.appendLearningEventForProblem({
          problem,
          language,
          kind: "hint_requested",
          verdict: "AI_ESTIMATE_ONLY",
          verdictSource: "ai_estimate",
          revealedSolution: false,
          misconceptionIds: response.misconceptionIds,
          summary: response.headline
        });
      }

      return response;
    } finally {
      this.coachBusy = false;
      await this.syncState();
    }
  }

  async saveAiConfig(
    payload: Extract<WebviewToHostMessage, { type: "ai/saveConfig" }>["payload"]
  ): Promise<void> {
    const target = resolveDefaultConfigTarget();
    const updatedRouterConfig = await saveAiConfigSafely(
      this.deps.config,
      this.deps.secrets,
      payload,
      target
    );
    this.deps.modelRouter.updateRoleConfig("chat", updatedRouterConfig.chat);
    this.deps.modelRouter.updateRoleConfig("fim", updatedRouterConfig.fim);
    this.postToast(
      "info",
      this.isEn()
        ? "AI settings saved (API keys stored securely in SecretStorage)."
        : "双角色 AI 配置已保存（API Key 已独立加密写入 SecretStorage）。"
    );
    await this.syncState();
  }

  async runAiHealthCheckAction(): Promise<SidebarHealthCheckSummary> {
    const routerConfig = await readAiRouterConfig(this.deps.config, this.deps.secrets);
    const knownSecrets = await this.deps.secrets.getKnownSecrets();
    const raw = await runAiHealthCheck(routerConfig, {
      fetchImpl: this.deps.fetchImpl,
      extraSecrets: knownSecrets
    });
    const summary = mapHealthCheckToSidebarSummary(raw, this.flags.uiLanguage);
    this.lastHealthCheck = summary;
    this.postToast(
      summary.ok ? "info" : "warn",
      summary.ok
        ? this.isEn()
          ? "3-step AI health check passed."
          : "3 步 AI 链路健康自检全部通过。"
        : this.isEn()
          ? "AI health check detected issues. See step details in Settings."
          : "AI 健康自检发现配置问题，请查看设置页中的分步修复指引。"
    );
    await this.syncState();
    return summary;
  }

  async toggleAudioMute(): Promise<boolean> {
    const nextMuted = !this.deps.getAudioMuted();
    this.deps.setAudioMuted(nextMuted);
    const soundCtrl = this.deps.getSoundController();
    if (soundCtrl) {
      soundCtrl.setMuted(nextMuted);
      this.deps.statusBar.updateAudioIndicator(soundCtrl.getStatusBarIndicator());
    }
    this.postToast(
      "info",
      nextMuted
        ? this.isEn()
          ? "Algo Coach audio muted."
          : "已静音 Algo Coach 音效。"
        : this.isEn()
          ? "Algo Coach audio unmuted."
          : "已恢复 Algo Coach 音效。"
    );
    await this.syncState();
    return nextMuted;
  }

  // -------------------------------------------------------------------------
  // Internal Helpers
  // -------------------------------------------------------------------------

  private async handleMuteMisconception(misconceptionId: string, muted: boolean): Promise<void> {
    this.userOverrides = await this.deps.overridesStore.update((cur) =>
      muted
        ? muteMisconception(cur, misconceptionId, "Muted from sidebar dossier", this.nowIso())
        : unmuteMisconception(cur, misconceptionId, this.nowIso())
    );
    await this.recomputeLearnerState();
    await this.syncState();
  }

  private async handleVoidEvent(eventId: string): Promise<void> {
    this.userOverrides = await this.deps.overridesStore.update((cur) =>
      voidLearningEvent(cur, eventId, this.nowIso())
    );
    await this.recomputeLearnerState();
    await this.syncState();
  }

  private playTestSound(kind: SoundEventKind): void {
    const isChime = kind === "chime_pass" || kind === "chime_rank_up";
    const configuredVol = isChime
      ? this.flags.celebrationSoundVolume
      : this.flags.typingSoundVolume;
    const volume = configuredVol > 0 ? configuredVol : 0.3;
    this.postMessage({
      type: "sfx/play",
      payload: {
        kind,
        pack: this.flags.typingSoundPack,
        volume,
        gainDbOffset: kind === "key_backspace" ? -4 : 0,
        pitchJitter: 0,
        overtone: kind === "key_punct_close" || isChime
      }
    });
  }

  private async activateAndOpenProblem(
    doc: ProblemDocument,
    openFile: boolean,
    language?: SupportedLanguage
  ): Promise<void> {
    this.setActiveProblemInternal(doc);
    if (openFile) {
      const opened = await this.deps.workspaceFiles.openOrCreatePracticeFile(doc, language);
      this.activeFilePath = opened.filePath;
      this.activeLanguage = opened.language;
      if (
        (doc.statementMarkdown || doc.samples.length > 0) &&
        (this.readerPanel.isOpen() || !this.readerPanel.wasDismissedByUser())
      ) {
        await this.openProblemReader(undefined, true);
      }
    } else if (language && language !== "generic") {
      this.activeLanguage = language;
    }
  }

  private setLastRunForProblem(
    problemKey: string,
    language: SupportedLanguage,
    result: LocalRunResult
  ): void {
    this.lastRunByProblem.set(problemKey, result);
    this.lastRunByProblemLang.set(`${problemKey}::${language}`, result);
  }

  private getLastRunForProblem(
    problemKey: string,
    language: SupportedLanguage
  ): LocalRunResult | undefined {
    const exact = this.lastRunByProblemLang.get(`${problemKey}::${language}`);
    if (exact) {
      return exact;
    }
    const fallback = this.lastRunByProblem.get(problemKey);
    return fallback && fallback.language === language ? fallback : undefined;
  }

  private clearLastRunsForProblem(problemKey: string): void {
    this.lastRunByProblem.delete(problemKey);
    const prefix = `${problemKey}::`;
    for (const key of Array.from(this.lastRunByProblemLang.keys())) {
      if (key.startsWith(prefix)) {
        this.lastRunByProblemLang.delete(key);
      }
    }
  }

  private async findProblemMatch(ref: {
    problemKey?: string;
    source: ProblemSourceId;
    sourceId?: string;
  }): Promise<ProblemDocument | undefined> {
    const normalizedRefId = ref.sourceId?.trim().toLowerCase();
    const compactRefId = normalizedRefId?.replace(/\//g, "");
    const tailRefId = normalizedRefId?.split("/").filter(Boolean).pop();

    const matches = (p: ProblemDocument): boolean => {
      if (ref.problemKey && p.problemKey === ref.problemKey) {
        return true;
      }
      if (!normalizedRefId || p.source !== ref.source) {
        return false;
      }
      const pId = p.sourceId.trim().toLowerCase();
      if (pId === normalizedRefId || pId.replace(/\//g, "") === compactRefId) {
        return true;
      }
      if (tailRefId && (pId === tailRefId || pId.split("/").pop() === tailRefId)) {
        return true;
      }
      const url = (p.canonicalUrl ?? "").toLowerCase();
      return Boolean(tailRefId && url.includes(`/${tailRefId}`));
    };

    if (this.activeProblem && matches(this.activeProblem)) {
      return this.activeProblem;
    }
    let found = this.problemsCache.find(matches);
    if (!found) {
      this.problemsCache = await this.deps.problemRepository.listCachedProblems();
      found = this.problemsCache.find(matches);
    }
    return found;
  }

  private setActiveProblemInternal(doc: ProblemDocument): void {
    this.activeProblem = doc;
    if (!this.sessionStartMsByProblem.has(doc.problemKey)) {
      this.sessionStartMsByProblem.set(doc.problemKey, this.now());
    }
    const rankEngine = this.ensureRankEngine(doc);
    const rankState = rankEngine.getState();
    this.deps.getSoundController()?.setCurrentRank(rankState.effectiveRank);
    this.deps.statusBar.updateStylishRank(this.flags, rankState);
  }

  private ensureRankEngine(problem: ProblemDocument): StylishRankEngine {
    let engine = this.rankEngines.get(problem.problemKey);
    if (!engine) {
      engine = new StylishRankEngine({
        problemKey: problem.problemKey,
        originalSamples: problem.samples.filter((s) => s.isOriginal),
        isOfflineOrReadOnly:
          problem.source === "warmup-pack" || problem.source === "local-markdown",
        now: this.now
      });
      this.rankEngines.set(problem.problemKey, engine);
    }
    return engine;
  }

  private async ingestOfficialVerdict(
    problem: ProblemDocument,
    event: OfficialVerdictEvent,
    explicitEventId?: string
  ): Promise<string> {
    // 1. Update StylishRankEngine
    const rankEngine = this.ensureRankEngine(problem);
    const transition = rankEngine.recordOfficialVerdict(event, this.now());
    this.applyRankTransition(transition);

    // 2. Drive SoundController celebration chime on official AC
    this.deps.getSoundController()?.handleOfficialVerdict(event, this.now());

    // 3. Persist terminal LearningEventV2 into immutable JSONL store & recompute OLM + FSRS
    const verdict = mapOfficialVerdictToLearningVerdict(event.verdict);
    const misconceptions = this.latestMisconceptionsByProblem.get(problem.problemKey) ?? [];
    const eventId = await this.appendLearningEventForProblem({
      problem,
      language: this.activeLanguage,
      kind: "attempt_completed",
      verdict,
      verdictSource:
        event.observedVia === "public_api" || event.observedVia === "browser_extension"
          ? "official_oj"
          : "manual_report",
      revealedSolution: false,
      misconceptionIds: verdict === "AC" ? [] : misconceptions,
      summary: `Official ${event.verdict} via ${event.observedVia}`,
      explicitEventId
    });
    await this.recomputeLearnerState();
    return eventId;
  }

  private async appendLearningEventForProblem(params: {
    problem: ProblemDocument;
    language: SupportedLanguage;
    kind: LearningEventV2["kind"];
    verdict: LearningEventVerdict;
    verdictSource: LearningEventV2["verdictSource"];
    revealedSolution: boolean;
    misconceptionIds: string[];
    summary: string;
    explicitEventId?: string;
  }): Promise<string> {
    const hintState = await this.deps.coachService.getHintState(params.problem.problemKey);
    const pattern = analyzeProblemPattern(params.problem);
    const conceptTags = Array.from(
      new Set([
        ...normalizeConceptTags(params.problem.conceptTags ?? []),
        ...normalizeConceptTags(params.problem.rawTags),
        ...pattern.candidates.slice(0, 2).map((c) => c.conceptTag)
      ])
    );
    const startedAt = this.sessionStartMsByProblem.get(params.problem.problemKey) ?? this.now();
    const elapsedSec = Math.max(1, Math.round((this.now() - startedAt) / 1000));

    const event: LearningEventV2 = {
      schemaVersion: "2.0",
      eventId:
        params.explicitEventId ?? `evt-${this.now()}-${randomBytes(4).toString("hex")}`,
      timestamp: this.nowIso(),
      sessionId: this.sessionId,
      kind: params.kind,
      problemRef: {
        problemKey: params.problem.problemKey,
        title: params.problem.title,
        difficultyTier: params.problem.difficulty?.normalizedTier ?? 2,
        conceptTags: conceptTags.length > 0 ? conceptTags : ["basics.io_and_simulation"]
      },
      language: params.language,
      verdict: params.verdict,
      verdictSource: params.verdictSource,
      independence: {
        hintsUsed: hintState.hintsRequestedCount,
        maxHintLevel: hintState.currentLevel,
        revealedSolution: params.revealedSolution || hintState.giveUpUnlocked,
        elapsedSec
      },
      ...(params.misconceptionIds.length > 0 || params.summary
        ? {
            diagnosis: {
              misconceptionIds: params.misconceptionIds,
              summary: params.summary
            }
          }
        : {})
    };

    await this.deps.eventStore.append(event);
    return event.eventId;
  }

  private async recomputeLearnerState(): Promise<void> {
    const events = await this.deps.eventStore.readAll();
    const voided = new Set(this.userOverrides.voidedEventIds);
    this.recentEvents = events
      .filter((e) => !voided.has(e.eventId))
      .slice(-5)
      .reverse()
      .map((e) => ({
        eventId: e.eventId,
        title: e.problemRef.title ?? e.problemRef.problemKey,
        verdict: e.verdict,
        timestamp: e.timestamp
      }));
    const nowDate = new Date(this.now());
    this.learnerSnapshot = deriveLearnerSnapshot(events, this.userOverrides, nowDate);
    const candidates = this.buildRecommendationCandidates(events);
    this.recommendations = recommendNextProblems({
      snapshot: this.learnerSnapshot,
      overrides: this.userOverrides,
      candidates,
      now: nowDate,
      limit: 6,
      uiLanguage: this.flags.uiLanguage
    });
  }

  private buildRecommendationCandidates(events: readonly LearningEventV2[]): RecommendationCandidate[] {
    const solvedKeys = new Set<string>(
      events
        .filter((e) => e.verdict === "AC" && !this.userOverrides.voidedEventIds.includes(e.eventId))
        .map((e) => e.problemRef.problemKey)
    );

    const byKey = new Map<string, RecommendationCandidate>();

    const addDoc = (doc: ProblemDocument) => {
      if (byKey.has(doc.problemKey)) return;
      const tags = normalizeConceptTags([...(doc.conceptTags ?? []), ...doc.rawTags]);
      byKey.set(doc.problemKey, {
        problemKey: doc.problemKey,
        title: doc.title,
        conceptTags: tags.length > 0 ? tags : doc.rawTags,
        difficultyTier: doc.difficulty?.normalizedTier ?? 2,
        solved: solvedKeys.has(doc.problemKey)
      });
    };

    for (const doc of this.problemsCache) {
      addDoc(doc);
    }
    for (const warmup of getWarmupProblems(this.flags.uiLanguage)) {
      addDoc(warmup);
    }
    for (const sheet of listCuratedSheets()) {
      for (const item of sheet.items) {
        addDoc(curatedEntryToMetadataDocument(item, sheet.defaultSource));
      }
    }

    return Array.from(byKey.values());
  }

  private isEn(): boolean {
    return this.flags.uiLanguage === "en-US";
  }

  private nowIso(): string {
    return new Date(this.now()).toISOString();
  }

  private disposeViewListeners(): void {
    for (const d of this.viewDisposables) {
      d.dispose();
    }
    this.viewDisposables.length = 0;
  }

  dispose(): void {
    this.disposed = true;
    this.cancelBackgroundVerdictPoll();
    this.disposeViewListeners();
    this.readerPanel.dispose();
    this.view = undefined;
  }
}
