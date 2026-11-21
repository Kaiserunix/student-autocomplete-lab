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
  ],
  P5711: [
    {
      input: "2000\n",
      expectedOutput: "1\n",
      note: "century divisible by 400 is a leap year"
    },
    {
      input: "1900\n",
      expectedOutput: "0\n",
      note: "century not divisible by 400 is not a leap year"
    },
    {
      input: "2024\n",
      expectedOutput: "1\n",
      note: "regular multiple of 4 is a leap year"
    },
    {
      input: "2023\n",
      expectedOutput: "0\n",
      note: "ordinary non-leap year"
    }
  ],
  P2249: [
    {
      input: "11 3\n1 3 3 3 5 7 9 11 13 15 15\n1 3 6\n",
      expectedOutput: "1 2 -1\n",
      note: "first occurrence with duplicates and miss"
    },
    {
      input: "1 2\n5\n5 4\n",
      expectedOutput: "1 -1\n",
      note: "single element hit and miss"
    },
    {
      input: "4 2\n2 2 2 2\n2 3\n",
      expectedOutput: "1 -1\n",
      note: "all equal elements return 1-based leftmost index"
    }
  ],
  P1601: [
    {
      input: "1\n1\n",
      expectedOutput: "2\n",
      note: "single-digit addition"
    },
    {
      input: "1001\n9099\n",
      expectedOutput: "10100\n",
      note: "final carry extends digit length"
    },
    {
      input: "999\n1\n",
      expectedOutput: "1000\n",
      note: "unequal lengths with cascading carry"
    }
  ],
  P2240: [
    {
      input: "4 50\n10 60\n20 100\n30 120\n15 45\n",
      expectedOutput: "240.00\n",
      note: "greedy fractional knapsack by unit value"
    },
    {
      input: "2 5\n10 10\n4 8\n",
      expectedOutput: "9.00\n",
      note: "fractional remainder from second pile"
    },
    {
      input: "1 10\n5 12\n",
      expectedOutput: "12.00\n",
      note: "capacity larger than all available piles"
    }
  ],
  P1551: [
    {
      input: "6 5 3\n1 2\n1 5\n3 4\n5 2\n1 3\n1 4\n2 3\n5 6\n",
      expectedOutput: "Yes\nYes\nNo\n",
      note: "transitive union-find connectivity"
    },
    {
      input: "4 3 2\n1 2\n3 4\n2 3\n1 4\n1 1\n",
      expectedOutput: "Yes\nYes\n",
      note: "two components merged via bridge edge plus self-query"
    }
  ],
  P5318: [
    {
      input: "8 9\n1 2\n1 3\n1 4\n2 5\n2 6\n3 7\n4 7\n4 8\n7 8\n",
      expectedOutput: "1 2 5 6 3 7 8 4\n1 2 3 4 5 6 7 8\n",
      note: "directed DFS and BFS ordered by smallest vertex"
    },
    {
      input: "4 4\n1 4\n1 2\n2 4\n4 1\n",
      expectedOutput: "1 2 4\n1 2 4\n",
      note: "directed cycle with unsorted input edges"
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
