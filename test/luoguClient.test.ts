import { describe, expect, test } from "vitest";
import { normalizeLuoguProblemResponse } from "../src/problemBank/luoguClient";

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

describe("luogu client normalization", () => {
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
});
