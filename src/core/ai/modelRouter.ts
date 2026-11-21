import type { AiProviderKind, AiRoleConfig, ProjectionAudit } from "../contracts";
import {
  listAnthropicModels,
  requestAnthropicFim,
  requestAnthropicMessage,
  resolveAnthropicBaseUrl,
  streamAnthropicMessage
} from "./anthropicClient";
import {
  listOpenAiCompatModels,
  requestOpenAiCompatChat,
  requestOpenAiCompatFim,
  resolveOpenAiCompatBaseUrl,
  streamOpenAiCompatChat
} from "./openaiCompatClient";
import {
  AiClientError,
  isDeepSeekBetaEndpoint,
  isDeepSeekHost,
  isLocalOllamaUrl,
  normalizeBaseUrl,
  type AiChatCompletionRequest,
  type AiChatCompletionResponse,
  type AiClientRequestOptions,
  type AiConfigurationIssue,
  type AiFimCompletionRequest,
  type AiFimCompletionResponse,
  type AiModelListResponse,
  type AiRoleName,
  type AiRouterConfig
} from "./types";

export const DEFAULT_AI_ROUTER_CONFIG: AiRouterConfig = {
  chat: {
    provider: "openai-compatible",
    baseUrl: "https://api.deepseek.com/v1",
    model: "deepseek-chat"
  },
  fim: {
    provider: "openai-compatible",
    baseUrl: "https://api.deepseek.com/beta",
    model: "deepseek-chat"
  },
  timeoutMs: 30_000
};

export interface ResolvedRoleRoute {
  role: AiRoleName;
  provider: AiProviderKind;
  baseUrl: string;
  endpoint: string;
  modelsEndpoint: string;
  model: string;
  renderer: ProjectionAudit["renderer"];
  requiresApiKey: boolean;
  hasApiKey: boolean;
  configurationIssue?: AiConfigurationIssue;
}

export function resolveRoleRoute(role: AiRoleName, rawConfig: AiRoleConfig): ResolvedRoleRoute {
  const provider = rawConfig.provider;
  const model = rawConfig.model.trim();
  const baseUrl =
    provider === "anthropic"
      ? resolveAnthropicBaseUrl(rawConfig)
      : resolveOpenAiCompatBaseUrl(rawConfig);

  const requiresApiKey = !(provider === "ollama" && (baseUrl === "" || isLocalOllamaUrl(baseUrl)));
  const hasApiKey = Boolean(rawConfig.apiKey?.trim());

  let endpoint: string;
  let renderer: ProjectionAudit["renderer"];
  if (provider === "anthropic") {
    endpoint = baseUrl ? `${baseUrl}/messages` : "";
    renderer = "anthropic-messages";
  } else if (role === "chat") {
    endpoint = baseUrl ? `${baseUrl}/chat/completions` : "";
    renderer = "chat-messages";
  } else {
    endpoint = baseUrl ? `${baseUrl}/completions` : "";
    renderer = isDeepSeekBetaEndpoint(baseUrl) ? "deepseek-fim" : "generic-completion";
  }

  const modelsEndpoint = baseUrl ? `${baseUrl}/models` : "";
  const configurationIssue = detectRoleConfigurationIssue(role, provider, baseUrl, model, requiresApiKey, hasApiKey);

  return {
    role,
    provider,
    baseUrl,
    endpoint,
    modelsEndpoint,
    model,
    renderer,
    requiresApiKey,
    hasApiKey,
    configurationIssue
  };
}

export function detectRoleConfigurationIssue(
  role: AiRoleName,
  provider: AiProviderKind,
  baseUrl: string,
  model: string,
  requiresApiKey: boolean,
  hasApiKey: boolean
): AiConfigurationIssue | undefined {
  if (!normalizeBaseUrl(baseUrl)) {
    return "missing-base-url";
  }
  if (!model.trim()) {
    return "missing-model";
  }
  if (
    role === "fim" &&
    (provider === "openai-compatible" || provider === "openai") &&
    isDeepSeekHost(baseUrl) &&
    !isDeepSeekBetaEndpoint(baseUrl)
  ) {
    return "deepseek-fim-beta-required";
  }
  if (requiresApiKey && !hasApiKey) {
    return "missing-api-key";
  }
  return undefined;
}

export class ModelRouter {
  private chatConfig: AiRoleConfig;
  private fimConfig: AiRoleConfig;
  private readonly defaultTimeoutMs: number;
  private readonly defaultFetch?: typeof fetch;

  constructor(config: AiRouterConfig, options: { fetchImpl?: typeof fetch } = {}) {
    this.chatConfig = cloneRoleConfig(config.chat);
    this.fimConfig = cloneRoleConfig(config.fim);
    this.defaultTimeoutMs = config.timeoutMs ?? 30_000;
    this.defaultFetch = options.fetchImpl;
  }

  /**
   * Returns a safe summary of the route without exposing the raw API key.
   */
  public describeRoute(role: AiRoleName): ResolvedRoleRoute {
    return resolveRoleRoute(role, this.getRawRoleConfig(role));
  }

  /**
   * Returns a shallow copy of the role config (keeping chat and fim strictly isolated).
   */
  public getRoleConfig(role: AiRoleName): Readonly<AiRoleConfig> {
    return cloneRoleConfig(this.getRawRoleConfig(role));
  }

  /**
   * Updates only the target role config without mutating the other role.
   */
  public updateRoleConfig(role: AiRoleName, next: AiRoleConfig): void {
    if (role === "chat") {
      this.chatConfig = cloneRoleConfig(next);
    } else {
      this.fimConfig = cloneRoleConfig(next);
    }
  }

  public isRoleReady(role: AiRoleName): boolean {
    return this.describeRoute(role).configurationIssue === undefined;
  }

  public async listModels(
    role: AiRoleName = "chat",
    options: AiClientRequestOptions = {}
  ): Promise<AiModelListResponse> {
    const config = this.getRawRoleConfig(role);
    const reqOpts = this.mergeOptions(options);
    if (config.provider === "anthropic") {
      return await listAnthropicModels(config, reqOpts);
    }
    return await listOpenAiCompatModels(config, reqOpts);
  }

  public async completeChat(
    request: AiChatCompletionRequest,
    options: AiClientRequestOptions = {}
  ): Promise<AiChatCompletionResponse> {
    const config = this.getRawRoleConfig("chat");
    const reqOpts = this.mergeOptions(options);
    if (config.provider === "anthropic") {
      return await requestAnthropicMessage(config, request, reqOpts);
    }
    return await requestOpenAiCompatChat(config, request, reqOpts);
  }

  public async streamChat(
    request: AiChatCompletionRequest,
    onDelta: (chunk: string) => void,
    options: AiClientRequestOptions = {}
  ): Promise<AiChatCompletionResponse> {
    const config = this.getRawRoleConfig("chat");
    const reqOpts = this.mergeOptions(options);
    if (config.provider === "anthropic") {
      return await streamAnthropicMessage(config, request, onDelta, reqOpts);
    }
    return await streamOpenAiCompatChat(config, request, onDelta, reqOpts);
  }

  public async completeFim(
    request: AiFimCompletionRequest,
    options: AiClientRequestOptions = {}
  ): Promise<AiFimCompletionResponse> {
    const config = this.getRawRoleConfig("fim");
    const route = resolveRoleRoute("fim", config);

    if (route.configurationIssue === "deepseek-fim-beta-required") {
      throw new AiClientError({
        message:
          "DeepSeek FIM requires Base URL https://api.deepseek.com/beta instead of /v1. Keep /v1 for Chat and set /beta for FIM.",
        code: "DEEPSEEK_FIM_BETA_REQUIRED",
        provider: config.provider,
        endpoint: route.endpoint
      });
    }

    const reqOpts = this.mergeOptions(options);
    if (config.provider === "anthropic") {
      return await requestAnthropicFim(config, request, reqOpts);
    }
    return await requestOpenAiCompatFim(config, request, reqOpts);
  }

  private getRawRoleConfig(role: AiRoleName): AiRoleConfig {
    return role === "chat" ? this.chatConfig : this.fimConfig;
  }

  private mergeOptions(options: AiClientRequestOptions): AiClientRequestOptions {
    return {
      fetchImpl: options.fetchImpl ?? this.defaultFetch,
      timeoutMs: options.timeoutMs ?? this.defaultTimeoutMs
    };
  }
}

function cloneRoleConfig(config: AiRoleConfig): AiRoleConfig {
  return {
    provider: config.provider,
    baseUrl: config.baseUrl,
    model: config.model,
    ...(config.apiKey !== undefined ? { apiKey: config.apiKey } : {})
  };
}
