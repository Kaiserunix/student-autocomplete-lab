import type { SupportedLanguage } from "../contracts";

export interface ConceptTagDefinition {
  id: ConceptTagId;
  domain: string;
  labelZh: string;
  labelEn: string;
  aliases: readonly string[];
}

export interface MisconceptionDefinition {
  id: MisconceptionId;
  relatedConceptTags: readonly ConceptTagId[];
  relatedLanguages?: readonly SupportedLanguage[];
  labelZh: string;
  labelEn: string;
  descriptionZh: string;
  descriptionEn: string;
  aliases: readonly string[];
}

export const CONCEPT_TAXONOMY = [
  {
    id: "basics.io_and_simulation",
    domain: "basics",
    labelZh: "基础输入输出与模拟",
    labelEn: "I/O & Simulation",
    aliases: ["simulation", "implementation", "io", "stdin", "模拟", "基础模拟", "输入输出"]
  },
  {
    id: "basics.loop_boundary",
    domain: "basics",
    labelZh: "循环与边界控制",
    labelEn: "Loop & Boundary Control",
    aliases: ["loop", "loops", "loop_boundary", "branch", "conditionals", "循环", "分支", "边界"]
  },
  {
    id: "basics.sorting",
    domain: "basics",
    labelZh: "排序与自定义比较",
    labelEn: "Sorting & Custom Comparators",
    aliases: ["sort", "sorting", "排序"]
  },
  {
    id: "array.prefix_sum",
    domain: "array",
    labelZh: "前缀和与差分",
    labelEn: "Prefix Sum & Difference Array",
    aliases: ["prefix-sum", "prefix_sum", "difference-array", "前缀和", "差分"]
  },
  {
    id: "array.two_pointers",
    domain: "array",
    labelZh: "双指针",
    labelEn: "Two Pointers",
    aliases: ["two-pointers", "two_pointers", "2-pointers", "双指针"]
  },
  {
    id: "array.sliding_window",
    domain: "array",
    labelZh: "滑动窗口",
    labelEn: "Sliding Window",
    aliases: ["sliding-window", "sliding_window", "滑窗", "滑动窗口"]
  },
  {
    id: "array.binary_search",
    domain: "array",
    labelZh: "二分查找与二分答案",
    labelEn: "Binary Search & Search on Answer",
    aliases: ["binary-search", "binary_search", "bisect", "二分", "二分查找", "二分答案"]
  },
  {
    id: "ds.stack_queue",
    domain: "ds",
    labelZh: "栈与队列",
    labelEn: "Stack & Queue",
    aliases: ["stack", "queue", "deque", "栈", "队列", "双端队列"]
  },
  {
    id: "ds.monotonic_stack",
    domain: "ds",
    labelZh: "单调栈与单调队列",
    labelEn: "Monotonic Stack & Queue",
    aliases: ["monotonic-stack", "monotonic_stack", "monotonic-queue", "单调栈", "单调队列"]
  },
  {
    id: "ds.heap",
    domain: "ds",
    labelZh: "堆与优先队列",
    labelEn: "Heap / Priority Queue",
    aliases: ["heap", "priority-queue", "priority_queue", "堆", "优先队列"]
  },
  {
    id: "ds.hash_table",
    domain: "ds",
    labelZh: "哈希表与集合",
    labelEn: "Hash Table & Set",
    aliases: ["hash-table", "hash_table", "hashmap", "hashset", "哈希", "哈希表"]
  },
  {
    id: "ds.dsu",
    domain: "ds",
    labelZh: "并查集",
    labelEn: "Disjoint Set Union (DSU)",
    aliases: ["dsu", "union-find", "union_find", "disjoint-set", "并查集"]
  },
  {
    id: "ds.segment_tree",
    domain: "ds",
    labelZh: "树状数组与线段树",
    labelEn: "Fenwick / Segment Tree",
    aliases: ["segment-tree", "segment_tree", "binary-indexed-tree", "bit", "fenwick", "线段树", "树状数组"]
  },
  {
    id: "ds.ordered_multiset",
    domain: "ds",
    labelZh: "有序集合与平衡树",
    labelEn: "Ordered Multiset / Balanced BST",
    aliases: ["ordered-set", "multiset", "bst-ordered", "平衡树", "有序集合", "可重集"]
  },
  {
    id: "string.basic",
    domain: "string",
    labelZh: "字符串处理",
    labelEn: "String Manipulation",
    aliases: ["string", "strings", "字符串"]
  },
  {
    id: "string.kmp_hash",
    domain: "string",
    labelZh: "字符串匹配（KMP / 哈希 / Trie）",
    labelEn: "String Matching (KMP / Hash / Trie)",
    aliases: ["kmp", "trie", "string-matching", "rolling-hash", "字典树", "字符串哈希"]
  },
  {
    id: "recursion.backtracking",
    domain: "recursion",
    labelZh: "递归与回溯搜索",
    labelEn: "Recursion & Backtracking",
    aliases: ["recursion", "backtracking", "dfs-search", "递归", "回溯", "搜索"]
  },
  {
    id: "recursion.divide_and_conquer",
    domain: "recursion",
    labelZh: "分治算法",
    labelEn: "Divide and Conquer",
    aliases: ["divide-and-conquer", "divide_and_conquer", "分治"]
  },
  {
    id: "tree.traversal",
    domain: "tree",
    labelZh: "二叉树遍历与重构",
    labelEn: "Binary Tree Traversal & Reconstruction",
    aliases: ["tree", "binary-tree", "tree-traversal", "tree_traversal", "树", "二叉树", "二叉树遍历"]
  },
  {
    id: "tree.bst",
    domain: "tree",
    labelZh: "二叉搜索树",
    labelEn: "Binary Search Tree",
    aliases: ["bst", "binary-search-tree", "二叉搜索树"]
  },
  {
    id: "tree.dp_and_lca",
    domain: "tree",
    labelZh: "树上距离、LCA 与树形 DP",
    labelEn: "Tree Distance, LCA & Tree DP",
    aliases: ["lca", "tree-dp", "tree_dp", "tree-distance", "树形dp", "最近公共祖先", "树上距离"]
  },
  {
    id: "graph.traversal",
    domain: "graph",
    labelZh: "图遍历（BFS / DFS）",
    labelEn: "Graph Traversal (BFS / DFS)",
    aliases: ["graph", "bfs", "dfs", "breadth-first-search", "depth-first-search", "图", "图遍历", "广搜", "深搜"]
  },
  {
    id: "graph.shortest_path",
    domain: "graph",
    labelZh: "最短路",
    labelEn: "Shortest Path",
    aliases: ["shortest-path", "shortest_path", "dijkstra", "bellman-ford", "floyd", "spfa", "最短路"]
  },
  {
    id: "graph.topo_sort",
    domain: "graph",
    labelZh: "拓扑排序与 DAG",
    labelEn: "Topological Sort & DAG",
    aliases: ["topological-sort", "topo-sort", "dag", "拓扑排序"]
  },
  {
    id: "graph.mst",
    domain: "graph",
    labelZh: "最小生成树",
    labelEn: "Minimum Spanning Tree",
    aliases: ["mst", "minimum-spanning-tree", "kruskal", "prim", "最小生成树"]
  },
  {
    id: "graph.reachability",
    domain: "graph",
    labelZh: "连通性与强连通分量",
    labelEn: "Reachability & SCC",
    aliases: ["scc", "tarjan", "connectivity", "reachability", "连通性", "强连通分量"]
  },
  {
    id: "dp.linear",
    domain: "dp",
    labelZh: "线性动态规划",
    labelEn: "Linear Dynamic Programming",
    aliases: ["dp", "dynamic-programming", "dynamic_programming", "linear-dp", "动态规划", "线性dp"]
  },
  {
    id: "dp.knapsack",
    domain: "dp",
    labelZh: "背包动态规划",
    labelEn: "Knapsack DP",
    aliases: ["knapsack", "knapsack-dp", "背包", "背包dp"]
  },
  {
    id: "dp.interval",
    domain: "dp",
    labelZh: "区间动态规划",
    labelEn: "Interval DP",
    aliases: ["interval-dp", "区间dp"]
  },
  {
    id: "dp.state_compression",
    domain: "dp",
    labelZh: "状态压缩 DP",
    labelEn: "Bitmask / State-Compression DP",
    aliases: ["bitmask-dp", "state-compression", "状压dp"]
  },
  {
    id: "greedy.interval_and_sort",
    domain: "greedy",
    labelZh: "贪心与区间调度",
    labelEn: "Greedy & Interval Scheduling",
    aliases: ["greedy", "intervals", "interval-scheduling", "贪心", "区间贪心"]
  },
  {
    id: "greedy.exchange_argument",
    domain: "greedy",
    labelZh: "贪心排序与交换论证",
    labelEn: "Greedy Exchange Argument",
    aliases: ["greedy-sort", "fractional-knapsack", "交换论证"]
  },
  {
    id: "math.number_theory",
    domain: "math",
    labelZh: "数论与模运算",
    labelEn: "Number Theory & Modular Arithmetic",
    aliases: ["math", "number-theory", "gcd", "prime", "数论", "数学"]
  },
  {
    id: "math.combinatorics",
    domain: "math",
    labelZh: "组合计数",
    labelEn: "Combinatorics",
    aliases: ["combinatorics", "counting", "组合数学", "组合计数"]
  },
  {
    id: "math.high_precision",
    domain: "math",
    labelZh: "高精度运算",
    labelEn: "Arbitrary-Precision Arithmetic",
    aliases: ["high-precision", "big-integer", "bigint", "高精度"]
  },
  {
    id: "math.bit_manipulation",
    domain: "math",
    labelZh: "位运算",
    labelEn: "Bit Manipulation",
    aliases: ["bit-manipulation", "bitmask", "位运算"]
  }
] as const;

export type ConceptTagId = (typeof CONCEPT_TAXONOMY)[number]["id"];

export const MISCONCEPTION_TAXONOMY = [
  {
    id: "loop.off_by_one",
    relatedConceptTags: ["basics.loop_boundary", "array.prefix_sum", "array.two_pointers"],
    labelZh: "循环边界差一（Off-by-One）",
    labelEn: "Loop Off-by-One Boundary",
    descriptionZh: "开闭区间或起止下标多走/少走一步。",
    descriptionEn: "Loop start/end bounds are off by one due to inclusive/exclusive mix-up.",
    aliases: ["off_by_one", "loop_boundary", "loop-boundary", "array_indexing"]
  },
  {
    id: "loop.unsigned_underflow",
    relatedConceptTags: ["basics.loop_boundary"],
    relatedLanguages: ["cpp", "c", "rust"],
    labelZh: "无符号长度减一下溢",
    labelEn: "Unsigned size_t / usize Underflow",
    descriptionZh: "对空容器的无符号 length/size() 执行减 1 导致极大正数越界。",
    descriptionEn: "Subtracting 1 from an unsigned container size when empty wraps around.",
    aliases: ["unsigned_underflow", "size_t_underflow"]
  },
  {
    id: "input.sentinel_included",
    relatedConceptTags: ["basics.io_and_simulation"],
    labelZh: "未剔除哨兵终止符",
    labelEn: "Sentinel Terminator Included in Data",
    descriptionZh: "把用于表示输入结束的 0 / -1 等哨兵值混入有效数据一起处理。",
    descriptionEn: "Sentinel value (such as trailing 0) was processed as valid input.",
    aliases: ["sentinel_input", "sentinel-input"]
  },
  {
    id: "input.fast_io_missing",
    relatedConceptTags: ["basics.io_and_simulation"],
    relatedLanguages: ["cpp", "python", "java"],
    labelZh: "大规模 I/O 缓冲瓶颈",
    labelEn: "Unbuffered / Slow I/O Bottleneck",
    descriptionZh: "10^5 以上输入输出未关闭流同步或未使用批量读写导致超时。",
    descriptionEn: "Large input/output timed out due to slow line-by-line I/O.",
    aliases: ["slow_io", "fast_io"]
  },
  {
    id: "numeric.int32_overflow",
    relatedConceptTags: ["basics.io_and_simulation", "math.number_theory", "array.prefix_sum"],
    relatedLanguages: ["cpp", "c", "java", "rust"],
    labelZh: "32 位整型溢出",
    labelEn: "32-bit Signed Integer Overflow",
    descriptionZh: "中间乘积或累加和超出 2^31-1 但仍使用 32 位 int。",
    descriptionEn: "Intermediate sum or product overflows 32-bit int; use 64-bit integer.",
    aliases: ["numeric_input_type", "int_overflow", "integer_overflow"]
  },
  {
    id: "numeric.high_precision_carry",
    relatedConceptTags: ["math.high_precision"],
    labelZh: "高精度末位进位或对齐错误",
    labelEn: "High-Precision Carry / Alignment Error",
    descriptionZh: "逐位运算顺序反向或循环结束后漏处理最高位 carry。",
    descriptionEn: "Digit alignment reversed or trailing carry omitted after loop.",
    aliases: ["high_precision_carry_order", "bigint_carry"]
  },
  {
    id: "branch.condition_coverage",
    relatedConceptTags: ["basics.loop_boundary", "basics.io_and_simulation"],
    labelZh: "条件分支覆盖不全",
    labelEn: "Incomplete Branch Condition Coverage",
    descriptionZh: "遗漏互斥边界例外分支（如世纪年、零值、负数等）。",
    descriptionEn: "Missing mutually exclusive edge case branch in conditional logic.",
    aliases: ["branch_condition_coverage", "missing_edge_branch"]
  },
  {
    id: "binary_search.boundary_invariant",
    relatedConceptTags: ["array.binary_search"],
    labelZh: "二分区间不变量与收缩方向错位",
    labelEn: "Binary Search Interval Invariant Error",
    descriptionZh: "开闭区间定义、while 条件与 l/r 更新规则不自洽。",
    descriptionEn: "Loop guard and pointer updates violate the chosen interval invariant.",
    aliases: ["binary_search_invariant", "binary-search-boundary"]
  },
  {
    id: "binary_search.early_break_duplicate",
    relatedConceptTags: ["array.binary_search"],
    labelZh: "重复元素过早 break 错过首/尾位置",
    labelEn: "Early Break on Duplicate Elements",
    descriptionZh: "命中相等元素后立即退出，导致未找到最左或最右边界。",
    descriptionEn: "Breaking immediately on equality instead of shrinking toward first/last occurrence.",
    aliases: ["binary_search_duplicate", "early_break_duplicate"]
  },
  {
    id: "binary_search.infinite_loop",
    relatedConceptTags: ["array.binary_search"],
    labelZh: "二分 mid 取整与更新导致死循环",
    labelEn: "Binary Search Infinite Loop",
    descriptionZh: "当 l + 1 == r 时向下取整配合 l = mid 导致区间不再缩小。",
    descriptionEn: "Interval fails to shrink when l = mid uses floor midpoint.",
    aliases: ["binary_search_tle", "mid_rounding_loop"]
  },
  {
    id: "two_pointers.window_shrink_condition",
    relatedConceptTags: ["array.two_pointers", "array.sliding_window"],
    labelZh: "滑窗/双指针收缩时机与状态更新错位",
    labelEn: "Sliding Window Shrink / Update Order",
    descriptionZh: "右扩或左缩时未在窗口合法前后正确更新答案或计数状态。",
    descriptionEn: "Window state or answer updated at the wrong moment during expand/shrink.",
    aliases: ["sliding_window_shrink", "two_pointer_move"]
  },
  {
    id: "recursion.base_case_wrong",
    relatedConceptTags: ["recursion.backtracking", "tree.traversal", "recursion.divide_and_conquer"],
    labelZh: "递归出口返回值错误",
    labelEn: "Incorrect Recursion Base Case",
    descriptionZh: "空节点或空区间出口返回了非单位元（如深度空节点返回 1 而非 0）。",
    descriptionEn: "Base case returns wrong identity value for empty subtree or base state.",
    aliases: ["recursion_base_case", "base_case_error"]
  },
  {
    id: "tree.traversal_order_confusion",
    relatedConceptTags: ["tree.traversal"],
    labelZh: "树遍历拼接顺序混淆",
    labelEn: "Tree Traversal Order Confusion",
    descriptionZh: "先序、中序、后序的根/左/右组合位置颠倒。",
    descriptionEn: "Root, left, and right subtree orders mixed up during traversal or reconstruction.",
    aliases: ["traversal_order_confusion", "tree_order_mixup"]
  },
  {
    id: "tree.distance_vs_id_diff",
    relatedConceptTags: ["tree.dp_and_lca", "tree.traversal"],
    labelZh: "用节点编号差代替树边距离",
    labelEn: "Node ID Difference Used Instead of Tree Edge Distance",
    descriptionZh: "未沿树边求最短路径边数，误用 |u - v| 作为距离。",
    descriptionEn: "Used |u - v| instead of counting edges along the tree path.",
    aliases: ["tree_distance", "id_diff_distance"]
  },
  {
    id: "graph.directed_vs_undirected",
    relatedConceptTags: ["graph.traversal", "graph.shortest_path", "graph.topo_sort"],
    labelZh: "有向图/无向图建边方向错误",
    labelEn: "Directed vs Undirected Adjacency Error",
    descriptionZh: "有向图误加反向边，或无向图漏加反向边。",
    descriptionEn: "Added reverse edge on directed graph or omitted reverse edge on undirected graph.",
    aliases: ["graph_adjacency_model", "directed_edge_error"]
  },
  {
    id: "graph.visited_mark_timing",
    relatedConceptTags: ["graph.traversal", "graph.shortest_path"],
    labelZh: "BFS 入队前未标 visited 导致重复入队",
    labelEn: "BFS Visited Marked on Pop Instead of Push",
    descriptionZh: "出队时才标记 visited，造成同一节点多次入队甚至 MLE/TLE。",
    descriptionEn: "Marking visited on pop instead of push causes duplicate queue entries.",
    aliases: ["bfs_visited_timing", "duplicate_queue_push"]
  },
  {
    id: "graph.unreachable_state",
    relatedConceptTags: ["graph.reachability", "graph.shortest_path"],
    labelZh: "未检验起点可达性与终点可达性",
    labelEn: "Unchecked Source/Target Reachability",
    descriptionZh: "更新答案时未确认状态既能从起点到达、也能最终到达终点。",
    descriptionEn: "State included in answer without verifying forward and reverse reachability.",
    aliases: ["unreachable_state"]
  },
  {
    id: "dsu.direct_edge_not_root",
    relatedConceptTags: ["ds.dsu"],
    labelZh: "并查集仅查直接边或未合并根节点",
    labelEn: "DSU Direct Edge / Non-Root Union",
    descriptionZh: "只存边对或直接改 parent[a] = b，未按 find(a) 与 find(b) 合并查询传递闭包。",
    descriptionEn: "Checked direct pairs or updated raw parent instead of merging/comparing roots via find().",
    aliases: ["disjoint_set_union_semantics", "dsu_not_root"]
  },
  {
    id: "dp.state_definition_incomplete",
    relatedConceptTags: ["dp.linear", "dp.knapsack", "dp.interval", "dp.state_compression"],
    labelZh: "DP 状态维度缺失或无后效性破坏",
    labelEn: "Incomplete DP State / Optimal Substructure Violation",
    descriptionZh: "状态未包含决定未来转移所需的关键约束信息。",
    descriptionEn: "DP state omits a dimension needed for valid transitions.",
    aliases: ["dp_state_missing"]
  },
  {
    id: "dp.transition_order_wrong",
    relatedConceptTags: ["dp.linear", "dp.knapsack", "dp.interval"],
    labelZh: "DP 递推枚举顺序错误（如 0-1 背包正序覆盖）",
    labelEn: "Wrong DP Iteration / Transition Order",
    descriptionZh: "依赖尚未计算的子状态，或滚动数组压缩时覆盖了本轮仍需读取的旧值。",
    descriptionEn: "Subproblems evaluated out of topological order or overwritten in-place.",
    aliases: ["dp_order_wrong", "knapsack_loop_direction"]
  },
  {
    id: "greedy.wrong_sort_key",
    relatedConceptTags: ["greedy.interval_and_sort", "greedy.exchange_argument", "basics.sorting"],
    labelZh: "贪心排序关键字选取错误",
    labelEn: "Incorrect Greedy Sort Key",
    descriptionZh: "按直觉字段排序而非按交换论证/性价比/右端点排序。",
    descriptionEn: "Sorted by intuitive field (e.g. total value/start time) instead of proven greedy key.",
    aliases: ["greedy_choice_model", "greedy_sort_key"]
  },
  {
    id: "ds.duplicate_dedup_error",
    relatedConceptTags: ["ds.ordered_multiset", "ds.hash_table"],
    labelZh: "可重集错误去重或重复值计数漏算",
    labelEn: "Multiset / Duplicate Handling Error",
    descriptionZh: "需要保留重复元素频率时使用了去重集合或 if x not in container。",
    descriptionEn: "Deduplicated values when multiset multiplicity was required.",
    aliases: ["duplicate_handling", "multiset_dedup"]
  },
  {
    id: "ds.empty_container_access",
    relatedConceptTags: ["ds.stack_queue", "ds.heap", "ds.monotonic_stack"],
    labelZh: "空容器 pop/top/unwrap 越界崩溃",
    labelEn: "Empty Container Access / Unwrap Panic",
    descriptionZh: "未检查栈/队列/堆非空即读取顶部元素或调用 unwrap()。",
    descriptionEn: "Popped or read top/front of an empty container without checking emptiness.",
    aliases: ["empty_stack_pop", "rust_unwrap_none"]
  },
  {
    id: "complexity.nested_tle",
    relatedConceptTags: ["array.two_pointers", "array.sliding_window", "ds.hash_table", "ds.monotonic_stack"],
    labelZh: "暴力嵌套复杂度超出数据规模预算",
    labelEn: "Brute-Force Complexity Exceeds Input Constraints",
    descriptionZh: "在 n >= 10^5 约束下使用了 O(n^2) 嵌套扫描。",
    descriptionEn: "Used quadratic nested loops under large input constraints (n >= 10^5).",
    aliases: ["tle_quadratic", "brute_force_tle"]
  }
] as const;

export type MisconceptionId = (typeof MISCONCEPTION_TAXONOMY)[number]["id"];

const CONCEPT_BY_ID = new Map<string, ConceptTagDefinition>();
const CONCEPT_ALIAS_TO_ID = new Map<string, ConceptTagId>();

for (const def of CONCEPT_TAXONOMY) {
  CONCEPT_BY_ID.set(def.id, def);
  CONCEPT_ALIAS_TO_ID.set(canonicalLookupKey(def.id), def.id);
  CONCEPT_ALIAS_TO_ID.set(canonicalLookupKey(def.labelZh), def.id);
  CONCEPT_ALIAS_TO_ID.set(canonicalLookupKey(def.labelEn), def.id);
  for (const alias of def.aliases) {
    CONCEPT_ALIAS_TO_ID.set(canonicalLookupKey(alias), def.id);
  }
}

const MISCONCEPTION_BY_ID = new Map<string, MisconceptionDefinition>();
const MISCONCEPTION_ALIAS_TO_ID = new Map<string, MisconceptionId>();

for (const def of MISCONCEPTION_TAXONOMY) {
  MISCONCEPTION_BY_ID.set(def.id, def);
  MISCONCEPTION_ALIAS_TO_ID.set(canonicalLookupKey(def.id), def.id);
  MISCONCEPTION_ALIAS_TO_ID.set(canonicalLookupKey(def.labelZh), def.id);
  MISCONCEPTION_ALIAS_TO_ID.set(canonicalLookupKey(def.labelEn), def.id);
  for (const alias of def.aliases) {
    MISCONCEPTION_ALIAS_TO_ID.set(canonicalLookupKey(alias), def.id);
  }
}

function canonicalLookupKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s/]+/g, "_")
    .replace(/-/g, "_");
}

export function normalizeConceptTag(raw: string): ConceptTagId | null {
  const key = canonicalLookupKey(raw);
  if (!key) {
    return null;
  }
  const direct = CONCEPT_ALIAS_TO_ID.get(key);
  if (direct) {
    return direct;
  }
  // Also try dot-separated exact ID without underscore replacement
  const trimmedLower = raw.trim().toLowerCase();
  const byExactId = CONCEPT_BY_ID.get(trimmedLower);
  if (byExactId) {
    return byExactId.id;
  }
  return null;
}

export function normalizeConceptTagOrRaw(raw: string): string {
  const normalized = normalizeConceptTag(raw);
  return normalized ?? raw.trim().toLowerCase();
}

export function normalizeConceptTags(rawTags: readonly string[]): ConceptTagId[] {
  const seen = new Set<ConceptTagId>();
  const result: ConceptTagId[] = [];
  for (const tag of rawTags) {
    const normalized = normalizeConceptTag(tag);
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

export function normalizeMisconceptionId(raw: string): MisconceptionId | null {
  const key = canonicalLookupKey(raw);
  if (!key) {
    return null;
  }
  const direct = MISCONCEPTION_ALIAS_TO_ID.get(key);
  if (direct) {
    return direct;
  }
  const trimmedLower = raw.trim().toLowerCase();
  const byExactId = MISCONCEPTION_BY_ID.get(trimmedLower);
  if (byExactId) {
    return byExactId.id;
  }
  return null;
}

export function normalizeMisconceptionIdOrRaw(raw: string): string {
  const normalized = normalizeMisconceptionId(raw);
  return normalized ?? raw.trim().toLowerCase();
}

export function getConceptTagDefinition(id: string): ConceptTagDefinition | undefined {
  const normalized = normalizeConceptTag(id);
  return normalized ? CONCEPT_BY_ID.get(normalized) : undefined;
}

export function getMisconceptionDefinition(id: string): MisconceptionDefinition | undefined {
  const normalized = normalizeMisconceptionId(id);
  return normalized ? MISCONCEPTION_BY_ID.get(normalized) : undefined;
}

export function getRelatedConceptTagsForMisconception(id: string): readonly ConceptTagId[] {
  const def = getMisconceptionDefinition(id);
  return def ? def.relatedConceptTags : [];
}

export function isMisconceptionRelevantToContext(
  misconceptionId: string,
  problemConceptTags: readonly string[],
  language: SupportedLanguage
): boolean {
  const def = getMisconceptionDefinition(misconceptionId);
  if (!def) {
    return false;
  }
  const normalizedProblemTags = new Set(problemConceptTags.map(normalizeConceptTagOrRaw));
  const tagOverlap = def.relatedConceptTags.some((tag) => normalizedProblemTags.has(tag));
  if (tagOverlap) {
    return true;
  }
  if (def.relatedLanguages && def.relatedLanguages.includes(language)) {
    return true;
  }
  return false;
}
