import { readFile } from "node:fs/promises";
import type { HttpCompletionProviderConfig } from "../models/completionsClient";
import type { HttpChatCompletionProviderConfig } from "../models/chatCompletionsClient";

export type AiProviderMode = "openai" | "openai-compatible" | "anthropic-native";
export type OpenAiAuthMode = "api-key" | "codex-oauth";
export type AutocompleteFormat = "openai-completions" | "openai-chat" | "anthropic-messages";
export type AiCredentialRole = "analysis" | "autocomplete";

export interface ModelEnv {
  [key: string]: string | undefined;
  AI_PROVIDER_MODE?: string;
  AI_OPENAI_BASE_URL?: string;
  AI_OPENAI_AUTH_MODE?: string;
  AI_OPENAI_API_KEY?: string;
  AI_OPENAI_CHAT_MODEL?: string;
  AI_OPENAI_AUTOCOMPLETE_MODEL?: string;
  AI_OPENAI_COMPAT_BASE_URL?: string;
  AI_OPENAI_COMPAT_AUTOCOMPLETE_BASE_URL?: string;
  AI_OPENAI_COMPAT_API_KEY?: string;
  AI_OPENAI_COMPAT_AUTOCOMPLETE_API_KEY?: string;
  AI_OPENAI_COMPAT_CHAT_MODEL?: string;
  AI_OPENAI_COMPAT_AUTOCOMPLETE_MODEL?: string;
  AI_OPENAI_COMPAT_AUTOCOMPLETE_FORMAT?: string;
  AI_ANTHROPIC_BASE_URL?: string;
  AI_ANTHROPIC_API_KEY?: string;
  AI_ANTHROPIC_CHAT_MODEL?: string;
  AI_ANTHROPIC_AUTOCOMPLETE_MODEL?: string;
  MIMO_OPENAI_BASE_URL?: string;
  MIMO_API_KEY?: string;
  MIMO_AUTOCOMPLETE_MODEL?: string;
  MIMO_CHAT_MODEL?: string;
  DEEPSEEK_BASE_URL?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_AUTOCOMPLETE_MODEL?: string;
}

export interface AiProviderConfigUpdate {
  mode: AiProviderMode;
  authMode?: OpenAiAuthMode;
  baseUrl: string;
  autocompleteBaseUrl?: string;
  apiKey?: string;
  autocompleteApiKey?: string;
  chatModel: string;
  autocompleteModel: string;
  autocompleteFormat?: AutocompleteFormat;
}

export interface AiProviderSettings {
  authMode?: OpenAiAuthMode;
  baseUrl?: string;
  autocompleteBaseUrl?: string;
  apiKey?: string;
  autocompleteApiKey?: string;
  chatModel?: string;
  autocompleteModel?: string;
  autocompleteFormat?: AutocompleteFormat;
}

export interface AiSettingsSnapshot {
  providerMode?: AiProviderMode;
  openai?: AiProviderSettings;
  openaiCompatible?: AiProviderSettings;
  anthropic?: AiProviderSettings;
}

export interface AiSecretSnapshot {
  openaiApiKey?: string;
  openaiCompatibleApiKey?: string;
  openaiCompatibleAutocompleteApiKey?: string;
  anthropicApiKey?: string;
}

export interface AiConfigView {
  mode: AiProviderMode;
  authMode: OpenAiAuthMode;
  baseUrl: string;
  autocompleteBaseUrl: string;
  hasApiKey: boolean;
  apiKeyPreview: string;
  hasAutocompleteApiKey?: boolean;
  autocompleteApiKeyPreview?: string;
  chatModel: string;
  autocompleteModel: string;
  autocompleteFormat: AutocompleteFormat;
}

export type TeachingProviderConfig = HttpChatCompletionProviderConfig & { mode: AiProviderMode };
export type AutocompleteProviderConfig = HttpCompletionProviderConfig & { mode: AiProviderMode };

export function loadModelEnvFromText(text: string): ModelEnv {
  const env: Record<string, string> = {};

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex < 1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    env[key] = value;
  }

  return env;
}

export function modelEnvFromSettings(
  fallbackEnv: ModelEnv,
  settings: AiSettingsSnapshot,
  secrets: AiSecretSnapshot
): ModelEnv {
  const env: ModelEnv = { ...fallbackEnv };

  if (settings.providerMode) {
    env.AI_PROVIDER_MODE = settings.providerMode;
  }

  applyOpenAiSettings(env, settings.openai, secrets.openaiApiKey);
  applyOpenAiCompatibleSettings(
    env,
    settings.openaiCompatible,
    secrets.openaiCompatibleApiKey,
    secrets.openaiCompatibleAutocompleteApiKey
  );
  applyAnthropicSettings(env, settings.anthropic, secrets.anthropicApiKey);
  return env;
}

export async function loadModelEnv(path: string): Promise<ModelEnv> {
  return loadModelEnvFromText(await readFile(path, "utf8"));
}

export function requireTeachingConfig(env: ModelEnv): TeachingProviderConfig {
  const mode = normalizeProviderMode(env.AI_PROVIDER_MODE);

  if (mode === "openai") {
    return {
      mode,
      format: "openai-chat",
      baseUrl: env.AI_OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: requireValue(env.AI_OPENAI_API_KEY, "Missing OpenAI API key in secrets/models.env."),
      model: requireValue(env.AI_OPENAI_CHAT_MODEL, "Missing OpenAI chat model in secrets/models.env.")
    };
  }

  if (mode === "anthropic-native") {
    return {
      mode,
      format: "anthropic-messages",
      baseUrl: env.AI_ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1",
      apiKey: requireValue(env.AI_ANTHROPIC_API_KEY, "Missing Anthropic API key in secrets/models.env."),
      model: requireValue(env.AI_ANTHROPIC_CHAT_MODEL, "Missing Anthropic chat model in secrets/models.env."),
      anthropicVersion: "2023-06-01"
    };
  }

  const baseUrl = requireValue(
    env.AI_OPENAI_COMPAT_BASE_URL || env.MIMO_OPENAI_BASE_URL || env.DEEPSEEK_BASE_URL,
    "Missing OpenAI-compatible base URL in secrets/models.env."
  );

  return {
    mode: "openai-compatible",
    format: "openai-chat",
    baseUrl,
    apiKey: requireValue(
      openAiCompatibleApiKey(env, baseUrl, "analysis"),
      "Missing OpenAI-compatible API key in secrets/models.env."
    ),
    model: env.AI_OPENAI_COMPAT_CHAT_MODEL || env.MIMO_CHAT_MODEL || "mimo-v2.5"
  };
}

export function requireAutocompleteConfig(env: ModelEnv): AutocompleteProviderConfig {
  const mode = normalizeProviderMode(env.AI_PROVIDER_MODE);

  if (mode === "openai") {
    const chatModel = env.AI_OPENAI_CHAT_MODEL;
    return {
      mode,
      format: "openai-chat",
      baseUrl: env.AI_OPENAI_BASE_URL || "https://api.openai.com/v1",
      apiKey: requireValue(env.AI_OPENAI_API_KEY, "Missing OpenAI API key in secrets/models.env."),
      model: requireValue(
        env.AI_OPENAI_AUTOCOMPLETE_MODEL || chatModel,
        "Missing OpenAI autocomplete model in secrets/models.env."
      )
    };
  }

  if (mode === "anthropic-native") {
    const chatModel = env.AI_ANTHROPIC_CHAT_MODEL;
    return {
      mode,
      format: "anthropic-messages",
      baseUrl: env.AI_ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1",
      apiKey: requireValue(env.AI_ANTHROPIC_API_KEY, "Missing Anthropic API key in secrets/models.env."),
      model: requireValue(
        env.AI_ANTHROPIC_AUTOCOMPLETE_MODEL || chatModel,
        "Missing Anthropic autocomplete model in secrets/models.env."
      ),
      anthropicVersion: "2023-06-01"
    };
  }

  const baseUrl = requireValue(
    env.AI_OPENAI_COMPAT_AUTOCOMPLETE_BASE_URL ||
      env.AI_OPENAI_COMPAT_BASE_URL ||
      env.MIMO_OPENAI_BASE_URL ||
      env.DEEPSEEK_BASE_URL,
    "Missing OpenAI-compatible base URL in secrets/models.env."
  );

  return {
    mode: "openai-compatible",
    format: normalizeAutocompleteFormat(env.AI_OPENAI_COMPAT_AUTOCOMPLETE_FORMAT, "openai-completions"),
    baseUrl,
    apiKey: requireValue(
      openAiCompatibleApiKey(env, baseUrl, "autocomplete"),
      "Missing OpenAI-compatible API key in secrets/models.env."
    ),
    model: openAiCompatibleAutocompleteModel(env, baseUrl)
  };
}

export function requireMimoAutocompleteConfig(env: ModelEnv): {
  baseUrl: string;
  apiKey: string;
  model: string;
  mode?: string;
  format?: "openai-completions" | "openai-chat" | "anthropic-messages";
  anthropicVersion?: string;
} {
  return requireAutocompleteConfig(env);
}

export function requireMimoTeachingConfig(env: ModelEnv): {
  baseUrl: string;
  apiKey: string;
  model: string;
  mode?: string;
  format?: "openai-chat" | "anthropic-messages";
  anthropicVersion?: string;
} {
  return requireTeachingConfig(env);
}

export function withModelOverride(
  config: ReturnType<typeof requireMimoAutocompleteConfig>,
  modelOverride?: string
): ReturnType<typeof requireMimoAutocompleteConfig> {
  if (!modelOverride) {
    return config;
  }

  return {
    ...config,
    model: modelOverride
  };
}

export function buildAiConfigView(env: ModelEnv): AiConfigView {
  const mode = normalizeProviderMode(env.AI_PROVIDER_MODE);

  if (mode === "openai") {
    return {
      mode,
      authMode: normalizeOpenAiAuthMode(env.AI_OPENAI_AUTH_MODE),
      baseUrl: env.AI_OPENAI_BASE_URL || "https://api.openai.com/v1",
      autocompleteBaseUrl: "",
      hasApiKey: Boolean(env.AI_OPENAI_API_KEY),
      apiKeyPreview: env.AI_OPENAI_API_KEY ? "已保存" : "",
      hasAutocompleteApiKey: false,
      autocompleteApiKeyPreview: "",
      chatModel: env.AI_OPENAI_CHAT_MODEL || "",
      autocompleteModel: env.AI_OPENAI_AUTOCOMPLETE_MODEL || env.AI_OPENAI_CHAT_MODEL || "",
      autocompleteFormat: "openai-chat"
    };
  }

  if (mode === "anthropic-native") {
    return {
      mode,
      authMode: "api-key",
      baseUrl: env.AI_ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1",
      autocompleteBaseUrl: "",
      hasApiKey: Boolean(env.AI_ANTHROPIC_API_KEY),
      apiKeyPreview: env.AI_ANTHROPIC_API_KEY ? "已保存" : "",
      hasAutocompleteApiKey: false,
      autocompleteApiKeyPreview: "",
      chatModel: env.AI_ANTHROPIC_CHAT_MODEL || "",
      autocompleteModel: env.AI_ANTHROPIC_AUTOCOMPLETE_MODEL || env.AI_ANTHROPIC_CHAT_MODEL || "",
      autocompleteFormat: "anthropic-messages"
    };
  }

  const baseUrl = env.AI_OPENAI_COMPAT_BASE_URL || env.MIMO_OPENAI_BASE_URL || env.DEEPSEEK_BASE_URL || "";
  const autocompleteBaseUrl = env.AI_OPENAI_COMPAT_AUTOCOMPLETE_BASE_URL || "";
  const analysisApiKey = openAiCompatibleApiKey(env, baseUrl || autocompleteBaseUrl, "analysis");
  const dedicatedAutocompleteApiKey = env.AI_OPENAI_COMPAT_AUTOCOMPLETE_API_KEY?.trim();

  return {
    mode: "openai-compatible",
    authMode: "api-key",
    baseUrl,
    autocompleteBaseUrl,
    hasApiKey: Boolean(analysisApiKey),
    apiKeyPreview: analysisApiKey ? "已保存" : "",
    hasAutocompleteApiKey: Boolean(dedicatedAutocompleteApiKey),
    autocompleteApiKeyPreview: dedicatedAutocompleteApiKey ? "已保存" : "",
    chatModel: env.AI_OPENAI_COMPAT_CHAT_MODEL || env.MIMO_CHAT_MODEL || "mimo-v2.5",
    autocompleteModel: openAiCompatibleAutocompleteModel(env, autocompleteBaseUrl || baseUrl),
    autocompleteFormat: normalizeAutocompleteFormat(env.AI_OPENAI_COMPAT_AUTOCOMPLETE_FORMAT, "openai-completions")
  };
}

export function applyAiConfigUpdateToEnv(
  existingEnv: ModelEnv,
  update: AiProviderConfigUpdate,
  options: { preserveEmptyModels?: boolean } = {}
): ModelEnv {
  const env: ModelEnv = { ...existingEnv };
  const mode = normalizeProviderMode(update.mode);
  env.AI_PROVIDER_MODE = mode;

  if (mode === "openai") {
    env.AI_OPENAI_AUTH_MODE = normalizeOpenAiAuthMode(update.authMode ?? env.AI_OPENAI_AUTH_MODE);
    if (update.baseUrl?.trim() || !options.preserveEmptyModels) {
      env.AI_OPENAI_BASE_URL = update.baseUrl?.trim() || env.AI_OPENAI_BASE_URL || "https://api.openai.com/v1";
    }
    if (update.apiKey?.trim()) {
      env.AI_OPENAI_API_KEY = update.apiKey.trim();
    }
    env.AI_OPENAI_CHAT_MODEL = update.chatModel?.trim() ?? "";
    env.AI_OPENAI_AUTOCOMPLETE_MODEL = update.autocompleteModel?.trim() ?? "";
    return env;
  }

  if (mode === "anthropic-native") {
    if (update.baseUrl?.trim() || !options.preserveEmptyModels) {
      env.AI_ANTHROPIC_BASE_URL = update.baseUrl?.trim() || env.AI_ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1";
    }
    if (update.apiKey?.trim()) {
      env.AI_ANTHROPIC_API_KEY = update.apiKey.trim();
    }
    env.AI_ANTHROPIC_CHAT_MODEL = update.chatModel?.trim() ?? "";
    env.AI_ANTHROPIC_AUTOCOMPLETE_MODEL = update.autocompleteModel?.trim() ?? "";
    return env;
  }

  if (update.baseUrl?.trim() || !options.preserveEmptyModels) {
    env.AI_OPENAI_COMPAT_BASE_URL = update.baseUrl?.trim() ?? "";
  }
  if (update.autocompleteBaseUrl?.trim()) {
    env.AI_OPENAI_COMPAT_AUTOCOMPLETE_BASE_URL = update.autocompleteBaseUrl.trim();
  } else {
    delete env.AI_OPENAI_COMPAT_AUTOCOMPLETE_BASE_URL;
  }
  if (update.apiKey?.trim()) {
    env.AI_OPENAI_COMPAT_API_KEY = update.apiKey.trim();
  }
  if (update.autocompleteApiKey?.trim()) {
    env.AI_OPENAI_COMPAT_AUTOCOMPLETE_API_KEY = update.autocompleteApiKey.trim();
  }
  env.AI_OPENAI_COMPAT_CHAT_MODEL = update.chatModel?.trim() ?? "";
  env.AI_OPENAI_COMPAT_AUTOCOMPLETE_MODEL = update.autocompleteModel?.trim() ?? "";
  env.AI_OPENAI_COMPAT_AUTOCOMPLETE_FORMAT = normalizeAutocompleteFormat(
    update.autocompleteFormat,
    "openai-completions"
  );
  return env;
}

export function applyAiConfigUpdateToEnvText(existingText: string, update: AiProviderConfigUpdate): string {
  const env = applyAiConfigUpdateToEnv(loadModelEnvFromText(existingText), update);
  return serializeModelEnv(env);
}

export function normalizeProviderMode(value: string | undefined): AiProviderMode {
  if (value === "openai" || value === "anthropic-native") {
    return value;
  }

  return "openai-compatible";
}

export function normalizeAutocompleteFormat(
  value: string | undefined,
  fallback: AutocompleteFormat = "openai-completions"
): AutocompleteFormat {
  if (value === "openai-chat" || value === "anthropic-messages" || value === "openai-completions") {
    return value;
  }

  return fallback;
}

export function resolveSavedBaseUrlForMode(env: ModelEnv, mode: AiProviderMode): string {
  if (mode === "openai") {
    return env.AI_OPENAI_BASE_URL || "https://api.openai.com/v1";
  }
  if (mode === "anthropic-native") {
    return env.AI_ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1";
  }

  return env.AI_OPENAI_COMPAT_BASE_URL || env.MIMO_OPENAI_BASE_URL || env.DEEPSEEK_BASE_URL || "";
}

export function resolveSavedApiKeyForMode(
  env: ModelEnv,
  mode: AiProviderMode,
  role: AiCredentialRole = "analysis"
): string {
  if (mode === "openai") {
    return env.AI_OPENAI_API_KEY || "";
  }
  if (mode === "anthropic-native") {
    return env.AI_ANTHROPIC_API_KEY || "";
  }

  const baseUrl =
    role === "autocomplete"
      ? env.AI_OPENAI_COMPAT_AUTOCOMPLETE_BASE_URL || resolveSavedBaseUrlForMode(env, mode)
      : resolveSavedBaseUrlForMode(env, mode);
  return openAiCompatibleApiKey(env, baseUrl, role) || "";
}

function applyOpenAiSettings(env: ModelEnv, settings: AiProviderSettings | undefined, secretApiKey: string | undefined): void {
  if (!settings && !secretApiKey) {
    return;
  }

  if (settings?.authMode) {
    env.AI_OPENAI_AUTH_MODE = normalizeOpenAiAuthMode(settings.authMode);
  }
  if (settings?.baseUrl?.trim()) {
    env.AI_OPENAI_BASE_URL = settings.baseUrl.trim();
  }
  if (secretApiKey?.trim() || settings?.apiKey?.trim()) {
    env.AI_OPENAI_API_KEY = (secretApiKey || settings?.apiKey || "").trim();
  }
  if (settings?.chatModel?.trim()) {
    env.AI_OPENAI_CHAT_MODEL = settings.chatModel.trim();
  }
  if (settings?.autocompleteModel?.trim()) {
    env.AI_OPENAI_AUTOCOMPLETE_MODEL = settings.autocompleteModel.trim();
  }
}

function applyOpenAiCompatibleSettings(
  env: ModelEnv,
  settings: AiProviderSettings | undefined,
  secretApiKey: string | undefined,
  secretAutocompleteApiKey?: string
): void {
  if (!settings && !secretApiKey && !secretAutocompleteApiKey) {
    return;
  }

  if (settings?.baseUrl?.trim()) {
    env.AI_OPENAI_COMPAT_BASE_URL = settings.baseUrl.trim();
  }
  if (settings?.autocompleteBaseUrl?.trim()) {
    env.AI_OPENAI_COMPAT_AUTOCOMPLETE_BASE_URL = settings.autocompleteBaseUrl.trim();
  }
  if (secretApiKey?.trim() || settings?.apiKey?.trim()) {
    env.AI_OPENAI_COMPAT_API_KEY = (secretApiKey || settings?.apiKey || "").trim();
  }
  if (secretAutocompleteApiKey?.trim() || settings?.autocompleteApiKey?.trim()) {
    env.AI_OPENAI_COMPAT_AUTOCOMPLETE_API_KEY = (
      secretAutocompleteApiKey ||
      settings?.autocompleteApiKey ||
      ""
    ).trim();
  }
  if (settings?.chatModel?.trim()) {
    env.AI_OPENAI_COMPAT_CHAT_MODEL = settings.chatModel.trim();
  }
  if (settings?.autocompleteModel?.trim()) {
    env.AI_OPENAI_COMPAT_AUTOCOMPLETE_MODEL = settings.autocompleteModel.trim();
  }
  if (settings?.autocompleteFormat) {
    env.AI_OPENAI_COMPAT_AUTOCOMPLETE_FORMAT = normalizeAutocompleteFormat(
      settings.autocompleteFormat,
      "openai-completions"
    );
  }
}

function applyAnthropicSettings(
  env: ModelEnv,
  settings: AiProviderSettings | undefined,
  secretApiKey: string | undefined
): void {
  if (!settings && !secretApiKey) {
    return;
  }

  if (settings?.baseUrl?.trim()) {
    env.AI_ANTHROPIC_BASE_URL = settings.baseUrl.trim();
  }
  if (secretApiKey?.trim() || settings?.apiKey?.trim()) {
    env.AI_ANTHROPIC_API_KEY = (secretApiKey || settings?.apiKey || "").trim();
  }
  if (settings?.chatModel?.trim()) {
    env.AI_ANTHROPIC_CHAT_MODEL = settings.chatModel.trim();
  }
  if (settings?.autocompleteModel?.trim()) {
    env.AI_ANTHROPIC_AUTOCOMPLETE_MODEL = settings.autocompleteModel.trim();
  }
}

function normalizeOpenAiAuthMode(value: string | undefined): OpenAiAuthMode {
  return value === "codex-oauth" ? "codex-oauth" : "api-key";
}

function requireValue(value: string | undefined, message: string): string {
  if (!value || !value.trim()) {
    throw new Error(message);
  }

  return value.trim();
}

function openAiCompatibleApiKey(
  env: ModelEnv,
  baseUrl: string,
  role: AiCredentialRole = "analysis"
): string | undefined {
  if (role === "autocomplete" && env.AI_OPENAI_COMPAT_AUTOCOMPLETE_API_KEY?.trim()) {
    return env.AI_OPENAI_COMPAT_AUTOCOMPLETE_API_KEY.trim();
  }

  if (env.AI_OPENAI_COMPAT_API_KEY?.trim()) {
    return env.AI_OPENAI_COMPAT_API_KEY.trim();
  }

  const normalizedBaseUrl = baseUrl.toLowerCase();
  if (normalizedBaseUrl.includes("deepseek") && env.DEEPSEEK_API_KEY?.trim()) {
    return env.DEEPSEEK_API_KEY.trim();
  }
  if (normalizedBaseUrl.includes("xiaomi") && env.MIMO_API_KEY?.trim()) {
    return env.MIMO_API_KEY.trim();
  }

  return env.MIMO_API_KEY?.trim() || env.DEEPSEEK_API_KEY?.trim();
}

function openAiCompatibleAutocompleteModel(env: ModelEnv, baseUrl: string): string {
  if (env.AI_OPENAI_COMPAT_AUTOCOMPLETE_MODEL?.trim()) {
    return env.AI_OPENAI_COMPAT_AUTOCOMPLETE_MODEL.trim();
  }

  if (baseUrl.toLowerCase().includes("deepseek") && env.DEEPSEEK_AUTOCOMPLETE_MODEL?.trim()) {
    return env.DEEPSEEK_AUTOCOMPLETE_MODEL.trim();
  }

  return env.MIMO_AUTOCOMPLETE_MODEL?.trim() || env.DEEPSEEK_AUTOCOMPLETE_MODEL?.trim() || "mimo-v2.5";
}

function serializeModelEnv(env: ModelEnv): string {
  const keys = Object.keys(env)
    .filter((key) => env[key] !== undefined)
    .sort((left, right) => {
      if (left === "AI_PROVIDER_MODE") {
        return -1;
      }
      if (right === "AI_PROVIDER_MODE") {
        return 1;
      }
      return left.localeCompare(right);
    });

  return keys.map((key) => `${key}=${env[key]}`).join("\n") + "\n";
}
