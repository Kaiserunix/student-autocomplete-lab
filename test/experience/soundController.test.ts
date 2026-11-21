import { describe, expect, it } from "vitest";
import type { LocalRunResult, OfficialVerdictEvent } from "../../src/core/contracts";
import {
  BACKSPACE_GAIN_DB,
  PUNCT_CLOSE_OVERTONE_DECAY_MS,
  SoundController,
  StylishRankEngine,
  THUD_PENALTY_DURATION_MS,
  THUD_PENALTY_FREQUENCY_HZ,
  TYPING_SOUND_THROTTLE_MS,
  type SoundDispatchPayload
} from "../../src/experience";

const EMOJI_RE = /\p{Extended_Pictographic}/u;

function makeAcRun(): LocalRunResult {
  return {
    schemaVersion: "local-run/v2",
    source: "local_runner",
    problemKey: "warmup:stdio-sum",
    language: "python",
    mode: "stdio",
    codeHash: "h-ac",
    compileOk: true,
    allPassed: true,
    originalTotal: 2,
    originalPassed: 2,
    customTotal: 0,
    customPassed: 0,
    cases: [
      {
        id: "orig-1",
        isOriginal: true,
        verdict: "AC",
        durationMs: 5,
        input: "1 2\n",
        expected: "3\n",
        actual: "3\n",
        stderr: ""
      },
      {
        id: "orig-2",
        isOriginal: true,
        verdict: "AC",
        durationMs: 5,
        input: "0 0\n",
        expected: "0\n",
        actual: "0\n",
        stderr: ""
      }
    ],
    memoryNote: "local",
    timestamp: "2026-11-22T00:00:00.000Z"
  };
}

describe("SoundController (anti-embarrassment acoustic scheduler)", () => {
  it("defaults completely OFF with status bar mute indicator hidden", () => {
    const emitted: SoundDispatchPayload[] = [];
    const controller = new SoundController({ onEmit: (p) => emitted.push(p) });

    expect(controller.getStatusBarIndicator().visible).toBe(false);
    expect(
      controller.handleDocumentChange({
        contentChanges: [{ text: "a", rangeLength: 0 }],
        timestampMs: 1_000
      })
    ).toBeNull();
    expect(controller.handleLocalRunResult(makeAcRun(), 2_000)).toBeNull();
    expect(emitted).toHaveLength(0);
  });

  it("independently gates typing vs celebration audio, auto-silences on blur, and supports one-click mute", () => {
    const controller = new SoundController({
      typingSoundEnabled: true,
      celebrationSoundEnabled: false,
      typingSoundVolume: 0.25,
      celebrationSoundVolume: 0.35,
      random: () => 0.5
    });

    // Indicator visible when at least one channel enabled; uses codicons with zero Emoji
    const indicator = controller.getStatusBarIndicator();
    expect(indicator.visible).toBe(true);
    expect(indicator.codicon).toBe("$(unmute)");
    expect(EMOJI_RE.test(indicator.tooltip)).toBe(false);

    // Typing fires; celebration stays silent
    expect(
      controller.handleDocumentChange({
        contentChanges: [{ text: "x", rangeLength: 0 }],
        timestampMs: 1_000
      })?.kind
    ).toBe("key_normal");
    expect(controller.handleLocalRunResult(makeAcRun(), 1_100)).toBeNull();

    // Window blur silences ALL audio immediately
    controller.setWindowFocused(false);
    expect(
      controller.handleDocumentChange({
        contentChanges: [{ text: "y", rangeLength: 0 }],
        timestampMs: 2_000
      })
    ).toBeNull();

    // Refocus + one-click mute toggle silences and updates codicon
    controller.setWindowFocused(true);
    expect(controller.toggleMute()).toBe(true);
    expect(controller.getStatusBarIndicator().codicon).toBe("$(mute)");
    expect(
      controller.handleDocumentChange({
        contentChanges: [{ text: "z", rangeLength: 0 }],
        timestampMs: 3_000
      })
    ).toBeNull();
  });

  it("filters Undo/Redo, multi-segment formatter edits, bulk paste (text.length > 5), and enforces 40ms cooldown", () => {
    const controller = new SoundController({
      typingSoundEnabled: true,
      random: () => 0.5
    });

    // Undo / Redo filtered
    expect(
      controller.handleDocumentChange({
        reason: "undo",
        contentChanges: [{ text: "a", rangeLength: 0 }],
        timestampMs: 1_000
      })
    ).toBeNull();
    expect(
      controller.handleDocumentChange({
        reason: "redo",
        contentChanges: [{ text: "a", rangeLength: 0 }],
        timestampMs: 1_100
      })
    ).toBeNull();

    // Multi-segment formatter edit filtered
    expect(
      controller.handleDocumentChange({
        contentChanges: [
          { text: " ", rangeLength: 0 },
          { text: " ", rangeLength: 0 }
        ],
        timestampMs: 1_200
      })
    ).toBeNull();

    // Bulk paste (length > 5) filtered
    expect(
      controller.handleDocumentChange({
        contentChanges: [{ text: "abcdef", rangeLength: 0 }],
        timestampMs: 1_300
      })
    ).toBeNull();

    // Global 40ms throttle cooldown
    const first = controller.handleDocumentChange({
      contentChanges: [{ text: "a", rangeLength: 0 }],
      timestampMs: 2_000
    });
    expect(first?.kind).toBe("key_normal");

    // 39ms later -> throttled!
    expect(
      controller.handleDocumentChange({
        contentChanges: [{ text: "b", rangeLength: 0 }],
        timestampMs: 2_000 + TYPING_SOUND_THROTTLE_MS - 1
      })
    ).toBeNull();

    // Exactly 40ms later -> allowed!
    const afterCooldown = controller.handleDocumentChange({
      contentChanges: [{ text: "c", rangeLength: 0 }],
      timestampMs: 2_000 + TYPING_SOUND_THROTTLE_MS
    });
    expect(afterCooldown?.kind).toBe("key_normal");
  });

  it("maps Enter, Backspace (-4dB), closing punctuation at rank >= A, and applies +/-3% playbackRate jitter", () => {
    let rng = 0; // maps to -3% (0.97)
    const controller = new SoundController({
      typingSoundEnabled: true,
      typingSoundPack: "crisp-blue",
      typingSoundVolume: 0.25,
      currentRank: "B",
      random: () => rng
    });

    // Enter -> key_enter
    const enter = controller.handleDocumentChange({
      contentChanges: [{ text: "\n  ", rangeLength: 0 }],
      timestampMs: 1_000
    });
    expect(enter?.kind).toBe("key_enter");
    expect(enter?.pack).toBe("crisp-blue");
    expect(enter?.playbackRate).toBe(0.97);
    expect(enter?.harmonicAccent).toBe(false);

    // Backspace -> key_backspace with -4dB attenuation
    rng = 1; // maps to +3% (1.03)
    const backspace = controller.handleDocumentChange({
      contentChanges: [{ text: "", rangeLength: 1 }],
      timestampMs: 1_100
    });
    expect(backspace?.kind).toBe("key_backspace");
    expect(backspace?.gainDb).toBe(BACKSPACE_GAIN_DB);
    expect(backspace!.gainLinear).toBeLessThan(0.25);
    expect(backspace?.playbackRate).toBe(1.03);

    // ';' at rank B (< A) -> key_normal without harmonic accent
    const semiLowRank = controller.handleDocumentChange({
      contentChanges: [{ text: ";", rangeLength: 0 }],
      timestampMs: 1_200
    });
    expect(semiLowRank?.kind).toBe("key_normal");
    expect(semiLowRank?.harmonicAccent).toBe(false);

    // Promote to rank A -> ';', '}', ')' map to key_punct_close with crisp overtone accent
    controller.setCurrentRank("A");
    for (const [idx, ch] of [";", "}", ")"].entries()) {
      const punct = controller.handleDocumentChange({
        contentChanges: [{ text: ch, rangeLength: 0 }],
        timestampMs: 1_300 + idx * 100
      });
      expect(punct?.kind).toBe("key_punct_close");
      expect(punct?.harmonicAccent).toBe(true);
      expect(punct?.overtoneDecayMs).toBe(PUNCT_CLOSE_OVERTONE_DECAY_MS);
    }
  });

  it("integrates with StylishRankEngine for chime_rank_up (S+), chime_pass (AC), and thud_penalty (penalty drop)", () => {
    const engine = new StylishRankEngine({
      problemKey: "warmup:stdio-sum",
      now: () => 0
    });
    const controller = new SoundController({
      typingSoundEnabled: false,
      celebrationSoundEnabled: true,
      celebrationSoundVolume: 0.35
    });

    // Advance to B (rank < S -> no rank_up chime)
    const lines = Array.from({ length: 14 }, (_, i) => `int value_${i} = arr[${i}] + 1;`);
    const bTrans = engine.recordHandTypedLines({ lines, lspErrorCount: 0, nowMs: 1_000 });
    expect(controller.handleRankTransition(bTrans, 1_000)).toBeNull();
    expect(controller.getCurrentRank()).toBe("B");

    // Local all-green promotes B -> S -> chime_rank_up AND chime_pass
    const acRun = makeAcRun();
    const sTrans = engine.recordLocalRun(acRun, { nowMs: 2_000 });
    expect(sTrans.currentRank).toBe("S");
    const rankUpSound = controller.handleRankTransition(sTrans, 2_000);
    expect(rankUpSound?.kind).toBe("chime_rank_up");
    expect(rankUpSound?.rank).toBe("S");

    const passSound = controller.handleLocalRunResult(acRun, 2_050);
    expect(passSound?.kind).toBe("chime_pass");

    // Official AC -> chime_pass
    const officialAc: OfficialVerdictEvent = {
      schemaVersion: "official-verdict/v2",
      source: "official_oj",
      problemKey: "warmup:stdio-sum",
      platform: "codeforces",
      verdict: "AC",
      observedVia: "public_api",
      timestamp: "2026-11-22T00:01:00.000Z"
    };
    expect(controller.handleOfficialVerdict(officialAc, 2_500)?.kind).toBe("chime_pass");

    // Large paste causes penalty demotion S -> C -> thud_penalty (~110Hz / 45ms)
    const pasteTrans = engine.recordPaste({
      text: Array.from({ length: 7 }, (_, i) => `int copied_${i} = data[${i}];`).join("\n"),
      inSolutionBody: true,
      nowMs: 3_000
    });
    expect(pasteTrans.demoted).toBe(true);
    expect(pasteTrans.penaltyTriggered).toBe("paste_cap");

    const thud = controller.handleRankTransition(pasteTrans, 3_000);
    expect(thud?.kind).toBe("thud_penalty");
    expect(thud?.frequencyHz).toBe(THUD_PENALTY_FREQUENCY_HZ);
    expect(thud?.durationMs).toBe(THUD_PENALTY_DURATION_MS);

    // Penalty thud also works when ONLY typingSoundEnabled is true, and stays silent when both are OFF
    const typingOnly = new SoundController({
      typingSoundEnabled: true,
      celebrationSoundEnabled: false,
      typingSoundVolume: 0.25
    });
    expect(typingOnly.handleRankTransition(pasteTrans, 4_000)?.kind).toBe("thud_penalty");

    const allOff = new SoundController({
      typingSoundEnabled: false,
      celebrationSoundEnabled: false
    });
    expect(allOff.handleRankTransition(pasteTrans, 4_000)).toBeNull();
  });
});
