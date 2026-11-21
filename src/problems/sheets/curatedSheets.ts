import type { ProblemDocument, ProblemSourceId } from "../../core/contracts";

export type CuratedDifficulty = "Easy" | "Medium" | "Hard";

export interface CuratedProblemEntry {
  slug: string;
  title: string;
  titleZh: string;
  category: string;
  difficulty: CuratedDifficulty;
  normalizedTier: 1 | 2 | 3 | 4 | 5;
  tags: string[];
}

export interface CuratedSheet {
  id: "hot-100" | "blind-75" | "neetcode-150";
  title: string;
  titleZh: string;
  description: string;
  defaultSource: "leetcode-cn" | "leetcode-global";
  items: CuratedProblemEntry[];
}

function entry(
  slug: string,
  title: string,
  titleZh: string,
  category: string,
  difficulty: CuratedDifficulty,
  tags: string[]
): CuratedProblemEntry {
  const normalizedTier: 1 | 2 | 3 | 4 | 5 =
    difficulty === "Easy" ? 1 : difficulty === "Medium" ? 3 : 5;
  return { slug, title, titleZh, category, difficulty, normalizedTier, tags };
}

/**
 * Lightweight slug-only curated study routes (Hot 100 core, Blind 75, NeetCode 150).
 * Intentionally excludes copyrighted problem statements; statements are fetched on demand.
 */
const HOT_100_ITEMS: CuratedProblemEntry[] = [
  entry("two-sum", "Two Sum", "两数之和", "Hash Table", "Easy", ["array", "hash-table"]),
  entry("group-anagrams", "Group Anagrams", "字母异位词分组", "Hash Table", "Medium", ["hash-table", "string"]),
  entry("longest-consecutive-sequence", "Longest Consecutive Sequence", "最长连续序列", "Hash Table", "Medium", ["array", "hash-table"]),
  entry("move-zeroes", "Move Zeroes", "移动零", "Two Pointers", "Easy", ["array", "two-pointers"]),
  entry("container-with-most-water", "Container With Most Water", "盛最多水的容器", "Two Pointers", "Medium", ["array", "two-pointers", "greedy"]),
  entry("3sum", "3Sum", "三数之和", "Two Pointers", "Medium", ["array", "two-pointers", "sorting"]),
  entry("trapping-rain-water", "Trapping Rain Water", "接雨水", "Two Pointers", "Hard", ["array", "two-pointers", "monotonic-stack"]),
  entry("longest-substring-without-repeating-characters", "Longest Substring Without Repeating Characters", "无重复字符的最长子串", "Sliding Window", "Medium", ["hash-table", "string", "sliding-window"]),
  entry("find-all-anagrams-in-a-string", "Find All Anagrams in a String", "找到字符串中所有字母异位词", "Sliding Window", "Medium", ["hash-table", "string", "sliding-window"]),
  entry("subarray-sum-equals-k", "Subarray Sum Equals K", "和为 K 的子数组", "Prefix Sum", "Medium", ["array", "hash-table", "prefix-sum"]),
  entry("minimum-window-substring", "Minimum Window Substring", "最小覆盖子串", "Sliding Window", "Hard", ["hash-table", "string", "sliding-window"]),
  entry("maximum-subarray", "Maximum Subarray", "最大子数组和", "Array & DP", "Medium", ["array", "dynamic-programming"]),
  entry("merge-intervals", "Merge Intervals", "合并区间", "Intervals", "Medium", ["array", "sorting"]),
  entry("rotate-array", "Rotate Array", "轮转数组", "Array", "Medium", ["array", "two-pointers"]),
  entry("product-of-array-except-self", "Product of Array Except Self", "除自身以外数组的乘积", "Prefix Sum", "Medium", ["array", "prefix-sum"]),
  entry("reverse-linked-list", "Reverse Linked List", "反转链表", "Linked List", "Easy", ["linked-list"]),
  entry("linked-list-cycle", "Linked List Cycle", "环形链表", "Linked List", "Easy", ["linked-list", "two-pointers"]),
  entry("merge-two-sorted-lists", "Merge Two Sorted Lists", "合并两个有序链表", "Linked List", "Easy", ["linked-list"]),
  entry("lru-cache", "LRU Cache", "LRU 缓存", "Design", "Medium", ["hash-table", "linked-list", "design"]),
  entry("binary-tree-inorder-traversal", "Binary Tree Inorder Traversal", "二叉树的中序遍历", "Binary Tree", "Easy", ["tree", "dfs"]),
  entry("maximum-depth-of-binary-tree", "Maximum Depth of Binary Tree", "二叉树的最大深度", "Binary Tree", "Easy", ["tree", "dfs", "bfs"]),
  entry("invert-binary-tree", "Invert Binary Tree", "翻转二叉树", "Binary Tree", "Easy", ["tree", "dfs", "bfs"]),
  entry("binary-tree-level-order-traversal", "Binary Tree Level Order Traversal", "二叉树的层序遍历", "Binary Tree", "Medium", ["tree", "bfs"]),
  entry("validate-binary-search-tree", "Validate Binary Search Tree", "验证二叉搜索树", "Binary Tree", "Medium", ["tree", "dfs", "bst"]),
  entry("lowest-common-ancestor-of-a-binary-tree", "Lowest Common Ancestor of a Binary Tree", "二叉树的最近公共祖先", "Binary Tree", "Medium", ["tree", "dfs"]),
  entry("number-of-islands", "Number of Islands", "岛屿数量", "Graph", "Medium", ["graph", "dfs", "bfs"]),
  entry("rotting-oranges", "Rotting Oranges", "腐烂的橘子", "Graph", "Medium", ["graph", "bfs"]),
  entry("course-schedule", "Course Schedule", "课程表", "Graph", "Medium", ["graph", "topological-sort"]),
  entry("permutations", "Permutations", "全排列", "Backtracking", "Medium", ["backtracking"]),
  entry("subsets", "Subsets", "子集", "Backtracking", "Medium", ["backtracking"]),
  entry("combination-sum", "Combination Sum", "组合总和", "Backtracking", "Medium", ["backtracking"]),
  entry("search-in-rotated-sorted-array", "Search in Rotated Sorted Array", "搜索旋转排序数组", "Binary Search", "Medium", ["array", "binary-search"]),
  entry("find-first-and-last-position-of-element-in-sorted-array", "Find First and Last Position of Element in Sorted Array", "在排序数组中查找元素的第一个和最后一个位置", "Binary Search", "Medium", ["array", "binary-search"]),
  entry("valid-parentheses", "Valid Parentheses", "有效的括号", "Stack", "Easy", ["string", "stack"]),
  entry("daily-temperatures", "Daily Temperatures", "每日温度", "Monotonic Stack", "Medium", ["array", "monotonic-stack"]),
  entry("kth-largest-element-in-an-array", "Kth Largest Element in an Array", "数组中的第 K 个最大元素", "Heap", "Medium", ["array", "heap"]),
  entry("jump-game", "Jump Game", "跳跃游戏", "Greedy", "Medium", ["array", "greedy"]),
  entry("climbing-stairs", "Climbing Stairs", "爬楼梯", "Dynamic Programming", "Easy", ["dynamic-programming"]),
  entry("house-robber", "House Robber", "打家劫舍", "Dynamic Programming", "Medium", ["dynamic-programming"]),
  entry("coin-change", "Coin Change", "零钱兑换", "Dynamic Programming", "Medium", ["dynamic-programming"]),
  entry("longest-increasing-subsequence", "Longest Increasing Subsequence", "最长递增子序列", "Dynamic Programming", "Medium", ["dynamic-programming", "binary-search"]),
  entry("longest-common-subsequence", "Longest Common Subsequence", "最长公共子序列", "Dynamic Programming", "Medium", ["string", "dynamic-programming"]),
  entry("edit-distance", "Edit Distance", "编辑距离", "Dynamic Programming", "Medium", ["string", "dynamic-programming"])
];

const BLIND_75_ITEMS: CuratedProblemEntry[] = [
  // Arrays & Hashing
  entry("contains-duplicate", "Contains Duplicate", "存在重复元素", "Arrays & Hashing", "Easy", ["array", "hash-table"]),
  entry("valid-anagram", "Valid Anagram", "有效的字母异位词", "Arrays & Hashing", "Easy", ["hash-table", "string"]),
  entry("two-sum", "Two Sum", "两数之和", "Arrays & Hashing", "Easy", ["array", "hash-table"]),
  entry("group-anagrams", "Group Anagrams", "字母异位词分组", "Arrays & Hashing", "Medium", ["hash-table", "string"]),
  entry("top-k-frequent-elements", "Top K Frequent Elements", "前 K 个高频元素", "Arrays & Hashing", "Medium", ["hash-table", "heap"]),
  entry("product-of-array-except-self", "Product of Array Except Self", "除自身以外数组的乘积", "Arrays & Hashing", "Medium", ["array", "prefix-sum"]),
  entry("longest-consecutive-sequence", "Longest Consecutive Sequence", "最长连续序列", "Arrays & Hashing", "Medium", ["array", "hash-table"]),
  // Two Pointers
  entry("valid-palindrome", "Valid Palindrome", "验证回文串", "Two Pointers", "Easy", ["two-pointers", "string"]),
  entry("3sum", "3Sum", "三数之和", "Two Pointers", "Medium", ["array", "two-pointers"]),
  entry("container-with-most-water", "Container With Most Water", "盛最多水的容器", "Two Pointers", "Medium", ["array", "two-pointers"]),
  // Sliding Window
  entry("best-time-to-buy-and-sell-stock", "Best Time to Buy and Sell Stock", "买卖股票的最佳时机", "Sliding Window", "Easy", ["array", "sliding-window"]),
  entry("longest-substring-without-repeating-characters", "Longest Substring Without Repeating Characters", "无重复字符的最长子串", "Sliding Window", "Medium", ["string", "sliding-window"]),
  entry("longest-repeating-character-replacement", "Longest Repeating Character Replacement", "替换后的最长重复字符", "Sliding Window", "Medium", ["string", "sliding-window"]),
  entry("minimum-window-substring", "Minimum Window Substring", "最小覆盖子串", "Sliding Window", "Hard", ["string", "sliding-window"]),
  // Stack
  entry("valid-parentheses", "Valid Parentheses", "有效的括号", "Stack", "Easy", ["string", "stack"]),
  // Binary Search
  entry("find-minimum-in-rotated-sorted-array", "Find Minimum in Rotated Sorted Array", "寻找旋转排序数组中的最小值", "Binary Search", "Medium", ["array", "binary-search"]),
  entry("search-in-rotated-sorted-array", "Search in Rotated Sorted Array", "搜索旋转排序数组", "Binary Search", "Medium", ["array", "binary-search"]),
  // Linked List
  entry("reverse-linked-list", "Reverse Linked List", "反转链表", "Linked List", "Easy", ["linked-list"]),
  entry("merge-two-sorted-lists", "Merge Two Sorted Lists", "合并两个有序链表", "Linked List", "Easy", ["linked-list"]),
  entry("reorder-list", "Reorder List", "重排链表", "Linked List", "Medium", ["linked-list", "two-pointers"]),
  entry("remove-nth-node-from-end-of-list", "Remove Nth Node From End of List", "删除链表的倒数第 N 个结点", "Linked List", "Medium", ["linked-list", "two-pointers"]),
  entry("linked-list-cycle", "Linked List Cycle", "环形链表", "Linked List", "Easy", ["linked-list", "two-pointers"]),
  entry("merge-k-sorted-lists", "Merge k Sorted Lists", "合并 K 个升序链表", "Linked List", "Hard", ["linked-list", "heap"]),
  // Trees
  entry("invert-binary-tree", "Invert Binary Tree", "翻转二叉树", "Trees", "Easy", ["tree", "dfs"]),
  entry("maximum-depth-of-binary-tree", "Maximum Depth of Binary Tree", "二叉树的最大深度", "Trees", "Easy", ["tree", "dfs"]),
  entry("same-tree", "Same Tree", "相同的树", "Trees", "Easy", ["tree", "dfs"]),
  entry("subtree-of-another-tree", "Subtree of Another Tree", "另一棵树的子树", "Trees", "Easy", ["tree", "dfs"]),
  entry("lowest-common-ancestor-of-a-binary-search-tree", "Lowest Common Ancestor of a Binary Search Tree", "二叉搜索树的最近公共祖先", "Trees", "Medium", ["tree", "bst"]),
  entry("binary-tree-level-order-traversal", "Binary Tree Level Order Traversal", "二叉树的层序遍历", "Trees", "Medium", ["tree", "bfs"]),
  entry("validate-binary-search-tree", "Validate Binary Search Tree", "验证二叉搜索树", "Trees", "Medium", ["tree", "bst"]),
  entry("kth-smallest-element-in-a-bst", "Kth Smallest Element in a BST", "二叉搜索树中第 K 小的元素", "Trees", "Medium", ["tree", "bst"]),
  entry("construct-binary-tree-from-preorder-and-inorder-traversal", "Construct Binary Tree from Preorder and Inorder Traversal", "从前序与中序遍历序列构造二叉树", "Trees", "Medium", ["tree", "divide-and-conquer"]),
  entry("binary-tree-maximum-path-sum", "Binary Tree Maximum Path Sum", "二叉树中的最大路径和", "Trees", "Hard", ["tree", "dfs", "dynamic-programming"]),
  entry("serialize-and-deserialize-binary-tree", "Serialize and Deserialize Binary Tree", "二叉树的序列化与反序列化", "Trees", "Hard", ["tree", "design"]),
  // Tries & Heap
  entry("implement-trie-prefix-tree", "Implement Trie (Prefix Tree)", "实现 Trie (前缀树)", "Tries", "Medium", ["trie", "design"]),
  entry("design-add-and-search-words-data-structure", "Design Add and Search Words Data Structure", "添加与搜索单词 - 数据结构设计", "Tries", "Medium", ["trie", "dfs"]),
  entry("word-search-ii", "Word Search II", "单词搜索 II", "Tries", "Hard", ["trie", "backtracking"]),
  entry("find-median-from-data-stream", "Find Median from Data Stream", "数据流的中位数", "Heap", "Hard", ["heap", "design"]),
  // Backtracking
  entry("combination-sum", "Combination Sum", "组合总和", "Backtracking", "Medium", ["backtracking"]),
  entry("word-search", "Word Search", "单词搜索", "Backtracking", "Medium", ["backtracking"]),
  // Graphs
  entry("number-of-islands", "Number of Islands", "岛屿数量", "Graphs", "Medium", ["graph", "dfs", "bfs"]),
  entry("clone-graph", "Clone Graph", "克隆图", "Graphs", "Medium", ["graph", "dfs", "bfs"]),
  entry("pacific-atlantic-water-flow", "Pacific Atlantic Water Flow", "太平洋大西洋水流问题", "Graphs", "Medium", ["graph", "dfs", "bfs"]),
  entry("course-schedule", "Course Schedule", "课程表", "Graphs", "Medium", ["graph", "topological-sort"]),
  // 1-D & 2-D DP
  entry("climbing-stairs", "Climbing Stairs", "爬楼梯", "1-D DP", "Easy", ["dynamic-programming"]),
  entry("house-robber", "House Robber", "打家劫舍", "1-D DP", "Medium", ["dynamic-programming"]),
  entry("house-robber-ii", "House Robber II", "打家劫舍 II", "1-D DP", "Medium", ["dynamic-programming"]),
  entry("longest-palindromic-substring", "Longest Palindromic Substring", "最长回文子串", "1-D DP", "Medium", ["string", "dynamic-programming"]),
  entry("palindromic-substrings", "Palindromic Substrings", "回文子串", "1-D DP", "Medium", ["string", "dynamic-programming"]),
  entry("decode-ways", "Decode Ways", "解码方法", "1-D DP", "Medium", ["string", "dynamic-programming"]),
  entry("coin-change", "Coin Change", "零钱兑换", "1-D DP", "Medium", ["dynamic-programming"]),
  entry("maximum-product-subarray", "Maximum Product Subarray", "乘积最大子数组", "1-D DP", "Medium", ["dynamic-programming"]),
  entry("word-break", "Word Break", "单词拆分", "1-D DP", "Medium", ["dynamic-programming"]),
  entry("longest-increasing-subsequence", "Longest Increasing Subsequence", "最长递增子序列", "1-D DP", "Medium", ["dynamic-programming"]),
  entry("unique-paths", "Unique Paths", "不同路径", "2-D DP", "Medium", ["dynamic-programming"]),
  entry("longest-common-subsequence", "Longest Common Subsequence", "最长公共子序列", "2-D DP", "Medium", ["dynamic-programming"]),
  // Greedy & Intervals
  entry("maximum-subarray", "Maximum Subarray", "最大子数组和", "Greedy", "Medium", ["array", "greedy", "dynamic-programming"]),
  entry("jump-game", "Jump Game", "跳跃游戏", "Greedy", "Medium", ["array", "greedy"]),
  entry("insert-interval", "Insert Interval", "插入区间", "Intervals", "Medium", ["array", "intervals"]),
  entry("merge-intervals", "Merge Intervals", "合并区间", "Intervals", "Medium", ["array", "intervals"]),
  entry("non-overlapping-intervals", "Non-overlapping Intervals", "无重叠区间", "Intervals", "Medium", ["greedy", "intervals"]),
  // Math & Bit Manipulation
  entry("rotate-image", "Rotate Image", "旋转图像", "Math & Geometry", "Medium", ["matrix"]),
  entry("spiral-matrix", "Spiral Matrix", "螺旋矩阵", "Math & Geometry", "Medium", ["matrix"]),
  entry("set-matrix-zeroes", "Set Matrix Zeroes", "矩阵置零", "Math & Geometry", "Medium", ["matrix"]),
  entry("number-of-1-bits", "Number of 1 Bits", "位1的个数", "Bit Manipulation", "Easy", ["bit-manipulation"]),
  entry("counting-bits", "Counting Bits", "比特位计数", "Bit Manipulation", "Easy", ["bit-manipulation", "dynamic-programming"]),
  entry("reverse-bits", "Reverse Bits", "颠倒二进制位", "Bit Manipulation", "Easy", ["bit-manipulation"]),
  entry("missing-number", "Missing Number", "丢失的数字", "Bit Manipulation", "Easy", ["bit-manipulation", "math"]),
  entry("sum-of-two-integers", "Sum of Two Integers", "两整数之和", "Bit Manipulation", "Medium", ["bit-manipulation"])
];

const NEETCODE_150_EXTRA: CuratedProblemEntry[] = [
  entry("valid-sudoku", "Valid Sudoku", "有效的数独", "Arrays & Hashing", "Medium", ["array", "hash-table"]),
  entry("two-sum-ii-input-array-is-sorted", "Two Sum II - Input Array Is Sorted", "两数之和 II - 输入有序数组", "Two Pointers", "Medium", ["array", "two-pointers"]),
  entry("trapping-rain-water", "Trapping Rain Water", "接雨水", "Two Pointers", "Hard", ["two-pointers", "monotonic-stack"]),
  entry("permutation-in-string", "Permutation in String", "字符串的排列", "Sliding Window", "Medium", ["string", "sliding-window"]),
  entry("sliding-window-maximum", "Sliding Window Maximum", "滑动窗口最大值", "Sliding Window", "Hard", ["sliding-window", "monotonic-queue"]),
  entry("min-stack", "Min Stack", "最小栈", "Stack", "Medium", ["stack", "design"]),
  entry("evaluate-reverse-polish-notation", "Evaluate Reverse Polish Notation", "逆波兰表达式求值", "Stack", "Medium", ["stack"]),
  entry("generate-parentheses", "Generate Parentheses", "括号生成", "Stack", "Medium", ["stack", "backtracking"]),
  entry("daily-temperatures", "Daily Temperatures", "每日温度", "Stack", "Medium", ["monotonic-stack"]),
  entry("car-fleet", "Car Fleet", "车队", "Stack", "Medium", ["stack", "sorting"]),
  entry("largest-rectangle-in-histogram", "Largest Rectangle in Histogram", "柱状图中最大的矩形", "Stack", "Hard", ["monotonic-stack"]),
  entry("binary-search", "Binary Search", "二分查找", "Binary Search", "Easy", ["binary-search"]),
  entry("search-a-2d-matrix", "Search a 2D Matrix", "搜索二维矩阵", "Binary Search", "Medium", ["binary-search", "matrix"]),
  entry("koko-eating-bananas", "Koko Eating Bananas", "爱吃香蕉的珂珂", "Binary Search", "Medium", ["binary-search"]),
  entry("time-based-key-value-store", "Time Based Key-Value Store", "基于时间的键值存储", "Binary Search", "Medium", ["binary-search", "design"]),
  entry("median-of-two-sorted-arrays", "Median of Two Sorted Arrays", "寻找两个正序数组的中位数", "Binary Search", "Hard", ["binary-search"]),
  entry("copy-list-with-random-pointer", "Copy List with Random Pointer", "随机链表的复制", "Linked List", "Medium", ["linked-list", "hash-table"]),
  entry("add-two-numbers", "Add Two Numbers", "两数相加", "Linked List", "Medium", ["linked-list"]),
  entry("find-the-duplicate-number", "Find the Duplicate Number", "寻找重复数", "Linked List", "Medium", ["two-pointers", "binary-search"]),
  entry("lru-cache", "LRU Cache", "LRU 缓存", "Linked List", "Medium", ["linked-list", "hash-table", "design"]),
  entry("reverse-nodes-in-k-group", "Reverse Nodes in k-Group", "K 个一组翻转链表", "Linked List", "Hard", ["linked-list"]),
  entry("diameter-of-binary-tree", "Diameter of Binary Tree", "二叉树的直径", "Trees", "Easy", ["tree", "dfs"]),
  entry("balanced-binary-tree", "Balanced Binary Tree", "平衡二叉树", "Trees", "Easy", ["tree", "dfs"]),
  entry("binary-tree-right-side-view", "Binary Tree Right Side View", "二叉树的右视图", "Trees", "Medium", ["tree", "bfs"]),
  entry("count-good-nodes-in-binary-tree", "Count Good Nodes in Binary Tree", "统计二叉树中好节点的数目", "Trees", "Medium", ["tree", "dfs"]),
  entry("kth-largest-element-in-a-stream", "Kth Largest Element in a Stream", "数据流中的第 K 大元素", "Heap", "Easy", ["heap"]),
  entry("last-stone-weight", "Last Stone Weight", "最后一块石头的重量", "Heap", "Easy", ["heap"]),
  entry("k-closest-points-to-origin", "K Closest Points to Origin", "最接近原点的 K 个点", "Heap", "Medium", ["heap"]),
  entry("kth-largest-element-in-an-array", "Kth Largest Element in an Array", "数组中的第 K 个最大元素", "Heap", "Medium", ["heap"]),
  entry("task-scheduler", "Task Scheduler", "任务调度器", "Heap", "Medium", ["heap", "greedy"]),
  entry("subsets", "Subsets", "子集", "Backtracking", "Medium", ["backtracking"]),
  entry("permutations", "Permutations", "全排列", "Backtracking", "Medium", ["backtracking"]),
  entry("subsets-ii", "Subsets II", "子集 II", "Backtracking", "Medium", ["backtracking"]),
  entry("combination-sum-ii", "Combination Sum II", "组合总和 II", "Backtracking", "Medium", ["backtracking"]),
  entry("palindrome-partitioning", "Palindrome Partitioning", "分割回文串", "Backtracking", "Medium", ["backtracking"]),
  entry("letter-combinations-of-a-phone-number", "Letter Combinations of a Phone Number", "电话号码的字母组合", "Backtracking", "Medium", ["backtracking"]),
  entry("n-queens", "N-Queens", "N 皇后", "Backtracking", "Hard", ["backtracking"]),
  entry("max-area-of-island", "Max Area of Island", "岛屿的最大面积", "Graphs", "Medium", ["graph", "dfs"]),
  entry("rotting-oranges", "Rotting Oranges", "腐烂的橘子", "Graphs", "Medium", ["graph", "bfs"]),
  entry("surrounded-regions", "Surrounded Regions", "被围绕的区域", "Graphs", "Medium", ["graph", "dfs"]),
  entry("course-schedule-ii", "Course Schedule II", "课程表 II", "Graphs", "Medium", ["graph", "topological-sort"]),
  entry("redundant-connection", "Redundant Connection", "冗余连接", "Graphs", "Medium", ["graph", "union-find"]),
  entry("word-ladder", "Word Ladder", "单词接龙", "Graphs", "Hard", ["graph", "bfs"]),
  entry("network-delay-time", "Network Delay Time", "网络延迟时间", "Advanced Graphs", "Medium", ["graph", "shortest-path"]),
  entry("min-cost-to-connect-all-points", "Min Cost to Connect All Points", "连接所有点的最小费用", "Advanced Graphs", "Medium", ["graph", "mst"]),
  entry("cheapest-flights-within-k-stops", "Cheapest Flights Within K Stops", "K 站中转内最便宜的航班", "Advanced Graphs", "Medium", ["graph", "shortest-path"]),
  entry("min-cost-climbing-stairs", "Min Cost Climbing Stairs", "使用最小花费爬楼梯", "1-D DP", "Easy", ["dynamic-programming"]),
  entry("partition-equal-subset-sum", "Partition Equal Subset Sum", "分割等和子集", "1-D DP", "Medium", ["dynamic-programming"]),
  entry("best-time-to-buy-and-sell-stock-with-cooldown", "Best Time to Buy and Sell Stock with Cooldown", "买卖股票的最佳时机含冷冻期", "2-D DP", "Medium", ["dynamic-programming"]),
  entry("coin-change-ii", "Coin Change II", "零钱兑换 II", "2-D DP", "Medium", ["dynamic-programming"]),
  entry("target-sum", "Target Sum", "目标和", "2-D DP", "Medium", ["dynamic-programming"]),
  entry("interleaving-string", "Interleaving String", "交错字符串", "2-D DP", "Medium", ["dynamic-programming"]),
  entry("longest-increasing-path-in-a-matrix", "Longest Increasing Path in a Matrix", "矩阵中的最长递增路径", "2-D DP", "Hard", ["dynamic-programming", "dfs"]),
  entry("distinct-subsequences", "Distinct Subsequences", "不同的子序列", "2-D DP", "Hard", ["dynamic-programming"]),
  entry("edit-distance", "Edit Distance", "编辑距离", "2-D DP", "Medium", ["dynamic-programming"]),
  entry("burst-balloons", "Burst Balloons", "戳气球", "2-D DP", "Hard", ["dynamic-programming"]),
  entry("regular-expression-matching", "Regular Expression Matching", "正则表达式匹配", "2-D DP", "Hard", ["dynamic-programming"]),
  entry("jump-game-ii", "Jump Game II", "跳跃游戏 II", "Greedy", "Medium", ["greedy"]),
  entry("gas-station", "Gas Station", "加油站", "Greedy", "Medium", ["greedy"]),
  entry("hand-of-straights", "Hand of Straights", "一手顺子", "Greedy", "Medium", ["greedy"]),
  entry("partition-labels", "Partition Labels", "划分字母区间", "Greedy", "Medium", ["greedy"]),
  entry("valid-parenthesis-string", "Valid Parenthesis String", "有效的括号字符串", "Greedy", "Medium", ["greedy"]),
  entry("minimum-interval-to-include-each-query", "Minimum Interval to Include Each Query", "包含每个查询的最小区间", "Intervals", "Hard", ["intervals", "heap"]),
  entry("happy-number", "Happy Number", "快乐数", "Math & Geometry", "Easy", ["math"]),
  entry("plus-one", "Plus One", "加一", "Math & Geometry", "Easy", ["math"]),
  entry("powx-n", "Pow(x, n)", "Pow(x, n)", "Math & Geometry", "Medium", ["math", "binary-search"]),
  entry("multiply-strings", "Multiply Strings", "字符串相乘", "Math & Geometry", "Medium", ["math", "string"]),
  entry("single-number", "Single Number", "只出现一次的数字", "Bit Manipulation", "Easy", ["bit-manipulation"]),
  entry("reverse-integer", "Reverse Integer", "整数反转", "Bit Manipulation", "Medium", ["math"])
];

function dedupeEntries(items: CuratedProblemEntry[]): CuratedProblemEntry[] {
  const seen = new Set<string>();
  const result: CuratedProblemEntry[] = [];
  for (const item of items) {
    if (!seen.has(item.slug)) {
      seen.add(item.slug);
      result.push(item);
    }
  }
  return result;
}

export const CURATED_SHEETS: Record<CuratedSheet["id"], CuratedSheet> = {
  "hot-100": {
    id: "hot-100",
    title: "LeetCode Hot 100 (Core Index)",
    titleZh: "力扣 Hot 100 精简核心路线",
    description: "Lightweight slug index of core Hot 100 problems; full statements are fetched on demand.",
    defaultSource: "leetcode-cn",
    items: dedupeEntries(HOT_100_ITEMS)
  },
  "blind-75": {
    id: "blind-75",
    title: "Blind 75",
    titleZh: "Blind 75 经典面试路线",
    description: "Curated Blind 75 slug index covering core interview data structures and algorithms.",
    defaultSource: "leetcode-global",
    items: dedupeEntries(BLIND_75_ITEMS)
  },
  "neetcode-150": {
    id: "neetcode-150",
    title: "NeetCode 150",
    titleZh: "NeetCode 150 进阶路线",
    description: "Structured roadmap extending Blind 75 across 18 core algorithmic patterns.",
    defaultSource: "leetcode-global",
    items: dedupeEntries([...BLIND_75_ITEMS, ...NEETCODE_150_EXTRA])
  }
};

export function listCuratedSheets(): CuratedSheet[] {
  return Object.values(CURATED_SHEETS);
}

export function getCuratedSheet(sheetId: string): CuratedSheet | undefined {
  const normalized = sheetId.trim().toLowerCase();
  if (normalized === "hot-100" || normalized === "hot100") {
    return CURATED_SHEETS["hot-100"];
  }
  if (normalized === "blind-75" || normalized === "blind75") {
    return CURATED_SHEETS["blind-75"];
  }
  if (normalized === "neetcode-150" || normalized === "neetcode150") {
    return CURATED_SHEETS["neetcode-150"];
  }
  return undefined;
}

export function curatedEntryToMetadataDocument(
  item: CuratedProblemEntry,
  source: Extract<ProblemSourceId, "leetcode-cn" | "leetcode-global">
): ProblemDocument {
  const isCn = source === "leetcode-cn";
  const host = isCn ? "leetcode.cn" : "leetcode.com";
  const keyPrefix = isCn ? "lc-cn" : "lc-global";
  return {
    schemaVersion: "problem-doc/v2",
    problemKey: `${keyPrefix}:${item.slug}`,
    source,
    sourceId: item.slug,
    canonicalUrl: `https://${host}/problems/${item.slug}/`,
    title: isCn ? item.titleZh : item.title,
    locale: isCn ? "zh-CN" : "en-US",
    completeness: "metadata_only",
    ioMode: "function",
    samples: [],
    difficulty: {
      rawLabel: item.difficulty,
      normalizedTier: item.normalizedTier
    },
    rawTags: [...item.tags],
    provenance: {
      ingestChannel: "builtin-adapter",
      fetchedAt: new Date().toISOString()
    }
  };
}
