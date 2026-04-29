import { describe, expect, test } from "vitest";
import { buildAutocompleteInputFromText } from "../src/autocomplete/context";

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
});
