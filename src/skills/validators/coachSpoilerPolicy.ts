import type { CoachSkillAction } from "../types";
import type { CoachFollowUpReport } from "../../teaching/coachFollowUp";
import type { TeachingDiagnosisReport } from "../../teaching/teachingReport";
import type { TeacherPackReference } from "../../teaching/types";

export type CoachSafetyMode = CoachSkillAction;

export type CoachLeakCategory =
  | "fenced_code_block"
  | "full_program_skeleton"
  | "reference_solution_overlap"
  | "teacher_pack_leak"
  | "prompt_injection_echo"
  | "secret_or_path_leak";

export type CoachTextField =
  | "studentErrorModel"
  | "hint"
  | "specificHint"
  | "checkpoint"
  | "microSteps"
  | "skillUpdate.reason"
  | "skillUpdate.rules"
  | "recommendation.reason"
  | "answer"
  | "tinyExample"
  | "nextAction"
  | "boundary";

export interface CoachSpoilerViolation {
  field: CoachTextField;
  category: CoachLeakCategory;
  detail: string;
}

export interface CoachSpoilerPolicyOptions {
  mode: CoachSafetyMode;
  studentCode?: string;
  referenceSolution?: string;
  teacherPack?: TeacherPackReference;
  responseLanguage?: "zh-CN" | "en-US" | "raw";
}

export interface CoachSpoilerValidationResult<T> {
  safe: boolean;
  mode: CoachSafetyMode;
  violations: CoachSpoilerViolation[];
  sanitizedReport: T;
}

const HINT_MODE_ACTIONS = new Set<CoachSafetyMode>(["hint", "specific", "followUp", "recommend"]);

const FENCED_BLOCK_PATTERN = /```[^\n]*\n([\s\S]*?)```/g;

const SECRET_PATTERNS: RegExp[] = [
  /\bsk-[A-Za-z0-9_-]{12,}\b/,
  /\bgh[pousr]_[A-Za-z0-9_]{12,}\b/,
  /\bAIza[0-9A-Za-z_-]{20,}\b/
];

const LOCAL_PATH_PATTERNS: RegExp[] = [
  /[A-Za-z]:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/)[^\s"'`<>]+/i,
  /(?:^|[\s"'`(])\/(?:Users|home)\/[A-Za-z0-9._-]+\/[^\s"'`<>]+/
];

const PROMPT_ECHO_PATTERNS: RegExp[] = [
  /<\/?(?:untrusted_student_code|untrusted_student_request|previous_coach_turn|action-output-footer|learner-tail|skill-policy|prefix|suffix|system)>/i,
  /Required JSON shape:/i,
  /(?:^|\n)\[(?:head|body|tail|footer)\]\s+/i
];

const INTERNAL_SPOILER_MARKER_PATTERNS: RegExp[] = [
  /\bteacher_pack_hidden_reference\b/i,
  /\bteacherPack\.standardApproach\b/i,
  /(?:标准答案|参考答案|参考代码|完整\s*AC\s*代码)\s*[：:]/i,
  /\b(?:Reference Solution|Standard Answer|Standard Approach|Accepted Code|AC Code)\s*:/i
];

const PROGRAM_ENTRY_PATTERNS: RegExp[] = [
  /\bimport\s+sys\b/,
  /\bfrom\s+collections\s+import\b/,
  /if\s+__name__\s*==\s*["']__main__["']/,
  /#include\s*<[^>]+>/,
  /using\s+namespace\s+std\s*;/,
  /\bint\s+main\s*\(/,
  /\bfn\s+main\s*\(/,
  /\buse\s+std::io\b/
];

const INPUT_READ_PATTERN =
  /\b(?:input\s*\(|sys\.stdin|cin\s*>>|scanf\s*\(|std::io::stdin|read_line\b|read_to_string\b)/;
const OUTPUT_WRITE_PATTERN =
  /\b(?:print\s*\(|cout\s*<<|printf\s*\(|println!\s*\()/;

const STATEMENT_LINE_PATTERN =
  /^(?:import\s+\w|from\s+\w+\s+import\b|def\s+\w+\s*\(|class\s+\w+|for\s+.+(?::|\{)|while\s+.+(?::|\{)|if\s+.+(?::|\{)|elif\s+.+:|else\s*:|return\b|print\s*\(|#include\b|using\s+namespace\b|int\s+main\b|fn\s+\w+\s*\(|let\s+(?:mut\s+)?\w+|match\s+\w+|println!\s*\(|cin\s*>>|cout\s*<<|scanf\s*\(|printf\s*\(|[A-Za-z_]\w*(?:\s*,\s*[A-Za-z_]\w*)*\s*=\s*[^=])/;

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
 * Returns true when the coaching action must withhold full AC code and hidden Teacher Pack answers.
 */
export function isHintModeActive(mode: CoachSafetyMode): boolean {
  return HINT_MODE_ACTIONS.has(mode);
}

/**
 * Escapes closing and opening XML-style boundary tags inside untrusted student inputs.
 */
export function escapeUntrustedDelimiter(text: string, tagName: string): string {
  const escapedOpen = new RegExp(`<${tagName}>`, "gi");
  const escapedClose = new RegExp(`</${tagName}>`, "gi");
  return text
    .replace(escapedOpen, `&lt;${tagName}&gt;`)
    .replace(escapedClose, `&lt;/${tagName}&gt;`);
}

/**
 * Validates and sanitizes a TeachingDiagnosisReport against spoiler, prompt-echo, and secret leaks.
 */
export function validateCoachDiagnosisSafety(
  report: TeachingDiagnosisReport,
  options: CoachSpoilerPolicyOptions
): CoachSpoilerValidationResult<TeachingDiagnosisReport> {
  const violations: CoachSpoilerViolation[] = [];
  const hintFallback = fallbackHintText(options.responseLanguage);
  const specificFallback = fallbackSpecificHintText(options.responseLanguage);

  const hintCheck = inspectAndSanitizeField("hint", report.hint, options, hintFallback);
  violations.push(...hintCheck.violations);

  const specificCheck = report.specificHint
    ? inspectAndSanitizeField("specificHint", report.specificHint, options, specificFallback)
    : undefined;
  if (specificCheck) {
    violations.push(...specificCheck.violations);
  }

  const checkpointCheck = report.checkpoint
    ? inspectAndSanitizeField("checkpoint", report.checkpoint, options, undefined)
    : undefined;
  if (checkpointCheck) {
    violations.push(...checkpointCheck.violations);
  }

  const errorModelCheck = report.studentErrorModel
    ? inspectAndSanitizeField("studentErrorModel", report.studentErrorModel, options, undefined)
    : undefined;
  if (errorModelCheck) {
    violations.push(...errorModelCheck.violations);
  }

  let sanitizedMicroSteps: string[] | undefined;
  if (report.microSteps) {
    const kept: string[] = [];
    for (const step of report.microSteps) {
      const check = inspectAndSanitizeField("microSteps", step, options, undefined);
      violations.push(...check.violations);
      if (check.sanitizedText) {
        kept.push(check.sanitizedText);
      }
    }
    sanitizedMicroSteps = kept.length > 0 ? kept : undefined;
  }

  let sanitizedSkillUpdate = report.skillUpdate;
  if (report.skillUpdate) {
    const reasonCheck = inspectAndSanitizeField(
      "skillUpdate.reason",
      report.skillUpdate.reason,
      options,
      safeSkillReasonFallback(options.responseLanguage)
    );
    violations.push(...reasonCheck.violations);

    const safeRules: string[] = [];
    for (const rule of report.skillUpdate.rules) {
      const ruleCheck = inspectAndSanitizeField("skillUpdate.rules", rule, options, undefined);
      violations.push(...ruleCheck.violations);
      if (ruleCheck.sanitizedText) {
        safeRules.push(ruleCheck.sanitizedText);
      }
    }

    sanitizedSkillUpdate = {
      ...report.skillUpdate,
      reason: reasonCheck.sanitizedText ?? report.skillUpdate.reason,
      rules: safeRules.length > 0 ? safeRules : [safeSkillRuleFallback(options.responseLanguage)]
    };
  }

  let sanitizedRecommendation = report.recommendation;
  if (report.recommendation) {
    const recCheck = inspectAndSanitizeField(
      "recommendation.reason",
      report.recommendation.reason,
      options,
      safeRecommendationFallback(options.responseLanguage)
    );
    violations.push(...recCheck.violations);
    sanitizedRecommendation = {
      ...report.recommendation,
      reason: recCheck.sanitizedText ?? report.recommendation.reason
    };
  }

  const sanitizedReport: TeachingDiagnosisReport = {
    ...report,
    studentErrorModel: errorModelCheck ? errorModelCheck.sanitizedText : report.studentErrorModel,
    hint: hintCheck.sanitizedText ?? hintFallback,
    specificHint: specificCheck ? specificCheck.sanitizedText : report.specificHint,
    checkpoint: checkpointCheck ? checkpointCheck.sanitizedText : report.checkpoint,
    microSteps: sanitizedMicroSteps,
    skillUpdate: sanitizedSkillUpdate,
    recommendation: sanitizedRecommendation
  };

  return {
    safe: violations.length === 0,
    mode: options.mode,
    violations,
    sanitizedReport
  };
}

/**
 * Validates and sanitizes a CoachFollowUpReport against spoiler, prompt-echo, and secret leaks.
 */
export function validateCoachFollowUpSafety(
  report: CoachFollowUpReport,
  options: CoachSpoilerPolicyOptions
): CoachSpoilerValidationResult<CoachFollowUpReport> {
  const violations: CoachSpoilerViolation[] = [];
  const answerFallback = fallbackHintText(options.responseLanguage);

  const answerCheck = inspectAndSanitizeField("answer", report.answer, options, answerFallback);
  violations.push(...answerCheck.violations);

  const tinyExampleCheck = report.tinyExample
    ? inspectAndSanitizeField("tinyExample", report.tinyExample, options, undefined)
    : undefined;
  if (tinyExampleCheck) {
    violations.push(...tinyExampleCheck.violations);
  }

  const nextActionCheck = report.nextAction
    ? inspectAndSanitizeField("nextAction", report.nextAction, options, undefined)
    : undefined;
  if (nextActionCheck) {
    violations.push(...nextActionCheck.violations);
  }

  const boundaryCheck = report.boundary
    ? inspectAndSanitizeField("boundary", report.boundary, options, undefined)
    : undefined;
  if (boundaryCheck) {
    violations.push(...boundaryCheck.violations);
  }

  const sanitizedReport: CoachFollowUpReport = {
    answer: answerCheck.sanitizedText ?? answerFallback,
    tinyExample: tinyExampleCheck ? tinyExampleCheck.sanitizedText : report.tinyExample,
    nextAction: nextActionCheck ? nextActionCheck.sanitizedText : report.nextAction,
    boundary: boundaryCheck ? boundaryCheck.sanitizedText : report.boundary
  };

  return {
    safe: violations.length === 0,
    mode: options.mode,
    violations,
    sanitizedReport
  };
}

function inspectAndSanitizeField(
  field: CoachTextField,
  text: string,
  options: CoachSpoilerPolicyOptions,
  fallbackText: string | undefined
): {
  violations: CoachSpoilerViolation[];
  sanitizedText: string | undefined;
} {
  const violations: CoachSpoilerViolation[] = [];
  const studentLineSet = buildNormalizedLineSet(options.studentCode ?? "");

  if (SECRET_PATTERNS.some((pattern) => pattern.test(text)) || LOCAL_PATH_PATTERNS.some((pattern) => pattern.test(text))) {
    violations.push({
      field,
      category: "secret_or_path_leak",
      detail: "Output contains a secret token or local user filesystem path."
    });
  }

  if (PROMPT_ECHO_PATTERNS.some((pattern) => pattern.test(text))) {
    violations.push({
      field,
      category: "prompt_injection_echo",
      detail: "Output echoed internal prompt framing tags or layer directives."
    });
  }

  if (isHintModeActive(options.mode)) {
    const fencedMatch = findSpoilerFencedBlock(text);
    if (fencedMatch) {
      violations.push({
        field,
        category: "fenced_code_block",
        detail: `Hint-mode output contains a multi-line or solution code fence (${fencedMatch}).`
      });
    }

    const programLeakReason = detectFullProgramSkeleton(text, studentLineSet);
    if (programLeakReason) {
      violations.push({
        field,
        category: "full_program_skeleton",
        detail: programLeakReason
      });
    }

    if (options.referenceSolution) {
      const overlapReason = detectReferenceSolutionOverlap(text, options.referenceSolution, studentLineSet);
      if (overlapReason) {
        violations.push({
          field,
          category: "reference_solution_overlap",
          detail: overlapReason
        });
      }
    }

    const teacherPackLeak = detectTeacherPackLeak(text, options.teacherPack);
    if (teacherPackLeak) {
      violations.push({
        field,
        category: "teacher_pack_leak",
        detail: teacherPackLeak
      });
    }
  }

  if (violations.length === 0) {
    return { violations, sanitizedText: text };
  }

  return {
    violations,
    sanitizedText: fallbackText
  };
}

function findSpoilerFencedBlock(text: string): string | undefined {
  for (const match of text.matchAll(FENCED_BLOCK_PATTERN)) {
    const body = match[1] ?? "";
    const nonEmptyLines = body
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    if (nonEmptyLines.length === 0) {
      continue;
    }

    const codeLines = nonEmptyLines.filter((line) => looksLikeCodeStatement(line));
    if (nonEmptyLines.length >= 3 || codeLines.length >= 2) {
      return `${nonEmptyLines.length} lines`;
    }
    if (PROGRAM_ENTRY_PATTERNS.some((pattern) => pattern.test(body))) {
      return "program entry point";
    }
    if (INPUT_READ_PATTERN.test(body) && OUTPUT_WRITE_PATTERN.test(body)) {
      return "complete I/O snippet";
    }
  }
  return undefined;
}

function detectFullProgramSkeleton(text: string, studentLineSet: Set<string>): string | undefined {
  const novelLines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !studentLineSet.has(normalizeCodeLine(line)));

  const novelCodeLines = novelLines.filter((line) => looksLikeCodeStatement(line));
  const novelText = novelLines.join("\n");

  if (novelCodeLines.length >= 4) {
    return `Hint-mode output contains ${novelCodeLines.length} novel executable code lines.`;
  }

  const hasEntryScaffold = PROGRAM_ENTRY_PATTERNS.some((pattern) => pattern.test(text));
  if (hasEntryScaffold && (novelCodeLines.length >= 2 || OUTPUT_WRITE_PATTERN.test(novelText))) {
    return "Hint-mode output contains a runnable program entry scaffold.";
  }

  if (INPUT_READ_PATTERN.test(text) && OUTPUT_WRITE_PATTERN.test(text) && novelCodeLines.length >= 1) {
    return "Hint-mode output combines stdin input reading with stdout output writing.";
  }

  return undefined;
}

function detectReferenceSolutionOverlap(
  text: string,
  referenceSolution: string,
  studentLineSet: Set<string>
): string | undefined {
  const refLines = extractNovelReferenceLines(referenceSolution, studentLineSet);
  if (refLines.length === 0) {
    return undefined;
  }

  const normalizedText = normalizeCompact(text);
  const candidateLines = new Set(
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
    if (candidateLines.has(compactRef) || normalizedText.includes(compactRef)) {
      matchedLines += 1;
    }
  }

  if (matchedLines >= 2) {
    return `Hint-mode output matches ${matchedLines} novel lines from the reference solution.`;
  }

  if (refLines.length >= 2 && matchedLines / refLines.length >= 0.5) {
    return "Hint-mode output covers at least half of the novel reference solution lines.";
  }

  const compactRefBody = normalizeCompact(refLines.join("\n"));
  if (compactRefBody.length >= 60) {
    const windowSize = 55;
    for (let index = 0; index <= compactRefBody.length - windowSize; index += 15) {
      const slice = compactRefBody.slice(index, index + windowSize);
      if (normalizedText.includes(slice)) {
        return "Hint-mode output embeds a long contiguous slice of the reference solution.";
      }
    }
  }

  return undefined;
}

function detectTeacherPackLeak(text: string, teacherPack: TeacherPackReference | undefined): string | undefined {
  if (INTERNAL_SPOILER_MARKER_PATTERNS.some((pattern) => pattern.test(text))) {
    return "Hint-mode output contains explicit standard-answer or Teacher Pack reference markers.";
  }

  const approach = teacherPack?.standardApproach?.trim();
  if (!approach || approach.length < 16) {
    return undefined;
  }

  const normalizedText = normalizeCompact(text);
  const normalizedApproach = normalizeCompact(approach);
  if (normalizedApproach.length >= 16 && normalizedText.includes(normalizedApproach)) {
    return "Hint-mode output verbatim-leaks teacherPack.standardApproach.";
  }

  return undefined;
}

function extractNovelReferenceLines(referenceSolution: string, studentLineSet: Set<string>): string[] {
  return referenceSolution
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !line.startsWith("#") && !line.startsWith("//"))
    .filter((line) => !BOILERPLATE_LINES.has(normalizeCodeLine(line)))
    .filter((line) => !studentLineSet.has(normalizeCodeLine(line)));
}

function buildNormalizedLineSet(code: string): Set<string> {
  return new Set(
    code
      .split(/\r?\n/)
      .map((line) => normalizeCodeLine(line))
      .filter((line) => line.length > 0)
  );
}

function looksLikeCodeStatement(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("# ") || trimmed.startsWith("// ")) {
    return false;
  }
  return STATEMENT_LINE_PATTERN.test(trimmed);
}

function normalizeCodeLine(line: string): string {
  return line.trim().replace(/\s+/g, " ");
}

function normalizeCompact(text: string): string {
  return text.replace(/\s+/g, "");
}

function fallbackHintText(language: CoachSpoilerPolicyOptions["responseLanguage"]): string {
  if (language === "en-US") {
    return "Hint mode is active: a potential full solution or hidden reference was withheld. Focus on one small local condition or output check first.";
  }
  return "当前处于提示模式，已拦截疑似完整参考代码或隐藏题解内容。请先聚焦当前卡住的一处局部条件或输出表达。";
}

function fallbackSpecificHintText(language: CoachSpoilerPolicyOptions["responseLanguage"]): string {
  if (language === "en-US") {
    return "Hint mode is active: full AC code is hidden. Check one boundary condition, loop range, or return expression directly in your current code.";
  }
  return "当前处于提示模式，完整 AC 代码已隐藏。请先检查当前代码中最关键的一处边界条件、循环范围或返回表达式。";
}

function safeSkillReasonFallback(language: CoachSpoilerPolicyOptions["responseLanguage"]): string {
  return language === "en-US"
    ? "Recorded from localized diagnostic evidence without revealing reference code."
    : "基于当前错因证据提炼技能候选，未暴露参考代码。";
}

function safeSkillRuleFallback(language: CoachSpoilerPolicyOptions["responseLanguage"]): string {
  return language === "en-US"
    ? "Verify the local boundary and output invariant on a minimal input before revising the full code."
    : "修改整体实现前，先用最小样例核对局部边界条件与输出不变量。";
}

function safeRecommendationFallback(language: CoachSpoilerPolicyOptions["responseLanguage"]): string {
  return language === "en-US"
    ? "Practice the targeted misconception on a focused follow-up exercise."
    : "围绕当前诊断出的核心痛点进行针对性巩固练习。";
}
