import type { ModelTextTransport } from "./modelTextTransport";

export interface HttpCompletionProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  mode?: string;
  authMode?: "api-key";
  format?: "openai-completions" | "openai-chat" | "anthropic-messages";
  anthropicVersion?: string;
}

export interface CodexCompletionProviderConfig {
  model: string;
  mode?: "openai";
  authMode: "codex-oauth";
  format: "codex-app-server";
  transport: ModelTextTransport;
}

export type CompletionProviderConfig = HttpCompletionProviderConfig | CodexCompletionProviderConfig;

export interface CompletionRequest {
  prompt: string;
  suffix?: string;
  maxTokens: number;
  temperature: number;
  stop?: string[];
  timeoutMs?: number;
  signal?: AbortSignal;
}

interface CompletionResponse {
  choices?: Array<{
    text?: unknown;
  }>;
  error?: {
    message?: unknown;
  };
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: unknown;
  };
}

interface AnthropicMessagesResponse {
  content?: Array<{
    type?: unknown;
    text?: unknown;
  }>;
  error?: {
    message?: unknown;
  };
}

interface JsonResponse<T> {
  payload: T;
}

function joinEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/completions`;
}

function joinChatEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function joinAnthropicEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/messages`;
}

export async function requestCompletion(
  config: CompletionProviderConfig,
  request: CompletionRequest,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  if (config.format === "codex-app-server") {
    return config.transport.generate({
      purpose: "autocomplete",
      model: config.model,
      prompt: serializeCompletionPrompt(request),
      maxOutputTokens: request.maxTokens,
      temperature: request.temperature,
      timeoutMs: request.timeoutMs ?? 5_000,
      signal: request.signal
    });
  }
  if (config.format === "openai-chat") {
    return requestChatCompletion(config, request, fetchImpl);
  }

  if (config.format === "anthropic-messages") {
    return requestAnthropicCompletion(config, request, fetchImpl);
  }

  const endpoint = joinEndpoint(config.baseUrl);
  const { payload } = await fetchJson<CompletionResponse>(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        prompt: request.prompt,
        ...(shouldSendFimSuffix(config, request) ? { suffix: request.suffix } : {}),
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        stop: request.stop
      })
    },
    fetchImpl,
    { operation: "Completion", endpoint, config }
  );

  const text = payload.choices?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("Completion response did not include choices[0].text.");
  }

  return text;
}

async function requestChatCompletion(
  config: HttpCompletionProviderConfig,
  request: CompletionRequest,
  fetchImpl: typeof fetch
): Promise<string> {
  const endpoint = joinChatEndpoint(config.baseUrl);
  const { payload } = await fetchJson<ChatCompletionResponse>(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        messages: [
          {
            role: "system",
            content: "Return only the immediate code continuation. Do not explain."
          },
          {
            role: "user",
            content: request.prompt
          }
        ],
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        stop: request.stop
      })
    },
    fetchImpl,
    { operation: "Chat completion", endpoint, config }
  );

  const text = payload.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error("Chat completion response did not include choices[0].message.content.");
  }

  return text;
}

async function requestAnthropicCompletion(
  config: HttpCompletionProviderConfig,
  request: CompletionRequest,
  fetchImpl: typeof fetch
): Promise<string> {
  const endpoint = joinAnthropicEndpoint(config.baseUrl);
  const { payload } = await fetchJson<AnthropicMessagesResponse>(
    endpoint,
    {
      method: "POST",
      headers: {
        "x-api-key": config.apiKey,
        "anthropic-version": config.anthropicVersion ?? "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: config.model,
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        system: "Return only the immediate code continuation. Do not explain.",
        messages: [
          {
            role: "user",
            content: request.prompt
          }
        ]
      })
    },
    fetchImpl,
    { operation: "Anthropic messages", endpoint, config }
  );

  const text = payload.content?.find((block) => block.type === "text" && typeof block.text === "string")?.text;
  if (typeof text !== "string") {
    throw new Error("Anthropic messages response did not include a text content block.");
  }

  return text;
}

async function fetchJson<T>(
  endpoint: string,
  init: RequestInit,
  fetchImpl: typeof fetch,
  context: { operation: string; endpoint: string; config: HttpCompletionProviderConfig }
): Promise<JsonResponse<T>> {
  let response: Response;
  try {
    response = await fetchImpl(endpoint, init);
  } catch (error) {
    throw new Error(
      `${context.operation} request failed before HTTP response: ${requestContext(context)}; ${errorMessage(error)}`
    );
  }

  const rawText = await response.text();
  const payload = parseJsonObject(rawText) as T;
  if (!response.ok) {
    const upstream = errorFromPayload(payload) ?? previewText(rawText) ?? `HTTP ${response.status}`;
    throw new Error(
      `${context.operation} request failed: HTTP ${response.status}; ${requestContext(context)}; ${upstream}${modelHint(
        context.config,
        response.status
      )}`
    );
  }

  return { payload };
}

function parseJsonObject(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

function errorFromPayload(payload: unknown): string | undefined {
  const record = asRecord(payload);
  const error = asRecord(record?.error);
  return typeof error?.message === "string" ? error.message : undefined;
}

function requestContext(context: { endpoint: string; config: HttpCompletionProviderConfig }): string {
  return `endpoint=${context.endpoint}; model=${context.config.model}; format=${context.config.format ?? "openai-completions"}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function previewText(text: string): string | undefined {
  const preview = text.replace(/\s+/g, " ").trim().slice(0, 240);
  return preview || undefined;
}

function modelHint(config: HttpCompletionProviderConfig, status: number): string {
  if (
    status === 400 &&
    sanitizeBaseUrl(config.baseUrl).includes("api.deepseek.com") &&
    config.format === "openai-completions" &&
    !sanitizeBaseUrl(config.baseUrl).includes("/beta")
  ) {
    return " DeepSeek FIM 补全需要把补全 Base URL 设置为 https://api.deepseek.com/beta。";
  }

  if (
    status >= 500 &&
    sanitizeBaseUrl(config.baseUrl).includes("xiaomimimo.com") &&
    config.model === "mimo-v2.5"
  ) {
    return " 当前 MiMo 模型 mimo-v2.5 可能不可用，建议切换 mimo-v2.5-pro 后重试。";
  }

  return "";
}

function sanitizeBaseUrl(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return baseUrl.replace(/[?&]key=[^&]+/gi, "");
  }
}

function shouldSendFimSuffix(config: HttpCompletionProviderConfig, request: CompletionRequest): boolean {
  return Boolean(
    request.suffix &&
      config.format !== "openai-chat" &&
      config.format !== "anthropic-messages" &&
      sanitizeBaseUrl(config.baseUrl).includes("api.deepseek.com") &&
      sanitizeBaseUrl(config.baseUrl).includes("/beta")
  );
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function serializeCompletionPrompt(request: CompletionRequest): string {
  if (request.suffix === undefined) {
    return request.prompt;
  }
  return `${request.prompt}\n\n<suffix>\n${request.suffix}\n</suffix>`;
}
