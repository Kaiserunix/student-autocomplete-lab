import { describe, expect, test } from "vitest";
import { findSeedProblem, luoguSeedProblems } from "../src/problemBank/catalog";

describe("seed catalog", () => {
  test("contains all user-supplied Luogu starter problems", () => {
    expect(luoguSeedProblems).toHaveLength(20);
    expect(luoguSeedProblems.map((problem) => problem.id)).toContain("P1205");
    expect(luoguSeedProblems.map((problem) => problem.id)).toContain("P1161");
  });

  test("looks up seed metadata by platform and id", () => {
    const problem = findSeedProblem("luogu", "P5732");

    expect(problem?.title).toContain("杨辉三角");
    expect(problem?.url).toBe("https://www.luogu.com.cn/problem/P5732");
  });
});
