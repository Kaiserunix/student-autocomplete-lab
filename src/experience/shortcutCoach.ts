import type { DisposableLike, MementoPort } from "./featureFlags";

export type ShortcutPlatform = "win32" | "darwin" | "linux";

export type ShortcutTipId =
  | "delete-line"
  | "move-line"
  | "toggle-comment"
  | "run-samples"
  | "request-hint";

export type SidebarActionId = "runSamples" | "requestHint";

export interface ShortcutTipDefinition {
  readonly id: ShortcutTipId;
  readonly winLinuxKeys: string;
  readonly macKeys: string;
  readonly zhDescription: string;
  readonly enDescription: string;
}

export const SHORTCUT_COACH_STATE_KEY = "algoCoach.shortcutCoach.state.v1";
export const SHORTCUT_HINT_DURATION_MS = 6_000;
export const SHORTCUT_TIP_COOLDOWN_MS = 30 * 60 * 1_000;
export const SHORTCUT_MAX_HINTS_PER_SESSION = 2;
export const SHORTCUT_GRADUATE_AFTER_USES = 2;

export const SHORTCUT_TIP_DEFINITIONS: Readonly<Record<ShortcutTipId, ShortcutTipDefinition>> = {
  "delete-line": {
    id: "delete-line",
    winLinuxKeys: "Ctrl+Shift+K",
    macKeys: "Cmd+Shift+K",
    zhDescription: "整行删除",
    enDescription: "delete current line"
  },
  "move-line": {
    id: "move-line",
    winLinuxKeys: "Alt+Up/Down",
    macKeys: "Option+Up/Down",
    zhDescription: "整行上下移动",
    enDescription: "move line up/down"
  },
  "toggle-comment": {
    id: "toggle-comment",
    winLinuxKeys: "Ctrl+/",
    macKeys: "Cmd+/",
    zhDescription: "批量切换注释",
    enDescription: "toggle line comment"
  },
  "run-samples": {
    id: "run-samples",
    winLinuxKeys: "Ctrl+Alt+R",
    macKeys: "Cmd+Alt+R",
    zhDescription: "运行本地样例",
    enDescription: "run local samples"
  },
  "request-hint": {
    id: "request-hint",
    winLinuxKeys: "Ctrl+Alt+H",
    macKeys: "Cmd+Alt+H",
    zhDescription: "请求下一级提示",
    enDescription: "request next Socratic hint"
  }
};

export interface ShortcutDocumentChange {
  rangeOffset: number;
  rangeLength: number;
  range: {
    startLine: number;
    startCharacter: number;
    endLine: number;
    endCharacter: number;
  };
  text: string;
  /** Optional text before the edit on the same line (used to verify leading comment typing). */
  linePrefixBeforeChange?: string;
  /** Optional deleted text snapshot (when available) to confirm line cut-and-paste moves. */
  deletedText?: string;
  /** Optional explicit flag indicating a full-line cut/delete edit. */
  isWholeLine?: boolean;
}

export interface ShortcutDocumentChangeEvent {
  documentUri: string;
  contentChanges: readonly ShortcutDocumentChange[];
  reason?: "undo" | "redo";
  timestampMs?: number;
}

export interface ShortcutHintNotification {
  tipId: ShortcutTipId;
  /** Strictly status bar whisper — never modal or toast notification. */
  channel: "statusBar";
  durationMs: number;
  shortcutLabel: string;
  text: string;
  tooltip: string;
  shownAtMs: number;
}

export interface ShortcutTipProgress {
  usageCount: number;
  dismissed: boolean;
  graduated: boolean;
  lastShownAtMs?: number;
}

type PersistedCoachState = Partial<Record<ShortcutTipId, ShortcutTipProgress>>;

export interface ShortcutCoachOptions {
  memento: MementoPort;
  enabled?: boolean;
  platform?: ShortcutPlatform;
  locale?: "zh-CN" | "en-US";
  cooldownMs?: number;
  maxHintsPerSession?: number;
  graduateAfterUses?: number;
  now?: () => number;
  onHint?: (hint: ShortcutHintNotification) => void;
}

interface PendingCutLine {
  documentUri: string;
  line: number;
  deletedText?: string;
  timestampMs: number;
}

interface PendingSlashKeystroke {
  documentUri: string;
  line: number;
  nextCharacter: number;
  timestampMs: number;
}

const BACKSPACE_THRESHOLD = 12;
const BACKSPACE_MAX_GAP_MS = 2_500;
const CUT_PASTE_MAX_GAP_MS = 10_000;
const COMMENT_STREAK_MAX_GAP_MS = 15_000;
const SLASH_PAIR_MAX_GAP_MS = 2_000;
const SIDEBAR_CLICK_THRESHOLD = 3;

function defaultPlatform(): ShortcutPlatform {
  if (typeof process !== "undefined" && process.platform === "darwin") {
    return "darwin";
  }
  if (typeof process !== "undefined" && process.platform === "linux") {
    return "linux";
  }
  return "win32";
}

function isWholeLineDeletion(change: ShortcutDocumentChange): boolean {
  if (change.text !== "") {
    return false;
  }
  if (change.isWholeLine) {
    return true;
  }
  if (
    change.range.startCharacter === 0 &&
    change.range.endLine === change.range.startLine + 1 &&
    change.range.endCharacter === 0
  ) {
    return true;
  }
  if (
    change.deletedText !== undefined &&
    change.deletedText.trim().length > 0 &&
    change.range.startCharacter === 0 &&
    change.range.endLine === change.range.startLine &&
    change.rangeLength >= change.deletedText.length
  ) {
    return true;
  }
  return false;
}

function isMultiLineToggleCommentEdit(changes: readonly ShortcutDocumentChange[]): boolean {
  if (changes.length < 2) {
    return false;
  }
  const lines = new Set<number>();
  for (const ch of changes) {
    const inserted = ch.text.trim();
    const isCommentInsert =
      inserted === "//" || inserted === "#" || inserted.startsWith("//") || inserted.startsWith("#");
    const isCommentDelete =
      ch.text === "" &&
      ch.rangeLength >= 1 &&
      ch.rangeLength <= 3 &&
      (ch.deletedText === undefined ||
        ch.deletedText.trim() === "//" ||
        ch.deletedText.trim() === "#");
    if (!isCommentInsert && !isCommentDelete) {
      return false;
    }
    lines.add(ch.range.startLine);
  }
  return lines.size >= 2;
}

function isLeadingCommentPosition(change: ShortcutDocumentChange): boolean {
  if (change.linePrefixBeforeChange !== undefined) {
    return /^\s*$/.test(change.linePrefixBeforeChange);
  }
  return change.range.startCharacter <= 16;
}

/**
 * Zero-OS-hook shortcut coach driven solely by text document change events and sidebar clicks.
 * Enforces strict anti-nagging rules: status bar whisper only (6s), zero Emoji, 30m per-tip
 * cooldown, max 2 tips/session, permanent graduation after 2 uses or manual dismissal.
 */
export class ShortcutCoach implements DisposableLike {
  private readonly memento: MementoPort;
  private enabled: boolean;
  private readonly platform: ShortcutPlatform;
  private locale: "zh-CN" | "en-US";
  private readonly cooldownMs: number;
  private readonly maxHintsPerSession: number;
  private readonly graduateAfterUses: number;
  private readonly now: () => number;
  private onHint?: (hint: ShortcutHintNotification) => void;

  private disposed = false;
  private sessionHintsShown = 0;

  // Transient detectors (never persisted)
  private activeDocumentUri: string | undefined;
  private backspaceStreak = 0;
  private lastBackspaceOffset: number | undefined;
  private lastBackspaceAtMs = 0;
  private pendingCut: PendingCutLine | undefined;
  private pendingSlash: PendingSlashKeystroke | undefined;
  private manualCommentLines: Array<{ line: number; timestampMs: number }> = [];
  private readonly sidebarClicks: Record<SidebarActionId, number> = {
    runSamples: 0,
    requestHint: 0
  };

  constructor(options: ShortcutCoachOptions) {
    this.memento = options.memento;
    this.enabled = options.enabled ?? true;
    this.platform = options.platform ?? defaultPlatform();
    this.locale = options.locale ?? "zh-CN";
    this.cooldownMs = options.cooldownMs ?? SHORTCUT_TIP_COOLDOWN_MS;
    this.maxHintsPerSession = options.maxHintsPerSession ?? SHORTCUT_MAX_HINTS_PER_SESSION;
    this.graduateAfterUses = options.graduateAfterUses ?? SHORTCUT_GRADUATE_AFTER_USES;
    this.now = options.now ?? (() => Date.now());
    this.onHint = options.onHint;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.resetTransientDetectors();
    }
  }

  setLocale(locale: "zh-CN" | "en-US"): void {
    this.locale = locale;
  }

  getShortcutLabel(tipId: ShortcutTipId): string {
    const def = SHORTCUT_TIP_DEFINITIONS[tipId];
    return this.platform === "darwin" ? def.macKeys : def.winLinuxKeys;
  }

  getTipProgress(tipId: ShortcutTipId): ShortcutTipProgress {
    const state = this.readState();
    const existing = state[tipId];
    if (!existing) {
      return { usageCount: 0, dismissed: false, graduated: false };
    }
    return { ...existing };
  }

  isGraduated(tipId: ShortcutTipId): boolean {
    return this.getTipProgress(tipId).graduated;
  }

  getSessionHintsShown(): number {
    return this.sessionHintsShown;
  }

  /**
   * Records that the learner successfully used the shortcut.
   * After `graduateAfterUses` (default 2) uses, the tip permanently graduates.
   */
  recordShortcutUsed(tipId: ShortcutTipId): ShortcutTipProgress {
    const state = this.readState();
    const current = state[tipId] ?? { usageCount: 0, dismissed: false, graduated: false };
    const nextUsage = current.usageCount + 1;
    const updated: ShortcutTipProgress = {
      ...current,
      usageCount: nextUsage,
      graduated: current.graduated || nextUsage >= this.graduateAfterUses
    };
    state[tipId] = updated;
    this.writeState(state);
    return { ...updated };
  }

  /**
   * Permanently dismisses and graduates a tip when the user clicks "Don't show again".
   */
  dismissTip(tipId: ShortcutTipId): ShortcutTipProgress {
    const state = this.readState();
    const current = state[tipId] ?? { usageCount: 0, dismissed: false, graduated: false };
    const updated: ShortcutTipProgress = {
      ...current,
      dismissed: true,
      graduated: true
    };
    state[tipId] = updated;
    this.writeState(state);
    return { ...updated };
  }

  /**
   * Tracks mouse clicks on sidebar action buttons; suggests shortcut once clicks >= 3.
   */
  recordSidebarClick(
    action: SidebarActionId,
    timestampMs?: number
  ): ShortcutHintNotification | null {
    if (this.disposed || !this.enabled) {
      return null;
    }
    const nowMs = timestampMs ?? this.now();
    this.sidebarClicks[action] += 1;

    if (this.sidebarClicks[action] < SIDEBAR_CLICK_THRESHOLD) {
      return null;
    }

    this.sidebarClicks[action] = 0;
    const tipId: ShortcutTipId = action === "runSamples" ? "run-samples" : "request-hint";
    return this.tryEmitHint(tipId, nowMs);
  }

  /**
   * Analyzes pure document edit events (zero OS keyboard hooks) for 3 inefficient patterns:
   * 1. >= 12 consecutive single-char backspaces -> delete-line
   * 2. Cutting a whole line followed immediately by adjacent paste -> move-line
   * 3. Manually typing `//` or `#` on 3 consecutive lines -> toggle-comment
   */
  handleDocumentChange(event: ShortcutDocumentChangeEvent): ShortcutHintNotification | null {
    if (this.disposed || !this.enabled) {
      return null;
    }

    const nowMs = event.timestampMs ?? this.now();

    if (event.reason === "undo" || event.reason === "redo") {
      this.resetTransientDetectors();
      return null;
    }

    if (this.activeDocumentUri !== event.documentUri) {
      this.resetTransientDetectors();
      this.activeDocumentUri = event.documentUri;
    }

    if (event.contentChanges.length === 0) {
      return null;
    }

    // Multi-line simultaneous comment toggle indicates user already used Ctrl+/ (or Cmd+/)
    if (isMultiLineToggleCommentEdit(event.contentChanges)) {
      this.resetTransientDetectors();
      this.recordShortcutUsed("toggle-comment");
      return null;
    }

    if (event.contentChanges.length !== 1) {
      this.resetTransientDetectors();
      return null;
    }

    const change = event.contentChanges[0];
    if (!change) {
      return null;
    }

    // 1. Check pending cut-line followed by adjacent paste (move-line)
    if (this.pendingCut) {
      const cut = this.pendingCut;
      const withinWindow =
        cut.documentUri === event.documentUri && nowMs - cut.timestampMs <= CUT_PASTE_MAX_GAP_MS;
      const insertLine = change.range.startLine;
      const lineDistance = Math.abs(insertLine - cut.line);
      const isLinePaste =
        change.text.trim().length > 0 &&
        (change.text.includes("\n") ||
          (cut.deletedText !== undefined && change.text.trim() === cut.deletedText.trim()) ||
          change.text.trim().length >= 4);

      if (withinWindow && isLinePaste && lineDistance >= 1 && lineDistance <= 2) {
        this.pendingCut = undefined;
        this.resetBackspaceDetector();
        this.resetCommentDetector();
        return this.tryEmitHint("move-line", nowMs);
      }

      // Any non-matching edit clears the pending cut window
      this.pendingCut = undefined;
    }

    // 2. Check whole-line cut/delete (arm move-line detector)
    if (isWholeLineDeletion(change)) {
      this.pendingCut = {
        documentUri: event.documentUri,
        line: change.range.startLine,
        deletedText: change.deletedText,
        timestampMs: nowMs
      };
      this.resetBackspaceDetector();
      this.resetCommentDetector();
      return null;
    }

    // 3. Check consecutive single-character backspaces (delete-line)
    const isSingleBackspace =
      change.text === "" &&
      change.rangeLength >= 1 &&
      change.rangeLength <= 2 &&
      (change.rangeLength === 1 || change.range.endLine > change.range.startLine);

    if (isSingleBackspace) {
      this.resetCommentDetector();
      const isAdjacentLeft =
        this.lastBackspaceOffset !== undefined &&
        change.rangeOffset === this.lastBackspaceOffset - change.rangeLength &&
        nowMs - this.lastBackspaceAtMs <= BACKSPACE_MAX_GAP_MS;

      if (isAdjacentLeft) {
        this.backspaceStreak += 1;
      } else {
        this.backspaceStreak = 1;
      }
      this.lastBackspaceOffset = change.rangeOffset;
      this.lastBackspaceAtMs = nowMs;

      if (this.backspaceStreak >= BACKSPACE_THRESHOLD) {
        this.resetBackspaceDetector();
        return this.tryEmitHint("delete-line", nowMs);
      }
      return null;
    }

    this.resetBackspaceDetector();

    // 4. Check manual line-by-line commenting (`//` or `#`) across 3 consecutive lines
    const detectedCommentLine = this.detectManualCommentLine(event.documentUri, change, nowMs);
    if (detectedCommentLine !== null) {
      const pruned = this.manualCommentLines.filter(
        (entry) => nowMs - entry.timestampMs <= COMMENT_STREAK_MAX_GAP_MS
      );
      if (!pruned.some((entry) => entry.line === detectedCommentLine)) {
        pruned.push({ line: detectedCommentLine, timestampMs: nowMs });
      }
      this.manualCommentLines = pruned.slice(-3);

      if (this.manualCommentLines.length === 3) {
        const sortedLines = this.manualCommentLines
          .map((entry) => entry.line)
          .sort((a, b) => a - b);
        const first = sortedLines[0];
        const second = sortedLines[1];
        const third = sortedLines[2];
        if (
          first !== undefined &&
          second !== undefined &&
          third !== undefined &&
          second === first + 1 &&
          third === second + 1
        ) {
          this.resetCommentDetector();
          return this.tryEmitHint("toggle-comment", nowMs);
        }
      }
      return null;
    }

    // Non-comment edit (other than a pending first slash) resets pending slash if unrelated
    if (change.text !== "/") {
      this.pendingSlash = undefined;
    }

    return null;
  }

  private detectManualCommentLine(
    documentUri: string,
    change: ShortcutDocumentChange,
    nowMs: number
  ): number | null {
    if (change.rangeLength !== 0 || change.text.includes("\n")) {
      this.pendingSlash = undefined;
      return null;
    }

    const line = change.range.startLine;

    // Direct `#` or `//` insertion at line prefix
    if (
      (change.text === "#" || change.text === "# " || change.text === "//" || change.text === "// ") &&
      isLeadingCommentPosition(change)
    ) {
      this.pendingSlash = undefined;
      return line;
    }

    // Two-keystroke `/` followed by `/`
    if (change.text === "/") {
      if (
        this.pendingSlash &&
        this.pendingSlash.documentUri === documentUri &&
        this.pendingSlash.line === line &&
        this.pendingSlash.nextCharacter === change.range.startCharacter &&
        nowMs - this.pendingSlash.timestampMs <= SLASH_PAIR_MAX_GAP_MS
      ) {
        this.pendingSlash = undefined;
        return line;
      }

      if (isLeadingCommentPosition(change)) {
        this.pendingSlash = {
          documentUri,
          line,
          nextCharacter: change.range.startCharacter + 1,
          timestampMs: nowMs
        };
      } else {
        this.pendingSlash = undefined;
      }
      return null;
    }

    return null;
  }

  private tryEmitHint(tipId: ShortcutTipId, nowMs: number): ShortcutHintNotification | null {
    if (this.sessionHintsShown >= this.maxHintsPerSession) {
      return null;
    }

    const state = this.readState();
    const progress = state[tipId] ?? { usageCount: 0, dismissed: false, graduated: false };

    if (progress.graduated || progress.dismissed) {
      return null;
    }

    if (progress.lastShownAtMs !== undefined && nowMs - progress.lastShownAtMs < this.cooldownMs) {
      return null;
    }

    const def = SHORTCUT_TIP_DEFINITIONS[tipId];
    const shortcutLabel = this.getShortcutLabel(tipId);
    const text =
      this.locale === "zh-CN"
        ? `快捷键: ${shortcutLabel} ${def.zhDescription}`
        : `Shortcut: ${shortcutLabel} (${def.enDescription})`;
    const tooltip =
      this.locale === "zh-CN"
        ? `使用 ${shortcutLabel} 可快速${def.zhDescription}。点击不再提示此条。`
        : `Use ${shortcutLabel} to ${def.enDescription}. Click to permanently dismiss this tip.`;

    const notification: ShortcutHintNotification = {
      tipId,
      channel: "statusBar",
      durationMs: SHORTCUT_HINT_DURATION_MS,
      shortcutLabel,
      text,
      tooltip,
      shownAtMs: nowMs
    };

    state[tipId] = {
      ...progress,
      lastShownAtMs: nowMs
    };
    this.writeState(state);
    this.sessionHintsShown += 1;

    this.onHint?.(notification);
    return notification;
  }

  private readState(): PersistedCoachState {
    const raw = this.memento.get<PersistedCoachState>(SHORTCUT_COACH_STATE_KEY);
    if (!raw || typeof raw !== "object") {
      return {};
    }
    return { ...raw };
  }

  private writeState(state: PersistedCoachState): void {
    void this.memento.update(SHORTCUT_COACH_STATE_KEY, state);
  }

  private resetBackspaceDetector(): void {
    this.backspaceStreak = 0;
    this.lastBackspaceOffset = undefined;
    this.lastBackspaceAtMs = 0;
  }

  private resetCommentDetector(): void {
    this.pendingSlash = undefined;
    this.manualCommentLines = [];
  }

  private resetTransientDetectors(): void {
    this.resetBackspaceDetector();
    this.resetCommentDetector();
    this.pendingCut = undefined;
  }

  dispose(): void {
    this.disposed = true;
    this.enabled = false;
    this.onHint = undefined;
    this.resetTransientDetectors();
    this.sidebarClicks.runSamples = 0;
    this.sidebarClicks.requestHint = 0;
  }
}
