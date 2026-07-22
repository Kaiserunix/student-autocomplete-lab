import * as vscode from "vscode";
import { createMimoInlineCompletionProvider } from "./autocomplete/inlineProvider";
import { createCodexServices, resolveCodexServicePaths } from "./codex/codexServices";
import { createInternalTestRecorder } from "./internalTesting/internalTestRecorder";
import { ProblemBankViewProvider } from "./sidebar/ProblemBankViewProvider";
import { createStudentAutocompleteStoragePaths } from "./storage/StoragePaths";
import { loadStudentSkill } from "./teaching/studentSkillStore";
import { createVsCodeOjBroker } from "./oj/vscodeProviderConfiguration";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const output = vscode.window.createOutputChannel("AI 做题陪练");
  const codexServices = createCodexServices(
    resolveCodexServicePaths({
      globalStoragePath: context.globalStorageUri.fsPath,
      executablePath: vscode.workspace
        .getConfiguration("studentAutocomplete")
        .get<string>("ai.codex.executablePath", "codex"),
      extensionVersion: String(context.extension.packageJSON.version ?? "")
    }),
    (entry) => output.appendLine(`[codex:${entry.level}] ${entry.event}${entry.message ? ` ${entry.message}` : ""}`)
  );
  const internalRecorder = createInternalTestRecorder({
    globalStoragePath: context.globalStorageUri.fsPath,
    packageName: String(context.extension.packageJSON.name ?? "student-autocomplete-lab"),
    displayName: String(context.extension.packageJSON.displayName ?? ""),
    version: String(context.extension.packageJSON.version ?? ""),
    workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
  });
  const storagePaths = createStudentAutocompleteStoragePaths(
    context.globalStorageUri.fsPath
  );
  const ojBroker = await createVsCodeOjBroker(context);
  const provider = new ProblemBankViewProvider(context, codexServices, ojBroker);
  const autocompleteStatus = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 90);
  autocompleteStatus.name = "AI 做题陪练补全";
  autocompleteStatus.command = "studentAutocomplete.triggerInlineCompletion";
  autocompleteStatus.text = "$(sparkle) AI 自动补全已开启";
  autocompleteStatus.tooltip = "停下输入约 350 毫秒后自动显示灰色 Ghost Text；点击这里可立即补全一次。";
  autocompleteStatus.show();
  void internalRecorder.record({
    kind: "extension_activated",
    payload: {
      extensionMode: String(context.extensionMode)
    }
  }).catch((error) => console.warn("Student Autocomplete internal-test record failed", error));

  context.subscriptions.push(
    output,
    codexServices,
    ojBroker,
    autocompleteStatus,
    vscode.languages.registerInlineCompletionItemProvider(
      [{ scheme: "file" }],
      createMimoInlineCompletionProvider({
        extensionContext: context,
        oauthTransport: codexServices.text,
        loadStudentSkill: () => loadStudentSkill(storagePaths.studentSkill),
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
          } else if (event.type === "rejected") {
            autocompleteStatus.text = "$(shield) AI 补全已拦截";
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
      focusCoachView("给点提示");
    }),
    vscode.commands.registerCommand("studentAutocomplete.moreSpecificHint", () => {
      focusCoachView("更具体");
    }),
    vscode.commands.registerCommand("studentAutocomplete.revealAnswer", () => {
      focusCoachView("我放弃了");
    }),
    vscode.commands.registerCommand("studentAutocomplete.recommendNext", () => {
      focusCoachView("推荐下一题");
    }),
    vscode.commands.registerCommand("studentAutocomplete.triggerInlineCompletion", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        vscode.window.showWarningMessage("先打开一个代码文件，再立即请求一次 AI 补全。");
        return;
      }

      await vscode.window.showTextDocument(editor.document, editor.viewColumn, false);
      autocompleteStatus.text = "$(sync~spin) 正在立即请求 AI 补全";
      output.appendLine(
        `[autocomplete:manual-trigger] ${editor.document.languageId} line ${editor.selection.active.line + 1}`
      );
      await vscode.commands.executeCommand("editor.action.inlineSuggest.trigger");
    })
  );
}

function focusCoachView(actionName: string): void {
  void vscode.commands.executeCommand(`${ProblemBankViewProvider.viewType}.focus`);
  void vscode.window.showInformationMessage(`请在左侧 AI 教练中点击「${actionName}」继续。`);
}

export function deactivate(): void {}
