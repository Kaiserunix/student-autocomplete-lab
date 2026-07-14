import { describe, expect, test } from "vitest";
import {
  normalizeLuoguProblemSearchResponse,
  normalizeLuoguProblemSetSearchResponse,
  searchLuoguProblems,
  searchLuoguProblemSets
} from "../src/problemBank/luoguSearchClient";

describe("Luogu search normalization", () => {
  test("normalizes problem search results", () => {
    const results = normalizeLuoguProblemSearchResponse({
      data: {
        problems: {
          count: 2,
          result: [
            {
              pid: "P1319",
              name: "压缩技术",
              difficulty: 1,
              tags: [1, 2, 81]
            },
            {
              pid: "P1320",
              title: "压缩技术（续集版）",
              difficulty: 1,
              tags: [1, 2, 81]
            }
          ]
        }
      }
    });

    expect(results.total).toBe(2);
    expect(results.items).toEqual([
      {
        id: "P1319",
        title: "压缩技术",
        difficulty: 1,
        tags: ["1", "2", "81"],
        sourceUrl: "https://www.luogu.com.cn/problem/P1319"
      },
      {
        id: "P1320",
        title: "压缩技术（续集版）",
        difficulty: 1,
        tags: ["1", "2", "81"],
        sourceUrl: "https://www.luogu.com.cn/problem/P1320"
      }
    ]);
  });

  test("normalizes current Luogu problem search results that use name instead of title", () => {
    const results = normalizeLuoguProblemSearchResponse({
      data: {
        problems: {
          count: 1,
          result: [
            {
              pid: "P1001",
              name: "A+B Problem",
              difficulty: 1,
              tags: [1]
            }
          ]
        }
      }
    });

    expect(results).toEqual({
      total: 1,
      items: [
        {
          id: "P1001",
          title: "A+B Problem",
          difficulty: 1,
          tags: ["1"],
          sourceUrl: "https://www.luogu.com.cn/problem/P1001"
        }
      ]
    });
  });

  test("normalizes problem-set search results", () => {
    const results = normalizeLuoguProblemSetSearchResponse({
      data: {
        trainings: {
          count: 1,
          result: [
            {
              id: 100,
              name: "【入门1】顺序结构",
              problemCount: 15,
              markCount: 35742
            }
          ]
        }
      }
    });

    expect(results.total).toBe(1);
    expect(results.items).toEqual([
      {
        id: "100",
        title: "【入门1】顺序结构",
        problemCount: 15,
        sourceUrl: "https://www.luogu.com.cn/training/100"
      }
    ]);
  });

  test("searches Luogu problems with the content-only header", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ data: { problems: { count: 0, result: [] } } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    await searchLuoguProblems("压缩技术", fakeFetch as typeof fetch);

    expect(calls[0].url).toContain("https://www.luogu.com.cn/problem/list?");
    expect(calls[0].url).toContain("type=P");
    expect(calls[0].url).toContain("keyword=%E5%8E%8B%E7%BC%A9%E6%8A%80%E6%9C%AF");
    expect((calls[0].init?.headers as Record<string, string>)["x-lentille-request"]).toBe("content-only");
  });

  test("searches Luogu problem sets with the content-only header", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify({ currentData: { trainings: { count: 0, result: [] } } }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    await searchLuoguProblemSets("入门", fakeFetch as typeof fetch);

    expect(calls[0].url).toContain("https://www.luogu.com.cn/training/list?");
    expect(calls[0].url).toContain("keyword=%E5%85%A5%E9%97%A8");
    expect(calls[0].url).toContain("_contentOnly=1");
    expect((calls[0].init?.headers as Record<string, string>)["x-lentille-request"]).toBe("content-only");
  });
});
