import type { AiRoleConfig } from "../contracts";
import {
  AiClientError,
  createTimeoutSignal,
  normalizeBaseUrl,
  redactSecrets,
  type AiChatCompletionRequest,
  type AiChatCompletionResponse,
  type AiChatMessage,
  type AiClientRequestOptions,
  type AiFimCompletionRequest,
  type AiFimCompletionResponse,
  type AiModelListResponse
} from "./types";

const DEFAULT_ANTHROPIC_BASE_URL = "https://api.anthropic.com/v1";
const DEFAULT_ANTHROPIC_VERSION = "2023-06-01";
const DEFAULT_TIMEOUT_MS = 30_000;

interface AnthropicMessagesResponseBody {
  model?: string;
  content?: Array<{
    type?: string;
    text?: string;
  }>;
  stop_reason?: string | null;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
  };
  error?: {
    type?: string;
    message?: string;
  };
}

interface AnthropicModelsResponseBody {
  data?: Array<{
    id?: string;
    display_name?: string;
  }>;
}

interface AnthropicStreamEvent {
  type?: string;
  message?: {
    model?: string;
  };
  delta?: {
    type?: string;
    text?: string;
    stop_reason?: string;
  };
  error?: {
    type?: string;
    message?: string;
  };
}

export function resolveAnthropicBaseUrl(config: AiRoleConfig): string {
  const base = normalizeBaseUrl(config.baseUrl);
  if (!base) {
    return DEFAULT_ANTHROPIC_BASE_URL;
  }
  if (/\/v1$/i.test(base)) {
    return base;
  }
  return `${base}/v1`;
}

export function buildAnthropicHeaders(config: AiRoleConfig): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    "anthropic-version": DEFAULT_ANTHROPIC_VERSION
  };
  const key = config.apiKey?.trim();
  if (key) {
    headers["x-api-key"] = key;
  }
  return headers;
}

export async function listAnthropicModels(
  config: AiRoleConfig,
  options: AiClientRequestOptions = {}
): Promise<AiModelListResponse> {
  const baseUrl = resolveAnthropicBaseUrl(config);
  const endpoint = `${baseUrl}/models`;
  if (!config.apiKey?.trim()) {
    throw new AiClientError({
      message: "Missing Anthropic API key.",
      code: "MISSING_API_KEY",
      provider: "anthropic",
      endpoint
    });
  }

  const fetchImpl = options.fetchImpl ?? fetch;
  const { signal, cleanup } = createTimeoutSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  try {
    const response = await fetchImpl(endpoint, {
      method: "GET",
      headers: buildAnthropicHeaders(config),
      signal
    });

    if (!response.ok) {
      const errText = await safeReadErrorText(response, config.apiKey);
      throw new AiClientError({
        message: `HTTP ${response.status} listing Anthropic models: ${errText}`,
        code: httpErrorCode(response.status),
        provider: "anthropic",
        endpoint,
        status: response.status
      });
    }

    const body = (await response.json()) as AnthropicModelsResponseBody;
    const models = (body.data ?? [])
      .filter((item): item is { id: string; display_name?: string } => typeof item.id === "string" && item.id.length > 0)
      .map((item) => ({
        id: item.id,
        displayName: item.display_name,
        ownedBy: "anthropic"
      }));

    return {
      models,
      endpoint,
      provider: "anthropic"
    };
  } catch (error) {
    throw wrapAnthropicError(error, config, endpoint);
  } finally {
    cleanup();
  }
}

export async function requestAnthropicMessage(
  config: AiRoleConfig,
  request: AiChatCompletionRequest,
  options: AiClientRequestOptions = {}
): Promise<AiChatCompletionResponse> {
  const baseUrl = resolveAnthropicBaseUrl(config);
  const endpoint = `${baseUrl}/messages`;
  assertValidAnthropicConfig(config, endpoint);

  const fetchImpl = options.fetchImpl ?? fetch;
  const { signal, cleanup } = createTimeoutSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, request.signal);
  const { system, messages } = splitSystemMessages(request.messages);

  const payload: Record<string, unknown> = {
    model: config.model.trim(),
    max_tokens: request.maxTokens ?? 1024,
    messages
  };
  if (system) {
    payload.system = system;
  }
  if (request.temperature !== undefined) {
    payload.temperature = request.temperature;
  }
  if (request.stop && request.stop.length > 0) {
    payload.stop_sequences = request.stop;
  }

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: buildAnthropicHeaders(config),
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      const errText = await safeReadErrorText(response, config.apiKey);
      throw new AiClientError({
        message: `HTTP ${response.status} Anthropic messages failed: ${errText}`,
        code: httpErrorCode(response.status),
        provider: "anthropic",
        endpoint,
        status: response.status
      });
    }

    const body = (await response.json()) as AnthropicMessagesResponseBody;
    const text = (body.content ?? [])
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text ?? "")
      .join("");

    if (!Array.isArray(body.content)) {
      throw new AiClientError({
        message: "Anthropic response did not include content blocks.",
        code: "INVALID_RESPONSE",
        provider: "anthropic",
        endpoint
      });
    }

    return {
      text,
      model: body.model ?? config.model,
      provider: "anthropic",
      endpoint,
      finishReason: body.stop_reason ?? undefined,
      usage: body.usage
        ? {
            promptTokens: body.usage.input_tokens,
            completionTokens: body.usage.output_tokens,
            totalTokens:
              (body.usage.input_tokens ?? 0) + (body.usage.output_tokens ?? 0)
          }
        : undefined
    };
  } catch (error) {
    throw wrapAnthropicError(error, config, endpoint);
  } finally {
    cleanup();
  }
}

export async function streamAnthropicMessage(
  config: AiRoleConfig,
  request: AiChatCompletionRequest,
  onDelta: (chunk: string) => void,
  options: AiClientRequestOptions = {}
): Promise<AiChatCompletionResponse> {
  const baseUrl = resolveAnthropicBaseUrl(config);
  const endpoint = `${baseUrl}/messages`;
  assertValidAnthropicConfig(config, endpoint);

  const fetchImpl = options.fetchImpl ?? fetch;
  const { signal, cleanup } = createTimeoutSignal(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, request.signal);
  const { system, messages } = splitSystemMessages(request.messages);

  const payload: Record<string, unknown> = {
    model: config.model.trim(),
    max_tokens: request.maxTokens ?? 1024,
    messages,
    stream: true
  };
  if (system) {
    payload.system = system;
  }
  if (request.temperature !== undefined) {
    payload.temperature = request.temperature;
  }
  if (request.stop && request.stop.length > 0) {
    payload.stop_sequences = request.stop;
  }

  try {
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        ...buildAnthropicHeaders(config),
        accept: "text/event-stream"
      },
      body: JSON.stringify(payload),
      signal
    });

    if (!response.ok) {
      const errText = await safeReadErrorText(response, config.apiKey);
      throw new AiClientError({
        message: `HTTP ${response.status} Anthropic streaming failed: ${errText}`,
        code: httpErrorCode(response.status),
        provider: "anthropic",
        endpoint,
        status: response.status
      });
    }

    if (!response.body) {
      throw new AiClientError({
        message: "Anthropic streaming response body was empty.",
        code: "INVALID_RESPONSE",
        provider: "anthropic",
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
        if (!line.startsWith("data:")) {
          continue;
        }
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") {
          continue;
        }
        let evt: AnthropicStreamEvent;
        try {
          evt = JSON.parse(data) as AnthropicStreamEvent;
        } catch {
          continue;
        }
        if (evt.type === "error" && evt.error?.message) {
          throw new AiClientError({
            message: redactSecrets(evt.error.message, [config.apiKey]),
            code: evt.error.type ?? "STREAM_ERROR",
            provider: "anthropic",
            endpoint
          });
        }
        if (evt.type === "message_start" && evt.message?.model) {
          resolvedModel = evt.message.model;
        }
        if (evt.type === "content_block_delta" && evt.delta?.type === "text_delta" && evt.delta.text) {
          fullText += evt.delta.text;
          onDelta(evt.delta.text);
        }
        if (evt.type === "message_delta" && evt.delta?.stop_reason) {
          finishReason = evt.delta.stop_reason;
        }
      }
    }

    return {
      text: fullText,
      model: resolvedModel,
      provider: "anthropic",
      endpoint,
      finishReason
    };
  } catch (error) {
    throw wrapAnthropicError(error, config, endpoint);
  } finally {
    cleanup();
  }
}

export async function requestAnthropicFim(
  config: AiRoleConfig,
  request: AiFimCompletionRequest,
  options: AiClientRequestOptions = {}
): Promise<AiFimCompletionResponse> {
  const systemPrompt =
    "Return ONLY the raw code completion to insert strictly between <prefix> and <suffix>. No markdown fences, no explanations, max 3 lines.";
  const userContent = `<prefix>${request.prefix}</prefix>\n<suffix>${request.suffix ?? ""}</suffix>`;
  const result = await requestAnthropicMessage(
    config,
    {
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      maxTokens: request.maxTokens ?? 64,
      temperature: request.temperature ?? 0,
      stop: request.stop,
      signal: request.signal
    },
    options
  );

  return {
    text: result.text,
    model: result.model,
    provider: "anthropic",
    endpoint: result.endpoint,
    renderer: "anthropic-messages",
    finishReason: result.finishReason
  };
}

function splitSystemMessages(messages: AiChatMessage[]): {
  system?: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
} {
  const systemParts: string[] = [];
  const conversational: Array<{ role: "user" | "assistant"; content: string }> = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      if (msg.content.trim()) {
        systemParts.push(msg.content);
      }
    } else {
      conversational.push({ role: msg.role, content: msg.content });
    }
  }

  if (conversational.length === 0) {
    conversational.push({ role: "user", content: "Continue." });
  }

  return {
    system: systemParts.length > 0 ? systemParts.join("\n\n") : undefined,
    messages: conversational
  };
}

function assertValidAnthropicConfig(config: AiRoleConfig, endpoint: string): void {
  if (!config.model.trim()) {
    throw new AiClientError({
      message: "Missing Anthropic model name.",
      code: "MISSING_MODEL",
      provider: "anthropic",
      endpoint
    });
  }
  if (!config.apiKey?.trim()) {
    throw new AiClientError({
      message: "Missing Anthropic API key.",
      code: "MISSING_API_KEY",
      provider: "anthropic",
      endpoint
    });
  }
}

async function safeReadErrorText(response: Response, apiKey?: string): Promise<string> {
  try {
    const raw = await response.text();
    return redactSecrets(raw, [apiKey]).slice(0, 400) || response.statusText || "Unknown HTTP error";
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

function wrapAnthropicError(error: unknown, config: AiRoleConfig, endpoint: string): AiClientError {
  if (error instanceof AiClientError) {
    return error;
  }
  const rawMessage = error instanceof Error ? error.message : String(error);
  const message = redactSecrets(rawMessage, [config.apiKey]);
  const isTimeout = /timed out|timeout|aborted/i.test(message);
  return new AiClientError({
    message,
    code: isTimeout ? "TIMEOUT" : "NETWORK_ERROR",
    provider: "anthropic",
    endpoint,
    cause: error
  });
}
