import { describe, expect, test, vi } from "vitest";
import { limitCompletionLines } from "../src/autocomplete/filter";
import { requestMimoAutocomplete } from "../src/autocomplete/mimoAutocomplete";
import { buildAutocompletePrompt, buildMimoAutocompletePrompt } from "../src/autocomplete/prompt";
import { isSupportedAutocompleteLanguage, shouldRequestInlineCompletion } from "../src/autocomplete/triggerPolicy";
import type { ModelTextRequest } from "../src/models/modelTextTransport";

describe("autocomplete safety", () => {
  test("limits model output to at most three non-empty lines", () => {
    const output = limitCompletionLines(`
return a

return b
return c
return d
`);

    expect(output).toBe("return a");
  });

  test("keeps adjacent non-empty lines up to the line limit", () => {
    const output = limitCompletionLines("if x:\n    return x\nreturn 0\nreturn 1");

    expect(output).toBe("if x:\n    return x\nreturn 0");
  });

  test("removes markdown fences and cursor placeholders", () => {
    expect(limitCompletionLines("ans += x\nprint(ans)\n```")).toBe("ans += x\nprint(ans)");
    expect(limitCompletionLines("<|cursor|>")).toBe("");
    expect(limitCompletionLines("<cursor>ut().strip())\n    for i in range(n):")).toBe("ut().strip())\n    for i in range(n):");
  });

  test("removes prompt echo from noisy model completions", () => {
    expect(
      limitCompletionLines(
        [
          "# Problem: 校园昵称规范器",
          "# Source: Luogu",
          "# Tags: 字符串, 模拟",
          "Safe coding habits:",
          "- Prefer direct student code.",
          "- Return only the immediate local continuation.",
          "n = int(input().strip())",
          "for _ in range(n):"
        ].join("\n")
      )
    ).toBe("n = int(input().strip())\nfor _ in range(n):");
    expect(limitCompletionLines("the first line is the number of nicknames\nn = int(input())")).toBe("n = int(input())");
  });

  test("removes Chinese problem and reference-answer echo from noisy completions", () => {
    expect(
      limitCompletionLines(
        [
          "# 题面：输入两个整数，输出它们的和。",
          "# 标准答案：print(a + b)",
          "ans = a + b",
          "print(ans)"
        ].join("\n")
      )
    ).toBe("ans = a + b\nprint(ans)");
  });

  test("builds autocomplete prompt without problem statement data", () => {
    const prompt = buildAutocompletePrompt({
      prefix: "def add(a, b):\n    ",
      suffix: "\nprint(add(1, 2))",
      language: "python",
      filePath: "C:/tmp/main.py",
      habits: ["Prefer direct Python."],
      activeProblem: {
        title: "Secret Full Problem",
        statement: "The hidden statement must never enter autocomplete.",
        referenceSolution: "return a + b"
      }
    });

    expect(prompt).toContain("def add");
    expect(prompt).toContain("Prefer direct Python.");
    expect(prompt.trimEnd().endsWith("Completion:")).toBe(true);
    expect(prompt).not.toContain("print(add(1, 2))");
    expect(prompt).not.toContain("hidden statement");
    expect(prompt).not.toContain("referenceSolution");
    expect(prompt).not.toContain("return a + b");
  });

  test("builds a MiMo prefix-completion prompt without suffix or problem data", () => {
    const prompt = buildMimoAutocompletePrompt({
      prefix: "def add(a, b):\n    ",
      suffix: "\nprint(add(1, 2))",
      language: "python",
      filePath: "trial.py",
      habits: ["Prefer direct Python."],
      activeProblem: {
        title: "Secret Full Problem",
        statement: "The hidden statement must never enter autocomplete.",
        referenceSolution: "return a + b"
      }
    });

    expect(prompt).toContain("def add(a, b):");
    expect(prompt).toContain("Prefer direct Python.");
    expect(prompt).not.toContain("print(add(1, 2))");
    expect(prompt).not.toContain("hidden statement");
    expect(prompt).not.toContain("return a + b");
  });

  test("keeps autocomplete prompt file context stable without absolute workspace paths", () => {
    const prompt = buildMimoAutocompletePrompt({
      prefix: "def solve():\n    ",
      suffix: "",
      language: "python",
      filePath: "C:\\Users\\qwerf\\Desktop\\Source\\leetcodepy\\practice\\luogu\\P1001.py",
      habits: []
    });

    expect(prompt).toContain("File: luogu/P1001.py");
    expect(prompt).not.toContain("C:\\Users\\qwerf");
    expect(prompt).not.toContain("Desktop\\Source\\leetcodepy");
  });

  test("requests inline completion after indentation even before a non-space token exists", () => {
    expect(shouldRequestInlineCompletion("  ")).toBe(true);
    expect(shouldRequestInlineCompletion("    ")).toBe(true);
    expect(shouldRequestInlineCompletion("    ans")).toBe(true);
    expect(shouldRequestInlineCompletion("")).toBe(false);
  });

  test("does not trigger inline completion on comment-only prefixes", () => {
    expect(shouldRequestInlineCompletion("# Problem: 校园昵称规范器")).toBe(false);
    expect(shouldRequestInlineCompletion("    # TODO")).toBe(false);
    expect(shouldRequestInlineCompletion("// comment")).toBe(false);
    expect(shouldRequestInlineCompletion("def solve")).toBe(true);
  });

  test("limits inline completion to supported code languages", () => {
    expect(isSupportedAutocompleteLanguage("python")).toBe(true);
    expect(isSupportedAutocompleteLanguage("cpp")).toBe(true);
    expect(isSupportedAutocompleteLanguage("c")).toBe(true);
    expect(isSupportedAutocompleteLanguage("rust")).toBe(true);
    expect(isSupportedAutocompleteLanguage("markdown")).toBe(false);
    expect(isSupportedAutocompleteLanguage("plaintext")).toBe(false);
  });

  test("keeps teaching-only data out of the Codex OAuth autocomplete request", async () => {
    const requests: ModelTextRequest[] = [];
    const generate = vi.fn(async (request: ModelTextRequest) => {
      requests.push(request);
      return "return a + b";
    });
    const input = {
      prefix: "def add(a, b):\n    ",
      suffix: "\nprint(add(1, 2))",
      language: "python",
      filePath: "C:/workspace/student/main.py",
      habits: ["Prefer direct Python."],
      activeProblem: { statement: "The hidden statement" },
      teacherPack: "Teacher Pack secret",
      standardAnswer: "standard answer secret",
      coachThread: "coach thread secret"
    };

    await requestMimoAutocomplete(
      {
        mode: "openai",
        authMode: "codex-oauth",
        model: "gpt-5.3-codex-spark",
        format: "codex-app-server",
        transport: { generate }
      },
      input
    );

    const request = requests[0]!;
    expect(request.prompt).toContain("def add(a, b)");
    expect(request.prompt).toContain("print(add(1, 2))");
    expect(request.prompt).not.toContain("The hidden statement");
    expect(request.prompt).not.toContain("Teacher Pack secret");
    expect(request.prompt).not.toContain("standard answer secret");
    expect(request.prompt).not.toContain("coach thread secret");
  });
});
