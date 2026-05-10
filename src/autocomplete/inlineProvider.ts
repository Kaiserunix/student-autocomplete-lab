import * as path from "node:path";
import * as vscode from "vscode";
import { requireMimoAutocompleteConfig } from "../config/modelEnv";
import { loadModelEnvFromVsCode } from "../config/vscodeModelEnv";
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
}

export function createMimoInlineCompletionProvider(
  options: InlineCompletionProviderOptions
): vscode.InlineCompletionItemProvider {
  const requestGate = new AutocompleteRequestGate({
    minAutomaticIntervalMs: options.minAutomaticIntervalMs,
    cacheTtlMs: options.cacheTtlMs
  });

  async function loadConfig(): Promise<ReturnType<typeof requireMimoAutocompleteConfig>> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("Open a workspace folder before using Student Autocomplete inline completion.");
    }

    const envPath = path.join(workspaceFolder.uri.fsPath, "secrets", "models.env");
    return requireMimoAutocompleteConfig(await loadModelEnvFromVsCode(options.extensionContext, envPath));
  }

  return {
    async provideInlineCompletionItems(document, position, context, token): Promise<vscode.InlineCompletionItem[]> {
      if (!isSupportedAutocompleteLanguage(document.languageId)) {
        return [];
      }

      const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
      if (!shouldRequestInlineCompletion(linePrefix)) {
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

      const isExplicit = context?.triggerKind === vscode.InlineCompletionTriggerKind.Invoke;
      if (!requestGate.beginRequest(isExplicit)) {
        return [];
      }

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
          habits: ["Prefer direct student code.", "Return only the immediate local continuation."]
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
        requestGate.finishRequest();
      }
    }
  };
}
