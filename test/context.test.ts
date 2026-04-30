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
      text: "abc",
      offset: 99,
      language: "plaintext",
      filePath: "note.txt"
    });

    expect(input.prefix).toBe("abc");
    expect(input.suffix).toBe("");
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
});
