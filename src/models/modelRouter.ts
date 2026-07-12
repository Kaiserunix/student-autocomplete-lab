import {
  requireAutocompleteConfig,
  requireTeachingConfig,
  type AutocompleteProviderConfig,
  type ModelEnv,
  type TeachingProviderConfig
} from "../config/modelEnv";
import type { CodexOAuthProviderConfig, ModelRoute } from "./providerContracts";
import type { ModelTextTransport } from "./modelTextTransport";

export function routeTeachingModel(
  env: ModelEnv,
  oauthTransport?: ModelTextTransport
): ModelRoute<TeachingProviderConfig | CodexOAuthProviderConfig> {
  if (usesCodexOAuth(env)) {
    return codexOAuthRoute("analysis", env.AI_OPENAI_CHAT_MODEL, oauthTransport);
  }
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

export function routeAutocompleteModel(
  env: ModelEnv,
  oauthTransport?: ModelTextTransport
): ModelRoute<AutocompleteProviderConfig | CodexOAuthProviderConfig> {
  if (usesCodexOAuth(env)) {
    return codexOAuthRoute(
      "autocomplete",
      env.AI_OPENAI_AUTOCOMPLETE_MODEL || env.AI_OPENAI_CHAT_MODEL,
      oauthTransport
    );
  }
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

function usesCodexOAuth(env: ModelEnv): boolean {
  return env.AI_PROVIDER_MODE === "openai" && env.AI_OPENAI_AUTH_MODE === "codex-oauth";
}

function codexOAuthRoute(
  purpose: "analysis" | "autocomplete",
  model: string | undefined,
  transport: ModelTextTransport | undefined
): ModelRoute<CodexOAuthProviderConfig> {
  if (!transport) {
    throw new Error("Codex OAuth is selected but the app-server transport is unavailable.");
  }
  if (!model?.trim()) {
    throw new Error(`Missing OpenAI ${purpose === "analysis" ? "chat" : "autocomplete"} model.`);
  }

  const config: CodexOAuthProviderConfig = {
    mode: "openai",
    authMode: "codex-oauth",
    model: model.trim(),
    format: "codex-app-server",
    transport
  };
  return {
    purpose,
    providerMode: "openai",
    authMode: "codex-oauth",
    model: config.model,
    baseUrl: "codex://app-server",
    endpoint: "codex://app-server",
    format: "codex-app-server",
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
