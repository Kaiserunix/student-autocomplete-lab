import * as path from "node:path";
import * as vscode from "vscode";
import { loadModelEnvFromVsCode } from "../config/vscodeModelEnv";
import { routeAutocompleteModel } from "../models/modelRouter";
import type { ModelTextTransport } from "../models/modelTextTransport";
import type { StudentSkill } from "../teaching/studentSkill";
import { buildAutocompleteInputFromText } from "./context";
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
  cacheTtlMs?: number;
  oauthTransport: ModelTextTransport;
  loadStudentSkill: () => Promise<StudentSkill>;
}

export function createMimoInlineCompletionProvider(
  options: InlineCompletionProviderOptions
): vscode.InlineCompletionItemProvider {
  const requestGate = new AutocompleteRequestGate({
    minAutomaticIntervalMs: options.minAutomaticIntervalMs,
    cacheTtlMs: options.cacheTtlMs
  });

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

        if (token?.isCancellationRequested) {
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

        options.onEvent?.({
          type: "success",
          message: `${document.languageId} line ${position.line + 1} ${result.suggestion.split(/\r?\n/).length} line(s)`
        });
        requestGate.completeSuccess(requestKey, result.suggestion);
        return [new vscode.InlineCompletionItem(result.suggestion)];
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
