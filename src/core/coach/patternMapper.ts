import type { ProblemDocument } from "../contracts";
import { normalizeConceptTags, type ConceptTagId } from "../learner/taxonomy";

export interface ScaleComplexityBudget {
  detectedMaxN?: number;
  detectedExponent?: number;
  targetComplexity: string;
  explanationZh: string;
  explanationEn: string;
}

export interface PatternCandidate {
  patternId: string;
  conceptTag: ConceptTagId;
  nameZh: string;
  nameEn: string;
  confidence: number;
  matchedSignals: string[];
  expectedComplexity: string;
  decisionQuestionZh: string;
  decisionQuestionEn: string;
}

export interface DecisionTreeStep {
  step: number;
  questionZh: string;
  questionEn: string;
  ifYesZh: string;
  ifYesEn: string;
  ifNoZh: string;
  ifNoEn: string;
}

export interface ConfusablePatternPair {
  id: string;
  leftNameZh: string;
  leftNameEn: string;
  rightNameZh: string;
  rightNameEn: string;
  keyDifferenceZh: string;
  keyDifferenceEn: string;
  quickCheckZh: string;
  quickCheckEn: string;
  relatedPatternIds: readonly string[];
}

export interface PatternMapAnalysis {
  problemKey: string;
  scaleBudget: ScaleComplexityBudget;
  candidates: PatternCandidate[];
  decisionTree: DecisionTreeStep[];
  confusablePairs: ConfusablePatternPair[];
  thirtySecondSummaryZh: string;
  thirtySecondSummaryEn: string;
}

interface PatternRule {
  patternId: string;
  conceptTag: ConceptTagId;
  nameZh: string;
  nameEn: string;
  expectedComplexity: string;
  keywords: RegExp[];
  preferredMaxN?: [number, number]; // exponent range [minExp, maxExp]
  decisionQuestionZh: string;
  decisionQuestionEn: string;
}

const PATTERN_RULES: readonly PatternRule[] = [
  {
    patternId: "binary_search",
    conceptTag: "array.binary_search",
    nameZh: "二分查找 / 二分答案",
    nameEn: "Binary Search / Search on Answer",
    expectedComplexity: "O(log n) ~ O(n log V)",
    keywords: [
      /\b(?:sorted|non-decreasing|monotonic|first occurrence|last occurrence|lower_bound|upper_bound)\b/i,
      /\b(?:minimum possible maximum|maximum possible minimum|minimize the maximum|maximize the minimum)\b/i,
      /(?:有序|单调|不降|非递减|第一次出现|最后一次出现|最大值最小|最小值最大|二分)/
    ],
    preferredMaxN: [4, 18],
    decisionQuestionZh: "答案或判定函数是否具备「一边全合法、另一边全不合法」的单调性？",
    decisionQuestionEn: "Does the feasibility predicate split the search space monotonically into valid vs invalid halves?"
  },
  {
    patternId: "sliding_window",
    conceptTag: "array.sliding_window",
    nameZh: "滑动窗口",
    nameEn: "Sliding Window",
    expectedComplexity: "O(n)",
    keywords: [
      /\b(?:contiguous subarray|longest substring|shortest subarray|window|at most k distinct|subarray sum)\b/i,
      /(?:连续子数组|连续子串|最长子串|最短子数组|滑动窗口|滑窗|窗口)/
    ],
    preferredMaxN: [4, 7],
    decisionQuestionZh: "目标是否是连续区间，且右端点右移后只需单向收缩左端点即可恢复合法性？",
    decisionQuestionEn: "Are you tracking a contiguous subarray/substring where expanding right only requires monotonic left shrinking?"
  },
  {
    patternId: "two_pointers",
    conceptTag: "array.two_pointers",
    nameZh: "双指针（对撞 / 快慢）",
    nameEn: "Two Pointers (Converging / Fast-Slow)",
    expectedComplexity: "O(n) or O(n log n)",
    keywords: [
      /\b(?:two sum|three sum|pair|in-place|remove duplicates|palindrome|merge two sorted|container with most water)\b/i,
      /(?:两数之和|三数之和|回文|原地去重|有序数组|双指针|相向)/
    ],
    preferredMaxN: [4, 7],
    decisionQuestionZh: "排序后（或利用有序性），两端指针能否根据当前和/大小关系确定性地排除一侧？",
    decisionQuestionEn: "Once ordered, can moving either pointer deterministically eliminate impossible pairs?"
  },
  {
    patternId: "prefix_sum",
    conceptTag: "array.prefix_sum",
    nameZh: "前缀和与差分（+ 哈希）",
    nameEn: "Prefix Sum / Difference Array (+ Hash)",
    expectedComplexity: "O(n)",
    keywords: [
      /\b(?:range sum|subarray sum equals|sum of subarray|range add|prefix sum|multiple queries)\b/i,
      /(?:区间和|子数组和|区间加|前缀和|差分|多次查询)/
    ],
    preferredMaxN: [4, 7],
    decisionQuestionZh: "是否包含大量静态区间求和、含负数的子数组和统计，或批量区间加减？",
    decisionQuestionEn: "Are there repeated range-sum queries, subarray-sum counts with negatives, or batch range updates?"
  },
  {
    patternId: "dp",
    conceptTag: "dp.linear",
    nameZh: "动态规划（DP）",
    nameEn: "Dynamic Programming (DP)",
    expectedComplexity: "O(n) ~ O(n * W) / O(n^2)",
    keywords: [
      /\b(?:number of ways|count ways|maximum profit|minimum cost|subsequence|knapsack|dp|mod 10\^9|1000000007)\b/i,
      /(?:方案数|多少种方式|最长上升子序列|公共子序列|背包|最小代价|最大收益|取模|动态规划)/
    ],
    preferredMaxN: [1, 4],
    decisionQuestionZh: "局部最优是否可能被后续状态推翻（存在重叠子问题且需记录历史状态）？",
    decisionQuestionEn: "Can a locally optimal choice fail globally, requiring overlapping subproblems with explicit state transitions?"
  },
  {
    patternId: "greedy",
    conceptTag: "greedy.interval_and_sort",
    nameZh: "贪心（排序 / 区间调度）",
    nameEn: "Greedy (Sorting / Interval Scheduling)",
    expectedComplexity: "O(n log n)",
    keywords: [
      /\b(?:interval|meeting|schedule|fractional|maximum number of non-overlapping|minimum arrows|jump game|greedy)\b/i,
      /(?:区间|活动安排|会议室|部分背包|可分割|最少次数|贪心|性价比)/
    ],
    preferredMaxN: [4, 7],
    decisionQuestionZh: "能否用「邻项交换论证」证明选出当前极值决策不会破坏全局最优？",
    decisionQuestionEn: "Can an exchange argument prove that taking the locally optimal choice never blocks the global optimum?"
  },
  {
    patternId: "bfs",
    conceptTag: "graph.traversal",
    nameZh: "广度优先搜索（BFS）",
    nameEn: "Breadth-First Search (BFS)",
    expectedComplexity: "O(V + E)",
    keywords: [
      /\b(?:shortest path|minimum steps|minimum moves|level order|grid|maze|unweighted|nearest)\b/i,
      /(?:最少步数|最短步数|层序遍历|迷宫|网格|无权图|最近距离|广搜|bfs)/i
    ],
    preferredMaxN: [2, 6],
    decisionQuestionZh: "每一步代价是否相同（边权全为 1），且目标是最少步数或按层扩散？",
    decisionQuestionEn: "Do all transitions have uniform cost (weight 1) and ask for the minimum number of steps or level-by-level traversal?"
  },
  {
    patternId: "shortest_path",
    conceptTag: "graph.shortest_path",
    nameZh: "带权最短路（Dijkstra / SPFA / Floyd）",
    nameEn: "Weighted Shortest Path (Dijkstra / Bellman-Ford)",
    expectedComplexity: "O((V + E) log V)",
    keywords: [
      /\b(?:weighted graph|dijkstra|bellman|floyd|network delay|cheapest flights|edge weight|minimum travel time)\b/i,
      /(?:带权图|边权|最短路径|最短路|最小耗时|负权边|dijkstra)/i
    ],
    preferredMaxN: [2, 6],
    decisionQuestionZh: "图上边权是否非负（Dijkstra）或存在负权边（Bellman-Ford/SPFA）？",
    decisionQuestionEn: "Are edge weights non-negative (Dijkstra) or can negative weights appear (Bellman-Ford/SPFA)?"
  },
  {
    patternId: "dfs_tree",
    conceptTag: "tree.traversal",
    nameZh: "DFS / 树遍历与子树递归",
    nameEn: "DFS / Tree Traversal & Subtree Recursion",
    expectedComplexity: "O(V + E)",
    keywords: [
      /\b(?:binary tree|preorder|inorder|postorder|depth|height|subtree|root|leaf|ancestor|lca|connected components)\b/i,
      /(?:二叉树|先序|中序|后序|子树|深度|根节点|叶子|连通块|深搜|dfs)/i
    ],
    preferredMaxN: [1, 6],
    decisionQuestionZh: "问题能否拆解为「先求解左右子树/邻居状态，再合并回当前节点」？",
    decisionQuestionEn: "Can the answer at a node be composed directly from its children/subtrees via recursion?"
  },
  {
    patternId: "backtracking",
    conceptTag: "recursion.backtracking",
    nameZh: "回溯搜索（DFS + 撤销现场）",
    nameEn: "Backtracking (Search + Undo Choice)",
    expectedComplexity: "O(2^n) or O(n!)",
    keywords: [
      /\b(?:all permutations|all subsets|combinations|n-queens|sudoku|generate all|word search)\b/i,
      /(?:全排列|所有子集|组合总和|八皇后|数独|所有方案|枚举所有|回溯)/
    ],
    preferredMaxN: [0, 2],
    decisionQuestionZh: "数据规模是否很小（n ≤ 20）且题目要求枚举/输出所有合法方案？",
    decisionQuestionEn: "Is the input small (n <= 20) and asking to enumerate all valid configurations?"
  },
  {
    patternId: "dsu",
    conceptTag: "ds.dsu",
    nameZh: "并查集（DSU）",
    nameEn: "Disjoint Set Union (DSU)",
    expectedComplexity: "O(alpha(n)) per op",
    keywords: [
      /\b(?:union find|disjoint set|same group|connected|equivalence|transitive|redundant connection|merge sets)\b/i,
      /(?:亲戚|朋友|连通性|合并集合|同一集合|传递性|并查集|连通分量)/
    ],
    preferredMaxN: [3, 7],
    decisionQuestionZh: "是否反复执行「合并两个元素的等价关系」与「查询两者是否连通」？",
    decisionQuestionEn: "Do operations repeatedly merge equivalence classes and query whether two elements belong to the same component?"
  },
  {
    patternId: "monotonic_stack",
    conceptTag: "ds.monotonic_stack",
    nameZh: "单调栈 / 单调队列",
    nameEn: "Monotonic Stack / Deque",
    expectedComplexity: "O(n)",
    keywords: [
      /\b(?:next greater|next smaller|largest rectangle|histogram|daily temperatures|sliding window maximum)\b/i,
      /(?:下一个更大|下一个更小|左边第一个|柱状图|最大矩形|滑动窗口最大值|单调栈|单调队列)/
    ],
    preferredMaxN: [4, 7],
    decisionQuestionZh: "是否需要为每个元素快速找左/右侧第一个比它大或小的元素，或维护定长窗口最值？",
    decisionQuestionEn: "Do you need the nearest greater/smaller element to the left/right, or the extremum over a moving window?"
  },
  {
    patternId: "hash_table",
    conceptTag: "ds.hash_table",
    nameZh: "哈希表（频次 / 补数查表）",
    nameEn: "Hash Table (Frequency / Complement Lookup)",
    expectedComplexity: "O(n)",
    keywords: [
      /\b(?:frequency|anagram|duplicate|complement|seen before|two sum|distinct|count pairs)\b/i,
      /(?:出现次数|去重|异位词|两数之和|频次|是否存在|哈希)/
    ],
    preferredMaxN: [4, 7],
    decisionQuestionZh: "能否用 O(1) 空间换时间，记录已扫描过的值/前缀和来替代内层查找循环？",
    decisionQuestionEn: "Can an O(1) lookup table of seen values or prefix sums eliminate an inner search loop?"
  },
  {
    patternId: "heap",
    conceptTag: "ds.heap",
    nameZh: "堆 / 优先队列",
    nameEn: "Heap / Priority Queue",
    expectedComplexity: "O(n log k)",
    keywords: [
      /\b(?:top k|kth largest|kth smallest|median|merge k sorted|priority queue|smallest k)\b/i,
      /(?:第 k 大|第 k 小|前 k 个|中位数|动态最值|优先队列|堆)/
    ],
    preferredMaxN: [4, 7],
    decisionQuestionZh: "数据是否动态增删，同时每步只需要快速取出当前最大或最小元素？",
    decisionQuestionEn: "Are elements inserted/removed dynamically while you repeatedly need the current minimum or maximum?"
  }
];

export const CONFUSABLE_PATTERN_PAIRS: readonly ConfusablePatternPair[] = [
  {
    id: "two_pointers_vs_sliding_window",
    leftNameZh: "双指针（对撞/同向）",
    leftNameEn: "Two Pointers",
    rightNameZh: "滑动窗口",
    rightNameEn: "Sliding Window",
    keyDifferenceZh: "对撞双指针多用于已排序序列求配对/极值（不要求区间连续）；滑动窗口专攻「连续子数组/子串」且依赖窗口扩张/收缩的单调性。",
    keyDifferenceEn: "Converging two pointers operate on sorted arrays for pairs/bounds (non-contiguous); sliding window maintains a CONTIGUOUS subarray/substring with monotonic shrink.",
    quickCheckZh: "问自己：是否要求元素在原数组中连续？含负数时滑窗单调性还成立吗？（含负数求子数组和应改用前缀和+哈希）",
    quickCheckEn: "Ask: Must elements be contiguous? If negative numbers exist, does shrinking remain monotonic? (If not, switch to Prefix Sum + Hash.)",
    relatedPatternIds: ["two_pointers", "sliding_window", "prefix_sum"]
  },
  {
    id: "dp_vs_greedy",
    leftNameZh: "动态规划（DP）",
    leftNameEn: "Dynamic Programming",
    rightNameZh: "贪心（Greedy）",
    rightNameEn: "Greedy",
    keyDifferenceZh: "贪心每步只留一个局部最优决策且永不反悔（需交换论证或反例检验）；DP 保留所有可能影响未来的子状态组合。",
    keyDifferenceEn: "Greedy commits to one irrevocable local choice (requires exchange-argument proof); DP retains overlapping subproblem states when local choices can mislead.",
    quickCheckZh: "30 秒防坑测试：随便造一个 3 元素反例（如硬币面值 [1, 3, 4] 凑 6），若贪心翻车则立刻切 DP！",
    quickCheckEn: "30s sanity test: try a tiny counterexample (e.g., coins [1, 3, 4] for target 6). If greedy fails once, switch to DP immediately.",
    relatedPatternIds: ["dp", "greedy"]
  },
  {
    id: "bfs_vs_dfs",
    leftNameZh: "广度优先搜索（BFS）",
    leftNameEn: "Breadth-First Search (BFS)",
    rightNameZh: "深度优先搜索（DFS）",
    rightNameEn: "Depth-First Search (DFS)",
    keyDifferenceZh: "BFS 按层推进，天然保证无权图首次抵达即最少步数；DFS 沿路径深入，适合子树聚合、连通块、拓扑/环检测与路径枚举。",
    keyDifferenceEn: "BFS explores level-by-level guaranteeing shortest unweighted path on first visit; DFS goes deep for subtree aggregation, components, cycles, and path search.",
    quickCheckZh: "问自己：要求「最少步数/最短距离」且边权全为 1 吗？是 → BFS（记得入队即标 visited）；否则常选 DFS。",
    quickCheckEn: "Ask: Need minimum steps on uniform-weight edges? Yes -> BFS (mark visited on enqueue); otherwise DFS is usually cleaner.",
    relatedPatternIds: ["bfs", "dfs_tree", "shortest_path"]
  },
  {
    id: "backtracking_vs_dfs",
    leftNameZh: "回溯（Backtracking）",
    leftNameEn: "Backtracking",
    rightNameZh: "图/树 DFS",
    rightNameEn: "Graph / Tree DFS",
    keyDifferenceZh: "普通图 DFS 每个节点全局只访问一次（不撤销 visited）；回溯是在决策树上枚举所有组合，离开分支时必须撤销选择与访问标记。",
    keyDifferenceEn: "Standard graph DFS visits each node once globally; backtracking explores a decision tree and MUST undo choices/visited flags when unwinding.",
    quickCheckZh: "看数据范围：n ≤ 20 且要枚举全部方案 → 回溯；n ≥ 10^4 → 绝不能指数回溯，需剪枝、DP 或线性图 DFS。",
    quickCheckEn: "Check constraints: n <= 20 & enumerate all -> Backtracking; n >= 10^4 -> exponential backtracking will TLE; use linear DFS or DP.",
    relatedPatternIds: ["backtracking", "dfs_tree", "dp"]
  },
  {
    id: "binary_search_index_vs_answer",
    leftNameZh: "下标二分（序列查找）",
    leftNameEn: "Index Binary Search",
    rightNameZh: "二分答案（值域判定）",
    rightNameEn: "Binary Search on Answer",
    keyDifferenceZh: "下标二分在有序数组里定位元素；二分答案在原数组无序时，对「最终答案的值域」做二分并写 O(n) check(mid) 判定。",
    keyDifferenceEn: "Index binary search locates elements in a sorted array; binary search on answer searches the monotonic value domain using an O(n) feasibility check(mid).",
    quickCheckZh: "看到「最大值最小 / 最小值最大 / 至少需要多少天」立刻想到二分答案！",
    quickCheckEn: "Keywords like 'minimize the maximum', 'maximize the minimum', or 'minimum capacity/days' strongly signal Binary Search on Answer.",
    relatedPatternIds: ["binary_search", "greedy"]
  },
  {
    id: "monotonic_stack_vs_heap",
    leftNameZh: "单调栈 / 单调队列",
    leftNameEn: "Monotonic Stack / Deque",
    rightNameZh: "堆 / 优先队列",
    rightNameEn: "Heap / Priority Queue",
    keyDifferenceZh: "单调栈/队列维护「位置与数值双单调」的近邻极值，均摊 O(n)；堆维护全局动态 Top-K 或任意最值，单次 O(log n)。",
    keyDifferenceEn: "Monotonic stack/deque tracks nearest greater/smaller or window extrema in amortized O(n); heaps maintain global dynamic extrema or Top-K in O(log n).",
    quickCheckZh: "问自己：是否只关心「左边/右边第一个更大/更小」？是 → 单调栈 O(n)；若要随时弹全局最值 → 堆。",
    quickCheckEn: "Ask: Only care about nearest greater/smaller element? -> Monotonic Stack O(n). Need global min/max across arbitrary insertions? -> Heap.",
    relatedPatternIds: ["monotonic_stack", "heap"]
  }
];

export function inferScaleComplexityBudget(text: string): ScaleComplexityBudget {
  const detected = extractMaxConstraintExponent(text);
  if (!detected) {
    return {
      targetComplexity: "O(n log n) or O(n)",
      explanationZh: "题面未显式给出 N 的幂次上限，默认按 O(n log n) 或 O(n) 预算设计并核对题目数据规模。",
      explanationEn: "No explicit N bound detected; default to an O(n log n) or O(n) complexity budget and double-check constraints."
    };
  }

  const { maxN, exponent } = detected;
  if (exponent <= 1.4 || maxN <= 25) {
    return {
      detectedMaxN: maxN,
      detectedExponent: exponent,
      targetComplexity: "O(2^n) / O(n!) / Bitmask DP",
      explanationZh: `检测到较小规模上限（约 ${maxN}），允许指数级回溯搜索、状态压缩 DP 或高次多项式。`,
      explanationEn: `Small scale detected (~${maxN}): backtracking, bitmask DP, or higher-degree polynomial algorithms fit comfortably.`
    };
  }
  if (maxN <= 500) {
    return {
      detectedMaxN: maxN,
      detectedExponent: exponent,
      targetComplexity: "O(n^3)",
      explanationZh: `检测到规模约 ${maxN}，可承受 O(n^3)（如 Floyd、区间 DP 或三重枚举）。`,
      explanationEn: `Scale around ${maxN} permits O(n^3) solutions (e.g., Floyd-Warshall, interval DP).`
    };
  }
  if (maxN <= 5000) {
    return {
      detectedMaxN: maxN,
      detectedExponent: exponent,
      targetComplexity: "O(n^2)",
      explanationZh: `检测到规模约 ${maxN}，O(n^2) 通常可通过（如二维 DP 或双层扫描），但需避免 O(n^3)。`,
      explanationEn: `Scale around ${maxN} allows O(n^2) (e.g., 2D DP or pairwise scan), but O(n^3) will TLE.`
    };
  }
  if (maxN <= 2_000_000) {
    return {
      detectedMaxN: maxN,
      detectedExponent: exponent,
      targetComplexity: "O(n log n) or O(n)",
      explanationZh: `检测到规模约 10^${Math.round(exponent)}（${maxN}），必须控制在 O(n log n) 或 O(n)；O(n^2) 必然 TLE！`,
      explanationEn: `Scale around 10^${Math.round(exponent)} (${maxN}) requires O(n log n) or O(n); O(n^2) will TLE.`
    };
  }
  return {
    detectedMaxN: maxN,
    detectedExponent: exponent,
    targetComplexity: "O(log n) / O(sqrt(n)) / O(1)",
    explanationZh: `检测到超大数值规模（约 10^${Math.round(exponent)}），不能线性枚举值域，需 O(log n) 二分/快速幂或 O(sqrt(n)) 数学推导。`,
    explanationEn: `Very large bound (~10^${Math.round(exponent)}): linear iteration over the value domain will TLE; aim for O(log n), O(sqrt(n)), or O(1).`
  };
}

/**
 * 30-second problem pattern recognition engine:
 * Combines input constraints, statement keywords, and normalized tags into
 * ranked candidate patterns, a concise decision tree, and confusable-pair disambiguation.
 */
export function analyzeProblemPattern(problem: ProblemDocument): PatternMapAnalysis {
  const combinedText = [
    problem.title,
    problem.statementMarkdown ?? "",
    problem.rawTags.join(" "),
    (problem.conceptTags ?? []).join(" ")
  ].join("\n");

  const scaleBudget = inferScaleComplexityBudget(combinedText);
  const existingConceptTags = new Set<ConceptTagId>([
    ...normalizeConceptTags(problem.conceptTags ?? []),
    ...normalizeConceptTags(problem.rawTags)
  ]);

  const scored: PatternCandidate[] = [];

  for (const rule of PATTERN_RULES) {
    const matchedSignals: string[] = [];
    let score = 0;

    if (existingConceptTags.has(rule.conceptTag)) {
      score += 0.45;
      matchedSignals.push(`tag:${rule.conceptTag}`);
    }

    for (const kw of rule.keywords) {
      const m = combinedText.match(kw);
      if (m) {
        score += 0.3;
        matchedSignals.push(`keyword:${m[0].slice(0, 28)}`);
      }
    }

    if (
      score > 0 &&
      rule.preferredMaxN &&
      scaleBudget.detectedExponent !== undefined
    ) {
      const [minExp, maxExp] = rule.preferredMaxN;
      if (scaleBudget.detectedExponent >= minExp && scaleBudget.detectedExponent <= maxExp) {
        score += 0.15;
        matchedSignals.push(`scale:10^${Math.round(scaleBudget.detectedExponent)}`);
      } else if (rule.patternId === "backtracking" && scaleBudget.detectedExponent >= 4) {
        score -= 0.35;
      }
    }

    if (score >= 0.25) {
      scored.push({
        patternId: rule.patternId,
        conceptTag: rule.conceptTag,
        nameZh: rule.nameZh,
        nameEn: rule.nameEn,
        confidence: Math.min(0.98, Math.round(score * 100) / 100),
        matchedSignals,
        expectedComplexity: rule.expectedComplexity,
        decisionQuestionZh: rule.decisionQuestionZh,
        decisionQuestionEn: rule.decisionQuestionEn
      });
    }
  }

  scored.sort((a, b) => b.confidence - a.confidence || a.patternId.localeCompare(b.patternId));

  // Ensure at least 2 useful candidates for 30s decision training
  const candidates =
    scored.length > 0
      ? scored.slice(0, 4)
      : [
          {
            patternId: "hash_table",
            conceptTag: "ds.hash_table" as ConceptTagId,
            nameZh: "哈希表 / 直接模拟",
            nameEn: "Hash Table / Direct Simulation",
            confidence: 0.35,
            matchedSignals: ["fallback:general"],
            expectedComplexity: scaleBudget.targetComplexity,
            decisionQuestionZh: "先写暴力枚举思路，观察最内层是否在反复查询已出现过的状态？",
            decisionQuestionEn: "Outline brute force first: is the inner loop repeatedly looking up previously seen states?"
          },
          {
            patternId: "two_pointers",
            conceptTag: "array.two_pointers" as ConceptTagId,
            nameZh: "双指针 / 排序扫描",
            nameEn: "Two Pointers / Sorted Scan",
            confidence: 0.3,
            matchedSignals: ["fallback:general"],
            expectedComplexity: "O(n log n)",
            decisionQuestionZh: "如果先把输入排序，问题是否会立刻暴露出单调性或局部贪心结构？",
            decisionQuestionEn: "If you sort the input first, does a monotonic or greedy structure immediately appear?"
          }
        ];

  const topIds = new Set(candidates.map((c) => c.patternId));
  const decisionTree = buildDecisionTree(candidates, scaleBudget);
  const confusablePairs = selectRelevantConfusablePairs(topIds);

  const topNamesZh = candidates.slice(0, 3).map((c) => c.nameZh).join(" / ");
  const topNamesEn = candidates.slice(0, 3).map((c) => c.nameEn).join(" / ");

  return {
    problemKey: problem.problemKey,
    scaleBudget,
    candidates,
    decisionTree,
    confusablePairs,
    thirtySecondSummaryZh: `30 秒审题预算：${scaleBudget.targetComplexity}；优先排查候选模式：${topNamesZh}。`,
    thirtySecondSummaryEn: `30s complexity budget: ${scaleBudget.targetComplexity}; top candidate patterns: ${topNamesEn}.`
  };
}

function buildDecisionTree(
  candidates: readonly PatternCandidate[],
  scaleBudget: ScaleComplexityBudget
): DecisionTreeStep[] {
  const steps: DecisionTreeStep[] = [
    {
      step: 1,
      questionZh: `先看数据规模：当前目标复杂度预算为 ${scaleBudget.targetComplexity}，你的直觉暴力做法会超吗？`,
      questionEn: `Check constraints first: target complexity is ${scaleBudget.targetComplexity}. Will brute force exceed it?`,
      ifYesZh: "进入第 2 步，识别题面结构特征以消去内层重复计算。",
      ifYesEn: "Proceed to Step 2 to identify structural properties that eliminate redundant inner work.",
      ifNoZh: "先确保边界和 I/O 干净，直接实现清晰暴力并测边界样例。",
      ifNoEn: "Verify edge cases and I/O cleanly, then implement the clear brute force first."
    }
  ];

  const first = candidates[0];
  const second = candidates[1];

  if (first) {
    steps.push({
      step: 2,
      questionZh: first.decisionQuestionZh,
      questionEn: first.decisionQuestionEn,
      ifYesZh: `优先沿「${first.nameZh}」（${first.expectedComplexity}）定义不变量并手推 1 组小样例。`,
      ifYesEn: `Prioritize "${first.nameEn}" (${first.expectedComplexity}): define the invariant and trace a tiny sample.`,
      ifNoZh: second
        ? `排除后转向第 3 步检验「${second.nameZh}」。`
        : "回到题面重新核对是否存在隐藏单调性、图结构或子问题重叠。",
      ifNoEn: second
        ? `Rule it out and move to Step 3 to test "${second.nameEn}".`
        : "Re-read constraints for hidden monotonicity, graph structure, or overlapping subproblems."
    });
  }

  if (second) {
    steps.push({
      step: 3,
      questionZh: second.decisionQuestionZh,
      questionEn: second.decisionQuestionEn,
      ifYesZh: `尝试「${second.nameZh}」（${second.expectedComplexity}），并用最小反例核对是否与易混淆模式错配。`,
      ifYesEn: `Explore "${second.nameEn}" (${second.expectedComplexity}) and test a tiny counterexample against confusable patterns.`,
      ifNoZh: "先构造 n=3~4 的手工推演表，找出每个状态下真正需要记住的最小信息。",
      ifNoEn: "Build a manual trace table for n=3..4 to see the minimal state required at each step."
    });
  }

  return steps;
}

function selectRelevantConfusablePairs(topPatternIds: Set<string>): ConfusablePatternPair[] {
  const matched = CONFUSABLE_PATTERN_PAIRS.filter((pair) =>
    pair.relatedPatternIds.some((id) => topPatternIds.has(id))
  );
  if (matched.length > 0) {
    return matched.slice(0, 3);
  }
  // Always provide classic high-value pairs if no specific match
  return CONFUSABLE_PATTERN_PAIRS.slice(0, 2);
}

function parseConstraintUpperValue(expr: string): number | undefined {
  const trimmed = expr.trim();
  if (!trimmed) {
    return undefined;
  }
  const sciRe =
    /^(?:(\d+(?:\.\d+)?)\s*(?:\*|×|\\times)?\s*)?(?:10\s*\^\s*\{?(\d+)\}?|1e(\d+)|(\d+)e(\d+))/i;
  const sciMatch = sciRe.exec(trimmed);
  if (sciMatch) {
    if (sciMatch[2]) {
      const coeff = sciMatch[1] ? Number(sciMatch[1]) : 1;
      return coeff * Math.pow(10, Number(sciMatch[2]));
    }
    if (sciMatch[3]) {
      return Math.pow(10, Number(sciMatch[3]));
    }
    if (sciMatch[4] && sciMatch[5]) {
      return Number(sciMatch[4]) * Math.pow(10, Number(sciMatch[5]));
    }
  }
  const intMatch = /^(\d[\d,_]*)/.exec(trimmed);
  if (intMatch?.[1]) {
    const num = Number(intMatch[1].replace(/[,_]/g, ""));
    if (Number.isFinite(num) && num > 0) {
      return num;
    }
  }
  return undefined;
}

function isModuloSurrounding(text: string, index: number): boolean {
  const surrounding = text.slice(Math.max(0, index - 16), index + 28);
  return /mod|取模|\+\s*7|998244353/i.test(surrounding);
}

function extractMaxConstraintExponent(text: string): { maxN: number; exponent: number } | undefined {
  let tier1Best: { maxN: number; exponent: number } | undefined;
  let tier2Best: { maxN: number; exponent: number } | undefined;

  const update = (target: "tier1" | "tier2", value: number): void => {
    if (!Number.isFinite(value) || value <= 0) {
      return;
    }
    const exp = Math.log10(value);
    if (target === "tier1") {
      if (!tier1Best || value > tier1Best.maxN) {
        tier1Best = { maxN: value, exponent: exp };
      }
    } else if (!tier2Best || value > tier2Best.maxN) {
      tier2Best = { maxN: value, exponent: exp };
    }
  };

  const sciPower = "(?:10\\s*\\^\\s*\\{?\\d+\\}?|\\d+e\\d+|1e\\d+)";
  const upperExpr = `(?:\\d+(?:\\.\\d+)?\\s*(?:\\*|×|\\\\times)\\s*${sciPower}|${sciPower}|\\d[\\d,_]*(?!\\s*[\\^eE]))`;

  // Tier 1a: dimension variable constraints like "1 <= n, q <= 2 * 10^5", "nums.length <= 10^4", "n <= 3000"
  const dimClauseRe = new RegExp(
    `([^\\n;]{0,40}?)\\s*(?:<=|≤|<|\\\\le|\\\\leq)\\s*(${upperExpr})`,
    "gi"
  );
  const dimVarRe =
    /(?:\b(?:n|m|N|M|T|q|Q|V|E|len|length)\b|\.length\b|len\([^)]+\)|长度|节点(?:数)?|边数|行数|列数|询问(?:次)?数|组数)/;
  const indexedValueRe = /\[\s*[a-zA-Z0-9_]+\s*\]|_[ijk]\b|\|[^|\n]+\|/;

  for (const match of text.matchAll(dimClauseRe)) {
    const rawLhs = (match[1] ?? "").split(/<=|≤|<|\\le|\\leq/).pop()?.trim() ?? "";
    const rhs = match[2] ?? "";
    const matchIndex = match.index ?? 0;
    if (isModuloSurrounding(text, matchIndex) || /^\s*-/.test(rhs)) {
      continue;
    }
    if (dimVarRe.test(rawLhs) && !indexedValueRe.test(rawLhs)) {
      const value = parseConstraintUpperValue(rhs);
      if (value !== undefined) {
        update("tier1", value);
      }
    }
  }

  // Tier 1b: prose descriptions like "length 10^5", "长度 n 为 10^5", "size up to 10^5"
  const dimProseRe = new RegExp(
    `(?:size|length|长度|节点数?|边数|点数)[^.\\n;]{0,20}?(?:<=|≤|<|=|为|of|up to|达|:)\\s*(${upperExpr})`,
    "gi"
  );
  for (const match of text.matchAll(dimProseRe)) {
    if (isModuloSurrounding(text, match.index ?? 0)) {
      continue;
    }
    const value = parseConstraintUpperValue(match[1] ?? "");
    if (value !== undefined) {
      update("tier1", value);
    }
  }

  if (tier1Best) {
    return tier1Best;
  }

  // Tier 2 fallback (only when no dimension var was found): strip negative lower bounds and indexed element bounds first
  const sanitizedForTier2 = text
    .replace(/-\s*(?:\d+(?:\.\d+)?\s*(?:\*|×|\\times)?\s*)?(?:10\s*\^\s*\{?\d+\}?|\d[\d,_e]*)\s*(?:<=|≤|<|\\le|\\leq)[^\n;]*/gi, " ")
    .replace(/[^,\n;]*(?:\[\s*[a-zA-Z0-9_]+\s*\]|\w+_[ijk]\b|\|\s*[a-zA-Z_]+\s*\|)[^\n;]*/g, " ");

  const sciRe =
    /(?:(\d+(?:\.\d+)?)\s*(?:\*|×|\\times)?\s*)?(?:10\s*\^\s*\{?(\d+)\}?|1e(\d+)|(\d+)e(\d+))/gi;
  for (const match of sanitizedForTier2.matchAll(sciRe)) {
    if (isModuloSurrounding(sanitizedForTier2, match.index ?? 0)) {
      continue;
    }
    if (match[2]) {
      const coeff = match[1] ? Number(match[1]) : 1;
      update("tier2", coeff * Math.pow(10, Number(match[2])));
    } else if (match[3]) {
      update("tier2", Math.pow(10, Number(match[3])));
    } else if (match[4] && match[5]) {
      update("tier2", Number(match[4]) * Math.pow(10, Number(match[5])));
    }
  }

  const scalarBoundRe =
    /(?:\b[a-zA-Z_]\w*\b)\s*(?:<=|≤|<|\\le|\\leq)\s*(\d[\d,_]*)/g;
  for (const match of sanitizedForTier2.matchAll(scalarBoundRe)) {
    const raw = (match[1] ?? "").replace(/[,_]/g, "");
    const num = Number(raw);
    if (Number.isFinite(num) && num > 0) {
      update("tier2", num);
    }
  }

  return tier2Best;
}
