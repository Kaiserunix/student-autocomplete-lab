import type {
  CoachAction,
  CoachResponsePayload,
  CoachSpoilerViolation,
  HintLevel
} from "../contracts";
import { redactSecrets } from "../ai/types";

export const DEFAULT_MAX_L5_PSEUDOCODE_LINES = 12;

export interface CoachSpoilerPolicyOptions {
  action: CoachAction;
  hintLevel: HintLevel;
  giveUpUnlocked?: boolean;
  studentCode?: string;
  referenceSolution?: string;
  knownSecrets?: readonly (string | undefined)[];
  uiLanguage?: "zh-CN" | "en-US";
  maxL5PseudocodeLines?: number;
}

export interface CoachSpoilerPolicyResult {
  /** True when the raw input payload had zero violations before sanitization. */
  safe: boolean;
  /** True when the returned sanitized payload passes a clean post-sanitization check. */
  sanitizedSafe: boolean;
  violations: CoachSpoilerViolation[];
  sanitizedPayload: CoachResponsePayload;
}

const FENCED_BLOCK_PATTERN = /```[^\n]*\r?\n?([\s\S]*?)```/g;

const SECRET_PATTERNS: readonly RegExp[] = [
  /\bsk-ant-[A-Za-z0-9_-]{8,}\b/,
  /\bsk-[A-Za-z0-9_-]{10,}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{12,}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}\b/,
  /Bearer\s+[A-Za-z0-9._~+/=-]{8,}/i,
  /x-api-key\s*[=:]\s*[A-Za-z0-9._~+/=-]{6,}/i
];

const LOCAL_PATH_PATTERNS: readonly RegExp[] = [
  /[A-Za-z]:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/)[^\s"'`<>]+/i,
  /(?:^|[\s"'`(])\/(?:Users|home)\/[A-Za-z0-9._-]+\/[^\s"'`<>]+/
];

const PROMPT_ECHO_PATTERNS: readonly RegExp[] = [
  /<\/?(?:untrusted_problem|untrusted_student_code|untrusted_student_request|local_run_evidence|learner_context|previous_coach_turn|coach_policy|action-output-footer|learner-tail|skill-policy|prefix|suffix|system)>/i,
  /Required JSON shape:/i,
  /\bSYSTEM\s+OVERRIDE\b/i,
  /\bteacher_pack_hidden_reference\b/i,
  /\bteacherPack\.standardApproach\b/i,
  /(?:^|\n)\[(?:head|body|tail|footer)\]\s+/i
];

const ANSWER_HEADER_PATTERNS: readonly RegExp[] = [
  /(?:标准答案|参考答案|参考代码|完整\s*AC\s*代码|完整可运行代码)\s*[：:]/i,
  /\b(?:Reference Solution|Standard Answer|Standard Approach|Accepted Code|AC Code)\s*:/i
];

const PROGRAM_SKELETON_PATTERNS: readonly RegExp[] = [
  /\bint\s+main\s*\(/,
  /\bfn\s+main\s*\(/,
  /\bpublic\s+static\s+void\s+main\s*\(/,
  /\bclass\s+Solution\b/,
  /\bdef\s+solve\s*\(/,
  /if\s+__name__\s*==\s*["']__main__["']/,
  /#include\s*<[^>]+>/,
  /using\s+namespace\s+std\s*;/,
  /\bimport\s+sys\b/,
  /\bfrom\s+collections\s+import\b/,
  /\buse\s+std::io\b/
];

const INPUT_READ_PATTERN =
  /\b(?:input\s*\(|sys\.stdin|cin\s*>>|scanf\s*\(|std::io::stdin|read_line\b|read_to_string\b|BufferedReader|Scanner\b)/;
const OUTPUT_WRITE_PATTERN =
  /\b(?:print\s*\(|cout\s*<<|printf\s*\(|println!\s*\(|System\.out\.print)/;

const EXECUTABLE_CODE_LINE_PATTERN =
  /^(?:import\s+\w|from\s+\w+\s+import\b|def\s+\w+\s*\(|class\s+\w+|for\s+.+(?::|\{)|while\s+.+(?::|\{)|if\s+.+(?::|\{)|elif\s+.+:|else\s*:|return\b|print\s*\(|#include\b|using\s+namespace\b|int\s+main\b|fn\s+\w+\s*\(|let\s+(?:mut\s+)?\w+|match\s+\w+|println!\s*\(|cin\s*>>|cout\s*<<|scanf\s*\(|printf\s*\(|vector\s*<|int\s+[a-zA-Z_]\w*\s*=|long\s+long\s+[a-zA-Z_]\w*|[A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*\s*=\s*[^=])/;

const BOILERPLATE_LINES = new Set([
  "import sys",
  "from collections import deque",
  "using namespace std;",
  "int main() {",
  "int main(void) {",
  "fn main() {",
  "return 0;",
  "{",
  "}",
  "else:",
  "input = sys.stdin.readline",
  "ios::sync_with_stdio(false);",
  "cin.tie(nullptr);"
]);

/**
 * Escapes opening and closing XML-style delimiter tags inside untrusted text
 * so prompt-injection payloads cannot break out of data isolation tags.
 */
export function escapeUntrustedDelimiter(text: string, tagName: string): string {
  const escapedOpen = new RegExp(`<${tagName}>`, "gi");
  const escapedClose = new RegExp(`</${tagName}>`, "gi");
  return text
    .replace(escapedOpen, `&lt;${tagName}&gt;`)
    .replace(escapedClose, `&lt;/${tagName}&gt;`);
}

export function isFullSolutionAllowed(options: Pick<CoachSpoilerPolicyOptions, "action" | "giveUpUnlocked">): boolean {
  return options.action === "giveUp" && options.giveUpUnlocked === true;
}

export function isL5PseudocodeMode(
  options: Pick<CoachSpoilerPolicyOptions, "action" | "hintLevel" | "giveUpUnlocked">
): boolean {
  return !isFullSolutionAllowed(options) && options.hintLevel === 5 && options.action === "hint";
}

/**
 * Deterministic output-side spoiler, prompt-echo, secret, and path hard gate.
 * Automatically sanitizes violated fields and verifies zero leaks remain.
 */
export function enforceCoachSpoilerPolicy(
  payload: CoachResponsePayload,
  options: CoachSpoilerPolicyOptions
): CoachSpoilerPolicyResult {
  const violations: CoachSpoilerViolation[] = [];
  const studentLines = buildNormalizedLineSet(options.studentCode ?? "");

  const headlineCheck = inspectAndSanitizeField(
    "headline",
    payload.headline,
    options,
    studentLines,
    fallbackHeadline(options.hintLevel, options.uiLanguage)
  );
  violations.push(...headlineCheck.violations);

  const guidanceCheck = inspectAndSanitizeField(
    "guidance",
    payload.guidance,
    options,
    studentLines,
    fallbackGuidance(options.hintLevel, options.uiLanguage)
  );
  violations.push(...guidanceCheck.violations);

  const questionCheck = payload.guidingQuestion
    ? inspectAndSanitizeField(
        "guidingQuestion",
        payload.guidingQuestion,
        options,
        studentLines,
        fallbackQuestion(options.hintLevel, options.uiLanguage)
      )
    : undefined;
  if (questionCheck) {
    violations.push(...questionCheck.violations);
  }

  let sanitizedDryRun = payload.dryRunPrompt;
  if (payload.dryRunPrompt) {
    const minInputViolations = inspectUniversalLeaks("dryRunPrompt.minimalInput", payload.dryRunPrompt.minimalInput, options);
    violations.push(...minInputViolations);
    const safeMinimalInput =
      minInputViolations.length > 0
        ? redactSensitiveAndPaths(payload.dryRunPrompt.minimalInput, options.knownSecrets)
        : payload.dryRunPrompt.minimalInput;

    const dryRunQuestionCheck = inspectAndSanitizeField(
      "dryRunPrompt.question",
      payload.dryRunPrompt.question,
      options,
      studentLines,
      fallbackDryRunQuestion(options.uiLanguage)
    );
    violations.push(...dryRunQuestionCheck.violations);

    sanitizedDryRun = {
      minimalInput: safeMinimalInput,
      question: dryRunQuestionCheck.sanitizedText
    };
  }

  const sanitizedCandidate: CoachResponsePayload = {
    ...payload,
    headline: headlineCheck.sanitizedText,
    guidance: guidanceCheck.sanitizedText,
    guidingQuestion: questionCheck ? questionCheck.sanitizedText : payload.guidingQuestion,
    dryRunPrompt: sanitizedDryRun,
    violations,
    spoilerSafe: true
  };

  // Re-verify post-sanitization invariants to guarantee zero residual leakage
  const postViolations = verifySanitizedPayload(sanitizedCandidate, options, studentLines);
  const sanitizedSafe = postViolations.length === 0;
  sanitizedCandidate.spoilerSafe = sanitizedSafe;

  return {
    safe: violations.length === 0,
    sanitizedSafe,
    violations,
    sanitizedPayload: sanitizedCandidate
  };
}

function verifySanitizedPayload(
  payload: CoachResponsePayload,
  options: CoachSpoilerPolicyOptions,
  studentLines: Set<string>
): CoachSpoilerViolation[] {
  const remaining: CoachSpoilerViolation[] = [];
  remaining.push(...inspectFieldViolations("headline", payload.headline, options, studentLines));
  remaining.push(...inspectFieldViolations("guidance", payload.guidance, options, studentLines));
  if (payload.guidingQuestion) {
    remaining.push(...inspectFieldViolations("guidingQuestion", payload.guidingQuestion, options, studentLines));
  }
  if (payload.dryRunPrompt) {
    remaining.push(...inspectUniversalLeaks("dryRunPrompt.minimalInput", payload.dryRunPrompt.minimalInput, options));
    remaining.push(...inspectFieldViolations("dryRunPrompt.question", payload.dryRunPrompt.question, options, studentLines));
  }
  return remaining;
}

function inspectAndSanitizeField(
  field: string,
  text: string,
  options: CoachSpoilerPolicyOptions,
  studentLines: Set<string>,
  fallbackText: string
): { violations: CoachSpoilerViolation[]; sanitizedText: string } {
  const violations = inspectFieldViolations(field, text, options, studentLines);
  if (violations.length === 0) {
    return { violations, sanitizedText: text };
  }

  // If giveUpUnlocked is true and the ONLY violations are secret/path or prompt-echo,
  // redact those tokens while preserving the unlocked full explanation.
  const onlyRedactionNeeded =
    isFullSolutionAllowed(options) &&
    violations.every(
      (v) => v.category === "secret_or_path_leak" || v.category === "prompt_injection_echo"
    );

  if (onlyRedactionNeeded) {
    const redacted = stripPromptEchoes(redactSensitiveAndPaths(text, options.knownSecrets));
    const recheck = inspectFieldViolations(field, redacted, options, studentLines);
    if (recheck.length === 0 && redacted.trim().length > 0) {
      return { violations, sanitizedText: redacted };
    }
  }

  return {
    violations,
    sanitizedText: fallbackText
  };
}

function inspectFieldViolations(
  field: string,
  text: string,
  options: CoachSpoilerPolicyOptions,
  studentLines: Set<string>
): CoachSpoilerViolation[] {
  const violations = inspectUniversalLeaks(field, text, options);

  if (isFullSolutionAllowed(options)) {
    return violations;
  }

  const l5Mode = isL5PseudocodeMode(options);
  const maxL5Lines = options.maxL5PseudocodeLines ?? DEFAULT_MAX_L5_PSEUDOCODE_LINES;

  // 1. Fenced code block rule:
  //    - L0-L4: strictly forbid ALL fenced code blocks.
  //    - L5: allow concise pseudocode fences ONLY up to maxL5Lines without runnable skeletons.
  const fencedBlocks = Array.from(text.matchAll(FENCED_BLOCK_PATTERN));
  if (fencedBlocks.length > 0) {
    if (!l5Mode) {
      violations.push({
        field,
        category: "fenced_code_block",
        detail: `Fenced code blocks are strictly forbidden at L${options.hintLevel} (${options.action}).`
      });
    } else {
      let totalFencedLines = 0;
      for (const match of fencedBlocks) {
        const body = match[1] ?? "";
        const nonEmpty = body
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => l.length > 0);
        totalFencedLines += nonEmpty.length;
      }
      if (totalFencedLines > maxL5Lines) {
        violations.push({
          field,
          category: "excessive_code_lines",
          detail: `L5 pseudocode block has ${totalFencedLines} non-empty lines, exceeding limit of ${maxL5Lines}.`
        });
      }
    }
  }

  // 2. Full program skeleton & explicit answer headers (forbidden across L0-L5)
  const skeletonReason = detectFullProgramSkeleton(text, studentLines, l5Mode);
  if (skeletonReason) {
    violations.push({
      field,
      category: "full_program_skeleton",
      detail: skeletonReason
    });
  }

  // 3. Excessive unfenced / total novel executable code lines
  const novelExecLines = countNovelExecutableCodeLines(text, studentLines);
  if (!l5Mode && novelExecLines >= 3) {
    violations.push({
      field,
      category: "excessive_code_lines",
      detail: `Output contains ${novelExecLines} novel executable code lines at L${options.hintLevel}.`
    });
  } else if (l5Mode && novelExecLines > maxL5Lines) {
    violations.push({
      field,
      category: "excessive_code_lines",
      detail: `L5 output contains ${novelExecLines} executable code lines, exceeding limit of ${maxL5Lines}.`
    });
  }

  // 4. Reference solution overlap (forbidden across L0-L5)
  if (options.referenceSolution) {
    const overlapReason = detectReferenceSolutionOverlap(text, options.referenceSolution, studentLines);
    if (overlapReason) {
      violations.push({
        field,
        category: "reference_solution_overlap",
        detail: overlapReason
      });
    }
  }

  return violations;
}

function inspectUniversalLeaks(
  field: string,
  text: string,
  options: CoachSpoilerPolicyOptions
): CoachSpoilerViolation[] {
  const violations: CoachSpoilerViolation[] = [];

  const hasKnownSecret = (options.knownSecrets ?? []).some((secret) => {
    const trimmed = (secret ?? "").trim();
    return trimmed.length >= 4 && text.includes(trimmed);
  });

  if (
    hasKnownSecret ||
    SECRET_PATTERNS.some((p) => p.test(text)) ||
    LOCAL_PATH_PATTERNS.some((p) => p.test(text))
  ) {
    violations.push({
      field,
      category: "secret_or_path_leak",
      detail: "Output contains a secret token or local filesystem path."
    });
  }

  if (PROMPT_ECHO_PATTERNS.some((p) => p.test(text))) {
    violations.push({
      field,
      category: "prompt_injection_echo",
      detail: "Output echoed internal prompt boundary tags or override directives."
    });
  }

  return violations;
}

function detectFullProgramSkeleton(
  text: string,
  studentLines: Set<string>,
  isL5: boolean
): string | undefined {
  if (ANSWER_HEADER_PATTERNS.some((p) => p.test(text))) {
    return "Output contains explicit standard-answer / reference-code headers.";
  }

  for (const pattern of PROGRAM_SKELETON_PATTERNS) {
    if (pattern.test(text)) {
      return `Output contains a runnable program entry skeleton (${pattern.source}).`;
    }
  }

  const novelCodeCount = countNovelExecutableCodeLines(text, studentLines);
  if (INPUT_READ_PATTERN.test(text) && OUTPUT_WRITE_PATTERN.test(text) && novelCodeCount >= 1) {
    return "Output combines stdin input reading with stdout output writing.";
  }

  if (!isL5 && novelCodeCount >= 4) {
    return `Output contains ${novelCodeCount} novel executable code statements.`;
  }

  return undefined;
}

function countNovelExecutableCodeLines(text: string, studentLines: Set<string>): number {
  let count = 0;
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("```") || trimmed.startsWith("# ") || trimmed.startsWith("// ")) {
      continue;
    }
    if (studentLines.has(normalizeCodeLine(trimmed))) {
      continue;
    }
    if (EXECUTABLE_CODE_LINE_PATTERN.test(trimmed)) {
      count += 1;
    }
  }
  return count;
}

function detectReferenceSolutionOverlap(
  text: string,
  referenceSolution: string,
  studentLines: Set<string>
): string | undefined {
  const refLines = referenceSolution
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("#") && !line.startsWith("//"))
    .filter((line) => !BOILERPLATE_LINES.has(normalizeCodeLine(line)))
    .filter((line) => !studentLines.has(normalizeCodeLine(line)));

  if (refLines.length === 0) {
    return undefined;
  }

  const compactText = normalizeCompact(text);
  const textLineSet = new Set(
    text
      .split(/\r?\n/)
      .map((line) => normalizeCompact(line))
      .filter((line) => line.length >= 10)
  );

  let matchedLines = 0;
  for (const refLine of refLines) {
    const compactRef = normalizeCompact(refLine);
    if (compactRef.length < 10) {
      continue;
    }
    if (textLineSet.has(compactRef) || compactText.includes(compactRef)) {
      matchedLines += 1;
    }
  }

  if (matchedLines >= 2) {
    return `Output matches ${matchedLines} novel lines from the reference solution.`;
  }

  if (refLines.length >= 2 && matchedLines / refLines.length >= 0.5) {
    return "Output reproduces at least half of the novel reference solution lines.";
  }

  const compactRefBody = normalizeCompact(refLines.join("\n"));
  if (compactRefBody.length >= 50) {
    const windowSize = 50;
    for (let idx = 0; idx <= compactRefBody.length - windowSize; idx += 15) {
      const slice = compactRefBody.slice(idx, idx + windowSize);
      if (compactText.includes(slice)) {
        return "Output embeds a contiguous slice of the reference solution.";
      }
    }
  }

  return undefined;
}

function redactSensitiveAndPaths(text: string, knownSecrets?: readonly (string | undefined)[]): string {
  let out = redactSecrets(text, knownSecrets ?? []);
  for (const pattern of LOCAL_PATH_PATTERNS) {
    out = out.replace(new RegExp(pattern.source, `${pattern.flags}g`), "[local-path-redacted]");
  }
  return out;
}

function stripPromptEchoes(text: string): string {
  let out = text;
  for (const pattern of PROMPT_ECHO_PATTERNS) {
    out = out.replace(new RegExp(pattern.source, `${pattern.flags}g`), "");
  }
  return out.trim();
}

function buildNormalizedLineSet(code: string): Set<string> {
  return new Set(
    code
      .split(/\r?\n/)
      .map((line) => normalizeCodeLine(line))
      .filter((line) => line.length > 0)
  );
}

function normalizeCodeLine(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

function normalizeCompact(text: string): string {
  return text.replace(/\s+/g, "");
}

function fallbackHeadline(level: HintLevel, language?: "zh-CN" | "en-US"): string {
  if (language === "en-US") {
    return `L${level} Socratic Hint (Spoiler Guard Active)`;
  }
  return `L${level} 苏格拉底引导（已启用防剧透保护）`;
}

function fallbackGuidance(level: HintLevel, language?: "zh-CN" | "en-US"): string {
  if (language === "en-US") {
    if (level === 5) {
      return "Anti-spoiler guard intercepted runnable code or oversized pseudocode. Break your algorithm into 4-6 plain-language steps: (1) initialize state, (2) maintain the loop invariant, (3) handle boundary termination, and (4) output the result.";
    }
    return `Anti-spoiler guard intercepted restricted code or sensitive content at L${level}. Focus on one concrete invariant, boundary condition, or transition step before writing code.`;
  }
  if (level === 5) {
    return "防剧透门禁已拦截完整可运行代码或超长伪代码。请按 4–6 步自然语言骨架自行实现：1) 初始化关键状态与边界；2) 维护核心循环不变量；3) 核对终止与极值条件；4) 输出结果。";
  }
  return `当前处于 L${level} 苏格拉底引导，防剧透门禁已拦截疑似代码块、参考解或敏感信息。请先聚焦当前最关键的一处边界条件或状态不变量。`;
}

function fallbackQuestion(level: HintLevel, language?: "zh-CN" | "en-US"): string {
  if (language === "en-US") {
    return `At L${level}, what single invariant must remain true after each iteration on a minimal 3-element test case?`;
  }
  return `在 L${level} 阶段，用一组 3 元素最小样例推演时，哪一条核心不变量在每一步结束后必须保持成立？`;
}

function fallbackDryRunQuestion(language?: "zh-CN" | "en-US"): string {
  if (language === "en-US") {
    return "Trace your variables on the smallest failing input step by step: where does actual state first diverge from expected?";
  }
  return "请用最小失败样例逐步手推关键变量变化：实际状态是在哪一步首次偏离预期的？";
}
