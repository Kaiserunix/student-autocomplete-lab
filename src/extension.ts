import * as vscode from "vscode";
import { ProblemBankViewProvider } from "./sidebar/ProblemBankViewProvider";

export function activate(context: vscode.ExtensionContext): void {
  const provider = new ProblemBankViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(ProblemBankViewProvider.viewType, provider),
    vscode.commands.registerCommand("studentAutocomplete.saveProblem", () => {
      vscode.commands.executeCommand("studentAutocomplete.problemBank.focus");
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
    })
  );
}

export function deactivate(): void {}
