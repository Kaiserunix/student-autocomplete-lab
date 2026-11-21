import type { AiProviderKind, ProjectionAudit } from "../contracts";
import { ModelRouter, resolveRoleRoute, type ResolvedRoleRoute } from "./modelRouter";
import {
  AiClientError,
  redactSecrets,
  type AiConfigurationIssue,
  type AiRouterConfig
} from "./types";

export type HealthCheckStepStatus = "pass" | "fail";

export type HealthCheckKeyState = "configured" | "not_required" | "missing";

export interface AiHealthCheckStep {
  step: "models" | "chatSmoke" | "fimSmoke";
  status: HealthCheckStepStatus;
  provider: AiProviderKind;
  endpoint?: string;
  model?: string;
  renderer?: ProjectionAudit["renderer"];
  keyState: HealthCheckKeyState;
  issueCode?: AiConfigurationIssue | string;
  count?: number;
  sampleOutputPreview?: string;
  error?: string;
  errorHint?: string;
  errorHintEn?: string;
  latencyMs: number;
}

export interface AiHealthCheckResult {
  checkedAt: string;
  allPassed: boolean;
  models: AiHealthCheckStep;
  chatSmoke: AiHealthCheckStep;
  fimSmoke: AiHealthCheckStep;
}

export interface RunAiHealthCheckOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: string;
  extraSecrets?: string[];
}

export async function runAiHealthCheck(
  config: AiRouterConfig,
  options: RunAiHealthCheckOptions = {}
): Promise<AiHealthCheckResult> {
  const checkedAt = options.now ?? new Date().toISOString();
  const knownSecrets = collectRouterSecrets(config, options.extraSecrets);
  const router = new ModelRouter(
    {
      ...config,
      timeoutMs: options.timeoutMs ?? config.timeoutMs ?? 15_000
    },
    { fetchImpl: options.fetchImpl }
  );

  const models = await runModelsStep(router, config, knownSecrets);
  const chatSmoke = await runChatSmokeStep(router, config, knownSecrets);
  const fimSmoke = await runFimSmokeStep(router, config, knownSecrets);

  return {
    checkedAt,
    allPassed: models.status === "pass" && chatSmoke.status === "pass" && fimSmoke.status === "pass",
    models,
    chatSmoke,
    fimSmoke
  };
}

export function collectRouterSecrets(
  config: AiRouterConfig,
  extraSecrets: readonly (string | undefined)[] = []
): string[] {
  return Array.from(
    new Set(
      [config.chat.apiKey, config.fim.apiKey, ...extraSecrets]
        .map((s) => (s ?? "").trim())
        .filter((s) => s.length >= 4)
    )
  );
}

async function runModelsStep(
  router: ModelRouter,
  config: AiRouterConfig,
  knownSecrets: string[]
): Promise<AiHealthCheckStep> {
  const startedAt = Date.now();
  const route = resolveRoleRoute("chat", config.chat);
  const keyState = toKeyState(route);

  if (route.configurationIssue === "missing-base-url") {
    return {
      step: "models",
      status: "fail",
      provider: route.provider,
      keyState,
      issueCode: "missing-base-url",
      error: "Chat Base URL is missing.",
      errorHint: "请先填写 Chat 接口 Base URL（例如 https://api.deepseek.com/v1）。",
      errorHintEn: "Configure the Chat Base URL first (e.g., https://api.deepseek.com/v1).",
      latencyMs: elapsedMs(startedAt)
    };
  }

  if (route.configurationIssue === "missing-api-key") {
    return {
      step: "models",
      status: "fail",
      provider: route.provider,
      endpoint: redactSecrets(route.modelsEndpoint, knownSecrets),
      keyState,
      issueCode: "missing-api-key",
      error: "Chat API Key is missing.",
      errorHint: "请先填写并保存 Chat 角色 API Key（不会明文展示）。",
      errorHintEn: "Configure and save the Chat API key (never displayed in plaintext).",
      latencyMs: elapsedMs(startedAt)
    };
  }

  try {
    const res = await router.listModels("chat");
    return {
      step: "models",
      status: "pass",
      provider: route.provider,
      endpoint: redactSecrets(res.endpoint, knownSecrets),
      model: route.model || undefined,
      renderer: route.renderer,
      keyState,
      count: res.models.length,
      latencyMs: elapsedMs(startedAt)
    };
  } catch (error) {
    const safeError = sanitizeErrorMessage(error, knownSecrets);
    const hints = buildBilingualErrorHint(safeError, "models", config);
    return {
      step: "models",
      status: "fail",
      provider: route.provider,
      endpoint: redactSecrets(route.modelsEndpoint, knownSecrets),
      model: route.model || undefined,
      renderer: route.renderer,
      keyState,
      issueCode: error instanceof AiClientError ? error.code : "MODELS_CHECK_FAILED",
      error: safeError,
      errorHint: hints.zh,
      errorHintEn: hints.en,
      latencyMs: elapsedMs(startedAt)
    };
  }
}

async function runChatSmokeStep(
  router: ModelRouter,
  config: AiRouterConfig,
  knownSecrets: string[]
): Promise<AiHealthCheckStep> {
  const startedAt = Date.now();
  const route = resolveRoleRoute("chat", config.chat);
  const keyState = toKeyState(route);

  if (route.configurationIssue) {
    const issueHints = configurationIssueHints(route.configurationIssue, "chat", config);
    return {
      step: "chatSmoke",
      status: "fail",
      provider: route.provider,
      endpoint: redactSecrets(route.endpoint, knownSecrets) || undefined,
      model: route.model || undefined,
      renderer: route.renderer,
      keyState,
      issueCode: route.configurationIssue,
      error: issueHints.error,
      errorHint: issueHints.zh,
      errorHintEn: issueHints.en,
      latencyMs: elapsedMs(startedAt)
    };
  }

  try {
    const res = await router.completeChat({
      messages: [
        { role: "system", content: "Reply with OK only." },
        { role: "user", content: "health check" }
      ],
      maxTokens: 16,
      temperature: 0
    });

    if (!res.text.trim()) {
      return {
        step: "chatSmoke",
        status: "fail",
        provider: route.provider,
        endpoint: redactSecrets(res.endpoint, knownSecrets),
        model: res.model,
        renderer: route.renderer,
        keyState,
        issueCode: "EMPTY_RESPONSE",
        error: "Chat smoke returned empty text.",
        errorHint: "接口已连通，但 Chat 冒烟返回为空；请确认模型名与接口协议匹配。",
        errorHintEn: "Endpoint responded with empty content; verify the Chat model name and protocol.",
        latencyMs: elapsedMs(startedAt)
      };
    }

    return {
      step: "chatSmoke",
      status: "pass",
      provider: route.provider,
      endpoint: redactSecrets(res.endpoint, knownSecrets),
      model: res.model,
      renderer: route.renderer,
      keyState,
      sampleOutputPreview: redactSecrets(res.text.trim().slice(0, 40), knownSecrets),
      latencyMs: elapsedMs(startedAt)
    };
  } catch (error) {
    const safeError = sanitizeErrorMessage(error, knownSecrets);
    const hints = buildBilingualErrorHint(safeError, "chatSmoke", config);
    return {
      step: "chatSmoke",
      status: "fail",
      provider: route.provider,
      endpoint: redactSecrets(route.endpoint, knownSecrets),
      model: route.model,
      renderer: route.renderer,
      keyState,
      issueCode: error instanceof AiClientError ? error.code : "CHAT_SMOKE_FAILED",
      error: safeError,
      errorHint: hints.zh,
      errorHintEn: hints.en,
      latencyMs: elapsedMs(startedAt)
    };
  }
}

async function runFimSmokeStep(
  router: ModelRouter,
  config: AiRouterConfig,
  knownSecrets: string[]
): Promise<AiHealthCheckStep> {
  const startedAt = Date.now();
  const route = resolveRoleRoute("fim", config.fim);
  const keyState = toKeyState(route);

  if (route.configurationIssue) {
    const issueHints = configurationIssueHints(route.configurationIssue, "fim", config);
    return {
      step: "fimSmoke",
      status: "fail",
      provider: route.provider,
      endpoint: redactSecrets(route.endpoint, knownSecrets) || undefined,
      model: route.model || undefined,
      renderer: route.renderer,
      keyState,
      issueCode: route.configurationIssue,
      error: issueHints.error,
      errorHint: issueHints.zh,
      errorHintEn: issueHints.en,
      latencyMs: elapsedMs(startedAt)
    };
  }

  try {
    const res = await router.completeFim({
      prefix: "def add(a, b):\n    ",
      suffix: "\nprint(add(1, 2))",
      maxTokens: 24,
      temperature: 0
    });

    if (!res.text.trim()) {
      return {
        step: "fimSmoke",
        status: "fail",
        provider: route.provider,
        endpoint: redactSecrets(res.endpoint, knownSecrets),
        model: res.model,
        renderer: res.renderer,
        keyState,
        issueCode: "EMPTY_RESPONSE",
        error: "FIM smoke returned empty text.",
        errorHint: "FIM 接口返回为空；请确认该模型支持 Fill-in-the-Middle 补全。",
        errorHintEn: "FIM endpoint returned empty output; verify the selected model supports FIM completions.",
        latencyMs: elapsedMs(startedAt)
      };
    }

    return {
      step: "fimSmoke",
      status: "pass",
      provider: route.provider,
      endpoint: redactSecrets(res.endpoint, knownSecrets),
      model: res.model,
      renderer: res.renderer,
      keyState,
      sampleOutputPreview: redactSecrets(res.text.trim().slice(0, 60), knownSecrets),
      latencyMs: elapsedMs(startedAt)
    };
  } catch (error) {
    const safeError = sanitizeErrorMessage(error, knownSecrets);
    const hints = buildBilingualErrorHint(safeError, "fimSmoke", config);
    return {
      step: "fimSmoke",
      status: "fail",
      provider: route.provider,
      endpoint: redactSecrets(route.endpoint, knownSecrets),
      model: route.model,
      renderer: route.renderer,
      keyState,
      issueCode: error instanceof AiClientError ? error.code : "FIM_SMOKE_FAILED",
      error: safeError,
      errorHint: hints.zh,
      errorHintEn: hints.en,
      latencyMs: elapsedMs(startedAt)
    };
  }
}

function configurationIssueHints(
  issue: AiConfigurationIssue,
  role: "chat" | "fim",
  config: AiRouterConfig
): { error: string; zh: string; en: string } {
  if (issue === "deepseek-fim-beta-required") {
    return {
      error: "DeepSeek FIM endpoint uses /v1 instead of /beta (deepseek-fim-beta-required).",
      zh: "DeepSeek FIM 补全必须使用 /beta 端点：请将 algoCoach.ai.fim.baseUrl 改为 https://api.deepseek.com/beta（Chat 角色仍保持 https://api.deepseek.com/v1）。",
      en: "DeepSeek FIM requires the /beta endpoint: set algoCoach.ai.fim.baseUrl to https://api.deepseek.com/beta (keep https://api.deepseek.com/v1 for Chat)."
    };
  }
  if (issue === "missing-base-url") {
    return {
      error: `${role.toUpperCase()} Base URL is missing.`,
      zh: `缺少 ${role.toUpperCase()} Base URL，请填写完整的 API 地址。`,
      en: `Missing ${role.toUpperCase()} Base URL. Enter the provider API base URL.`
    };
  }
  if (issue === "missing-model") {
    return {
      error: `${role.toUpperCase()} model name is missing.`,
      zh: `缺少 ${role.toUpperCase()} 模型名称，请在设置中指定模型名。`,
      en: `Missing ${role.toUpperCase()} model name. Specify a model in settings.`
    };
  }
  // missing-api-key
  if (role === "fim" && isCrossOrigin(config.chat.baseUrl, config.fim.baseUrl) && Boolean(config.chat.apiKey?.trim())) {
    return {
      error: "FIM API Key is missing for a separate FIM provider origin.",
      zh: "Chat 与 FIM 使用了独立域名，但未填写 FIM 专用 API Key；请在密钥配置中单独保存 FIM Key。",
      en: "Chat and FIM use different provider origins, and no dedicated FIM API key is configured. Save a FIM API key separately."
    };
  }
  return {
    error: `${role.toUpperCase()} API Key is missing.`,
    zh: `缺少 ${role.toUpperCase()} 专用 API Key；Chat 与 FIM 的密钥相互独立，请分别为当前角色保存 Key。`,
    en: `Missing ${role.toUpperCase()} API key. Chat and FIM keys are stored independently; save a key for this role.`
  };
}

function buildBilingualErrorHint(
  safeError: string,
  step: "models" | "chatSmoke" | "fimSmoke",
  config: AiRouterConfig
): { zh: string; en: string } {
  if (/deepseek|\/beta|DEEPSEEK_FIM_BETA_REQUIRED/i.test(safeError) && step === "fimSmoke") {
    return {
      zh: "DeepSeek FIM 补全必须将 FIM Base URL 设为 https://api.deepseek.com/beta（Chat 保留 /v1）。",
      en: "DeepSeek FIM completions require FIM Base URL https://api.deepseek.com/beta (keep /v1 for Chat)."
    };
  }
  if (/401|403|auth|api key|unauthorized|forbidden/i.test(safeError)) {
    if (step === "fimSmoke" && isCrossOrigin(config.chat.baseUrl, config.fim.baseUrl)) {
      return {
        zh: "FIM 鉴权失败：Chat 与 FIM 指向不同服务，请核对 FIM 专用 API Key 是否正确且具备模型权限。",
        en: "FIM authentication failed: Chat and FIM target different origins. Verify the dedicated FIM API key and model access."
      };
    }
    return {
      zh: "API Key 无效、过期或无权访问该模型；请检查当前角色的独立 Key 与 Base URL 是否匹配。",
      en: "API key is invalid, expired, or lacks access to this model. Verify this role's independent key and Base URL."
    };
  }
  if (/404|not found/i.test(safeError) && step === "models") {
    return {
      zh: "该兼容服务可能未开放 /models 列表端点；如 Chat 与 FIM 冒烟通过，可正常使用。",
      en: "This provider may not expose /models; if Chat and FIM smoke checks pass, coaching and autocomplete still work."
    };
  }
  if (/timed out|timeout|aborted/i.test(safeError)) {
    return {
      zh: "请求超时；请检查网络/代理、重试排除冷启动，或切换响应更快的模型。",
      en: "Request timed out. Check network/proxy settings, retry after cold start, or choose a faster model."
    };
  }
  if (/network|fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET/i.test(safeError)) {
    return {
      zh: "网络连接失败；请检查 Base URL、本地 Ollama 服务是否已启动，以及代理配置。",
      en: "Network connection failed. Check Base URL, confirm local Ollama is running if used, and inspect proxy settings."
    };
  }
  return {
    zh: "请核对当前角色的 Provider 类型、Base URL、模型名与 API Key 是否一致。",
    en: "Verify that provider type, Base URL, model name, and API key match for this role."
  };
}

function toKeyState(route: ResolvedRoleRoute): HealthCheckKeyState {
  if (!route.requiresApiKey) {
    return "not_required";
  }
  return route.hasApiKey ? "configured" : "missing";
}

function isCrossOrigin(urlA: string, urlB: string): boolean {
  try {
    return new URL(urlA).origin.toLowerCase() !== new URL(urlB).origin.toLowerCase();
  } catch {
    return urlA.trim().toLowerCase() !== urlB.trim().toLowerCase();
  }
}

function sanitizeErrorMessage(error: unknown, knownSecrets: string[]): string {
  const raw = error instanceof Error ? error.message : String(error);
  return redactSecrets(raw, knownSecrets);
}

function elapsedMs(startedAt: number): number {
  return Math.max(0, Date.now() - startedAt);
}
