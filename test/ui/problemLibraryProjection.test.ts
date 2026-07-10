import { describe, expect, test } from "vitest";
import { projectProblemLibrary } from "../../src/ui/application/problemLibraryProjection";

describe("projectProblemLibrary", () => {
  test("keeps the native tree focused on active work and history", () => {
    const groups = projectProblemLibrary({
      active: [
        { problemKey: "luogu:P1001", id: "P1001", title: "A+B Problem", platform: "luogu", savedAt: "2026-07-10T01:00:00Z" }
      ],
      completed: [
        { problemKey: "luogu:P1000", id: "P1000", title: "超级玛丽游戏", platform: "luogu", archivedAt: "2026-07-10T02:00:00Z" }
      ]
    });

    expect(groups.map((group) => group.id)).toEqual(["active", "history"]);
    expect(groups[0].items[0]).toMatchObject({
      key: "luogu:P1001",
      label: "P1001 · A+B Problem",
      contextValue: "activeProblem"
    });
    expect(JSON.stringify(groups)).not.toMatch(/provider|model|telemetry|feature.?flag/i);
  });

  test("bounds history and keeps newest archived attempts first", () => {
    const completed = Array.from({ length: 80 }, (_, index) => ({
      problemKey: `luogu:P${index}`,
      id: `P${index}`,
      title: `Problem ${index}`,
      platform: "luogu",
      archivedAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString()
    }));

    const history = projectProblemLibrary({ active: [], completed }).find((group) => group.id === "history");

    expect(history?.items).toHaveLength(50);
    expect(history?.items[0].key).toBe("luogu:P79");
  });
});
