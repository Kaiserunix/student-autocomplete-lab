import * as vscode from "vscode";
import type {
  AiProviderKind,
  AiRoleConfig,
  SidebarAiConfigView,
  SupportedLanguage
} from "../core/contracts";
import { DEFAULT_AI_ROUTER_CONFIG, type AiRouterConfig } from "../core/ai";
import type {
  ConfigInspection,
  ConfigTarget,
  MementoPort,
  WorkspaceConfigPort
} from "../experience";

export const CHAT_API_KEY_SECRET = "algoCoach.secret.chatApiKey";
export const FIM_API_KEY_SECRET = "algoCoach.secret.fimApiKey";

export const AI_CONFIG_KEYS = {
  chatProvider: "algoCoach.ai.chat.provider",
  chatBaseUrl: "algoCoach.ai.chat.baseUrl",
  chatModel: "algoCoach.ai.chat.model",
  fimProvider: "algoCoach.ai.fim.provider",
  fimBaseUrl: "algoCoach.ai.fim.baseUrl",
  fimModel: "algoCoach.ai.fim.model",
  codeforcesHandle: "algoCoach.oj.codeforcesHandle",
  bridgePort: "algoCoach.oj.bridgePort",
  runnerTimeoutMs: "algoCoach.runner.timeoutMs"
} as const;

const VALID_PROVIDERS = new Set<AiProviderKind>([
  "openai-compatible",
  "openai",
  "anthropic",
  "ollama"
]);

export interface SecretStorageLike {
  get(key: string): Thenable<string | undefined> | Promise<string | undefined>;
  store(key: string, value: string): Thenable<void> | Promise<void>;
  delete(key: string): Thenable<void> | Promise<void>;
}

export interface WorkspaceLike {
  readonly workspaceFolders?: readonly { readonly uri: vscode.Uri }[];
  getConfiguration(section?: string): vscode.WorkspaceConfiguration;
}

/**
 * Resolves workspace scope when at least one workspace folder is open,
 * otherwise gracefully falls back to global user scope so VS Code never throws.
 */
export function resolveDefaultConfigTarget(
  workspace: Pick<WorkspaceLike, "workspaceFolders"> = vscode.workspace
): ConfigTarget {
  return workspace.workspaceFolders && workspace.workspaceFolders.length > 0
    ? "workspace"
    : "global";
}

/**
 * Adapts `vscode.workspace.getConfiguration()` to domain `WorkspaceConfigPort`.
 */
export class VscodeWorkspaceConfigAdapter implements WorkspaceConfigPort {
  constructor(private readonly workspace: WorkspaceLike = vscode.workspace) {}

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    const cfg = this.workspace.getConfiguration();
    return defaultValue === undefined ? cfg.get<T>(key) : cfg.get<T>(key, defaultValue);
  }

  inspect<T>(key: string): ConfigInspection<T> | undefined {
    const raw = this.workspace.getConfiguration().inspect<T>(key);
    if (!raw) {
      return undefined;
    }
    return {
      key: raw.key,
      defaultValue: raw.defaultValue,
      globalValue: raw.globalValue,
      workspaceValue: raw.workspaceValue,
      workspaceFolderValue: raw.workspaceFolderValue
    };
  }

  async update(key: string, value: unknown, target: ConfigTarget): Promise<void> {
    const hasWorkspace = Boolean(
      this.workspace.workspaceFolders && this.workspace.workspaceFolders.length > 0
    );
    const vscodeTarget =
      target === "global" || !hasWorkspace
        ? vscode.ConfigurationTarget.Global
        : vscode.ConfigurationTarget.Workspace;
    await this.workspace.getConfiguration().update(key, value, vscodeTarget);
  }
}

/**
 * Adapts VS Code `context.globalState` to domain `MementoPort`.
 */
export class VscodeMementoAdapter implements MementoPort {
  constructor(private readonly memento: vscode.Memento) {}

  get<T>(key: string): T | undefined;
  get<T>(key: string, defaultValue: T): T;
  get<T>(key: string, defaultValue?: T): T | undefined {
    return defaultValue === undefined
      ? this.memento.get<T>(key)
      : this.memento.get<T>(key, defaultValue);
  }

  async update(key: string, value: unknown): Promise<void> {
    await this.memento.update(key, value);
  }
}

/**
 * Encapsulates VS Code `SecretStorage` with strict isolation between
 * `algoCoach.secret.chatApiKey` and `algoCoach.secret.fimApiKey`.
 */
export class SecretKeyStore {
  constructor(private readonly secrets: SecretStorageLike) {}

  async getChatApiKey(): Promise<string | undefined> {
    const raw = await this.secrets.get(CHAT_API_KEY_SECRET);
    const trimmed = raw?.trim();
    return trimmed ? trimmed : undefined;
  }

  async setChatApiKey(apiKey: string | undefined): Promise<void> {
    const trimmed = apiKey?.trim();
    if (!trimmed) {
      await this.secrets.delete(CHAT_API_KEY_SECRET);
      return;
    }
    await this.secrets.store(CHAT_API_KEY_SECRET, trimmed);
  }

  async deleteChatApiKey(): Promise<void> {
    await this.secrets.delete(CHAT_API_KEY_SECRET);
  }

  async hasChatApiKey(): Promise<boolean> {
    return (await this.getChatApiKey()) !== undefined;
  }

  async getFimApiKey(): Promise<string | undefined> {
    const raw = await this.secrets.get(FIM_API_KEY_SECRET);
    const trimmed = raw?.trim();
    return trimmed ? trimmed : undefined;
  }

  async setFimApiKey(apiKey: string | undefined): Promise<void> {
    const trimmed = apiKey?.trim();
    if (!trimmed) {
      await this.secrets.delete(FIM_API_KEY_SECRET);
      return;
    }
    await this.secrets.store(FIM_API_KEY_SECRET, trimmed);
  }

  async deleteFimApiKey(): Promise<void> {
    await this.secrets.delete(FIM_API_KEY_SECRET);
  }

  async hasFimApiKey(): Promise<boolean> {
    return (await this.getFimApiKey()) !== undefined;
  }

  async getKnownSecrets(): Promise<string[]> {
    const [chat, fim] = await Promise.all([this.getChatApiKey(), this.getFimApiKey()]);
    return [chat, fim].filter((v): v is string => typeof v === "string" && v.length > 0);
  }
}

function normalizeProvider(raw: unknown, fallback: AiProviderKind): AiProviderKind {
  return typeof raw === "string" && VALID_PROVIDERS.has(raw as AiProviderKind)
    ? (raw as AiProviderKind)
    : fallback;
}

function readStringSetting(config: WorkspaceConfigPort, key: string, fallback: string): string {
  const value = config.get<string>(key);
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

/**
 * Reads dual-role AI configuration by combining non-secret workspace/user settings
 * with isolated `SecretStorage` API keys.
 */
export async function readAiRouterConfig(
  config: WorkspaceConfigPort,
  secrets: SecretKeyStore
): Promise<AiRouterConfig> {
  const [chatApiKey, fimApiKey] = await Promise.all([
    secrets.getChatApiKey(),
    secrets.getFimApiKey()
  ]);

  const chat: AiRoleConfig = {
    provider: normalizeProvider(
      config.get<string>(AI_CONFIG_KEYS.chatProvider),
      DEFAULT_AI_ROUTER_CONFIG.chat.provider
    ),
    baseUrl: readStringSetting(
      config,
      AI_CONFIG_KEYS.chatBaseUrl,
      DEFAULT_AI_ROUTER_CONFIG.chat.baseUrl
    ),
    model: readStringSetting(
      config,
      AI_CONFIG_KEYS.chatModel,
      DEFAULT_AI_ROUTER_CONFIG.chat.model
    ),
    ...(chatApiKey ? { apiKey: chatApiKey } : {})
  };

  const fim: AiRoleConfig = {
    provider: normalizeProvider(
      config.get<string>(AI_CONFIG_KEYS.fimProvider),
      DEFAULT_AI_ROUTER_CONFIG.fim.provider
    ),
    baseUrl: readStringSetting(
      config,
      AI_CONFIG_KEYS.fimBaseUrl,
      DEFAULT_AI_ROUTER_CONFIG.fim.baseUrl
    ),
    model: readStringSetting(
      config,
      AI_CONFIG_KEYS.fimModel,
      DEFAULT_AI_ROUTER_CONFIG.fim.model
    ),
    ...(fimApiKey ? { apiKey: fimApiKey } : {})
  };

  return {
    chat,
    fim,
    timeoutMs: DEFAULT_AI_ROUTER_CONFIG.timeoutMs
  };
}

/**
 * Builds a Webview-safe AI configuration view that NEVER exposes plaintext API keys.
 */
export async function buildSidebarAiConfigView(
  config: WorkspaceConfigPort,
  secrets: SecretKeyStore
): Promise<SidebarAiConfigView> {
  const [routerConfig, hasChatKey, hasFimKey] = await Promise.all([
    readAiRouterConfig(config, secrets),
    secrets.hasChatApiKey(),
    secrets.hasFimApiKey()
  ]);

  const codeforcesHandle = (config.get<string>(AI_CONFIG_KEYS.codeforcesHandle) ?? "").trim();

  return {
    chat: {
      provider: routerConfig.chat.provider,
      baseUrl: routerConfig.chat.baseUrl,
      model: routerConfig.chat.model,
      hasApiKey: hasChatKey
    },
    fim: {
      provider: routerConfig.fim.provider,
      baseUrl: routerConfig.fim.baseUrl,
      model: routerConfig.fim.model,
      hasApiKey: hasFimKey
    },
    codeforcesHandle
  };
}

export interface SaveAiConfigInput {
  chat: { provider: AiProviderKind; baseUrl: string; model: string; apiKey?: string };
  fim: { provider: AiProviderKind; baseUrl: string; model: string; apiKey?: string };
  codeforcesHandle?: string;
}

/**
 * Persists non-secret AI settings to VS Code configuration and writes API keys
 * exclusively to isolated `SecretStorage` entries (never plaintext settings).
 */
export async function saveAiConfigSafely(
  config: WorkspaceConfigPort,
  secrets: SecretKeyStore,
  input: SaveAiConfigInput,
  target: ConfigTarget
): Promise<AiRouterConfig> {
  await config.update(
    AI_CONFIG_KEYS.chatProvider,
    normalizeProvider(input.chat.provider, DEFAULT_AI_ROUTER_CONFIG.chat.provider),
    target
  );
  await config.update(AI_CONFIG_KEYS.chatBaseUrl, input.chat.baseUrl.trim(), target);
  await config.update(AI_CONFIG_KEYS.chatModel, input.chat.model.trim(), target);

  await config.update(
    AI_CONFIG_KEYS.fimProvider,
    normalizeProvider(input.fim.provider, DEFAULT_AI_ROUTER_CONFIG.fim.provider),
    target
  );
  await config.update(AI_CONFIG_KEYS.fimBaseUrl, input.fim.baseUrl.trim(), target);
  await config.update(AI_CONFIG_KEYS.fimModel, input.fim.model.trim(), target);

  if (input.codeforcesHandle !== undefined) {
    await config.update(AI_CONFIG_KEYS.codeforcesHandle, input.codeforcesHandle.trim(), target);
  }

  // Only overwrite stored secret when user actually entered a non-empty key
  if (typeof input.chat.apiKey === "string" && input.chat.apiKey.trim().length > 0) {
    await secrets.setChatApiKey(input.chat.apiKey);
  }
  if (typeof input.fim.apiKey === "string" && input.fim.apiKey.trim().length > 0) {
    await secrets.setFimApiKey(input.fim.apiKey);
  }

  return readAiRouterConfig(config, secrets);
}

/**
 * Maps VS Code languageId and optional file path to SupportedLanguage.
 */
export function mapVscodeLanguageId(languageId: string, filePath?: string): SupportedLanguage {
  const normalized = languageId.trim().toLowerCase();
  switch (normalized) {
    case "python":
      return "python";
    case "cpp":
      return "cpp";
    case "c":
      return "c";
    case "rust":
      return "rust";
    case "java":
      return "java";
    default:
      break;
  }

  if (filePath) {
    const lower = filePath.toLowerCase();
    if (lower.endsWith(".py")) return "python";
    if (
      lower.endsWith(".cpp") ||
      lower.endsWith(".cc") ||
      lower.endsWith(".cxx") ||
      lower.endsWith(".hpp")
    ) {
      return "cpp";
    }
    if (lower.endsWith(".c") || lower.endsWith(".h")) return "c";
    if (lower.endsWith(".rs")) return "rust";
    if (lower.endsWith(".java")) return "java";
  }

  return "generic";
}
