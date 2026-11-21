import { describe, expect, it } from "vitest";
import { compareOutput } from "../../src/runner";

describe("diffChecker", () => {
  it("token mode ignores trailing spaces, blank lines, and CRLF line endings", () => {
    const res = compareOutput("1 2  \r\n3   \r\n\r\n", "1 2\n3\n", { mode: "token" });
    expect(res.passed).toBe(true);

    const mismatch = compareOutput("1 2\n4\n", "1 2\n3\n", { mode: "token" });
    expect(mismatch.passed).toBe(false);
    expect(mismatch.diffSummary).toContain("expected \"3\"");
    expect(mismatch.diffSummary).toContain("got \"4\"");
  });

  it("exact mode checks verbatim character equality including trailing whitespace and CRLF", () => {
    expect(compareOutput("hello\n", "hello\n", { mode: "exact" }).passed).toBe(true);
    expect(compareOutput("hello \n", "hello\n", { mode: "exact" }).passed).toBe(false);
    expect(compareOutput("hello\r\n", "hello\n", { mode: "exact" }).passed).toBe(false);
  });

  it("float-epsilon mode validates absolute and relative numeric tolerance", () => {
    expect(
      compareOutput("3.1415926\n1000000.5", "3.1415929\n1000000.0", {
        mode: "float-epsilon",
        floatEpsilon: 1e-6
      }).passed
    ).toBe(true);

    const fail = compareOutput("3.14", "3.15", {
      mode: "float-epsilon",
      floatEpsilon: 1e-4
    });
    expect(fail.passed).toBe(false);
    expect(fail.diffSummary).toContain("outside epsilon");
  });

  it("json-unordered mode compares arrays and nested arrays order-insensitively", () => {
    expect(
      compareOutput("[1, 0]", "[0, 1]", { mode: "json-unordered" }).passed
    ).toBe(true);

    expect(
      compareOutput(
        '[["tan","nat"],["bat"],["ate","eat","tea"]]',
        '[["bat"],["nat","tan"],["ate","eat","tea"]]',
        { mode: "json-unordered" }
      ).passed
    ).toBe(true);

    expect(
      compareOutput('{"b":2,"a":1}', '{"a":1,"b":2}', { mode: "json-unordered" }).passed
    ).toBe(true);

    const invalid = compareOutput("not-json", "[1,2]", { mode: "json-unordered" });
    expect(invalid.passed).toBe(false);
    expect(invalid.diffSummary).toContain("not valid JSON");
  });
});
