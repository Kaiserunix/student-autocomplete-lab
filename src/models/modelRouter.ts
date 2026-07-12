import {
  requireAutocompleteConfig,
  requireTeachingConfig,
  type AutocompleteProviderConfig,
  type ModelEnv,
  type TeachingProviderConfig
} from "../config/modelEnv";
import type { ModelRoute } from "./providerContracts";

export function routeTeachingModel(env: ModelEnv): ModelRoute<TeachingProviderConfig> {
  const config = requireTeachingConfig(env);
  const format = config.format ?? "openai-chat";
  return {
    purpose: "analysis",
    providerMode: config.mode,
    model: config.model,
    baseUrl: config.baseUrl,
    endpoint: endpointForFormat(config.baseUrl, format),
    format,
    config
  };
}

export function routeAutocompleteModel(env: ModelEnv): ModelRoute<AutocompleteProviderConfig> {
  const config = requireAutocompleteConfig(env);
  const format = config.format ?? "openai-completions";
  return {
    purpose: "autocomplete",
    providerMode: config.mode,
    model: config.model,
    baseUrl: config.baseUrl,
    endpoint: endpointForFormat(config.baseUrl, format),
    format,
    config
  };
}

export function endpointForFormat(baseUrl: string, format: string): string {
  const normalized = baseUrl.replace(/\/+$/, "");
  if (format === "anthropic-messages") {
    return `${normalized}/messages`;
  }
  if (format === "openai-chat") {
    return `${normalized}/chat/completions`;
  }

  return `${normalized}/completions`;
}
