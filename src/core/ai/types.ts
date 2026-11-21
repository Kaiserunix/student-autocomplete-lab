import type { AiProviderKind, AiRoleConfig, ProjectionAudit } from "../contracts";

export type AiRoleName = "chat" | "fim";

export interface AiChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface AiChatCompletionRequest {
  messages: AiChatMessage[];
  maxTokens?: number;
  temperature?: number;
  stop?: string[];
  jsonMode?: boolean;
  signal?: AbortSignal;
}

export interface AiChatCompletionResponse {
  text: string;
  model: string;
  provider: AiProviderKind;
  endpoint: string;
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export interface AiFimCompletionRequest {
  prefix: string;
  suffix?: string;
  maxTokens?: number;
  temperature?: number;
  stop?: string[];
  signal?: AbortSignal;
}

export interface AiFimCompletionResponse {
  text: string;
  model: string;
  provider: AiProviderKind;
  endpoint: string;
  renderer: ProjectionAudit["renderer"];
  finishReason?: string;
}

export interface AiModelInfo {
  id: string;
  ownedBy?: string;
  displayName?: string;
}

export interface AiModelListResponse {
  models: AiModelInfo[];
  endpoint: string;
  provider: AiProviderKind;
}

export type AiConfigurationIssue =
  | "deepseek-fim-beta-required"
  | "missing-base-url"
  | "missing-model"
  | "missing-api-key";

export interface AiClientRequestOptions {
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface AiRouterConfig {
  chat: AiRoleConfig;
  fim: AiRoleConfig;
  timeoutMs?: number;
}

export class AiClientError extends Error {
  public readonly status?: number;
  public readonly code: string;
  public readonly provider: AiProviderKind;
  public readonly endpoint: string;

  constructor(params: {
    message: string;
    code: string;
    provider: AiProviderKind;
    endpoint: string;
    status?: number;
    cause?: unknown;
  }) {
    super(params.message);
    this.name = "AiClientError";
    this.code = params.code;
    this.provider = params.provider;
    this.endpoint = params.endpoint;
    this.status = params.status;
    if (params.cause !== undefined) {
      (this as Error & { cause?: unknown }).cause = params.cause;
    }
  }
}

const GENERIC_SECRET_PATTERNS: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /Bearer\s+[A-Za-z0-9._~+/=-]{4,}/gi, replacement: "Bearer [redacted]" },
  { pattern: /x-api-key\s*[=:]\s*[A-Za-z0-9._~+/=-]{4,}/gi, replacement: "x-api-key=[redacted]" },
  { pattern: /api[_-]?key\s*[=:]\s*[A-Za-z0-9._~+/=-]{4,}/gi, replacement: "api_key=[redacted]" },
  { pattern: /\bsk-ant-[A-Za-z0-9_-]{8,}\b/g, replacement: "[redacted]" },
  { pattern: /\bsk-[A-Za-z0-9_-]{8,}\b/g, replacement: "[redacted]" },
  { pattern: /\bgh[pousr]_[A-Za-z0-9_]{12,}\b/g, replacement: "[redacted]" },
  { pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/g, replacement: "[redacted]" }
];

export function redactSecrets(input: string, knownSecrets: readonly (string | undefined)[] = []): string {
  let output = input;
  const normalizedSecrets = Array.from(
    new Set(
      knownSecrets
        .map((s) => (s ?? "").trim())
        .filter((s) => s.length >= 4)
    )
  ).sort((a, b) => b.length - a.length);

  for (const secret of normalizedSecrets) {
    output = output.split(secret).join("[redacted]");
  }

  for (const { pattern, replacement } of GENERIC_SECRET_PATTERNS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

export function normalizeBaseUrl(rawUrl: string): string {
  return rawUrl.trim().replace(/\/+$/, "");
}

export function createTimeoutSignal(
  timeoutMs: number | undefined,
  externalSignal?: AbortSignal
): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  const onExternalAbort = (): void => {
    controller.abort(externalSignal?.reason ?? new Error("Request aborted"));
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort(externalSignal.reason ?? new Error("Request aborted"));
    } else {
      externalSignal.addEventListener("abort", onExternalAbort, { once: true });
    }
  }

  if (timeoutMs && timeoutMs > 0 && !controller.signal.aborted) {
    timer = setTimeout(() => {
      controller.abort(new Error(`Request timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  }

  return {
    signal: controller.signal,
    cleanup: () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
      if (externalSignal) {
        externalSignal.removeEventListener("abort", onExternalAbort);
      }
    }
  };
}

export function isLocalOllamaUrl(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl);
    const host = parsed.hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "[::1]";
  } catch {
    return false;
  }
}

export function isDeepSeekHost(baseUrl: string): boolean {
  try {
    const parsed = new URL(baseUrl);
    const host = parsed.hostname.toLowerCase();
    return host === "api.deepseek.com" || host.endsWith(".deepseek.com");
  } catch {
    return /deepseek\.com/i.test(baseUrl);
  }
}

export function isDeepSeekBetaEndpoint(baseUrl: string): boolean {
  if (!isDeepSeekHost(baseUrl)) {
    return false;
  }
  try {
    const parsed = new URL(baseUrl);
    return /^\/beta(?:\/|$)/i.test(parsed.pathname);
  } catch {
    return /\/beta(?:\/|$)/i.test(baseUrl);
  }
}
