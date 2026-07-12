import { readFile } from "node:fs/promises";
import * as vscode from "vscode";
import {
  buildAiConfigView,
  loadModelEnvFromText,
  modelEnvFromSettings,
  type AiConfigView,
  type AiProviderConfigUpdate,
  type AiProviderMode,
  type AiProviderSettings,
  type AiSecretSnapshot,
  type AiSettingsSnapshot,
  type AutocompleteFormat,
  type ModelEnv
} from "./modelEnv";

const settingSection = "studentAutocomplete.ai";
const secretKeys = {
  openai: "studentAutocomplete.ai.openai.apiKey",
  openaiCompatible: "studentAutocomplete.ai.openaiCompatible.apiKey",
  anthropic: "studentAutocomplete.ai.anthropic.apiKey"
};

export async function loadModelEnvFromVsCode(
  context: vscode.ExtensionContext,
  legacyEnvPath?: string
): Promise<ModelEnv> {
  const legacyEnv = legacyEnvPath ? loadModelEnvFromText(await readTextIfExists(legacyEnvPath)) : {};
  const settings = readConfiguredAiSettings();
  const secrets = await readAiSecrets(context.secrets);
  return modelEnvFromSettings(legacyEnv, settings, secrets);
}

export async function buildAiConfigViewFromVsCode(
  context: vscode.ExtensionContext,
  legacyEnvPath?: string
): Promise<AiConfigView> {
  return buildAiConfigView(await loadModelEnvFromVsCode(context, legacyEnvPath));
}

export async function saveAiConfigToVsCode(
  context: vscode.ExtensionContext,
  update: AiProviderConfigUpdate
): Promise<void> {
  const configuration = vscode.workspace.getConfiguration(settingSection);
  const target = vscode.ConfigurationTarget.Global;

  await configuration.update("providerMode", update.mode, target);
  if (update.mode === "openai") {
    await updateProviderSettings(configuration, target, "openai", update);
    await storeSecretIfProvided(context.secrets, secretKeys.openai, update.apiKey);
  } else if (update.mode === "anthropic-native") {
    await updateProviderSettings(configuration, target, "anthropic", update);
    await storeSecretIfProvided(context.secrets, secretKeys.anthropic, update.apiKey);
  } else {
    await updateProviderSettings(configuration, target, "openaiCompatible", update);
    await configuration.update("openaiCompatible.autocompleteFormat", update.autocompleteFormat, target);
    await storeSecretIfProvided(context.secrets, secretKeys.openaiCompatible, update.apiKey);
  }
}

function readConfiguredAiSettings(): AiSettingsSnapshot {
  const configuration = vscode.workspace.getConfiguration(settingSection);
  return {
    providerMode: configuredEnum<AiProviderMode>(configuration, "providerMode", [
      "openai",
      "openai-compatible",
      "anthropic-native"
    ]),
    openai: readProviderSettings(configuration, "openai"),
    openaiCompatible: readProviderSettings(configuration, "openaiCompatible"),
    anthropic: readProviderSettings(configuration, "anthropic")
  };
}

function readProviderSettings(configuration: vscode.WorkspaceConfiguration, prefix: string): AiProviderSettings | undefined {
  const settings: AiProviderSettings = {
    baseUrl: configuredString(configuration, `${prefix}.baseUrl`),
    autocompleteBaseUrl: configuredString(configuration, `${prefix}.autocompleteBaseUrl`),
    apiKey: configuredString(configuration, `${prefix}.apiKey`),
    chatModel: configuredString(configuration, `${prefix}.chatModel`),
    autocompleteModel: configuredString(configuration, `${prefix}.autocompleteModel`),
    autocompleteFormat: configuredEnum<AutocompleteFormat>(configuration, `${prefix}.autocompleteFormat`, [
      "openai-completions",
      "openai-chat",
      "anthropic-messages"
    ])
  };
  return Object.values(settings).some((value) => Boolean(value)) ? settings : undefined;
}

async function readAiSecrets(secrets: vscode.SecretStorage): Promise<AiSecretSnapshot> {
  return {
    openaiApiKey: await secrets.get(secretKeys.openai),
    openaiCompatibleApiKey: await secrets.get(secretKeys.openaiCompatible),
    anthropicApiKey: await secrets.get(secretKeys.anthropic)
  };
}

async function updateProviderSettings(
  configuration: vscode.WorkspaceConfiguration,
  target: vscode.ConfigurationTarget,
  prefix: "openai" | "openaiCompatible" | "anthropic",
  update: AiProviderConfigUpdate
): Promise<void> {
  await configuration.update(`${prefix}.baseUrl`, update.baseUrl, target);
  if (prefix === "openaiCompatible") {
    await configuration.update(`${prefix}.autocompleteBaseUrl`, update.autocompleteBaseUrl?.trim() || "", target);
  }
  await configuration.update(`${prefix}.chatModel`, update.chatModel, target);
  await configuration.update(`${prefix}.autocompleteModel`, update.autocompleteModel, target);
}

async function storeSecretIfProvided(
  secrets: vscode.SecretStorage,
  key: string,
  value: string | undefined
): Promise<void> {
  if (value?.trim()) {
    await secrets.store(key, value.trim());
  }
}

function configuredString(configuration: vscode.WorkspaceConfiguration, key: string): string | undefined {
  const value = configuredValue<string>(configuration, key);
  return value?.trim() ? value.trim() : undefined;
}

function configuredEnum<T extends string>(
  configuration: vscode.WorkspaceConfiguration,
  key: string,
  allowed: readonly T[]
): T | undefined {
  const value = configuredValue<string>(configuration, key);
  return allowed.includes(value as T) ? (value as T) : undefined;
}

function configuredValue<T>(configuration: vscode.WorkspaceConfiguration, key: string): T | undefined {
  const inspected = configuration.inspect<T>(key);
  if (!inspected) {
    return undefined;
  }
  return inspected.globalValue;
}

async function readTextIfExists(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}
