import * as path from "node:path";
import * as vscode from "vscode";
import { loadModelEnvFromVsCode } from "../config/vscodeModelEnv";
import { routeAutocompleteModel } from "../models/modelRouter";
import type { ModelTextTransport } from "../models/modelTextTransport";
import type { StudentSkill } from "../teaching/studentSkill";
import { buildAutocompleteInputFromText } from "./context";
import {
  createInlineCompletionEngine,
  type InlineCompletionEvent
} from "./inlineCompletionCore";
import { requestMimoAutocompleteDetailed } from "./mimoAutocomplete";

export type { InlineCompletionEvent };

export interface InlineCompletionProviderOptions {
  extensionContext: vscode.ExtensionContext;
  onEvent?: (event: InlineCompletionEvent) => void;
  minAutomaticIntervalMs?: number;
  automaticDebounceMs?: number;
  cacheTtlMs?: number;
  oauthTransport: ModelTextTransport;
  loadStudentSkill: () => Promise<StudentSkill>;
}

export function createInlineCompletionProvider(
  options: InlineCompletionProviderOptions
): vscode.InlineCompletionItemProvider {
  const engine = createInlineCompletionEngine({
    minAutomaticIntervalMs: options.minAutomaticIntervalMs,
    automaticDebounceMs: options.automaticDebounceMs,
    cacheTtlMs: options.cacheTtlMs,
    onEvent: (event) => {
      if (event.type === "rejected") {
        options.onEvent?.({ type: "rejected", message: event.message });
        return;
      }
      options.onEvent?.(event);
    },
    loadStudentSkill: options.loadStudentSkill,
    buildInput: buildAutocompleteInputFromText,
    requestAutocomplete: (config, input) => {
      const route = { capabilities: input.capabilities };
      return requestMimoAutocompleteDetailed(config, {
        ...input,
        studentSkill: input.studentSkill,
        capabilities: route.capabilities
      });
    },
    async loadRoute() {
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
  });

  return {
    async provideInlineCompletionItems(document, position, context, token): Promise<vscode.InlineCompletionItem[]> {
      const selected = context?.selectedCompletionInfo;
      const candidate = await engine.provideCompletion(
        {
          uri: document.uri.toString(),
          filePath: document.uri.fsPath,
          languageId: document.languageId,
          version: document.version,
          lineTextAt: (line) => document.lineAt(line).text,
          offsetAt: () => document.offsetAt(position),
          getText: () => document.getText()
        },
        {
          line: position.line,
          character: position.character
        },
        {
          explicit: context?.triggerKind === vscode.InlineCompletionTriggerKind.Invoke,
          selectedCompletion: selected
            ? {
                text: selected.text,
                rangeStartLine: selected.range.start.line,
                rangeEndLine: selected.range.end.line,
                rangeStartCharacter: selected.range.start.character,
                rangeEndCharacter: selected.range.end.character
              }
            : undefined
        },
        token
      );

      if (!candidate) {
        return [];
      }

      const item = new vscode.InlineCompletionItem(
        candidate.insertText,
        candidate.useSelectedCompletionRange && selected
          ? selected.range
          : new vscode.Range(position, position)
      );
      if (candidate.filterText !== undefined) {
        item.filterText = candidate.filterText;
      }
      return [item];
    }
  };
}

export const createMimoInlineCompletionProvider = createInlineCompletionProvider;
