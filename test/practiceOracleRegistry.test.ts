import { describe, expect, test } from "vitest";
import { getPracticeTestCases } from "../src/practice/oracleRegistry";

describe("practice oracle registry", () => {
  test("provides small teaching tests for the first binary-tree pack", () => {
    expect(getPracticeTestCases("P4913")).toEqual(
      expect.arrayContaining([
        {
          input: "5\n2 3\n4 5\n0 0\n0 0\n0 0\n",
          expectedOutput: "3\n",
          note: "balanced tree depth"
        }
      ])
    );
    expect(getPracticeTestCases("P1030")[0]).toMatchObject({
      input: "BADC\nBDCA\n",
      expectedOutput: "ABCD\n"
    });
    expect(getPracticeTestCases("P1364")[0]).toMatchObject({
      expectedOutput: "81\n"
    });
    expect(getPracticeTestCases("P5711")).toHaveLength(4);
    expect(getPracticeTestCases("P2249")[0]).toMatchObject({
      expectedOutput: "1 2 -1\n"
    });
    expect(getPracticeTestCases("P1601")[1]).toMatchObject({
      expectedOutput: "10100\n"
    });
    expect(getPracticeTestCases("P2240")[0]).toMatchObject({
      expectedOutput: "240.00\n"
    });
    expect(getPracticeTestCases("P1551")[0]).toMatchObject({
      expectedOutput: "Yes\nYes\nNo\n"
    });
    expect(getPracticeTestCases("P5318")[0]).toMatchObject({
      expectedOutput: "1 2 5 6 3 7 8 4\n1 2 3 4 5 6 7 8\n"
    });
  });

  test("fails clearly when a problem has no local oracle", () => {
    expect(() => getPracticeTestCases("P0000")).toThrow(/No local practice oracle/);
  });
});
