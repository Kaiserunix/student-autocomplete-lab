import { readFile } from "node:fs/promises";

export interface ModelEnv {
  MIMO_OPENAI_BASE_URL?: string;
  MIMO_API_KEY?: string;
  MIMO_AUTOCOMPLETE_MODEL?: string;
  MIMO_CHAT_MODEL?: string;
  DEEPSEEK_BASE_URL?: string;
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_AUTOCOMPLETE_MODEL?: string;
}

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

export function requireMimoAutocompleteConfig(env: ModelEnv): {
  baseUrl: string;
  apiKey: string;
  model: string;
} {
  const baseUrl = env.MIMO_OPENAI_BASE_URL;
  const apiKey = env.MIMO_API_KEY;
  const model = normalizeAutocompleteModel(env.MIMO_AUTOCOMPLETE_MODEL);

  if (!baseUrl || !apiKey || !model) {
    throw new Error("Missing MiMo autocomplete config in secrets/models.env.");
  }

  return { baseUrl, apiKey, model };
}

function normalizeAutocompleteModel(model: string | undefined): string | undefined {
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
