import type {
  FeatureFlags,
  LocalRunResult,
  OfficialVerdictEvent,
  SoundEventKind,
  StylishRankLetter,
  TypingSoundPack
} from "../core/contracts";
import type { DisposableLike } from "./featureFlags";
import { rankToIndex, type StylishRankTransition } from "./stylishRankEngine";

export const TYPING_SOUND_THROTTLE_MS = 40;
export const BACKSPACE_GAIN_DB = -4;
export const PUNCT_CLOSE_OVERTONE_DECAY_MS = 15;
export const THUD_PENALTY_FREQUENCY_HZ = 110;
export const THUD_PENALTY_DURATION_MS = 45;
export const MAX_TYPING_CHANGE_TEXT_LENGTH = 5;

export interface SoundDispatchPayload {
  kind: SoundEventKind;
  pack: TypingSoundPack;
  /** Base normalized volume [0, 1] from settings. */
  volume: number;
  /** Relative gain adjustment in decibels (e.g. -4dB for Backspace). */
  gainDb: number;
  /** Effective linear amplitude = volume * 10^(gainDb / 20). */
  gainLinear: number;
  /** Playback rate with +/-3% micro-jitter [0.97, 1.03] for typing sounds (1.0 for chimes/thud). */
  playbackRate: number;
  /** True for crisp overtone accent on closing punctuation / Enter at rank >= A. */
  harmonicAccent: boolean;
  overtoneDecayMs?: number;
  frequencyHz?: number;
  durationMs?: number;
  rank?: StylishRankLetter;
  timestampMs: number;
}

export type SoundEventSink = (payload: SoundDispatchPayload) => void;

export interface SoundDocumentChange {
  text: string;
  rangeLength: number;
}

export interface SoundDocumentChangeEvent {
  contentChanges: readonly SoundDocumentChange[];
  reason?: "undo" | "redo";
  timestampMs?: number;
}

export interface SoundStatusBarIndicator {
  visible: boolean;
  codicon: "$(mute)" | "$(unmute)";
  label: string;
  tooltip: string;
}

export interface SoundControllerOptions {
  typingSoundEnabled?: boolean;
  typingSoundPack?: TypingSoundPack;
  typingSoundVolume?: number;
  celebrationSoundEnabled?: boolean;
  celebrationSoundVolume?: number;
  focused?: boolean;
  muted?: boolean;
  currentRank?: StylishRankLetter;
  throttleMs?: number;
  now?: () => number;
  random?: () => number;
  onEmit?: SoundEventSink;
}

function clampUnit(value: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(0, Math.min(1, value));
}

function dbToLinear(db: number): number {
  return Math.pow(10, db / 20);
}

function isEnterText(text: string): boolean {
  return text === "\n" || text === "\r\n" || /^\r?\n[ \t]*$/.test(text);
}

function isClosingPunctuation(text: string): boolean {
  return text === ";" || text === "}" || text === ")";
}

/**
 * Anti-embarrassment mechanical keyboard & feedback acoustic event scheduler.
 * Defaults OFF, auto-silences on window blur, filters Undo/Redo/format/paste bursts,
 * enforces 40ms global typing throttle, applies -4dB attenuation to Backspace,
 * and adds crisp harmonic accents on `;`/`}`/`)` when Stylish Rank >= A.
 */
export class SoundController implements DisposableLike {
  private typingSoundEnabled: boolean;
  private typingSoundPack: TypingSoundPack;
  private typingSoundVolume: number;
  private celebrationSoundEnabled: boolean;
  private celebrationSoundVolume: number;

  private focused: boolean;
  private muted: boolean;
  private currentRank: StylishRankLetter;

  private readonly throttleMs: number;
  private readonly now: () => number;
  private readonly random: () => number;
  private onEmit?: SoundEventSink;

  private lastTypingDispatchAtMs = Number.NEGATIVE_INFINITY;
  private disposed = false;

  constructor(options?: SoundControllerOptions) {
    this.typingSoundEnabled = options?.typingSoundEnabled ?? false;
    this.typingSoundPack = options?.typingSoundPack ?? "muted-brown";
    this.typingSoundVolume = clampUnit(options?.typingSoundVolume ?? 0.25, 0.25);
    this.celebrationSoundEnabled = options?.celebrationSoundEnabled ?? false;
    this.celebrationSoundVolume = clampUnit(options?.celebrationSoundVolume ?? 0.35, 0.35);

    this.focused = options?.focused ?? true;
    this.muted = options?.muted ?? false;
    this.currentRank = options?.currentRank ?? "D";

    this.throttleMs = options?.throttleMs ?? TYPING_SOUND_THROTTLE_MS;
    this.now = options?.now ?? (() => Date.now());
    this.random = options?.random ?? (() => Math.random());
    this.onEmit = options?.onEmit;
  }

  applyFeatureFlags(
    flags: Pick<
      FeatureFlags,
      | "typingSoundEnabled"
      | "typingSoundPack"
      | "typingSoundVolume"
      | "celebrationSoundEnabled"
      | "celebrationSoundVolume"
    >
  ): void {
    this.typingSoundEnabled = flags.typingSoundEnabled;
    this.typingSoundPack = flags.typingSoundPack;
    this.typingSoundVolume = clampUnit(flags.typingSoundVolume, 0.25);
    this.celebrationSoundEnabled = flags.celebrationSoundEnabled;
    this.celebrationSoundVolume = clampUnit(flags.celebrationSoundVolume, 0.35);
  }

  setWindowFocused(focused: boolean): void {
    this.focused = focused;
  }

  isWindowFocused(): boolean {
    return this.focused;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    return this.muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  setCurrentRank(rank: StylishRankLetter): void {
    this.currentRank = rank;
  }

  getCurrentRank(): StylishRankLetter {
    return this.currentRank;
  }

  /**
   * Anti-embarrassment status bar mute toggle is visible ONLY when at least one sound channel is enabled.
   */
  getStatusBarIndicator(): SoundStatusBarIndicator {
    const anyEnabled = this.typingSoundEnabled || this.celebrationSoundEnabled;
    const codicon = this.muted ? "$(mute)" : "$(unmute)";
    return {
      visible: anyEnabled,
      codicon,
      label: codicon,
      tooltip: this.muted
        ? "Algo Coach audio muted (click to unmute)"
        : "Algo Coach audio active (click to mute)"
    };
  }

  /**
   * Filters document edits and schedules a mechanical typing sound when permitted.
   */
  handleDocumentChange(event: SoundDocumentChangeEvent): SoundDispatchPayload | null {
    if (this.disposed || !this.typingSoundEnabled || !this.focused || this.muted) {
      return null;
    }
    if (this.typingSoundVolume <= 0) {
      return null;
    }

    // Ignore Undo/Redo
    if (event.reason === "undo" || event.reason === "redo") {
      return null;
    }

    // Ignore formatter / multi-cursor / batch multi-segment edits
    if (event.contentChanges.length !== 1) {
      return null;
    }

    const change = event.contentChanges[0];
    if (!change) {
      return null;
    }

    // Filter bulk paste / auto-insert bursts (`text.length > 5`)
    if (change.text.length > MAX_TYPING_CHANGE_TEXT_LENGTH) {
      return null;
    }

    // Filter large range deletions (e.g. cut whole line or clear selection)
    if (change.text === "" && (change.rangeLength === 0 || change.rangeLength > MAX_TYPING_CHANGE_TEXT_LENGTH)) {
      return null;
    }

    const nowMs = event.timestampMs ?? this.now();
    if (nowMs - this.lastTypingDispatchAtMs < this.throttleMs) {
      return null;
    }

    const isHighRank = rankToIndex(this.currentRank) >= rankToIndex("A");
    let kind: SoundEventKind;
    let gainDb = 0;
    let harmonicAccent = false;
    let overtoneDecayMs: number | undefined;

    if (change.text === "") {
      kind = "key_backspace";
      gainDb = BACKSPACE_GAIN_DB;
    } else if (isEnterText(change.text)) {
      kind = "key_enter";
      if (isHighRank) {
        harmonicAccent = true;
        overtoneDecayMs = PUNCT_CLOSE_OVERTONE_DECAY_MS;
      }
    } else if (isClosingPunctuation(change.text) && isHighRank) {
      kind = "key_punct_close";
      harmonicAccent = true;
      overtoneDecayMs = PUNCT_CLOSE_OVERTONE_DECAY_MS;
    } else {
      kind = "key_normal";
    }

    // +/- 3% playbackRate jitter to prevent ear fatigue
    const jitter = (this.random() * 2 - 1) * 0.03;
    const playbackRate = Number((1 + jitter).toFixed(4));
    const gainLinear = Number((this.typingSoundVolume * dbToLinear(gainDb)).toFixed(4));

    const payload: SoundDispatchPayload = {
      kind,
      pack: this.typingSoundPack,
      volume: this.typingSoundVolume,
      gainDb,
      gainLinear,
      playbackRate,
      harmonicAccent,
      ...(overtoneDecayMs !== undefined ? { overtoneDecayMs } : {}),
      rank: this.currentRank,
      timestampMs: nowMs
    };

    this.lastTypingDispatchAtMs = nowMs;
    this.onEmit?.(payload);
    return payload;
  }

  /**
   * Updates tracked rank and emits:
   * - `chime_rank_up` on promotion to S / SS / SSS (requires celebrationSoundEnabled)
   * - `thud_penalty` on penalty-induced rank demotion (requires either typing or celebration sound enabled)
   */
  handleRankTransition(
    transition: StylishRankTransition,
    nowMs?: number
  ): SoundDispatchPayload | null {
    this.currentRank = transition.currentRank;

    if (this.disposed || !this.focused || this.muted) {
      return null;
    }

    const ts = nowMs ?? this.now();

    if (
      transition.promoted &&
      rankToIndex(transition.currentRank) >= rankToIndex("S") &&
      this.celebrationSoundEnabled &&
      this.celebrationSoundVolume > 0
    ) {
      const payload: SoundDispatchPayload = {
        kind: "chime_rank_up",
        pack: this.typingSoundPack,
        volume: this.celebrationSoundVolume,
        gainDb: 0,
        gainLinear: this.celebrationSoundVolume,
        playbackRate: 1,
        harmonicAccent: true,
        durationMs: 240,
        rank: transition.currentRank,
        timestampMs: ts
      };
      this.onEmit?.(payload);
      return payload;
    }

    if (
      transition.demoted &&
      transition.penaltyTriggered !== undefined &&
      (this.typingSoundEnabled || this.celebrationSoundEnabled)
    ) {
      const activeVolume = this.celebrationSoundEnabled
        ? this.celebrationSoundVolume
        : this.typingSoundVolume;
      if (activeVolume <= 0) {
        return null;
      }
      const payload: SoundDispatchPayload = {
        kind: "thud_penalty",
        pack: this.typingSoundPack,
        volume: activeVolume,
        gainDb: 0,
        gainLinear: activeVolume,
        playbackRate: 1,
        harmonicAccent: false,
        frequencyHz: THUD_PENALTY_FREQUENCY_HZ,
        durationMs: THUD_PENALTY_DURATION_MS,
        rank: transition.currentRank,
        timestampMs: ts
      };
      this.onEmit?.(payload);
      return payload;
    }

    return null;
  }

  /**
   * Emits `chime_pass` when all local samples pass (requires celebrationSoundEnabled).
   */
  handleLocalRunResult(result: LocalRunResult, nowMs?: number): SoundDispatchPayload | null {
    if (!result.compileOk || !result.allPassed) {
      return null;
    }
    return this.emitCelebrationPass(nowMs);
  }

  /**
   * Emits `chime_pass` on official OJ AC (requires celebrationSoundEnabled).
   */
  handleOfficialVerdict(event: OfficialVerdictEvent, nowMs?: number): SoundDispatchPayload | null {
    if (event.verdict !== "AC") {
      return null;
    }
    return this.emitCelebrationPass(nowMs);
  }

  private emitCelebrationPass(nowMs?: number): SoundDispatchPayload | null {
    if (
      this.disposed ||
      !this.celebrationSoundEnabled ||
      !this.focused ||
      this.muted ||
      this.celebrationSoundVolume <= 0
    ) {
      return null;
    }

    const ts = nowMs ?? this.now();
    const payload: SoundDispatchPayload = {
      kind: "chime_pass",
      pack: this.typingSoundPack,
      volume: this.celebrationSoundVolume,
      gainDb: 0,
      gainLinear: this.celebrationSoundVolume,
      playbackRate: 1,
      harmonicAccent: true,
      durationMs: 220,
      rank: this.currentRank,
      timestampMs: ts
    };
    this.onEmit?.(payload);
    return payload;
  }

  dispose(): void {
    this.disposed = true;
    this.onEmit = undefined;
  }
}
