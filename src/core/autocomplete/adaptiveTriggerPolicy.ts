import type {
  AutocompleteZone,
  GhostTextMode,
  LexicalZoneResult,
  SampleVerdict
} from "../contracts";

export type TriggerKind = "automatic" | "manual";

export type TriggerBreakerKind =
  | "fast_typing_flow"
  | "backspace_burst"
  | "recent_failure_cooldown"
  | "drifting_blind_accept";

export interface TriggerSignals {
  /** Keystrokes per second in recent typing window. */
  keysPerSecond?: number;
  /** Consecutive Backspace edits without intervening forward typing. */
  consecutiveBackspaces?: number;
  /** Timestamp (epoch ms) of the most recent local runner failure. */
  lastFailureRunAtMs?: number;
  /** Verdict of the most recent local runner failure. */
  lastFailureVerdict?: SampleVerdict;
  /** Number of consecutive unmodified full-block accepts within the last 3 minutes. */
  consecutiveBlindAcceptsIn3Min?: number;
}

export interface AdaptiveTriggerInput {
  mode: GhostTextMode;
  triggerKind: TriggerKind;
  zoneResult: LexicalZoneResult;
  signals?: TriggerSignals;
  nowMs?: number;
}

export interface TriggerDecision {
  shouldTrigger: boolean;
  debounceMs: number;
  baseDebounceMs: number;
  penaltyDelayMs: number;
  maxLines: number;
  maxTokens: number;
  zone: AutocompleteZone;
  reason: string;
  activeBreakers: TriggerBreakerKind[];
  cooldownRemainingMs?: number;
  statusHint?: string;
}

export const TRIGGER_THRESHOLDS = {
  FAST_TYPING_KEYS_PER_SEC: 4,
  BACKSPACE_BURST_COUNT: 5,
  FAILURE_COOLDOWN_MS: 6_000,
  DRIFTING_WINDOW_MS: 180_000,
  DRIFTING_BLIND_ACCEPT_COUNT: 5,
  ADAPTIVE_GREEN_MS: 500,
  ADAPTIVE_NEUTRAL_MS: 1_000,
  FAST_SYNTAX_GREEN_MS: 350,
  FAST_SYNTAX_NEUTRAL_MS: 600,
  ADAPTIVE_BREAKER_PENALTY_MS: 800,
  ADAPTIVE_DRIFTING_PENALTY_MS: 1_000,
  FAST_SYNTAX_BREAKER_PENALTY_MS: 400
} as const;

const FAILURE_COOLDOWN_VERDICTS = new Set<SampleVerdict>(["WA", "RE", "CE"]);

function isGreenZone(zone: AutocompleteZone): boolean {
  return zone === "boilerplate" || zone === "api_syntax";
}

function getBaseDebounceMs(
  mode: Exclude<GhostTextMode, "off" | "manual">,
  zone: AutocompleteZone
): number {
  if (mode === "fast-syntax") {
    return isGreenZone(zone)
      ? TRIGGER_THRESHOLDS.FAST_SYNTAX_GREEN_MS
      : TRIGGER_THRESHOLDS.FAST_SYNTAX_NEUTRAL_MS;
  }
  return isGreenZone(zone)
    ? TRIGGER_THRESHOLDS.ADAPTIVE_GREEN_MS
    : TRIGGER_THRESHOLDS.ADAPTIVE_NEUTRAL_MS;
}

export function evaluateAdaptiveTrigger(
  input: AdaptiveTriggerInput
): TriggerDecision {
  const { mode, triggerKind, zoneResult, signals } = input;
  const nowMs = input.nowMs ?? Date.now();
  const zone = zoneResult.zone;

  if (mode === "off") {
    return {
      shouldTrigger: false,
      debounceMs: 0,
      baseDebounceMs: 0,
      penaltyDelayMs: 0,
      maxLines: 0,
      maxTokens: 0,
      zone,
      reason: "mode-off",
      activeBreakers: []
    };
  }

  if (triggerKind === "manual") {
    return {
      shouldTrigger: true,
      debounceMs: 0,
      baseDebounceMs: 0,
      penaltyDelayMs: 0,
      maxLines: zoneResult.maxLines,
      maxTokens: zoneResult.maxTokens,
      zone,
      reason:
        zone === "algo_core"
          ? "manual-invoke-in-red-zone"
          : "manual-invoke",
      activeBreakers: []
    };
  }

  if (mode === "manual") {
    return {
      shouldTrigger: false,
      debounceMs: 0,
      baseDebounceMs: 0,
      penaltyDelayMs: 0,
      maxLines: zoneResult.maxLines,
      maxTokens: zoneResult.maxTokens,
      zone,
      reason: "manual-mode-auto-suppressed",
      activeBreakers: []
    };
  }

  // Automatic trigger in Red Zone (algo_core) is ALWAYS silent
  if (zone === "algo_core") {
    return {
      shouldTrigger: false,
      debounceMs: 0,
      baseDebounceMs: 0,
      penaltyDelayMs: 0,
      maxLines: zoneResult.maxLines,
      maxTokens: zoneResult.maxTokens,
      zone,
      reason: "red-zone-auto-suppressed",
      activeBreakers: [],
      statusHint:
        "Algorithm core zone: auto ghost text paused (Alt+\\ to invoke manually)."
    };
  }

  const baseDebounceMs = getBaseDebounceMs(mode, zone);
  const activeBreakers: TriggerBreakerKind[] = [];
  let penaltyDelayMs = 0;
  let hardPause = false;
  let cooldownRemainingMs: number | undefined;
  let statusHint: string | undefined;

  const standardPenalty =
    mode === "fast-syntax"
      ? TRIGGER_THRESHOLDS.FAST_SYNTAX_BREAKER_PENALTY_MS
      : TRIGGER_THRESHOLDS.ADAPTIVE_BREAKER_PENALTY_MS;

  if (
    signals?.keysPerSecond !== undefined &&
    signals.keysPerSecond > TRIGGER_THRESHOLDS.FAST_TYPING_KEYS_PER_SEC
  ) {
    activeBreakers.push("fast_typing_flow");
    penaltyDelayMs += standardPenalty;
    hardPause = true;
  }

  if (
    signals?.consecutiveBackspaces !== undefined &&
    signals.consecutiveBackspaces > TRIGGER_THRESHOLDS.BACKSPACE_BURST_COUNT
  ) {
    activeBreakers.push("backspace_burst");
    penaltyDelayMs += standardPenalty;
    hardPause = true;
  }

  if (
    signals?.lastFailureRunAtMs !== undefined &&
    signals.lastFailureVerdict !== undefined &&
    FAILURE_COOLDOWN_VERDICTS.has(signals.lastFailureVerdict)
  ) {
    const elapsedMs = nowMs - signals.lastFailureRunAtMs;
    if (elapsedMs >= 0 && elapsedMs < TRIGGER_THRESHOLDS.FAILURE_COOLDOWN_MS) {
      activeBreakers.push("recent_failure_cooldown");
      cooldownRemainingMs = TRIGGER_THRESHOLDS.FAILURE_COOLDOWN_MS - elapsedMs;
      penaltyDelayMs += cooldownRemainingMs;
      hardPause = true;
      statusHint = `Debugging cooldown active after ${signals.lastFailureVerdict} (${Math.ceil(cooldownRemainingMs / 1000)}s left).`;
    }
  }

  if (
    signals?.consecutiveBlindAcceptsIn3Min !== undefined &&
    signals.consecutiveBlindAcceptsIn3Min >=
      TRIGGER_THRESHOLDS.DRIFTING_BLIND_ACCEPT_COUNT
  ) {
    activeBreakers.push("drifting_blind_accept");
    const driftingPenalty =
      mode === "fast-syntax"
        ? TRIGGER_THRESHOLDS.FAST_SYNTAX_BREAKER_PENALTY_MS
        : TRIGGER_THRESHOLDS.ADAPTIVE_DRIFTING_PENALTY_MS;
    penaltyDelayMs += driftingPenalty;
    // Pause auto triggers in neutral zone and elevate latency in green zones
    if (zone === "neutral") {
      hardPause = true;
    }
    statusHint =
      "Anti-drifting cadence active: try Ctrl+Right word-by-word accept or Alt+\\ manual invoke.";
  }

  const debounceMs = baseDebounceMs + penaltyDelayMs;

  if (hardPause) {
    const primaryBreaker = activeBreakers[0] ?? "fast_typing_flow";
    return {
      shouldTrigger: false,
      debounceMs,
      baseDebounceMs,
      penaltyDelayMs,
      maxLines: zoneResult.maxLines,
      maxTokens: zoneResult.maxTokens,
      zone,
      reason: `breaker-${primaryBreaker}`,
      activeBreakers,
      cooldownRemainingMs,
      statusHint
    };
  }

  return {
    shouldTrigger: true,
    debounceMs,
    baseDebounceMs,
    penaltyDelayMs,
    maxLines: zoneResult.maxLines,
    maxTokens: zoneResult.maxTokens,
    zone,
    reason:
      activeBreakers.length > 0
        ? `elevated-${activeBreakers[0]}`
        : `${mode}-${zone}`,
    activeBreakers,
    statusHint
  };
}

/**
 * Pure stateful helper for tracking typing velocity, backspace bursts,
 * local WA/RE/CE cooldowns, and consecutive blind full-block accepts.
 */
export class TriggerSignalTracker {
  private keystrokeTimestamps: number[] = [];
  private consecutiveBackspaces = 0;
  private lastFailureRunAtMs: number | undefined;
  private lastFailureVerdict: SampleVerdict | undefined;
  private blindAcceptTimestamps: number[] = [];

  recordKeystroke(nowMs: number, kind: "normal" | "backspace" = "normal"): void {
    this.keystrokeTimestamps.push(nowMs);
    this.pruneKeystrokes(nowMs);
    if (kind === "backspace") {
      this.consecutiveBackspaces += 1;
    } else {
      this.consecutiveBackspaces = 0;
    }
  }

  recordManualEditAfterAccept(): void {
    this.blindAcceptTimestamps = [];
  }

  recordGhostTextAccept(
    nowMs: number,
    opts: { unmodifiedFullBlock: boolean }
  ): void {
    this.pruneBlindAccepts(nowMs);
    if (opts.unmodifiedFullBlock) {
      this.blindAcceptTimestamps.push(nowMs);
    } else {
      this.blindAcceptTimestamps = [];
    }
  }

  recordLocalRunVerdict(verdict: SampleVerdict, nowMs: number): void {
    if (FAILURE_COOLDOWN_VERDICTS.has(verdict)) {
      this.lastFailureRunAtMs = nowMs;
      this.lastFailureVerdict = verdict;
    } else if (verdict === "AC") {
      this.lastFailureRunAtMs = undefined;
      this.lastFailureVerdict = undefined;
    }
  }

  snapshot(nowMs: number): TriggerSignals {
    this.pruneKeystrokes(nowMs);
    this.pruneBlindAccepts(nowMs);
    const windowSec = 1;
    const keysPerSecond = this.keystrokeTimestamps.length / windowSec;

    return {
      keysPerSecond,
      consecutiveBackspaces: this.consecutiveBackspaces,
      lastFailureRunAtMs: this.lastFailureRunAtMs,
      lastFailureVerdict: this.lastFailureVerdict,
      consecutiveBlindAcceptsIn3Min: this.blindAcceptTimestamps.length
    };
  }

  reset(): void {
    this.keystrokeTimestamps = [];
    this.consecutiveBackspaces = 0;
    this.lastFailureRunAtMs = undefined;
    this.lastFailureVerdict = undefined;
    this.blindAcceptTimestamps = [];
  }

  private pruneKeystrokes(nowMs: number): void {
    const cutoff = nowMs - 1_000;
    while (
      this.keystrokeTimestamps.length > 0 &&
      (this.keystrokeTimestamps[0] ?? 0) < cutoff
    ) {
      this.keystrokeTimestamps.shift();
    }
  }

  private pruneBlindAccepts(nowMs: number): void {
    const cutoff = nowMs - TRIGGER_THRESHOLDS.DRIFTING_WINDOW_MS;
    while (
      this.blindAcceptTimestamps.length > 0 &&
      (this.blindAcceptTimestamps[0] ?? 0) < cutoff
    ) {
      this.blindAcceptTimestamps.shift();
    }
  }
}
