import { describe, expect, test } from "vitest";
import { parseManualProblemMarkdown } from "../src/problemBank/manualProblemParser";

describe("manual problem parser", () => {
  test("parses the AI problem writing standard into a structured problem", () => {
    const problem = parseManualProblemMarkdown({
      fallbackTitle: "",
      markdown: [
        "# 校园昵称规范器",
        "",
        "- 难度: 2",
        "- 标签: 输入输出, 字符串, 模拟",
        "",
        "## 题面",
        "给定若干行昵称，把首尾空格删掉，并把空格替换成下划线。",
        "",
        "## 输入格式",
        "第一行一个整数 n。",
        "接下来 n 行，每行一个昵称。",
        "",
        "## 输出格式",
        "输出 n 行规范后的昵称。",
        "",
        "## 样例 1",
        "### 输入",
        "```text",
        "2",
        " Alice Bob ",
        "Carol",
        "```",
        "### 输出",
        "```text",
        "Alice_Bob",
        "Carol",
        "```",
        "",
        "## 样例 2",
        "### 输入",
        "```",
        "1",
        "A B C",
        "```",
        "### 输出",
        "```",
        "A_B_C",
        "```",
        "",
        "## 提示",
        "注意不要输出提示语。"
      ].join("\n")
    });

    expect(problem.title).toBe("校园昵称规范器");
    expect(problem.difficulty).toBe(2);
    expect(problem.tags).toEqual(["输入输出", "字符串", "模拟"]);
    expect(problem.statement).toContain("给定若干行昵称");
    expect(problem.inputFormat).toContain("第一行一个整数 n");
    expect(problem.outputFormat).toContain("输出 n 行");
    expect(problem.samples).toEqual([
      {
        input: "2\n Alice Bob \nCarol",
        output: "Alice_Bob\nCarol"
      },
      {
        input: "1\nA B C",
        output: "A_B_C"
      }
    ]);
    expect(problem.hint).toBe("注意不要输出提示语。");
  });

  test("parses campus nickname normalizer Markdown from file import", () => {
    const problem = parseManualProblemMarkdown({
      fallbackTitle: "",
      markdown: [
        "# 校园昵称规范器",
        "",
        "- 难度: 1",
        "- 标签: 输入输出, 字符串, 模拟",
        "",
        "## 题面",
        "新生群昵称格式不统一。每个昵称由“姓名”和“专业班级信息”组成，中间可能用 `-` 或 `_` 分隔，首尾也可能有多余空格。",
        "",
        "请把每个昵称整理成统一格式：`姓名 | 专业方向 | 班级编号`。",
        "",
        "## 输入格式",
        "第一行一个整数 `n`，表示昵称数量，`1 <= n <= 100`。",
        "",
        "接下来 `n` 行，每行一个昵称。保证每个昵称中恰好包含一个分隔符 `-` 或 `_`，分隔符左侧是姓名，右侧是专业方向和班级编号。班级编号从右侧字段中第一个数字开始。",
        "",
        "## 输出格式",
        "输出 `n` 行，每行格式为 `姓名 | 专业方向 | 班级编号`。",
        "",
        "竞赛题输出不能包含 `请输入`、`结果是` 等额外提示文字。",
        "",
        "## 样例 1",
        "### 输入",
        "```text",
        "3",
        "  张三-计算机2301",
        "李四_软件2302",
        "王五- AI 2303",
        "```",
        "### 输出",
        "```text",
        "张三 | 计算机 | 2301",
        "李四 | 软件 | 2302",
        "王五 | AI | 2303",
        "```",
        "",
        "## 提示",
        "注意清理首尾空格。专业方向可能是英文缩写，例如 `AI`，不要用固定长度切分。"
      ].join("\n")
    });

    expect(problem.title).toBe("校园昵称规范器");
    expect(problem.difficulty).toBe(1);
    expect(problem.tags).toEqual(["输入输出", "字符串", "模拟"]);
    expect(problem.statement).toContain("新生群昵称格式不统一");
    expect(problem.statement).toContain("姓名 | 专业方向 | 班级编号");
    expect(problem.inputFormat).toContain("1 <= n <= 100");
    expect(problem.outputFormat).toContain("竞赛题输出不能包含");
    expect(problem.samples).toEqual([
      {
        input: "3\n  张三-计算机2301\n李四_软件2302\n王五- AI 2303",
        output: "张三 | 计算机 | 2301\n李四 | 软件 | 2302\n王五 | AI | 2303"
      }
    ]);
    expect(problem.hint).toContain("不要用固定长度切分");
  });

  test("keeps loose Markdown usable when no structured headings exist", () => {
    const problem = parseManualProblemMarkdown({
      fallbackTitle: "A+B Problem",
      markdown: "输入两个整数 $a, b$，输出它们的和。"
    });

    expect(problem.title).toBe("A+B Problem");
    expect(problem.statement).toBe("输入两个整数 $a, b$，输出它们的和。");
    expect(problem.inputFormat).toBe("");
    expect(problem.outputFormat).toBe("");
    expect(problem.samples).toEqual([]);
  });

  test("parses compact sample input and output headings", () => {
    const problem = parseManualProblemMarkdown({
      fallbackTitle: "",
      markdown: [
        "# A+B Problem",
        "## 题目描述",
        "输入两个整数，输出它们的和。",
        "## 输入格式",
        "两个整数。",
        "## 输出格式",
        "一个整数。",
        "## 样例输入 1",
        "```text",
        "20 30",
        "```",
        "## 样例输出 1",
        "```text",
        "50",
        "```"
      ].join("\n")
    });

    expect(problem.title).toBe("A+B Problem");
    expect(problem.statement).toContain("输入两个整数");
    expect(problem.samples).toEqual([
      {
        input: "20 30",
        output: "50"
      }
    ]);
  });

  test("parses English contest-problem Markdown headings", () => {
    const problem = parseManualProblemMarkdown({
      fallbackTitle: "",
      markdown: [
        "# Campus Nickname Normalizer",
        "",
        "- Difficulty: 1",
        "- Tags: input-output, string, simulation",
        "",
        "## Problem Statement",
        "New student group nicknames are inconsistent. Normalize each nickname into `name | major | class_id`.",
        "",
        "## Input",
        "The first line contains an integer `n`, where `1 <= n <= 100`.",
        "Each of the next `n` lines contains one nickname.",
        "",
        "## Output",
        "Print `n` lines in the normalized format.",
        "",
        "## Example 1",
        "### Input",
        "```text",
        "2",
        "Alice-CS2301",
        "Bob_AI2302",
        "```",
        "### Output",
        "```text",
        "Alice | CS | 2301",
        "Bob | AI | 2302",
        "```",
        "",
        "## Constraints",
        "Do not print prompts such as `please input`.",
        "",
        "## Notes",
        "Major names may contain English abbreviations."
      ].join("\n")
    });

    expect(problem.title).toBe("Campus Nickname Normalizer");
    expect(problem.difficulty).toBe(1);
    expect(problem.tags).toEqual(["input-output", "string", "simulation"]);
    expect(problem.statement).toContain("Normalize each nickname");
    expect(problem.inputFormat).toContain("The first line contains");
    expect(problem.outputFormat).toContain("Print `n` lines");
    expect(problem.samples).toEqual([
      {
        input: "2\nAlice-CS2301\nBob_AI2302",
        output: "Alice | CS | 2301\nBob | AI | 2302"
      }
    ]);
    expect(problem.hint).toContain("Do not print prompts");
    expect(problem.hint).toContain("English abbreviations");
  });
});
