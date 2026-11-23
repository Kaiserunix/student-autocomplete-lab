import { vi } from "vitest";

export class MockEventEmitter<T> {
  private readonly listeners = new Set<(e: T) => void>();

  readonly event = (listener: (e: T) => void) => {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      }
    };
  };

  fire(data: T): void {
    for (const listener of [...this.listeners]) {
      listener(data);
    }
  }

  listenerCount(): number {
    return this.listeners.size;
  }

  dispose(): void {
    this.listeners.clear();
  }
}

export class MockPosition {
  constructor(
    public readonly line: number,
    public readonly character: number
  ) {}
}

export class MockRange {
  constructor(
    public readonly start: MockPosition,
    public readonly end: MockPosition
  ) {}
}

export class MockSelection extends MockRange {
  constructor(
    public readonly anchor: MockPosition,
    public readonly active: MockPosition
  ) {
    super(anchor, active);
  }
}

export class MockUri {
  private constructor(
    public readonly scheme: string,
    public readonly fsPath: string,
    private readonly raw: string
  ) {}

  static file(fsPath: string): MockUri {
    const normalized = fsPath.replace(/\\/g, "/");
    return new MockUri("file", fsPath, `file://${normalized.startsWith("/") ? "" : "/"}${normalized}`);
  }

  static parse(value: string): MockUri {
    const scheme = value.split(":")[0] ?? "https";
    return new MockUri(scheme, value, value);
  }

  static joinPath(base: MockUri, ...segments: string[]): MockUri {
    const joined = [base.fsPath.replace(/[\\/]+$/, ""), ...segments].join("/");
    return MockUri.file(joined);
  }

  toString(): string {
    return this.raw;
  }
}

export class MockInlineCompletionItem {
  public command?: { command: string; title: string; arguments?: unknown[] };
  constructor(
    public readonly insertText: string,
    public readonly range?: MockRange
  ) {}
}

export interface MockTextDocument {
  uri: MockUri;
  languageId: string;
  isClosed: boolean;
  lineCount: number;
  getText(range?: MockRange): string;
  offsetAt(position: MockPosition): number;
  lineAt(line: number): { text: string };
}

export function createMockTextDocument(params: {
  fsPath: string;
  languageId: string;
  content: string;
}): MockTextDocument {
  const lines = params.content.replace(/\r\n/g, "\n").split("\n");
  const uri = MockUri.file(params.fsPath);

  const offsetAt = (pos: MockPosition): number => {
    let offset = 0;
    for (let i = 0; i < pos.line && i < lines.length; i += 1) {
      offset += (lines[i]?.length ?? 0) + 1;
    }
    return Math.min(params.content.length, offset + pos.character);
  };

  return {
    uri,
    languageId: params.languageId,
    isClosed: false,
    lineCount: lines.length,
    getText(range?: MockRange): string {
      if (!range) {
        return params.content;
      }
      const start = offsetAt(range.start);
      const end = offsetAt(range.end);
      return params.content.slice(start, end);
    },
    offsetAt,
    lineAt(line: number): { text: string } {
      return { text: lines[line] ?? "" };
    }
  };
}

export interface MockTextEditor {
  document: MockTextDocument;
  selection: MockSelection;
  revealRange: ReturnType<typeof vi.fn>;
}

export function createMockTextEditor(doc: MockTextDocument): MockTextEditor {
  return {
    document: doc,
    selection: new MockSelection(new MockPosition(0, 0), new MockPosition(0, 0)),
    revealRange: vi.fn()
  };
}

export interface MockStatusBarItem {
  alignment: number;
  priority?: number;
  name?: string;
  text: string;
  tooltip?: string;
  command?: string;
  visible: boolean;
  disposed: boolean;
  show: () => void;
  hide: () => void;
  dispose: () => void;
}

export function createMockVscodeState() {
  const globalConfig = new Map<string, unknown>();
  const workspaceConfig = new Map<string, unknown>();
  const registeredCommands = new Map<string, (...args: unknown[]) => unknown>();
  const executedCommands: Array<{ command: string; args: unknown[] }> = [];
  const statusBarItems: MockStatusBarItem[] = [];
  const webviewProviders = new Map<
    string,
    { provider: unknown; options?: { webviewOptions?: { retainContextWhenHidden?: boolean } } }
  >();
  const webviewPanels: Array<{
    viewType: string;
    title: string;
    showOptions: unknown;
    options: unknown;
    disposed: boolean;
    revealCalls: Array<{ viewColumn?: number; preserveFocus?: boolean }>;
    postedMessages: unknown[];
    webview: {
      cspSource: string;
      html: string;
      asWebviewUri: (u: MockUri) => MockUri;
      postMessage: ReturnType<typeof vi.fn>;
      onDidReceiveMessage: (listener: (msg: unknown) => void) => { dispose: () => void };
    };
    onDidDispose: (listener: () => void) => { dispose: () => void };
    reveal: (viewColumn?: number, preserveFocus?: boolean) => void;
    dispose: () => void;
    emitMessage: (msg: unknown) => void;
  }> = [];
  const inlineProviders: Array<{ selector: unknown; provider: unknown; disposed: boolean }> = [];
  const openedExternalUrls: string[] = [];
  let clipboardText = "";
  let activeTextEditor: MockTextEditor | undefined;
  let workspaceFolders: Array<{ uri: MockUri; name: string; index: number }> = [];
  const diagnosticsByUri = new Map<string, Array<{ severity: number; message: string }>>();

  const onDidChangeActiveTextEditor = new MockEventEmitter<MockTextEditor | undefined>();
  const onDidCloseTextDocument = new MockEventEmitter<MockTextDocument>();
  const onDidChangeTextDocument = new MockEventEmitter<unknown>();
  const onDidChangeConfiguration = new MockEventEmitter<{
    affectsConfiguration: (section: string) => boolean;
  }>();
  const onDidChangeWindowState = new MockEventEmitter<{ focused: boolean }>();
  const onDidChangeDiagnostics = new MockEventEmitter<{ uris: MockUri[] }>();

  const showQuickPick = vi.fn();
  const showInputBox = vi.fn();
  const showInformationMessage = vi.fn();
  const showWarningMessage = vi.fn();
  const showErrorMessage = vi.fn();
  const openTextDocument = vi.fn(async (uri: MockUri) => {
    const fs = await import("node:fs/promises");
    let content = "";
    try {
      content = await fs.readFile(uri.fsPath, "utf8");
    } catch {
      content = "";
    }
    const lower = uri.fsPath.toLowerCase();
    const languageId = lower.endsWith(".py")
      ? "python"
      : lower.endsWith(".cpp")
        ? "cpp"
        : lower.endsWith(".rs")
          ? "rust"
          : lower.endsWith(".java")
            ? "java"
            : lower.endsWith(".c")
              ? "c"
              : "plaintext";
    return createMockTextDocument({ fsPath: uri.fsPath, languageId, content });
  });
  const showTextDocument = vi.fn(async (doc: MockTextDocument) => {
    const editor = createMockTextEditor(doc);
    activeTextEditor = editor;
    onDidChangeActiveTextEditor.fire(editor);
    return editor;
  });

  const ConfigurationTarget = {
    Global: 1,
    Workspace: 2,
    WorkspaceFolder: 3
  };

  const StatusBarAlignment = {
    Left: 1,
    Right: 2
  };

  const InlineCompletionTriggerKind = {
    Invoke: 0,
    Automatic: 1
  };

  const DiagnosticSeverity = {
    Error: 0,
    Warning: 1,
    Information: 2,
    Hint: 3
  };

  const TextDocumentChangeReason = {
    Undo: 1,
    Redo: 2
  };

  const ViewColumn = {
    Active: -1,
    Beside: -2,
    One: 1,
    Two: 2,
    Three: 3
  };

  const vscodeMock = {
    Uri: MockUri,
    Position: MockPosition,
    Range: MockRange,
    Selection: MockSelection,
    InlineCompletionItem: MockInlineCompletionItem,
    ConfigurationTarget,
    StatusBarAlignment,
    InlineCompletionTriggerKind,
    DiagnosticSeverity,
    TextDocumentChangeReason,
    ViewColumn,
    workspace: {
      get workspaceFolders() {
        return workspaceFolders.length > 0 ? workspaceFolders : undefined;
      },
      getConfiguration() {
        return {
          get<T>(key: string, defaultValue?: T): T | undefined {
            if (workspaceConfig.has(key)) return workspaceConfig.get(key) as T;
            if (globalConfig.has(key)) return globalConfig.get(key) as T;
            return defaultValue;
          },
          inspect<T>(key: string) {
            return {
              key,
              defaultValue: undefined as T | undefined,
              globalValue: globalConfig.get(key) as T | undefined,
              workspaceValue: workspaceConfig.get(key) as T | undefined,
              workspaceFolderValue: undefined as T | undefined
            };
          },
          async update(key: string, value: unknown, target?: number) {
            const store = target === ConfigurationTarget.Workspace ? workspaceConfig : globalConfig;
            if (value === undefined) {
              store.delete(key);
            } else {
              store.set(key, value);
            }
          }
        };
      },
      openTextDocument,
      onDidCloseTextDocument: onDidCloseTextDocument.event,
      onDidChangeTextDocument: onDidChangeTextDocument.event,
      onDidChangeConfiguration: onDidChangeConfiguration.event
    },
    window: {
      get activeTextEditor() {
        return activeTextEditor;
      },
      state: { focused: true },
      createStatusBarItem(alignment: number, priority?: number): MockStatusBarItem {
        const item: MockStatusBarItem = {
          alignment,
          priority,
          text: "",
          visible: false,
          disposed: false,
          show() {
            item.visible = true;
          },
          hide() {
            item.visible = false;
          },
          dispose() {
            item.disposed = true;
            item.visible = false;
          }
        };
        statusBarItems.push(item);
        return item;
      },
      registerWebviewViewProvider(
        viewId: string,
        provider: unknown,
        options?: { webviewOptions?: { retainContextWhenHidden?: boolean } }
      ) {
        webviewProviders.set(viewId, { provider, options });
        return {
          dispose: () => {
            webviewProviders.delete(viewId);
          }
        };
      },
      createWebviewPanel(viewType: string, title: string, showOptions: unknown, options?: unknown) {
        const msgEmitter = new MockEventEmitter<unknown>();
        const disposeEmitter = new MockEventEmitter<void>();
        const postedMessages: unknown[] = [];
        const revealCalls: Array<{ viewColumn?: number; preserveFocus?: boolean }> = [];
        const panel = {
          viewType,
          title,
          showOptions,
          options,
          disposed: false,
          revealCalls,
          postedMessages,
          webview: {
            cspSource: "vscode-webview://panel-test",
            html: "",
            asWebviewUri: (u: MockUri) => u,
            postMessage: vi.fn(async (msg: unknown) => {
              postedMessages.push(msg);
              return true;
            }),
            onDidReceiveMessage: msgEmitter.event
          },
          onDidDispose: disposeEmitter.event,
          reveal(viewColumn?: number, preserveFocus?: boolean) {
            revealCalls.push({ viewColumn, preserveFocus });
          },
          dispose() {
            if (panel.disposed) return;
            panel.disposed = true;
            disposeEmitter.fire();
            msgEmitter.dispose();
            disposeEmitter.dispose();
          },
          emitMessage(msg: unknown) {
            msgEmitter.fire(msg);
          }
        };
        webviewPanels.push(panel);
        return panel;
      },
      showTextDocument,
      showQuickPick,
      showInputBox,
      showInformationMessage,
      showWarningMessage,
      showErrorMessage,
      onDidChangeActiveTextEditor: onDidChangeActiveTextEditor.event,
      onDidChangeWindowState: onDidChangeWindowState.event
    },
    commands: {
      registerCommand(command: string, callback: (...args: unknown[]) => unknown) {
        registeredCommands.set(command, callback);
        return {
          dispose: () => {
            registeredCommands.delete(command);
          }
        };
      },
      async executeCommand(command: string, ...args: unknown[]) {
        executedCommands.push({ command, args });
        const fn = registeredCommands.get(command);
        if (fn) {
          return await fn(...args);
        }
        return undefined;
      }
    },
    languages: {
      registerInlineCompletionItemProvider(selector: unknown, provider: unknown) {
        const entry = { selector, provider, disposed: false };
        inlineProviders.push(entry);
        return {
          dispose: () => {
            entry.disposed = true;
          }
        };
      },
      onDidChangeDiagnostics: onDidChangeDiagnostics.event,
      getDiagnostics(uri: MockUri) {
        return diagnosticsByUri.get(uri.toString()) ?? [];
      }
    },
    env: {
      clipboard: {
        async writeText(text: string) {
          clipboardText = text;
        },
        async readText() {
          return clipboardText;
        }
      },
      async openExternal(uri: MockUri) {
        openedExternalUrls.push(uri.toString());
        return true;
      }
    }
  };

  const reset = () => {
    globalConfig.clear();
    workspaceConfig.clear();
    registeredCommands.clear();
    executedCommands.length = 0;
    statusBarItems.length = 0;
    webviewProviders.clear();
    webviewPanels.length = 0;
    inlineProviders.length = 0;
    openedExternalUrls.length = 0;
    clipboardText = "";
    activeTextEditor = undefined;
    workspaceFolders = [];
    diagnosticsByUri.clear();
    vscodeMock.window.state.focused = true;
    showQuickPick.mockReset();
    showInputBox.mockReset();
    showInformationMessage.mockReset();
    showWarningMessage.mockReset();
    showErrorMessage.mockReset();
    openTextDocument.mockClear();
    showTextDocument.mockClear();
  };

  return {
    vscodeMock,
    globalConfig,
    workspaceConfig,
    registeredCommands,
    executedCommands,
    statusBarItems,
    webviewProviders,
    webviewPanels,
    inlineProviders,
    openedExternalUrls,
    diagnosticsByUri,
    getClipboard: () => clipboardText,
    setClipboard: (v: string) => {
      clipboardText = v;
    },
    setActiveTextEditor: (editor: MockTextEditor | undefined) => {
      activeTextEditor = editor;
      onDidChangeActiveTextEditor.fire(editor);
    },
    setWorkspaceFolders: (paths: string[]) => {
      workspaceFolders = paths.map((p, idx) => ({
        uri: MockUri.file(p),
        name: `folder-${idx}`,
        index: idx
      }));
    },
    emitTextDocumentChange: (event: unknown) => onDidChangeTextDocument.fire(event),
    emitConfigurationChange: (sectionPrefix: string) =>
      onDidChangeConfiguration.fire({
        affectsConfiguration: (s: string) => s === sectionPrefix || sectionPrefix.startsWith(`${s}.`) || s.startsWith(`${sectionPrefix}.`)
      }),
    emitWindowStateChange: (focused: boolean) => {
      vscodeMock.window.state.focused = focused;
      onDidChangeWindowState.fire({ focused });
    },
    emitDiagnosticsChange: (uris: MockUri[]) => onDidChangeDiagnostics.fire({ uris }),
    reset
  };
}

export function createMockExtensionContext(storageDir: string, extensionDir: string) {
  const globalStateMap = new Map<string, unknown>();
  const secretsMap = new Map<string, string>();
  const subscriptions: Array<{ dispose(): unknown }> = [];

  return {
    subscriptions,
    extensionUri: MockUri.file(extensionDir),
    globalStorageUri: MockUri.file(storageDir),
    globalState: {
      keys: () => Array.from(globalStateMap.keys()),
      get<T>(key: string, defaultValue?: T): T | undefined {
        return globalStateMap.has(key) ? (globalStateMap.get(key) as T) : defaultValue;
      },
      async update(key: string, value: unknown) {
        if (value === undefined) {
          globalStateMap.delete(key);
        } else {
          globalStateMap.set(key, value);
        }
      },
      setKeysForSync: () => undefined
    },
    secrets: {
      async get(key: string) {
        return secretsMap.get(key);
      },
      async store(key: string, value: string) {
        secretsMap.set(key, value);
      },
      async delete(key: string) {
        secretsMap.delete(key);
      },
      onDidChange: new MockEventEmitter<{ key: string }>().event
    },
    _globalStateMap: globalStateMap,
    _secretsMap: secretsMap
  };
}
