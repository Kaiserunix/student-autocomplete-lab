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

  test("creates a neutral header without leaking problem identity into starter code", () => {
    const content = buildPracticeFileContent(
      {
        platform: "luogu",
        id: "P5730"
      },
      "python"
    );

    expect(content).toContain("提醒：题面在插件侧栏查看；自动补全只读取学生代码区。");
    expect(content).toContain("import sys");
    expect(content).not.toContain("P5730");
    expect(content).not.toContain("显示屏");
    expect(content).not.toContain("https://www.luogu.com.cn/problem/P5730");
    expect(content).not.toContain("液晶屏上，每个阿拉伯数字");
  });
});
