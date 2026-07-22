import * as path from "node:path";
import * as vscode from "vscode";
import { loadModelEnvFromVsCode } from "../config/vscodeModelEnv";
import { routeAutocompleteModel } from "../models/modelRouter";
import type { ModelTextTransport } from "../models/modelTextTransport";
import type { StudentSkill } from "../teaching/studentSkill";
import { buildAutocompleteInputFromText } from "./context";
import { inlineCompletionPresentation } from "./inlineCompletionPresentation";
import { requestMimoAutocompleteDetailed } from "./mimoAutocomplete";
import { AutocompleteRequestGate } from "./requestGate";
import { isSupportedAutocompleteLanguage, shouldRequestInlineCompletion } from "./triggerPolicy";

export interface InlineCompletionEvent {
  type: "request" | "success" | "empty" | "rejected" | "error";
  message: string;
}

interface InlineCompletionProviderOptions {
  extensionContext: vscode.ExtensionContext;
  onEvent?: (event: InlineCompletionEvent) => void;
  minAutomaticIntervalMs?: number;
  automaticDebounceMs?: number;
  cacheTtlMs?: number;
  oauthTransport: ModelTextTransport;
  loadStudentSkill: () => Promise<StudentSkill>;
}

export function createMimoInlineCompletionProvider(
  options: InlineCompletionProviderOptions
): vscode.InlineCompletionItemProvider {
  const requestGate = new AutocompleteRequestGate({
    minAutomaticIntervalMs: options.minAutomaticIntervalMs ?? 0,
    cacheTtlMs: options.cacheTtlMs
  });
  const automaticDebounceMs = options.automaticDebounceMs ?? 350;

  async function loadRoute() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("Open a workspace folder before using Student Autocomplete inline completion.");
    }

    const envPath = path.join(workspaceFolder.uri.fsPath, "secrets", "models.env");
    return routeAutocompleteModel(
      await loadModelEnvFromVsCode(options.extensionContext, envPath),
      options.oauthTransport
    );
  }

  return {
    async provideInlineCompletionItems(document, position, context, token): Promise<vscode.InlineCompletionItem[]> {
      if (!isSupportedAutocompleteLanguage(document.languageId)) {
        return [];
      }
      if (token.isCancellationRequested) {
        return [];
      }

      const lineText = document.lineAt(position.line).text;
      const linePrefix = lineText.slice(0, position.character);
      const isExplicit = context?.triggerKind === vscode.InlineCompletionTriggerKind.Invoke;
      if (!shouldRequestInlineCompletion(linePrefix, { languageId: document.languageId, explicit: isExplicit })) {
        return [];
      }

      const requestKey = [
        document.uri.toString(),
        document.version,
        position.line,
        position.character,
        linePrefix
      ].join(":");
      const cached = requestGate.cachedSuggestion(requestKey);
      if (cached) {
        const item = inlineCompletionItem(cached.suggestion, lineText, linePrefix, position, context);
        return item ? [item] : [];
      }

      if (!isExplicit && !await waitUnlessCancelled(automaticDebounceMs, token)) {
        return [];
      }
      if (!await waitForRequestSlot(requestGate, isExplicit, token)) {
        return [];
      }
      const abortController = new AbortController();
      const cancellationSubscription = token.onCancellationRequested(() => abortController.abort());
      if (token.isCancellationRequested) {
        abortController.abort();
      }
      try {
        options.onEvent?.({
          type: "request",
          message: `${document.languageId} line ${position.line + 1}`
        });
        if (token?.isCancellationRequested) {
          return [];
        }
        const route = await loadRoute();
        const studentSkill = await options.loadStudentSkill();
        const offset = document.offsetAt(position);
        const input = buildAutocompleteInputFromText({
          text: document.getText(),
          offset,
          language: document.languageId,
          filePath: document.uri.fsPath
        });
        if (!input.prefix.trim()) {
          options.onEvent?.({
            type: "empty",
            message: "No student code context remained after autocomplete safety filtering."
          });
          return [];
        }
        const result = await requestMimoAutocompleteDetailed(route.config, {
          ...input,
          studentSkill: studentSkill,
          capabilities: route.capabilities,
          signal: abortController.signal
        });

        if (token.isCancellationRequested) {
          return [];
        }
        if (result.status === "model-empty") {
          options.onEvent?.({
            type: "empty",
            message: "The autocomplete model returned no continuation."
          });
          return [];
        }
        if (result.status === "validator-rejected") {
          options.onEvent?.({
            type: "rejected",
            message: "Autocomplete output rejected by policy: " +
              (result.rejectionReason ?? "unknown")
          });
          return [];
        }

        requestGate.completeSuccess(requestKey, result.suggestion);
        const item = inlineCompletionItem(result.suggestion, lineText, linePrefix, position, context);
        if (!item) {
          options.onEvent?.({
            type: "empty",
            message: "The autocomplete result could not extend the current editor completion."
          });
          return [];
        }

        options.onEvent?.({
          type: "success",
          message: `${document.languageId} line ${position.line + 1} ${item.insertText.toString().split(/\r?\n/).length} line(s)`
        });
        return [item];
      } catch (error) {
        if (token.isCancellationRequested || abortController.signal.aborted || isAbortError(error)) {
          return [];
        }
        options.onEvent?.({
          type: "error",
          message: error instanceof Error ? error.message : String(error)
        });
        return [];
      } finally {
        cancellationSubscription.dispose();
        requestGate.finishRequest();
      }
    }
  };
}

function inlineCompletionItem(
  suggestion: string,
  lineText: string,
  linePrefix: string,
  position: vscode.Position,
  context: vscode.InlineCompletionContext
): vscode.InlineCompletionItem | undefined {
  const selectedCompletion = selectedCompletionAtPosition(context, position);
  if (context.selectedCompletionInfo && !selectedCompletion) {
    return undefined;
  }
  const presentation = inlineCompletionPresentation({
    linePrefix,
    lineSuffix: lineText.slice(
      selectedCompletion?.range.end.character ?? position.character
    ),
    suggestion,
    selectedCompletion: selectedCompletion
      ? {
        text: selectedCompletion.text,
        rangeStartCharacter: selectedCompletion.range.start.character
      }
      : undefined
  });
  if (!presentation) {
    return undefined;
  }

  const item = new vscode.InlineCompletionItem(
    presentation.insertText,
    presentation.useSelectedCompletionRange && selectedCompletion
      ? selectedCompletion.range
      : new vscode.Range(position, position)
  );
  if (selectedCompletion) {
    const originalRangeText = lineText.slice(
      selectedCompletion.range.start.character,
      selectedCompletion.range.end.character
    );
    item.filterText = originalRangeText
      + presentation.insertText.slice(selectedCompletion.text.length);
  }
  return item;
}

function selectedCompletionAtPosition(
  context: vscode.InlineCompletionContext,
  position: vscode.Position
): vscode.SelectedCompletionInfo | undefined {
  const selected = context.selectedCompletionInfo;
  if (
    !selected
    || selected.range.start.line !== position.line
    || selected.range.end.line !== position.line
    || selected.range.start.character > position.character
    || selected.range.end.character < position.character
  ) {
    return undefined;
  }
  return selected;
}

async function waitForRequestSlot(
  gate: AutocompleteRequestGate,
  isExplicit: boolean,
  token: vscode.CancellationToken
): Promise<boolean> {
  do {
    if (token.isCancellationRequested) {
      return false;
    }
    if (gate.beginRequest(isExplicit)) {
      return true;
    }
    if (!await waitUnlessCancelled(50, token)) {
      return false;
    }
  } while (true);
}

function waitUnlessCancelled(delayMs: number, token: vscode.CancellationToken): Promise<boolean> {
  if (token.isCancellationRequested) {
    return Promise.resolve(false);
  }
  if (delayMs <= 0) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    let settled = false;
    let cancellation: vscode.Disposable | undefined;
    const finish = (value: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      cancellation?.dispose();
      resolve(value);
    };
    const timer = setTimeout(() => finish(true), delayMs);
    cancellation = token.onCancellationRequested(() => finish(false));
    if (settled) {
      cancellation.dispose();
    }
  });
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === "AbortError";
}
