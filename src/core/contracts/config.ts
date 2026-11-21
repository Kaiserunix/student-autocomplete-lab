import type {
  CoachStrictness,
  GhostTextMode,
  MicroFrictionMode,
  TypingSoundPack
} from "./coach";

export type PresetMode = "starter" | "focus" | "contest";

export type AiProviderKind = "openai-compatible" | "openai" | "anthropic" | "ollama";

export interface AiRoleConfig {
  provider: AiProviderKind;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface FeatureFlags {
  preset: PresetMode;
  uiLanguage: "zh-CN" | "en-US";
  starterPackEnabled: boolean;
  shortcutHintsEnabled: boolean;
  ghostTextMode: GhostTextMode;
  strictWordAccept: boolean;
  microFriction: MicroFrictionMode;
  coachStrictness: CoachStrictness;
  patternMapperEnabled: boolean;
  mockInterviewEnabled: boolean;
  stylishRankEnabled: boolean;
  typingSoundEnabled: boolean;
  typingSoundPack: TypingSoundPack;
  typingSoundVolume: number;
  celebrationSoundEnabled: boolean;
  celebrationSoundVolume: number;
}

export const PRESET_DEFAULTS: Record<PresetMode, Partial<FeatureFlags>> = {
  starter: {
    preset: "starter",
    starterPackEnabled: true,
    shortcutHintsEnabled: true,
    ghostTextMode: "adaptive",
    strictWordAccept: false,
    coachStrictness: "gentle",
    patternMapperEnabled: true,
    mockInterviewEnabled: false,
    stylishRankEnabled: true,
    typingSoundEnabled: false,
    celebrationSoundEnabled: false
  },
  focus: {
    preset: "focus",
    starterPackEnabled: false,
    shortcutHintsEnabled: false,
    ghostTextMode: "adaptive",
    strictWordAccept: false,
    coachStrictness: "standard",
    patternMapperEnabled: true,
    mockInterviewEnabled: false,
    stylishRankEnabled: true,
    typingSoundEnabled: false,
    celebrationSoundEnabled: false
  },
  contest: {
    preset: "contest",
    starterPackEnabled: false,
    shortcutHintsEnabled: false,
    ghostTextMode: "manual",
    strictWordAccept: false,
    coachStrictness: "strict",
    patternMapperEnabled: false,
    mockInterviewEnabled: true,
    stylishRankEnabled: true,
    typingSoundEnabled: false,
    celebrationSoundEnabled: false
  }
};
