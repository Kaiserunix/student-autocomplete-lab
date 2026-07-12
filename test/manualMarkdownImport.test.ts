import { describe, expect, test } from "vitest";
import { buildManualProblemFromMarkdownFile } from "../src/sidebar/manualMarkdownImport";

describe("manual markdown import builder", () => {
  test("builds a manual problem record from the supported authoring format", () => {
    const problem = buildManualProblemFromMarkdownFile({
      filePath: "C:\\Users\\qwerf\\Desktop\\校园昵称规范器.md",
      sourceUrl: "file:///C:/Users/qwerf/Desktop/%E6%A0%A1%E5%9B%AD.md",
      now: 1778429000000,
      markdown: [
        "# 校园昵称规范器",
        "",
        "- 难度: 1",
        "- 标签: 输入输出, 字符串, 模拟",
        "",
        "## 题面",
        "新生群昵称格式不统一。",
        "",
        "## 输入格式",
        "第一行一个整数 `n`。",
        "",
        "## 输出格式",
        "输出 `n` 行。",
        "",
        "## 样例 1",
        "### 输入",
        "```text",
        "1",
        "张三-计算机2301",
        "```",
        "### 输出",
        "```text",
        "张三 | 计算机 | 2301",
        "```",
        "",
        "## 提示",
        "注意清理首尾空格。"
      ].join("\n")
    });

    expect(problem).toMatchObject({
      platform: "manual",
      id: "manual-1778429000000",
      title: "校园昵称规范器",
      difficulty: 1,
      tags: ["输入输出", "字符串", "模拟"],
      inputFormat: "第一行一个整数 `n`。",
      outputFormat: "输出 `n` 行。",
      hint: "注意清理首尾空格。"
    });
    expect(problem.samples).toEqual([
      {
        input: "1\n张三-计算机2301",
        output: "张三 | 计算机 | 2301"
      }
    ]);
  });
});
