import type { AutocompleteZone, SupportedLanguage } from "../contracts";
import { normalizeLanguage } from "../contextProjection";

export type AutocompleteOutputStatus = "accepted" | "model-empty" | "rejected";

export type AutocompleteRejectionReason =
  | "empty-after-filter"
  | "explanation"
  | "context-marker"
  | "neutral-nested-control-flow"
  | "neutral-loop-state-update"
  | "full-skeleton-rejected"
  | "token-budget-exceeded";

export interface PlaceholderRange {
  text: string;
  label: string;
  startOffset: number;
  endOffset: number;
  line: number;
  startCharacter: number;
  endCharacter: number;
}

export interface OutputPolicyInput {
  raw: string;
  zone: AutocompleteZone;
  language: string;
  maxLines?: number;
  maxTokens?: number;
  currentLinePrefix?: string;
  prefix?: string;
}

export interface OutputPolicyResult {
  status: AutocompleteOutputStatus;
  suggestion: string;
  rejectionReason?: AutocompleteRejectionReason;
  placeholders: PlaceholderRange[];
  primaryPlaceholder?: PlaceholderRange;
  lineCount: number;
  estimatedTokens: number;
  truncatedLines: boolean;
  strippedFence: boolean;
  strippedEchoedPrefix: boolean;
}

const EXPLANATION_RE =
  /^(?:(?:here(?:'s| is)|explanation|the code|sure[,!:\s]|certainly[,!:\s]|of course[,!:\s]|below is|to solve this)\b|下面|解释|代码如下|以下是|完整代码|这道题)/i;

const CONTEXT_MARKER_RE =
  /<\/?(?:prefix|suffix|skill-policy|system|learner-tail|action-output-footer|untrusted_problem|untrusted_student_code|untrusted_student_request)>|(?:problem statement|reference answer|reference code|reference solution|standard solution|accepted code|ac code|teacher pack|标准答案|参考答案|参考代码|完整\s*ac\s*代码|题解|标程|题面)|(?:^|\n)\s*(?:#|\/\/)?\s*problem\s*:|(?:you are a student-safe|do not solve full problems|ignore problem titles|return only a short local continuation)|\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,})\b|[A-Za-z]:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/)|(?:^|[\s"'`(])\/(?:Users|home)\/[A-Za-z0-9._-]+\//i;

const FULL_SKELETON_RE =
  /(?:^|\n)\s*(?:(?:int|int32_t|signed)\s+main\s*\(|public\s+class\s+Solution\b|class\s+Solution\b|def\s+solve\s*\(|void\s+(?:dfs|bfs|solve|dijkstra)\s*\(|fn\s+(?:main|solve|dfs|bfs|dijkstra)\s*\()/;

const CONTROL_FLOW_KEYWORD_RE =
  /\b(?:if|elif|for|while|switch|match|do)\b/g;

const LOOP_KEYWORD_RE = /\b(?:for|while)\b/;

const STATE_UPDATE_RE =
  /(?:\b(?:dp|f|g|dist|dis|mid|ans|res|cnt|memo|lo|hi|low|high|left|right|best|sum|ways|cost)\b(?:\s*\[[^\]]*\])*\s*(?:<<=|>>=|[+\-*/%|&^]?=)(?!=|>)|[A-Za-z_][A-Za-z0-9_]*\s*\[[^\]]+\]\s*(?:[+\-*/%|&^]?=)(?!=|>)|\b(?:ans|cnt|res|dp|dist|sum|best)\s*(?:\+\+|--)|(?:\+\+|--)\s*(?:ans|cnt|res|cnt)\b)/;

const BLOCK_PLACEHOLDER_RE =
  /\/\*\s*((?:条件|转移|边界|状态|判断|逻辑|表达式|更新|终止条件|基例|递归|参数|步骤|todo|fill|blank|condition|transition|bound|bounds|base\s*case|state|expr|expression|update|logic|args|\.\.\.|_+)(?:[^*\r\n]{0,20})?)\s*\*\//gi;

const TOKEN_PLACEHOLDER_RE =
  /(__[A-Z0-9_\u4e00-\u9fff]{2,24}__|<(?:条件|转移|边界|状态|condition|transition|bound|expr|todo)>)/gi;

const TOKEN_SPLIT_RE =
  /[\u4e00-\u9fff]|[A-Za-z_][A-Za-z0-9_]*|[0-9]+(?:\.[0-9]+)?|[^\sA-Za-z0-9_]/g;

export function estimateTokenCount(text: string): number {
  const matches = text.match(TOKEN_SPLIT_RE);
  return matches ? matches.length : 0;
}

function getZoneLineCap(zone: AutocompleteZone): number {
  return zone === "boilerplate" || zone === "api_syntax" ? 3 : 1;
}

function getZoneTokenCap(zone: AutocompleteZone): number {
  switch (zone) {
    case "boilerplate":
      return 96;
    case "api_syntax":
      return 64;
    case "neutral":
      return 48;
    case "algo_core":
      return 32;
  }
}

function stripOuterCodeFences(raw: string): {
  text: string;
  strippedFence: boolean;
} {
  const trimmed = raw.trim();
  const fenceStart = trimmed.match(/^`{3,}[A-Za-z0-9_+#-]*[ \t]*\r?\n/);
  if (!fenceStart) {
    return { text: raw, strippedFence: false };
  }
  let inner = trimmed.slice(fenceStart[0].length);
  const fenceEnd = inner.match(/\r?\n[ \t]*`{3,}[ \t]*$/);
  if (fenceEnd && fenceEnd.index !== undefined) {
    inner = inner.slice(0, fenceEnd.index);
  } else {
    inner = inner.replace(/`{3,}[ \t]*$/, "");
  }
  return { text: inner, strippedFence: true };
}

function isEchoedControlLine(
  line: string,
  language: SupportedLanguage
): boolean {
  const trimmed = line.trimStart();
  if (/^\[(?:head|body|tail|footer)\]\s+/i.test(trimmed)) {
    return true;
  }
  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith("# [ac:") ||
    lower.startsWith("// [ac:") ||
    lower.startsWith("# skill ") ||
    lower.startsWith("// skill ")
  ) {
    return true;
  }
  if (language === "python" && lower.startsWith("# [head]")) {
    return true;
  }
  if (language !== "python" && lower.startsWith("// [head]")) {
    return true;
  }
  return false;
}

function stripEchoedPrefixFromText(
  text: string,
  currentLinePrefix: string | undefined
): { text: string; stripped: boolean } {
  if (!currentLinePrefix) {
    return { text, stripped: false };
  }

  if (text.startsWith(currentLinePrefix)) {
    return { text: text.slice(currentLinePrefix.length), stripped: true };
  }

  const trimmedLinePrefix = currentLinePrefix.trimStart();
  if (trimmedLinePrefix.length >= 2) {
    const leadingSpaces = text.length - text.trimStart().length;
    const textWithoutIndent = text.slice(leadingSpaces);
    if (textWithoutIndent.startsWith(trimmedLinePrefix)) {
      return {
        text: textWithoutIndent.slice(trimmedLinePrefix.length),
        stripped: true
      };
    }
  }

  return { text, stripped: false };
}

function maskStringsAndComments(
  code: string,
  language: SupportedLanguage
): string {
  let out = "";
  let inLineComment = false;
  let inBlockComment = false;
  let quote: string | null = null;

  for (let i = 0; i < code.length; i++) {
    const ch = code[i]!;
    const next = code[i + 1];

    if (ch === "\n") {
      inLineComment = false;
      out += "\n";
      continue;
    }
    if (inLineComment) {
      out += " ";
      continue;
    }
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        out += "  ";
        i += 1;
      } else {
        out += " ";
      }
      continue;
    }
    if (quote) {
      if (ch === "\\") {
        out += "  ";
        i += 1;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      out += " ";
      continue;
    }

    if (language === "python" && ch === "#") {
      inLineComment = true;
      out += " ";
      continue;
    }
    if (language !== "python" && ch === "/" && next === "/") {
      inLineComment = true;
      out += "  ";
      i += 1;
      continue;
    }
    if (language !== "python" && ch === "/" && next === "*") {
      inBlockComment = true;
      out += "  ";
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      out += " ";
      continue;
    }
    out += ch;
  }

  return out;
}

function limitLines(
  text: string,
  maxLines: number
): { text: string; lineCount: number; truncated: boolean } {
  const rawLines = text.replace(/\r\n/g, "\n").split("\n");

  // Drop trailing purely empty lines
  while (rawLines.length > 0 && (rawLines[rawLines.length - 1]?.trim() ?? "") === "") {
    rawLines.pop();
  }
  // Drop leading purely empty lines
  while (rawLines.length > 0 && (rawLines[0]?.trim() ?? "") === "") {
    rawLines.shift();
  }

  if (rawLines.length === 0) {
    return { text: "", lineCount: 0, truncated: false };
  }

  const truncated = rawLines.length > maxLines;
  const kept = rawLines.slice(0, maxLines);
  return {
    text: kept.join("\n"),
    lineCount: kept.length,
    truncated
  };
}

function offsetToLineChar(
  text: string,
  offset: number
): { line: number; character: number } {
  let line = 0;
  let lastLineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line += 1;
      lastLineStart = i + 1;
    }
  }
  return { line, character: offset - lastLineStart };
}

/**
 * Extracts exact UTF-16 offset & (line, character) ranges for plain-text
 * fill-in-the-blank placeholders (e.g. `/* 条件 *\/`, `/* 转移 *\/`, `__CONDITION__`).
 * Avoids VS Code SnippetString Bug #272709 so extension hosts can select the range
 * directly via a post-accept command.
 */
export function extractPlaceholderRanges(suggestion: string): PlaceholderRange[] {
  if (!suggestion) {
    return [];
  }

  const rawMatches: Array<{
    text: string;
    label: string;
    startOffset: number;
    endOffset: number;
  }> = [];

  BLOCK_PLACEHOLDER_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = BLOCK_PLACEHOLDER_RE.exec(suggestion)) !== null) {
    const full = match[0];
    const label = (match[1] ?? full).trim();
    rawMatches.push({
      text: full,
      label,
      startOffset: match.index,
      endOffset: match.index + full.length
    });
  }

  TOKEN_PLACEHOLDER_RE.lastIndex = 0;
  while ((match = TOKEN_PLACEHOLDER_RE.exec(suggestion)) !== null) {
    const full = match[0];
    const startOffset = match.index;
    const endOffset = startOffset + full.length;
    const overlapsExisting = rawMatches.some(
      (existing) =>
        startOffset < existing.endOffset && endOffset > existing.startOffset
    );
    if (overlapsExisting) {
      continue;
    }
    const label = full.replace(/^__|__$|^<|>$/g, "").trim();
    rawMatches.push({
      text: full,
      label,
      startOffset,
      endOffset
    });
  }

  rawMatches.sort((a, b) => a.startOffset - b.startOffset);

  return rawMatches.map((item) => {
    const startPos = offsetToLineChar(suggestion, item.startOffset);
    const endPos = offsetToLineChar(suggestion, item.endOffset);
    return {
      text: item.text,
      label: item.label,
      startOffset: item.startOffset,
      endOffset: item.endOffset,
      line: startPos.line,
      startCharacter: startPos.character,
      endCharacter: endPos.character
    };
  });
}

function rejectResult(
  rejectionReason: AutocompleteRejectionReason,
  flags: { strippedFence: boolean; strippedEchoedPrefix: boolean }
): OutputPolicyResult {
  return {
    status: "rejected",
    suggestion: "",
    rejectionReason,
    placeholders: [],
    lineCount: 0,
    estimatedTokens: 0,
    truncatedLines: false,
    strippedFence: flags.strippedFence,
    strippedEchoedPrefix: flags.strippedEchoedPrefix
  };
}

export function evaluateAutocompleteOutput(
  input: OutputPolicyInput
): OutputPolicyResult {
  const language = normalizeLanguage(input.language);

  if (!input.raw || !input.raw.trim()) {
    return {
      status: "model-empty",
      suggestion: "",
      placeholders: [],
      lineCount: 0,
      estimatedTokens: 0,
      truncatedLines: false,
      strippedFence: false,
      strippedEchoedPrefix: false
    };
  }

  if (EXPLANATION_RE.test(input.raw.trimStart())) {
    return rejectResult("explanation", {
      strippedFence: false,
      strippedEchoedPrefix: false
    });
  }

  if (CONTEXT_MARKER_RE.test(input.raw)) {
    return rejectResult("context-marker", {
      strippedFence: false,
      strippedEchoedPrefix: false
    });
  }

  // Strip outer markdown code fences
  const fenceStep = stripOuterCodeFences(input.raw);
  const strippedFence = fenceStep.strippedFence;

  // Filter echoed preamble / control lines
  const withoutControlLines = fenceStep.text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => !isEchoedControlLine(line, language))
    .join("\n");

  // Re-check explanation chatter inside stripped text
  if (EXPLANATION_RE.test(withoutControlLines.trimStart())) {
    return rejectResult("explanation", {
      strippedFence,
      strippedEchoedPrefix: false
    });
  }

  // Strip echoed current-line prefix
  const derivedLinePrefix =
    input.currentLinePrefix ??
    (input.prefix !== undefined
      ? input.prefix.slice(input.prefix.lastIndexOf("\n") + 1)
      : undefined);

  const prefixStep = stripEchoedPrefixFromText(
    withoutControlLines,
    derivedLinePrefix
  );
  const strippedEchoedPrefix = prefixStep.stripped;
  const candidate = prefixStep.text;

  if (!candidate.trim()) {
    return rejectResult("empty-after-filter", {
      strippedFence,
      strippedEchoedPrefix
    });
  }

  // Anti-spoiler complexity gates in Neutral and Red (algo_core) zones
  if (input.zone === "neutral" || input.zone === "algo_core") {
    const maskedCandidate = maskStringsAndComments(candidate, language);

    if (FULL_SKELETON_RE.test(maskedCandidate)) {
      return rejectResult("full-skeleton-rejected", {
        strippedFence,
        strippedEchoedPrefix
      });
    }

    const controlMatches = maskedCandidate.match(CONTROL_FLOW_KEYWORD_RE);
    if (controlMatches && controlMatches.length >= 2) {
      return rejectResult("neutral-nested-control-flow", {
        strippedFence,
        strippedEchoedPrefix
      });
    }

    if (
      LOOP_KEYWORD_RE.test(maskedCandidate) &&
      STATE_UPDATE_RE.test(maskedCandidate)
    ) {
      return rejectResult("neutral-loop-state-update", {
        strippedFence,
        strippedEchoedPrefix
      });
    }
  }

  const effectiveMaxLines = Math.min(
    input.maxLines ?? getZoneLineCap(input.zone),
    getZoneLineCap(input.zone)
  );
  const effectiveMaxTokens = Math.min(
    input.maxTokens ?? getZoneTokenCap(input.zone),
    getZoneTokenCap(input.zone)
  );

  const limited = limitLines(candidate, effectiveMaxLines);
  if (!limited.text.trim()) {
    return rejectResult("empty-after-filter", {
      strippedFence,
      strippedEchoedPrefix
    });
  }

  const estimatedTokens = estimateTokenCount(limited.text);
  if (
    (input.zone === "neutral" || input.zone === "algo_core") &&
    estimatedTokens > effectiveMaxTokens
  ) {
    return rejectResult("token-budget-exceeded", {
      strippedFence,
      strippedEchoedPrefix
    });
  }

  const placeholders = extractPlaceholderRanges(limited.text);

  return {
    status: "accepted",
    suggestion: limited.text,
    placeholders,
    primaryPlaceholder: placeholders[0],
    lineCount: limited.lineCount,
    estimatedTokens,
    truncatedLines: limited.truncated,
    strippedFence,
    strippedEchoedPrefix
  };
}
