import type {
  AiProviderMode,
  AutocompleteFormat,
  AutocompleteProviderConfig,
  TeachingProviderConfig
} from "../config/modelEnv";
import type { ModelTextTransport } from "./modelTextTransport";

export type ModelRoutePurpose = "analysis" | "autocomplete";
export type ModelProtocolFormat = AutocompleteFormat | "codex-app-server";

export interface CodexOAuthProviderConfig {
  mode: "openai";
  authMode: "codex-oauth";
  model: string;
  format: "codex-app-server";
  transport: ModelTextTransport;
}

export interface ModelRoute<
  TConfig extends TeachingProviderConfig | AutocompleteProviderConfig | CodexOAuthProviderConfig
> {
  purpose: ModelRoutePurpose;
  providerMode: AiProviderMode;
  authMode?: "api-key" | "codex-oauth";
  model: string;
  baseUrl: string;
  endpoint: string;
  format: ModelProtocolFormat;
  config: TConfig;
}
