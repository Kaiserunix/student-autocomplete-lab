import { readFile } from "node:fs/promises";
import path from "node:path";
import * as vscode from "vscode";
import { OjConsoleService } from "./consoleService";
import { OjConsoleError } from "./contracts";

interface OjConsoleRequestMessage {
  type?: string;
  requestId?: string;
  path?: string;
  body?: unknown;
}

export class OjConsolePanel {
  public static readonly viewType = "studentAutocomplete.ojConsole";
  private static current: OjConsolePanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly service: OjConsoleService;
  private readonly disposables: vscode.Disposable[] = [];

  public static show(context: vscode.ExtensionContext): void {
    if (OjConsolePanel.current) {
      OjConsolePanel.current.panel.reveal();
      return;
    }
    const frontendRoot = vscode.Uri.joinPath(
      context.extensionUri,
      "prototypes",
      "oj-console",
      "frontend"
    );
    const panel = vscode.window.createWebviewPanel(
      OjConsolePanel.viewType,
      "OJ 提交控制台",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [frontendRoot]
      }
    );
    OjConsolePanel.current = new OjConsolePanel(panel, context, frontendRoot);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    context: vscode.ExtensionContext,
    frontendRoot: vscode.Uri
  ) {
    this.panel = panel;
    this.service = new OjConsoleService({
      runtimeRoot: path.join(context.globalStorageUri.fsPath, "oj-console"),
      onJobChange: (job) => {
        void this.panel.webview.postMessage({ type: "ojConsoleJob", job });
      }
    });
    void this.renderHtml(frontendRoot)
      .then((html) => {
        this.panel.webview.html = html;
      })
      .catch((error: unknown) => {
        vscode.window.showErrorMessage(
          `无法加载 OJ 提交控制台页面：${error instanceof Error ? error.message : String(error)}`
        );
      });
    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
    this.panel.webview.onDidReceiveMessage(
      (message: OjConsoleRequestMessage) => void this.handleRequest(message),
      null,
      this.disposables
    );
  }

  public dispose(): void {
    OjConsolePanel.current = undefined;
    this.panel.dispose();
    while (this.disposables.length > 0) {
      this.disposables.pop()?.dispose();
    }
  }

  private async renderHtml(frontendRoot: vscode.Uri): Promise<string> {
    const webview = this.panel.webview;
    const raw = await readFile(
      vscode.Uri.joinPath(frontendRoot, "index.html").fsPath,
      "utf8"
    );
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(frontendRoot, "styles.css"));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(frontendRoot, "app.js"));
    const csp = [
      "default-src 'none'",
      `img-src ${webview.cspSource} data:`,
      `style-src ${webview.cspSource}`,
      `script-src ${webview.cspSource}`
    ].join("; ");
    return raw
      .replace(
        "<meta name=\"viewport\"",
        `<meta http-equiv="Content-Security-Policy" content="${csp}">\n  <meta name="viewport"`
      )
      .replace("href=\"/styles.css\"", `href="${styleUri}"`)
      .replace("src=\"/app.js\"", `src="${scriptUri}"`)
      .replace("data-session-token=\"__OJ_CONSOLE_TOKEN__\"", "data-session-token=\"\"");
  }

  private async handleRequest(message: OjConsoleRequestMessage): Promise<void> {
    if (!message || message.type !== "ojConsoleRequest" || typeof message.requestId !== "string") {
      return;
    }
    try {
      const payload = await this.dispatch(message.path ?? "", message.body);
      await this.panel.webview.postMessage({
        type: "ojConsoleResponse",
        requestId: message.requestId,
        ok: true,
        payload
      });
    } catch (error) {
      const known = error instanceof OjConsoleError;
      await this.panel.webview.postMessage({
        type: "ojConsoleResponse",
        requestId: message.requestId,
        ok: false,
        error: {
          code: known ? error.code : "internal_error",
          message: known ? error.message : "本地 OJ 控制台发生内部错误。"
        }
      });
    }
  }

  private async dispatch(requestPath: string, body: unknown): Promise<unknown> {
    const payload = (body && typeof body === "object" && !Array.isArray(body)
      ? body
      : {}) as Record<string, unknown>;
    switch (requestPath) {
      case "/api/status":
        return this.service.getStatus();
      case "/api/source":
        return this.service.addSource(
          payload.fileName,
          decodeBase64Source(payload.contentBase64)
        );
      case "/api/preview":
        return this.service.createPreview(payload);
      case "/api/confirm":
        return this.service.confirm(payload);
      case "/api/real-mode/unlock":
        return this.service.unlockRealMode(payload);
      case "/api/login-terminal":
        return this.service.openLoginTerminal(payload);
      default: {
        const jobMatch = requestPath.match(/^\/api\/submissions\/([^/]+)$/);
        if (jobMatch) {
          return this.service.getJob(decodeURIComponent(jobMatch[1]));
        }
        throw new OjConsoleError("not_found", "找不到这个接口。", 404);
      }
    }
  }
}

function decodeBase64Source(value: unknown): Uint8Array {
  if (typeof value !== "string" || !value) {
    throw new OjConsoleError("invalid_request", "源码内容编码不正确。");
  }
  if (value.length > 1_500_000) {
    throw new OjConsoleError("source_too_large", "单个源码文件不能超过 1 MiB。", 413);
  }
  const bytes = Buffer.from(value, "base64");
  if (bytes.length === 0) {
    throw new OjConsoleError("invalid_request", "源码内容编码不正确。");
  }
  return bytes;
}
