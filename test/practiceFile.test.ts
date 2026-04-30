import { describe, expect, test } from "vitest";
import { buildPracticeFileContent, buildPracticeFileRelativePath } from "../src/sidebar/practiceFile";

describe("practice file helper", () => {
  test("creates stable workspace-relative paths for supported languages", () => {
    const problem = {
      platform: "luogu" as const,
      id: "P5730",
      title: "显示屏"
    };

    expect(buildPracticeFileRelativePath(problem, "python")).toBe("practice/luogu/P5730.py");
    expect(buildPracticeFileRelativePath(problem, "c")).toBe("practice/luogu/P5730.c");
    expect(buildPracticeFileRelativePath(problem, "cpp")).toBe("practice/luogu/P5730.cpp");
    expect(buildPracticeFileRelativePath(problem, "rust")).toBe("practice/luogu/P5730.rs");
  });

  test("creates a Chinese header without leaking the full statement into starter code", () => {
    const content = buildPracticeFileContent(
      {
        platform: "luogu",
        id: "P5730",
        title: "显示屏",
        sourceUrl: "https://www.luogu.com.cn/problem/P5730"
      },
      "python"
    );

    expect(content).toContain("题目：P5730 显示屏");
    expect(content).toContain("链接：https://www.luogu.com.cn/problem/P5730");
    expect(content).toContain("import sys");
    expect(content).not.toContain("液晶屏上，每个阿拉伯数字");
  });
});
