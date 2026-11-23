import { randomBytes } from "node:crypto";
import * as vscode from "vscode";
import type {
  HostToReaderMessage,
  ProblemReaderSnapshot,
  ReaderToHostMessage
} from "../core/contracts";

export interface ReaderWebviewHtmlParams {
  cspSource: string;
  scriptUri: string;
  styleUri: string;
  assetsUri?: string;
  nonce: string;
  title?: string;
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
 * Pure strict-CSP HTML shell generator for the side-by-side Problem Reader Editor WebviewPanel.
 */
export function buildReaderWebviewHtml(params: ReaderWebviewHtmlParams): string {
  const lang = params.uiLanguage === "en-US" ? "en" : "zh-CN";
  const pageTitle = escapeAttr(params.title ?? "Algo Coach Reader");
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
    `  <title>${pageTitle}</title>`,
    `  <link rel="stylesheet" href="${params.styleUri}">`,
    "</head>",
    '<body class="rd-page">',
    '  <div id="reader-app"></div>',
    `  <script nonce="${params.nonce}" src="${params.scriptUri}"></script>`,
    "</body>",
    "</html>"
  ].join("\n");
}

export interface ProblemReaderPanelDeps {
  extensionUri: vscode.Uri;
  onMessage: (message: ReaderToHostMessage) => Promise<void> | void;
}

/**
 * Manages the singleton split-screen Editor WebviewPanel for wide problem statement reading
 * side-by-side with the user's code editor.
 */
export class ProblemReaderPanel implements vscode.Disposable {
  public static readonly viewType = "algoCoach.problemReader";

  private panel: vscode.WebviewPanel | undefined;
  private readonly panelDisposables: vscode.Disposable[] = [];
  private latestSnapshot: ProblemReaderSnapshot | undefined;
  private dismissedByUser = false;
  private disposed = false;

  constructor(private readonly deps: ProblemReaderPanelDeps) {}

  isOpen(): boolean {
    return this.panel !== undefined && !this.disposed;
  }

  wasDismissedByUser(): boolean {
    return this.dismissedByUser;
  }

  openOrReveal(
    snapshot: ProblemReaderSnapshot,
    options?: { preserveFocus?: boolean; explicitUserAction?: boolean }
  ): void {
    if (this.disposed) {
      return;
    }
    if (options?.explicitUserAction) {
      this.dismissedByUser = false;
    }
    this.latestSnapshot = snapshot;

    const panelTitle = this.formatPanelTitle(snapshot);
    const preserveFocus = options?.preserveFocus ?? false;

    if (this.panel) {
      this.panel.title = panelTitle;
      this.panel.reveal(vscode.ViewColumn.Beside, preserveFocus);
      this.postMessage({ type: "reader/sync", payload: snapshot });
      return;
    }

    if (typeof vscode.window.createWebviewPanel !== "function") {
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      ProblemReaderPanel.viewType,
      panelTitle,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(this.deps.extensionUri, "dist"),
          vscode.Uri.joinPath(this.deps.extensionUri, "resources")
        ]
      }
    );

    this.panel = panel;
    const scriptUri = panel.webview
      .asWebviewUri(vscode.Uri.joinPath(this.deps.extensionUri, "dist", "reader.js"))
      .toString();
    const styleUri = panel.webview
      .asWebviewUri(vscode.Uri.joinPath(this.deps.extensionUri, "dist", "webview.css"))
      .toString();
    const assetsUri = panel.webview
      .asWebviewUri(vscode.Uri.joinPath(this.deps.extensionUri, "resources", "ui"))
      .toString();

    panel.webview.html = buildReaderWebviewHtml({
      cspSource: panel.webview.cspSource,
      scriptUri,
      styleUri,
      assetsUri,
      nonce: randomBytes(16).toString("hex"),
      title: panelTitle,
      uiLanguage: snapshot.uiLanguage
    });

    this.panelDisposables.push(
      panel.webview.onDidReceiveMessage((msg: unknown) => {
        if (msg && typeof msg === "object" && typeof (msg as { type?: unknown }).type === "string") {
          const typed = msg as ReaderToHostMessage;
          if (typed.type === "reader/ready" && this.latestSnapshot) {
            this.postMessage({ type: "reader/sync", payload: this.latestSnapshot });
            return;
          }
          void this.deps.onMessage(typed);
        }
      }),
      panel.onDidDispose(() => {
        if (this.panel === panel) {
          this.panel = undefined;
          if (!this.disposed) {
            this.dismissedByUser = true;
          }
        }
        this.disposePanelListeners();
      })
    );

    this.postMessage({ type: "reader/sync", payload: snapshot });
  }

  syncIfOpen(snapshot: ProblemReaderSnapshot): void {
    this.latestSnapshot = snapshot;
    if (!this.panel || this.disposed) {
      return;
    }
    this.panel.title = this.formatPanelTitle(snapshot);
    this.postMessage({ type: "reader/sync", payload: snapshot });
  }

  postToast(level: "info" | "warn" | "error", text: string): void {
    if (!this.panel || this.disposed) {
      return;
    }
    this.postMessage({ type: "toast/inline", payload: { level, text } });
  }

  private postMessage(message: HostToReaderMessage): void {
    if (!this.panel || this.disposed) {
      return;
    }
    void this.panel.webview.postMessage(message);
  }

  private formatPanelTitle(snapshot: ProblemReaderSnapshot): string {
    const p = snapshot.problem;
    if (!p) {
      return snapshot.uiLanguage === "en-US" ? "Algo Coach: Problem Reader" : "Algo Coach · 题面阅读";
    }
    const prefix = p.sourceId ? `${p.sourceId} · ` : "";
    const shortTitle = p.title.length > 36 ? `${p.title.slice(0, 35)}...` : p.title;
    return `${prefix}${shortTitle}`;
  }

  private disposePanelListeners(): void {
    for (const d of this.panelDisposables) {
      d.dispose();
    }
    this.panelDisposables.length = 0;
  }

  dispose(): void {
    this.disposed = true;
    this.disposePanelListeners();
    this.panel?.dispose();
    this.panel = undefined;
  }
}
