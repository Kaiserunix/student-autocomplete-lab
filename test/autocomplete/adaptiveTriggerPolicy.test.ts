import { describe, expect, it } from "vitest";
import type { LexicalZoneResult } from "../../src/core/contracts";
import {
  evaluateAdaptiveTrigger,
  TRIGGER_THRESHOLDS,
  TriggerSignalTracker
} from "../../src/core/autocomplete";

const GREEN_BOILERPLATE: LexicalZoneResult = {
  zone: "boilerplate",
  spoilerRisk: "low",
  reason: "header-or-import-directive",
  maxLines: 3,
  maxTokens: 96
};

const GREEN_API: LexicalZoneResult = {
  zone: "api_syntax",
  spoilerRisk: "low",
  reason: "member-or-scope-access",
  maxLines: 3,
  maxTokens: 64
};

const NEUTRAL: LexicalZoneResult = {
  zone: "neutral",
  spoilerRisk: "low",
  reason: "neutral-statement",
  maxLines: 1,
  maxTokens: 48
};

const RED_ALGO: LexicalZoneResult = {
  zone: "algo_core",
  spoilerRisk: "high",
  reason: "control-flow-condition",
  maxLines: 1,
  maxTokens: 32
};

describe("adaptiveTriggerPolicy", () => {
  it("supports adaptive, fast-syntax, manual, and off modes with exact base delays", () => {
    // adaptive
    const adaptiveGreen = evaluateAdaptiveTrigger({
      mode: "adaptive",
      triggerKind: "automatic",
      zoneResult: GREEN_BOILERPLATE
    });
    expect(adaptiveGreen.shouldTrigger).toBe(true);
    expect(adaptiveGreen.debounceMs).toBe(500);
    expect(adaptiveGreen.maxLines).toBe(3);

    const adaptiveNeutral = evaluateAdaptiveTrigger({
      mode: "adaptive",
      triggerKind: "automatic",
      zoneResult: NEUTRAL
    });
    expect(adaptiveNeutral.shouldTrigger).toBe(true);
    expect(adaptiveNeutral.debounceMs).toBe(1000);
    expect(adaptiveNeutral.maxLines).toBe(1);

    // fast-syntax
    const fastGreen = evaluateAdaptiveTrigger({
      mode: "fast-syntax",
      triggerKind: "automatic",
      zoneResult: GREEN_API
    });
    expect(fastGreen.shouldTrigger).toBe(true);
    expect(fastGreen.debounceMs).toBe(350);

    const fastNeutral = evaluateAdaptiveTrigger({
      mode: "fast-syntax",
      triggerKind: "automatic",
      zoneResult: NEUTRAL
    });
    expect(fastNeutral.shouldTrigger).toBe(true);
    expect(fastNeutral.debounceMs).toBe(600);

    // manual
    expect(
      evaluateAdaptiveTrigger({
        mode: "manual",
        triggerKind: "automatic",
        zoneResult: GREEN_BOILERPLATE
      }).shouldTrigger
    ).toBe(false);
    expect(
      evaluateAdaptiveTrigger({
        mode: "manual",
        triggerKind: "manual",
        zoneResult: GREEN_BOILERPLATE
      })
    ).toMatchObject({ shouldTrigger: true, debounceMs: 0 });

    // off blocks both automatic and manual
    expect(
      evaluateAdaptiveTrigger({
        mode: "off",
        triggerKind: "automatic",
        zoneResult: GREEN_BOILERPLATE
      }).shouldTrigger
    ).toBe(false);
    expect(
      evaluateAdaptiveTrigger({
        mode: "off",
        triggerKind: "manual",
        zoneResult: GREEN_BOILERPLATE
      }).shouldTrigger
    ).toBe(false);
  });

  it("keeps Red zone (algo_core) completely silent on automatic triggers and allows manual invoke only", () => {
    for (const mode of ["adaptive", "fast-syntax", "manual"] as const) {
      const autoDecision = evaluateAdaptiveTrigger({
        mode,
        triggerKind: "automatic",
        zoneResult: RED_ALGO
      });
      expect(autoDecision.shouldTrigger).toBe(false);

      const manualDecision = evaluateAdaptiveTrigger({
        mode,
        triggerKind: "manual",
        zoneResult: RED_ALGO
      });
      expect(manualDecision.shouldTrigger).toBe(true);
      expect(manualDecision.debounceMs).toBe(0);
      expect(manualDecision.maxLines).toBe(1);
    }
  });

  it("activates fast typing (> 4 keys/s) and backspace burst (> 5) circuit breakers", () => {
    const fastFlow = evaluateAdaptiveTrigger({
      mode: "adaptive",
      triggerKind: "automatic",
      zoneResult: GREEN_API,
      signals: { keysPerSecond: 5 }
    });
    expect(fastFlow.shouldTrigger).toBe(false);
    expect(fastFlow.activeBreakers).toContain("fast_typing_flow");
    expect(fastFlow.debounceMs).toBeGreaterThan(500);

    const normalPace = evaluateAdaptiveTrigger({
      mode: "adaptive",
      triggerKind: "automatic",
      zoneResult: GREEN_API,
      signals: { keysPerSecond: 4 }
    });
    expect(normalPace.shouldTrigger).toBe(true);

    const backspaceBurst = evaluateAdaptiveTrigger({
      mode: "adaptive",
      triggerKind: "automatic",
      zoneResult: NEUTRAL,
      signals: { consecutiveBackspaces: 6 }
    });
    expect(backspaceBurst.shouldTrigger).toBe(false);
    expect(backspaceBurst.activeBreakers).toContain("backspace_burst");
  });

  it("enforces 6s cooldown window after local WA / RE / CE runs and lifts cleanly afterwards", () => {
    const t0 = 100_000;
    for (const verdict of ["WA", "RE", "CE"] as const) {
      const insideWindow = evaluateAdaptiveTrigger({
        mode: "adaptive",
        triggerKind: "automatic",
        zoneResult: GREEN_BOILERPLATE,
        nowMs: t0 + 2_500,
        signals: {
          lastFailureRunAtMs: t0,
          lastFailureVerdict: verdict
        }
      });
      expect(insideWindow.shouldTrigger).toBe(false);
      expect(insideWindow.activeBreakers).toContain("recent_failure_cooldown");
      expect(insideWindow.cooldownRemainingMs).toBe(3_500);
    }

    const afterWindow = evaluateAdaptiveTrigger({
      mode: "adaptive",
      triggerKind: "automatic",
      zoneResult: GREEN_BOILERPLATE,
      nowMs: t0 + TRIGGER_THRESHOLDS.FAILURE_COOLDOWN_MS,
      signals: {
        lastFailureRunAtMs: t0,
        lastFailureVerdict: "WA"
      }
    });
    expect(afterWindow.shouldTrigger).toBe(true);
    expect(afterWindow.activeBreakers).toEqual([]);

    // AC never triggers failure cooldown
    const afterAc = evaluateAdaptiveTrigger({
      mode: "adaptive",
      triggerKind: "automatic",
      zoneResult: GREEN_BOILERPLATE,
      nowMs: t0 + 1_000,
      signals: {
        lastFailureRunAtMs: t0,
        lastFailureVerdict: "AC"
      }
    });
    expect(afterAc.shouldTrigger).toBe(true);
  });

  it("triggers anti-drifting breaker after >= 5 consecutive unmodified full-block accepts in 3 min", () => {
    const greenDrifting = evaluateAdaptiveTrigger({
      mode: "adaptive",
      triggerKind: "automatic",
      zoneResult: GREEN_API,
      signals: { consecutiveBlindAcceptsIn3Min: 5 }
    });
    expect(greenDrifting.activeBreakers).toContain("drifting_blind_accept");
    expect(greenDrifting.debounceMs).toBe(1500);
    expect(greenDrifting.statusHint).toBeTruthy();

    const neutralDrifting = evaluateAdaptiveTrigger({
      mode: "adaptive",
      triggerKind: "automatic",
      zoneResult: NEUTRAL,
      signals: { consecutiveBlindAcceptsIn3Min: 5 }
    });
    expect(neutralDrifting.shouldTrigger).toBe(false);
    expect(neutralDrifting.activeBreakers).toContain("drifting_blind_accept");
  });

  it("tracks keystrokes, backspaces, local failure cooldown, and drifting streaks accurately via TriggerSignalTracker", () => {
    const tracker = new TriggerSignalTracker();
    let t = 50_000;

    // 6 backspaces in rapid succession
    for (let i = 0; i < 6; i++) {
      tracker.recordKeystroke(t + i * 100, "backspace");
    }
    expect(tracker.snapshot(t + 600).consecutiveBackspaces).toBe(6);
    expect(tracker.snapshot(t + 600).keysPerSecond).toBe(6);

    // Normal typing resets consecutive backspaces
    t += 2_000;
    tracker.recordKeystroke(t, "normal");
    expect(tracker.snapshot(t).consecutiveBackspaces).toBe(0);
    expect(tracker.snapshot(t).keysPerSecond).toBe(1);

    // 5 unmodified full-block accepts within 3 min trigger drifting
    for (let i = 0; i < 5; i++) {
      tracker.recordGhostTextAccept(t + i * 10_000, { unmodifiedFullBlock: true });
    }
    expect(tracker.snapshot(t + 45_000).consecutiveBlindAcceptsIn3Min).toBe(5);

    // After 3 minutes expire, old blind accepts age out cleanly
    expect(
      tracker.snapshot(t + 45_000 + TRIGGER_THRESHOLDS.DRIFTING_WINDOW_MS + 1)
        .consecutiveBlindAcceptsIn3Min
    ).toBe(0);

    // Word-by-word accept resets consecutive full-block blind streak
    for (let i = 0; i < 4; i++) {
      tracker.recordGhostTextAccept(t + 300_000 + i * 1_000, { unmodifiedFullBlock: true });
    }
    tracker.recordGhostTextAccept(t + 305_000, { unmodifiedFullBlock: false });
    expect(tracker.snapshot(t + 306_000).consecutiveBlindAcceptsIn3Min).toBe(0);

    // Manual edit resets blind-accept streak
    for (let i = 0; i < 5; i++) {
      tracker.recordGhostTextAccept(t + 310_000 + i * 1_000, { unmodifiedFullBlock: true });
    }
    tracker.recordManualEditAfterAccept();
    expect(tracker.snapshot(t + 316_000).consecutiveBlindAcceptsIn3Min).toBe(0);

    // Local WA sets cooldown; AC clears it
    tracker.recordLocalRunVerdict("WA", t + 320_000);
    expect(tracker.snapshot(t + 321_000).lastFailureVerdict).toBe("WA");
    tracker.recordLocalRunVerdict("AC", t + 322_000);
    expect(tracker.snapshot(t + 322_500).lastFailureVerdict).toBeUndefined();
  });
});
