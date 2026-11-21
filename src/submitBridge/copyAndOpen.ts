import type {
  OfficialVerdictEvent,
  OfficialVerdictStatus,
  ProblemDocument,
  ProblemIoMode,
  ProblemSourceId,
  SupportedLanguage
} from "../core/contracts";
import {
  resolveSubmitTarget,
  validateSubmissionUrl,
  type SubmitTarget
} from "./targetRegistry";

export interface StripResult {
  cleanedCode: string;
  removedBlocks: number;
}

export interface PreparedSubmission {
  cleanedCode: string;
  removedBlocks: number;
  target: SubmitTarget | null;
  checklist: string[];
}

const LOCAL_START_RE = /^\s*(?:\/\/|#)\s*(?:@?algo-coach[:-]?(?:local-only|harness)-start)\b/i;
const LOCAL_END_RE = /^\s*(?:\/\/|#)\s*(?:@?algo-coach[:-]?(?:local-only|harness)-end)\b/i;

function stripMarkerBlocks(lines: string[]): { lines: string[]; removed: number } {
  const out: string[] = [];
  let skipping = false;
  let removed = 0;

  for (const line of lines) {
    if (!skipping && LOCAL_START_RE.test(line)) {
      skipping = true;
      removed += 1;
      continue;
    }
    if (skipping) {
      if (LOCAL_END_RE.test(line)) {
        skipping = false;
      }
      continue;
    }
    out.push(line);
  }
  return { lines: out, removed };
}

/**
 * Strips C/C++ local-only preprocessor blocks:
 * `#ifdef LOCAL ... #endif`, `#ifdef ALGO_COACH_LOCAL ... #endif`, `#ifndef ONLINE_JUDGE ... #endif`.
 * Respects nested `#if` / `#ifdef` / `#ifndef` / `#else` / `#endif` correctly.
 */
function stripCppLocalIfdefBlocks(lines: string[]): { lines: string[]; removed: number } {
  const out: string[] = [];
  let removed = 0;
  // Stack tracks whether we are inside a local-debug conditional block:
  // "drop" = discarding lines in active local branch; "keep_else" = keeping #else branch of local #ifdef
  let skipDepth = 0;
  let inLocalElse = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (skipDepth === 0) {
      if (
        /^#\s*ifdef\s+(?:LOCAL|ALGO_COACH_LOCAL)\b/.test(trimmed) ||
        /^#\s*ifndef\s+ONLINE_JUDGE\b/.test(trimmed) ||
        /^#\s*if\s+defined\s*\(\s*(?:LOCAL|ALGO_COACH_LOCAL)\s*\)/.test(trimmed)
      ) {
        skipDepth = 1;
        inLocalElse = false;
        removed += 1;
        continue;
      }
      out.push(line);
      continue;
    }

    // Inside a skipped local preprocessor block
    if (/^#\s*(?:if|ifdef|ifndef)\b/.test(trimmed)) {
      skipDepth += 1;
      continue;
    }
    if (skipDepth === 1 && /^#\s*else\b/.test(trimmed)) {
      inLocalElse = true;
      continue;
    }
    if (/^#\s*endif\b/.test(trimmed)) {
      skipDepth -= 1;
      if (skipDepth === 0) {
        inLocalElse = false;
      }
      continue;
    }

    if (inLocalElse) {
      out.push(line);
    }
  }

  return { lines: out, removed };
}

/**
 * For LeetCode `function` mode in Python, strips a trailing local `if __name__ == "__main__":`
 * driver block so only clean `class Solution` code is copied for submission.
 * Preserved untouched in ACM/OI `stdio` mode.
 */
function stripPythonLeetCodeMainBlock(lines: string[]): { lines: string[]; removed: number } {
  const out: string[] = [];
  let removed = 0;
  let skippingMain = false;

  for (const line of lines) {
    if (!skippingMain && /^if\s+__name__\s*==\s*["']__main__["']\s*:/.test(line)) {
      skippingMain = true;
      removed += 1;
      continue;
    }
    if (skippingMain) {
      // Top-level non-indented non-empty statement ends the __main__ block
      if (line.length > 0 && !/^\s/.test(line)) {
        skippingMain = false;
        out.push(line);
      }
      continue;
    }
    out.push(line);
  }
  return { lines: out, removed };
}

/**
 * For LeetCode `function` mode in C++, strips a local `int main(...) { ... }` test driver
 * while preserving `class Solution` and helper structs.
 */
function stripCppLeetCodeMainFunction(code: string): { code: string; removed: number } {
  const mainMatch = code.match(/\n[ \t]*int\s+main\s*\([^)]*\)\s*\{/);
  if (!mainMatch || mainMatch.index === undefined) {
    return { code, removed: 0 };
  }
  const openBraceIdx = code.indexOf("{", mainMatch.index);
  if (openBraceIdx === -1) {
    return { code, removed: 0 };
  }
  let depth = 0;
  let endIdx = -1;
  for (let i = openBraceIdx; i < code.length; i += 1) {
    const ch = code[i];
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        endIdx = i + 1;
        break;
      }
    }
  }
  if (endIdx === -1) {
    return { code, removed: 0 };
  }
  const cleaned = `${code.slice(0, mainMatch.index)}${code.slice(endIdx)}`;
  return { code: cleaned, removed: 1 };
}

export function stripLocalDebugAndHarness(
  sourceCode: string,
  language: SupportedLanguage,
  ioMode: ProblemIoMode = "stdio"
): StripResult {
  const normalized = sourceCode.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  let lines = normalized.split("\n");
  let removedBlocks = 0;

  const markerPass = stripMarkerBlocks(lines);
  lines = markerPass.lines;
  removedBlocks += markerPass.removed;

  if (language === "cpp" || language === "c") {
    const ifdefPass = stripCppLocalIfdefBlocks(lines);
    lines = ifdefPass.lines;
    removedBlocks += ifdefPass.removed;
  }

  if (ioMode === "function" && language === "python") {
    const pyMainPass = stripPythonLeetCodeMainBlock(lines);
    lines = pyMainPass.lines;
    removedBlocks += pyMainPass.removed;
  }

  let joined = lines.join("\n");

  if (ioMode === "function" && language === "cpp") {
    const cppMainPass = stripCppLeetCodeMainFunction(joined);
    joined = cppMainPass.code;
    removedBlocks += cppMainPass.removed;
  }

  const cleanedCode = joined.replace(/\n{3,}/g, "\n\n").trim() + "\n";
  return {
    cleanedCode: cleanedCode === "\n" ? "" : cleanedCode,
    removedBlocks
  };
}

/**
 * Pure domain preparation for honest zero-maintenance "Copy Clean Solution & Open Official Submit Page".
 * Never steals cookies, never bypasses CAPTCHA/Turnstile, never auto-submits silently.
 */
export function prepareSubmitPayload(
  problem: ProblemDocument,
  sourceCode: string,
  language: SupportedLanguage
): PreparedSubmission {
  const stripped = stripLocalDebugAndHarness(sourceCode, language, problem.ioMode);
  const target = resolveSubmitTarget(problem);

  const checklist: string[] = [
    stripped.removedBlocks > 0
      ? `Stripped ${stripped.removedBlocks} local debug/harness block(s) for clean submission.`
      : "Solution is already clean (no local debug blocks needed stripping)."
  ];

  if (target) {
    checklist.push(`Open official submit page: ${target.submitUrl}`);
    checklist.push("Verify language selection in your browser and submit manually.");
    if (target.supportsAutoVerdictPoll) {
      checklist.push("Optional: poll public Codeforces user.status API after submitting.");
    }
  } else {
    checklist.push("Local/custom problem: copy cleaned code and submit on your target judge manually.");
  }

  return {
    cleanedCode: stripped.cleanedCode,
    removedBlocks: stripped.removedBlocks,
    target,
    checklist
  };
}

export function createManualVerdictEvent(input: {
  problemKey: string;
  platform: ProblemSourceId;
  verdict: OfficialVerdictStatus;
  submissionUrl?: string;
  passedTests?: number;
  runtimeMs?: number;
  memoryKb?: number;
}): OfficialVerdictEvent {
  const safeUrl =
    input.submissionUrl && validateSubmissionUrl(input.submissionUrl, input.platform)
      ? input.submissionUrl
      : undefined;

  return {
    schemaVersion: "official-verdict/v2",
    source: "official_oj",
    problemKey: input.problemKey,
    platform: input.platform,
    ...(safeUrl ? { submissionUrl: safeUrl } : {}),
    verdict: input.verdict,
    ...(input.passedTests !== undefined ? { passedTests: input.passedTests } : {}),
    ...(input.runtimeMs !== undefined ? { runtimeMs: input.runtimeMs } : {}),
    ...(input.memoryKb !== undefined ? { memoryKb: input.memoryKb } : {}),
    observedVia: "manual_report",
    timestamp: new Date().toISOString()
  };
}
