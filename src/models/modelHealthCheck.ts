import {
  applyAiConfigUpdateToEnv,
  normalizeProviderMode,
  resolveSavedApiKeyForMode,
  resolveSavedBaseUrlForMode,
  type AiCredentialRole,
  type AiProviderConfigUpdate,
  type AiProviderMode,
  type ModelEnv
} from "../config/modelEnv";
import { requestMimoAutocompleteDetailed } from "../autocomplete/mimoAutocomplete";
import type { SkillPlanAudit } from "../skills/types";
import type { AutocompleteValidationStatus } from "../skills/validators/autocompleteOutputPolicy";
import { requestChatCompletionText, type ChatCompletionProviderConfig } from "./chatCompletionsClient";
import type { CompletionProviderConfig } from "./completionsClient";
import { routeAutocompleteModel, routeTeachingModel } from "./modelRouter";
import type { ModelTextTransport } from "./modelTextTransport";
import { listProviderModels } from "./providerModelsClient";

export type AiHealthCheckStepStatus = "pass" | "fail";

export interface AiHealthCheckStep {
  status: AiHealthCheckStepStatus;
  endpoint?: string;
  model?: string;
  format?: string;
  renderer?: SkillPlanAudit["renderer"];
  validationStatus?: AutocompleteValidationStatus;
  keyState?: "provided" | "saved" | "missing";
  count?: number;
  error?: string;
  errorHint?: string;
  latencyMs?: number;
}

export interface AiHealthCheckResult {
  checkedAt: string;
  providerMode?: string;
  models: AiHealthCheckStep;
  chatSmoke: AiHealthCheckStep;
  autocompleteSmoke: AiHealthCheckStep;
}

export interface CodexModelLister {
  listModels(): Promise<{ models: unknown[] }>;
}

export interface RunAiProviderHealthCheckInput {
  baseEnv: ModelEnv;
  config: AiProviderConfigUpdate;
  codexModels?: CodexModelLister;
  oauthTransport?: ModelTextTransport;
  fetchImpl?: typeof fetch;
  now?: string;
}

export interface RunAiProviderHealthCheckOutput {
  result: AiHealthCheckResult;
  allPassed: boolean;
}

export async function runAiProviderHealthCheck(
  input: RunAiProviderHealthCheckInput
): Promise<RunAiProviderHealthCheckOutput> {
  const mode = normalizeProviderMode(input.config.mode);
  const env = applyAiConfigUpdateForHealthCheck(input.baseEnv, input.config);
  const knownSecrets = collectKnownSecrets(input.baseEnv, env, input.config);
  const checkedAt = input.now ?? new Date().toISOString();

  const models = await runModelListHealthCheck(
    env,
    mode,
    input.config,
    knownSecrets,
    input.codexModels,
    input.fetchImpl
  );
  const chatSmoke = await runChatSmokeHealthCheck(
    env,
    input.config,
    knownSecrets,
    input.oauthTransport,
    input.fetchImpl
  );
  const autocompleteSmoke = await runAutocompleteSmokeHealthCheck(
    env,
    input.config,
    knownSecrets,
    input.oauthTransport,
    input.fetchImpl
  );

  const result: AiHealthCheckResult = {
    checkedAt,
    providerMode: mode,
    models,
    chatSmoke,
    autocompleteSmoke
  };
  const allPassed = [models, chatSmoke, autocompleteSmoke].every((step) => step.status === "pass");
  return { result, allPassed };
}

export function applyAiConfigUpdateForHealthCheck(env: ModelEnv, update: AiProviderConfigUpdate): ModelEnv {
  return applyAiConfigUpdateToEnv(env, update, { preserveEmptyModels: true });
}

export async function runModelListHealthCheck(
  env: ModelEnv,
  mode: AiProviderMode,
  config: AiProviderConfigUpdate,
  knownSecrets: string[],
  codexModels?: CodexModelLister,
  fetchImpl: typeof fetch = fetch
): Promise<AiHealthCheckStep> {
  const startedAt = Date.now();
  if (mode === "openai" && env.AI_OPENAI_AUTH_MODE === "codex-oauth") {
    if (!codexModels) {
      return failHealthCheckStep({
        endpoint: "codex://app-server/model/list",
        latencyMs: elapsedSince(startedAt),
        error: "Codex app-server model service is unavailable.",
        errorHint: "请先确认本机已安装并可启动 Codex CLI。"
      });
    }
    try {
      const result = await codexModels.listModels();
      return {
        status: "pass",
        endpoint: "codex://app-server/model/list",
        count: result.models.length,
        latencyMs: elapsedSince(startedAt)
      };
    } catch (error) {
      const message = redactKnownSecrets(errorMessage(error), knownSecrets);
      return failHealthCheckStep({
        endpoint: "codex://app-server/model/list",
        latencyMs: elapsedSince(startedAt),
        error: message,
        errorHint: healthCheckErrorHint(message, "models")
      });
    }
  }

  const endpointBase = resolveSavedBaseUrlForMode(env, mode);
  const apiKey = resolveSavedApiKeyForMode(env, mode, "analysis");
  const keyState = keyStateForApiKey(apiKey, config.apiKey);

  if (!endpointBase) {
    return failHealthCheckStep({
      keyState,
      latencyMs: elapsedSince(startedAt),
      error: "模型列表缺少 Base URL。",
      errorHint: "先填写分析接口 Base URL；补全专用 Base URL 不用于 /models。"
    });
  }
  if (!apiKey) {
    return failHealthCheckStep({
      endpoint: `${endpointBase.replace(/\/+$/, "")}/models`,
      keyState,
      latencyMs: elapsedSince(startedAt),
      error: "模型列表缺少 API Key。",
      errorHint: "填写 API Key 后点保存，或在本次检查里临时输入 key；界面不会显示明文。"
    });
  }

  try {
    const result = await listProviderModels(
      {
        mode,
        baseUrl: endpointBase,
        apiKey,
        anthropicVersion: "2023-06-01"
      },
      fetchImpl
    );
    return {
      status: "pass",
      endpoint: result.endpoint,
      keyState,
      count: result.models.length,
      latencyMs: elapsedSince(startedAt)
    };
  } catch (error) {
    const message = redactKnownSecrets(errorMessage(error), knownSecrets);
    return failHealthCheckStep({
      endpoint: `${endpointBase.replace(/\/+$/, "")}/models`,
      keyState,
      latencyMs: elapsedSince(startedAt),
      error: message,
      errorHint: healthCheckErrorHint(message, "models")
    });
  }
}

export async function runChatSmokeHealthCheck(
  env: ModelEnv,
  config: AiProviderConfigUpdate,
  knownSecrets: string[],
  oauthTransport?: ModelTextTransport,
  fetchImpl: typeof fetch = fetch
): Promise<AiHealthCheckStep> {
  const startedAt = Date.now();
  try {
    const route = routeTeachingModel(env, oauthTransport);
    const text = await requestChatCompletionText(
      route.config,
      {
        messages: [
          {
            role: "system",
            content: "Return OK only. Do not include explanations."
          },
          {
            role: "user",
            content: "health check"
          }
        ],
        maxTokens: 16,
        temperature: 0,
        usageLogPath: false
      },
      fetchImpl
    );
    if (!text.trim()) {
      throw new Error("Chat smoke 返回为空。");
    }
    return {
      status: "pass",
      endpoint: route.endpoint,
      model: route.model,
      format: route.format,
      keyState: providerKeyState(route.config, config, "analysis"),
      latencyMs: elapsedSince(startedAt)
    };
  } catch (error) {
    const message = redactKnownSecrets(errorMessage(error), knownSecrets);
    const routeInfo = safeTeachingRouteInfo(env, oauthTransport, config);
    return failHealthCheckStep({
      ...routeInfo,
      latencyMs: elapsedSince(startedAt),
      error: message,
      errorHint: healthCheckErrorHint(message, "chat", env)
    });
  }
}

export async function runAutocompleteSmokeHealthCheck(
  env: ModelEnv,
  config: AiProviderConfigUpdate,
  knownSecrets: string[],
  oauthTransport?: ModelTextTransport,
  fetchImpl: typeof fetch = fetch
): Promise<AiHealthCheckStep> {
  const startedAt = Date.now();
  try {
    const route = routeAutocompleteModel(env, oauthTransport);
    if (route.capabilities.configurationIssue === "deepseek-fim-beta-required") {
      return failHealthCheckStep({
        endpoint: route.endpoint,
        model: route.model,
        format: route.format,
        renderer: route.capabilities.renderer,
        keyState: providerKeyState(route.config, config, "autocomplete"),
        latencyMs: elapsedSince(startedAt),
        error: "DeepSeek FIM 补全端点不是 /beta。",
        errorHint: "DeepSeek FIM 补全需要把补全接口 Base URL 设置为 https://api.deepseek.com/beta；分析接口仍可保留 /v1。"
      });
    }
    const result = await requestMimoAutocompleteDetailed(
      route.config,
      {
        prefix: "def add(a, b):\n    ",
        suffix: "\nprint(add(1, 2))",
        language: "python",
        filePath: "health-check.py",
        capabilities: route.capabilities
      },
      fetchImpl
    );
    const resultInfo = {
      endpoint: route.endpoint,
      model: route.model,
      format: route.format,
      renderer: result.audit.renderer,
      validationStatus: result.status,
      keyState: providerKeyState(route.config, config, "autocomplete"),
      latencyMs: elapsedSince(startedAt)
    };
    if (result.status === "model-empty") {
      return failHealthCheckStep({
        ...resultInfo,
        error: "Autocomplete smoke model returned empty."
      });
    }
    if (result.status === "validator-rejected") {
      return failHealthCheckStep({
        ...resultInfo,
        error: "Autocomplete smoke rejected by policy: " + (result.rejectionReason ?? "unknown")
      });
    }
    return {
      status: "pass",
      ...resultInfo
    };
  } catch (error) {
    const message = redactKnownSecrets(errorMessage(error), knownSecrets);
    const routeInfo = safeAutocompleteRouteInfo(env, oauthTransport, config);
    return failHealthCheckStep({
      ...routeInfo,
      latencyMs: elapsedSince(startedAt),
      error: message,
      errorHint: healthCheckErrorHint(message, "autocomplete", env)
    });
  }
}

export function healthCheckErrorHint(
  message: string,
  scope: "models" | "chat" | "autocomplete",
  env?: ModelEnv
): string {
  if (/api key|key|401|403/i.test(message)) {
    if (
      scope === "autocomplete" &&
      env?.AI_PROVIDER_MODE !== "openai" &&
      env?.AI_PROVIDER_MODE !== "anthropic-native" &&
      env?.AI_OPENAI_COMPAT_AUTOCOMPLETE_BASE_URL?.trim() &&
      env?.AI_OPENAI_COMPAT_BASE_URL?.trim() &&
      normalizeOrigin(env.AI_OPENAI_COMPAT_AUTOCOMPLETE_BASE_URL) !== normalizeOrigin(env.AI_OPENAI_COMPAT_BASE_URL) &&
      !env.AI_OPENAI_COMPAT_AUTOCOMPLETE_API_KEY?.trim()
    ) {
      return "分析接口与补全接口使用了不同服务域名，但未填写补全专用 API Key；请在 AI 配置中填写补全专用 API Key。";
    }
    return "API Key 缺失、无效或没有该模型权限；请重新保存 key，并确认当前角色使用的是同一个 endpoint。";
  }
  if (/base url/i.test(message)) {
    return "Base URL 缺失或不完整；OpenAI 兼容服务通常形如 https://example.com/v1。";
  }
  if (/chat model|autocomplete model|model/i.test(message) && /missing|缺少/i.test(message)) {
    return scope === "autocomplete" ? "请填写补全模型名。" : "请填写提示/评分模型名。";
  }
  if (/DeepSeek FIM|\/beta|deepseek/i.test(message)) {
    return "DeepSeek FIM 补全需要把补全接口 Base URL 设置为 https://api.deepseek.com/beta。";
  }
  if (/\/models|模型列表|404/i.test(message) && scope === "models") {
    return "当前服务可能不支持 /models；这不一定影响 chat/补全，请继续看另外两张卡。";
  }
  if (/fetch failed|network|ENOTFOUND|ECONNRESET|before HTTP response/i.test(message)) {
    return "检查网络、代理或 Base URL；如果在国内网络，优先用当前可访问的兼容端点。";
  }
  if (/timed out|timeout|超时/i.test(message)) {
    return "模型未在当前等待窗口内返回；先重试一次排除冷启动，仍失败则换更快的补全模型或检查 app-server 状态。";
  }
  if (/response did not include|响应缺少|返回为空|empty/i.test(message)) {
    return "接口已连通，但返回格式不符合当前协议；请确认补全协议和模型类型是否匹配。";
  }

  return "请核对 endpoint、模型名和协议是否属于同一家 provider。";
}

export function collectKnownSecrets(...sources: Array<ModelEnv | AiProviderConfigUpdate>): string[] {
  const values: string[] = [];
  for (const source of sources) {
    const record = source as Record<string, string | undefined>;
    values.push(
      record.AI_OPENAI_API_KEY ?? "",
      record.AI_OPENAI_COMPAT_API_KEY ?? "",
      record.AI_OPENAI_COMPAT_AUTOCOMPLETE_API_KEY ?? "",
      record.AI_ANTHROPIC_API_KEY ?? "",
      record.MIMO_API_KEY ?? "",
      record.DEEPSEEK_API_KEY ?? "",
      record.apiKey ?? "",
      record.autocompleteApiKey ?? ""
    );
  }

  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length >= 4)));
}

export function redactKnownSecrets(message: string, secrets: string[]): string {
  let redacted = message;
  for (const secret of secrets) {
    redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/x-api-key[=:]\s*[A-Za-z0-9._~+/=-]+/gi, "x-api-key=[redacted]");
}

function failHealthCheckStep(step: Omit<AiHealthCheckStep, "status">): AiHealthCheckStep {
  return {
    status: "fail",
    ...step
  };
}

function safeTeachingRouteInfo(
  env: ModelEnv,
  oauthTransport: ModelTextTransport | undefined,
  config: AiProviderConfigUpdate
): {
  endpoint?: string;
  model?: string;
  format?: string;
  keyState?: AiHealthCheckStep["keyState"];
} {
  try {
    const route = routeTeachingModel(env, oauthTransport);
    return {
      endpoint: route.endpoint,
      model: route.model,
      format: route.format,
      keyState: providerKeyState(route.config, config, "analysis")
    };
  } catch {
    return {};
  }
}

function safeAutocompleteRouteInfo(
  env: ModelEnv,
  oauthTransport: ModelTextTransport | undefined,
  config: AiProviderConfigUpdate
): {
  endpoint?: string;
  model?: string;
  format?: string;
  renderer?: SkillPlanAudit["renderer"];
  keyState?: AiHealthCheckStep["keyState"];
} {
  try {
    const route = routeAutocompleteModel(env, oauthTransport);
    return {
      endpoint: route.endpoint,
      model: route.model,
      format: route.format,
      renderer: route.capabilities.renderer,
      keyState: providerKeyState(route.config, config, "autocomplete")
    };
  } catch {
    return {};
  }
}

function keyStateForApiKey(
  apiKey: string | undefined,
  providedApiKey: string | undefined
): AiHealthCheckStep["keyState"] {
  if (providedApiKey?.trim()) {
    return "provided";
  }
  if (apiKey?.trim()) {
    return "saved";
  }
  return "missing";
}

function providerKeyState(
  config: ChatCompletionProviderConfig | CompletionProviderConfig,
  update: AiProviderConfigUpdate,
  role: AiCredentialRole
): AiHealthCheckStep["keyState"] {
  if (config.format === "codex-app-server") {
    return undefined;
  }
  const providedKey =
    role === "autocomplete" && update.mode === "openai-compatible"
      ? update.autocompleteApiKey?.trim() || update.apiKey
      : update.apiKey;
  return keyStateForApiKey(config.apiKey, providedKey);
}

function normalizeOrigin(baseUrl: string): string {
  try {
    return new URL(baseUrl).origin.toLowerCase();
  } catch {
    return baseUrl.trim().toLowerCase();
  }
}

function elapsedSince(startedAt: number): number {
  return Date.now() - startedAt;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
