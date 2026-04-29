import { PracticeTestCase } from "./testCase";

const PRACTICE_TEST_CASES: Record<string, PracticeTestCase[]> = {
  P1427: [
    {
      input: "1 2 3 0\n",
      expectedOutput: "3 2 1\n",
      note: "basic reverse before sentinel"
    },
    {
      input: "0\n",
      expectedOutput: "\n",
      note: "empty sequence before sentinel"
    },
    {
      input: "1 2 0 9 8\n",
      expectedOutput: "2 1\n",
      note: "ignore values after sentinel"
    }
  ],
  P4913: [
    {
      input: "5\n2 3\n4 5\n0 0\n0 0\n0 0\n",
      expectedOutput: "3\n",
      note: "balanced tree depth"
    },
    {
      input: "1\n0 0\n",
      expectedOutput: "1\n",
      note: "single node depth is one"
    },
    {
      input: "4\n2 0\n3 0\n4 0\n0 0\n",
      expectedOutput: "4\n",
      note: "left chain depth"
    }
  ],
  P1030: [
    {
      input: "BADC\nBDCA\n",
      expectedOutput: "ABCD\n",
      note: "sample-like reconstruction"
    },
    {
      input: "ABC\nACB\n",
      expectedOutput: "BAC\n",
      note: "root in the middle with both children"
    },
    {
      input: "A\nA\n",
      expectedOutput: "A\n",
      note: "single node traversal"
    }
  ],
  P1364: [
    {
      input: "5\n13 2 3\n4 0 0\n12 4 5\n20 0 0\n40 0 0\n",
      expectedOutput: "81\n",
      note: "official-shaped weighted tree"
    },
    {
      input: "1\n7 0 0\n",
      expectedOutput: "0\n",
      note: "single node has zero movement cost"
    },
    {
      input: "3\n1 2 3\n10 0 0\n1 0 0\n",
      expectedOutput: "3\n",
      note: "best hospital can be a leaf"
    }
  ]
};

export function getPracticeTestCases(problemId: string): PracticeTestCase[] {
  const cases = PRACTICE_TEST_CASES[problemId];
  if (!cases) {
    throw new Error(`No local practice oracle is registered for ${problemId}.`);
  }

  return cases;
}
