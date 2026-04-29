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
  });

  test("fails clearly when a problem has no local oracle", () => {
    expect(() => getPracticeTestCases("P0000")).toThrow(/No local practice oracle/);
  });
});
