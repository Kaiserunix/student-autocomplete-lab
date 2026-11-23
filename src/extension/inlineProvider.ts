import * as vscode from "vscode";
import type { AutocompleteCodeHabit, FeatureFlags } from "../core/contracts";
import type { ModelRouter } from "../core/ai";
import {
  extractPlaceholderRanges,
  prepareInlineCompletionRequest,
  runInlineCompletionPipeline,
  type PlaceholderRange,
  type RenderedAutocompleteRequest,
  type TriggerSignalTracker
} from "../core/autocomplete";
import { mapVscodeLanguageId } from "./vscodeAdapters";

export const INLINE_COMPLETION_LANGUAGES = [
  "python",
  "cpp",
  "c",
  "rust",
  "java"
] as const;

export interface SelectPlaceholderCommandArgs {
  documentUri: string;
  insertLine: number;
  insertCharacter: number;
  suggestion: string;
  placeholder?: PlaceholderRange;
  shownAtMs: number;
}

export interface GhostTextAcceptedEvent {
  text: string;
  shownAtMs: number;
  acceptedAtMs: number;
  mode: "full" | "word";
  hadManualEditSinceLastAccept: boolean;
}

export interface AlgoCoachInlineProviderOptions {
  getFlags: () => FeatureFlags;
  getModelRouter: () => ModelRouter;
  getCodeHabits: () => readonly AutocompleteCodeHabit[];
  triggerTracker: TriggerSignalTracker;
  onGhostTextAccepted?: (event: GhostTextAcceptedEvent) => void;
  now?: () => number;
}

const MAX_DOCUMENT_PREFIX_CHARS = 6_000;
const MAX_DOCUMENT_SUFFIX_CHARS = 3_000;

const ACTIVE_FUNC_PATTERNS: readonly RegExp[] = [
  /\bdef\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
  /\bfn\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/,
  /(?:public|private|protected|static|inline|virtual|constexpr)?\s*(?:[\w:<>&*\[\]]+\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*\([^;{}]*\)\s*(?:const)?\s*\{/
];

function inferActiveFunctionName(prefix: string): string | undefined {
  const lines = prefix.split(/\r?\n/);
  const start = Math.max(0, lines.length - 40);
  for (let i = lines.length - 1; i >= start; i -= 1) {
    const line = lines[i] ?? "";
    for (const pattern of ACTIVE_FUNC_PATTERNS) {
      const match = line.match(pattern);
      if (match?.[1] && !/^(?:if|for|while|switch|catch)$/.test(match[1])) {
        if (match[1] === "solve" && /^\s*(?:async\s+)?def\s+solve\s*\(\s*\)/.test(line)) {
          return "main";
        }
        return match[1];
      }
    }
  }
  return undefined;
}

function sleepWithCancellation(ms: number, token: vscode.CancellationToken): Promise<boolean> {
  if (ms <= 0) {
    return Promise.resolve(!token.isCancellationRequested);
  }
  return new Promise<boolean>((resolve) => {
    if (token.isCancellationRequested) {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      sub.dispose();
      resolve(true);
    }, ms);
    const sub = token.onCancellationRequested(() => {
      clearTimeout(timer);
      sub.dispose();
      resolve(false);
    });
  });
}

/**
 * Keeps the `algoCoach.strictWordAccept` VS Code context key synchronized with FeatureFlags
 * so `Tab` conditionally routes to `editor.action.inlineSuggest.acceptNextWord`.
 */
export async function syncStrictWordAcceptContext(strictWordAccept: boolean): Promise<void> {
  await vscode.commands.executeCommand(
    "setContext",
    "algoCoach.strictWordAccept",
    Boolean(strictWordAccept)
  );
}

/**
 * Thin VS Code InlineCompletionItemProvider delegating 100% of anti-spoiler classification,
 * physical context isolation, trigger cadence, and output filtering to `src/core/autocomplete`.
 *
 * Strictly emits plain-text `InlineCompletionItem` (never `SnippetString`) and selects
 * fill-in-the-blank placeholders via `algoCoach.internal.selectPlaceholder` to avoid
 * VS Code SnippetString Bug #272709.
 */
export class AlgoCoachInlineCompletionProvider
  implements vscode.InlineCompletionItemProvider, vscode.Disposable
{
  private readonly getFlags: () => FeatureFlags;
  private readonly getModelRouter: () => ModelRouter;
  private readonly getCodeHabits: () => readonly AutocompleteCodeHabit[];
  private readonly triggerTracker: TriggerSignalTracker;
  private readonly onGhostTextAccepted?: (event: GhostTextAcceptedEvent) => void;
  private readonly now: () => number;

  private activeAbortController: AbortController | undefined;
  private hadManualEditSinceLastAccept = true;
  private lastShownSuggestion:
    | {
        documentUri: string;
        text: string;
        shownAtMs: number;
      }
    | undefined;
  private disposed = false;

  constructor(options: AlgoCoachInlineProviderOptions) {
    this.getFlags = options.getFlags;
    this.getModelRouter = options.getModelRouter;
    this.getCodeHabits = options.getCodeHabits;
    this.triggerTracker = options.triggerTracker;
    this.onGhostTextAccepted = options.onGhostTextAccepted;
    this.now = options.now ?? (() => Date.now());
  }

  /**
   * Called by the host document edit listener when the learner performs a real manual edit.
   */
  notifyManualEdit(): void {
    this.hadManualEditSinceLastAccept = true;
    this.triggerTracker.recordManualEditAfterAccept();
  }

  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
    token: vscode.CancellationToken
  ): Promise<vscode.InlineCompletionItem[]> {
    if (this.disposed || token.isCancellationRequested) {
      return [];
    }

    const flags = this.getFlags();
    if (flags.ghostTextMode === "off") {
      return [];
    }

    const language = mapVscodeLanguageId(document.languageId, document.uri.fsPath);
    if (language === "generic") {
      return [];
    }

    const fullText = document.getText();
    const cursorOffset = document.offsetAt(position);
    const prefixStart = Math.max(0, cursorOffset - MAX_DOCUMENT_PREFIX_CHARS);
    const suffixEnd = Math.min(fullText.length, cursorOffset + MAX_DOCUMENT_SUFFIX_CHARS);
    const prefix = fullText.slice(prefixStart, cursorOffset);
    const suffix = fullText.slice(cursorOffset, suffixEnd);

    const triggerKind =
      context.triggerKind === vscode.InlineCompletionTriggerKind.Invoke
        ? "manual"
        : "automatic";

    const router = this.getModelRouter();
    if (!router.isRoleReady("fim") || token.isCancellationRequested) {
      return [];
    }

    const fimRoute = router.describeRoute("fim");
    const activeFunctionName = inferActiveFunctionName(prefix);
    const nowMs = this.now();

    // Physically isolated autocomplete input: strictly editor code + sanitized code habits only
    const isolatedInput = {
      mode: flags.ghostTextMode,
      triggerKind,
      context: {
        language,
        prefix,
        suffix,
        codeHabits: this.getCodeHabits()
      },
      signals: this.triggerTracker.snapshot(nowMs),
      activeFunctionName,
      renderer: fimRoute.renderer,
      nowMs
    } as const;

    // 1. Pre-flight check before debounce or network invocation
    const prepared = prepareInlineCompletionRequest(isolatedInput);
    if (!prepared.shouldInvokeTransport) {
      return [];
    }

    // 2. Adaptive debounce wait for automatic triggers (cancelled immediately on new keystrokes)
    if (triggerKind === "automatic" && prepared.trigger.debounceMs > 0) {
      const stillValid = await sleepWithCancellation(prepared.trigger.debounceMs, token);
      if (!stillValid || this.disposed) {
        return [];
      }
    }

    if (!router.isRoleReady("fim") || token.isCancellationRequested) {
      return [];
    }

    // Cancel any previous superseded in-flight FIM request
    this.activeAbortController?.abort();
    const abortController = new AbortController();
    this.activeAbortController = abortController;
    const cancelSub = token.onCancellationRequested(() => {
      abortController.abort();
    });

    try {
      const result = await runInlineCompletionPipeline({
        ...isolatedInput,
        precomputed: prepared,
        signal: abortController.signal,
        transport: async (renderedRequest, signal) =>
          this.invokeFimTransport(router, renderedRequest, signal)
      });

      if (
        this.disposed ||
        token.isCancellationRequested ||
        result.status !== "accepted" ||
        !result.suggestion
      ) {
        return [];
      }

      // Extract plain-text placeholder ranges (zero SnippetString usage -> avoids Bug #272709)
      const placeholders = extractPlaceholderRanges(result.suggestion);
      const primaryPlaceholder = placeholders[0];
      const shownAtMs = this.now();

      this.lastShownSuggestion = {
        documentUri: document.uri.toString(),
        text: result.suggestion,
        shownAtMs
      };

      const item = new vscode.InlineCompletionItem(
        result.suggestion,
        new vscode.Range(position, position)
      );

      const args: SelectPlaceholderCommandArgs = {
        documentUri: document.uri.toString(),
        insertLine: position.line,
        insertCharacter: position.character,
        suggestion: result.suggestion,
        ...(primaryPlaceholder ? { placeholder: primaryPlaceholder } : {}),
        shownAtMs
      };

      item.command = {
        command: "algoCoach.internal.selectPlaceholder",
        title: "Select Ghost Text Placeholder",
        arguments: [args]
      };

      return [item];
    } finally {
      cancelSub.dispose();
      if (this.activeAbortController === abortController) {
        this.activeAbortController = undefined;
      }
    }
  }

  /**
   * Command handler for `algoCoach.internal.selectPlaceholder`:
   * 1. Feeds acceptance telemetry & timing into `TriggerSignalTracker` and `StylishRankEngine`.
   * 2. Highlights the first plain-text placeholder (e.g. `/* 条件 *\/`) so the student can type immediately.
   */
  handleSelectPlaceholder(args?: SelectPlaceholderCommandArgs): void {
    const acceptedAtMs = this.now();
    const suggestion = args?.suggestion ?? this.lastShownSuggestion?.text ?? "";
    const shownAtMs = args?.shownAtMs ?? this.lastShownSuggestion?.shownAtMs ?? acceptedAtMs;

    if (suggestion.length > 0) {
      const hadManualEdit = this.hadManualEditSinceLastAccept;
      this.hadManualEditSinceLastAccept = false;
      this.triggerTracker.recordGhostTextAccept(acceptedAtMs, {
        unmodifiedFullBlock: true
      });
      this.onGhostTextAccepted?.({
        text: suggestion,
        shownAtMs,
        acceptedAtMs,
        mode: "full",
        hadManualEditSinceLastAccept: hadManualEdit
      });
    }

    const placeholder = args?.placeholder;
    if (!placeholder) {
      return;
    }

    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
      return;
    }
    if (args?.documentUri && activeEditor.document.uri.toString() !== args.documentUri) {
      return;
    }

    const targetLine = args.insertLine + placeholder.line;
    if (targetLine < 0 || targetLine >= activeEditor.document.lineCount) {
      return;
    }

    const expectedStartChar =
      placeholder.line === 0
        ? args.insertCharacter + placeholder.startCharacter
        : placeholder.startCharacter;
    const expectedEndChar =
      placeholder.line === 0
        ? args.insertCharacter + placeholder.endCharacter
        : placeholder.endCharacter;

    let startPos = new vscode.Position(targetLine, Math.max(0, expectedStartChar));
    let endPos = new vscode.Position(targetLine, Math.max(0, expectedEndChar));
    let candidateRange = new vscode.Range(startPos, endPos);

    // Fallback when VS Code auto-indentation shifted leading whitespace on multi-line inserts
    if (activeEditor.document.getText(candidateRange) !== placeholder.text) {
      const lineText = activeEditor.document.lineAt(targetLine).text;
      const foundIdx = lineText.indexOf(placeholder.text);
      if (foundIdx === -1) {
        return;
      }
      startPos = new vscode.Position(targetLine, foundIdx);
      endPos = new vscode.Position(targetLine, foundIdx + placeholder.text.length);
      candidateRange = new vscode.Range(startPos, endPos);
    }

    activeEditor.selection = new vscode.Selection(startPos, endPos);
    activeEditor.revealRange(candidateRange);
  }

  /**
   * Command handler for `algoCoach.internal.recordWordAccept`:
   * Records deliberate word-by-word acceptance (+8 pts in StylishRankEngine, resets blind-accept streak).
   */
  handleRecordWordAccept(acceptedText?: string): void {
    const acceptedAtMs = this.now();
    const text =
      typeof acceptedText === "string" && acceptedText.length > 0
        ? acceptedText
        : this.lastShownSuggestion?.text.split(/\s+/)[0] ?? "word";
    const shownAtMs = this.lastShownSuggestion?.shownAtMs ?? acceptedAtMs;
    const hadManualEdit = this.hadManualEditSinceLastAccept;

    this.triggerTracker.recordGhostTextAccept(acceptedAtMs, {
      unmodifiedFullBlock: false
    });
    this.onGhostTextAccepted?.({
      text,
      shownAtMs,
      acceptedAtMs,
      mode: "word",
      hadManualEditSinceLastAccept: hadManualEdit
    });
  }

  private async invokeFimTransport(
    router: ModelRouter,
    renderedRequest: RenderedAutocompleteRequest,
    signal?: AbortSignal
  ): Promise<string> {
    switch (renderedRequest.renderer) {
      case "deepseek-fim": {
        const res = await router.completeFim({
          prefix: renderedRequest.payload.prompt,
          suffix: renderedRequest.payload.suffix,
          maxTokens: renderedRequest.payload.maxTokens,
          stop: renderedRequest.payload.stop,
          temperature: 0,
          signal
        });
        return res.text;
      }
      case "generic-completion": {
        const res = await router.completeFim({
          prefix: renderedRequest.payload.prompt,
          maxTokens: renderedRequest.payload.maxTokens,
          stop: renderedRequest.payload.stop,
          temperature: 0,
          signal
        });
        return res.text;
      }
      case "anthropic-messages": {
        const combinedPrefix = [
          renderedRequest.payload.system,
          ...renderedRequest.payload.messages.map((m) => m.content)
        ]
          .filter(Boolean)
          .join("\n\n");
        const res = await router.completeFim({
          prefix: combinedPrefix,
          maxTokens: renderedRequest.payload.maxTokens ?? 64,
          stop: renderedRequest.payload.stopSequences,
          temperature: 0,
          signal
        });
        return res.text;
      }
      case "chat-messages": {
        const combinedPrefix = renderedRequest.payload.messages.map((m) => m.content).join("\n\n");
        const res = await router.completeFim({
          prefix: combinedPrefix,
          maxTokens: renderedRequest.payload.maxTokens ?? 64,
          stop: renderedRequest.payload.stop,
          temperature: 0,
          signal
        });
        return res.text;
      }
    }
  }

  dispose(): void {
    this.disposed = true;
    this.activeAbortController?.abort();
    this.activeAbortController = undefined;
  }
}
