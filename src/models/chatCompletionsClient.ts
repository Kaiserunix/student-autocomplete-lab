export interface ChatCompletionProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
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

function joinEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/chat/completions`;
}

export async function requestChatCompletionText(
  config: ChatCompletionProviderConfig,
  request: ChatCompletionRequest,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
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

  const text = payload.choices?.[0]?.message?.content;
  if (typeof text !== "string") {
    throw new Error("Chat completion response did not include choices[0].message.content.");
  }

  return text;
}
