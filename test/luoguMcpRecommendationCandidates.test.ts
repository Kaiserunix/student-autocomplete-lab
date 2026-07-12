import { describe, expect, test } from "vitest";
import { buildLuoguMcpRecommendationCandidates } from "../src/teaching/luoguMcpRecommendationCandidates";

describe("Luogu MCP recommendation candidates", () => {
  test("searches Luogu through the MCP tool path for top pain points", async () => {
    const urls: string[] = [];
    const fakeFetch = async (url: string | URL | Request): Promise<Response> => {
      urls.push(String(url));
      return new Response(
        JSON.stringify({
          data: {
            problems: {
              count: 2,
              result: [
                { pid: "P1030", title: "求先序排列", difficulty: 2, tags: [72] },
                { pid: "P1305", title: "新二叉树", difficulty: 1, tags: [72] }
              ]
            }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );
    };

    const result = await buildLuoguMcpRecommendationCandidates(
      [{ label: "traversal_order_confusion", count: 3, score: 3, weight: 5.4 }],
      fakeFetch as typeof fetch
    );

    expect(urls.length).toBeGreaterThan(0);
    expect(urls[0]).toContain("luogu.com.cn/problem/list");
    expect(result.searchHints).toContain("二叉树 遍历");
    expect(result.queryCount).toBeGreaterThan(0);
    expect(result.candidates.map((candidate) => candidate.id)).toEqual(["P1030", "P1305"]);
    expect(result.candidates[0].targetPainPoints).toContain("traversal_order_confusion");
    expect(result.candidates[0].reason).toContain("Luogu MCP 搜索");
  });

  test("keeps fallback metadata when Luogu search fails", async () => {
    const fakeFetch = async (): Promise<Response> => new Response("blocked", { status: 500 });

    const result = await buildLuoguMcpRecommendationCandidates([], fakeFetch as typeof fetch);

    expect(result.searchHints.length).toBeGreaterThan(0);
    expect(result.candidates).toEqual([]);
    expect(result.errorMessages.length).toBeGreaterThan(0);
  });

  test("accepts direct pain point labels for probes and future callers", async () => {
    const fakeFetch = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          data: {
            problems: {
              count: 1,
              result: [{ pid: "P4913", title: "二叉树深度", difficulty: 2, tags: [72] }]
            }
          }
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      );

    const result = await buildLuoguMcpRecommendationCandidates(["recursion_base_case"], fakeFetch as typeof fetch);

    expect(result.queryCount).toBeGreaterThan(0);
    expect(result.candidates[0].id).toBe("P4913");
    expect(result.candidates[0].targetPainPoints).toContain("recursion_base_case");
  });
});
