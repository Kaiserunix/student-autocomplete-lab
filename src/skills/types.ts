export type SkillRoute = "coach" | "autocomplete";
export type NormalizedSkillLanguage = "python" | "c" | "cpp" | "rust" | "generic";
export type SkillLayer = "head" | "body" | "tail" | "footer";
export type SkillRuleStrength = "hard" | "soft";
export type SkillRuleSource = "core" | "output" | "action" | "language" | "learner";
export type SkillEnforcement = "prompt" | "stop" | "validator" | "prompt-and-validator";
export type CoachSkillAction = "hint" | "specific" | "followUp" | "giveUp" | "recommend";
export type SkillRendererId =
  | "unrendered"
  | "deepseek-fim"
  | "chat-messages"
  | "codex-text"
  | "generic-completion";

export interface SkillRule {
  id: string;
  policyKey: string;
  route: SkillRoute;
  layer: SkillLayer;
  strength: SkillRuleStrength;
  source: SkillRuleSource;
  priority: number;
  instruction: string;
  compactInstruction?: string;
  enforcement: SkillEnforcement;
  language?: NormalizedSkillLanguage;
}

export interface ExcludedSkillRule {
  id: string;
  reason:
    | "conflict"
    | "disabled"
    | "wrong-diagnosis"
    | "not-relevant"
    | "route-mismatch"
    | "language-mismatch"
    | "budget"
    | "renderer-budget"
    | "renderer-unsupported"
    | "duplicate"
    | "unmapped";
}

export interface LearnerRuleSelection {
  rules: SkillRule[];
  excludedRules: ExcludedSkillRule[];
  budget: number;
  characterBudget: number;
  usedCharacters: number;
}

export interface SkillOutputContract {
  id:
    | "autocomplete.code-only-v1"
    | "coach.teaching-json-v1"
    | "coach.follow-up-json-v1";
  mode: "code-only" | "teaching-json" | "coach-follow-up-json";
  maxLines?: number;
  responseFormat?: "json_object";
}

export interface SkillPlanAudit {
  route: SkillRoute;
  language: NormalizedSkillLanguage;
  renderer: SkillRendererId;
  includedRuleIds: string[];
  excludedRules: ExcludedSkillRule[];
  learnerRuleCount: number;
  learnerRuleBudget: number;
  learnerCharacterCount: number;
  learnerCharacterBudget: number;
  enforcementKinds: SkillEnforcement[];
}

export interface SkillPlan {
  route: SkillRoute;
  language: NormalizedSkillLanguage;
  rules: SkillRule[];
  output: SkillOutputContract;
  audit: SkillPlanAudit;
}

export interface AutocompleteSkillContext {
  prefix: string;
  suffix: string;
  language: NormalizedSkillLanguage;
  fileLabel: string;
}

export interface ProviderCapabilities {
  renderer: Exclude<SkillRendererId, "unrendered">;
  requestShape: "fim" | "chat" | "anthropic-messages" | "codex-text" | "completion";
  supportsSystemInstruction: boolean;
  supportsFimSuffix: boolean;
  supportsStopSequences: boolean;
  prefixCacheFriendly: boolean;
  configurationIssue?: "deepseek-fim-beta-required";
}

export interface RenderedAutocompleteSkillRequest {
  prompt: string;
  systemInstruction?: string;
  suffix?: string;
  stop?: string[];
  maxLines: number;
  audit: SkillPlanAudit;
}

export interface RenderedCoachSkillRequest {
  messages: Array<{
    role: "system" | "user";
    content: string;
  }>;
  audit: SkillPlanAudit;
}
