export interface CompletionProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  mode?: string;
  format?: "openai-completions" | "openai-chat" | "anthropic-messages";
  anthropicVersion?: string;
}

export interface CompletionRequest {
  prompt: string;
  maxTokens: number;
  temperature: number;
  stop?: string[];
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
  if (config.format === "openai-chat") {
    return requestChatCompletion(config, request, fetchImpl);
  }

  if (config.format === "anthropic-messages") {
    return requestAnthropicCompletion(config, request, fetchImpl);
  }

  const response = await fetchImpl(joinEndpoint(config.baseUrl), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      prompt: request.prompt,
      max_tokens: request.maxTokens,
      temperature: request.temperature,
      stop: request.stop
    })
  });

  const payload = (await response.json()) as CompletionResponse;

  if (!response.ok) {
    const message = typeof payload.error?.message === "string" ? payload.error.message : `HTTP ${response.status}`;
    throw new Error(`Completion request failed: ${message}`);
  }

  const text = payload.choices?.[0]?.text;
  if (typeof text !== "string") {
    throw new Error("Completion response did not include choices[0].text.");
  }

  return text;
}

async function requestChatCompletion(
  config: CompletionProviderConfig,
  request: CompletionRequest,
  fetchImpl: typeof fetch
): Promise<string> {
  const response = await fetchImpl(joinChatEndpoint(config.baseUrl), {
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
  });
  const payload = (await response.json()) as ChatCompletionResponse;

  if (!response.ok) {
    const message = typeof payload.error?.message === "string" ? payload.error.message : `HTTP ${response.status}`;
    throw new Error(`Chat completion request failed: ${message}`);
  }

  const text = payload.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error("Chat completion response did not include choices[0].message.content.");
  }

  return text;
}

async function requestAnthropicCompletion(
  config: CompletionProviderConfig,
  request: CompletionRequest,
  fetchImpl: typeof fetch
): Promise<string> {
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
      system: "Return only the immediate code continuation. Do not explain.",
      messages: [
        {
          role: "user",
          content: request.prompt
        }
      ]
    })
  });
  const payload = (await response.json()) as AnthropicMessagesResponse;

  if (!response.ok) {
    const message = typeof payload.error?.message === "string" ? payload.error.message : `HTTP ${response.status}`;
    throw new Error(`Anthropic messages request failed: ${message}`);
  }

  const text = payload.content?.find((block) => block.type === "text" && typeof block.text === "string")?.text;
  if (typeof text !== "string") {
    throw new Error("Anthropic messages response did not include a text content block.");
  }

  return text;
}
