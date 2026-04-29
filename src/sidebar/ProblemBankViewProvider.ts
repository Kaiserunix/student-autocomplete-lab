import * as path from "node:path";
import * as vscode from "vscode";
import { luoguSeedProblems } from "../problemBank/catalog";
import { fetchLuoguProblem } from "../problemBank/luoguClient";
import type { ProblemRecord } from "../problemBank/types";
import { appendJsonlRecord } from "../storage/jsonlStore";

type WebviewMessage =
  | { command: "importLuogu"; pid: string }
  | { command: "saveManual"; title: string; statement: string }
  | { command: "placeholder"; action: string };

export class ProblemBankViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "studentAutocomplete.problemBank";

  public constructor(private readonly context: vscode.ExtensionContext) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.html = this.renderHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      try {
        await this.handleMessage(message);
        webviewView.webview.postMessage({
          type: "status",
          text: "Saved."
        });
      } catch (error) {
        webviewView.webview.postMessage({
          type: "status",
          text: error instanceof Error ? error.message : String(error)
        });
      }
    });
  }

  private async handleMessage(message: WebviewMessage): Promise<void> {
    if (message.command === "importLuogu") {
      const problem = await fetchLuoguProblem(message.pid);
      await this.saveProblem(problem);
      return;
    }

    if (message.command === "saveManual") {
      const problem: ProblemRecord = {
        platform: "manual",
        id: `manual-${Date.now()}`,
        title: message.title.trim() || "Untitled Problem",
        tags: [],
        statement: message.statement,
        inputFormat: "",
        outputFormat: "",
        samples: []
      };
      await this.saveProblem(problem);
      return;
    }

    vscode.window.showInformationMessage(`Student Autocomplete: ${message.action} is planned for the next slice.`);
  }

  private async saveProblem(problem: ProblemRecord): Promise<void> {
    const storagePath = path.join(this.context.globalStorageUri.fsPath, "problems.jsonl");
    await appendJsonlRecord(storagePath, {
      ...problem,
      savedAt: new Date().toISOString()
    });
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = String(Date.now());
    const problems = luoguSeedProblems
      .map(
        (problem) => `
          <li>
            <button data-pid="${problem.id}" class="linkButton">Import</button>
            <a href="${problem.url}">${problem.id}</a>
            <span>${escapeHtml(problem.title)}</span>
          </li>`
      )
      .join("");

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      padding: 12px;
    }
    button {
      cursor: pointer;
    }
    textarea,
    input {
      box-sizing: border-box;
      margin: 4px 0 8px;
      width: 100%;
    }
    textarea {
      min-height: 160px;
      resize: vertical;
    }
    ul {
      list-style: none;
      padding: 0;
    }
    li {
      display: grid;
      grid-template-columns: auto auto 1fr;
      gap: 6px;
      margin: 6px 0;
      align-items: baseline;
    }
    a {
      color: var(--vscode-textLink-foreground);
    }
    .actions {
      display: grid;
      gap: 6px;
      grid-template-columns: 1fr 1fr;
      margin: 12px 0;
    }
    .linkButton {
      font-size: 11px;
    }
    #status {
      color: var(--vscode-descriptionForeground);
      min-height: 18px;
    }
  </style>
</head>
<body>
  <h2>Problem Bank</h2>
  <p id="status"></p>

  <h3>Luogu starter set</h3>
  <ul>${problems}</ul>

  <h3>Manual problem note</h3>
  <label>
    Title
    <input id="manualTitle" placeholder="Problem title">
  </label>
  <label>
    Statement
    <textarea id="manualStatement" placeholder="Paste problem statement here"></textarea>
  </label>
  <button id="saveManual">Save pasted problem</button>

  <div class="actions">
    <button data-action="Give me a hint">Give me a hint</button>
    <button data-action="More specific">More specific</button>
    <button data-action="Show answer / I give up">Show answer</button>
    <button data-action="Recommend next problem">Recommend next</button>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const status = document.getElementById("status");

    document.querySelectorAll("button[data-pid]").forEach((button) => {
      button.addEventListener("click", () => {
        status.textContent = "Importing " + button.dataset.pid + "...";
        vscode.postMessage({ command: "importLuogu", pid: button.dataset.pid });
      });
    });

    document.getElementById("saveManual").addEventListener("click", () => {
      vscode.postMessage({
        command: "saveManual",
        title: document.getElementById("manualTitle").value,
        statement: document.getElementById("manualStatement").value
      });
    });

    document.querySelectorAll("button[data-action]").forEach((button) => {
      button.addEventListener("click", () => {
        vscode.postMessage({ command: "placeholder", action: button.dataset.action });
      });
    });

    window.addEventListener("message", (event) => {
      if (event.data.type === "status") {
        status.textContent = event.data.text;
      }
    });
  </script>
</body>
</html>`;
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
