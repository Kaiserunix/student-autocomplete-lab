import type { ChatCompletionUsage, ChatCompletionUsageSink } from "../models/chatCompletionsClient";
import { createEmptyStudentProfile, profileSummary, type StudentProfile } from "./studentProfile";
import { createEmptyStudentSkill, type StudentSkill } from "./studentSkill";
import {
  buildSelfEvolutionTeachingContext,
  diagnoseFromSelfEvolutionSample,
  type SelfEvolutionWrongSample
} from "./selfEvolutionTrial";
import type { TeachingDiagnosisReport } from "./teachingReport";
import { normalizeTeachingDiagnosisReport } from "./teachingTaxonomy";
import { runTeachingCycleWithStudentSkill } from "./teachingCycle";
import type { TeachingDiagnosisContext } from "./types";

export interface LongitudinalSelfEvolutionSample extends SelfEvolutionWrongSample {
  sampleId: string;
  stage: number;
  stageLabel: string;
  difficulty: number;
  expectedOjStatus: "WA" | "RE" | "TLE" | "AC";
  expectedPrimaryPainPoint: string;
  expectedSkillCandidate: string;
  minimumCounterexample: {
    input: string;
    expectedOutput: string;
    actualOutput: string;
    reason: string;
  };
  bruteForceAllowed: boolean;
  recommendationRange: string[];
}

export interface LongitudinalBatchOptions {
  offset?: number;
  limit?: number;
}

export interface LongitudinalUsageSummary {
  callsWithUsage: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface LongitudinalSelfEvolutionStep {
  index: number;
  sampleId: string;
  problemId: string;
  stage: number;
  difficulty: number;
  expectedPainPoints: string[];
  actualPainPoints: string[];
  painPointHit: boolean;
  primaryPainPointHit: boolean;
  expectedSkillCandidate?: string;
  actualSkillCandidate?: string;
  skillCandidateHit: boolean;
  expectedRecommendationRange: string[];
  recommendation?: string;
  recommendationHit: boolean;
  studentSkillRevision: number;
  activeSkills: string[];
  changeSummary: string[];
  usage?: ChatCompletionUsage;
  diagnosisError?: string;
}

export interface LongitudinalSelfEvolutionResult {
  provider: "longitudinal-self-evolution";
  sampleCount: number;
  steps: LongitudinalSelfEvolutionStep[];
  scores: {
    painPointAccuracy: number;
    primaryPainPointAccuracy: number;
    skillCandidateAccuracy: number;
  };
  usage: LongitudinalUsageSummary;
  mismatchSummary: LongitudinalMismatchSummary;
  errorCount: number;
  finalProfile: StudentProfile;
  finalStudentSkill: StudentSkill;
}

export interface LongitudinalMismatchPair {
  expected: string;
  actual: string;
  count: number;
  sampleIds: string[];
}

export interface LongitudinalErrorSummary {
  sampleId: string;
  problemId: string;
  category: "provider" | "json" | "unknown";
  message: string;
}

export interface LongitudinalMismatchSummary {
  skillMismatchPairs: LongitudinalMismatchPair[];
  primaryPainPointMismatchPairs: LongitudinalMismatchPair[];
  recommendationMismatchPairs: LongitudinalMismatchPair[];
  diagnosisErrors: LongitudinalErrorSummary[];
  providerErrorCount: number;
  jsonRetryOrParseErrorCount: number;
}

export type LongitudinalDiagnose = (
  sample: LongitudinalSelfEvolutionSample,
  context: TeachingDiagnosisContext,
  onUsage?: ChatCompletionUsageSink
) => Promise<TeachingDiagnosisReport> | TeachingDiagnosisReport;

export interface RunLongitudinalSelfEvolutionOptions {
  studentId?: string;
  profile?: StudentProfile;
  studentSkill?: StudentSkill;
  occurredAt?: string;
  patchSource?: string;
  diagnose?: LongitudinalDiagnose;
}

interface LongitudinalTemplate {
  painPoint: string;
  problemIds: string[];
  topic: string;
  baseDifficulty: number;
  expectedDiagnosisHint: string;
  recommendationExpectation: string;
  code: (stage: number, variant: number) => string;
}

const STAGE_LABELS = [
  "输入和输出仍不稳",
  "能跑样例但边界不稳",
  "开始分函数但模型混乱",
  "递归或状态定义不稳",
  "能写主体但概念迁移差",
  "出现复杂度和数据结构选择",
  "多痛点混合但主因可辨认",
  "同类题迁移验证",
  "接近比赛写法",
  "近似正确但关键细节错"
];

const TEMPLATES: LongitudinalTemplate[] = [
  {
    painPoint: "binary_tree_traversal_order_confusion",
    problemIds: ["P1030", "P1305", "P1827", "P1229"],
    topic: "Binary tree traversal and reconstruction",
    baseDifficulty: 1,
    expectedDiagnosisHint:
      "The subtree split may look plausible, but the output order is still not preorder. At each subtree, emit the root before the recursive children.",
    recommendationExpectation: "Recommend a smaller traversal task before harder reconstruction.",
    code: traversalCode
  },
  {
    painPoint: "recursion_base_case_and_depth_definition",
    problemIds: ["P4913", "P3884", "P1305"],
    topic: "Recursive base cases and tree depth definitions",
    baseDifficulty: 1,
    expectedDiagnosisHint:
      "The empty child/base case is counted incorrectly. Check the one-node tree first and make the empty subtree contribute 0.",
    recommendationExpectation: "Recommend a small depth/base-case exercise.",
    code: depthCode
  },
  {
    painPoint: "output_order_and_sentinel_handling",
    problemIds: ["P1427", "P5727"],
    topic: "Sentinel input and reverse output order",
    baseDifficulty: 1,
    expectedDiagnosisHint:
      "The sentinel or generated terminal value is included in the reversed output. Collect valid values first, then reverse that collection only.",
    recommendationExpectation: "Recommend separating collection from output.",
    code: sentinelCode
  },
  {
    painPoint: "matrix_like_input_and_decimal_format",
    problemIds: ["P5735", "P5730", "P5731"],
    topic: "Numeric input, formula choice, and exact formatting",
    baseDifficulty: 1,
    expectedDiagnosisHint:
      "The code mixes the input type, formula, and output precision. Keep decimal input, compute the required formula, then format at the end.",
    recommendationExpectation: "Recommend a numeric-formatting micro exercise.",
    code: numericCode
  },
  {
    painPoint: "balanced_tree_concept_misused_as_sorted_set",
    problemIds: ["P3369", "P5076"],
    topic: "Ordered multiset and rank query semantics",
    baseDifficulty: 4,
    expectedDiagnosisHint:
      "The data structure is treated like a unique sorted set, but the operations require multiset semantics and duplicate-aware rank/kth behavior.",
    recommendationExpectation: "Recommend clarifying multiset semantics before optimizing.",
    code: multisetCode
  }
];

export function generateLongitudinalSelfEvolutionSamples(count = 1000): LongitudinalSelfEvolutionSample[] {
  return Array.from({ length: count }, (_, index) => buildSample(index, count));
}

export function selectLongitudinalBatch<T>(samples: T[], options: LongitudinalBatchOptions = {}): T[] {
  const offset = Math.max(0, options.offset ?? 0);
  const limit = options.limit === undefined ? samples.length - offset : Math.max(0, options.limit);
  return samples.slice(offset, offset + limit);
}

export async function runLongitudinalSelfEvolutionBatch(
  samples: LongitudinalSelfEvolutionSample[],
  options: RunLongitudinalSelfEvolutionOptions = {}
): Promise<LongitudinalSelfEvolutionResult> {
  let profile = options.profile ?? createEmptyStudentProfile(options.studentId ?? "longitudinal-student");
  let studentSkill =
    options.studentSkill ?? createEmptyStudentSkill(options.studentId ?? profile.studentId ?? "longitudinal-student");
  const diagnose = options.diagnose ?? diagnoseFromLongitudinalSample;
  const baseOccurredAt = options.occurredAt ?? new Date().toISOString();
  const steps: LongitudinalSelfEvolutionStep[] = [];
  const usage = emptyUsageSummary();

  for (const [index, sample] of samples.entries()) {
    const context = buildSelfEvolutionTeachingContext(sample, profileSummary(profile));
    const expected = normalizeTeachingDiagnosisReport(diagnoseFromSelfEvolutionSample(sample), {
      currentProblemId: sample.problemId,
      problemSummary: context.problem.summary
    });
    const expectedPainPoints = expected.painPoints.map((painPoint) => painPoint.label);
    const expectedSkillCandidate = expected.skillUpdate?.candidate;
    let stepUsage: ChatCompletionUsage | undefined;

    let rawReport: TeachingDiagnosisReport;
    try {
      rawReport = await Promise.resolve(
        diagnose(sample, context, (event) => {
          stepUsage = event;
          addUsage(usage, event);
        })
      );
    } catch (error) {
      steps.push({
        index,
        sampleId: sample.sampleId,
        problemId: sample.problemId,
        stage: sample.stage,
        difficulty: sample.difficulty,
        expectedPainPoints,
        actualPainPoints: [],
        painPointHit: false,
        primaryPainPointHit: false,
        expectedSkillCandidate,
        actualSkillCandidate: undefined,
        skillCandidateHit: false,
        expectedRecommendationRange: sample.recommendationRange,
        recommendation: undefined,
        recommendationHit: false,
        studentSkillRevision: studentSkill.revision,
        activeSkills: activeSkillNames(studentSkill),
        changeSummary: [],
        usage: stepUsage,
        diagnosisError: error instanceof Error ? error.message : String(error)
      });
      continue;
    }

    const report = normalizeTeachingDiagnosisReport(rawReport, {
      currentProblemId: sample.problemId,
      problemSummary: context.problem.summary
    });
    const cycle = await runTeachingCycleWithStudentSkill(context, profile, studentSkill, async () => report, {
      occurredAt: occurredAtForStep(baseOccurredAt, index),
      patchSource: options.patchSource ?? "longitudinal-self-evolution"
    });
    profile = cycle.updatedProfile;
    studentSkill = cycle.updatedStudentSkill;

    const actualPainPoints = cycle.report.painPoints.map((painPoint) => painPoint.label);
    const actualSkillCandidate = cycle.report.skillUpdate?.candidate;
    const recommendation = cycle.report.recommendation?.problemId;

    steps.push({
      index,
      sampleId: sample.sampleId,
      problemId: sample.problemId,
      stage: sample.stage,
      difficulty: sample.difficulty,
      expectedPainPoints,
      actualPainPoints,
      painPointHit: actualPainPoints.some((painPoint) => expectedPainPoints.includes(painPoint)),
      primaryPainPointHit: isPrimaryPainPointHit(expectedPainPoints, actualPainPoints, expectedSkillCandidate),
      expectedSkillCandidate,
      actualSkillCandidate,
      skillCandidateHit: expectedSkillCandidate === actualSkillCandidate,
      expectedRecommendationRange: sample.recommendationRange,
      recommendation,
      recommendationHit: recommendation ? sample.recommendationRange.includes(recommendation) : false,
      studentSkillRevision: studentSkill.revision,
      activeSkills: activeSkillNames(studentSkill),
      changeSummary: cycle.studentSkillMerge.changeSummary,
      usage: stepUsage
    });
  }

  return {
    provider: "longitudinal-self-evolution",
    sampleCount: samples.length,
    steps,
    scores: {
      painPointAccuracy: ratio(steps.filter((step) => step.painPointHit).length, steps.length),
      primaryPainPointAccuracy: ratio(steps.filter((step) => step.primaryPainPointHit).length, steps.length),
      skillCandidateAccuracy: ratio(steps.filter((step) => step.skillCandidateHit).length, steps.length)
    },
    usage,
    mismatchSummary: summarizeLongitudinalMismatches(steps),
    errorCount: steps.filter((step) => step.diagnosisError).length,
    finalProfile: profile,
    finalStudentSkill: studentSkill
  };
}

export function summarizeLongitudinalMismatches(steps: LongitudinalSelfEvolutionStep[]): LongitudinalMismatchSummary {
  const diagnosisErrors = steps
    .filter((step) => step.diagnosisError)
    .map((step) => ({
      sampleId: step.sampleId,
      problemId: step.problemId,
      category: classifyDiagnosisError(step.diagnosisError ?? ""),
      message: step.diagnosisError ?? ""
    }));

  return {
    skillMismatchPairs: summarizePairs(
      steps
        .filter((step) => !step.skillCandidateHit)
        .map((step) => ({
          sampleId: step.sampleId,
          expected: step.expectedSkillCandidate ?? "missing",
          actual: step.actualSkillCandidate ?? "missing"
        }))
    ),
    primaryPainPointMismatchPairs: summarizePairs(
      steps
        .filter((step) => !step.primaryPainPointHit)
        .map((step) => ({
          sampleId: step.sampleId,
          expected: step.expectedPainPoints[0] ?? "missing",
          actual: step.actualPainPoints[0] ?? "missing"
        }))
    ),
    recommendationMismatchPairs: summarizePairs(
      steps
        .filter((step) => !step.recommendationHit)
        .map((step) => ({
          sampleId: step.sampleId,
          expected: step.expectedRecommendationRange.join("|") || "missing",
          actual: step.recommendation ?? "missing"
        }))
    ),
    diagnosisErrors,
    providerErrorCount: diagnosisErrors.filter((error) => error.category === "provider").length,
    jsonRetryOrParseErrorCount: diagnosisErrors.filter((error) => error.category === "json").length
  };
}

function activeSkillNames(studentSkill: StudentSkill): string[] {
  return Object.values(studentSkill.skills)
    .filter((entry) => entry.status === "active" || entry.status === "mastered")
    .map((entry) => entry.name)
    .sort();
}

function isPrimaryPainPointHit(
  expectedPainPoints: string[],
  actualPainPoints: string[],
  expectedSkillCandidate: string | undefined
): boolean {
  const primary = expectedPainPoints[0];
  if (!primary) {
    return false;
  }

  if (actualPainPoints.includes(primary)) {
    return true;
  }

  return (
    expectedSkillCandidate === "binary-tree-depth-numbered-children" &&
    primary === "recursion_base_case" &&
    actualPainPoints.includes("depth_definition")
  );
}

function diagnoseFromLongitudinalSample(sample: LongitudinalSelfEvolutionSample): TeachingDiagnosisReport {
  return diagnoseFromSelfEvolutionSample(sample);
}

function buildSample(index: number, totalCount: number): LongitudinalSelfEvolutionSample {
  const samplesPerProblem = 5;
  const problemSlot = Math.floor(index / samplesPerProblem);
  const template = TEMPLATES[problemSlot % TEMPLATES.length];
  const stage = Math.min(10, Math.floor((index / Math.max(1, totalCount)) * 10) + 1);
  const variant = index % samplesPerProblem;
  const publicProblemId = template.problemIds[problemSlot % template.problemIds.length];
  const problemId = `SIM-${String(problemSlot + 1).padStart(4, "0")}`;
  const difficulty = Math.min(5, template.baseDifficulty + Math.floor((stage - 1) / 3));
  const expectation = sampleExpectation(template.painPoint, publicProblemId);

  return {
    sampleId: `long-${String(index + 1).padStart(4, "0")}`,
    stage,
    stageLabel: STAGE_LABELS[stage - 1],
    difficulty,
    problemId,
    topic: `${template.topic}; public anchor ${publicProblemId}; stage ${stage}: ${STAGE_LABELS[stage - 1]}`,
    painPoint: template.painPoint,
    wrongCode: template.code(stage, variant),
    expectedDiagnosisHint: template.expectedDiagnosisHint,
    recommendationExpectation: template.recommendationExpectation,
    expectedOjStatus: expectation.expectedOjStatus,
    expectedPrimaryPainPoint: expectation.expectedPrimaryPainPoint,
    expectedSkillCandidate: expectation.expectedSkillCandidate,
    minimumCounterexample: expectation.minimumCounterexample,
    bruteForceAllowed: expectation.bruteForceAllowed,
    recommendationRange: shouldAllowStayCurrentRecommendation(expectation.expectedPrimaryPainPoint)
      ? unique([...expectation.recommendationRange, problemId])
      : unique(expectation.recommendationRange)
  };
}

function sampleExpectation(
  painPoint: string,
  publicProblemId: string
): Pick<
  LongitudinalSelfEvolutionSample,
  | "expectedOjStatus"
  | "expectedPrimaryPainPoint"
  | "expectedSkillCandidate"
  | "minimumCounterexample"
  | "bruteForceAllowed"
  | "recommendationRange"
> {
  if (painPoint === "binary_tree_traversal_order_confusion") {
    return {
      expectedOjStatus: "WA",
      expectedPrimaryPainPoint: "traversal_order_confusion",
      expectedSkillCandidate: "binary-tree-traversal-reconstruction",
      minimumCounterexample: {
        input: "DBEAC\nDEBCA\n",
        expectedOutput: "ABDEC",
        actualOutput: "DEBCA",
        reason: "后序+中序重建先序时，根节点必须先输出。"
      },
      bruteForceAllowed: false,
      recommendationRange: [publicProblemId, "P1305", "P1030"]
    };
  }

  if (painPoint === "recursion_base_case_and_depth_definition") {
    return {
      expectedOjStatus: "WA",
      expectedPrimaryPainPoint: "recursion_base_case",
      expectedSkillCandidate: "binary-tree-depth-numbered-children",
      minimumCounterexample: {
        input: "1\n0 0\n",
        expectedOutput: "1",
        actualOutput: "2",
        reason: "空孩子深度是 0，单节点树深度是 1。"
      },
      bruteForceAllowed: true,
      recommendationRange: [publicProblemId, "P4913", "P1305"]
    };
  }

  if (painPoint === "output_order_and_sentinel_handling") {
    return {
      expectedOjStatus: "WA",
      expectedPrimaryPainPoint: "sentinel_input",
      expectedSkillCandidate: "sentinel-input-output-order",
      minimumCounterexample: {
        input: "1 2 0\n",
        expectedOutput: "2 1",
        actualOutput: "0 2 1",
        reason: "哨兵 0 只负责停止输入，不应该进入输出序列。"
      },
      bruteForceAllowed: true,
      recommendationRange: [publicProblemId, "P1427", "P5727"]
    };
  }

  if (painPoint === "matrix_like_input_and_decimal_format") {
    return {
      expectedOjStatus: "WA",
      expectedPrimaryPainPoint: "distance_formula",
      expectedSkillCandidate: "numeric-geometry-formatting",
      minimumCounterexample: {
        input: "0 0\n3 4\n3 0\n",
        expectedOutput: "12.00",
        actualOutput: "10",
        reason: "题目要求欧氏距离和两位小数，不能用曼哈顿距离或整数输出。"
      },
      bruteForceAllowed: true,
      recommendationRange: [publicProblemId, "P5735", "P5730"]
    };
  }

  return {
    expectedOjStatus: "WA",
    expectedPrimaryPainPoint: "duplicate_handling",
    expectedSkillCandidate: "ordered-multiset-semantics",
    minimumCounterexample: {
      input: "5\n1 2\n1 2\n3 2\n4 2\n2 2\n",
      expectedOutput: "1\n2",
      actualOutput: "1\n",
      reason: "普通平衡树语义是有序多重集，重复值会影响 rank/kth。"
    },
    bruteForceAllowed: false,
    recommendationRange: [publicProblemId, "P5076", "P3369"]
  };
}

function traversalCode(stage: number, variant: number): string {
  const name = variant % 2 === 0 ? "solve" : "build";
  if (stage <= 3) {
    return [
      "import sys",
      "inorder = sys.stdin.readline().strip()",
      "postorder = sys.stdin.readline().strip()",
      `def ${name}(ino, post):`,
      "    if not ino:",
      "        return ''",
      "    root = post[-1]",
      "    k = ino.index(root)",
      `    left = ${name}(ino[:k], post[:k])`,
      `    right = ${name}(ino[k + 1:], post[k:-1])`,
      "    return left + right + root",
      `print(${name}(inorder, postorder))`
    ].join("\n");
  }

  if (stage <= 7) {
    return [
      "inorder = input().strip()",
      "postorder = input().strip()",
      "def dfs(l1, r1, l2, r2):",
      "    if l1 > r1:",
      "        return ''",
      "    root = postorder[r2]",
      "    mid = inorder.index(root)",
      "    left_len = mid - l1",
      "    left = dfs(l1, mid - 1, l2, l2 + left_len - 1)",
      "    right = dfs(mid + 1, r1, l2 + left_len, r2 - 1)",
      "    return left + root + right",
      "print(dfs(0, len(inorder) - 1, 0, len(postorder) - 1))"
    ].join("\n");
  }

  return [
    "inorder = input().strip()",
    "postorder = input().strip()",
    "def dfs(ino, post):",
    "    if len(ino) == 1:",
    "        return ino",
    "    root = post[-1]",
    "    mid = ino.index(root)",
    "    return dfs(ino[:mid], post[:mid]) + root + dfs(ino[mid + 1:], post[mid:-1])",
    "print(dfs(inorder, postorder))"
  ].join("\n");
}

function depthCode(stage: number): string {
  if (stage <= 4) {
    return [
      "import sys",
      "sys.setrecursionlimit(1000000)",
      "n = int(input())",
      "ch = [[0, 0] for _ in range(n + 1)]",
      "for i in range(1, n + 1):",
      "    ch[i] = list(map(int, input().split()))",
      "def depth(u):",
      "    if u == 0:",
      "        return 1",
      "    return max(depth(ch[u][0]), depth(ch[u][1])) + 1",
      "print(depth(1))"
    ].join("\n");
  }

  if (stage <= 8) {
    return [
      "n = int(input())",
      "left = [0] * (n + 1)",
      "right = [0] * (n + 1)",
      "for i in range(1, n + 1):",
      "    left[i], right[i] = map(int, input().split())",
      "def depth(u):",
      "    if left[u] == 0 and right[u] == 0:",
      "        return 0",
      "    return max(depth(left[u]), depth(right[u])) + 1",
      "print(depth(1))"
    ].join("\n");
  }

  return [
    "n = int(input())",
    "children = [None] + [tuple(map(int, input().split())) for _ in range(n)]",
    "def depth(u):",
    "    if u == 0:",
    "        return 0",
    "    l, r = children[u]",
    "    return max(depth(l), depth(r))",
    "print(depth(1))"
  ].join("\n");
}

function sentinelCode(stage: number): string {
  if (stage <= 3) {
    return [
      "nums = list(map(int, input().split()))",
      "print(' '.join(map(str, nums[::-1])))"
    ].join("\n");
  }

  if (stage <= 7) {
    return [
      "nums = []",
      "for x in map(int, input().split()):",
      "    nums.append(x)",
      "    if x == 0:",
      "        break",
      "print(' '.join(map(str, nums[::-1])))"
    ].join("\n");
  }

  return [
    "nums = []",
    "for x in map(int, input().split()):",
    "    if x == 0:",
    "        break",
    "    nums.append(x)",
    "nums = nums.reverse()",
    "print(' '.join(map(str, nums)))"
  ].join("\n");
}

function numericCode(stage: number): string {
  if (stage <= 4) {
    return [
      "points = [list(map(int, input().split())) for _ in range(3)]",
      "ans = 0",
      "for i in range(3):",
      "    x1, y1 = points[i]",
      "    x2, y2 = points[(i + 1) % 3]",
      "    ans += abs(x1 - x2) + abs(y1 - y2)",
      "print(ans)"
    ].join("\n");
  }

  if (stage <= 8) {
    return [
      "import math",
      "points = [list(map(float, input().split())) for _ in range(3)]",
      "ans = 0",
      "for i in range(3):",
      "    x1, y1 = points[i]",
      "    x2, y2 = points[(i + 1) % 3]",
      "    ans += math.sqrt((x1 - x2) ** 2 + (y1 - y2) ** 2)",
      "print(ans)"
    ].join("\n");
  }

  return [
    "import math",
    "a, b, c = [tuple(map(float, input().split())) for _ in range(3)]",
    "def dist(p, q):",
    "    return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2",
    "ans = math.sqrt(dist(a, b) + dist(b, c) + dist(c, a))",
    "print(f'{ans:.2f}')"
  ].join("\n");
}

function multisetCode(stage: number): string {
  if (stage <= 5) {
    return [
      "import bisect",
      "n = int(input())",
      "a = []",
      "for _ in range(n):",
      "    op, x = map(int, input().split())",
      "    if op == 1:",
      "        if x not in a:",
      "            bisect.insort(a, x)",
      "    elif op == 2:",
      "        if x in a:",
      "            a.remove(x)",
      "    elif op == 3:",
      "        print(bisect.bisect_left(a, x) + 1)",
      "    elif op == 4:",
      "        print(a[x - 1])",
      "    elif op == 5:",
      "        print(a[bisect.bisect_left(a, x) - 1])",
      "    else:",
      "        print(a[bisect.bisect_right(a, x)])"
    ].join("\n");
  }

  return [
    "import bisect",
    "n = int(input())",
    "a = []",
    "for _ in range(n):",
    "    op, x = map(int, input().split())",
    "    if op == 1:",
    "        bisect.insort(a, x)",
    "    elif op == 2:",
    "        i = bisect.bisect_left(a, x)",
    "        if i < len(a):",
    "            a.pop(i)",
    "    elif op == 3:",
    "        print(bisect.bisect_right(a, x) + 1)",
    "    elif op == 4:",
    "        print(a[x])",
    "    elif op == 5:",
    "        print(a[bisect.bisect_left(a, x) - 1])",
    "    else:",
    "        print(a[bisect.bisect_right(a, x)])"
  ].join("\n");
}

function occurredAtForStep(baseOccurredAt: string, index: number): string {
  const date = new Date(baseOccurredAt);
  if (Number.isNaN(date.getTime())) {
    return baseOccurredAt;
  }

  date.setSeconds(date.getSeconds() + index);
  return date.toISOString();
}

function emptyUsageSummary(): LongitudinalUsageSummary {
  return {
    callsWithUsage: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0
  };
}

function addUsage(summary: LongitudinalUsageSummary, usage: ChatCompletionUsage): void {
  summary.callsWithUsage += 1;
  summary.promptTokens += usage.promptTokens ?? usage.inputTokens ?? 0;
  summary.completionTokens += usage.completionTokens ?? usage.outputTokens ?? 0;
  summary.totalTokens +=
    usage.totalTokens ??
    (usage.promptTokens ?? usage.inputTokens ?? 0) + (usage.completionTokens ?? usage.outputTokens ?? 0);
}

function ratio(hitCount: number, total: number): number {
  if (total === 0) {
    return 0;
  }

  return Math.round((hitCount / total) * 1000) / 1000;
}

function shouldAllowStayCurrentRecommendation(primaryPainPoint: string): boolean {
  return (
    primaryPainPoint === "output_format" ||
    primaryPainPoint === "numeric_input_type" ||
    primaryPainPoint === "distance_formula" ||
    primaryPainPoint === "needs_teacher_review"
  );
}

function summarizePairs(
  pairs: Array<{ expected: string; actual: string; sampleId: string }>
): LongitudinalMismatchPair[] {
  const grouped = new Map<string, LongitudinalMismatchPair>();
  for (const pair of pairs) {
    const key = `${pair.expected} -> ${pair.actual}`;
    const previous = grouped.get(key);
    if (previous) {
      previous.count += 1;
      previous.sampleIds = unique([...previous.sampleIds, pair.sampleId]).slice(0, 10);
    } else {
      grouped.set(key, {
        expected: pair.expected,
        actual: pair.actual,
        count: 1,
        sampleIds: [pair.sampleId]
      });
    }
  }

  return [...grouped.values()].sort((left, right) => right.count - left.count || left.expected.localeCompare(right.expected));
}

function classifyDiagnosisError(message: string): LongitudinalErrorSummary["category"] {
  if (/json|parse|schema/i.test(message)) {
    return "json";
  }

  if (/fetch|http|timeout|502|503|500|provider|completion|network/i.test(message)) {
    return "provider";
  }

  return "unknown";
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}
