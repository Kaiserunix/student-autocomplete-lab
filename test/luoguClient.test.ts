import { describe, expect, test } from "vitest";
import { fetchLuoguProblem, normalizeLuoguPid, normalizeLuoguProblemResponse } from "../src/problemBank/luoguClient";

const sampleLuoguResponse = {
  status: 200,
  data: {
    problem: {
      pid: "P1205",
      title: "[USACO1.2] 方块转换 Transformations",
      difficulty: 3,
      tags: [1, 4, 46],
      limits: {
        time: [1000],
        memory: [128]
      },
      description: "A square pattern transformation problem.",
      inputFormat: "The first line contains n.",
      outputFormat: "Print the transformation type.",
      samples: [
        ["3\\n@-@\\n---\\n@@-\\n@-@\\n@--\\n--@\\n", "1\\n"]
      ],
      hint: "USACO Training Section 1.2"
    }
  }
};

const liveShapeLuoguResponse = {
  status: 200,
  data: {
    problem: {
      pid: "P5730",
      title: "【深基5.例10】显示屏",
      difficulty: 2,
      tags: [],
      contenu: {
        description: "液晶屏上，每个阿拉伯数字都是 3x5 点阵。",
        formatI: "第一行输入一个整数 n。",
        formatO: "输出显示屏内容。",
        hint: "注意每个数字之间有间隔。"
      },
      samples: [["10\n0123456789\n", "XXX...X\n"]]
    }
  }
};

describe("luogu client normalization", () => {
  test("normalizes numeric and lowercase problem ids", () => {
    expect(normalizeLuoguPid("5730")).toBe("P5730");
    expect(normalizeLuoguPid("p5730")).toBe("P5730");
    expect(normalizeLuoguPid("P5730")).toBe("P5730");
  });

  test("fetches numeric problem ids using the canonical P-prefixed Luogu URL", async () => {
    const urls: string[] = [];
    const fetchImpl = async (url: string | URL | Request) => {
      urls.push(String(url));
      return {
        ok: true,
        json: async () => sampleLuoguResponse
      } as Response;
    };

    await fetchLuoguProblem("5730", fetchImpl);

    expect(urls).toEqual(["https://www.luogu.com.cn/problem/P5730"]);
  });

  test("explains 404s as likely invalid problem ids or misplaced problem-set ids", async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response("missing", {
        status: 404
      });

    await expect(fetchLuoguProblem("412", fetchImpl)).rejects.toThrow("题单 ID");
  });

  test("normalizes public Luogu JSON into a local problem record", () => {
    const problem = normalizeLuoguProblemResponse(sampleLuoguResponse);

    expect(problem.platform).toBe("luogu");
    expect(problem.id).toBe("P1205");
    expect(problem.title).toContain("Transformations");
    expect(problem.statement).toContain("square pattern");
    expect(problem.inputFormat).toContain("first line");
    expect(problem.outputFormat).toContain("transformation");
    expect(problem.samples).toEqual([
      {
        input: "3\\n@-@\\n---\\n@@-\\n@-@\\n@--\\n--@\\n",
        output: "1\\n"
      }
    ]);
    expect(problem.sourceUrl).toBe("https://www.luogu.com.cn/problem/P1205");
  });

  test("normalizes the current Luogu contenu fields into statement and formats", () => {
    const problem = normalizeLuoguProblemResponse(liveShapeLuoguResponse);

    expect(problem.id).toBe("P5730");
    expect(problem.statement).toContain("液晶屏");
    expect(problem.inputFormat).toContain("第一行");
    expect(problem.outputFormat).toContain("输出显示屏");
    expect(problem.hint).toContain("间隔");
    expect(problem.samples[0]).toEqual({
      input: "10\n0123456789\n",
      output: "XXX...X\n"
    });
  });
});
