import type {
  HintLevel,
  LocalRunResult,
  OfficialVerdictEvent,
  ProblemSample,
  StylishRankLetter,
  StylishRankMeta,
  StylishRankState
} from "../core/contracts";

export const STYLISH_RANK_ORDER: readonly StylishRankLetter[] = [
  "D",
  "C",
  "B",
  "A",
  "S",
  "SS",
  "SSS"
] as const;

export const STYLISH_RANK_TABLE: Readonly<Record<StylishRankLetter, StylishRankMeta>> = {
  D: {
    rank: "D",
    codeName: "Draft",
    zhName: "起草",
    minScore: 0,
    maxScore: 119,
    statusBarLabel: "D · Draft"
  },
  C: {
    rank: "C",
    codeName: "Clean",
    zhName: "净码",
    minScore: 120,
    maxScore: 249,
    statusBarLabel: "C · Clean"
  },
  B: {
    rank: "B",
    codeName: "Built",
    zhName: "成型",
    minScore: 250,
    maxScore: 399,
    statusBarLabel: "B · Built"
  },
  A: {
    rank: "A",
    codeName: "Assert",
    zhName: "破题",
    minScore: 400,
    maxScore: 579,
    statusBarLabel: "A · Assert"
  },
  S: {
    rank: "S",
    codeName: "Sharp",
    zhName: "锋芒",
    minScore: 580,
    maxScore: 749,
    statusBarLabel: "S · Sharp"
  },
  SS: {
    rank: "SS",
    codeName: "Surgical",
    zhName: "精准",
    minScore: 750,
    maxScore: 899,
    statusBarLabel: "SS · Surgical"
  },
  SSS: {
    rank: "SSS",
    codeName: "Spotless",
    zhName: "无瑕",
    minScore: 900,
    maxScore: 1000,
    statusBarLabel: "SSS · Spotless"
  }
};

export const STYLISH_SCORE_MAX = 1000;
export const PRE_SAMPLE_SCORE_CAP = 399;

const HAND_TYPED_LINE_POINTS = 18;
const HAND_TYPED_SCORE_CAP = 360;
const WORD_ACCEPT_POINTS = 8;
const WORD_ACCEPT_SCORE_CAP = 64;
const MICRO_FRICTION_CORRECT_POINTS = 45;
const MICRO_FRICTION_SCORE_CAP = 135;

const MILESTONE_PARTIAL_PASS_POINTS = 150;
const MILESTONE_ALL_ORIGINAL_PASS_POINTS = 250;
const MILESTONE_FIRST_TRY_CLEAN_BONUS_POINTS = 80;
const MILESTONE_CUSTOM_EDGE_POINTS = 70;
const MILESTONE_CUSTOM_EDGE_MAX_COUNT = 2;
const MILESTONE_VERIFIED_SOLVE_POINTS = 160;

const BLIND_TAB_PENALTY = 120;
const BLIND_TAB_FAST_THRESHOLD_MS = 450;
const BLIND_TAB_MIN_CHARS = 16;
const BLIND_TAB_MIN_LINES = 2;
const BLIND_TAB_DRIFT_WINDOW_MS = 15_000;
const BLIND_TAB_DRIFT_COUNT = 3;

const MICRO_FRICTION_WRONG_PENALTY = 60;

const SHOTGUN_WINDOW_MS = 60_000;
const SHOTGUN_FAIL_COUNT = 3;
const SHOTGUN_MAX_DIFF_CHARS = 5;
const SHOTGUN_PENALTY = 80;
const SHOTGUN_FREEZE_MS = 30_000;

const PASTE_SINGLE_MIN_LINES = 6;
const PASTE_SINGLE_MIN_CHARS = 180;
const PASTE_RATIO_THRESHOLD = 0.35;
const PASTE_RATIO_MIN_PASTED_CHARS = 15;
const PASTE_CAP_PENALTY = 100;

const DECAY_GRACE_MS = 90_000;
const DECAY_INTERVAL_MS = 30_000;
const DECAY_STEP_POINTS = 15;

export type StylishMilestoneId =
  | "MILESTONE_PARTIAL_PASS"
  | "MILESTONE_ALL_ORIGINAL_PASS"
  | "MILESTONE_FIRST_TRY_CLEAN_BONUS"
  | "MILESTONE_CUSTOM_EDGE_PASS"
  | "MILESTONE_VERIFIED_SOLVE";

export type StylishPenaltyKind =
  | "blind_tab"
  | "micro_friction_wrong"
  | "shotgun_run"
  | "paste_cap";

export interface StylishRankTransition {
  previousRank: StylishRankLetter;
  currentRank: StylishRankLetter;
  rankChanged: boolean;
  promoted: boolean;
  demoted: boolean;
  scoreDelta: number;
  penaltyTriggered?: StylishPenaltyKind;
  milestonesAwarded: StylishMilestoneId[];
  state: StylishRankState;
}

export interface StylishRankEngineOptions {
  problemKey: string;
  /** Canonical read-only original samples used to enforce Original Sample Integrity. */
  originalSamples?: readonly ProblemSample[];
  /** True for offline/warmup/read-only problems that allow SSS via verified offline solve. */
  isOfflineOrReadOnly?: boolean;
  now?: () => number;
}

export interface HandTypedLinesInput {
  lines: readonly string[];
  lspErrorCount: number;
  nowMs?: number;
}

export interface GhostTextAcceptInput {
  text: string;
  shownAtMs: number;
  acceptedAtMs?: number;
  mode: "full" | "word";
  hadManualEditSinceLastAccept?: boolean;
}

export interface PasteEventInput {
  text: string;
  /** Defaults to true (inside solution area). Set false for top-level header/template area. */
  inSolutionBody?: boolean;
  source?: "user" | "plugin_stub" | "undo_redo";
  /** Optional total solution area character count after this paste for ratio evaluation. */
  totalSolutionChars?: number;
  nowMs?: number;
}

export interface LocalRunInputOptions {
  sourceCode?: string;
  /** Optional explicit net char change relative to previous failed run. */
  codeNetChangeChars?: number;
  /** Optional explicit flag if caller already detected original sample modification. */
  originalSamplesTampered?: boolean;
  nowMs?: number;
}

const TOKEN_RE =
  /[A-Za-z_]\w*|\d+(?:\.\d+)?|==|!=|<=|>=|&&|\|\||->|::|<<|>>|\+=|-=|\*=|\/=|[+\-*/%=<>!&|^~()[\]{},;:.]/g;
const IDENT_OR_LITERAL_RE = /[A-Za-z_]\w*|\d+/;

export function rankToIndex(rank: StylishRankLetter): number {
  return STYLISH_RANK_ORDER.indexOf(rank);
}

export function compareStylishRank(a: StylishRankLetter, b: StylishRankLetter): number {
  return rankToIndex(a) - rankToIndex(b);
}

export function minStylishRank(...ranks: StylishRankLetter[]): StylishRankLetter {
  let lowest: StylishRankLetter = "SSS";
  for (const r of ranks) {
    if (rankToIndex(r) < rankToIndex(lowest)) {
      lowest = r;
    }
  }
  return lowest;
}

export function getStylishRankMeta(rank: StylishRankLetter): StylishRankMeta {
  return STYLISH_RANK_TABLE[rank];
}

export function rankFromScore(score: number): StylishRankLetter {
  const clamped = Math.max(0, Math.min(STYLISH_SCORE_MAX, Math.floor(score)));
  if (clamped >= 900) return "SSS";
  if (clamped >= 750) return "SS";
  if (clamped >= 580) return "S";
  if (clamped >= 400) return "A";
  if (clamped >= 250) return "B";
  if (clamped >= 120) return "C";
  return "D";
}

export function hintCeilingForLevel(level: HintLevel): StylishRankLetter {
  switch (level) {
    case 0:
      return "SSS";
    case 1:
    case 2:
      return "SS";
    case 3:
      return "A";
    case 4:
      return "B";
    case 5:
      return "C";
  }
}

export function countLexicalTokens(line: string): number {
  const matches = line.match(TOKEN_RE);
  return matches ? matches.length : 0;
}

function isPureCommentLine(trimmed: string): boolean {
  return (
    trimmed.startsWith("//") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith("*/") ||
    trimmed.startsWith("--")
  );
}

/**
 * Valid hand-typed solution line predicate per Neon #16:
 * non-empty, not pure comment, >= 6 non-whitespace chars, >= 2 lexical tokens
 * (with at least 1 identifier or literal to block pure punctuation spam).
 */
export function isValidCodingLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0 || isPureCommentLine(trimmed)) {
    return false;
  }
  const stripped = trimmed.replace(/\s+/g, "");
  if (stripped.length < 6) {
    return false;
  }
  if (!IDENT_OR_LITERAL_RE.test(trimmed)) {
    return false;
  }
  return countLexicalTokens(trimmed) >= 2;
}

function normalizeSampleText(value: string | undefined): string {
  return (value ?? "").replace(/\r\n/g, "\n").trim();
}

/**
 * Computes edit span (max of removed/inserted chars outside shared prefix and suffix).
 */
export function computeCodeNetChangeChars(prevCode: string, nextCode: string): number {
  if (prevCode === nextCode) {
    return 0;
  }
  let prefix = 0;
  const minLen = Math.min(prevCode.length, nextCode.length);
  while (prefix < minLen && prevCode.charCodeAt(prefix) === nextCode.charCodeAt(prefix)) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < minLen - prefix &&
    prevCode.charCodeAt(prevCode.length - 1 - suffix) ===
      nextCode.charCodeAt(nextCode.length - 1 - suffix)
  ) {
    suffix += 1;
  }
  const removed = prevCode.length - prefix - suffix;
  const inserted = nextCode.length - prefix - suffix;
  return Math.max(removed, inserted);
}

const HEADER_DIRECTIVE_LINE_RE =
  /^(?:#(?:include|define|pragma|ifdef|ifndef|endif|undef)\b|import\b|from\s+[\w.]+\s+import\b|use\s+std::|using\s+(?:namespace\s+[\w:]+|[\w]+\s*=)|typedef\b|(?:static\s+)?(?:constexpr|const)\s+(?:unsigned\s+|signed\s+)?(?:int|long|short|double|float|ll|ull|i64|u64|usize|auto)\b|(?:ios|ios_base)::sync_with_stdio\b|cin\.tie\b|cout\.tie\b|sys\.setrecursionlimit\b|input\s*=\s*sys\.stdin\.readline\b|package\s+[\w.]+\s*;)/;

const FAST_IO_HEADER_RE =
  /^(?:(?:static\s+|inline\s+|template\s*<[^>]+>\s*)*(?:void|int|long\s+long|ll|uint64_t|int64_t|T|auto)\s+(?:read|fast_?read|read_?int|read_?ll|write|fast_?write)\s*\(|(?:struct|class)\s+(?:FastIO|FastScanner|FastReader|Scanner)\b|def\s+(?:fast_?input|read_?ints|read_?int|fast_?read)\s*\()/i;

const ALGO_SOLVE_MARKER_RE =
  /\b(?:class\s+Solution|def\s+solve|twoSum|dijkstra|bellman|floyd|kruskal|binary_?search|lower_?bound_?custom)\b/;

/**
 * Recognizes competitive programming header/import/using/typedef/fast-IO template blocks
 * eligible for pre-first-run top-level paste exemption.
 */
export function isHeaderOrFastIoTemplate(text: string): boolean {
  const rawLines = text.split(/\r?\n/);
  const nonEmptyLines = rawLines.map((l) => l.trim()).filter((l) => l.length > 0);
  if (nonEmptyLines.length === 0) {
    return false;
  }
  if (ALGO_SOLVE_MARKER_RE.test(text)) {
    return false;
  }

  let braceDepth = 0;
  let inFastIoBlock = false;
  let fastIoBlockIndent: number | null = null;
  let sawTemplateDirective = false;

  for (const rawLine of rawLines) {
    const trimmed = rawLine.trim();
    if (trimmed.length === 0) {
      continue;
    }

    if (
      trimmed.startsWith("//") ||
      trimmed.startsWith("/*") ||
      trimmed.startsWith("*") ||
      trimmed.startsWith("*/") ||
      (trimmed.startsWith("#") && !HEADER_DIRECTIVE_LINE_RE.test(trimmed))
    ) {
      continue;
    }

    // Python fast-IO indented helper body
    if (fastIoBlockIndent !== null) {
      const currentIndent = rawLine.length - rawLine.trimStart().length;
      if (currentIndent > fastIoBlockIndent) {
        continue;
      }
      fastIoBlockIndent = null;
    }

    if (inFastIoBlock) {
      for (const ch of trimmed) {
        if (ch === "{") braceDepth += 1;
        if (ch === "}") braceDepth -= 1;
      }
      if (braceDepth <= 0) {
        inFastIoBlock = false;
        braceDepth = 0;
      }
      continue;
    }

    if (HEADER_DIRECTIVE_LINE_RE.test(trimmed)) {
      sawTemplateDirective = true;
      continue;
    }

    if (FAST_IO_HEADER_RE.test(trimmed)) {
      sawTemplateDirective = true;
      if (trimmed.startsWith("def ")) {
        fastIoBlockIndent = rawLine.length - rawLine.trimStart().length;
      } else {
        let open = 0;
        let close = 0;
        for (const ch of trimmed) {
          if (ch === "{") open += 1;
          if (ch === "}") close += 1;
        }
        braceDepth = open - close;
        if (braceDepth > 0 || !trimmed.endsWith(";")) {
          inFastIoBlock = braceDepth > 0 || trimmed.endsWith("{") || !trimmed.includes("}");
        }
      }
      continue;
    }

    return false;
  }

  return sawTemplateDirective;
}

/**
 * Formats a clean, zero-Emoji hover tooltip explaining score, ceilings, and next rank gate.
 */
export function formatStylishRankTooltip(
  state: StylishRankState,
  options?: { locale?: "zh-CN" | "en-US"; nowMs?: number }
): string {
  const locale = options?.locale ?? "zh-CN";
  const nowMs = options?.nowMs ?? Date.now();
  const isZh = locale === "zh-CN";

  const rankIdx = rankToIndex(state.effectiveRank);
  const nextRank =
    rankIdx < STYLISH_RANK_ORDER.length - 1 ? STYLISH_RANK_ORDER[rankIdx + 1] : undefined;
  const nextMeta = nextRank ? getStylishRankMeta(nextRank) : undefined;

  const lines: string[] = [];
  if (isZh) {
    lines.push(
      `${state.meta.statusBarLabel} (${state.meta.zhName}) — ${state.score} / ${STYLISH_SCORE_MAX}`
    );
    if (nextMeta) {
      lines.push(
        `下一段位: ${nextMeta.statusBarLabel} (${nextMeta.zhName}, 分数门槛 ${nextMeta.minScore})`
      );
    } else {
      lines.push("已达最高段位: SSS · Spotless");
    }
    lines.push(
      `样例进度: 原题 ${state.originalSamplesPassed}/${state.originalSamplesTotal} | 自建边界 ${state.customEdgePassedCount} | 官方 AC: ${state.officialAc ? "是" : "否"}`
    );
    lines.push(
      `记录: 失败运行 ${state.failedRuns} 次 | Blind Tab ${state.blindTabCount} 次`
    );
    lines.push(
      `封顶约束: 提示上限 ${state.hintCeiling} | 粘贴上限 ${state.pasteCeiling} | 门槛上限 ${state.gateCeiling}`
    );
    if (state.ceilingReason) {
      lines.push(`当前限制: ${state.ceilingReason}`);
    }
    if (state.frozenUntilMs > nowMs) {
      const remainSec = Math.ceil((state.frozenUntilMs - nowMs) / 1000);
      lines.push(`加分冻结中: 剩余 ${remainSec}s (Shotgun Run 冷静期)`);
    }
    lines.push(`最近事件: ${state.lastEventSummary}`);
  } else {
    lines.push(`${state.meta.statusBarLabel} — ${state.score} / ${STYLISH_SCORE_MAX}`);
    if (nextMeta) {
      lines.push(`Next rank: ${nextMeta.statusBarLabel} (min score ${nextMeta.minScore})`);
    } else {
      lines.push("Max rank reached: SSS · Spotless");
    }
    lines.push(
      `Samples: ${state.originalSamplesPassed}/${state.originalSamplesTotal} original | ${state.customEdgePassedCount} custom edge | Official AC: ${state.officialAc ? "Yes" : "No"}`
    );
    lines.push(`Runs: ${state.failedRuns} failed | Blind Tabs: ${state.blindTabCount}`);
    lines.push(
      `Ceilings: Hint ${state.hintCeiling} | Paste ${state.pasteCeiling} | Gate ${state.gateCeiling}`
    );
    if (state.ceilingReason) {
      lines.push(`Active cap: ${state.ceilingReason}`);
    }
    if (state.frozenUntilMs > nowMs) {
      const remainSec = Math.ceil((state.frozenUntilMs - nowMs) / 1000);
      lines.push(`Score frozen: ${remainSec}s remaining (Shotgun Run cooldown)`);
    }
    lines.push(`Last event: ${state.lastEventSummary}`);
  }

  return lines.join("\n");
}

interface FailedRunRecord {
  timestampMs: number;
  codeHash: string;
  sourceCode?: string;
}

interface CanonicalOriginalSample {
  id: string;
  input: string;
  expectedOutput?: string;
}

/**
 * Deterministic DMC-style Stylish Rank state machine per Neon #16.
 * Scope: single problem session (`problemKey`). Zero LLM, zero WASM AST, zero VS Code imports.
 */
export class StylishRankEngine {
  readonly problemKey: string;
  private readonly isOfflineOrReadOnly: boolean;
  private readonly now: () => number;
  private readonly canonicalOriginalSamples: CanonicalOriginalSample[];
  private readonly originalNormalizedInputs: Set<string>;

  private score = 0;
  private lspErrorCount = 0;
  private maxHintLevel: HintLevel = 0;
  private pasteCeiling: StylishRankLetter = "SSS";
  private pasteCapTriggered = false;
  private blindTabCount = 0;
  private failedRuns = 0;
  private hasRunYet = false;

  private originalSamplesTotal: number;
  private originalSamplesPassed = 0;
  private hasPassedAnyOriginalSample = false;
  private allOriginalPassed = false;
  private originalSamplesTampered = false;

  private readonly passedCustomInputs = new Set<string>();
  private customEdgePointsAwardedCount = 0;
  private officialAc = false;
  private offlineVerifiedSolve = false;

  private readonly seenValidLines = new Set<string>();
  private handTypedScoreEarned = 0;
  private wordAcceptScoreEarned = 0;
  private microFrictionScoreEarned = 0;

  private handTypedChars = 0;
  private solutionPastedChars = 0;

  private claimedPartialPass = false;
  private claimedAllOriginalPass = false;
  private claimedFirstTryBonus = false;
  private claimedVerifiedSolve = false;

  private lastFailedCodeHash: string | undefined;
  private shotgunStreak: FailedRunRecord[] = [];
  private recentUneditedFullAcceptTimestamps: number[] = [];

  private frozenUntilMs = 0;
  private lastActivityMs: number;
  private appliedDecayTicks = 0;
  private lastEventSummary = "Session initialized";

  constructor(options: StylishRankEngineOptions) {
    this.problemKey = options.problemKey;
    this.isOfflineOrReadOnly = options.isOfflineOrReadOnly ?? false;
    this.now = options.now ?? (() => Date.now());
    this.lastActivityMs = this.now();

    const originals = (options.originalSamples ?? []).filter((s) => s.isOriginal);
    this.canonicalOriginalSamples = originals.map((s) => ({
      id: s.id,
      input: normalizeSampleText(s.input),
      expectedOutput: s.expectedOutput !== undefined ? normalizeSampleText(s.expectedOutput) : undefined
    }));
    this.originalNormalizedInputs = new Set(this.canonicalOriginalSamples.map((s) => s.input));
    this.originalSamplesTotal = this.canonicalOriginalSamples.length;
  }

  getState(): StylishRankState {
    const hintCeiling = hintCeilingForLevel(this.maxHintLevel);
    const gateCeiling = this.computeGateCeiling();
    const scoreRank = rankFromScore(this.score);
    const effectiveRank = minStylishRank(scoreRank, hintCeiling, this.pasteCeiling, gateCeiling);
    const meta = getStylishRankMeta(effectiveRank);
    const ceilingReason = this.computeCeilingReason(scoreRank, effectiveRank, hintCeiling, gateCeiling);

    return {
      problemKey: this.problemKey,
      score: this.score,
      effectiveRank,
      meta,
      hintCeiling,
      pasteCeiling: this.pasteCeiling,
      gateCeiling,
      ceilingReason,
      blindTabCount: this.blindTabCount,
      failedRuns: this.failedRuns,
      originalSamplesPassed: this.originalSamplesPassed,
      originalSamplesTotal: this.originalSamplesTotal,
      customEdgePassedCount: this.passedCustomInputs.size,
      officialAc: this.officialAc,
      frozenUntilMs: this.frozenUntilMs,
      lastEventSummary: this.lastEventSummary
    };
  }

  getStatusBarLabel(): string {
    return this.getState().meta.statusBarLabel;
  }

  getTooltip(locale: "zh-CN" | "en-US" = "zh-CN", nowMs?: number): string {
    return formatStylishRankTooltip(this.getState(), { locale, nowMs: nowMs ?? this.now() });
  }

  updateDiagnostics(lspErrorCount: number, nowMs?: number): StylishRankTransition {
    const prev = this.getState();
    this.lspErrorCount = Math.max(0, Math.floor(lspErrorCount));
    if (nowMs !== undefined) {
      this.touchActivity(nowMs);
    }
    this.lastEventSummary =
      this.lspErrorCount === 0
        ? "Diagnostics clean (0 errors)"
        : `Diagnostics report ${this.lspErrorCount} syntax error(s)`;
    return this.buildTransition(prev, []);
  }

  /**
   * Credits valid newly committed hand-typed lines (+18 each, capped at +360, locked at 399 pre-sample).
   * Requires debounced LSP Error === 0. Also breaks any Ghost Text Drifting streak.
   */
  recordHandTypedLines(input: HandTypedLinesInput): StylishRankTransition {
    const nowMs = input.nowMs ?? this.now();
    const prev = this.getState();
    this.touchActivity(nowMs);
    this.recentUneditedFullAcceptTimestamps = [];
    this.lspErrorCount = Math.max(0, Math.floor(input.lspErrorCount));

    if (this.lspErrorCount > 0) {
      this.lastEventSummary = `Hand-typed edit deferred (${this.lspErrorCount} LSP error(s))`;
      return this.buildTransition(prev, []);
    }

    let creditedLines = 0;
    let addedPoints = 0;

    for (const rawLine of input.lines) {
      if (!isValidCodingLine(rawLine)) {
        continue;
      }
      const normalized = rawLine.trim().replace(/\s+/g, " ");
      if (this.seenValidLines.has(normalized)) {
        continue;
      }
      this.seenValidLines.add(normalized);
      this.handTypedChars += rawLine.trim().length;
      creditedLines += 1;

      const remainingLineBudget = HAND_TYPED_SCORE_CAP - this.handTypedScoreEarned;
      if (remainingLineBudget > 0 && nowMs >= this.frozenUntilMs) {
        const rawDelta = Math.min(HAND_TYPED_LINE_POINTS, remainingLineBudget);
        const applied = this.addPositiveScore(rawDelta, { respectPreSampleCap: true, nowMs });
        if (applied > 0) {
          this.handTypedScoreEarned += applied;
          addedPoints += applied;
        }
      }
    }

    if (creditedLines > 0) {
      this.lastEventSummary =
        addedPoints > 0
          ? `Hand-typed +${creditedLines} valid line(s) (+${addedPoints} pts)`
          : `Hand-typed +${creditedLines} valid line(s) (score cap/freeze active)`;
    } else {
      this.lastEventSummary = "Edit recorded (no new valid lines)";
    }

    return this.buildTransition(prev, []);
  }

  /**
   * Handles Ghost Text accept events:
   * - `word` mode (`Ctrl+Right`): +8 pts (cap +64), never triggers Blind Tab.
   * - `full` mode: triggers Blind Tab (-120 pts, blindTabCount++) if substantial (>=16 chars or >=2 lines)
   *   accepted in <450ms, OR >=3 multi-token full accepts within 15s without manual edit.
   */
  recordGhostTextAccept(input: GhostTextAcceptInput): StylishRankTransition {
    const acceptedAtMs = input.acceptedAtMs ?? this.now();
    const prev = this.getState();
    this.touchActivity(acceptedAtMs);

    if (input.mode === "word") {
      const remaining = WORD_ACCEPT_SCORE_CAP - this.wordAcceptScoreEarned;
      const desired = Math.min(WORD_ACCEPT_POINTS, Math.max(0, remaining));
      const applied =
        desired > 0
          ? this.addPositiveScore(desired, { respectPreSampleCap: true, nowMs: acceptedAtMs })
          : 0;
      this.wordAcceptScoreEarned += applied;
      this.handTypedChars += input.text.trim().length;
      this.lastEventSummary =
        applied > 0
          ? `Word-by-word accept (+${applied} pts)`
          : "Word-by-word accept (cap/freeze active)";
      return this.buildTransition(prev, []);
    }

    if (input.hadManualEditSinceLastAccept) {
      this.recentUneditedFullAcceptTimestamps = [];
    }

    const lineCount = input.text.split(/\r?\n/).length;
    const charCount = input.text.length;
    const tokenCount = countLexicalTokens(input.text);
    const isSubstantial = charCount >= BLIND_TAB_MIN_CHARS || lineCount >= BLIND_TAB_MIN_LINES;
    const elapsedMs = acceptedAtMs - input.shownAtMs;

    // Single-token short boilerplate is never penalized
    if (!isSubstantial && tokenCount <= 1) {
      this.lastEventSummary = "Short boilerplate accept (no penalty)";
      return this.buildTransition(prev, []);
    }

    const isFastBlindAccept = isSubstantial && elapsedMs < BLIND_TAB_FAST_THRESHOLD_MS;

    let isDrifting = false;
    this.recentUneditedFullAcceptTimestamps = this.recentUneditedFullAcceptTimestamps.filter(
      (ts) => acceptedAtMs - ts <= BLIND_TAB_DRIFT_WINDOW_MS
    );
    this.recentUneditedFullAcceptTimestamps.push(acceptedAtMs);
    if (this.recentUneditedFullAcceptTimestamps.length >= BLIND_TAB_DRIFT_COUNT) {
      isDrifting = true;
      this.recentUneditedFullAcceptTimestamps = [];
    }

    if (isFastBlindAccept || isDrifting) {
      this.score = Math.max(0, this.score - BLIND_TAB_PENALTY);
      this.blindTabCount += 1;
      const reason = isFastBlindAccept ? "fast accept <450ms" : "3 consecutive unedited accepts in 15s";
      this.lastEventSummary = `Blind Tab penalty (-${BLIND_TAB_PENALTY} pts: ${reason}; SS/SSS locked)`;
      return this.buildTransition(prev, [], "blind_tab");
    }

    this.lastEventSummary = "Deliberate completion reviewed and accepted";
    return this.buildTransition(prev, []);
  }

  /**
   * Handles micro-friction (multi-choice bug discrimination / lead-and-reveal):
   * - Correct: +45 pts (cap +135, pre-sample cap 399).
   * - Wrong: -60 pts only, floored at C (120) if currently >= C (never drops back to D).
   */
  recordMicroFrictionResult(correct: boolean, nowMs?: number): StylishRankTransition {
    const ts = nowMs ?? this.now();
    const prev = this.getState();
    this.touchActivity(ts);

    if (correct) {
      const remaining = MICRO_FRICTION_SCORE_CAP - this.microFrictionScoreEarned;
      const desired = Math.min(MICRO_FRICTION_CORRECT_POINTS, Math.max(0, remaining));
      const applied =
        desired > 0 ? this.addPositiveScore(desired, { respectPreSampleCap: true, nowMs: ts }) : 0;
      this.microFrictionScoreEarned += applied;
      this.lastEventSummary =
        applied > 0
          ? `Micro-friction first-try correct (+${applied} pts)`
          : "Micro-friction correct (cap/freeze active)";
      return this.buildTransition(prev, []);
    }

    const rawNext = Math.max(0, this.score - MICRO_FRICTION_WRONG_PENALTY);
    const preserveCFloor = rankToIndex(prev.effectiveRank) >= rankToIndex("C");
    this.score = preserveCFloor ? Math.max(STYLISH_RANK_TABLE.C.minScore, rawNext) : rawNext;
    this.lastEventSummary = preserveCFloor
      ? `Micro-friction wrong (-${MICRO_FRICTION_WRONG_PENALTY} pts, C floor preserved)`
      : `Micro-friction wrong (-${MICRO_FRICTION_WRONG_PENALTY} pts)`;
    return this.buildTransition(prev, [], "micro_friction_wrong");
  }

  /**
   * Handles paste events with Paste Cap (-100 pts, pasteCeiling = C) and
   * pre-first-run top-level header/import/using/typedef/fast-IO exemption.
   */
  recordPaste(input: PasteEventInput): StylishRankTransition {
    const ts = input.nowMs ?? this.now();
    const prev = this.getState();
    this.touchActivity(ts);

    if (input.source === "plugin_stub" || input.source === "undo_redo") {
      this.lastEventSummary = `Exempt paste (${input.source})`;
      return this.buildTransition(prev, []);
    }

    // Exempt pre-first-run top-level header / fast-IO template paste (no penalty, no cap, no points)
    if (!this.hasRunYet && input.inSolutionBody !== true && isHeaderOrFastIoTemplate(input.text)) {
      this.lastEventSummary = "Exempt header/fast-IO template paste (no cap, no score)";
      return this.buildTransition(prev, []);
    }

    const nonEmptyLines = input.text
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0).length;
    const charCount = input.text.length;
    this.solutionPastedChars += charCount;

    const totalChars =
      input.totalSolutionChars ?? this.handTypedChars + this.solutionPastedChars;
    const singleLargeTrigger =
      nonEmptyLines >= PASTE_SINGLE_MIN_LINES || charCount >= PASTE_SINGLE_MIN_CHARS;
    const ratioTrigger =
      this.solutionPastedChars >= PASTE_RATIO_MIN_PASTED_CHARS &&
      totalChars > 0 &&
      this.solutionPastedChars / totalChars > PASTE_RATIO_THRESHOLD;

    if (singleLargeTrigger || (ratioTrigger && !this.pasteCapTriggered)) {
      this.score = Math.max(0, this.score - PASTE_CAP_PENALTY);
      this.pasteCeiling = "C";
      this.pasteCapTriggered = true;
      const reason = singleLargeTrigger
        ? `${nonEmptyLines} lines / ${charCount} chars in solution body`
        : `paste ratio > ${Math.round(PASTE_RATIO_THRESHOLD * 100)}%`;
      this.lastEventSummary = `Paste Cap triggered (-${PASTE_CAP_PENALTY} pts, capped at C: ${reason})`;
      return this.buildTransition(prev, [], "paste_cap");
    }

    this.lastEventSummary = `Small paste recorded (${charCount} chars)`;
    return this.buildTransition(prev, []);
  }

  /**
   * Records Socratic hint level used (monotonically non-decreasing).
   * Hint Ceiling: L0->SSS, L1-L2->SS, L3->A, L4->B, L5->C.
   */
  recordHintUsed(level: HintLevel, nowMs?: number): StylishRankTransition {
    const ts = nowMs ?? this.now();
    const prev = this.getState();
    this.touchActivity(ts);

    if (level > this.maxHintLevel) {
      this.maxHintLevel = level;
    }
    const ceiling = hintCeilingForLevel(this.maxHintLevel);
    this.lastEventSummary = `Hint L${this.maxHintLevel} used (hint ceiling: ${ceiling})`;
    return this.buildTransition(prev, []);
  }

  /**
   * Records explicit give-up / full solution reveal (applies L5 ceiling -> C).
   */
  recordGiveUp(nowMs?: number): StylishRankTransition {
    return this.recordHintUsed(5, nowMs);
  }

  /**
   * Processes a local runner execution result:
   * - Validates original sample integrity (tampering locks S+);
   * - Awards idempotent verification milestones (+150, +250, First-Try +80, Custom Edge +70x2);
   * - Detects Shotgun Run (3 failed runs in 60s with <5 char net change -> -80 pts + 30s freeze).
   */
  recordLocalRun(result: LocalRunResult, options?: LocalRunInputOptions): StylishRankTransition {
    const nowMs = options?.nowMs ?? this.now();
    const prev = this.getState();
    this.touchActivity(nowMs);
    this.hasRunYet = true;

    const integrity = this.verifyOriginalSamples(result, options?.originalSamplesTampered);
    this.originalSamplesTampered = !integrity.intact;
    this.originalSamplesTotal = integrity.total;
    this.originalSamplesPassed = Math.max(this.originalSamplesPassed, integrity.passedIntact);

    if (integrity.passedIntact >= 1) {
      this.hasPassedAnyOriginalSample = true;
    }
    if (integrity.intact && integrity.total > 0 && integrity.passedIntact === integrity.total) {
      this.allOriginalPassed = true;
    }
    if (result.compileOk) {
      this.lspErrorCount = 0;
    }

    const codeChangedSinceLastFail =
      this.lastFailedCodeHash === undefined || result.codeHash !== this.lastFailedCodeHash;

    const milestonesAwarded: StylishMilestoneId[] = [];
    let penaltyTriggered: StylishPenaltyKind | undefined;

    // Evaluate failed run & Shotgun Run before mutating failedRuns for First-Try check
    const priorFailedRuns = this.failedRuns;
    const isFailedRun = !result.compileOk || !result.allPassed;

    if (isFailedRun) {
      this.failedRuns += 1;
      const shotgunHit = this.evaluateShotgunRun(nowMs, result.codeHash, options);
      this.lastFailedCodeHash = result.codeHash;
      if (shotgunHit) {
        this.score = Math.max(0, this.score - SHOTGUN_PENALTY);
        this.frozenUntilMs = Math.max(this.frozenUntilMs, nowMs + SHOTGUN_FREEZE_MS);
        penaltyTriggered = "shotgun_run";
      }
    } else {
      this.shotgunStreak = [];
    }

    // Re-check final cumulative paste ratio if sourceCode was provided
    if (
      !this.pasteCapTriggered &&
      options?.sourceCode !== undefined &&
      this.solutionPastedChars >= PASTE_RATIO_MIN_PASTED_CHARS
    ) {
      const totalChars = Math.max(
        options.sourceCode.length,
        this.handTypedChars + this.solutionPastedChars
      );
      if (totalChars > 0 && this.solutionPastedChars / totalChars > PASTE_RATIO_THRESHOLD) {
        this.score = Math.max(0, this.score - PASTE_CAP_PENALTY);
        this.pasteCeiling = "C";
        this.pasteCapTriggered = true;
        penaltyTriggered = "paste_cap";
      }
    }

    // Award idempotent milestones (blocked during freeze; requires codeHash change after a fail)
    const runAllOriginalIntactPassed =
      result.compileOk &&
      integrity.intact &&
      integrity.total > 0 &&
      integrity.passedIntact === integrity.total;

    if (nowMs >= this.frozenUntilMs) {
      if (
        runAllOriginalIntactPassed &&
        result.allPassed &&
        priorFailedRuns === 0 &&
        !this.claimedPartialPass &&
        !this.claimedAllOriginalPass &&
        !this.claimedFirstTryBonus
      ) {
        this.claimedPartialPass = true;
        this.claimedAllOriginalPass = true;
        this.claimedFirstTryBonus = true;
        this.addPositiveScore(
          MILESTONE_PARTIAL_PASS_POINTS +
            MILESTONE_ALL_ORIGINAL_PASS_POINTS +
            MILESTONE_FIRST_TRY_CLEAN_BONUS_POINTS,
          { respectPreSampleCap: false, nowMs }
        );
        milestonesAwarded.push(
          "MILESTONE_PARTIAL_PASS",
          "MILESTONE_ALL_ORIGINAL_PASS",
          "MILESTONE_FIRST_TRY_CLEAN_BONUS"
        );
      } else {
        if (
          !this.claimedPartialPass &&
          integrity.passedIntact >= 1 &&
          codeChangedSinceLastFail
        ) {
          this.claimedPartialPass = true;
          this.addPositiveScore(MILESTONE_PARTIAL_PASS_POINTS, {
            respectPreSampleCap: false,
            nowMs
          });
          milestonesAwarded.push("MILESTONE_PARTIAL_PASS");
        }
        if (
          !this.claimedAllOriginalPass &&
          runAllOriginalIntactPassed &&
          codeChangedSinceLastFail
        ) {
          this.claimedAllOriginalPass = true;
          this.addPositiveScore(MILESTONE_ALL_ORIGINAL_PASS_POINTS, {
            respectPreSampleCap: false,
            nowMs
          });
          milestonesAwarded.push("MILESTONE_ALL_ORIGINAL_PASS");
        }
      }
    }

    // Distinct non-trivial custom edge passes (+70 each, max 2 rewarded)
    for (const c of result.cases) {
      if (c.isOriginal || c.verdict !== "AC") {
        continue;
      }
      const normInput = normalizeSampleText(c.input);
      if (normInput.length === 0 || this.originalNormalizedInputs.has(normInput)) {
        continue;
      }
      if (this.passedCustomInputs.has(normInput)) {
        continue;
      }
      this.passedCustomInputs.add(normInput);
      if (
        this.customEdgePointsAwardedCount < MILESTONE_CUSTOM_EDGE_MAX_COUNT &&
        nowMs >= this.frozenUntilMs
      ) {
        this.customEdgePointsAwardedCount += 1;
        this.addPositiveScore(MILESTONE_CUSTOM_EDGE_POINTS, {
          respectPreSampleCap: false,
          nowMs
        });
        milestonesAwarded.push("MILESTONE_CUSTOM_EDGE_PASS");
      }
    }

    if (penaltyTriggered === "shotgun_run") {
      this.lastEventSummary = `Shotgun Run penalty (-${SHOTGUN_PENALTY} pts, scoring frozen 30s)`;
    } else if (penaltyTriggered === "paste_cap") {
      this.lastEventSummary = `Paste Cap triggered on run (-${PASTE_CAP_PENALTY} pts, capped at C)`;
    } else if (!integrity.intact) {
      this.lastEventSummary = "Original samples modified; S+ gate locked until restored";
    } else if (milestonesAwarded.length > 0) {
      this.lastEventSummary = `Local run passed (${integrity.passedIntact}/${integrity.total}): ${milestonesAwarded.join(", ")}`;
    } else if (runAllOriginalIntactPassed && result.allPassed) {
      this.lastEventSummary = `Local run all green (${integrity.passedIntact}/${integrity.total})`;
    } else {
      this.lastEventSummary = `Local run failed (${integrity.passedIntact}/${integrity.total} original passed)`;
    }

    return this.buildTransition(prev, milestonesAwarded, penaltyTriggered);
  }

  /**
   * Processes an official OJ verdict event (`AC` grants `MILESTONE_VERIFIED_SOLVE` +160 pts).
   */
  recordOfficialVerdict(event: OfficialVerdictEvent, nowMs?: number): StylishRankTransition {
    const ts = nowMs ?? this.now();
    const prev = this.getState();
    this.touchActivity(ts);

    const milestonesAwarded: StylishMilestoneId[] = [];
    if (event.verdict === "AC") {
      this.officialAc = true;
      if (!this.claimedVerifiedSolve && ts >= this.frozenUntilMs) {
        this.claimedVerifiedSolve = true;
        this.addPositiveScore(MILESTONE_VERIFIED_SOLVE_POINTS, {
          respectPreSampleCap: false,
          nowMs: ts
        });
        milestonesAwarded.push("MILESTONE_VERIFIED_SOLVE");
      }
      this.lastEventSummary =
        milestonesAwarded.length > 0
          ? `Official AC verified (+${MILESTONE_VERIFIED_SOLVE_POINTS} pts)`
          : "Official AC verified";
    } else {
      this.failedRuns += 1;
      this.lastEventSummary = `Official verdict: ${event.verdict}`;
    }

    return this.buildTransition(prev, milestonesAwarded);
  }

  /**
   * Marks an offline/read-only problem as verified solved once all original samples pass
   * and >= 2 distinct custom edge cases pass (+160 pts, enables SSS gate).
   */
  markOfflineVerifiedSolve(nowMs?: number): StylishRankTransition {
    const ts = nowMs ?? this.now();
    const prev = this.getState();
    this.touchActivity(ts);

    if (
      !this.isOfflineOrReadOnly ||
      !this.allOriginalPassed ||
      this.originalSamplesTampered ||
      this.passedCustomInputs.size < 2
    ) {
      this.lastEventSummary =
        "Offline verified solve requires offline mode, all intact original samples, and >= 2 custom edge passes";
      return this.buildTransition(prev, []);
    }

    const milestonesAwarded: StylishMilestoneId[] = [];
    this.offlineVerifiedSolve = true;

    if (!this.claimedVerifiedSolve && ts >= this.frozenUntilMs) {
      this.claimedVerifiedSolve = true;
      this.addPositiveScore(MILESTONE_VERIFIED_SOLVE_POINTS, {
        respectPreSampleCap: false,
        nowMs: ts
      });
      milestonesAwarded.push("MILESTONE_VERIFIED_SOLVE");
    }

    this.lastEventSummary =
      milestonesAwarded.length > 0
        ? `Offline verified solve (+${MILESTONE_VERIFIED_SOLVE_POINTS} pts)`
        : "Offline verified solve confirmed";

    return this.buildTransition(prev, milestonesAwarded);
  }

  /**
   * Applies Think-Friendly Decay:
   * - 0..90s idle: ZERO decay.
   * - >90s idle: -15 pts per 30s interval, HARD-LOCKED at current rank's floor score
   *   so pure quiet thinking NEVER demotes rank.
   */
  applyIdleDecay(nowMs?: number): StylishRankTransition {
    const ts = nowMs ?? this.now();
    const prev = this.getState();
    const idleMs = ts - this.lastActivityMs;

    if (idleMs <= DECAY_GRACE_MS) {
      return this.buildTransition(prev, []);
    }

    const totalTicks = Math.floor((idleMs - DECAY_GRACE_MS) / DECAY_INTERVAL_MS);
    const pendingTicks = totalTicks - this.appliedDecayTicks;
    if (pendingTicks <= 0) {
      return this.buildTransition(prev, []);
    }

    this.appliedDecayTicks = totalTicks;
    const currentScoreRank = rankFromScore(this.score);
    const floorScore = getStylishRankMeta(currentScoreRank).minScore;
    const decayAmount = pendingTicks * DECAY_STEP_POINTS;
    const nextScore = Math.max(floorScore, this.score - decayAmount);

    if (nextScore < this.score) {
      const actualDrop = this.score - nextScore;
      this.score = nextScore;
      this.lastEventSummary = `Think-friendly decay (-${actualDrop} pts, rank floor locked at ${floorScore})`;
    }

    return this.buildTransition(prev, []);
  }

  private touchActivity(nowMs: number): void {
    if (nowMs >= this.lastActivityMs) {
      this.lastActivityMs = nowMs;
    }
    this.appliedDecayTicks = 0;
  }

  private addPositiveScore(
    delta: number,
    opts: { respectPreSampleCap: boolean; nowMs: number }
  ): number {
    if (delta <= 0 || opts.nowMs < this.frozenUntilMs) {
      return 0;
    }
    const upperCap =
      opts.respectPreSampleCap && !this.hasPassedAnyOriginalSample
        ? PRE_SAMPLE_SCORE_CAP
        : STYLISH_SCORE_MAX;
    const next = Math.min(upperCap, this.score + delta);
    const applied = Math.max(0, next - this.score);
    this.score = next;
    return applied;
  }

  private verifyOriginalSamples(
    result: LocalRunResult,
    explicitTampered?: boolean
  ): { intact: boolean; total: number; passedIntact: number } {
    const origCases = result.cases.filter((c) => c.isOriginal);

    if (this.canonicalOriginalSamples.length > 0) {
      const total = this.canonicalOriginalSamples.length;
      const byId = new Map(origCases.map((c) => [c.id, c]));
      let intact = !explicitTampered && origCases.length === total;
      let passedIntact = 0;

      for (let i = 0; i < this.canonicalOriginalSamples.length; i += 1) {
        const expected = this.canonicalOriginalSamples[i];
        if (!expected) {
          continue;
        }
        const matched = byId.get(expected.id) ?? origCases[i];
        if (!matched) {
          intact = false;
          continue;
        }
        const inputMatches = normalizeSampleText(matched.input) === expected.input;
        const outputMatches =
          expected.expectedOutput === undefined ||
          normalizeSampleText(matched.expected) === expected.expectedOutput;

        if (!inputMatches || !outputMatches) {
          intact = false;
          continue;
        }
        if (matched.verdict === "AC") {
          passedIntact += 1;
        }
      }

      return { intact, total, passedIntact };
    }

    // Fallback when engine was initialized without canonical originalSamples list
    const total = result.originalTotal;
    const passedFromCases =
      origCases.length > 0
        ? origCases.filter((c) => c.verdict === "AC").length
        : result.originalPassed;
    const intact = !explicitTampered && total > 0;
    return {
      intact,
      total,
      passedIntact: intact ? passedFromCases : 0
    };
  }

  private evaluateShotgunRun(
    nowMs: number,
    codeHash: string,
    options?: LocalRunInputOptions
  ): boolean {
    const currentRecord: FailedRunRecord = {
      timestampMs: nowMs,
      codeHash,
      sourceCode: options?.sourceCode
    };

    const previous = this.shotgunStreak[this.shotgunStreak.length - 1];
    if (!previous) {
      this.shotgunStreak = [currentRecord];
      return false;
    }

    let netDiffChars: number;
    if (options?.codeNetChangeChars !== undefined) {
      netDiffChars = options.codeNetChangeChars;
    } else if (options?.sourceCode !== undefined && previous.sourceCode !== undefined) {
      netDiffChars = computeCodeNetChangeChars(previous.sourceCode, options.sourceCode);
    } else if (codeHash === previous.codeHash) {
      netDiffChars = 0;
    } else {
      netDiffChars = Number.POSITIVE_INFINITY;
    }

    if (netDiffChars >= SHOTGUN_MAX_DIFF_CHARS) {
      this.shotgunStreak = [currentRecord];
      return false;
    }

    this.shotgunStreak = this.shotgunStreak.filter(
      (entry) => nowMs - entry.timestampMs <= SHOTGUN_WINDOW_MS
    );
    this.shotgunStreak.push(currentRecord);

    if (this.shotgunStreak.length >= SHOTGUN_FAIL_COUNT) {
      this.shotgunStreak = [];
      return true;
    }
    return false;
  }

  private computeGateCeiling(): StylishRankLetter {
    if (!this.hasPassedAnyOriginalSample) {
      if (this.lspErrorCount > 0 || this.seenValidLines.size < 3) {
        return "D";
      }
      if (this.seenValidLines.size < 5) {
        return "C";
      }
      return "B";
    }

    if (!this.allOriginalPassed || this.originalSamplesTampered) {
      return "A";
    }

    // All intact original samples passed -> S unlocked
    if (this.blindTabCount > 0) {
      return "S";
    }

    const meetsSSProof = this.passedCustomInputs.size >= 1 || this.officialAc;
    if (!meetsSSProof) {
      return "S";
    }

    const meetsSSSProof =
      this.officialAc ||
      (this.isOfflineOrReadOnly &&
        this.passedCustomInputs.size >= 2 &&
        this.offlineVerifiedSolve);

    if (meetsSSSProof && this.failedRuns <= 2) {
      return "SSS";
    }

    return "SS";
  }

  private computeCeilingReason(
    scoreRank: StylishRankLetter,
    effectiveRank: StylishRankLetter,
    hintCeiling: StylishRankLetter,
    gateCeiling: StylishRankLetter
  ): string | undefined {
    const reasons: string[] = [];

    if (this.pasteCeiling === "C") {
      reasons.push("Paste Cap active (capped at C)");
    }
    if (hintCeiling !== "SSS") {
      reasons.push(`Hint L${this.maxHintLevel} ceiling (max ${hintCeiling})`);
    }
    if (this.blindTabCount > 0) {
      reasons.push(`Blind Tab x${this.blindTabCount} (SS/SSS locked)`);
    }
    if (this.originalSamplesTampered) {
      reasons.push("Original samples modified (S+ locked)");
    }

    if (rankToIndex(effectiveRank) < rankToIndex(scoreRank)) {
      if (gateCeiling === effectiveRank) {
        if (gateCeiling === "D") {
          reasons.push(
            this.lspErrorCount > 0
              ? `Fix ${this.lspErrorCount} LSP error(s) to unlock C`
              : "Write >= 3 valid lines with 0 errors to unlock C"
          );
        } else if (gateCeiling === "C") {
          reasons.push("Write >= 5 valid lines with 0 errors to unlock B");
        } else if (gateCeiling === "B") {
          reasons.push("Pass >= 1 original sample to unlock A");
        } else if (gateCeiling === "A" && !this.originalSamplesTampered) {
          reasons.push("Pass all original samples to unlock S");
        } else if (gateCeiling === "S" && this.blindTabCount === 0) {
          reasons.push("Pass >= 1 custom edge test or Official AC to unlock SS");
        } else if (gateCeiling === "SS") {
          if (this.failedRuns > 2) {
            reasons.push(`Failed runs (${this.failedRuns}) > 2 (SSS requires <= 2)`);
          } else {
            reasons.push("Official AC (or verified offline solve with >= 2 edge tests) required for SSS");
          }
        }
      }
    } else if (!this.hasPassedAnyOriginalSample && this.score >= PRE_SAMPLE_SCORE_CAP) {
      reasons.push("Pre-sample score cap (399 / B): pass >= 1 original sample to advance");
    }

    return reasons.length > 0 ? reasons.join("; ") : undefined;
  }

  private buildTransition(
    previous: StylishRankState,
    milestonesAwarded: StylishMilestoneId[],
    penaltyTriggered?: StylishPenaltyKind
  ): StylishRankTransition {
    const current = this.getState();
    const cmp = compareStylishRank(current.effectiveRank, previous.effectiveRank);

    return {
      previousRank: previous.effectiveRank,
      currentRank: current.effectiveRank,
      rankChanged: cmp !== 0,
      promoted: cmp > 0,
      demoted: cmp < 0,
      scoreDelta: current.score - previous.score,
      penaltyTriggered,
      milestonesAwarded,
      state: current
    };
  }
}
