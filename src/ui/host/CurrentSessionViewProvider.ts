import * as vscode from "vscode";
import type { ProblemBankViewProvider } from "../../sidebar/ProblemBankViewProvider";
import type { WebviewMessage } from "../../sidebar/messageProtocol";
import { createWebviewNonce, renderCurrentSessionDocument } from "./currentSessionDocument";
import type {
  CurrentSessionHostCommand,
  CurrentSessionPhase,
  CurrentSessionViewModel
} from "../webview/currentSession/types";

const allowedCommands = new Set<CurrentSessionHostCommand["command"]>([
  "loadProblems",
  "importManualMarkdownFile",
  "requestAiCoach",
  "requestAutocompletePreview",
  "requestSolutionScore",
  "requestOptimizationReview",
  "requestSubmissionJudge",
  "archiveProblem"
]);

export class CurrentSessionViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
  public static readonly viewType = "studentAutocomplete.currentSession";

  private view: vscode.WebviewView | undefined;
  private selectedKey: string | undefined;
  private snapshot: CurrentSessionViewModel | undefined;
  private loadGeneration = 0;
  private readonly disposables: vscode.Disposable[] = [];

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly backend: ProblemBankViewProvider,
    private readonly onLibraryChanged: () => void
  ) {}

  public resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    const assetRoot = vscode.Uri.joinPath(
      this.context.extensionUri,
      "dist",
      "webview",
      "current-session"
    );
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [assetRoot]
    };
    view.webview.html = renderCurrentSessionDocument({
      cspSource: view.webview.cspSource,
      scriptUri: view.webview.asWebviewUri(vscode.Uri.joinPath(assetRoot, "current-session.js")).toString(),
      styleUri: view.webview.asWebviewUri(vscode.Uri.joinPath(assetRoot, "current-session.css")).toString(),
      nonce: createWebviewNonce(),
      language: "zh-CN"
    });

    this.disposables.push(
      view.webview.onDidReceiveMessage((message: unknown) => this.handleMessage(message)),
      view.onDidDispose(() => {
        this.view = undefined;
      })
    );
  }

  public async selectProblem(problemKey: string): Promise<void> {
    this.selectedKey = problemKey;
    this.view?.show?.(false);
    await this.refresh();
  }

  public async refresh(statusMessage?: string): Promise<void> {
    const generation = ++this.loadGeneration;
    const snapshot = await this.backend.loadCurrentSession(this.selectedKey, statusMessage);
    if (generation !== this.loadGeneration) {
      return;
    }
    this.selectedKey = snapshot.problem?.key ?? this.selectedKey;
    this.snapshot = snapshot;
    await this.view?.webview.postMessage({ type: "state.snapshot", state: snapshot });
  }

  public dispose(): void {
    for (const disposable of this.disposables.splice(0)) {
      disposable.dispose();
    }
  }

  private async handleMessage(value: unknown): Promise<void> {
    if (!isCurrentSessionCommand(value)) {
      await this.postError("当前学习视图收到了不支持的动作。");
      return;
    }
    if (value.command === "loadProblems") {
      await this.refresh();
      return;
    }

    this.postBusy(value.command);
    try {
      const result = await this.backend.executeMessage(value as WebviewMessage);
      const selectedKey = readString(result, "selectedKey");
      if (selectedKey) {
        this.selectedKey = selectedKey;
      }
      const status = readString(result, "status") ?? readString(result, "text");
      this.onLibraryChanged();
      await this.refresh(status);
    } catch (error) {
      await this.postError(error instanceof Error ? error.message : String(error));
    }
  }

  private postBusy(command: CurrentSessionHostCommand["command"]): void {
    if (!this.snapshot) {
      return;
    }
    const phase = busyPhase(command);
    const state: CurrentSessionViewModel = {
      ...this.snapshot,
      phase,
      currentFeedback: {
        kind: "progress",
        title: phase === "running" ? "正在检查当前代码" : "正在整理教练反馈",
        body: "草稿和已有时间线会保留。"
      },
      nowAction: {
        ...this.snapshot.nowAction,
        disabledReason: "当前动作正在进行"
      }
    };
    void this.view?.webview.postMessage({ type: "state.snapshot", state });
  }

  private async postError(message: string): Promise<void> {
    if (!this.snapshot) {
      await this.refresh(message);
      return;
    }
    const state: CurrentSessionViewModel = {
      ...this.snapshot,
      phase: "error",
      currentFeedback: {
        kind: "error",
        title: "当前动作未完成",
        body: message
      }
    };
    this.snapshot = state;
    await this.view?.webview.postMessage({ type: "state.snapshot", state });
  }
}

function isCurrentSessionCommand(value: unknown): value is CurrentSessionHostCommand {
  if (!value || typeof value !== "object" || !("command" in value)) {
    return false;
  }
  return allowedCommands.has((value as { command: CurrentSessionHostCommand["command"] }).command);
}

function busyPhase(command: CurrentSessionHostCommand["command"]): CurrentSessionPhase {
  return command === "requestSubmissionJudge" ||
    command === "requestSolutionScore" ||
    command === "requestAutocompletePreview"
    ? "running"
    : "coaching";
}

function readString(value: unknown, key: string): string | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}
