import { describe, expect, test } from "vitest";
import { limitCompletionLines } from "../src/autocomplete/filter";
import { buildAutocompletePrompt, buildMimoAutocompletePrompt } from "../src/autocomplete/prompt";

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
});
