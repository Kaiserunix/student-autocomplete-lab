import type { SoundEventKind, TypingSoundPack } from "../core/contracts";

export type AudioEngineState = "uninitialized" | "running" | "suspended" | "unsupported";
export interface SfxPlayPayload {
  kind: SoundEventKind; pack: TypingSoundPack; volume: number;
  gainDbOffset: number; pitchJitter: number; overtone: boolean;
}
export interface SwitchAcousticProfile {
  pack: TypingSoundPack; clickFreqHz: number; clickQ: number; clickGain: number;
  clickDurationMs: number; bodyFreqHz: number; bodyEndFreqHz: number; bodyGain: number;
  bodyDurationMs: number; bodyWaveform: OscillatorType; filterType: BiquadFilterType; lowpassCutoffHz: number;
}
export interface ComputedSynthParams {
  kind: SoundEventKind; pack: TypingSoundPack; effectiveGain: number; gainDbApplied: number;
  pitchMultiplier: number; durationMs: number; bodyFreqHz: number; bodyEndFreqHz: number;
  clickFreqHz: number; clickGain: number; clickDurationMs: number; overtoneEnabled: boolean;
  overtoneDurationMs: number; overtoneFreqsHz: number[]; chordFreqsHz: number[];
  chordStepMs: number; lowpassCutoffHz: number;
}
export interface AudioContextLike {
  readonly state: string; readonly currentTime: number; readonly sampleRate: number; readonly destination: AudioNode;
  resume(): Promise<void>; close(): Promise<void>;
  createOscillator(): OscillatorNode; createGain(): GainNode; createBiquadFilter(): BiquadFilterNode;
  createBuffer(channels: number, length: number, sampleRate: number): AudioBuffer; createBufferSource(): AudioBufferSourceNode;
}
export type AudioContextCtorLike = new () => AudioContextLike;
export interface AudioSynthOptions { random?: () => number; audioContextCtor?: AudioContextCtorLike | null; }

export const BACKSPACE_DEFAULT_GAIN_DB = -4;
export const PITCH_JITTER_MAX = 0.03;
export const OVERTONE_DECAY_MS = 15;
export const THUD_FREQ_HZ = 110;
export const THUD_DURATION_MS = 45;

type ProfTuple = [number, number, number, number, number, number, number, number, OscillatorType, BiquadFilterType, number];
const RAW: Record<TypingSoundPack, ProfTuple> = {
  "crisp-blue": [3250, 2.6, 0.72, 14, 430, 190, 0.55, 24, "triangle", "bandpass", 5200],
  "muted-brown": [1480, 1.5, 0.44, 16, 245, 118, 0.74, 28, "triangle", "bandpass", 2400],
  "soft-drop": [760, 0.9, 0.24, 18, 176, 94, 0.78, 32, "sine", "lowpass", 1100]
};

const mkP = (pack: TypingSoundPack, a: ProfTuple): SwitchAcousticProfile => ({
  pack, clickFreqHz: a[0], clickQ: a[1], clickGain: a[2], clickDurationMs: a[3],
  bodyFreqHz: a[4], bodyEndFreqHz: a[5], bodyGain: a[6], bodyDurationMs: a[7],
  bodyWaveform: a[8], filterType: a[9], lowpassCutoffHz: a[10]
});

export const SWITCH_PROFILES: Record<TypingSoundPack, SwitchAcousticProfile> = {
  "crisp-blue": /* @__PURE__ */ mkP("crisp-blue", RAW["crisp-blue"]),
  "muted-brown": /* @__PURE__ */ mkP("muted-brown", RAW["muted-brown"]),
  "soft-drop": /* @__PURE__ */ mkP("soft-drop", RAW["soft-drop"])
};

export const clampVolume = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);
export const dbToLinearGain = (db: number): number => (Number.isFinite(db) ? Math.pow(10, db / 20) : 1);
export const isTypingEvent = (k: SoundEventKind): boolean => k.startsWith("key_");
const rnd = (n: number, s = 100): number => Math.round(n * s) / s;

export function computePitchMultiplier(j: number | undefined, k: SoundEventKind, rand: () => number = Math.random): number {
  if (!isTypingEvent(k)) return 1;
  if (typeof j === "number" && Number.isFinite(j)) {
    if (j >= 0.9 && j <= 1.1) return rnd(Math.max(0.97, Math.min(1.03, j)), 1e4);
    if (j !== 0 && Math.abs(j) < 0.1) return rnd(1 + Math.max(-0.03, Math.min(0.03, j)), 1e4);
  }
  return rnd(1 + (rand() * 2 - 1) * PITCH_JITTER_MAX, 1e4);
}

type CalcTuple = [
  TypingSoundPack, number, number, number, number, number, number, number, number, number,
  boolean, number, number[], number[], number, number
];

function calc(p: SfxPlayPayload, rand: () => number): CalcTuple {
  const pack: TypingSoundPack = RAW[p.pack] ? p.pack : "muted-brown";
  const a = RAW[pack];
  const pitch = computePitchMultiplier(p.pitchJitter, p.kind, rand);
  const rawDb = Number.isFinite(p.gainDbOffset) ? p.gainDbOffset : 0;
  const db = p.kind === "key_backspace" && rawDb >= 0 ? BACKSPACE_DEFAULT_GAIN_DB : rawDb;
  const eg = rnd(clampVolume(p.volume) * dbToLinearGain(db), 1e4);
  if (p.kind === "chime_pass") return [pack, eg, db, 1, 210, 523.25, 523.25, 0, 0, 0, false, 0, [], [523.25, 659.25, 783.99], 18, 2800];
  if (p.kind === "chime_rank_up") return [pack, eg, db, 1, 250, 587.33, 587.33, 0, 0, 0, false, 0, [], [587.33, 739.99, 880, 1174.66], 22, 3200];
  if (p.kind === "thud_penalty") return [pack, eg, db, 1, THUD_DURATION_MS, THUD_FREQ_HZ, 84, 0, 0, 0, false, 0, [], [], 0, 220];
  const [ks, ds, cs] = p.kind === "key_enter" ? [0.78, 1.22, 0.92] : p.kind === "key_backspace" ? [0.91, 0.85, 0.8] : p.kind === "key_punct_close" ? [1.05, 0.95, 1] : [1, 1, 1];
  const cp = pitch * ks;
  const ov = p.overtone && (p.kind === "key_punct_close" || p.kind === "key_enter");
  return [pack, eg, db, pitch, Math.round(a[7] * ds), rnd(a[4] * cp), rnd(a[5] * cp), rnd(a[0] * cp), rnd(a[2] * cs), a[3], ov, ov ? OVERTONE_DECAY_MS : 0, ov ? [rnd(2640 * pitch), rnd(3960 * pitch)] : [], [], 0, a[10]];
}

export function computeSynthParams(p: SfxPlayPayload, rand: () => number = Math.random): ComputedSynthParams {
  const c = calc(p, rand);
  return {
    kind: p.kind, pack: c[0], effectiveGain: c[1], gainDbApplied: c[2], pitchMultiplier: c[3],
    durationMs: c[4], bodyFreqHz: c[5], bodyEndFreqHz: c[6], clickFreqHz: c[7], clickGain: c[8],
    clickDurationMs: c[9], overtoneEnabled: c[10], overtoneDurationMs: c[11], overtoneFreqsHz: c[12],
    chordFreqsHz: c[13], chordStepMs: c[14], lowpassCutoffHz: c[15]
  };
}

export class AudioSynthEngine {
  private ctx: AudioContextLike | null = null;
  private noise: AudioBuffer | null = null;
  private readonly rand: () => number;
  private readonly ctor: AudioContextCtorLike | null;

  constructor(opts?: AudioSynthOptions) {
    this.rand = opts?.random ?? Math.random;
    const g = globalThis as unknown as { AudioContext?: AudioContextCtorLike; webkitAudioContext?: AudioContextCtorLike };
    this.ctor = opts && "audioContextCtor" in opts ? (opts.audioContextCtor ?? null) : (g.AudioContext ?? g.webkitAudioContext ?? null);
  }

  getState(): AudioEngineState {
    return !this.ctor ? "unsupported" : !this.ctx ? "uninitialized" : this.ctx.state === "running" ? "running" : this.ctx.state === "suspended" ? "suspended" : "unsupported";
  }

  async unlockFromUserGesture(): Promise<AudioEngineState> {
    if (!this.ctor) return "unsupported";
    try { this.ctx ??= new this.ctor(); if (this.ctx.state === "suspended") await this.ctx.resume(); this.getNoise(); } catch {}
    return this.getState();
  }
  play(payload: SfxPlayPayload): boolean {
    if (!this.ctor) return false;
    const [pack, eg, , , dur, bf0, bf1, cf, cg, cd, ov, od, ofs, chs, cs, lp] = calc(payload, this.rand);
    if (eg <= 5e-4) return false;
    try { this.ctx ??= new this.ctor(); } catch { return false; }
    if (this.ctx.state !== "running") return false;
    const c = this.ctx, t0 = c.currentTime;
    const env = (g: GainNode, st: number, pk: number, dSec: number, atk = 0.002) => {
      g.gain.setValueAtTime(1e-4, st); g.gain.linearRampToValueAtTime(pk, st + atk); g.gain.exponentialRampToValueAtTime(1e-4, st + dSec);
    };
    const tone = (st: number, w: OscillatorType, f0: number, f1: number, dSec: number, pk: number, lpf: number, dst: AudioNode) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = w; o.frequency.setValueAtTime(f0, st);
      if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, st + dSec);
      env(g, st, pk, dSec);
      if (lpf > 0) { const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(lpf, st); o.connect(f); f.connect(g); }
      else o.connect(g);
      g.connect(dst); o.start(st); o.stop(st + dSec + 0.004);
    };
    if (chs.length) {
      const f = c.createBiquadFilter(); f.type = "lowpass"; f.frequency.setValueAtTime(lp, t0); f.connect(c.destination);
      const pk = Math.min(0.32, (eg * 0.65) / chs.length);
      chs.forEach((hz, i) => tone(t0 + (i * cs) / 1000, "sine", hz, hz, (dur - i * cs) / 1000 + 0.02, pk, 0, f));
    } else if (payload.kind === "thud_penalty") {
      tone(t0, "sine", bf0, 84, dur / 1000, eg * 0.55, lp, c.destination);
    } else {
      const a = RAW[pack], m = c.createGain();
      m.gain.setValueAtTime(eg, t0); m.connect(c.destination);
      const nb = this.getNoise();
      if (nb && cg > 0) {
        const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
        s.buffer = nb; f.type = a[9]; f.frequency.setValueAtTime(cf, t0); f.Q.setValueAtTime(a[1], t0);
        env(g, t0, cg * 0.55, cd / 1000, 0.0015);
        s.connect(f); f.connect(g); g.connect(m); s.start(t0); s.stop(t0 + cd / 1000 + 0.004);
      }
      tone(t0, a[8], bf0, Math.max(40, bf1), dur / 1000, a[6] * 0.45, lp, m);
      if (ov) ofs.forEach((hz, i) => tone(t0, "sine", hz, hz, od / 1000, i ? 0.07 : 0.14, 0, m));
    }
    return true;
  }
  async dispose(): Promise<void> {
    if (!this.ctx) return;
    try { await this.ctx.close(); } catch {}
    this.ctx = this.noise = null;
  }

  private getNoise(): AudioBuffer | null {
    if (!this.ctx) return null;
    if (this.noise) return this.noise;
    const sr = this.ctx.sampleRate || 44100, len = Math.max(256, Math.floor(sr * 0.03));
    const buf = this.ctx.createBuffer(1, len, sr), ch = buf.getChannelData(0);
    for (let i = 0; i < len; i++) ch[i] = (this.rand() * 2 - 1) * Math.exp((-i / len) * 5.5);
    return (this.noise = buf);
  }
}

export const createAudioSynth = (opts?: AudioSynthOptions): AudioSynthEngine => new AudioSynthEngine(opts);
