import { describe, expect, test } from "vitest";
import { normalizeLuoguProblemSetResponse } from "../src/problemBank/luoguProblemSetClient";

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
});
