export interface ResponsesProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ResponseTextRequest {
  prompt: string;
  maxOutputTokens: number;
  temperature: number;
}

interface ResponsesApiResponse {
  output_text?: unknown;
  output?: Array<{
    content?: Array<{
      text?: unknown;
      type?: unknown;
    }>;
  }>;
  error?: {
    message?: unknown;
  };
}

function joinEndpoint(baseUrl: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/responses`;
}

export async function requestResponseText(
  config: ResponsesProviderConfig,
  request: ResponseTextRequest,
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
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: request.prompt
            }
          ]
        }
      ],
      max_output_tokens: request.maxOutputTokens,
      temperature: request.temperature
    })
  });

  const payload = (await response.json()) as ResponsesApiResponse;

  if (!response.ok) {
    const message = typeof payload.error?.message === "string" ? payload.error.message : `HTTP ${response.status}`;
    throw new Error(`Responses request failed: ${message}`);
  }

  if (typeof payload.output_text === "string") {
    return payload.output_text;
  }

  const text = payload.output?.flatMap((item) => item.content ?? []).find((content) => typeof content.text === "string")
    ?.text;

  if (typeof text !== "string") {
    throw new Error("Responses response did not include output_text.");
  }

  return text;
}
