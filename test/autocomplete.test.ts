import { describe, expect, test } from "vitest";
import { limitCompletionLines } from "../src/autocomplete/filter";
import { buildAutocompletePrompt } from "../src/autocomplete/prompt";

describe("autocomplete safety", () => {
  test("limits model output to at most three non-empty lines", () => {
    const output = limitCompletionLines(`
return a

return b
return c
return d
`);

    expect(output).toBe("return a\nreturn b\nreturn c");
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
    expect(prompt).not.toContain("hidden statement");
    expect(prompt).not.toContain("referenceSolution");
    expect(prompt).not.toContain("return a + b");
  });
});
