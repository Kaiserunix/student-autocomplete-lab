import { appendFile, mkdir } from "node:fs/promises";
import * as path from "node:path";

export interface ChatCompletionProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  mode?: string;
  format?: "openai-chat" | "anthropic-messages";
  anthropicVersion?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionRequest {
  messages: ChatMessage[];
  maxTokens: number;
  temperature: number;
  responseFormat?: { type: "json_object" };
  onUsage?: ChatCompletionUsageSink;
  usageLogPath?: string | false;
}

export interface ChatCompletionUsage {
  source: "openai-chat" | "anthropic-messages";
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
}

export type ChatCompletionUsageSink = (usage: ChatCompletionUsage) => void;

interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
  error?: {
    message?: unknown;
  };
  usage?: unknown;
}

interface AnthropicMessagesResponse {
  content?: Array<{
    type?: unknown;
    text?: unknown;
  }>;
  error?: {
    message?: unknown;
  };
  usage?: unknown;
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

function joinEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

function joinAnthropicEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/messages`;
}

export async function requestChatCompletionText(
  config: ChatCompletionProviderConfig,
  request: ChatCompletionRequest,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  if (config.format === "anthropic-messages") {
    return requestAnthropicMessageText(config, request, fetchImpl);
  }

  const response = await fetchImpl(joinEndpoint(config.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      messages: request.messages,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      response_format: request.responseFormat
    })
  });
  const payload = (await response.json()) as ChatCompletionResponse;

  if (!response.ok) {
    const message = typeof payload.error?.message === "string" ? payload.error.message : `HTTP ${response.status}`;
    throw new Error(`Chat completion request failed: ${message}`);
  }

  const usage = normalizeOpenAiUsage(payload.usage);
  emitUsage(request.onUsage, usage);
  await persistRuntimeUsage(config, usage, request.usageLogPath);

  const text = payload.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error("Chat completion response did not include choices[0].message.content.");
  }

  return text;
}

async function requestAnthropicMessageText(
  config: ChatCompletionProviderConfig,
  request: ChatCompletionRequest,
  fetchImpl: typeof fetch
): Promise<string> {
  const { system, messages } = splitSystemMessages(request.messages);
  const response = await fetchImpl(joinAnthropicEndpoint(config.baseUrl), {
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
      system,
      messages
    })
  });
  const payload = (await response.json()) as AnthropicMessagesResponse;

  if (!response.ok) {
    const message = typeof payload.error?.message === "string" ? payload.error.message : `HTTP ${response.status}`;
    throw new Error(`Anthropic messages request failed: ${message}`);
  }

  const usage = normalizeAnthropicUsage(payload.usage);
  emitUsage(request.onUsage, usage);
  await persistRuntimeUsage(config, usage, request.usageLogPath);

  const text = payload.content?.find((block) => block.type === "text" && typeof block.text === "string")?.text;
  if (typeof text !== "string") {
    throw new Error("Anthropic messages response did not include a text content block.");
  }

  return text;
}

function splitSystemMessages(messages: ChatMessage[]): { system: string | undefined; messages: AnthropicMessage[] } {
  const system = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const nonSystemMessages = messages
    .filter((message) => message.role !== "system")
    .map((message) => ({
      role: (message.role === "assistant" ? "assistant" : "user") as "assistant" | "user",
      content: message.content
    }));

  return {
    system: system || undefined,
    messages: nonSystemMessages
  };
}

function emitUsage(onUsage: ChatCompletionUsageSink | undefined, usage: ChatCompletionUsage | undefined): void {
  if (onUsage && usage) {
    onUsage(usage);
  }
}

async function persistRuntimeUsage(
  config: ChatCompletionProviderConfig,
  usage: ChatCompletionUsage | undefined,
  usageLogPath: string | false | undefined
): Promise<void> {
  if (!usage || usageLogPath === false) {
    return;
  }

  const filePath = path.resolve(process.cwd(), usageLogPath ?? path.join(".runtime", "chat-completions-usage.jsonl"));
  const event = {
    schemaVersion: 1,
    occurredAt: new Date().toISOString(),
    providerFormat: config.format ?? "openai-chat",
    mode: config.mode,
    model: config.model,
    baseUrl: sanitizeBaseUrl(config.baseUrl),
    usage
  };

  try {
    await mkdir(path.dirname(filePath), { recursive: true });
    await appendFile(filePath, `${JSON.stringify(event)}\n`, "utf8");
  } catch {
    // Usage accounting should never turn a successful model response into a failed teaching request.
  }
}

function sanitizeBaseUrl(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return baseUrl.replace(/[?&]key=[^&]+/gi, "");
  }
}

function normalizeOpenAiUsage(value: unknown): ChatCompletionUsage | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const promptTokens = optionalNumber(record.prompt_tokens ?? record.promptTokens);
  const completionTokens = optionalNumber(record.completion_tokens ?? record.completionTokens);
  const totalTokens = optionalNumber(record.total_tokens ?? record.totalTokens);

  if (promptTokens === undefined && completionTokens === undefined && totalTokens === undefined) {
    return undefined;
  }

  return {
    source: "openai-chat",
    promptTokens,
    completionTokens,
    totalTokens
  };
}

function normalizeAnthropicUsage(value: unknown): ChatCompletionUsage | undefined {
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const inputTokens = optionalNumber(record.input_tokens ?? record.inputTokens);
  const outputTokens = optionalNumber(record.output_tokens ?? record.outputTokens);

  if (inputTokens === undefined && outputTokens === undefined) {
    return undefined;
  }

  return {
    source: "anthropic-messages",
    inputTokens,
    outputTokens,
    promptTokens: inputTokens,
    completionTokens: outputTokens,
    totalTokens: inputTokens !== undefined && outputTokens !== undefined ? inputTokens + outputTokens : undefined
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function optionalNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}
