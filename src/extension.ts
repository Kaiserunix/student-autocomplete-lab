import * as vscode from "vscode";
import { createMimoInlineCompletionProvider } from "./autocomplete/inlineProvider";
import { createInternalTestRecorder } from "./internalTesting/internalTestRecorder";
import { ProblemBankViewProvider } from "./sidebar/ProblemBankViewProvider";

export function activate(context: vscode.ExtensionContext): void {
  const internalRecorder = createInternalTestRecorder({
    globalStoragePath: context.globalStorageUri.fsPath,
    packageName: String(context.extension.packageJSON.name ?? "student-autocomplete-lab"),
    displayName: String(context.extension.packageJSON.displayName ?? ""),
    version: String(context.extension.packageJSON.version ?? ""),
    workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  });
  const provider = new ProblemBankViewProvider(context);
  const output = vscode.window.createOutputChannel("AI 做题陪练");
  const autocompleteStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  autocompleteStatus.name = "AI 做题陪练补全";
  autocompleteStatus.command = "studentAutocomplete.triggerInlineCompletion";
  autocompleteStatus.text = "$(sparkle) AI 补全待触发";
  autocompleteStatus.tooltip = "自动补全会显示为编辑器里的灰色 Ghost Text；点击这里手动触发一次。";
  autocompleteStatus.show();
  void internalRecorder.record({
    kind: "extension_activated",
    payload: {
      extensionMode: String(context.extensionMode)
    }
  }).catch((error) => console.warn("Student Autocomplete internal-test record failed", error));

  context.subscriptions.push(
    output,
    autocompleteStatus,
    vscode.languages.registerInlineCompletionItemProvider(
      [{ scheme: "file" }],
      createMimoInlineCompletionProvider({
        extensionContext: context,
        onEvent: (event) => {
          output.appendLine(`[autocomplete:${event.type}] ${event.message}`);
          void internalRecorder.record({
            kind: "autocomplete_event",
            action: event.type,
            note: event.message
          }).catch((error) => console.warn("Student Autocomplete internal-test record failed", error));
          if (event.type === "request") {
            autocompleteStatus.text = "$(sync~spin) AI 补全中";
          } else if (event.type === "success") {
            autocompleteStatus.text = "$(check) AI 补全已返回";
            autocompleteStatus.tooltip = event.message;
          } else if (event.type === "empty") {
            autocompleteStatus.text = "$(circle-slash) AI 返回空补全";
            autocompleteStatus.tooltip = event.message;
          } else {
            autocompleteStatus.text = "$(warning) AI 补全异常";
            autocompleteStatus.tooltip = event.message;
          }
        }
      })
    ),
    vscode.window.registerWebviewViewProvider(ProblemBankViewProvider.viewType, provider),
    vscode.commands.registerCommand("studentAutocomplete.saveProblem", () => {
      vscode.commands.executeCommand(`${ProblemBankViewProvider.viewType}.focus`);
    }),
    vscode.commands.registerCommand("studentAutocomplete.giveHint", () => {
      vscode.window.showInformationMessage("Student Autocomplete: hint analysis is planned for the next slice.");
    }),
    vscode.commands.registerCommand("studentAutocomplete.moreSpecificHint", () => {
      vscode.window.showInformationMessage("Student Autocomplete: deeper hint analysis is planned for the next slice.");
    }),
    vscode.commands.registerCommand("studentAutocomplete.revealAnswer", () => {
      vscode.window.showInformationMessage("Student Autocomplete: answer reveal and wrong-problem bank are planned.");
    }),
    vscode.commands.registerCommand("studentAutocomplete.recommendNext", () => {
      vscode.window.showInformationMessage("Student Autocomplete: recommendation is planned after pain-point events exist.");
    }),
    vscode.commands.registerCommand("studentAutocomplete.triggerInlineCompletion", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("先打开一个代码文件，再触发 MiMo 自动补全。");
        return;
      }

      await vscode.window.showTextDocument(editor.document, editor.viewColumn, false);
      autocompleteStatus.text = "$(sync~spin) 正在触发 AI 补全";
      output.appendLine(`[autocomplete:manual-trigger] ${editor.document.uri.fsPath}:${editor.selection.active.line + 1}`);
      await vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
    })
  );
}

export function deactivate(): void {}
