import { describe, expect, test } from "vitest";
import { buildAutocompleteInputFromText, extractStudentCodeFromText } from "../src/autocomplete/context";

describe("autocomplete context extraction", () => {
  test("splits document text into prefix and suffix around the cursor offset", () => {
    const input = buildAutocompleteInputFromText({
      text: "def add(a, b):\n    \nprint(add(1, 2))\n",
      offset: "def add(a, b):\n    ".length,
      language: "python",
      filePath: "trial.py"
    });

    expect(input).toEqual({
      prefix: "def add(a, b):\n    ",
      suffix: "\nprint(add(1, 2))\n",
      language: "python",
      filePath: "trial.py"
    });
  });

  test("bounds cursor offset inside the document", () => {
    const input = buildAutocompleteInputFromText({
      text: "answer = 1",
      offset: 99,
      language: "python",
      filePath: "note.txt"
    });

    expect(input.prefix).toBe("answer = 1");
    expect(input.suffix).toBe("");
  });

  test("keeps common Python OJ unpacking assignments as real code", () => {
    const text = "n, m = map(int, input().split())\n";
    const input = buildAutocompleteInputFromText({
      text,
      offset: text.length,
      language: "python",
      filePath: "practice/luogu/P1001.py"
    });

    expect(input.prefix).toBe(text);
  });

  test("keeps common Python setup calls as real code", () => {
    const text = "sys.setrecursionlimit(10 ** 6)\n";
    const input = buildAutocompleteInputFromText({
      text,
      offset: text.length,
      language: "python",
      filePath: "practice/luogu/P4913.py"
    });

    expect(input.prefix).toBe(text);
  });

  test("limits autocomplete context to the student code section when markers exist", () => {
    const text = [
      "# 题目：P5730 显示屏",
      "# 链接：https://www.luogu.com.cn/problem/P5730",
      "# 这里如果有题面，也不能进入补全 prompt",
      "# ===== 学生代码开始 =====",
      "import sys",
      "",
      "def solve():",
      "    ",
      "",
      "# ===== 学生代码结束 =====",
      "# AI 讲解和题面备注也不能进入 suffix"
    ].join("\n");
    const offset = text.indexOf("    ") + 4;

    const input = buildAutocompleteInputFromText({
      text,
      offset,
      language: "python",
      filePath: "practice/luogu/P5730.py"
    });

    expect(input.prefix).toContain("def solve():");
    expect(input.prefix).not.toContain("P5730");
    expect(input.prefix).not.toContain("题面");
    expect(input.suffix).not.toContain("AI 讲解");
    expect(input.suffix).not.toContain("学生代码结束");
    expect(extractStudentCodeFromText(text)).not.toContain("P5730");
    expect(extractStudentCodeFromText(text)).toContain("def solve():");
  });

  test("strips problem prose and reference answers when no student markers exist", () => {
    const text = [
      "# 题目：校园昵称规范器",
      "# 题面：把每个昵称整理成统一格式。",
      "# 输入格式：第一行一个整数 n。",
      "# 样例输出：张三 | 计算机 | 2301",
      "# 标准答案：这里不应该进入补全 prompt",
      "",
      "import sys",
      "",
      "def solve():",
      "    n = int(sys.stdin.readline())",
      "    ",
      "",
      "if __name__ == \"__main__\":",
      "    solve()",
      "",
      "# AI 讲解：这个也不应该进入 suffix"
    ].join("\n");
    const offset = text.indexOf("    ", text.indexOf("n = int")) + 4;

    const input = buildAutocompleteInputFromText({
      text,
      offset,
      language: "python",
      filePath: "practice/manual/nickname.py"
    });

    expect(input.prefix).toContain("import sys");
    expect(input.prefix).toContain("def solve():");
    expect(input.prefix).not.toContain("校园昵称规范器");
    expect(input.prefix).not.toContain("标准答案");
    expect(input.prefix).not.toContain("样例输出");
    expect(input.suffix).not.toContain("AI 讲解");
  });

  test("strips problem prose even when it appears after real code", () => {
    const text = [
      "import sys",
      "input = sys.stdin.readline",
      "# 标准答案：这里不能进入补全 prompt",
      "# return sorted(secret_problem_data)",
      "",
      "def solve():",
      "    "
    ].join("\n");

    const input = buildAutocompleteInputFromText({
      text,
      offset: text.length,
      language: "python",
      filePath: "practice/manual/problem.py"
    });

    expect(input.prefix).toContain("import sys");
    expect(input.prefix).toContain("def solve():");
    expect(input.prefix).not.toContain("标准答案");
    expect(input.prefix).not.toContain("secret_problem_data");
  });

  test("does not use problem prose as prefix before any real code exists", () => {
    const text = [
      "# 题面：输入两个整数，输出它们的和。",
      "# 样例输出：3",
      "# 参考答案：print(a + b)",
      "    "
    ].join("\n");

    const input = buildAutocompleteInputFromText({
      text,
      offset: text.length,
      language: "python",
      filePath: "practice/manual/empty.py"
    });

    expect(input.prefix).toBe("");
    expect(input.prefix).not.toContain("参考答案");
    expect(input.prefix).not.toContain("print(a + b)");
  });
});
