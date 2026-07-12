import { describe, expect, test } from "vitest";
import { fetchLuoguProblemSet, normalizeLuoguProblemSetResponse } from "../src/problemBank/luoguProblemSetClient";

const sampleProblemSetResponse = {
  code: 200,
  currentTemplate: "TrainingShow",
  currentData: {
    training: {
      id: 100,
      title: "【入门1】顺序结构",
      name: "【入门1】顺序结构",
      description: "Starter sequence problems.",
      problemCount: 2,
      problems: [
        {
          problem: {
            pid: "P1000",
            title: "超级玛丽游戏",
            difficulty: 1,
            tags: [2, 108],
            type: "P"
          }
        },
        {
          problem: {
            pid: "P1001",
            title: "A+B Problem",
            difficulty: 1,
            tags: [1],
            type: "P"
          }
        }
      ]
    }
  }
};

describe("Luogu problem set normalization", () => {
  test("normalizes a training response into a local problem set record", () => {
    const problemSet = normalizeLuoguProblemSetResponse(sampleProblemSetResponse, "100");

    expect(problemSet.platform).toBe("luogu");
    expect(problemSet.id).toBe("100");
    expect(problemSet.title).toBe("【入门1】顺序结构");
    expect(problemSet.problemCount).toBe(2);
    expect(problemSet.problems).toEqual([
      {
        id: "P1000",
        title: "超级玛丽游戏",
        difficulty: 1,
        tags: ["2", "108"],
        sourceUrl: "https://www.luogu.com.cn/problem/P1000"
      },
      {
        id: "P1001",
        title: "A+B Problem",
        difficulty: 1,
        tags: ["1"],
        sourceUrl: "https://www.luogu.com.cn/problem/P1001"
      }
    ]);
    expect(problemSet.sourceUrl).toBe("https://www.luogu.com.cn/training/100");
  });

  test("normalizes the current content-only training shape from Luogu", () => {
    const problemSet = normalizeLuoguProblemSetResponse(
      {
        instance: "main",
        template: "training.show",
        status: 200,
        data: {
          training: {
            id: 100,
            name: "【入门1】顺序结构",
            description: "Starter sequence problems.",
            problemCount: 2,
            problems: [
              {
                pid: "P1000",
                title: "超级玛丽游戏",
                difficulty: 1,
                tags: [2, 108],
                type: "P"
              },
              {
                pid: "P1001",
                title: "A+B Problem",
                difficulty: 1,
                tags: [1],
                type: "P"
              }
            ]
          }
        }
      },
      "100"
    );

    expect(problemSet.id).toBe("100");
    expect(problemSet.title).toBe("【入门1】顺序结构");
    expect(problemSet.problems.map((problem) => problem.id)).toEqual(["P1000", "P1001"]);
  });

  test("fetches a problem set with the current Luogu content-only header", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
      calls.push({ url: String(url), init });
      return new Response(JSON.stringify(sampleProblemSetResponse), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    };

    await fetchLuoguProblemSet("100", fakeFetch as typeof fetch);

    expect(calls[0].url).toBe("https://www.luogu.com.cn/training/100?_contentOnly=1");
    expect((calls[0].init?.headers as Record<string, string>)["x-lentille-request"]).toBe("content-only");
  });
});
