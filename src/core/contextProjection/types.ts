import type {
  ProjectedContextItem,
  ProjectionAudit,
  SupportedLanguage
} from "../contracts";

export type ProjectionRoute = "coach" | "autocomplete";

export type ProjectionRendererId = ProjectionAudit["renderer"];

export type ProjectionLayer = "head" | "body" | "tail" | "footer";

export type ProjectionRuleSource =
  | "hard"
  | "output"
  | "action"
  | "language"
  | "learner";

export type ProjectionEnforcement = "prompt" | "runtime" | "both";

export interface ProjectionRule {
  id: string;
  policyKey: string;
  route: ProjectionRoute;
  layer: ProjectionLayer;
  source: ProjectionRuleSource;
  priority: number;
  instruction: string;
  compactInstruction?: string;
  enforcement: ProjectionEnforcement;
  language?: SupportedLanguage;
  projectedItem?: ProjectedContextItem;
}

export interface ProjectionOutputSpec {
  maxLines?: number;
  maxTokens?: number;
  stopSequences?: string[];
  format?: "plain" | "json" | "code";
}

export interface ProjectionPlanInput {
  route: ProjectionRoute;
  language: string;
  renderer?: ProjectionRendererId;
  rules?: readonly ProjectionRule[];
  output?: ProjectionOutputSpec;
  characterBudgetMax?: number;
  maxLearnerRules?: number;
  maxLearnerChars?: number;
  includeDefaultLanguageRules?: boolean;
  includeDefaultHardRules?: boolean;
}

export interface ProjectionPlan {
  route: ProjectionRoute;
  language: SupportedLanguage;
  rules: ProjectionRule[];
  layers: Record<ProjectionLayer, ProjectionRule[]>;
  output: Required<Pick<ProjectionOutputSpec, "stopSequences">> &
    Omit<ProjectionOutputSpec, "stopSequences">;
  audit: ProjectionAudit;
}

export interface FimRenderContext {
  prefix: string;
  suffix: string;
}

export interface RenderedFimRequest {
  prompt: string;
  suffix: string;
  stop: string[];
  maxLines: number;
  maxTokens: number;
  audit: ProjectionAudit;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRenderContext {
  userPrompt?: string;
  history?: ReadonlyArray<Pick<ChatMessage, "role" | "content">>;
  prefix?: string;
  suffix?: string;
}

export interface RenderedChatRequest {
  messages: ChatMessage[];
  stop: string[];
  maxTokens?: number;
  maxLines?: number;
  audit: ProjectionAudit;
}

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnthropicRenderContext {
  userPrompt?: string;
  history?: ReadonlyArray<AnthropicMessage>;
  prefix?: string;
  suffix?: string;
}

export interface RenderedAnthropicRequest {
  system: string;
  messages: AnthropicMessage[];
  stopSequences: string[];
  maxTokens?: number;
  maxLines?: number;
  audit: ProjectionAudit;
}

export interface GenericCompletionRenderContext {
  prefix: string;
  suffix?: string;
  includeSuffixHint?: boolean;
  maxSuffixHintChars?: number;
}

export interface RenderedGenericCompletionRequest {
  prompt: string;
  stop: string[];
  maxLines: number;
  maxTokens: number;
  audit: ProjectionAudit;
}
