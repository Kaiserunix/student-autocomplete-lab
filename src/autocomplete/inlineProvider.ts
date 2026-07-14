import * as path from "node:path";
import * as vscode from "vscode";
import { loadModelEnvFromVsCode } from "../config/vscodeModelEnv";
import type { CompletionProviderConfig } from "../models/completionsClient";
import { routeAutocompleteModel } from "../models/modelRouter";
import type { ModelTextTransport } from "../models/modelTextTransport";
import { buildAutocompleteInputFromText } from "./context";
import { requestMimoAutocomplete } from "./mimoAutocomplete";
import { AutocompleteRequestGate } from "./requestGate";
import { isSupportedAutocompleteLanguage, shouldRequestInlineCompletion } from "./triggerPolicy";

export interface InlineCompletionEvent {
  type: "request" | "success" | "empty" | "error";
  message: string;
}

interface InlineCompletionProviderOptions {
  extensionContext: vscode.ExtensionContext;
  onEvent?: (event: InlineCompletionEvent) => void;
  minAutomaticIntervalMs?: number;
  cacheTtlMs?: number;
  oauthTransport: ModelTextTransport;
}

export function createMimoInlineCompletionProvider(
  options: InlineCompletionProviderOptions
): vscode.InlineCompletionItemProvider {
  const requestGate = new AutocompleteRequestGate({
    minAutomaticIntervalMs: options.minAutomaticIntervalMs,
    cacheTtlMs: options.cacheTtlMs
  });

  async function loadConfig(): Promise<CompletionProviderConfig> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("Open a workspace folder before using Student Autocomplete inline completion.");
    }

    const envPath = path.join(workspaceFolder.uri.fsPath, "secrets", "models.env");
    return routeAutocompleteModel(
      await loadModelEnvFromVsCode(options.extensionContext, envPath),
      options.oauthTransport
    ).config;
  }

  return {
    async provideInlineCompletionItems(document, position, context, token): Promise<vscode.InlineCompletionItem[]> {
      if (!isSupportedAutocompleteLanguage(document.languageId)) {
        return [];
      }

      const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
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
        return [new vscode.InlineCompletionItem(cached.suggestion)];
      }

      if (!requestGate.beginRequest(isExplicit)) {
        return [];
      }
      const abortController = new AbortController();
      const cancellationSubscription = token.onCancellationRequested(() => abortController.abort());

      try {
        options.onEvent?.({
          type: "request",
          message: `${document.languageId} ${document.uri.fsPath}:${position.line + 1}`
        });
        if (token?.isCancellationRequested) {
          return [];
        }
        const config = await loadConfig();
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
        const suggestion = await requestMimoAutocomplete(config, {
          ...input,
          habits: ["Prefer direct student code.", "Return only the immediate local continuation."],
          signal: abortController.signal
        });

        if (token?.isCancellationRequested) {
          return [];
        }
        if (!suggestion.trim()) {
          options.onEvent?.({
            type: "empty",
            message: "MiMo returned an empty inline completion."
          });
          return [];
        }

        options.onEvent?.({
          type: "success",
          message: `${document.languageId} ${document.uri.fsPath}:${position.line + 1} ${suggestion.split(/\r?\n/).length} line(s)`
        });
        requestGate.completeSuccess(requestKey, suggestion);
        return [new vscode.InlineCompletionItem(suggestion)];
      } catch (error) {
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
