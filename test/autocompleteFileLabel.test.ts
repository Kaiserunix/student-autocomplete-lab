import { describe, expect, test } from "vitest";
import { stableAutocompleteFileLabel } from "../src/autocomplete/fileLabel";

describe("autocomplete file label", () => {
  test("masks problem IDs and absolute parents in practice files", () => {
    expect(stableAutocompleteFileLabel(
      "C:\\Users\\Ada\\practice\\luogu\\P1030.py"
    )).toBe("practice/luogu/problem.py");
  });

  test("keeps only a stable tail for ordinary files", () => {
    expect(stableAutocompleteFileLabel(
      "C:\\Users\\Ada\\project\\src\\solution.cpp"
    )).toBe("src/solution.cpp");
  });

  test("masks multi-letter online-judge problem IDs", () => {
    expect(stableAutocompleteFileLabel(
      "C:\\Users\\Ada\\project\\CF1791A.cpp"
    )).toBe("problem.cpp");
  });
});
