import { describe, expect, it, vi } from "vitest";
import {
  AudioSynthEngine,
  BACKSPACE_DEFAULT_GAIN_DB,
  computePitchMultiplier,
  computeSynthParams,
  dbToLinearGain,
  OVERTONE_DECAY_MS,
  SWITCH_PROFILES,
  THUD_DURATION_MS,
  THUD_FREQ_HZ,
  type AudioContextLike,
  type SfxPlayPayload
} from "../../src/webview/audioSynth";

function createMockAudioContext(initialState: "suspended" | "running" = "suspended") {
  let state: "suspended" | "running" | "closed" = initialState;
  const startedOscillators: number[] = [];
  const startedNoise: number[] = [];

  const createParam = () => ({
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn()
  });

  const ctx: AudioContextLike = {
    get state() {
      return state;
    },
    currentTime: 1.5,
    sampleRate: 44100,
    destination: {} as AudioNode,
    resume: vi.fn(async () => {
      if (state === "suspended") {
        state = "running";
      }
    }),
    close: vi.fn(async () => {
      state = "closed";
    }),
    createOscillator: vi.fn(() => {
      const osc = {
        type: "sine" as OscillatorType,
        frequency: createParam(),
        connect: vi.fn(),
        start: vi.fn((when = 0) => {
          startedOscillators.push(when);
        }),
        stop: vi.fn()
      };
      return osc as unknown as OscillatorNode;
    }),
    createGain: vi.fn(() => {
      return {
        gain: createParam(),
        connect: vi.fn()
      } as unknown as GainNode;
    }),
    createBiquadFilter: vi.fn(() => {
      return {
        type: "lowpass" as BiquadFilterType,
        frequency: createParam(),
        Q: createParam(),
        connect: vi.fn()
      } as unknown as BiquadFilterNode;
    }),
    createBuffer: vi.fn((_channels: number, length: number) => {
      const data = new Float32Array(length);
      return {
        getChannelData: () => data
      } as unknown as AudioBuffer;
    }),
    createBufferSource: vi.fn(() => {
      return {
        buffer: null,
        connect: vi.fn(),
        start: vi.fn((when = 0) => {
          startedNoise.push(when);
        }),
        stop: vi.fn()
      } as unknown as AudioBufferSourceNode;
    })
  };

  return { ctx, startedOscillators, startedNoise };
}

describe("audioSynth parameter computation", () => {
  it("differentiates all 3 mechanical switch packs (crisp-blue, muted-brown, soft-drop)", () => {
    expect(SWITCH_PROFILES["crisp-blue"].clickFreqHz).toBeGreaterThan(
      SWITCH_PROFILES["muted-brown"].clickFreqHz
    );
    expect(SWITCH_PROFILES["muted-brown"].clickFreqHz).toBeGreaterThan(
      SWITCH_PROFILES["soft-drop"].clickFreqHz
    );
    expect(SWITCH_PROFILES["soft-drop"].filterType).toBe("lowpass");
    expect(SWITCH_PROFILES["soft-drop"].bodyWaveform).toBe("sine");
  });

  it("computes +/-3% pitch jitter safely for signed offsets, playbackRate multipliers, and random fallback", () => {
    expect(computePitchMultiplier(0.02, "key_normal")).toBe(1.02);
    expect(computePitchMultiplier(-0.08, "key_normal")).toBe(0.97);
    expect(computePitchMultiplier(1.025, "key_normal")).toBe(1.025);
    expect(computePitchMultiplier(0.94, "key_normal")).toBe(0.97);
    expect(computePitchMultiplier(0, "key_normal", () => 0)).toBe(0.97);
    expect(computePitchMultiplier(0, "key_normal", () => 1)).toBe(1.03);
    expect(computePitchMultiplier(0.03, "chime_pass")).toBe(1);
    expect(computePitchMultiplier(-0.03, "thud_penalty")).toBe(1);
  });

  it("applies -4dB attenuation to key_backspace and lower stabilizer pitch to key_enter", () => {
    const base: SfxPlayPayload = {
      kind: "key_normal",
      pack: "muted-brown",
      volume: 0.5,
      gainDbOffset: 0,
      pitchJitter: 1,
      overtone: false
    };

    const normal = computeSynthParams(base);
    const enter = computeSynthParams({ ...base, kind: "key_enter" });
    const backspaceExplicit = computeSynthParams({
      ...base,
      kind: "key_backspace",
      gainDbOffset: BACKSPACE_DEFAULT_GAIN_DB
    });
    const backspaceDefault = computeSynthParams({
      ...base,
      kind: "key_backspace",
      gainDbOffset: 0
    });

    expect(enter.bodyFreqHz).toBeLessThan(normal.bodyFreqHz);
    expect(enter.durationMs).toBeGreaterThan(normal.durationMs);
    expect(backspaceExplicit.gainDbApplied).toBe(-4);
    expect(backspaceDefault.gainDbApplied).toBe(-4);
    expect(backspaceExplicit.effectiveGain).toBeCloseTo(0.5 * dbToLinearGain(-4), 3);
    expect(backspaceExplicit.effectiveGain).toBeLessThan(normal.effectiveGain);
  });

  it("enables 15ms metallic overtone on key_punct_close when overtone is true", () => {
    const withOvertone = computeSynthParams({
      kind: "key_punct_close",
      pack: "crisp-blue",
      volume: 0.4,
      gainDbOffset: 0,
      pitchJitter: 1,
      overtone: true
    });
    const withoutOvertone = computeSynthParams({
      kind: "key_punct_close",
      pack: "crisp-blue",
      volume: 0.4,
      gainDbOffset: 0,
      pitchJitter: 1,
      overtone: false
    });

    expect(withOvertone.overtoneEnabled).toBe(true);
    expect(withOvertone.overtoneDurationMs).toBe(OVERTONE_DECAY_MS);
    expect(withOvertone.overtoneFreqsHz.length).toBe(2);
    expect(withoutOvertone.overtoneEnabled).toBe(false);
    expect(withoutOvertone.overtoneFreqsHz.length).toBe(0);
  });

  it("computes restrained triad chimes (180-260ms) and 45ms ~110Hz penalty thud", () => {
    const pass = computeSynthParams({
      kind: "chime_pass",
      pack: "muted-brown",
      volume: 0.35,
      gainDbOffset: 0,
      pitchJitter: 0,
      overtone: true
    });
    const rankUp = computeSynthParams({
      kind: "chime_rank_up",
      pack: "muted-brown",
      volume: 0.35,
      gainDbOffset: 0,
      pitchJitter: 0,
      overtone: true
    });
    const thud = computeSynthParams({
      kind: "thud_penalty",
      pack: "muted-brown",
      volume: 0.35,
      gainDbOffset: 0,
      pitchJitter: 0,
      overtone: false
    });

    expect(pass.durationMs).toBeGreaterThanOrEqual(180);
    expect(pass.durationMs).toBeLessThanOrEqual(260);
    expect(pass.chordFreqsHz.length).toBe(3);

    expect(rankUp.durationMs).toBeGreaterThanOrEqual(180);
    expect(rankUp.durationMs).toBeLessThanOrEqual(260);
    expect(rankUp.chordFreqsHz.length).toBe(4);

    expect(thud.durationMs).toBe(THUD_DURATION_MS);
    expect(thud.bodyFreqHz).toBe(THUD_FREQ_HZ);
    expect(thud.lowpassCutoffHz).toBeLessThanOrEqual(250);
  });
});

describe("AudioSynthEngine state machine", () => {
  it("degrades safely to unsupported in Node without AudioContext", async () => {
    const synth = new AudioSynthEngine({ audioContextCtor: null });
    expect(synth.getState()).toBe("unsupported");
    expect(await synth.unlockFromUserGesture()).toBe("unsupported");
    expect(
      synth.play({
        kind: "key_normal",
        pack: "muted-brown",
        volume: 0.3,
        gainDbOffset: 0,
        pitchJitter: 0,
        overtone: false
      })
    ).toBe(false);
  });

  it("transitions uninitialized -> running via unlockFromUserGesture and synthesizes all events", async () => {
    const mock = createMockAudioContext("suspended");
    class MockCtor {
      constructor() {
        return mock.ctx;
      }
    }
    const synth = new AudioSynthEngine({
      audioContextCtor: MockCtor as unknown as new () => AudioContextLike,
      random: () => 0.5
    });

    expect(synth.getState()).toBe("uninitialized");

    // Suspended context refuses play until user gesture unlock
    expect(
      synth.play({
        kind: "key_normal",
        pack: "crisp-blue",
        volume: 0.3,
        gainDbOffset: 0,
        pitchJitter: 0,
        overtone: false
      })
    ).toBe(false);
    expect(synth.getState()).toBe("suspended");

    const unlocked = await synth.unlockFromUserGesture();
    expect(unlocked).toBe("running");
    expect(mock.ctx.resume).toHaveBeenCalledTimes(1);

    // Zero volume skips playback
    expect(
      synth.play({
        kind: "key_normal",
        pack: "crisp-blue",
        volume: 0,
        gainDbOffset: 0,
        pitchJitter: 0,
        overtone: false
      })
    ).toBe(false);

    // Play key_punct_close with overtone, chime_pass, chime_rank_up, thud_penalty
    expect(
      synth.play({
        kind: "key_punct_close",
        pack: "crisp-blue",
        volume: 0.3,
        gainDbOffset: 0,
        pitchJitter: 0.01,
        overtone: true
      })
    ).toBe(true);
    expect(mock.startedNoise.length).toBe(1);
    expect(mock.startedOscillators.length).toBe(3); // 1 body + 2 overtones

    expect(
      synth.play({
        kind: "chime_pass",
        pack: "muted-brown",
        volume: 0.35,
        gainDbOffset: 0,
        pitchJitter: 0,
        overtone: false
      })
    ).toBe(true);
    expect(mock.startedOscillators.length).toBe(6);

    expect(
      synth.play({
        kind: "thud_penalty",
        pack: "soft-drop",
        volume: 0.35,
        gainDbOffset: 0,
        pitchJitter: 0,
        overtone: false
      })
    ).toBe(true);
    expect(mock.startedOscillators.length).toBe(7);

    await synth.dispose();
    expect(mock.ctx.close).toHaveBeenCalledTimes(1);
    expect(synth.getState()).toBe("uninitialized");
  });
});
