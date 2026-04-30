import type { ProblemSetRecord } from "../problemBank/types";
import type { OptimizationReport, OptimizationVerdict } from "./optimizationReport";
import type { TeachingDiagnosisReport } from "./teachingReport";
import type { TeachingDiagnosisContext, TeachingStudentProfileSummary } from "./types";

export const JOURNEY_TRAINING_IDS = Array.from({ length: 17 }, (_, index) => String(100 + index));

export type JourneyTrialVariant = "standard" | "long";

export interface JourneyCaseBuildOptions {
  variant?: JourneyTrialVariant;
}

export interface JourneyDiagnosisCase {
  caseId: string;
  trainingId: string;
  trainingTitle: string;
  problemId: string;
  problemTitle: string;
  stage: "beginner" | "algorithm" | "data-structure";
  expectedPainPoints: string[];
  expectedSkillCandidate: string;
  acceptedSkillCandidates: string[];
  wrongCode: string;
  studentRequest: string;
}

export interface JourneyOptimizationCase {
  trainingId: string;
  trainingTitle: string;
  problemId: string;
  problemTitle: string;
  expectedVerdict: OptimizationVerdict;
  archivedReason: string;
  previousScoreSummary: string;
  studentCode: string;
  studentRequest: string;
}

export interface JourneyDiagnosisScore {
  painPointHit: boolean;
  primaryPainPointHit: boolean;
  expectedPainPoints: string[];
  actualPainPoints: string[];
  expectedSkillCandidate: string;
  actualSkillCandidate?: string;
  skillCandidateHit: boolean;
  recommendation?: string;
}

export interface JourneyOptimizationScore {
  verdictHit: boolean;
  expectedVerdict: OptimizationVerdict;
  actualVerdict: OptimizationVerdict;
  optimizationNeeded: boolean;
}

interface JourneyCaseTemplate {
  expectedPainPoints: string[];
  expectedSkillCandidate: string;
  acceptedSkillCandidates?: string[];
  wrongCode: string;
  studentRequest: string;
}

interface ExtraJourneyCaseTemplate extends JourneyCaseTemplate {
  caseId: string;
  trainingId: string;
  preferredProblemId?: string;
}

interface JourneyOptimizationTemplate {
  expectedVerdict: OptimizationVerdict;
  previousScoreSummary: string;
  studentCode: string;
  studentRequest: string;
}

const DIAGNOSIS_TEMPLATES: Record<string, JourneyCaseTemplate> = {
  "100": {
    expectedPainPoints: ["numeric_input_type", "output_format"],
    expectedSkillCandidate: "numeric-geometry-formatting",
    wrongCode: "a, b = input().split()\nprint(a + b)\n",
    studentRequest: "我是刚开始写题的小白，帮我只指出当前最关键的问题。"
  },
  "101": {
    expectedPainPoints: ["branch_condition_coverage"],
    expectedSkillCandidate: "branch-boundary-check",
    wrongCode: "year = int(input())\nif year % 4 == 0:\n    print(1)\nelse:\n    print(0)\n",
    studentRequest: "分支结构题，我总是漏掉边界条件。"
  },
  "102": {
    expectedPainPoints: ["loop_boundary"],
    expectedSkillCandidate: "python-loop-boundary-check",
    wrongCode:
      "n = int(input())\na = list(map(int, input().split()))\nmn = a[0]\nfor i in range(1, n - 1):\n    if a[i] < mn:\n        mn = a[i]\nprint(mn)\n",
    studentRequest: "循环结构题，样例过了但边界不稳。"
  },
  "103": {
    expectedPainPoints: ["array_indexing"],
    expectedSkillCandidate: "array-indexing-checklist",
    wrongCode: "n = int(input())\na = list(map(int, input().split()))\nfor i in range(1, n + 1):\n    print(a[i])\n",
    studentRequest: "数组题经常 RE，帮我找最可能的下标问题。"
  },
  "104": {
    expectedPainPoints: ["output_format"],
    expectedSkillCandidate: "format-output-checklist",
    wrongCode: "s = input()\nprint(list(reversed(s)))\n",
    studentRequest: "字符串题输出看起来和答案不一样。"
  },
  "105": {
    expectedPainPoints: ["distance_formula", "numeric_input_type"],
    expectedSkillCandidate: "numeric-geometry-formatting",
    wrongCode:
      "points = [tuple(map(int, input().split())) for _ in range(3)]\nans = 0\nfor i in range(3):\n    x1, y1 = points[i]\n    x2, y2 = points[(i + 1) % 3]\n    ans += abs(x1 - x2) + abs(y1 - y2)\nprint(ans)\n",
    studentRequest: "函数/结构体这类题，我想知道公式和类型有没有问题。"
  },
  "106": {
    expectedPainPoints: ["high_precision_carry_order", "output_order", "loop_boundary"],
    expectedSkillCandidate: "high-precision-carry-order",
    wrongCode:
      "a = input().strip()\nb = input().strip()\ncarry = 0\nout = []\nfor i in range(min(len(a), len(b))):\n    v = int(a[i]) + int(b[i]) + carry\n    out.append(str(v % 10))\n    carry = v // 10\nprint(''.join(out))\n",
    studentRequest: "模拟/高精度题，感觉顺序和进位容易错。"
  },
  "107": {
    expectedPainPoints: ["duplicate_handling"],
    expectedSkillCandidate: "ordered-multiset-semantics",
    wrongCode: "n = int(input())\na = sorted(set(map(int, input().split())))\nprint(' '.join(map(str, a)))\n",
    studentRequest: "排序题我用了 set 去重，但不确定是否合理。"
  },
  "108": {
    expectedPainPoints: ["bruteforce_no_growth", "time_complexity_mismatch", "complexity_gap"],
    expectedSkillCandidate: "complexity-upgrade-from-bruteforce",
    wrongCode:
      "n, m = map(int, input().split())\nsquare = 0\nrectangle = 0\nfor x1 in range(n):\n    for y1 in range(m):\n        for x2 in range(x1 + 1, n + 1):\n            for y2 in range(y1 + 1, m + 1):\n                if x2 - x1 == y2 - y1:\n                    square += 1\n                else:\n                    rectangle += 1\nprint(square, rectangle)\n",
    studentRequest: "暴力枚举能写出来，但不知道有没有算法提升。"
  },
  "109": {
    expectedPainPoints: ["recursion_base_case"],
    expectedSkillCandidate: "recursion-base-case-pattern",
    wrongCode: "def f(n):\n    return f(n - 1) + f(n - 2)\n\nprint(f(int(input())))\n",
    studentRequest: "递推递归题，我经常不知道递归什么时候停。"
  },
  "110": {
    expectedPainPoints: ["greedy_choice_model"],
    expectedSkillCandidate: "greedy-choice-proof-check",
    wrongCode:
      "n, t = map(int, input().split())\nitems = [tuple(map(float, input().split())) for _ in range(n)]\nitems.sort()\nans = 0\nfor weight, value in items:\n    if t >= weight:\n        ans += value\n        t -= weight\nprint(f'{ans:.2f}')\n",
    studentRequest: "贪心题我会先排序，但不知道贪心选择是否能证明。"
  },
  "111": {
    expectedPainPoints: [
      "binary_search_invariant",
      "time_complexity_mismatch",
      "complexity_gap",
      "bruteforce_no_growth"
    ],
    expectedSkillCandidate: "complexity-upgrade-from-bruteforce",
    wrongCode: "n, q = map(int, input().split())\na = list(map(int, input().split()))\nfor x in map(int, input().split()):\n    pos = -1\n    for i in range(n):\n        if a[i] == x:\n            pos = i + 1\n            break\n    print(pos)\n",
    studentRequest: "二分题我写成线性扫描了，想知道这算不算没学到算法。"
  },
  "112": {
    expectedPainPoints: ["search_state_pruning", "recursion_base_case"],
    expectedSkillCandidate: "search-state-boundary-check",
    acceptedSkillCandidates: ["recursion-base-case-pattern"],
    wrongCode:
      "n = int(input())\nans = 0\n\ndef dfs(row):\n    global ans\n    if row == n:\n        ans += 1\n        return\n    for col in range(n):\n        dfs(row + 1)\n\ndfs(0)\nprint(ans)\n",
    studentRequest: "搜索题有递归出口，但我不知道怎么记录状态和剪掉非法分支。"
  },
  "113": {
    expectedPainPoints: ["array_indexing"],
    expectedSkillCandidate: "array-indexing-checklist",
    wrongCode: "n = int(input())\na = []\nfor _ in range(n):\n    op, x = map(int, input().split())\n    if op == 1:\n        a[x] = x\n    else:\n        print(a[x])\n",
    studentRequest: "线性表题操作位置总是搞混。"
  },
  "114": {
    expectedPainPoints: ["depth_definition", "recursion_base_case"],
    expectedSkillCandidate: "binary-tree-depth-numbered-children",
    wrongCode:
      "n = int(input())\nleft = [0] * (n + 1)\nright = [0] * (n + 1)\nfor i in range(1, n + 1):\n    left[i], right[i] = map(int, input().split())\n\ndef depth(x):\n    if x == 0:\n        return 0\n    return max(depth(left[x]), depth(right[x]))\n\nprint(depth(1))\n",
    studentRequest: "二叉树题，我不确定节点编号和深度怎么建模。"
  },
  "115": {
    expectedPainPoints: ["duplicate_handling", "data_structure_semantics"],
    expectedSkillCandidate: "ordered-multiset-semantics",
    wrongCode: "s = set()\nfor _ in range(int(input())):\n    op, x = input().split()\n    if op == 'add':\n        s.add(x)\n    elif op == 'del':\n        s.remove(x)\n    print(len(s))\n",
    studentRequest: "集合题我会用 set，但重复元素和删除语义不稳。"
  },
  "116": {
    expectedPainPoints: ["graph_adjacency_model", "undirected_tree_edges"],
    expectedSkillCandidate: "graph-adjacency-model",
    wrongCode:
      "n, m = map(int, input().split())\ng = [[] for _ in range(n + 1)]\nfor _ in range(m):\n    u, v = map(int, input().split())\n    g[u].append(v)\nprint(g[1])\n",
    studentRequest: "图题我经常只存一条边，遍历结果不完整。"
  }
};

const PREFERRED_DIAGNOSIS_PROBLEM_BY_TRAINING: Record<string, string> = {
  "100": "P1001",
  "101": "P5711",
  "106": "P1601",
  "110": "P2240",
  "111": "P2249",
  "112": "P1219",
  "114": "P4913",
  "115": "P4305",
  "116": "P5318"
};

const PREFERRED_OPTIMIZATION_PROBLEM_BY_TRAINING: Record<string, string> = {
  "108": "P2141",
  "111": "P2249",
  "115": "P1551",
  "116": "P5318"
};

const LONG_DIAGNOSIS_TEMPLATES: ExtraJourneyCaseTemplate[] = [
  {
    caseId: "T100-output-expression",
    trainingId: "100",
    preferredProblemId: "P5708",
    expectedPainPoints: ["numeric_input_type", "output_format"],
    expectedSkillCandidate: "numeric-geometry-formatting",
    acceptedSkillCandidates: ["format-output-checklist"],
    wrongCode: "r = input()\npi = 3.14\nprint('area=' + pi * r * r)\n",
    studentRequest: "顺序结构题，我经常把数字和字符串混在一起。"
  },
  {
    caseId: "T101-branch-exception",
    trainingId: "101",
    preferredProblemId: "P5711",
    expectedPainPoints: ["branch_condition_coverage"],
    expectedSkillCandidate: "branch-boundary-check",
    wrongCode: "y = int(input())\nif y % 400 == 0 or y % 4 == 0:\n    print(1)\nelse:\n    print(0)\n",
    studentRequest: "分支题我知道大概条件，但经常漏特例。"
  },
  {
    caseId: "T102-loop-inclusive",
    trainingId: "102",
    expectedPainPoints: ["loop_boundary"],
    expectedSkillCandidate: "python-loop-boundary-check",
    wrongCode: "n = int(input())\nfor i in range(n):\n    if n % i == 0:\n        print(i)\n",
    studentRequest: "循环题边界和从 0 开始总是让我 RE。"
  },
  {
    caseId: "T103-array-init",
    trainingId: "103",
    expectedPainPoints: ["array_indexing"],
    expectedSkillCandidate: "array-indexing-checklist",
    wrongCode: "n = int(input())\na = []\nfor i in range(1, n + 1):\n    a[i] = int(input())\nprint(sum(a))\n",
    studentRequest: "数组题我想按 1 开始写，但 Python 经常炸。"
  },
  {
    caseId: "T104-string-join",
    trainingId: "104",
    expectedPainPoints: ["output_format"],
    expectedSkillCandidate: "format-output-checklist",
    wrongCode: "s = input()\nans = []\nfor ch in s:\n    ans.append(ch.upper())\nprint(ans)\n",
    studentRequest: "字符串题逻辑好像对，但输出格式总不一样。"
  },
  {
    caseId: "T105-geometry-float",
    trainingId: "105",
    preferredProblemId: "P5735",
    expectedPainPoints: ["distance_formula", "numeric_input_type"],
    expectedSkillCandidate: "numeric-geometry-formatting",
    wrongCode:
      "import math\nx1, y1 = map(int, input().split())\nx2, y2 = map(int, input().split())\nprint(abs(x1 - x2) + abs(y1 - y2))\n",
    studentRequest: "几何函数题我不知道什么时候要用浮点和平方根。"
  },
  {
    caseId: "T106-high-precision-carry",
    trainingId: "106",
    preferredProblemId: "P1601",
    expectedPainPoints: ["high_precision_carry_order", "loop_boundary"],
    expectedSkillCandidate: "high-precision-carry-order",
    acceptedSkillCandidates: ["python-loop-boundary-check"],
    wrongCode:
      "a = input()[::-1]\nb = input()[::-1]\nout = []\ncarry = 0\nfor i in range(min(len(a), len(b))):\n    s = int(a[i]) + int(b[i])\n    out.append(str(s % 10))\n    carry = s // 10\nprint(''.join(out[::-1]))\n",
    studentRequest: "高精度题我能反转，但进位和长度处理不稳。"
  },
  {
    caseId: "T107-sort-duplicates",
    trainingId: "107",
    expectedPainPoints: ["duplicate_handling"],
    expectedSkillCandidate: "ordered-multiset-semantics",
    wrongCode: "n = int(input())\na = list(set(map(int, input().split())))\na.sort()\nprint(*a)\n",
    studentRequest: "排序题去重到底是不是总可以？"
  },
  {
    caseId: "T108-enumeration-pruning",
    trainingId: "108",
    expectedPainPoints: ["bruteforce_no_growth", "time_complexity_mismatch"],
    expectedSkillCandidate: "complexity-upgrade-from-bruteforce",
    wrongCode:
      "n = int(input())\nans = 0\nfor a in range(n):\n    for b in range(n):\n        for c in range(n):\n            for d in range(n):\n                if a + b + c + d == n:\n                    ans += 1\nprint(ans)\n",
    studentRequest: "暴力枚举写出来了，但感觉完全没有剪枝或模型。"
  },
  {
    caseId: "T109-recursion-memo",
    trainingId: "109",
    expectedPainPoints: ["recursion_base_case", "time_complexity_mismatch"],
    expectedSkillCandidate: "recursion-base-case-pattern",
    acceptedSkillCandidates: ["complexity-upgrade-from-bruteforce"],
    wrongCode: "def f(n):\n    if n == 1:\n        return 1\n    return f(n - 1) + f(n - 2)\nprint(f(int(input())))\n",
    studentRequest: "递归题小数据能跑，大一点就爆或特别慢。"
  },
  {
    caseId: "T110-greedy-proof",
    trainingId: "110",
    preferredProblemId: "P2240",
    expectedPainPoints: ["greedy_choice_model"],
    expectedSkillCandidate: "greedy-choice-proof-check",
    wrongCode:
      "n, t = map(int, input().split())\nitems = [tuple(map(float, input().split())) for _ in range(n)]\nitems.sort(key=lambda x: x[1], reverse=True)\nans = 0\nfor w, v in items:\n    if t >= w:\n        ans += v\n        t -= w\nprint(f'{ans:.2f}')\n",
    studentRequest: "我按价值排序了，但不知道贪心为什么错。"
  },
  {
    caseId: "T111-binary-answer",
    trainingId: "111",
    expectedPainPoints: ["binary_search_invariant", "time_complexity_mismatch"],
    expectedSkillCandidate: "complexity-upgrade-from-bruteforce",
    acceptedSkillCandidates: ["binary-search-boundary-check"],
    wrongCode:
      "n, m = map(int, input().split())\na = list(map(int, input().split()))\nfor h in range(max(a) + 1):\n    if sum(max(0, x - h) for x in a) >= m:\n        ans = h\nprint(ans)\n",
    studentRequest: "二分答案题我从 0 枚举高度，样例过了但很慢。"
  },
  {
    caseId: "T112-search-visited",
    trainingId: "112",
    expectedPainPoints: ["search_state_pruning", "recursion_base_case"],
    expectedSkillCandidate: "search-state-boundary-check",
    acceptedSkillCandidates: ["recursion-base-case-pattern"],
    wrongCode:
      "def dfs(x):\n    for y in g[x]:\n        dfs(y)\n\nn, m = map(int, input().split())\ng = [[] for _ in range(n + 1)]\nfor _ in range(m):\n    u, v = map(int, input().split())\n    g[u].append(v)\n    g[v].append(u)\ndfs(1)\n",
    studentRequest: "搜索题一有环就停不下来。"
  },
  {
    caseId: "T113-list-delete",
    trainingId: "113",
    expectedPainPoints: ["array_indexing", "data_structure_semantics"],
    expectedSkillCandidate: "array-indexing-checklist",
    acceptedSkillCandidates: ["ordered-multiset-semantics"],
    wrongCode:
      "n = int(input())\na = list(map(int, input().split()))\nq = int(input())\nfor _ in range(q):\n    pos = int(input())\n    a.pop(pos)\nprint(*a)\n",
    studentRequest: "线性表题删除第几个元素时，我老是差一位。"
  },
  {
    caseId: "T114-traversal",
    trainingId: "114",
    preferredProblemId: "P1030",
    expectedPainPoints: ["traversal_order_confusion", "root_identification"],
    expectedSkillCandidate: "binary-tree-traversal-reconstruction",
    wrongCode: "mid = input().strip()\npost = input().strip()\nroot = post[0]\nprint(root + mid)\n",
    studentRequest: "二叉树遍历题，我经常不知道根从哪里来。"
  },
  {
    caseId: "T114-tree-distance",
    trainingId: "114",
    preferredProblemId: "P3884",
    expectedPainPoints: ["tree_distance", "undirected_tree_edges"],
    expectedSkillCandidate: "tree-weighted-distance",
    acceptedSkillCandidates: ["graph-undirected-edge-model", "graph-adjacency-model"],
    wrongCode:
      "n = int(input())\nparent = [0] * (n + 1)\nfor _ in range(n - 1):\n    u, v = map(int, input().split())\n    parent[v] = u\nx, y = map(int, input().split())\nprint(abs(x - y))\n",
    studentRequest: "树上距离题我想用编号差，但感觉不对。"
  },
  {
    caseId: "T115-dsu-transitive",
    trainingId: "115",
    preferredProblemId: "P1551",
    expectedPainPoints: ["disjoint_set_union_semantics", "data_structure_semantics"],
    expectedSkillCandidate: "disjoint-set-union-model",
    acceptedSkillCandidates: ["ordered-multiset-semantics"],
    wrongCode:
      "n, m, p = map(int, input().split())\npairs = set()\nfor _ in range(m):\n    a, b = map(int, input().split())\n    pairs.add((a, b))\nfor _ in range(p):\n    a, b = map(int, input().split())\n    print('Yes' if (a, b) in pairs or (b, a) in pairs else 'No')\n",
    studentRequest: "集合题我只存直接关系，但朋友关系好像有传递性。"
  },
  {
    caseId: "T116-graph-traversal",
    trainingId: "116",
    preferredProblemId: "P5318",
    expectedPainPoints: ["graph_adjacency_model", "search_state_pruning"],
    expectedSkillCandidate: "graph-adjacency-model",
    acceptedSkillCandidates: ["search-state-boundary-check"],
    wrongCode:
      "n, m = map(int, input().split())\ng = [[] for _ in range(n + 1)]\nfor _ in range(m):\n    u, v = map(int, input().split())\n    g[u].append(v)\nseen = set()\ndef dfs(x):\n    print(x)\n    for y in g[x]:\n        dfs(y)\ndfs(1)\n",
    studentRequest: "图遍历题，我的 DFS 有时漏点，有时重复。"
  }
];

const OPTIMIZATION_TEMPLATES: Record<string, JourneyOptimizationTemplate> = {
  "100": {
    expectedVerdict: "no_need",
    previousScoreSummary: "AC · 95/100 · matched",
    studentCode: "a, b = map(int, input().split())\nprint(a + b)\n",
    studentRequest: "这题还需要优化算法或内存吗？"
  },
  "108": {
    expectedVerdict: "optimize",
    previousScoreSummary: "AC on small cases · 58/100 · complexity_gap",
    studentCode:
      "n = int(input())\na = list(map(int, input().split()))\nans = 0\nfor i in range(n):\n    for j in range(n):\n        for k in range(n):\n            if i != j and a[i] + a[j] == a[k]:\n                ans += 1\nprint(ans)\n",
    studentRequest: "暴力过样例了，是否值得优化？"
  },
  "111": {
    expectedVerdict: "optimize",
    previousScoreSummary: "WA/TLE risk · 60/100 · time_complexity_mismatch",
    studentCode:
      "n, q = map(int, input().split())\na = list(map(int, input().split()))\nfor x in map(int, input().split()):\n    pos = -1\n    for i, value in enumerate(a):\n        if value == x:\n            pos = i + 1\n            break\n    print(pos)\n",
    studentRequest: "二分查找题用线性扫描可以吗？"
  },
  "115": {
    expectedVerdict: "optimize",
    previousScoreSummary: "AC on tiny local tests · 56/100 · complexity_gap",
    studentCode:
      "n, m, p = map(int, input().split())\nrel = []\nfor _ in range(m):\n    x, y = map(int, input().split())\n    rel.append((x, y))\nfor _ in range(p):\n    x, y = map(int, input().split())\n    ok = x == y or (x, y) in rel or (y, x) in rel\n    print('Yes' if ok else 'No')\n",
    studentRequest: "并查集题只保存直接关系够不够？"
  },
  "116": {
    expectedVerdict: "optimize",
    previousScoreSummary: "likely TLE · 52/100 · complexity_gap",
    studentCode:
      "n, m = map(int, input().split())\nedges = [tuple(map(int, input().split())) for _ in range(m)]\nfor start in range(1, n + 1):\n    for u, v in edges:\n        if u == start:\n            print(v)\n",
    studentRequest: "图题每次都扫全部边是否需要优化？"
  }
};

export function buildJourneyDiagnosisCases(
  problemSets: ProblemSetRecord[],
  options: JourneyCaseBuildOptions = {}
): JourneyDiagnosisCase[] {
  const baseCases = JOURNEY_TRAINING_IDS.map((trainingId) => {
    const problemSet = requireProblemSet(problemSets, trainingId);
    const problem = selectProblem(problemSet, PREFERRED_DIAGNOSIS_PROBLEM_BY_TRAINING[trainingId]);
    if (!problem) {
      throw new Error(`Luogu training ${trainingId} has no usable problem summaries.`);
    }

    const template = DIAGNOSIS_TEMPLATES[trainingId];
    return {
      caseId: `T${trainingId}-core`,
      trainingId,
      trainingTitle: problemSet.title,
      problemId: problem.id,
      problemTitle: problem.title,
      stage: stageForTrainingId(trainingId),
      expectedPainPoints: template.expectedPainPoints,
      expectedSkillCandidate: template.expectedSkillCandidate,
      acceptedSkillCandidates: template.acceptedSkillCandidates ?? [],
      wrongCode: template.wrongCode,
      studentRequest: template.studentRequest
    };
  });

  if ((options.variant ?? "standard") !== "long") {
    return baseCases;
  }

  return [...baseCases, ...buildExtraJourneyDiagnosisCases(problemSets)];
}

export function buildJourneyOptimizationCases(problemSets: ProblemSetRecord[]): JourneyOptimizationCase[] {
  return Object.entries(OPTIMIZATION_TEMPLATES).map(([trainingId, template]) => {
    const problemSet = requireProblemSet(problemSets, trainingId);
    const problem = selectProblem(problemSet, PREFERRED_OPTIMIZATION_PROBLEM_BY_TRAINING[trainingId]);
    if (!problem) {
      throw new Error(`Luogu training ${trainingId} has no usable problem summaries.`);
    }

    return {
      trainingId,
      trainingTitle: problemSet.title,
      problemId: problem.id,
      problemTitle: problem.title,
      expectedVerdict: template.expectedVerdict,
      archivedReason: "completed",
      previousScoreSummary: template.previousScoreSummary,
      studentCode: template.studentCode,
      studentRequest: template.studentRequest
    };
  });
}

function selectProblem(problemSet: ProblemSetRecord, preferredProblemId?: string): ProblemSetRecord["problems"][number] | undefined {
  if (preferredProblemId) {
    const preferred = problemSet.problems.find((problem) => problem.id.toUpperCase() === preferredProblemId);
    if (preferred) {
      return preferred;
    }
  }

  return problemSet.problems[0];
}

function buildExtraJourneyDiagnosisCases(problemSets: ProblemSetRecord[]): JourneyDiagnosisCase[] {
  return LONG_DIAGNOSIS_TEMPLATES.map((template) => {
    const problemSet = requireProblemSet(problemSets, template.trainingId);
    const problem = selectProblem(problemSet, template.preferredProblemId);
    if (!problem) {
      throw new Error(`Luogu training ${template.trainingId} has no usable problem summaries.`);
    }

    return {
      caseId: template.caseId,
      trainingId: template.trainingId,
      trainingTitle: problemSet.title,
      problemId: problem.id,
      problemTitle: problem.title,
      stage: stageForTrainingId(template.trainingId),
      expectedPainPoints: template.expectedPainPoints,
      expectedSkillCandidate: template.expectedSkillCandidate,
      acceptedSkillCandidates: template.acceptedSkillCandidates ?? [],
      wrongCode: template.wrongCode,
      studentRequest: template.studentRequest
    };
  });
}

export function buildJourneyTeachingContext(
  input: JourneyDiagnosisCase,
  studentProfile: TeachingStudentProfileSummary
): TeachingDiagnosisContext {
  return {
    problem: {
      id: input.problemId,
      title: input.problemTitle,
      summary: [
        `洛谷题单 ${input.trainingId}：${input.trainingTitle}`,
        `阶段：${input.stage}`,
        `学生请求：${input.studentRequest}`,
        "这是从小白到精英旅程内测的合成错误代码，请根据证据定位可迁移痛点。"
      ].join("\n")
    },
    language: "python",
    studentCode: input.wrongCode,
    ojVerdict: { status: "WA" },
    localEvidence: [],
    studentProfile,
    responseLanguage: "zh-CN"
  };
}

export function scoreJourneyDiagnosis(input: JourneyDiagnosisCase, report: TeachingDiagnosisReport): JourneyDiagnosisScore {
  const actualPainPoints = report.painPoints.map((painPoint) => painPoint.label);
  return {
    painPointHit: actualPainPoints.some((painPoint) => input.expectedPainPoints.includes(painPoint)),
    primaryPainPointHit: input.expectedPainPoints.includes(actualPainPoints[0] ?? ""),
    expectedPainPoints: input.expectedPainPoints,
    actualPainPoints,
    expectedSkillCandidate: input.expectedSkillCandidate,
    actualSkillCandidate: report.skillUpdate?.candidate,
    skillCandidateHit:
      report.skillUpdate?.candidate === input.expectedSkillCandidate ||
      (report.skillUpdate?.candidate ? input.acceptedSkillCandidates.includes(report.skillUpdate.candidate) : false),
    recommendation: report.recommendation?.problemId
  };
}

export function scoreJourneyOptimization(
  input: JourneyOptimizationCase,
  report: OptimizationReport
): JourneyOptimizationScore {
  return {
    verdictHit: report.verdict === input.expectedVerdict,
    expectedVerdict: input.expectedVerdict,
    actualVerdict: report.verdict,
    optimizationNeeded: report.optimizationNeeded
  };
}

function requireProblemSet(problemSets: ProblemSetRecord[], trainingId: string): ProblemSetRecord {
  const problemSet = problemSets.find((item) => item.id === trainingId);
  if (!problemSet) {
    throw new Error(`Missing Luogu training ${trainingId}.`);
  }

  return problemSet;
}

function stageForTrainingId(trainingId: string): JourneyDiagnosisCase["stage"] {
  const numericId = Number(trainingId);
  if (numericId <= 105) {
    return "beginner";
  }

  if (numericId <= 112) {
    return "algorithm";
  }

  return "data-structure";
}
