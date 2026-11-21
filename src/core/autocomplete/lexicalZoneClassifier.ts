import type { AutocompleteZone, LexicalZoneResult, SupportedLanguage } from "../contracts";
import { normalizeLanguage } from "../contextProjection";

export interface LexicalZoneInput {
  language: string;
  prefix: string;
  suffix: string;
  activeFunctionName?: string;
}

interface BracketFrame {
  ch: "(" | "[" | "{";
  lineIndex: number;
  controlKeyword?: "if" | "while" | "elif" | "for";
  semicolonCount: number;
  calleeName?: string;
}

interface ScannedLine {
  raw: string;
  code: string;
  indent: number;
  isBlank: boolean;
  isNaturalComment: boolean;
  functionDeclName?: string;
}

interface ScanSnapshot {
  lines: ScannedLine[];
  stack: BracketFrame[];
  inLineComment: boolean;
  inBlockComment: boolean;
  inString: boolean;
  enclosingFunctionName?: string;
}

const MAX_SCAN_CHARS = 16_000;

const ZONE_LIMITS: Record<
  AutocompleteZone,
  { spoilerRisk: "low" | "high"; maxLines: number; maxTokens: number }
> = {
  boilerplate: { spoilerRisk: "low", maxLines: 3, maxTokens: 96 },
  api_syntax: { spoilerRisk: "low", maxLines: 3, maxTokens: 64 },
  neutral: { spoilerRisk: "low", maxLines: 1, maxTokens: 48 },
  algo_core: { spoilerRisk: "high", maxLines: 1, maxTokens: 32 }
};

const ALGO_FN_RE =
  /^(?:dfs|bfs|dijkstra|binary_search|binarySearch|bsearch|lca|kmp|check|solve|dp|tarjan|floyd|bellman|spfa|kruskal|prim|toposort|topo_sort|union_find|merge_sort|quick_sort|mergesort|quicksort|backtrack|knapsack|trie_insert|trie_search|segtree|fenwick)(?:_[A-Za-z0-9]+|[A-Z][A-Za-z0-9]*)?$/i;

const CONTROL_KW = new Set([
  "if", "while", "elif", "for", "switch", "catch", "else", "return", "sizeof", "match"
]);

const STATE_ASSIGN_RE =
  /(?:^|[\s,({])(?:(?:const|let|mut|var|auto|int|long|unsigned|signed|short|double|float|size_t|int64_t|int32_t|ll|i32|i64|usize)\s+)*(?:dp|f|g|dist|dis|mid|ans|res|cnt|memo|lo|hi|low|high)(?:\s*\[[^\]]*\])*\s*(?:<<=|>>=|[+\-*/%|&^]?=)(?!=|>)\s*[^;]*$/;

const TOP_BOILERPLATE_RE =
  /^\s*(?:#\s*(?:include|define|pragma|ifdef|ifndef|elif|else|endif|undef)\b|using\s+namespace\b|using\s+[A-Za-z_][A-Za-z0-9_]*\s*=|typedef\s+|import\s+|from\s+[A-Za-z0-9_.]+\s+import\b|use\s+std::|#!?\s*\[|package\s+[A-Za-z0-9_.]+|public\s+class\s+Main\b)/;

const PREAMBLE_CONST_RE =
  /^\s*(?:constexpr|const|static\s+final)\s+(?:unsigned\s+|long\s+|int|int64_t|ll|usize|i64|double)\s+(?:MOD|INF|MAXN|N|M|EPS|PI)\b/;

const FAST_IO_RE =
  /\b(?:ios(?:_base)?::sync_with_stdio|cin\.tie|cout\.tie|freopen|sys\.stdin(?:\.buffer)?\.(?:readline|read)|input\s*=\s*sys\.stdin|sys\.stdout\.write|sys\.setrecursionlimit|io::stdin\s*\(|BufReader|BufWriter|BufferedReader|InputStreamReader|StringTokenizer|PrintWriter|new\s+Scanner\s*\()/;

const MAIN_ENTRY_RE =
  /^\s*(?:(?:int|int32_t|signed)\s+main\s*\(|fn\s+main\s*\(|public\s+static\s+void\s+main\s*\(|if\s+__name__\s*==\s*['"]__main__['"]\s*:)/;

const BASIC_IO_RE =
  /\b(?:cin\s*>>|cout\s*<<|scanf\s*\(|printf\s*\(|getline\s*\(|int\s*\(\s*input\s*\(|map\s*\(\s*int\s*,\s*input|list\s*\(\s*map\s*\(|nextInt\s*\(|nextLong\s*\(|read_line\s*\(|split_whitespace\s*\()/;

const MEMBER_ACCESS_RE = /(?:[A-Za-z0-9_)\]>])(?:\.|->|::)[A-Za-z0-9_]*$/;

const CONTAINER_DECL_RE =
  /\b(?:vector|unordered_map|unordered_set|priority_queue|pair|deque|queue|stack|map|set|multiset|array|tuple|bitset|Vec|VecDeque|HashMap|HashSet|BTreeMap|BTreeSet|BinaryHeap|ArrayList|PriorityQueue|ArrayDeque|TreeMap|TreeSet|StringBuilder|defaultdict|Counter)\s*[<(]/;

const NON_NATURAL_RE = /^[\s/*#\-=_~+|<>:;.()[\]{}]*$/;

function isRustLifetime(text: string, idx: number): boolean {
  const next = text[idx + 1];
  return Boolean(next && /[A-Za-z_]/.test(next) && text[idx + 2] !== "'");
}

function identBeforeParen(lineCode: string): {
  controlKeyword?: "if" | "while" | "elif" | "for";
  calleeName?: string;
} {
  const ident = lineCode.trimEnd().match(/([A-Za-z_][A-Za-z0-9_]*)$/)?.[1];
  if (!ident) return {};
  if (ident === "if" || ident === "while" || ident === "elif" || ident === "for") {
    return { controlKeyword: ident };
  }
  return CONTROL_KW.has(ident) ? {} : { calleeName: ident };
}

function detectFunctionDeclName(
  code: string,
  language: SupportedLanguage
): string | undefined {
  const trimmed = code.trim();
  if (!trimmed) return undefined;
  if (language === "python") {
    return trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/)?.[1];
  }
  if (language === "rust") {
    return trimmed.match(
      /^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?(?:unsafe\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)\s*[<(]/
    )?.[1];
  }
  if (language === "cpp") {
    const lam = trimmed.match(
      /^(?:(?:const|auto|std::function\s*<[^>]+>|function\s*<[^>]+>)\s+)+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\[[^\]]*\]\s*\(/
    )?.[1];
    if (lam && !CONTROL_KW.has(lam)) return lam;
  }
  if (trimmed.includes(";")) return undefined;
  const name = trimmed.match(
    /^(?:(?:public|private|protected|static|final|inline|virtual|constexpr|extern|template\s*<[^>]+>|unsigned|signed|long|short|const|struct|class|void|int|int32_t|int64_t|size_t|double|float|bool|boolean|char|auto|string|String|ll|[A-Za-z_][A-Za-z0-9_:<>[\],\s*&]*?)\s+)([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*(?:const\s*)?(?:noexcept\s*)?(?:throws\s+[A-Za-z0-9_,\s]+)?\{?\s*$/
  )?.[1];
  return name && !CONTROL_KW.has(name) ? name : undefined;
}

function isNaturalCommentText(rawLine: string, language: SupportedLanguage): boolean {
  const trimmed = rawLine.trim();
  if (!trimmed) return false;
  if (language === "python") {
    if (!trimmed.startsWith("#") || trimmed.startsWith("#!")) return false;
    const body = trimmed.slice(1).trim();
    return body.length > 0 && !NON_NATURAL_RE.test(body);
  }
  if (trimmed.startsWith("//")) {
    const body = trimmed.slice(2).trim();
    return body.length > 0 && !NON_NATURAL_RE.test(body);
  }
  if (trimmed.startsWith("/*")) {
    const body = trimmed.replace(/^\/\*/, "").replace(/\*\/$/, "").trim();
    return body.length > 0 && !NON_NATURAL_RE.test(body);
  }
  return false;
}

function scanPrefix(prefix: string, language: SupportedLanguage): ScanSnapshot {
  let slice = prefix;
  if (slice.length > MAX_SCAN_CHARS) {
    const cut = slice.length - MAX_SCAN_CHARS;
    const nl = slice.indexOf("\n", cut);
    slice = nl >= 0 ? slice.slice(nl + 1) : slice.slice(cut);
  }

  const lines: ScannedLine[] = [];
  const stack: BracketFrame[] = [];
  const fnStack: Array<{ name: string; depth: number }> = [];
  let pendingFn: string | undefined;
  let inLineComment = false;
  let inBlockComment = false;
  let stringQuote: string | null = null;
  let tripleQuote: string | null = null;
  let braceDepth = 0;
  let lineStart = 0;
  let lineIndex = 0;
  let lineCode = "";
  let hadComment = false;

  const flushLine = (rawLine: string) => {
    const indent = rawLine.length - rawLine.trimStart().length;
    const trimmedCode = lineCode.trim();
    const isBlank = rawLine.trim().length === 0;
    const isNaturalComment =
      trimmedCode.length === 0 &&
      (isNaturalCommentText(rawLine, language) ||
        (hadComment && !NON_NATURAL_RE.test(rawLine)));
    const fnName = detectFunctionDeclName(lineCode, language);

    if (fnName && language !== "python") {
      if (lineCode.includes("{")) {
        fnStack.push({ name: fnName, depth: braceDepth });
      } else {
        pendingFn = fnName;
      }
    } else if (pendingFn && trimmedCode === "{") {
      fnStack.push({ name: pendingFn, depth: braceDepth });
      pendingFn = undefined;
    } else if (trimmedCode.length > 0) {
      pendingFn = undefined;
    }

    lines.push({
      raw: rawLine,
      code: lineCode,
      indent,
      isBlank,
      isNaturalComment,
      functionDeclName: fnName
    });
  };

  for (let i = 0; i < slice.length; i++) {
    const ch = slice[i]!;
    const next = slice[i + 1];

    if (ch === "\n") {
      flushLine(slice.slice(lineStart, i).replace(/\r$/, ""));
      lineStart = i + 1;
      lineIndex += 1;
      lineCode = "";
      inLineComment = false;
      hadComment = inBlockComment;
      continue;
    }
    if (inLineComment) continue;
    if (inBlockComment) {
      if (ch === "*" && next === "/") {
        inBlockComment = false;
        i += 1;
      }
      continue;
    }
    if (tripleQuote) {
      if (ch === tripleQuote[0] && next === tripleQuote[0] && slice[i + 2] === tripleQuote[0]) {
        tripleQuote = null;
        i += 2;
      }
      continue;
    }
    if (stringQuote) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === stringQuote) stringQuote = null;
      continue;
    }

    if (language === "python" && ch === "#") {
      inLineComment = true;
      hadComment = true;
      continue;
    }
    if (language !== "python" && ch === "/" && next === "/") {
      inLineComment = true;
      hadComment = true;
      i += 1;
      continue;
    }
    if (language !== "python" && ch === "/" && next === "*") {
      inBlockComment = true;
      hadComment = true;
      i += 1;
      continue;
    }

    if (language === "python" && (ch === '"' || ch === "'") && next === ch && slice[i + 2] === ch) {
      tripleQuote = ch.repeat(3);
      lineCode += " ";
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "`") {
      stringQuote = ch;
      lineCode += " ";
      continue;
    }
    if (ch === "'") {
      if (language === "rust" && isRustLifetime(slice, i)) {
        lineCode += ch;
        continue;
      }
      stringQuote = "'";
      lineCode += " ";
      continue;
    }

    if (ch === "(") {
      const meta = identBeforeParen(lineCode);
      stack.push({
        ch: "(",
        lineIndex,
        controlKeyword: meta.controlKeyword,
        semicolonCount: 0,
        calleeName: meta.calleeName
      });
    } else if (ch === "[") {
      stack.push({ ch: "[", lineIndex, semicolonCount: 0 });
    } else if (ch === "{") {
      braceDepth += 1;
      stack.push({ ch: "{", lineIndex, semicolonCount: 0 });
    } else if (ch === ";") {
      const top = stack[stack.length - 1];
      if (top && top.ch === "(" && top.controlKeyword === "for") {
        top.semicolonCount += 1;
      }
    } else if (ch === ")" || ch === "]" || ch === "}") {
      const expected = ch === ")" ? "(" : ch === "]" ? "[" : "{";
      for (let j = stack.length - 1; j >= 0; j--) {
        if (stack[j]?.ch === expected) {
          stack.splice(j);
          break;
        }
      }
      if (ch === "}") {
        braceDepth = Math.max(0, braceDepth - 1);
        while (fnStack.length > 0 && (fnStack[fnStack.length - 1]?.depth ?? 0) > braceDepth) {
          fnStack.pop();
        }
      }
    }

    lineCode += ch;
  }

  flushLine(slice.slice(lineStart).replace(/\r$/, ""));

  let enclosingFunctionName: string | undefined;
  if (language === "python") {
    const cur = lines[lines.length - 1];
    const curIndent = cur ? (cur.isBlank ? cur.raw.length : cur.indent) : 0;
    for (let idx = lines.length - 2; idx >= 0; idx--) {
      const line = lines[idx];
      if (!line || line.isBlank || line.isNaturalComment) continue;
      if (line.functionDeclName && (line.indent < curIndent || idx === lines.length - 2)) {
        enclosingFunctionName = line.functionDeclName;
        break;
      }
      if (line.indent === 0 && !line.functionDeclName) break;
    }
  } else {
    enclosingFunctionName = fnStack[fnStack.length - 1]?.name;
  }

  return {
    lines,
    stack,
    inLineComment,
    inBlockComment,
    inString: stringQuote !== null || tripleQuote !== null,
    enclosingFunctionName
  };
}

function findPrevNonBlank(
  lines: readonly ScannedLine[],
  fromIndex: number
): { line: ScannedLine; index: number; blankGap: number } | undefined {
  let blankGap = 0;
  for (let i = fromIndex; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;
    if (line.isBlank) {
      blankGap += 1;
      continue;
    }
    return { line, index: i, blankGap };
  }
  return undefined;
}

function isAlgoFn(name: string | undefined): boolean {
  return Boolean(name && name !== "main" && ALGO_FN_RE.test(name));
}

function makeResult(zone: AutocompleteZone, reason: string): LexicalZoneResult {
  const limits = ZONE_LIMITS[zone];
  return { zone, reason, ...limits };
}

export function classifyLexicalZone(input: LexicalZoneInput): LexicalZoneResult {
  const language = normalizeLanguage(input.language);
  const snap = scanPrefix(input.prefix, language);
  const curIdx = snap.lines.length - 1;
  const cur = snap.lines[curIdx];
  const rawCur = cur?.raw ?? "";
  const codeCur = cur?.code ?? "";
  const trimmedCode = codeCur.trim();
  const stmt = codeCur.includes(";") ? codeCur.slice(codeCur.lastIndexOf(";") + 1) : codeCur;
  const trimmedStmt = stmt.trim();
  const enclosingFn = input.activeFunctionName?.trim() || snap.enclosingFunctionName;
  const prev = findPrevNonBlank(snap.lines, curIdx - 1);

  // Step A: Unambiguous top-level boilerplate on the current line
  if (!snap.inLineComment && !snap.inBlockComment && !snap.inString) {
    if (TOP_BOILERPLATE_RE.test(rawCur)) return makeResult("boilerplate", "header-or-import-directive");
    if (PREAMBLE_CONST_RE.test(rawCur)) return makeResult("boilerplate", "competition-preamble-const");
    if (FAST_IO_RE.test(codeCur)) return makeResult("boilerplate", "fast-io-setup");
    if (MAIN_ENTRY_RE.test(rawCur)) return makeResult("boilerplate", "main-entrypoint");
  }

  // Step B: High-spoiler Red Zone (algo_core)
  if (snap.inLineComment || snap.inBlockComment) {
    return makeResult("algo_core", "inside-comment-anti-shepherding");
  }

  if (enclosingFn && enclosingFn !== "main") {
    for (let i = snap.stack.length - 1; i >= 0; i--) {
      const f = snap.stack[i];
      if (f?.ch === "(" && f.calleeName === enclosingFn) {
        return makeResult("algo_core", "recursive-call-args");
      }
    }
  }

  for (let i = snap.stack.length - 1; i >= 0; i--) {
    const f = snap.stack[i];
    if (f?.ch !== "(" || !f.controlKeyword) continue;
    if (f.controlKeyword !== "for" || f.semicolonCount >= 1) {
      return makeResult("algo_core", "control-flow-condition");
    }
  }

  if (
    /^\s*(?:else\s+)?(?:if|elif|while)\b/.test(trimmedStmt) &&
    !trimmedStmt.includes("{") &&
    !(language === "python" && trimmedStmt.endsWith(":"))
  ) {
    return makeResult("algo_core", "control-flow-condition");
  }

  if (trimmedStmt.length > 0 && STATE_ASSIGN_RE.test(stmt)) {
    return makeResult("algo_core", "state-variable-assignment");
  }

  if (prev && prev.line.isNaturalComment && prev.blankGap <= 1 && !codeCur.includes(";")) {
    return makeResult("algo_core", "after-natural-language-comment");
  }

  if (prev && prev.blankGap <= 1 && !codeCur.includes(";")) {
    let sigLine: ScannedLine | undefined = prev.line;
    if (prev.line.code.trim() === "{") {
      const beforeBrace = findPrevNonBlank(snap.lines, prev.index - 1);
      if (beforeBrace && beforeBrace.blankGap <= 1) sigLine = beforeBrace.line;
    }
    if (isAlgoFn(sigLine?.functionDeclName)) {
      return makeResult("algo_core", "after-algo-function-signature");
    }
    if (
      isAlgoFn(enclosingFn) &&
      sigLine?.functionDeclName !== undefined &&
      (sigLine.code.trim().endsWith("{") || (language === "python" && sigLine.code.trim().endsWith(":")))
    ) {
      return makeResult("algo_core", "after-algo-function-signature");
    }
  }

  if (isAlgoFn(enclosingFn) && /^return\b(?:\s|$)/.test(trimmedStmt)) {
    return makeResult("algo_core", "algo-return-expression");
  }

  // Step C: Green Zone — Boilerplate
  if (BASIC_IO_RE.test(stmt)) return makeResult("boilerplate", "basic-io-statement");

  if (prev && prev.blankGap <= 1) {
    if (MAIN_ENTRY_RE.test(prev.line.raw) || prev.line.functionDeclName === "main") {
      return makeResult("boilerplate", "main-body-setup");
    }
    if (
      enclosingFn === "main" &&
      trimmedCode.length === 0 &&
      (FAST_IO_RE.test(prev.line.code) || BASIC_IO_RE.test(prev.line.code))
    ) {
      return makeResult("boilerplate", "main-io-continuation");
    }
    if (
      (enclosingFn === "main" || enclosingFn === undefined) &&
      /^\s*(?:for|while)\b/.test(prev.line.code) &&
      (prev.line.code.trim().endsWith("{") || prev.line.code.trim().endsWith(":")) &&
      trimmedCode.length === 0
    ) {
      const hasPriorInput = snap.lines
        .slice(Math.max(0, prev.index - 6), prev.index)
        .some((l) => BASIC_IO_RE.test(l.code) || FAST_IO_RE.test(l.code));
      if (hasPriorInput) return makeResult("boilerplate", "basic-input-loop");
    }
  }

  // Step D: Green Zone — API & Syntax
  if (MEMBER_ACCESS_RE.test(stmt)) return makeResult("api_syntax", "member-or-scope-access");
  if (CONTAINER_DECL_RE.test(stmt)) return makeResult("api_syntax", "container-declaration");

  const hasOpenDelim = snap.stack.some(
    (f) => f.lineIndex === curIdx && (f.ch === "(" || f.ch === "[")
  );
  const sameLineSuffixCloser = /^[ \t]*[)\]>]/.test(input.suffix);
  const endsWithAssignOp = /(?:^|[^=!<>])=\s*$/.test(trimmedStmt);
  if (
    trimmedStmt.length > 0 &&
    !endsWithAssignOp &&
    (hasOpenDelim ||
      (sameLineSuffixCloser && !/[A-Za-z0-9_]/.test(trimmedStmt.slice(-1))))
  ) {
    return makeResult("api_syntax", "bracket-or-delimiter-closure");
  }

  // Step E: Neutral Zone
  return makeResult("neutral", "neutral-statement");
}
