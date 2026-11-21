import type { LocalRunResult, SampleCaseResult, StuckCategory } from "../contracts";

export interface DryRunPromptResult {
  hasFailureEvidence: boolean;
  caseId?: string;
  verdict?: SampleCaseResult["verdict"];
  stuckCategory: StuckCategory;
  minimalInput: string;
  expectedOutput?: string;
  actualOutput?: string;
  stderrExcerpt?: string;
  divergenceSummaryZh: string;
  divergenceSummaryEn: string;
  traceTableColumns: string[];
  questionZh: string;
  questionEn: string;
  suggestedMisconceptionIds: string[];
}

export interface BuildDryRunInput {
  runResult?: LocalRunResult;
  studentCode: string;
  problemTitle?: string;
}

const MAX_INPUT_PREVIEW_CHARS = 240;
const MAX_OUTPUT_PREVIEW_CHARS = 160;
const MAX_STDERR_PREVIEW_CHARS = 260;

/**
 * Builds a deterministic, evidence-backed minimal counterexample dry-run guide
 * from a real `LocalRunResult` (first WA / RE / TLE / CE failure).
 */
export function buildDryRunPrompt(input: BuildDryRunInput): DryRunPromptResult {
  const trackedVars = extractCandidateTraceVariables(input.studentCode);
  const baseColumns = ["Step", ...trackedVars.slice(0, 4), "Condition / Output"];
  const run = input.runResult;

  if (!run) {
    return {
      hasFailureEvidence: false,
      stuckCategory: "partial_wa",
      minimalInput: "(construct a minimal input with n = 2..3)",
      divergenceSummaryZh: "当前尚未收到本地样例运行结果，建议先用最小边界样例手推变量变化。",
      divergenceSummaryEn: "No local run result yet; dry-run a minimal boundary case (n = 2..3) to verify your invariant.",
      traceTableColumns: baseColumns,
      questionZh: `请先手写一组最小输入（n=2 或含重复/空边界），按列 [${baseColumns.join(" | ")}] 逐行推演，看看哪一步与预期不同？`,
      questionEn: `Pick a minimal input (n=2 or an empty/duplicate edge case) and trace [${baseColumns.join(" | ")}] step by step: where does your expectation diverge?`,
      suggestedMisconceptionIds: []
    };
  }

  // Case 1: Compilation error
  if (!run.compileOk) {
    const stderrExcerpt = truncateText((run.compileStderr ?? "").trim(), MAX_STDERR_PREVIEW_CHARS);
    const firstErrLine = stderrExcerpt.split(/\r?\n/).find((l) => l.trim().length > 0) ?? "Compilation failed";
    return {
      hasFailureEvidence: true,
      verdict: "CE",
      stuckCategory: "implementation",
      minimalInput: "(compile stage — before runtime)",
      stderrExcerpt,
      divergenceSummaryZh: `编译阶段报错：${firstErrLine}`,
      divergenceSummaryEn: `Compilation failed: ${firstErrLine}`,
      traceTableColumns: ["Line", "Symbol / Type", "Expected"],
      questionZh: `编译器在首条报错指出「${firstErrLine}」：请核对对应行的变量声明、类型匹配或括号闭合，这一行实际语义与你预期一致吗？`,
      questionEn: `The first compiler diagnostic reports "${firstErrLine}": check the declaration, type match, or delimiter on that exact line—what did the compiler expect instead?`,
      suggestedMisconceptionIds: []
    };
  }

  // Pick the best failing case: prefer WA/RE/TLE/OLE, smallest input first among failing original samples
  const failingCases = run.cases.filter(
    (c) => c.verdict === "WA" || c.verdict === "RE" || c.verdict === "TLE" || c.verdict === "OLE"
  );
  if (failingCases.length === 0) {
    return {
      hasFailureEvidence: false,
      stuckCategory: "partial_wa",
      minimalInput: "(all local samples passed — craft an adversarial edge case)",
      divergenceSummaryZh: "当前所有本地样例均已通过，请构造极端边界反例（空/单元素/全同/极值）做干跑压力检验。",
      divergenceSummaryEn: "All local samples passed; dry-run an adversarial edge case (empty, single element, all duplicates, or max value).",
      traceTableColumns: baseColumns,
      questionZh: "既然已知样例全过，如果输入是「单元素」「全部重复」或「接近 10^9 的极值」，你的循环终止条件和变量位宽还会成立吗？",
      questionEn: "All provided samples pass. Now trace a single-element, all-duplicate, or max-value edge case: do your loop guard and integer width still hold?",
      suggestedMisconceptionIds: []
    };
  }

  failingCases.sort((a, b) => {
    if (a.isOriginal !== b.isOriginal) {
      return a.isOriginal ? -1 : 1;
    }
    return a.input.length - b.input.length;
  });

  const target = failingCases[0]!;
  const minimalInput = truncateText(target.input.trim(), MAX_INPUT_PREVIEW_CHARS);
  const expectedOutput = target.expected !== undefined ? truncateText(target.expected.trim(), MAX_OUTPUT_PREVIEW_CHARS) : undefined;
  const actualOutput = truncateText(target.actual.trim(), MAX_OUTPUT_PREVIEW_CHARS);
  const stderrExcerpt = target.stderr.trim() ? truncateText(target.stderr.trim(), MAX_STDERR_PREVIEW_CHARS) : undefined;

  if (target.verdict === "RE") {
    return buildRuntimeErrorDryRun(target, minimalInput, stderrExcerpt, baseColumns, input.studentCode);
  }

  if (target.verdict === "TLE" || target.verdict === "OLE") {
    return buildTimeoutDryRun(target, minimalInput, baseColumns, input.studentCode);
  }

  // WA dry-run analysis
  return buildWrongAnswerDryRun(
    target,
    minimalInput,
    expectedOutput ?? "",
    actualOutput,
    baseColumns,
    input.studentCode
  );
}

function buildWrongAnswerDryRun(
  target: SampleCaseResult,
  minimalInput: string,
  expected: string,
  actual: string,
  columns: string[],
  studentCode: string
): DryRunPromptResult {
  const expTokens = expected.split(/\s+/).filter(Boolean);
  const actTokens = actual.split(/\s+/).filter(Boolean);
  const misconceptions: string[] = [];

  let diffIndex = -1;
  const minLen = Math.min(expTokens.length, actTokens.length);
  for (let i = 0; i < minLen; i += 1) {
    if (expTokens[i] !== actTokens[i]) {
      diffIndex = i;
      break;
    }
  }

  let clueZh = "";
  let clueEn = "";

  if (actTokens.length === expTokens.length + 1 && (actTokens[0] === "0" || actTokens[actTokens.length - 1] === "0")) {
    misconceptions.push("input.sentinel_included");
    clueZh = `实际输出比预期多了一个 0（实际 "${actual}" vs 预期 "${expected}"），疑似把哨兵终止符混入了输出。`;
    clueEn = `Actual output includes an extra "0" ("${actual}" vs expected "${expected}"), suggesting a sentinel value leaked into results.`;
  } else if (diffIndex !== -1) {
    const expTok = expTokens[diffIndex]!;
    const actTok = actTokens[diffIndex]!;
    const expNum = Number(expTok);
    const actNum = Number(actTok);

    if (Number.isInteger(expNum) && Number.isInteger(actNum) && Math.abs(expNum - actNum) === 1) {
      misconceptions.push("loop.off_by_one");
      if (/while\s*\(?\s*\w+\s*<=?\s*\w+/i.test(studentCode) && /mid/i.test(studentCode)) {
        misconceptions.push("binary_search.boundary_invariant");
      }
      clueZh = `第 ${diffIndex + 1} 个输出值恰好差 1（预期 ${expTok}，实际 ${actTok}），高度疑似边界差一（Off-by-One）或递归/二分出口偏了 1。`;
      clueEn = `Output token #${diffIndex + 1} is off by exactly 1 (expected ${expTok}, actual ${actTok}), strongly pointing to an off-by-one boundary or base case.`;
    } else if (Number.isInteger(expNum) && Number.isInteger(actNum) && actNum < 0 && expNum > 0) {
      misconceptions.push("numeric.int32_overflow");
      clueZh = `预期为正数 ${expTok} 但实际输出负数 ${actTok}，疑似 32 位有符号整数溢出。`;
      clueEn = `Expected positive ${expTok} but got negative ${actTok}, strongly suggesting 32-bit signed integer overflow.`;
    } else {
      clueZh = `第 ${diffIndex + 1} 个输出首次分歧：预期 "${expTok}"，实际 "${actTok}"。`;
      clueEn = `First output divergence at token #${diffIndex + 1}: expected "${expTok}", actual "${actTok}".`;
    }
  } else if (actTokens.length !== expTokens.length) {
    clueZh = `输出项数不一致：预期 ${expTokens.length} 项（"${expected}"），实际 ${actTokens.length} 项（"${actual}"）。`;
    clueEn = `Output length mismatch: expected ${expTokens.length} tokens ("${expected}"), got ${actTokens.length} ("${actual}").`;
  } else {
    clueZh = `样例 #${target.id} 格式或内容与预期不一致（预期 "${expected}"，实际 "${actual}"）。`;
    clueEn = `Sample #${target.id} output differs from expected ("${expected}" vs "${actual}").`;
  }

  return {
    hasFailureEvidence: true,
    caseId: target.id,
    verdict: "WA",
    stuckCategory: "partial_wa",
    minimalInput,
    expectedOutput: expected,
    actualOutput: actual,
    divergenceSummaryZh: clueZh,
    divergenceSummaryEn: clueEn,
    traceTableColumns: columns,
    questionZh: `在失败样例输入「${singleLinePreview(minimalInput)}」下：${clueZh} 请按 [${columns.join(" | ")}] 手推你的代码，指出在哪一步变量值首次偏离了你的设计不变量？`,
    questionEn: `On failing input "${singleLinePreview(minimalInput)}": ${clueEn} Trace [${columns.join(" | ")}] by hand—at which exact step does a variable first violate your intended invariant?`,
    suggestedMisconceptionIds: misconceptions
  };
}

function buildRuntimeErrorDryRun(
  target: SampleCaseResult,
  minimalInput: string,
  stderrExcerpt: string | undefined,
  columns: string[],
  studentCode: string
): DryRunPromptResult {
  const err = stderrExcerpt ?? "Runtime Error";
  const misconceptions: string[] = [];

  let clueZh = `运行期崩溃（RE）：${err.split(/\r?\n/)[0]}`;
  let clueEn = `Runtime error (RE): ${err.split(/\r?\n/)[0]}`;

  if (/IndexError|out_of_range|ArrayIndexOutOfBounds|index out of bounds|SIGSEGV|Segmentation fault/i.test(err)) {
    misconceptions.push("loop.off_by_one");
    if (/\.size\(\)\s*-\s*1/i.test(studentCode)) {
      misconceptions.push("loop.unsigned_underflow");
    }
    clueZh = `在输入「${singleLinePreview(minimalInput)}」触发越界/段错误（${err.split(/\r?\n/)[0]}）。`;
    clueEn = `Input "${singleLinePreview(minimalInput)}" triggered an out-of-bounds / segfault crash (${err.split(/\r?\n/)[0]}).`;
  } else if (/unwrap\(\)|empty|pop from empty/i.test(err)) {
    misconceptions.push("ds.empty_container_access");
    clueZh = `在输入「${singleLinePreview(minimalInput)}」尝试从空容器读取或 unwrap() 导致崩溃。`;
    clueEn = `Input "${singleLinePreview(minimalInput)}" panicked on empty container pop/unwrap().`;
  } else if (/RecursionError|StackOverflow|maximum recursion/i.test(err)) {
    misconceptions.push("recursion.base_case_wrong");
    clueZh = `递归深度超限，说明递归出口条件未能覆盖所有终止路径或存在环。`;
    clueEn = `Stack overflow / max recursion reached: check whether every recursive branch reaches a valid base case.`;
  }

  return {
    hasFailureEvidence: true,
    caseId: target.id,
    verdict: "RE",
    stuckCategory: "implementation",
    minimalInput,
    actualOutput: target.actual.trim(),
    stderrExcerpt,
    divergenceSummaryZh: clueZh,
    divergenceSummaryEn: clueEn,
    traceTableColumns: columns,
    questionZh: `${clueZh} 请干跑该输入下崩溃前的最后两次迭代，检查下标、容器非空前提或递归终止条件分别是多少？`,
    questionEn: `${clueEn} Dry-run the last two iterations before the crash on this input: what were the index bounds, container size, or base-case values?`,
    suggestedMisconceptionIds: misconceptions
  };
}

function buildTimeoutDryRun(
  target: SampleCaseResult,
  minimalInput: string,
  columns: string[],
  studentCode: string
): DryRunPromptResult {
  const misconceptions: string[] = [];
  const hasBinarySearchLoop = /while\s*\(?.*\bl\b.*\br\b/i.test(studentCode) && /\bmid\b/i.test(studentCode);
  if (hasBinarySearchLoop) {
    misconceptions.push("binary_search.infinite_loop");
  } else {
    misconceptions.push("complexity.nested_tle");
  }

  const clueZh = hasBinarySearchLoop
    ? `样例 #${target.id} 运行 ${target.durationMs}ms 超时（${target.verdict}），疑似二分区间在 l + 1 == r 时未严格缩小导致死循环。`
    : `样例 #${target.id} 运行 ${target.durationMs}ms 超时（${target.verdict}），疑似存在死循环或复杂度超出时间预算。`;

  const clueEn = hasBinarySearchLoop
    ? `Sample #${target.id} timed out after ${target.durationMs}ms (${target.verdict}); suspect an infinite binary-search loop when l + 1 == r.`
    : `Sample #${target.id} timed out after ${target.durationMs}ms (${target.verdict}); suspect a non-terminating loop or superlinear complexity.`;

  return {
    hasFailureEvidence: true,
    caseId: target.id,
    verdict: target.verdict,
    stuckCategory: "tle",
    minimalInput,
    divergenceSummaryZh: clueZh,
    divergenceSummaryEn: clueEn,
    traceTableColumns: columns,
    questionZh: `${clueZh} 请用该输入检查循环度量值（如区间长度 r - l 或剩余未访问节点数）是否每次迭代都严格单调递减？`,
    questionEn: `${clueEn} On this input, verify whether your loop progress metric (e.g., interval width r - l or unvisited count) strictly decreases every iteration.`,
    suggestedMisconceptionIds: misconceptions
  };
}

export function extractCandidateTraceVariables(code: string): string[] {
  const priorityVars = ["l", "r", "mid", "left", "right", "i", "j", "ans", "res", "sum", "cnt", "carry", "dp", "dist", "vis", "root"];
  const found: string[] = [];

  for (const name of priorityVars) {
    const re = new RegExp(`\\b${name}\\b`);
    if (re.test(code)) {
      found.push(name);
    }
    if (found.length >= 4) {
      break;
    }
  }

  return found.length > 0 ? found : ["state", "index", "ans"];
}

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) {
    return text;
  }
  return `${text.slice(0, maxLen)}... [truncated]`;
}

function singleLinePreview(text: string): string {
  return text.replace(/\r?\n/g, " \\n ").slice(0, 90);
}
