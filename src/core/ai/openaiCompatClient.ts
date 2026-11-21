import type { AiRoleConfig, ProjectionAudit } from "../contracts";
import {
  AiClientError,
  createTimeoutSignal,
  isDeepSeekBetaEndpoint,
  normalizeBaseUrl,
  redactSecrets,
  type AiChatCompletionRequest,
  type AiChatCompletionResponse,
  type AiClientRequestOptions,
  type AiFimCompletionRequest,
  type AiFimCompletionResponse,
  type AiModelInfo,
  type AiModelListResponse
} from "./types";

const DEFAULT_TIMEOUT_MS = 30_000;

interface OpenAiChatResponseBody {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
    delta?: {
      content?: string;
    };
    finish_reason?: string | null;
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  error?: {
    message?: string;
    code?: string;
    type?: string;
  };
}

interface OpenAiCompletionResponseBody {
  model?: string;
  choices?: Array<{
    text?: string;
    finish_reason?: string | null;
  }>;
  error?: {
    message?: string;
    code?: string;
  };
}

interface OpenAiModelsResponseBody {
  data?: Array<{
    id?: string;
    owned_by?: string;
  }>;
  models?: Array<{
    name?: string;
    model?: string;
  }>;
}

export function resolveOpenAiCompatBaseUrl(config: AiRoleConfig): string {
  const base = normalizeBaseUrl(config.baseUrl);
  if (!base) {
    if (config.provider === "openai") {
      return "https://api.openai.com/v1";
    }
    if (config.provider === "ollama") {
      return "http://localhost:11434/v1";
    }
    return "";
  }
  if (config.provider === "ollama" && !/\/v1$/i.test(base) && !/\/api$/i.test(base)) {
    return `${base}/v1`;
  }
  return base;
}

export function buildOpenAiCompatHeaders(config: AiRoleConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json"
  };
  const key = config.apiKey?.trim();
  if (key) {
    headers.authorization = `Bearer ${key}`;
  }
  return headers;
}

export async function listOpenAiCompatModels(
  config: AiRoleConfig,
  options: AiClientRequestOptions = {}
): Promise<AiModelListResponse> {
  const baseUrl = resolveOpenAiCompatBaseUrl(config);
  const endpoint = `${baseUrl}/models`;
  if (!baseUrl) {
    throw new AiClientError({
      message: "Missing Base URL for OpenAI-compatible model listing.",
      code: "MISSING_BASE_URL",
      provider: config.provider,
      endpoint
    });
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const { signal, cleanup } = createTimeoutSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetchImpl(endpoint, {
      method: "GET",
      headers: buildOpenAiCompatHeaders(config),
      signal
    });

    if (!response.ok) {
      const errText = await safeReadErrorText(response, config.apiKey);
      // Ollama fallback to native /api/tags when /v1/models is unavailable
      if (config.provider === "ollama" && response.status === 404) {
        return await listOllamaNativeTags(config, baseUrl, fetchImpl, signal);
      }
      throw new AiClientError({
        message: `HTTP ${response.status} listing models: ${errText}`,
        code: httpErrorCode(response.status),
        provider: config.provider,
        endpoint,
        status: response.status
      });
    }

    const body = (await response.json()) as OpenAiModelsResponseBody;
    const models = parseModelsPayload(body);
    return {
      models,
      endpoint,
      provider: config.provider
    };
  } catch (error) {
    throw wrapClientError(error, config, endpoint);
  } finally {
    cleanup();
  }
}

export async function requestOpenAiCompatChat(
  config: AiRoleConfig,
  request: AiChatCompletionRequest,
  options: AiClientRequestOptions = {}
): Promise<AiChatCompletionResponse> {
  const baseUrl = resolveOpenAiCompatBaseUrl(config);
  const endpoint = `${baseUrl}/chat/completions`;
  assertValidRoleConfig(config, baseUrl, endpoint);

  const fetchImpl = options.fetchImpl ?? fetch;
  const { signal, cleanup } = createTimeoutSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, request.signal);

  const payload: Record<string, unknown> = {
    model: config.model.trim(),
    messages: request.messages,
    stream: false
  };
  if (request.maxTokens !== undefined) {
    payload.max_tokens = request.maxTokens;
  }
  if (request.temperature !== undefined) {
    payload.temperature = request.temperature;
  }
  if (request.stop && request.stop.length > 0) {
    payload.stop = request.stop;
  }
  if (request.jsonMode) {
    payload.response_format = { type: "json_object" };
  }

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: buildOpenAiCompatHeaders(config),
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      const errText = await safeReadErrorText(response, config.apiKey);
      throw new AiClientError({
        message: `HTTP ${response.status} chat completion failed: ${errText}`,
        code: httpErrorCode(response.status),
        provider: config.provider,
        endpoint,
        status: response.status
      });
    }

    const body = (await response.json()) as OpenAiChatResponseBody;
    const choice = body.choices?.[0];
    const text = extractMessageContent(choice?.message?.content);
    if (text === undefined) {
      throw new AiClientError({
        message: "Chat completion response did not include message content.",
        code: "INVALID_RESPONSE",
        provider: config.provider,
        endpoint
      });
    }

    return {
      text,
      model: body.model ?? config.model,
      provider: config.provider,
      endpoint,
      finishReason: choice?.finish_reason ?? undefined,
      usage: body.usage
        ? {
            promptTokens: body.usage.prompt_tokens,
            completionTokens: body.usage.completion_tokens,
            totalTokens: body.usage.total_tokens
          }
        : undefined
    };
  } catch (error) {
    throw wrapClientError(error, config, endpoint);
  } finally {
    cleanup();
  }
}

export async function streamOpenAiCompatChat(
  config: AiRoleConfig,
  request: AiChatCompletionRequest,
  onDelta: (chunk: string) => void,
  options: AiClientRequestOptions = {}
): Promise<AiChatCompletionResponse> {
  const baseUrl = resolveOpenAiCompatBaseUrl(config);
  const endpoint = `${baseUrl}/chat/completions`;
  assertValidRoleConfig(config, baseUrl, endpoint);

  const fetchImpl = options.fetchImpl ?? fetch;
  const { signal, cleanup } = createTimeoutSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, request.signal);

  const payload: Record<string, unknown> = {
    model: config.model.trim(),
    messages: request.messages,
    stream: true
  };
  if (request.maxTokens !== undefined) {
    payload.max_tokens = request.maxTokens;
  }
  if (request.temperature !== undefined) {
    payload.temperature = request.temperature;
  }
  if (request.stop && request.stop.length > 0) {
    payload.stop = request.stop;
  }

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        ...buildOpenAiCompatHeaders(config),
        accept: "text/event-stream"
      },
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      const errText = await safeReadErrorText(response, config.apiKey);
      throw new AiClientError({
        message: `HTTP ${response.status} streaming chat failed: ${errText}`,
        code: httpErrorCode(response.status),
        provider: config.provider,
        endpoint,
        status: response.status
      });
    }

    if (!response.body) {
      throw new AiClientError({
        message: "Streaming response body was empty.",
        code: "INVALID_RESPONSE",
        provider: config.provider,
        endpoint
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let fullText = "";
    let resolvedModel = config.model;
    let finishReason: string | undefined;

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() ?? "";

      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith(":")) {
          continue;
        }
        if (!line.startsWith("data:")) {
          continue;
        }
        const data = line.slice(5).trim();
        if (data === "[DONE]") {
          continue;
        }
        let parsed: OpenAiChatResponseBody;
        try {
          parsed = JSON.parse(data) as OpenAiChatResponseBody;
        } catch {
          continue;
        }
        if (parsed.model) {
          resolvedModel = parsed.model;
        }
        const choice = parsed.choices?.[0];
        const delta = choice?.delta?.content;
        if (typeof delta === "string" && delta.length > 0) {
          fullText += delta;
          onDelta(delta);
        }
        if (choice?.finish_reason) {
          finishReason = choice.finish_reason;
        }
      }
    }

    // Flush trailing decoded bytes if any
    const tail = (buffer + decoder.decode()).trim();
    if (tail.startsWith("data:")) {
      const data = tail.slice(5).trim();
      if (data && data !== "[DONE]") {
        try {
          const parsed = JSON.parse(data) as OpenAiChatResponseBody;
          const delta = parsed.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta.length > 0) {
            fullText += delta;
            onDelta(delta);
          }
        } catch {
          // Ignore incomplete trailing SSE fragment
        }
      }
    }

    return {
      text: fullText,
      model: resolvedModel,
      provider: config.provider,
      endpoint,
      finishReason
    };
  } catch (error) {
    throw wrapClientError(error, config, endpoint);
  } finally {
    cleanup();
  }
}

export async function requestOpenAiCompatFim(
  config: AiRoleConfig,
  request: AiFimCompletionRequest,
  options: AiClientRequestOptions = {}
): Promise<AiFimCompletionResponse> {
  const baseUrl = resolveOpenAiCompatBaseUrl(config);
  const endpoint = `${baseUrl}/completions`;
  assertValidRoleConfig(config, baseUrl, endpoint);

  const fetchImpl = options.fetchImpl ?? fetch;
  const { signal, cleanup } = createTimeoutSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, request.signal);
  const renderer: ProjectionAudit["renderer"] = isDeepSeekBetaEndpoint(baseUrl)
    ? "deepseek-fim"
    : "generic-completion";

  const payload: Record<string, unknown> = {
    model: config.model.trim(),
    prompt: request.prefix,
    stream: false
  };
  if (request.suffix !== undefined) {
    payload.suffix = request.suffix;
  }
  if (request.maxTokens !== undefined) {
    payload.max_tokens = request.maxTokens;
  }
  if (request.temperature !== undefined) {
    payload.temperature = request.temperature;
  }
  if (request.stop && request.stop.length > 0) {
    payload.stop = request.stop;
  }

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: buildOpenAiCompatHeaders(config),
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      const errText = await safeReadErrorText(response, config.apiKey);
      throw new AiClientError({
        message: `HTTP ${response.status} FIM completion failed: ${errText}`,
        code: httpErrorCode(response.status),
        provider: config.provider,
        endpoint,
        status: response.status
      });
    }

    const body = (await response.json()) as OpenAiCompletionResponseBody;
    const choice = body.choices?.[0];
    if (typeof choice?.text !== "string") {
      throw new AiClientError({
        message: "FIM completion response did not include choices[0].text.",
        code: "INVALID_RESPONSE",
        provider: config.provider,
        endpoint
      });
    }

    return {
      text: choice.text,
      model: body.model ?? config.model,
      provider: config.provider,
      endpoint,
      renderer,
      finishReason: choice.finish_reason ?? undefined
    };
  } catch (error) {
    throw wrapClientError(error, config, endpoint);
  } finally {
    cleanup();
  }
}

async function listOllamaNativeTags(
  config: AiRoleConfig,
  v1BaseUrl: string,
  fetchImpl: typeof fetch,
  signal: AbortSignal
): Promise<AiModelListResponse> {
  const nativeBase = v1BaseUrl.replace(/\/v1$/i, "");
  const endpoint = `${nativeBase}/api/tags`;
  const response = await fetchImpl(endpoint, {
    method: "GET",
    headers: { "content-type": "application/json" },
    signal
  });
  if (!response.ok) {
    const errText = await safeReadErrorText(response, config.apiKey);
    throw new AiClientError({
      message: `HTTP ${response.status} listing Ollama tags: ${errText}`,
      code: httpErrorCode(response.status),
      provider: config.provider,
      endpoint,
      status: response.status
    });
  }
  const body = (await response.json()) as OpenAiModelsResponseBody;
  return {
    models: parseModelsPayload(body),
    endpoint,
    provider: config.provider
  };
}

function parseModelsPayload(body: OpenAiModelsResponseBody): AiModelInfo[] {
  if (Array.isArray(body.data)) {
    return body.data
      .filter((item): item is { id: string; owned_by?: string } => typeof item.id === "string" && item.id.length > 0)
      .map((item) => ({
        id: item.id,
        ownedBy: item.owned_by
      }));
  }
  if (Array.isArray(body.models)) {
    return body.models
      .map((item) => item.name ?? item.model ?? "")
      .filter((id) => id.length > 0)
      .map((id) => ({ id }));
  }
  return [];
}

function extractMessageContent(
  content: string | Array<{ type?: string; text?: string }> | undefined
): string | undefined {
  if (typeof content === "string") {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part.text === "string" ? part.text : ""))
      .join("");
  }
  return undefined;
}

function assertValidRoleConfig(config: AiRoleConfig, baseUrl: string, endpoint: string): void {
  if (!baseUrl) {
    throw new AiClientError({
      message: "Missing Base URL.",
      code: "MISSING_BASE_URL",
      provider: config.provider,
      endpoint
    });
  }
  if (!config.model.trim()) {
    throw new AiClientError({
      message: "Missing model name.",
      code: "MISSING_MODEL",
      provider: config.provider,
      endpoint
    });
  }
  if (config.provider !== "ollama" && !config.apiKey?.trim()) {
    throw new AiClientError({
      message: "Missing API key for provider.",
      code: "MISSING_API_KEY",
      provider: config.provider,
      endpoint
    });
  }
}

async function safeReadErrorText(response: Response, apiKey?: string): Promise<string> {
  try {
    const raw = await response.text();
    const cleaned = redactSecrets(raw, [apiKey]);
    return cleaned.slice(0, 400) || response.statusText || "Unknown HTTP error";
  } catch {
    return response.statusText || "Unknown HTTP error";
  }
}

function httpErrorCode(status: number): string {
  if (status === 401 || status === 403) {
    return "AUTH_ERROR";
  }
  if (status === 404) {
    return "NOT_FOUND";
  }
  if (status === 429) {
    return "RATE_LIMITED";
  }
  if (status >= 500) {
    return "SERVER_ERROR";
  }
  return "HTTP_ERROR";
}

function wrapClientError(error: unknown, config: AiRoleConfig, endpoint: string): AiClientError {
  if (error instanceof AiClientError) {
    return error;
  }
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = redactSecrets(rawMessage, [config.apiKey]);
  const isTimeout = /timed out|timeout|aborted/i.test(message);
  return new AiClientError({
    message,
    code: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
    provider: config.provider,
    endpoint,
    cause: error
  });
}
