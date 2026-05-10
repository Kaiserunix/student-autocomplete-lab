import type {
  AiProviderMode,
  AutocompleteFormat,
  AutocompleteProviderConfig,
  TeachingProviderConfig
} from "../config/modelEnv";

export type ModelRoutePurpose = "analysis" | "autocomplete";
export type ModelProtocolFormat = AutocompleteFormat;

export interface ModelRoute<TConfig extends TeachingProviderConfig | AutocompleteProviderConfig> {
  purpose: ModelRoutePurpose;
  providerMode: AiProviderMode;
  model: string;
  baseUrl: string;
  endpoint: string;
  format: ModelProtocolFormat;
  config: TConfig;
}
