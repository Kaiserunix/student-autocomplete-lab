import * as path from "node:path";
import * as vscode from "vscode";
import { loadModelEnv, requireMimoAutocompleteConfig } from "../config/modelEnv";
import { buildAutocompleteInputFromText } from "./context";
import { requestMimoAutocomplete } from "./mimoAutocomplete";

export function createMimoInlineCompletionProvider(): vscode.InlineCompletionItemProvider {
  let cachedConfig: ReturnType<typeof requireMimoAutocompleteConfig> | undefined;

  async function loadConfig(): Promise<ReturnType<typeof requireMimoAutocompleteConfig>> {
    if (cachedConfig) {
      return cachedConfig;
    }

    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("Open a workspace folder before using Student Autocomplete inline completion.");
    }

    const envPath = path.join(workspaceFolder.uri.fsPath, "secrets", "models.env");
    cachedConfig = requireMimoAutocompleteConfig(await loadModelEnv(envPath));
    return cachedConfig;
  }

  return {
    async provideInlineCompletionItems(document, position): Promise<vscode.InlineCompletionItem[]> {
      const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
      if (linePrefix.trim().length === 0 && !linePrefix.endsWith("    ")) {
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
      const suggestion = await requestMimoAutocomplete(config, {
        ...input,
        habits: ["Prefer direct student code.", "Return only the immediate local continuation."]
      });

      if (!suggestion.trim()) {
        return [];
      }

      return [new vscode.InlineCompletionItem(suggestion)];
    }
  };
}
