import { describe, expect, test } from "vitest";
import { hasSubstantiveStudentCode, normalizeScoreOjVerdict } from "../src/teaching/solutionScoreGate";

describe("solution score gate", () => {
  test("does not default missing OJ status to AC", () => {
    expect(normalizeScoreOjVerdict(undefined)).toEqual({ status: "UNKNOWN" });
    expect(normalizeScoreOjVerdict({ status: "AC" })).toEqual({ status: "AC" });
  });

  test("rejects the generated pass-only practice template as non-substantive", () => {
    expect(
      hasSubstantiveStudentCode(`
import sys

input = sys.stdin.readline

def solve():
    pass

if __name__ == "__main__":
    solve()
`)
    ).toBe(false);
  });

  test("accepts code that contains real problem logic", () => {
    expect(
      hasSubstantiveStudentCode(`
def solve():
    nums = list(map(int, input().split()))
    print(sum(nums))
`)
    ).toBe(true);
  });
});
