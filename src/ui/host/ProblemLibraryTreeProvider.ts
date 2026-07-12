import * as vscode from "vscode";
import type { ProblemLibraryGroupView } from "../application/problemLibraryProjection";

type ProblemLibraryNode =
  | { kind: "group"; group: ProblemLibraryGroupView }
  | { kind: "problem"; groupId: ProblemLibraryGroupView["id"]; item: ProblemLibraryGroupView["items"][number] };

export class ProblemLibraryTreeProvider implements vscode.TreeDataProvider<ProblemLibraryNode> {
  public static readonly viewType = "studentAutocomplete.problemLibrary";

  private readonly changed = new vscode.EventEmitter<ProblemLibraryNode | undefined>();
  private groups: ProblemLibraryGroupView[] = [];

  public readonly onDidChangeTreeData = this.changed.event;

  public constructor(private readonly loadGroups: () => Promise<ProblemLibraryGroupView[]>) {}

  public refresh(): void {
    this.groups = [];
    this.changed.fire(undefined);
  }

  public getTreeItem(node: ProblemLibraryNode): vscode.TreeItem {
    if (node.kind === "group") {
      const item = new vscode.TreeItem(node.group.label, vscode.TreeItemCollapsibleState.Expanded);
      item.contextValue = `problemLibraryGroup.${node.group.id}`;
      item.iconPath = new vscode.ThemeIcon(node.group.id === "active" ? "target" : "history");
      return item;
    }

    const item = new vscode.TreeItem(node.item.label, vscode.TreeItemCollapsibleState.None);
    item.description = node.item.description;
    item.tooltip = node.item.tooltip;
    item.contextValue = node.item.contextValue;
    item.iconPath = new vscode.ThemeIcon(node.groupId === "active" ? "circle-filled" : "check");
    item.command = {
      command: "studentAutocomplete.selectProblem",
      title: "打开学习会话",
      arguments: [node.item.key]
    };
    return item;
  }

  public async getChildren(node?: ProblemLibraryNode): Promise<ProblemLibraryNode[]> {
    if (!node) {
      if (this.groups.length === 0) {
        this.groups = await this.loadGroups();
      }
      return this.groups
        .filter((group) => group.items.length > 0)
        .map((group) => ({ kind: "group" as const, group }));
    }
    if (node.kind === "problem") {
      return [];
    }
    return node.group.items.map((item) => ({
      kind: "problem" as const,
      groupId: node.group.id,
      item
    }));
  }

  public dispose(): void {
    this.changed.dispose();
  }
}
