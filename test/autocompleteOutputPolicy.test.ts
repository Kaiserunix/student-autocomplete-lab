import { describe, expect, test } from "vitest";
import { validateAutocompleteOutput } from "../src/skills/validators/autocompleteOutputPolicy";

describe("autocomplete output policy", () => {
  test("distinguishes an empty model response", () => {
    expect(validateAutocompleteOutput("", 3, "python")).toEqual({
      status: "model-empty",
      suggestion: ""
    });
  });

  test("rejects explanations without returning their text", () => {
    expect(validateAutocompleteOutput("Here is the code:\nreturn value", 3, "python")).toEqual({
      status: "validator-rejected",
      suggestion: "",
      rejectionReason: "explanation"
    });
    expect(validateAutocompleteOutput("代码如下：\nreturn value", 3, "python")).toEqual({
      status: "validator-rejected",
      suggestion: "",
      rejectionReason: "explanation"
    });
  });

  test("rejects a problem-context marker without returning its text", () => {
    expect(validateAutocompleteOutput("# Problem: hidden statement", 3, "python")).toEqual({
      status: "validator-rejected",
      suggestion: "",
      rejectionReason: "context-marker"
    });
  });

  test("classifies a fully filtered skill preamble as validator rejection", () => {
    expect(validateAutocompleteOutput("# skill head: local code only", 3, "python")).toEqual({
      status: "validator-rejected",
      suggestion: "",
      rejectionReason: "empty-after-filter"
    });
  });

  test("keeps at most three contiguous code lines", () => {
    expect(validateAutocompleteOutput(
      "if value:\n    total += value\nreturn total\nprint(total)",
      3,
      "python"
    )).toEqual({
      status: "success",
      suggestion: "if value:\n    total += value\nreturn total"
    });
  });

  test("strips an echoed language-native skill preamble", () => {
    expect(validateAutocompleteOutput(
      "// skill tail: controlled rule\ntotal += values[i];",
      3,
      "cpp"
    )).toEqual({
      status: "success",
      suggestion: "total += values[i];"
    });
  });

  test("strips echoed generic/chat layer controls", () => {
    expect(validateAutocompleteOutput(
      "[head] local code only\n[tail] check loop bounds\nreturn value",
      3,
      "python"
    )).toEqual({
      status: "success",
      suggestion: "return value"
    });
  });
});
