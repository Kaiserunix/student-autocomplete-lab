import { readFile } from "node:fs/promises";
import type { CompletionProviderConfig } from "../models/completionsClient";
import type { ChatCompletionProviderConfig } from "../models/chatCompletionsClient";

export type AiProviderMode = "openai" | "openai-compatible" | "anthropic-native";
export type AutocompleteFormat = "openai-completions" | "openai-chat" | "anthropic-messages";

export interface ModelEnv {
  [key: string]: string | undefined;
  AI_PROVIDER_MODE?: string;
  AI_OPENAI_BASE_URL?: string;
  AI_OPENAI_API_KEY?: string;
  AI_OPENAI_CHAT_MODEL?: string;
  AI_OPENAI_AUTOCOMPLETE_MODEL?: string;
  AI_OPENAI_COMPAT_BASE_URL?: string;
  AI_OPENAI_COMPAT_API_KEY?: string;
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
  baseUrl: string;
  apiKey?: string;
  chatModel: string;
  autocompleteModel: string;
  autocompleteFormat?: AutocompleteFormat;
}

export interface AiConfigView {
  mode: AiProviderMode;
  baseUrl: string;
  hasApiKey: boolean;
  apiKeyPreview: string;
  chatModel: string;
  autocompleteModel: string;
  autocompleteFormat: AutocompleteFormat;
}

export type TeachingProviderConfig = ChatCompletionProviderConfig & { mode: AiProviderMode };
export type AutocompleteProviderConfig = CompletionProviderConfig & { mode: AiProviderMode };

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

  return {
    mode: "openai-compatible",
    format: "openai-chat",
    baseUrl: requireValue(
      env.AI_OPENAI_COMPAT_BASE_URL || env.MIMO_OPENAI_BASE_URL,
      "Missing OpenAI-compatible base URL in secrets/models.env."
    ),
    apiKey: requireValue(
      env.AI_OPENAI_COMPAT_API_KEY || env.MIMO_API_KEY,
      "Missing OpenAI-compatible API key in secrets/models.env."
    ),
    model:
      env.AI_OPENAI_COMPAT_CHAT_MODEL ||
      normalizeMimoV25Model(env.MIMO_CHAT_MODEL ?? "mimo-v2.5") ||
      "mimo-v2.5"
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

  return {
    mode: "openai-compatible",
    format: normalizeAutocompleteFormat(env.AI_OPENAI_COMPAT_AUTOCOMPLETE_FORMAT, "openai-completions"),
    baseUrl: requireValue(
      env.AI_OPENAI_COMPAT_BASE_URL || env.MIMO_OPENAI_BASE_URL,
      "Missing OpenAI-compatible base URL in secrets/models.env."
    ),
    apiKey: requireValue(
      env.AI_OPENAI_COMPAT_API_KEY || env.MIMO_API_KEY,
      "Missing OpenAI-compatible API key in secrets/models.env."
    ),
    model:
      env.AI_OPENAI_COMPAT_AUTOCOMPLETE_MODEL ||
      normalizeMimoV25Model(env.MIMO_AUTOCOMPLETE_MODEL ?? "mimo-v2.5") ||
      "mimo-v2.5"
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

function normalizeMimoV25Model(model: string | undefined): string | undefined {
  if (!model) {
    return undefined;
  }

  if (model === "mimo-v2.5-pro") {
    return "mimo-v2.5";
  }

  return model;
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
      baseUrl: env.AI_OPENAI_BASE_URL || "https://api.openai.com/v1",
      hasApiKey: Boolean(env.AI_OPENAI_API_KEY),
      apiKeyPreview: env.AI_OPENAI_API_KEY ? "已保存" : "",
      chatModel: env.AI_OPENAI_CHAT_MODEL || "",
      autocompleteModel: env.AI_OPENAI_AUTOCOMPLETE_MODEL || env.AI_OPENAI_CHAT_MODEL || "",
      autocompleteFormat: "openai-chat"
    };
  }

  if (mode === "anthropic-native") {
    return {
      mode,
      baseUrl: env.AI_ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1",
      hasApiKey: Boolean(env.AI_ANTHROPIC_API_KEY),
      apiKeyPreview: env.AI_ANTHROPIC_API_KEY ? "已保存" : "",
      chatModel: env.AI_ANTHROPIC_CHAT_MODEL || "",
      autocompleteModel: env.AI_ANTHROPIC_AUTOCOMPLETE_MODEL || env.AI_ANTHROPIC_CHAT_MODEL || "",
      autocompleteFormat: "anthropic-messages"
    };
  }

  return {
    mode: "openai-compatible",
    baseUrl: env.AI_OPENAI_COMPAT_BASE_URL || env.MIMO_OPENAI_BASE_URL || "",
    hasApiKey: Boolean(env.AI_OPENAI_COMPAT_API_KEY || env.MIMO_API_KEY),
    apiKeyPreview: env.AI_OPENAI_COMPAT_API_KEY || env.MIMO_API_KEY ? "已保存" : "",
    chatModel: env.AI_OPENAI_COMPAT_CHAT_MODEL || normalizeMimoV25Model(env.MIMO_CHAT_MODEL ?? "mimo-v2.5") || "",
    autocompleteModel:
      env.AI_OPENAI_COMPAT_AUTOCOMPLETE_MODEL || normalizeMimoV25Model(env.MIMO_AUTOCOMPLETE_MODEL ?? "mimo-v2.5") || "",
    autocompleteFormat: normalizeAutocompleteFormat(env.AI_OPENAI_COMPAT_AUTOCOMPLETE_FORMAT, "openai-completions")
  };
}

export function applyAiConfigUpdateToEnvText(existingText: string, update: AiProviderConfigUpdate): string {
  const env = loadModelEnvFromText(existingText);
  env.AI_PROVIDER_MODE = update.mode;

  if (update.mode === "openai") {
    env.AI_OPENAI_BASE_URL = update.baseUrl || "https://api.openai.com/v1";
    if (update.apiKey?.trim()) {
      env.AI_OPENAI_API_KEY = update.apiKey.trim();
    }
    env.AI_OPENAI_CHAT_MODEL = update.chatModel.trim();
    env.AI_OPENAI_AUTOCOMPLETE_MODEL = update.autocompleteModel.trim();
  } else if (update.mode === "anthropic-native") {
    env.AI_ANTHROPIC_BASE_URL = update.baseUrl || "https://api.anthropic.com/v1";
    if (update.apiKey?.trim()) {
      env.AI_ANTHROPIC_API_KEY = update.apiKey.trim();
    }
    env.AI_ANTHROPIC_CHAT_MODEL = update.chatModel.trim();
    env.AI_ANTHROPIC_AUTOCOMPLETE_MODEL = update.autocompleteModel.trim();
  } else {
    env.AI_OPENAI_COMPAT_BASE_URL = update.baseUrl.trim();
    if (update.apiKey?.trim()) {
      env.AI_OPENAI_COMPAT_API_KEY = update.apiKey.trim();
    }
    env.AI_OPENAI_COMPAT_CHAT_MODEL = update.chatModel.trim();
    env.AI_OPENAI_COMPAT_AUTOCOMPLETE_MODEL = update.autocompleteModel.trim();
    env.AI_OPENAI_COMPAT_AUTOCOMPLETE_FORMAT = normalizeAutocompleteFormat(
      update.autocompleteFormat,
      "openai-completions"
    );
  }

  return serializeModelEnv(env);
}

function normalizeProviderMode(value: string | undefined): AiProviderMode {
  if (value === "openai" || value === "anthropic-native") {
    return value;
  }

  return "openai-compatible";
}

function normalizeAutocompleteFormat(value: string | undefined, fallback: AutocompleteFormat): AutocompleteFormat {
  if (value === "openai-chat" || value === "anthropic-messages" || value === "openai-completions") {
    return value;
  }

  return fallback;
}

function requireValue(value: string | undefined, message: string): string {
  if (!value || !value.trim()) {
    throw new Error(message);
  }

  return value.trim();
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
