export interface CompletionProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
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

function joinEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/completions`;
}

export async function requestCompletion(
  config: CompletionProviderConfig,
  request: CompletionRequest,
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
