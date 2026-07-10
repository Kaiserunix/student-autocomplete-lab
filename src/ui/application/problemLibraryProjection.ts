export interface ProblemLibrarySourceItem {
  problemKey: string;
  id: string;
  title: string;
  platform: string;
  savedAt?: string;
  archivedAt?: string;
}

export interface ProblemLibraryItemView {
  key: string;
  label: string;
  description: string;
  tooltip: string;
  contextValue: "activeProblem" | "completedProblem";
}

export interface ProblemLibraryGroupView {
  id: "active" | "history";
  label: string;
  items: ProblemLibraryItemView[];
}

export function projectProblemLibrary(input: {
  active: ProblemLibrarySourceItem[];
  completed: ProblemLibrarySourceItem[];
}): ProblemLibraryGroupView[] {
  const active = [...input.active]
    .sort((left, right) => compareTimestamp(right.savedAt, left.savedAt))
    .map((item) => toItemView(item, "activeProblem"));
  const history = [...input.completed]
    .sort((left, right) => compareTimestamp(right.archivedAt, left.archivedAt))
    .slice(0, 50)
    .map((item) => toItemView(item, "completedProblem"));

  return [
    { id: "active", label: "进行中", items: active },
    { id: "history", label: "历史", items: history }
  ];
}

function toItemView(
  item: ProblemLibrarySourceItem,
  contextValue: ProblemLibraryItemView["contextValue"]
): ProblemLibraryItemView {
  return {
    key: item.problemKey,
    label: `${item.id} · ${item.title}`,
    description: item.platform,
    tooltip: `${item.platform} · ${item.id}\n${item.title}`,
    contextValue
  };
}

function compareTimestamp(left: string | undefined, right: string | undefined): number {
  return Date.parse(left ?? "") - Date.parse(right ?? "");
}
