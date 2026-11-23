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

type CStyleLang = "c" | "cpp" | "rust" | "java";

/**
 * If a comment, string literal, char literal, or raw string begins at `idx`,
 * returns the index immediately after its closing delimiter (or `code.length` if unclosed).
 * Returns `-1` if `idx` starts a regular code character.
 */
function skipCommentOrLiteral(code: string, idx: number, lang: CStyleLang): number {
  const ch = code[idx];
  const next = code[idx + 1];

  // Line comment `// ...` (with optional `\` line continuation in C/C++)
  if (ch === "/" && next === "/") {
    let i = idx + 2;
    while (i < code.length) {
      if (code[i] === "\n") {
        if ((lang === "c" || lang === "cpp") && code[i - 1] === "\\") {
          i += 1;
          continue;
        }
        return i;
      }
      i += 1;
    }
    return code.length;
  }

  // Block comment `/* ... */` (nested in Rust)
  if (ch === "/" && next === "*") {
    let i = idx + 2;
    let depth = 1;
    while (i < code.length) {
      if (lang === "rust" && code[i] === "/" && code[i + 1] === "*") {
        depth += 1;
        i += 2;
        continue;
      }
      if (code[i] === "*" && code[i + 1] === "/") {
        depth -= 1;
        i += 2;
        if (depth === 0) {
          return i;
        }
        continue;
      }
      i += 1;
    }
    return code.length;
  }

  // C++ raw string literal: `R"delim(...)delim"`
  if (
    lang === "cpp" &&
    ch === "R" &&
    next === "\"" &&
    (idx === 0 || !/[A-Za-z0-9_$]/.test(code[idx - 1]!))
  ) {
    const openParen = code.indexOf("(", idx + 2);
    if (openParen !== -1) {
      const delim = code.slice(idx + 2, openParen);
      if (delim.length <= 16 && !/[\s()\\]/.test(delim)) {
        const closing = `)${delim}"`;
        const closeIdx = code.indexOf(closing, openParen + 1);
        return closeIdx === -1 ? code.length : closeIdx + closing.length;
      }
    }
  }

  // Rust raw string literal: `r#"..."#`, `br#"..."#`
  if (
    lang === "rust" &&
    (idx === 0 || !/[A-Za-z0-9_$]/.test(code[idx - 1]!)) &&
    (ch === "r" || (ch === "b" && next === "r"))
  ) {
    const rawMatch = code.slice(idx).match(/^b?r(#*)"/);
    if (rawMatch) {
      const hashes = rawMatch[1] ?? "";
      const start = idx + rawMatch[0].length;
      const closing = `"${hashes}`;
      const closeIdx = code.indexOf(closing, start);
      return closeIdx === -1 ? code.length : closeIdx + closing.length;
    }
  }

  // Java text block `"""..."""`
  if (lang === "java" && code.startsWith('"""', idx)) {
    let i = idx + 3;
    while (i < code.length) {
      if (code[i] === "\\") {
        i += 2;
        continue;
      }
      if (code.startsWith('"""', i)) {
        return i + 3;
      }
      i += 1;
    }
    return code.length;
  }

  // Standard double-quoted string `"..."`
  if (ch === "\"") {
    let i = idx + 1;
    while (i < code.length) {
      if (code[i] === "\\") {
        i += 2;
        continue;
      }
      if (code[i] === "\"") {
        return i + 1;
      }
      if (code[i] === "\n" && (lang === "c" || lang === "cpp")) {
        return i;
      }
      i += 1;
    }
    return code.length;
  }

  // Single-quoted char literal `'...'` (carefully avoid Rust lifetime annotations like `'a` / `'static`)
  if (ch === "'") {
    if (lang === "rust") {
      const charMatch = code
        .slice(idx)
        .match(/^'(?:[^'\\\n]|\\(?:x[0-9a-fA-F]{2}|u\{[0-9a-fA-F_]+\}|.))'/);
      return charMatch ? idx + charMatch[0].length : -1;
    }
    let i = idx + 1;
    while (i < code.length) {
      if (code[i] === "\\") {
        i += 2;
        continue;
      }
      if (code[i] === "'") {
        return i + 1;
      }
      if (code[i] === "\n") {
        return i;
      }
      i += 1;
    }
    return code.length;
  }

  return -1;
}

interface CppLexLineState {
  inBlockComment: boolean;
  rawDelim: string | null;
  inContinuedString: boolean;
}

function advanceCppLineLexState(line: string, state: CppLexLineState): void {
  let i = 0;
  while (i < line.length) {
    if (state.inBlockComment) {
      const close = line.indexOf("*/", i);
      if (close === -1) {
        return;
      }
      state.inBlockComment = false;
      i = close + 2;
      continue;
    }

    if (state.rawDelim !== null) {
      const closing = `)${state.rawDelim}"`;
      const close = line.indexOf(closing, i);
      if (close === -1) {
        return;
      }
      state.rawDelim = null;
      i = close + closing.length;
      continue;
    }

    if (state.inContinuedString) {
      if (line[i] === "\\") {
        if (i + 1 >= line.length) {
          return;
        }
        i += 2;
        continue;
      }
      if (line[i] === "\"") {
        state.inContinuedString = false;
      }
      i += 1;
      continue;
    }

    const ch = line[i]!;
    const next = line[i + 1];
    if (ch === "/" && next === "/") {
      return;
    }
    if (ch === "/" && next === "*") {
      const close = line.indexOf("*/", i + 2);
      if (close === -1) {
        state.inBlockComment = true;
        return;
      }
      i = close + 2;
      continue;
    }
    if (ch === "R" && next === "\"" && (i === 0 || !/[A-Za-z0-9_$]/.test(line[i - 1]!))) {
      const openParen = line.indexOf("(", i + 2);
      if (openParen !== -1) {
        const delim = line.slice(i + 2, openParen);
        if (delim.length <= 16 && !/[\s()\\]/.test(delim)) {
          const closing = `)${delim}"`;
          const closeIdx = line.indexOf(closing, openParen + 1);
          if (closeIdx === -1) {
            state.rawDelim = delim;
            return;
          }
          i = closeIdx + closing.length;
          continue;
        }
      }
    }
    if (ch === "\"") {
      i += 1;
      while (i < line.length) {
        if (line[i] === "\\") {
          if (i + 1 >= line.length) {
            state.inContinuedString = true;
            return;
          }
          i += 2;
          continue;
        }
        if (line[i] === "\"") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "'") {
      i += 1;
      while (i < line.length) {
        if (line[i] === "\\") {
          i += 2;
          continue;
        }
        if (line[i] === "'") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    i += 1;
  }
}

function stripTrailingCppComments(directiveLine: string): string {
  let out = "";
  let inBlock = false;
  for (let i = 0; i < directiveLine.length; i += 1) {
    if (inBlock) {
      if (directiveLine[i] === "*" && directiveLine[i + 1] === "/") {
        inBlock = false;
        i += 1;
      }
      continue;
    }
    if (directiveLine[i] === "/" && directiveLine[i + 1] === "/") {
      break;
    }
    if (directiveLine[i] === "/" && directiveLine[i + 1] === "*") {
      inBlock = true;
      i += 1;
      continue;
    }
    out += directiveLine[i];
  }
  return out.trim();
}

type DirectiveClassification = "local_true" | "oj_true" | "other";

function classifyIfCondition(expr: string): DirectiveClassification {
  let norm = expr.trim();
  while (norm.startsWith("(") && norm.endsWith(")")) {
    let depth = 0;
    let wrapsWhole = true;
    for (let i = 0; i < norm.length; i += 1) {
      if (norm[i] === "(") depth += 1;
      else if (norm[i] === ")") depth -= 1;
      if (depth === 0 && i < norm.length - 1) {
        wrapsWhole = false;
        break;
      }
    }
    if (!wrapsWhole) break;
    norm = norm.slice(1, -1).trim();
  }

  if (
    /^defined\s*\(\s*(?:LOCAL|ALGO_COACH_LOCAL)\s*\)$/.test(norm) ||
    /^defined\s+(?:LOCAL|ALGO_COACH_LOCAL)$/.test(norm) ||
    /^!\s*defined\s*\(\s*ONLINE_JUDGE\s*\)$/.test(norm) ||
    /^!\s*defined\s+ONLINE_JUDGE$/.test(norm) ||
    /^!\s*\(\s*defined\s*\(\s*ONLINE_JUDGE\s*\)\s*\)$/.test(norm)
  ) {
    return "local_true";
  }

  if (
    /^defined\s*\(\s*ONLINE_JUDGE\s*\)$/.test(norm) ||
    /^defined\s+ONLINE_JUDGE$/.test(norm) ||
    /^!\s*defined\s*\(\s*(?:LOCAL|ALGO_COACH_LOCAL)\s*\)$/.test(norm) ||
    /^!\s*defined\s+(?:LOCAL|ALGO_COACH_LOCAL)$/.test(norm)
  ) {
    return "oj_true";
  }

  return "other";
}

function classifyCppOpenDirective(cleanDirective: string): DirectiveClassification | null {
  const ifdefMatch = cleanDirective.match(/^#\s*ifdef\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/);
  if (ifdefMatch?.[1]) {
    const macro = ifdefMatch[1];
    if (macro === "LOCAL" || macro === "ALGO_COACH_LOCAL") return "local_true";
    if (macro === "ONLINE_JUDGE") return "oj_true";
    return "other";
  }

  const ifndefMatch = cleanDirective.match(/^#\s*ifndef\s+([A-Za-z_][A-Za-z0-9_]*)\s*$/);
  if (ifndefMatch?.[1]) {
    const macro = ifndefMatch[1];
    if (macro === "ONLINE_JUDGE") return "local_true";
    if (macro === "LOCAL" || macro === "ALGO_COACH_LOCAL") return "oj_true";
    return "other";
  }

  const ifMatch = cleanDirective.match(/^#\s*if\s+(.+)$/);
  if (ifMatch?.[1]) {
    return classifyIfCondition(ifMatch[1]);
  }

  return null;
}

type IfdefFrame =
  | { kind: "passthrough" }
  | { kind: "local_skip" }
  | { kind: "local_keep_else" }
  | { kind: "oj_buffer"; openLine: string; bodyLines: string[] }
  | { kind: "oj_skip_rest" }
  | { kind: "nested_skip" };

function isSkippingStack(stack: IfdefFrame[]): boolean {
  return stack.some(
    (f) => f.kind === "local_skip" || f.kind === "oj_skip_rest" || f.kind === "nested_skip"
  );
}

/**
 * Strips C/C++ local-only preprocessor blocks:
 * `#ifdef LOCAL`, `#ifdef ALGO_COACH_LOCAL`, `#ifndef ONLINE_JUDGE`, `#if !defined(ONLINE_JUDGE)`,
 * and `#ifdef ONLINE_JUDGE ... #else ... #endif`.
 * Comment/string/raw-string aware, handles `#elif` branches cleanly, and falls back to EOF if unclosed.
 */
function stripCppLocalIfdefBlocks(lines: string[]): { lines: string[]; removed: number } {
  const out: string[] = [];
  let removed = 0;
  const lexState: CppLexLineState = {
    inBlockComment: false,
    rawDelim: null,
    inContinuedString: false
  };
  const stack: IfdefFrame[] = [];

  const emit = (line: string): void => {
    for (let i = stack.length - 1; i >= 0; i -= 1) {
      const frame = stack[i]!;
      if (frame.kind === "oj_buffer") {
        frame.bodyLines.push(line);
        return;
      }
    }
    out.push(line);
  };

  for (const line of lines) {
    const atCodeTopLevel =
      !lexState.inBlockComment && lexState.rawDelim === null && !lexState.inContinuedString;
    advanceCppLineLexState(line, lexState);

    if (!atCodeTopLevel) {
      if (!isSkippingStack(stack)) {
        emit(line);
      }
      continue;
    }

    const clean = stripTrailingCppComments(line.trim());
    if (!clean.startsWith("#")) {
      if (!isSkippingStack(stack)) {
        emit(line);
      }
      continue;
    }

    const openKind = classifyCppOpenDirective(clean);
    if (openKind !== null) {
      if (isSkippingStack(stack)) {
        stack.push({ kind: "nested_skip" });
        continue;
      }
      if (openKind === "local_true") {
        stack.push({ kind: "local_skip" });
        removed += 1;
        continue;
      }
      if (openKind === "oj_true") {
        stack.push({ kind: "oj_buffer", openLine: line, bodyLines: [] });
        continue;
      }
      stack.push({ kind: "passthrough" });
      emit(line);
      continue;
    }

    const elifMatch = clean.match(/^#\s*elif\s+(.+)$/);
    if (elifMatch?.[1] && stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const parentSkipping = stack
        .slice(0, -1)
        .some((f) => f.kind === "local_skip" || f.kind === "oj_skip_rest" || f.kind === "nested_skip");
      if (parentSkipping || top.kind === "nested_skip" || top.kind === "oj_skip_rest") {
        continue;
      }
      if (top.kind === "local_keep_else") {
        stack[stack.length - 1] = { kind: "oj_skip_rest" };
        continue;
      }
      if (top.kind === "oj_buffer") {
        const body = top.bodyLines;
        stack[stack.length - 1] = { kind: "oj_skip_rest" };
        removed += 1;
        for (const bl of body) {
          emit(bl);
        }
        continue;
      }
      if (top.kind === "local_skip") {
        const elifKind = classifyIfCondition(elifMatch[1]);
        if (elifKind === "local_true") {
          continue;
        }
        if (elifKind === "oj_true") {
          stack[stack.length - 1] = { kind: "local_keep_else" };
          continue;
        }
        // General `#elif <cond>` after skipped `#ifdef LOCAL` becomes `#if <cond>`
        const indent = line.match(/^(\s*)/)?.[1] ?? "";
        const rewritten = line.replace(/^(\s*#\s*)elif\b/, `$1if`).replace(/^\s*/, indent);
        stack[stack.length - 1] = { kind: "passthrough" };
        emit(rewritten);
        continue;
      }
      emit(line);
      continue;
    }

    if (/^#\s*else\b/.test(clean) && stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const parentSkipping = stack
        .slice(0, -1)
        .some((f) => f.kind === "local_skip" || f.kind === "oj_skip_rest" || f.kind === "nested_skip");
      if (parentSkipping || top.kind === "nested_skip" || top.kind === "oj_skip_rest") {
        continue;
      }
      if (top.kind === "local_skip") {
        stack[stack.length - 1] = { kind: "local_keep_else" };
        continue;
      }
      if (top.kind === "local_keep_else") {
        stack[stack.length - 1] = { kind: "oj_skip_rest" };
        continue;
      }
      if (top.kind === "oj_buffer") {
        const body = top.bodyLines;
        stack[stack.length - 1] = { kind: "oj_skip_rest" };
        removed += 1;
        for (const bl of body) {
          emit(bl);
        }
        continue;
      }
      emit(line);
      continue;
    }

    if (/^#\s*endif\b/.test(clean) && stack.length > 0) {
      const popped = stack.pop()!;
      if (popped.kind === "passthrough") {
        emit(line);
      } else if (popped.kind === "oj_buffer") {
        // Standalone `#ifdef ONLINE_JUDGE ... #endif` without `#else`/`#elif`: keep intact
        emit(popped.openLine);
        for (const bl of popped.bodyLines) {
          emit(bl);
        }
        emit(line);
      }
      continue;
    }

    if (!isSkippingStack(stack)) {
      emit(line);
    }
  }

  // Unclosed `#ifdef ONLINE_JUDGE` buffer fallback at EOF
  for (const frame of stack) {
    if (frame.kind === "oj_buffer") {
      out.push(frame.openLine, ...frame.bodyLines);
    }
  }

  return { lines: out, removed };
}

interface PythonLexState {
  tripleQuote: "'''" | '"""' | null;
  bracketDepth: number;
  inLineContinuation: boolean;
}

function advancePythonLineState(line: string, state: PythonLexState): void {
  let i = 0;
  let endedWithBackslash = false;

  while (i < line.length) {
    if (state.tripleQuote !== null) {
      const closeIdx = line.indexOf(state.tripleQuote, i);
      if (closeIdx === -1) {
        state.inLineContinuation = false;
        return;
      }
      // Make sure closing triple quote is not escaped (odd number of preceding backslashes)
      let bs = 0;
      for (let k = closeIdx - 1; k >= i && line[k] === "\\"; k -= 1) {
        bs += 1;
      }
      if (bs % 2 === 1) {
        i = closeIdx + 1;
        continue;
      }
      state.tripleQuote = null;
      i = closeIdx + 3;
      continue;
    }

    const ch = line[i]!;
    if (ch === "#") {
      break;
    }
    if (line.startsWith('"""', i)) {
      state.tripleQuote = '"""';
      i += 3;
      continue;
    }
    if (line.startsWith("'''", i)) {
      state.tripleQuote = "'''";
      i += 3;
      continue;
    }
    if (ch === "\"" || ch === "'") {
      const quote = ch;
      i += 1;
      while (i < line.length) {
        if (line[i] === "\\") {
          i += 2;
          continue;
        }
        if (line[i] === quote) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      state.bracketDepth += 1;
    } else if ((ch === ")" || ch === "]" || ch === "}") && state.bracketDepth > 0) {
      state.bracketDepth -= 1;
    } else if (ch === "\\") {
      const rest = line.slice(i + 1).trim();
      if (!rest) {
        endedWithBackslash = true;
      }
    }
    i += 1;
  }

  state.inLineContinuation = state.tripleQuote === null && endedWithBackslash;
}

/**
 * For LeetCode `function` mode in Python, strips local `if __name__ == "__main__":`
 * driver blocks while tracking triple-quoted strings, bracket continuations, and `\` continuations.
 * Preserved untouched in ACM/OI `stdio` mode.
 */
function stripPythonLeetCodeMainBlock(lines: string[]): { lines: string[]; removed: number } {
  const out: string[] = [];
  let removed = 0;
  let skippingMain = false;
  const lex: PythonLexState = {
    tripleQuote: null,
    bracketDepth: 0,
    inLineContinuation: false
  };

  for (const line of lines) {
    const canEndBlock =
      lex.tripleQuote === null && lex.bracketDepth === 0 && !lex.inLineContinuation;

    if (skippingMain) {
      if (canEndBlock && line.length > 0 && !/^\s/.test(line)) {
        skippingMain = false;
      } else {
        advancePythonLineState(line, lex);
        continue;
      }
    }

    const mainMatch =
      canEndBlock &&
      line.match(/^if\s+__name__\s*==\s*["']__main__["']\s*:(.*)$/);
    if (mainMatch) {
      removed += 1;
      const afterColon = (mainMatch[1] ?? "").replace(/#.*$/, "").trim();
      advancePythonLineState(line, lex);
      const continues =
        lex.tripleQuote !== null || lex.bracketDepth > 0 || lex.inLineContinuation;
      if (afterColon.length === 0 || continues) {
        skippingMain = true;
      }
      continue;
    }

    advancePythonLineState(line, lex);
    out.push(line);
  }

  return { lines: out, removed };
}

function skipWsAndComments(code: string, idx: number, lang: CStyleLang): number {
  let i = idx;
  while (i < code.length) {
    if (/\s/.test(code[i]!)) {
      i += 1;
      continue;
    }
    if (code[i] === "/" && (code[i + 1] === "/" || code[i + 1] === "*")) {
      const next = skipCommentOrLiteral(code, i, lang);
      if (next > i) {
        i = next;
        continue;
      }
    }
    break;
  }
  return i;
}

function findMatchingDelimiter(
  code: string,
  openIdx: number,
  openCh: "(" | "{",
  closeCh: ")" | "}",
  lang: CStyleLang
): number {
  let depth = 0;
  let i = openIdx;
  while (i < code.length) {
    const skipped = skipCommentOrLiteral(code, i, lang);
    if (skipped !== -1) {
      i = skipped;
      continue;
    }
    const ch = code[i];
    if (ch === openCh) {
      depth += 1;
    } else if (ch === closeCh) {
      depth -= 1;
      if (depth === 0) {
        return i + 1;
      }
    }
    i += 1;
  }
  return -1;
}

function expandRemovalRange(code: string, start: number, end: number): { start: number; end: number } {
  let s = start;
  while (s > 0 && (code[s - 1] === " " || code[s - 1] === "\t")) {
    s -= 1;
  }
  let e = end;
  while (e < code.length && (code[e] === " " || code[e] === "\t")) {
    e += 1;
  }
  if (code[e] === "\n") {
    e += 1;
  }
  return { start: s, end: e };
}

function applyRemovals(
  code: string,
  ranges: Array<{ start: number; end: number }>
): { code: string; removed: number } {
  if (ranges.length === 0) {
    return { code, removed: 0 };
  }
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  let out = "";
  let cursor = 0;
  let count = 0;
  for (const r of sorted) {
    if (r.start < cursor) continue;
    out += code.slice(cursor, r.start);
    cursor = r.end;
    count += 1;
  }
  out += code.slice(cursor);
  return { code: out, removed: count };
}

/**
 * Strips top-level C/C++ `int main(...) { ... }` or `signed main(...) { ... }` local drivers
 * in `function` mode while respecting comments, strings, char literals, and raw strings.
 */
function stripCFamilyMainFunction(
  code: string,
  lang: "c" | "cpp"
): { code: string; removed: number } {
  const ranges: Array<{ start: number; end: number }> = [];
  let braceDepth = 0;
  let parenDepth = 0;
  let atLineStart = true;
  let i = 0;

  while (i < code.length) {
    const skipped = skipCommentOrLiteral(code, i, lang);
    if (skipped !== -1) {
      atLineStart = code.slice(i, skipped).includes("\n");
      i = skipped;
      continue;
    }

    const ch = code[i]!;
    if (atLineStart && ch === "#") {
      // Skip preprocessor line (handling trailing `\` continuations)
      while (i < code.length) {
        if (code[i] === "\n") {
          if (code[i - 1] === "\\") {
            i += 1;
            continue;
          }
          i += 1;
          break;
        }
        i += 1;
      }
      atLineStart = true;
      continue;
    }

    if (ch === "\n") {
      atLineStart = true;
      i += 1;
      continue;
    }
    if (!/\s/.test(ch)) {
      atLineStart = false;
    }

    if (braceDepth === 0 && parenDepth === 0 && (i === 0 || !/[A-Za-z0-9_$]/.test(code[i - 1]!))) {
      const match = code.slice(i).match(/^(?:int|signed)\s+main\s*\(/);
      if (match) {
        const openParenIdx = i + match[0].length - 1;
        const afterParen = findMatchingDelimiter(code, openParenIdx, "(", ")", lang);
        if (afterParen !== -1) {
          const bodyStart = skipWsAndComments(code, afterParen, lang);
          if (code[bodyStart] === "{") {
            const bodyEnd = findMatchingDelimiter(code, bodyStart, "{", "}", lang);
            const finalEnd = bodyEnd === -1 ? code.length : bodyEnd;
            ranges.push(expandRemovalRange(code, i, finalEnd));
            i = finalEnd;
            atLineStart = i > 0 && code[i - 1] === "\n";
            continue;
          }
        }
      }
    }

    if (ch === "{") braceDepth += 1;
    else if (ch === "}" && braceDepth > 0) braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")" && parenDepth > 0) parenDepth -= 1;
    i += 1;
  }

  return applyRemovals(code, ranges);
}

/**
 * Strips top-level Rust `fn main(...) { ... }` local drivers in `function` mode.
 */
function stripRustMainFunction(code: string): { code: string; removed: number } {
  const ranges: Array<{ start: number; end: number }> = [];
  let braceDepth = 0;
  let parenDepth = 0;
  let i = 0;

  while (i < code.length) {
    const skipped = skipCommentOrLiteral(code, i, "rust");
    if (skipped !== -1) {
      i = skipped;
      continue;
    }

    const ch = code[i]!;
    if (braceDepth === 0 && parenDepth === 0 && (i === 0 || !/[A-Za-z0-9_$]/.test(code[i - 1]!))) {
      const match = code.slice(i).match(/^(?:pub(?:\s*\([^)]*\))?\s+)?(?:async\s+)?fn\s+main\s*\(/);
      if (match) {
        const openParenIdx = i + match[0].length - 1;
        const afterParen = findMatchingDelimiter(code, openParenIdx, "(", ")", "rust");
        if (afterParen !== -1) {
          let cursor = afterParen;
          while (cursor < code.length) {
            const skipInner = skipCommentOrLiteral(code, cursor, "rust");
            if (skipInner !== -1) {
              cursor = skipInner;
              continue;
            }
            if (code[cursor] === "{" || code[cursor] === ";") {
              break;
            }
            cursor += 1;
          }
          if (code[cursor] === "{") {
            const bodyEnd = findMatchingDelimiter(code, cursor, "{", "}", "rust");
            const finalEnd = bodyEnd === -1 ? code.length : bodyEnd;
            ranges.push(expandRemovalRange(code, i, finalEnd));
            i = finalEnd;
            continue;
          }
        }
      }
    }

    if (ch === "{") braceDepth += 1;
    else if (ch === "}" && braceDepth > 0) braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")" && parenDepth > 0) parenDepth -= 1;
    i += 1;
  }

  return applyRemovals(code, ranges);
}

function hasJavaCodeTokens(fragment: string): boolean {
  let i = 0;
  while (i < fragment.length) {
    if (/\s/.test(fragment[i]!)) {
      i += 1;
      continue;
    }
    if (fragment[i] === "/" && (fragment[i + 1] === "/" || fragment[i + 1] === "*")) {
      const next = skipCommentOrLiteral(fragment, i, "java");
      i = next === -1 ? i + 1 : next;
      continue;
    }
    return true;
  }
  return false;
}

/**
 * Strips Java local `static void main(String[] args)` test drivers in `function` mode:
 * - If inside a standalone driver class (e.g. `class Main { public static void main(...) {} }`) with no other members,
 *   strips the entire enclosing class so only `class Solution` remains.
 * - If inside `class Solution` or alongside other methods, strips only the `main(...)` method.
 */
function stripJavaMainFunction(code: string): { code: string; removed: number } {
  interface ClassScope {
    name: string;
    start: number;
    openBrace: number;
    endBrace: number;
  }

  const classScopes: ClassScope[] = [];
  const mainRanges: Array<{ start: number; end: number; enclosing?: ClassScope }> = [];
  const scopeStack: Array<ClassScope | null> = [];
  let i = 0;

  while (i < code.length) {
    const skipped = skipCommentOrLiteral(code, i, "java");
    if (skipped !== -1) {
      i = skipped;
      continue;
    }

    if (i === 0 || !/[A-Za-z0-9_$]/.test(code[i - 1]!)) {
      // Detect top-level or nested class declaration
      if (scopeStack.length === 0) {
        const clsMatch = code
          .slice(i)
          .match(/^(?:(?:public|private|protected|abstract|final|static)\s+)*class\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
        if (clsMatch?.[1]) {
          let cursor = i + clsMatch[0].length;
          while (cursor < code.length) {
            const sk = skipCommentOrLiteral(code, cursor, "java");
            if (sk !== -1) {
              cursor = sk;
              continue;
            }
            if (code[cursor] === "{" || code[cursor] === ";") {
              break;
            }
            cursor += 1;
          }
          if (code[cursor] === "{") {
            const endBrace = findMatchingDelimiter(code, cursor, "{", "}", "java");
            const scope: ClassScope = {
              name: clsMatch[1],
              start: i,
              openBrace: cursor,
              endBrace: endBrace === -1 ? code.length : endBrace
            };
            classScopes.push(scope);
            scopeStack.push(scope);
            i = cursor + 1;
            continue;
          }
        }
      }

      // Detect `static void main(` inside a class body (`scopeStack.length === 1`)
      if (scopeStack.length === 1) {
        const mainMatch = code
          .slice(i)
          .match(/^(?:(?:public|private|protected|static|final)\s+)+void\s+main\s*\(/);
        if (mainMatch && /\bstatic\b/.test(mainMatch[0])) {
          const openParenIdx = i + mainMatch[0].length - 1;
          const afterParen = findMatchingDelimiter(code, openParenIdx, "(", ")", "java");
          if (afterParen !== -1) {
            let cursor = afterParen;
            while (cursor < code.length) {
              const sk = skipCommentOrLiteral(code, cursor, "java");
              if (sk !== -1) {
                cursor = sk;
                continue;
              }
              if (code[cursor] === "{" || code[cursor] === ";") {
                break;
              }
              cursor += 1;
            }
            if (code[cursor] === "{") {
              const bodyEnd = findMatchingDelimiter(code, cursor, "{", "}", "java");
              const finalEnd = bodyEnd === -1 ? code.length : bodyEnd;
              mainRanges.push({
                start: i,
                end: finalEnd,
                enclosing: scopeStack[0] ?? undefined
              });
              i = finalEnd;
              continue;
            }
          }
        }
      }
    }

    if (code[i] === "{") {
      scopeStack.push(null);
    } else if (code[i] === "}" && scopeStack.length > 0) {
      scopeStack.pop();
    }
    i += 1;
  }

  const finalRanges: Array<{ start: number; end: number }> = [];
  for (const mr of mainRanges) {
    const cls = mr.enclosing;
    if (cls && cls.name !== "Solution") {
      const before = code.slice(cls.openBrace + 1, mr.start);
      const after = code.slice(mr.end, cls.endBrace - 1);
      if (!hasJavaCodeTokens(before) && !hasJavaCodeTokens(after)) {
        finalRanges.push(expandRemovalRange(code, cls.start, cls.endBrace));
        continue;
      }
    }
    finalRanges.push(expandRemovalRange(code, mr.start, mr.end));
  }

  return applyRemovals(code, finalRanges);
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

  if (ioMode === "function") {
    if (language === "cpp" || language === "c") {
      const cMainPass = stripCFamilyMainFunction(joined, language);
      joined = cMainPass.code;
      removedBlocks += cMainPass.removed;
    } else if (language === "rust") {
      const rsMainPass = stripRustMainFunction(joined);
      joined = rsMainPass.code;
      removedBlocks += rsMainPass.removed;
    } else if (language === "java") {
      const javaMainPass = stripJavaMainFunction(joined);
      joined = javaMainPass.code;
      removedBlocks += javaMainPass.removed;
    }
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
