import type { ProblemDocument } from "../core/contracts";

export const WARMUP_PROBLEM_KEYS = [
  "warmup:stdio-sum",
  "warmup:two-sum",
  "warmup:binary-search-first"
] as const;

export type WarmupProblemKey = (typeof WARMUP_PROBLEM_KEYS)[number];

const BUILTIN_FETCHED_AT = "2026-01-01T00:00:00.000Z";

const STDIO_SUM_PROBLEM: ProblemDocument = {
  schemaVersion: "problem-doc/v2",
  problemKey: "warmup:stdio-sum",
  source: "warmup-pack",
  sourceId: "stdio-sum",
  title: "多组整数求和与边界检验 (Multi-Case A+B)",
  locale: "zh-CN",
  completeness: "full",
  ioMode: "stdio",
  statementMarkdown: [
    "# 多组整数求和与边界检验 (Multi-Case A+B)",
    "",
    "## 题目描述",
    "给定 `T` 组测试数据，每组包含两个整数 `a` 和 `b`。请依次输出每组 `a + b` 的结果。",
    "",
    "本题用于熟悉 ACM/OI 标准输入输出（Stdio）流程、本地一键跑样例（`Ctrl+Alt+R` / `Cmd+Alt+R`）以及 64 位整数溢出边界。",
    "",
    "## 输入格式",
    "- 第一行包含一个正整数 `T`（`1 <= T <= 10^5`）。",
    "- 接下来 `T` 行，每行包含两个以空格分隔的整数 `a` 和 `b`（`-10^12 <= a, b <= 10^12`）。",
    "",
    "## 输出格式",
    "- 共输出 `T` 行，第 `i` 行输出第 `i` 组测试数据的 `a + b`。",
    "",
    "## 提示",
    "- 注意 `a, b` 的范围超过 32 位有符号整数上限（`2^31 - 1`），C++ 需使用 `long long`。"
  ].join("\n"),
  samples: [
    {
      id: "orig-1",
      input: "3\n1 2\n-5 5\n100 250\n",
      expectedOutput: "3\n0\n350\n",
      explanation: "常规正数、正负抵消归零与三位整数相加。",
      isOriginal: true
    },
    {
      id: "orig-2",
      input: "2\n0 0\n-1000000000000 -1000000000000\n",
      expectedOutput: "0\n-2000000000000\n",
      explanation: "零值与 64 位负边界值（C++ 使用 int 会溢出）。",
      isOriginal: true
    },
    {
      id: "orig-3",
      input: "2\n1000000000000 1000000000000\n999999999999 -1000000000000\n",
      expectedOutput: "2000000000000\n-1\n",
      explanation: "正 64 位上界与大数相减。",
      isOriginal: true
    }
  ],
  constraints: {
    timeLimitMs: 1000,
    memoryLimitMb: 256
  },
  difficulty: {
    rawLabel: "Warmup · Stdio",
    numericRating: 800,
    normalizedTier: 1
  },
  rawTags: ["stdio", "implementation", "64-bit-integer"],
  conceptTags: ["implementation"],
  provenance: {
    ingestChannel: "warmup-builtin",
    fetchedAt: BUILTIN_FETCHED_AT
  }
};

const TWO_SUM_PYTHON_SNIPPET = [
  "class Solution:",
  "    def twoSum(self, nums: list[int], target: int) -> list[int]:",
  "        pass"
].join("\n");

const TWO_SUM_CPP_SNIPPET = [
  "#include <vector>",
  "using namespace std;",
  "",
  "class Solution {",
  "public:",
  "    vector<int> twoSum(vector<int>& nums, int target) {",
  "        ",
  "    }",
  "};"
].join("\n");

const TWO_SUM_PROBLEM: ProblemDocument = {
  schemaVersion: "problem-doc/v2",
  problemKey: "warmup:two-sum",
  source: "warmup-pack",
  sourceId: "two-sum",
  title: "两数之和 (Two Sum · Function Harness)",
  locale: "zh-CN",
  completeness: "full",
  ioMode: "function",
  statementMarkdown: [
    "# 两数之和 (Two Sum)",
    "",
    "## 题目描述",
    "给定一个整数数组 `nums` 和一个整数目标值 `target`，请你在该数组中找出 **和为目标值 `target`** 的那两个整数，并返回它们的数组下标（0-based）。",
    "",
    "你可以假设每种输入只会对应一个答案，且不能使用两次相同的元素。你可以按任意顺序返回答案。",
    "",
    "本题用于体验 LeetCode 风格的 Function-Harness（函数签名模式）本地评测，无需手写 `main` 函数。",
    "",
    "## 数据范围",
    "- `2 <= nums.length <= 10^4`",
    "- `-10^9 <= nums[i] <= 10^9`",
    "- `-10^9 <= target <= 10^9`",
    "- 只会存在一个有效答案。",
    "",
    "## 思考提示",
    "- 暴力双重循环为 `O(n^2)`；思考如何用哈希表在单次扫描内做到 `O(n)`，同时避免同一个元素被匹配两次。"
  ].join("\n"),
  samples: [
    {
      id: "orig-1",
      input: "[2,7,11,15]\n9\n",
      expectedOutput: "[0,1]\n",
      explanation: "nums[0] + nums[1] == 9，返回 [0, 1]。",
      isOriginal: true
    },
    {
      id: "orig-2",
      input: "[3,2,4]\n6\n",
      expectedOutput: "[1,2]\n",
      explanation: "注意 nums[0] == 3 不能与自身配对成 6，正确答案为 [1, 2]。",
      isOriginal: true
    },
    {
      id: "orig-3",
      input: "[3,3]\n6\n",
      expectedOutput: "[0,1]\n",
      explanation: "存在重复值但下标不同，返回 [0, 1]。",
      isOriginal: true
    }
  ],
  functionMeta: {
    entryName: "twoSum",
    params: [
      { name: "nums", type: "integer[]" },
      { name: "target", type: "integer" }
    ],
    returnType: "integer[]",
    codeSnippets: {
      python: TWO_SUM_PYTHON_SNIPPET,
      python3: TWO_SUM_PYTHON_SNIPPET,
      cpp: TWO_SUM_CPP_SNIPPET
    }
  },
  constraints: {
    timeLimitMs: 1000,
    memoryLimitMb: 256
  },
  difficulty: {
    rawLabel: "Easy",
    numericRating: 900,
    normalizedTier: 1
  },
  rawTags: ["array", "hash-table", "function-harness"],
  conceptTags: ["hash_table", "array"],
  provenance: {
    ingestChannel: "warmup-builtin",
    fetchedAt: BUILTIN_FETCHED_AT
  }
};

const BINARY_SEARCH_FIRST_PROBLEM: ProblemDocument = {
  schemaVersion: "problem-doc/v2",
  problemKey: "warmup:binary-search-first",
  source: "warmup-pack",
  sourceId: "binary-search-first",
  title: "有序数组中首次出现位置 (Binary Search First Occurrence)",
  locale: "zh-CN",
  completeness: "full",
  ioMode: "stdio",
  statementMarkdown: [
    "# 有序数组中首次出现位置 (First Occurrence in Sorted Array)",
    "",
    "## 题目描述",
    "给定一个按**非降序排列**的整数数组 `a[0..n-1]`（可能包含重复元素）以及 `q` 次查询。每次查询给出一个目标整数 `target`，请输出 `target` 在数组中**第一次出现**的 0-based 下标；若 `target` 不存在，输出 `-1`。",
    "",
    "本题包含经典的二分边界陷阱（重复元素收缩方向、循环终止条件、`mid` 溢出及不存在判断），适合用于体验本地 WA diff 与 L1–L5 苏格拉底干跑（Dry-Run）。",
    "",
    "## 输入格式",
    "- 第一行包含两个整数 `n` 和 `q`（`1 <= n, q <= 2 * 10^5`）。",
    "- 第二行包含 `n` 个非降序整数 `a_0, a_1, ..., a_{n-1}`（`-10^9 <= a_i <= 10^9`）。",
    "- 第三行包含 `q` 个查询整数 `target_1, ..., target_q`（`-10^9 <= target_j <= 10^9`）。",
    "",
    "## 输出格式",
    "- 输出一行共 `q` 个整数，以单个空格分隔，表示每次查询的结果。",
    "",
    "## 复杂度要求",
    "- 单次查询时间复杂度应为 `O(log n)`，总时间复杂度 `O((n + q) log n)`。"
  ].join("\n"),
  samples: [
    {
      id: "orig-1",
      input: "7 4\n1 2 2 2 5 8 8\n2 8 3 1\n",
      expectedOutput: "1 5 -1 0\n",
      explanation: "重复元素 2 首次出现在下标 1，8 在下标 5，3 不存在返回 -1，首元素 1 在下标 0。",
      isOriginal: true
    },
    {
      id: "orig-2",
      input: "1 3\n42\n41 42 43\n",
      expectedOutput: "-1 0 -1\n",
      explanation: "单元素数组边界：小于、等于、大于目标值。",
      isOriginal: true
    },
    {
      id: "orig-3",
      input: "5 3\n5 5 5 5 5\n5 4 6\n",
      expectedOutput: "0 -1 -1\n",
      explanation: "全相等数组必须收敛到下标 0，而非中间下标 2。",
      isOriginal: true
    },
    {
      id: "orig-4",
      input: "4 2\n-1000000000 -5 0 1000000000\n-1000000000 1000000000\n",
      expectedOutput: "0 3\n",
      explanation: "极端首尾边界与负数坐标。",
      isOriginal: true
    }
  ],
  constraints: {
    timeLimitMs: 1000,
    memoryLimitMb: 256
  },
  difficulty: {
    rawLabel: "Warmup · Binary Search",
    numericRating: 1100,
    normalizedTier: 2
  },
  rawTags: ["binary-search", "boundary-cases", "lower-bound"],
  conceptTags: ["binary_search"],
  provenance: {
    ingestChannel: "warmup-builtin",
    fetchedAt: BUILTIN_FETCHED_AT
  }
};

export const WARMUP_PROBLEMS: readonly ProblemDocument[] = Object.freeze([
  STDIO_SUM_PROBLEM,
  TWO_SUM_PROBLEM,
  BINARY_SEARCH_FIRST_PROBLEM
]);

const WARMUP_BY_KEY = new Map<string, ProblemDocument>(
  WARMUP_PROBLEMS.map((doc) => [doc.problemKey, doc])
);

const STDIO_STARTER_CODE: Record<WarmupProblemKey, Record<"python" | "cpp", string>> = {
  "warmup:stdio-sum": {
    python: [
      "import sys",
      "",
      "def solve() -> None:",
      "    data = sys.stdin.read().split()",
      "    if not data:",
      "        return",
      "    # TODO: read T pairs and print a + b",
      "",
      'if __name__ == "__main__":',
      "    solve()",
      ""
    ].join("\n"),
    cpp: [
      "#include <iostream>",
      "using namespace std;",
      "",
      "int main() {",
      "    ios::sync_with_stdio(false);",
      "    cin.tie(nullptr);",
      "    int t;",
      "    if (!(cin >> t)) return 0;",
      "    // TODO: read each pair (a, b) with 64-bit integer and print a + b",
      "    return 0;",
      "}",
      ""
    ].join("\n")
  },
  "warmup:two-sum": {
    python: TWO_SUM_PYTHON_SNIPPET + "\n",
    cpp: TWO_SUM_CPP_SNIPPET + "\n"
  },
  "warmup:binary-search-first": {
    python: [
      "import sys",
      "",
      "def first_occurrence(arr: list[int], target: int) -> int:",
      "    # TODO: implement O(log n) binary search for first occurrence",
      "    return -1",
      "",
      "def solve() -> None:",
      "    data = sys.stdin.read().split()",
      "    if not data:",
      "        return",
      "    n, q = int(data[0]), int(data[1])",
      "    arr = [int(x) for x in data[2 : 2 + n]]",
      "    queries = [int(x) for x in data[2 + n : 2 + n + q]]",
      '    print(" ".join(str(first_occurrence(arr, x)) for x in queries))',
      "",
      'if __name__ == "__main__":',
      "    solve()",
      ""
    ].join("\n"),
    cpp: [
      "#include <iostream>",
      "#include <vector>",
      "using namespace std;",
      "",
      "int firstOccurrence(const vector<long long>& a, long long target) {",
      "    // TODO: implement O(log n) binary search for first occurrence",
      "    return -1;",
      "}",
      "",
      "int main() {",
      "    ios::sync_with_stdio(false);",
      "    cin.tie(nullptr);",
      "    int n, q;",
      "    if (!(cin >> n >> q)) return 0;",
      "    vector<long long> a(n);",
      "    for (int i = 0; i < n; ++i) cin >> a[i];",
      "    for (int i = 0; i < q; ++i) {",
      "        long long target;",
      "        cin >> target;",
      '        if (i > 0) cout << " ";',
      "        cout << firstOccurrence(a, target);",
      "    }",
      '    cout << "\\n";',
      "    return 0;",
      "}",
      ""
    ].join("\n")
  }
};

export function getWarmupProblems(): ProblemDocument[] {
  return WARMUP_PROBLEMS.map((doc) => structuredClone(doc));
}

export function getWarmupProblemByKey(problemKey: string): ProblemDocument | undefined {
  const found = WARMUP_BY_KEY.get(problemKey);
  return found ? structuredClone(found) : undefined;
}

export function isWarmupProblemKey(problemKey: string): problemKey is WarmupProblemKey {
  return WARMUP_BY_KEY.has(problemKey);
}

export function getWarmupStarterCode(
  problemKey: string,
  language: "python" | "cpp"
): string | undefined {
  if (!isWarmupProblemKey(problemKey)) {
    return undefined;
  }
  return STDIO_STARTER_CODE[problemKey][language];
}
