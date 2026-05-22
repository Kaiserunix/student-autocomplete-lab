import { describe, expect, test } from "vitest";
import {
  fetchLuoguProblemForMcp,
  recommendProblemsByPainPoint,
  searchLuoguProblemsForMcp
} from "../src/mcp/problemSearchTools";

describe("problem-search MCP tools", () => {
  test("recommends binary tree traversal practice from a traversal pain point", () => {
    const result = recommendProblemsByPainPoint({
      painPoint: "traversal_order_confusion",
      limit: 3
    });

    expect(result.painPoint).toBe("traversal_order_confusion");
    expect(result.items.map((item) => item.id)).toEqual(["P1305"]);
    expect(result.items[0].difficultySignal).toContain("稳态练习");
    expect(result.searchHints).toContain("二叉树 遍历");
  });

  test("keeps recommendations bounded and falls back to review problems", () => {
    const result = recommendProblemsByPainPoint({
      painPoint: "unknown_label",
      limit: 2
    });

    expect(result.painPoint).toBe("needs_teacher_review");
    expect(result.items).toHaveLength(1);
    expect(result.items[0].id).toBe("P4913");
  });

  test("formats Luogu problem search results for model tool use", async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          data: {
            problems: {
              count: 1,
              result: [{ pid: "P1030", title: "求先序排列", difficulty: 2, tags: [72] }]
            }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );

    const result = await searchLuoguProblemsForMcp(
      {
        keyword: "二叉树 遍历",
        limit: 5
      },
      fakeFetch as typeof fetch
    );

    expect(result.query).toBe("二叉树 遍历");
    expect(result.items).toEqual([
      {
        platform: "luogu",
        id: "P1030",
        title: "求先序排列",
        sourceUrl: "https://www.luogu.com.cn/problem/P1030",
        difficulty: 2,
        tags: ["72"]
      }
    ]);
  });

  test("trims fetched statements so a model can inspect the problem safely", async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          data: {
            problem: {
              pid: "P4913",
              title: "二叉树深度",
              difficulty: 1,
              tags: [72],
              description: "a".repeat(5000),
              inputFormat: "input",
              outputFormat: "output",
              samples: [["1 2 0", "2"]],
              hint: "hint"
            }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );

    const result = await fetchLuoguProblemForMcp(
      {
        pid: "P4913",
        maxStatementChars: 120
      },
      fakeFetch as typeof fetch
    );

    expect(result.id).toBe("P4913");
    expect(result.statement.length).toBeLessThanOrEqual(120);
    expect(result.truncated).toBe(true);
  });
});
