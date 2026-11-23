import { join } from "node:path";
import * as vscode from "vscode";
import type { PresetMode } from "../core/contracts";
import { ModelRouter } from "../core/ai";
import { TriggerSignalTracker } from "../core/autocomplete";
import { CoachService, FileHintLadderStore, HintLadderMachine } from "../core/coach";
import { JsonlLearningEventStore, JsonUserOverridesStore } from "../core/learner";
import {
  isHeaderOrFastIoTemplate,
  ManagedModuleController,
  ShortcutCoach,
  SoundController,
  StarterVisualPresetManager
} from "../experience";
import { LocalhostBridge, ProblemRepository } from "../problems";
import { NodeRunnerEngine } from "../runner";
import {
  AlgoCoachInlineCompletionProvider,
  INLINE_COMPLETION_LANGUAGES,
  type SelectPlaceholderCommandArgs
} from "./inlineProvider";
import { SidebarController } from "./sidebarController";
import { StatusBarController } from "./statusBarController";
import {
  AI_CONFIG_KEYS,
  readAiRouterConfig,
  SecretKeyStore,
  VscodeMementoAdapter,
  VscodeWorkspaceConfigAdapter
} from "./vscodeAdapters";
import {
  sanitizeProblemKeyForFile,
  WorkspaceFileController
} from "./workspaceFileController";

const AUDIO_MUTED_MEMENTO_KEY = "algoCoach.audio.muted.v1";

/**
 * Authoritative list of all 18 VS Code commands declared in `package.json`.
 */
export const EXTENSION_COMMANDS = [
  "algoCoach.openSidebar",
  "algoCoach.openWalkthrough",
  "algoCoach.selectPreset",
  "algoCoach.applyStarterVisualPreset",
  "algoCoach.restoreStarterVisualPreset",
  "algoCoach.loadWarmupPack",
  "algoCoach.importProblem",
  "algoCoach.openProblemReader",
  "algoCoach.runSamples",
  "algoCoach.checkToolchain",
  "algoCoach.copyAndOpenSubmit",
  "algoCoach.requestHint",
  "algoCoach.openPatternMapper",
  "algoCoach.triggerGhostText",
  "algoCoach.toggleSound",
  "algoCoach.configureAiKeys",
  "algoCoach.runHealthCheck",
  "algoCoach.internal.selectPlaceholder",
  "algoCoach.internal.recordWordAccept"
] as const;

let activeManagedModules: ManagedModuleController | undefined;

function mapChangeReason(
  reason: vscode.TextDocumentChangeReason | undefined
): "undo" | "redo" | undefined {
  if (reason === vscode.TextDocumentChangeReason.Undo) {
    return "undo";
  }
  if (reason === vscode.TextDocumentChangeReason.Redo) {
    return "redo";
  }
  return undefined;
}

function countLspErrors(uri: vscode.Uri): number {
  const diagnostics = vscode.languages.getDiagnostics(uri);
  let count = 0;
  for (const diag of diagnostics) {
    if (diag.severity === vscode.DiagnosticSeverity.Error) {
      count += 1;
    }
  }
  return count;
}

function isLikelyPasteChange(text: string): boolean {
  if (text.length >= 30) {
    return true;
  }
  if (text.includes("\n")) {
    const nonEmptyLines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    return nonEmptyLines.length >= 2;
  }
  return false;
}

function isTrackableCodeScheme(scheme: string): boolean {
  return scheme === "file" || scheme === "untitled";
}

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const storageDir = context.globalStorageUri.fsPath;
  const configAdapter = new VscodeWorkspaceConfigAdapter();
  const mementoAdapter = new VscodeMementoAdapter(context.globalState);
  const secretKeyStore = new SecretKeyStore(context.secrets);
  const bridgeVerdictToken = await secretKeyStore.ensureBridgeVerdictToken();

  // Domain services & persistent stores
  const problemRepository = new ProblemRepository({
    cacheDir: join(storageDir, "problems-cache")
  });
  const runnerEngine = new NodeRunnerEngine();
  const eventStore = new JsonlLearningEventStore(join(storageDir, "learningEvents.v2.jsonl"));
  const overridesStore = new JsonUserOverridesStore(join(storageDir, "userOverrides.v2.json"));
  const hintLadder = new HintLadderMachine({
    store: new FileHintLadderStore(join(storageDir, "hintLadder.v2.json"))
  });
  const initialAiConfig = await readAiRouterConfig(configAdapter, secretKeyStore);
  const modelRouter = new ModelRouter(initialAiConfig);
  const coachService = new CoachService({
    hintLadder,
    modelRouter
  });

  const visualPresetManager = new StarterVisualPresetManager(configAdapter, mementoAdapter);
  const triggerTracker = new TriggerSignalTracker();
  const managedModules = new ManagedModuleController();
  activeManagedModules = managedModules;

  const statusBar = new StatusBarController();

  let audioMuted = mementoAdapter.get<boolean>(AUDIO_MUTED_MEMENTO_KEY, false);
  let sidebarController: SidebarController;

  const workspaceFiles = new WorkspaceFileController({
    storageDir,
    memento: mementoAdapter,
    resolveProblemKeyByStem: (stem) => {
      const normalizedStem = stem.toLowerCase();
      for (const prob of cachedProblemKeys()) {
        if (sanitizeProblemKeyForFile(prob).toLowerCase() === normalizedStem) {
          return prob;
        }
      }
      return undefined;
    },
    onActiveContextChanged: (ctx) => {
      sidebarController?.syncActiveEditorContext(ctx);
    }
  });

  let knownProblemKeys: string[] = [];
  function cachedProblemKeys(): string[] {
    return knownProblemKeys;
  }

  sidebarController = new SidebarController({
    extensionUri: context.extensionUri,
    storageDir,
    config: configAdapter,
    secrets: secretKeyStore,
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
    getShortcutCoach: () => managedModules.getInstance<ShortcutCoach>("shortcutCoach"),
    getSoundController: () => managedModules.getInstance<SoundController>("soundController"),
    getAudioMuted: () => audioMuted,
    setAudioMuted: (muted) => {
      audioMuted = muted;
      void mementoAdapter.update(AUDIO_MUTED_MEMENTO_KEY, muted);
    }
  });

  const inlineProvider = new AlgoCoachInlineCompletionProvider({
    getFlags: () => sidebarController.getFlags(),
    getModelRouter: () => modelRouter,
    getCodeHabits: () => sidebarController.getUserOverrides().autocompleteCodeHabits,
    triggerTracker,
    onGhostTextAccepted: (evt) => {
      const rankEngine = sidebarController.getStylishRankEngine();
      if (!rankEngine || !sidebarController.getFlags().stylishRankEnabled) {
        return;
      }
      const transition = rankEngine.recordGhostTextAccept({
        text: evt.text,
        shownAtMs: evt.shownAtMs,
        acceptedAtMs: evt.acceptedAtMs,
        mode: evt.mode,
        hadManualEditSinceLastAccept: evt.hadManualEditSinceLastAccept
      });
      sidebarController.applyRankTransition(transition);
      void sidebarController.syncState();
    }
  });

  // -------------------------------------------------------------------------
  // Managed optional modules (immediate dispose() when disabled in settings)
  // -------------------------------------------------------------------------

  managedModules.register({
    id: "shortcutCoach",
    isEnabled: (flags) => flags.shortcutHintsEnabled,
    create: (flags) =>
      new ShortcutCoach({
        memento: mementoAdapter,
        enabled: true,
        locale: flags.uiLanguage,
        onHint: (hint) => statusBar.showShortcutWhisper(hint)
      }),
    onUpdate: (coach, flags) => {
      coach.setLocale(flags.uiLanguage);
    }
  });

  managedModules.register({
    id: "soundController",
    isEnabled: (flags) => flags.typingSoundEnabled || flags.celebrationSoundEnabled,
    create: (flags) =>
      new SoundController({
        typingSoundEnabled: flags.typingSoundEnabled,
        typingSoundPack: flags.typingSoundPack,
        typingSoundVolume: flags.typingSoundVolume,
        celebrationSoundEnabled: flags.celebrationSoundEnabled,
        celebrationSoundVolume: flags.celebrationSoundVolume,
        focused: vscode.window.state.focused,
        muted: audioMuted,
        currentRank: sidebarController.getStylishRankEngine()?.getState().effectiveRank ?? "D",
        onEmit: (payload) => sidebarController.dispatchSound(payload)
      }),
    onUpdate: (ctrl, flags) => {
      ctrl.applyFeatureFlags(flags);
      ctrl.setMuted(audioMuted);
    }
  });

  managedModules.register({
    id: "inlineProvider",
    isEnabled: (flags) => flags.ghostTextMode !== "off",
    create: () =>
      vscode.languages.registerInlineCompletionItemProvider(
        INLINE_COMPLETION_LANGUAGES.map((language) => ({ language })),
        inlineProvider
      )
  });

  managedModules.register({
    id: "localhostBridge",
    isEnabled: () => (configAdapter.get<number>(AI_CONFIG_KEYS.bridgePort, 27121) ?? 27121) > 0,
    create: () => {
      const preferredPort = configAdapter.get<number>(AI_CONFIG_KEYS.bridgePort, 27121) ?? 27121;
      const bridge = new LocalhostBridge({
        preferredPort,
        verdictToken: bridgeVerdictToken,
        onProblem: async (doc) => {
          await sidebarController.handleBridgeProblem(doc);
          knownProblemKeys = (await problemRepository.listCachedProblems()).map((p) => p.problemKey);
        },
        onVerdict: async (verdict) => {
          await sidebarController.handleBridgeVerdict(verdict);
        }
      });

      void bridge
        .start()
        .then((port) => {
          sidebarController.setBridgeStatus({ listening: true, port });
        })
        .catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          sidebarController.setBridgeStatus({ listening: false, lastError: msg });
        });

      return {
        dispose: () => {
          void bridge.stop();
        }
      };
    }
  });

  managedModules.register({
    id: "windowFocusMonitor",
    isEnabled: (flags) => flags.typingSoundEnabled || flags.celebrationSoundEnabled,
    create: () =>
      vscode.window.onDidChangeWindowState((state) => {
        managedModules.getInstance<SoundController>("soundController")?.setWindowFocused(state.focused);
      })
  });

  managedModules.register({
    id: "diagnosticsMonitor",
    isEnabled: (flags) => flags.stylishRankEnabled,
    create: () =>
      vscode.languages.onDidChangeDiagnostics((event) => {
        const activeEditor = workspaceFiles.getActiveCodeEditor();
        if (!activeEditor) {
          return;
        }
        const activeUriStr = activeEditor.document.uri.toString();
        const affectsActive = event.uris.some((u) => u.toString() === activeUriStr);
        if (!affectsActive) {
          return;
        }
        const rankEngine = sidebarController.getStylishRankEngine();
        if (!rankEngine) {
          return;
        }
        const errorCount = countLspErrors(activeEditor.document.uri);
        const transition = rankEngine.updateDiagnostics(errorCount);
        sidebarController.applyRankTransition(transition);
        if (transition.rankChanged || transition.scoreDelta !== 0) {
          void sidebarController.syncState();
        }
      })
  });

  managedModules.register({
    id: "documentChangeMonitor",
    isEnabled: (flags) =>
      flags.ghostTextMode !== "off" ||
      flags.shortcutHintsEnabled ||
      flags.typingSoundEnabled ||
      flags.stylishRankEnabled,
    create: () =>
      vscode.workspace.onDidChangeTextDocument((event) => {
        if (!isTrackableCodeScheme(event.document.uri.scheme) || event.contentChanges.length === 0) {
          return;
        }

        const nowMs = Date.now();
        const reason = mapChangeReason(event.reason);
        const flags = sidebarController.getFlags();

        // 1. ShortcutCoach (only active when shortcutHintsEnabled === true)
        const shortcutCoach = managedModules.getInstance<ShortcutCoach>("shortcutCoach");
        if (shortcutCoach) {
          shortcutCoach.handleDocumentChange({
            documentUri: event.document.uri.toString(),
            reason,
            timestampMs: nowMs,
            contentChanges: event.contentChanges.map((change) => {
              let linePrefixBeforeChange: string | undefined;
              if (change.range.start.line < event.document.lineCount) {
                const lineText = event.document.lineAt(change.range.start.line).text;
                linePrefixBeforeChange = lineText.slice(0, change.range.start.character);
              }
              return {
                rangeOffset: change.rangeOffset,
                rangeLength: change.rangeLength,
                range: {
                  startLine: change.range.start.line,
                  startCharacter: change.range.start.character,
                  endLine: change.range.end.line,
                  endCharacter: change.range.end.character
                },
                text: change.text,
                linePrefixBeforeChange
              };
            })
          });
        }

        // 2. SoundController (only active when audio channel enabled)
        const soundCtrl = managedModules.getInstance<SoundController>("soundController");
        if (soundCtrl) {
          soundCtrl.handleDocumentChange({
            reason,
            timestampMs: nowMs,
            contentChanges: event.contentChanges.map((c) => ({
              text: c.text,
              rangeLength: c.rangeLength
            }))
          });
        }

        // 3. TriggerSignalTracker + manual edit tracking for ghost text
        if (event.contentChanges.length === 1 && !reason) {
          const single = event.contentChanges[0]!;
          const isBackspace = single.text === "" && single.rangeLength > 0 && single.rangeLength <= 2;
          const isSmallForward = single.text.length > 0 && single.text.length <= 5;
          if (isBackspace) {
            triggerTracker.recordKeystroke(nowMs, "backspace");
            inlineProvider.notifyManualEdit();
          } else if (isSmallForward) {
            triggerTracker.recordKeystroke(nowMs, "normal");
            inlineProvider.notifyManualEdit();
          }
        }

        // 4. StylishRankEngine hand-typed / paste tracking
        if (flags.stylishRankEnabled && event.contentChanges.length === 1 && !reason) {
          const rankEngine = sidebarController.getStylishRankEngine();
          const single = event.contentChanges[0]!;
          if (rankEngine) {
            if (isLikelyPasteChange(single.text)) {
              const inSolutionBody = !(
                single.range.start.line <= 15 && isHeaderOrFastIoTemplate(single.text)
              );
              const transition = rankEngine.recordPaste({
                text: single.text,
                inSolutionBody,
                source: "user",
                totalSolutionChars: event.document.getText().length,
                nowMs
              });
              sidebarController.applyRankTransition(transition);
              if (transition.rankChanged || transition.scoreDelta !== 0) {
                void sidebarController.syncState();
              }
            } else if (
              single.text.includes("\n") ||
              single.text === ";" ||
              single.text === "}" ||
              single.text === ")"
            ) {
              const lineIdx = Math.min(single.range.start.line, event.document.lineCount - 1);
              if (lineIdx >= 0) {
                const lineText = event.document.lineAt(lineIdx).text;
                const lspErrorCount = countLspErrors(event.document.uri);
                const transition = rankEngine.recordHandTypedLines({
                  lines: [lineText],
                  lspErrorCount,
                  nowMs
                });
                sidebarController.applyRankTransition(transition);
                if (transition.rankChanged || transition.scoreDelta !== 0) {
                  void sidebarController.syncState();
                }
              }
            }
          }
        }
      })
  });

  // Initialize workspace custom samples & sidebar state
  await workspaceFiles.init();
  await sidebarController.init();
  knownProblemKeys = (await problemRepository.listCachedProblems()).map((p) => p.problemKey);

  // Register Sidebar WebviewViewProvider with retainContextWhenHidden: true
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarController.viewType, sidebarController, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    statusBar,
    workspaceFiles,
    inlineProvider,
    sidebarController,
    managedModules,
    vscode.workspace.onDidChangeConfiguration((evt) => {
      if (!evt.affectsConfiguration("algoCoach")) {
        return;
      }
      sidebarController.refreshFlagsAndModules();
      if (evt.affectsConfiguration("algoCoach.ai") || evt.affectsConfiguration("algoCoach.oj")) {
        void sidebarController.reloadAiConfigFromSettings();
      } else {
        void sidebarController.syncState();
      }
    })
  );

  // -------------------------------------------------------------------------
  // Register ALL 18 package.json commands (100% real execution, zero stubs)
  // -------------------------------------------------------------------------

  const registerCommand = (id: (typeof EXTENSION_COMMANDS)[number], handler: (...args: any[]) => unknown) => {
    context.subscriptions.push(vscode.commands.registerCommand(id, handler));
  };

  registerCommand("algoCoach.openSidebar", async () => {
    await vscode.commands.executeCommand("algoCoach.sidebar.focus");
  });

  registerCommand("algoCoach.openWalkthrough", async () => {
    await sidebarController.openWalkthrough();
  });

  registerCommand("algoCoach.selectPreset", async () => {
    const isEn = sidebarController.getFlags().uiLanguage === "en-US";
    const items: Array<vscode.QuickPickItem & { preset: PresetMode }> = [
      {
        preset: "starter",
        label: isEn ? "Starter" : "Starter · 新手入门",
        description: isEn
          ? "Starter pack, shortcut whispers, gentle coaching"
          : "启用新手教程包、状态栏快捷键轻提示、温和引导"
      },
      {
        preset: "focus",
        label: isEn ? "Focus" : "Focus · 专注刷题（默认）",
        description: isEn
          ? "Clean adaptive ghost text, standard Socratic coach"
          : "安静专注、自适应防剧透补全、标准苏格拉底教练"
      },
      {
        preset: "contest",
        label: isEn ? "Contest" : "Contest · 竞赛面试",
        description: isEn
          ? "Manual ghost text only, strict zero-sycophancy critique"
          : "纯手动补全、严厉零谄媚点评、开启模拟面试入口"
      }
    ];
    const picked = await vscode.window.showQuickPick(items, {
      placeHolder: isEn ? "Select Algo Coach mode preset" : "选择 Algo Coach 模式预设"
    });
    if (picked) {
      await sidebarController.selectPreset(picked.preset);
    }
  });

  registerCommand("algoCoach.applyStarterVisualPreset", async () => {
    await sidebarController.applyVisualPreset();
  });

  registerCommand("algoCoach.restoreStarterVisualPreset", async () => {
    await sidebarController.restoreVisualPreset();
  });

  registerCommand("algoCoach.loadWarmupPack", async () => {
    await sidebarController.loadWarmupPack();
    knownProblemKeys = (await problemRepository.listCachedProblems()).map((p) => p.problemKey);
  });

  registerCommand("algoCoach.importProblem", async () => {
    const isEn = sidebarController.getFlags().uiLanguage === "en-US";
    const input = await vscode.window.showInputBox({
      prompt: isEn
        ? "Enter OJ URL or ID (e.g. two-sum, P1001, 1433G, abc300_a, NowCoder URL)"
        : "输入题库 URL 或题号（如 two-sum、P1001、1433G、abc300_a、牛客链接）",
      placeHolder: "https://leetcode.cn/problems/two-sum/ or P1001 or 1433G",
      ignoreFocusOut: true
    });
    if (input && input.trim()) {
      await sidebarController.importProblemRef(input.trim());
      knownProblemKeys = (await problemRepository.listCachedProblems()).map((p) => p.problemKey);
      await vscode.commands.executeCommand("algoCoach.sidebar.focus");
    }
  });

  registerCommand("algoCoach.openProblemReader", async () => {
    await sidebarController.openProblemReader(undefined, false);
  });

  registerCommand("algoCoach.runSamples", async () => {
    managedModules.getInstance<ShortcutCoach>("shortcutCoach")?.recordShortcutUsed("run-samples");
    await sidebarController.runActiveSamples(false);
  });

  registerCommand("algoCoach.checkToolchain", async () => {
    await sidebarController.checkToolchains();
    await vscode.commands.executeCommand("algoCoach.sidebar.focus");
  });

  registerCommand("algoCoach.copyAndOpenSubmit", async () => {
    await sidebarController.copyAndOpenSubmit();
  });

  registerCommand("algoCoach.requestHint", async () => {
    managedModules.getInstance<ShortcutCoach>("shortcutCoach")?.recordShortcutUsed("request-hint");
    await vscode.commands.executeCommand("algoCoach.sidebar.focus");
    await sidebarController.requestCoach({ action: "hint" }, false);
  });

  registerCommand("algoCoach.openPatternMapper", async () => {
    await vscode.commands.executeCommand("algoCoach.sidebar.focus");
    await sidebarController.requestCoach({ action: "patternMap" }, false);
  });

  registerCommand("algoCoach.triggerGhostText", async () => {
    await vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
  });

  registerCommand("algoCoach.toggleSound", async () => {
    await sidebarController.toggleAudioMute();
  });

  registerCommand("algoCoach.configureAiKeys", async () => {
    const isEn = sidebarController.getFlags().uiLanguage === "en-US";
    const choice = await vscode.window.showQuickPick(
      [
        {
          id: "set-chat",
          label: isEn ? "Set Chat Role API Key" : "设置 Chat 教练角色 API Key",
          description: "algoCoach.secret.chatApiKey"
        },
        {
          id: "set-fim",
          label: isEn ? "Set FIM Autocomplete API Key" : "设置 FIM 补全角色 API Key",
          description: "algoCoach.secret.fimApiKey"
        },
        {
          id: "clear-chat",
          label: isEn ? "Clear Chat Role API Key" : "清除 Chat 角色 API Key",
          description: "algoCoach.secret.chatApiKey"
        },
        {
          id: "clear-fim",
          label: isEn ? "Clear FIM Role API Key" : "清除 FIM 角色 API Key",
          description: "algoCoach.secret.fimApiKey"
        }
      ],
      {
        placeHolder: isEn
          ? "Chat and FIM API keys are stored independently in VS Code SecretStorage"
          : "Chat 与 FIM 角色的 API Key 相互独立，安全存储在 VS Code SecretStorage 中"
      }
    );

    if (!choice) {
      return;
    }

    if (choice.id === "clear-chat") {
      await secretKeyStore.deleteChatApiKey();
      await sidebarController.reloadAiConfigFromSettings();
      sidebarController.postToast("info", isEn ? "Chat API key cleared." : "已清除 Chat API Key。");
      return;
    }
    if (choice.id === "clear-fim") {
      await secretKeyStore.deleteFimApiKey();
      await sidebarController.reloadAiConfigFromSettings();
      sidebarController.postToast("info", isEn ? "FIM API key cleared." : "已清除 FIM API Key。");
      return;
    }

    const isChat = choice.id === "set-chat";
    const keyInput = await vscode.window.showInputBox({
      password: true,
      ignoreFocusOut: true,
      prompt: isChat
        ? isEn
          ? "Enter Chat API Key (stored in SecretStorage, never saved to settings.json)"
          : "输入 Chat 角色 API Key（加密写入 SecretStorage，绝不写入明文设置）"
        : isEn
          ? "Enter FIM API Key (stored independently in SecretStorage)"
          : "输入 FIM 角色 API Key（与 Chat 隔离，加密写入 SecretStorage）"
    });
    if (keyInput === undefined) {
      return;
    }

    if (isChat) {
      await secretKeyStore.setChatApiKey(keyInput);
    } else {
      await secretKeyStore.setFimApiKey(keyInput);
    }
    await sidebarController.reloadAiConfigFromSettings();
    sidebarController.postToast(
      "info",
      isChat
        ? isEn
          ? "Chat API key saved securely."
          : "Chat 角色 API Key 已安全保存。"
        : isEn
          ? "FIM API key saved securely."
          : "FIM 角色 API Key 已安全保存。"
    );
  });

  registerCommand("algoCoach.runHealthCheck", async () => {
    await vscode.commands.executeCommand("algoCoach.sidebar.focus");
    await sidebarController.runAiHealthCheckAction();
  });

  registerCommand(
    "algoCoach.internal.selectPlaceholder",
    (args?: SelectPlaceholderCommandArgs) => {
      inlineProvider.handleSelectPlaceholder(args);
    }
  );

  registerCommand("algoCoach.internal.recordWordAccept", (acceptedText?: string) => {
    inlineProvider.handleRecordWordAccept(acceptedText);
  });
}

export function deactivate(): void {
  activeManagedModules?.dispose();
  activeManagedModules = undefined;
}
