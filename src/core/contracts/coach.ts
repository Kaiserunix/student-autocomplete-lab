import type { SupportedLanguage } from "./problem";

export type HintLevel = 0 | 1 | 2 | 3 | 4 | 5;

export type CoachAction =
  | "hint"
  | "followUp"
  | "dryRun"
  | "patternMap"
  | "review"
  | "giveUp";

export type CoachStrictness = "gentle" | "standard" | "strict";

export type StuckCategory = "no_idea" | "tle" | "partial_wa" | "implementation";

export type CoachLeakCategory =
  | "fenced_code_block"
  | "full_program_skeleton"
  | "reference_solution_overlap"
  | "prompt_injection_echo"
  | "secret_or_path_leak"
  | "excessive_code_lines";

export interface CoachSpoilerViolation {
  field: string;
  category: CoachLeakCategory;
  detail: string;
}

export interface ProjectedContextItem {
  id: string;
  kind: "concept_level" | "active_misconception" | "preference" | "code_habit";
  label: string;
  sourceKey?: string;
  muteable: boolean;
}

export interface ProjectionAudit {
  route: "coach" | "autocomplete";
  language: SupportedLanguage;
  renderer: "deepseek-fim" | "chat-messages" | "anthropic-messages" | "generic-completion";
  includedRuleIds: string[];
  excludedRules: Array<{ id: string; reason: string }>;
  projectedItems: ProjectedContextItem[];
  characterBudgetUsed: number;
  characterBudgetMax: number;
}

export interface CoachResponsePayload {
  action: CoachAction;
  hintLevel: HintLevel;
  strictness: CoachStrictness;
  stuckCategory?: StuckCategory;
  headline: string;
  guidance: string;
  guidingQuestion?: string;
  dryRunPrompt?: {
    minimalInput: string;
    question: string;
  };
  misconceptionIds: string[];
  conceptTags: string[];
  spoilerSafe: boolean;
  violations: CoachSpoilerViolation[];
  audit: ProjectionAudit;
}

export type AutocompleteZone = "boilerplate" | "api_syntax" | "neutral" | "algo_core";

export type GhostTextMode = "adaptive" | "fast-syntax" | "manual" | "off";

export type MicroFrictionMode = "off" | "multi-choice" | "lead-and-reveal";

export interface LexicalZoneResult {
  zone: AutocompleteZone;
  spoilerRisk: "low" | "high";
  reason: string;
  maxLines: number;
  maxTokens: number;
}

export type StylishRankLetter = "D" | "C" | "B" | "A" | "S" | "SS" | "SSS";

export interface StylishRankMeta {
  rank: StylishRankLetter;
  codeName: string;
  zhName: string;
  minScore: number;
  maxScore: number;
  statusBarLabel: string;
}

export interface StylishRankState {
  problemKey: string;
  score: number;
  effectiveRank: StylishRankLetter;
  meta: StylishRankMeta;
  hintCeiling: StylishRankLetter;
  pasteCeiling: StylishRankLetter;
  gateCeiling: StylishRankLetter;
  ceilingReason?: string;
  blindTabCount: number;
  failedRuns: number;
  originalSamplesPassed: number;
  originalSamplesTotal: number;
  customEdgePassedCount: number;
  officialAc: boolean;
  frozenUntilMs: number;
  lastEventSummary: string;
}

export type TypingSoundPack = "crisp-blue" | "muted-brown" | "soft-drop";

export type SoundEventKind =
  | "key_normal"
  | "key_enter"
  | "key_backspace"
  | "key_punct_close"
  | "chime_pass"
  | "chime_rank_up"
  | "thud_penalty";
