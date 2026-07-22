import { describe, expect, test } from "vitest";
import {
  inlineCompletionContinuation,
  inlineCompletionPresentation
} from "../src/autocomplete/inlineCompletionPresentation";

describe("inline completion presentation", () => {
  test("turns a whitespace-different echoed C statement into a cursor continuation", () => {
    const prefix = "        total+=";
    const continuation = inlineCompletionContinuation(prefix, "total += values[i];");
    expect(continuation).toBe(" values[i];");
    expect(prefix + continuation).toBe("        total+= values[i];");
  });

  test("removes an echoed partial identifier", () => {
    expect(inlineCompletionContinuation("    ret", "return total;")).toBe("urn total;");
  });

  test("keeps a suggestion that is already a continuation", () => {
    expect(
      inlineCompletionContinuation("        total +=", " values[i];")
    ).toBe(" values[i];");
  });

  test("only reconciles the first line of a multiline completion", () => {
    expect(
      inlineCompletionContinuation("    pri", "print(total)\nreturn total")
    ).toBe("nt(total)\nreturn total");
  });

  test("deduplicates an echoed operator at the cursor", () => {
    const prefix = "value +";
    const continuation = inlineCompletionContinuation(prefix, "+ offset");
    expect(prefix + continuation).toBe("value + offset");
  });

  test("does not ignore a trailing space while matching a partial identifier", () => {
    expect(inlineCompletionContinuation("    ret ", "return total;")).toBe("");
  });

  test("preserves an exact space inside an echoed string prefix", () => {
    const prefix = "    print(\"a ";
    const continuation = inlineCompletionContinuation(prefix, "\"a b\")");
    expect(prefix + continuation).toBe("    print(\"a b\")");
  });

  test("deduplicates a single Unicode identifier character", () => {
    const prefix = "    值";
    const continuation = inlineCompletionContinuation(prefix, "值 + 1");
    expect(prefix + continuation).toBe("    值 + 1");
  });

  test("extends the selected completion text and requests its exact range", () => {
    expect(inlineCompletionPresentation({
      linePrefix: "    ret",
      suggestion: "return total;",
      selectedCompletion: {
        text: "return",
        rangeStartCharacter: 4
      }
    })).toEqual({
      insertText: "return total;",
      useSelectedCompletionRange: true
    });
  });

  test("suppresses a preview that cannot extend the selected completion", () => {
    expect(inlineCompletionPresentation({
      linePrefix: "    total +=",
      suggestion: " values[i];",
      selectedCompletion: {
        text: "return",
        rangeStartCharacter: 4
      }
    })).toBeUndefined();
  });

  test("uses the model result for an IntelliSense fuzzy match", () => {
    expect(inlineCompletionPresentation({
      linePrefix: "    rtrn",
      suggestion: "return total;",
      selectedCompletion: {
        text: "return",
        rangeStartCharacter: 4
      }
    })).toEqual({
      insertText: "return total;",
      useSelectedCompletionRange: true
    });
  });

  test("does not duplicate the existing suffix at a mid-line cursor", () => {
    const prefix = "    return val";
    const continuation = inlineCompletionContinuation(prefix, "return value;", ";");
    expect(prefix + continuation + ";").toBe("    return value;");
  });
});
