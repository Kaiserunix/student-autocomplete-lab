export type ModelTextPurpose = "analysis" | "autocomplete";

export interface ModelTextRequest {
  purpose: ModelTextPurpose;
  model: string;
  prompt: string;
  maxOutputTokens: number;
  temperature: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface ModelTextTransport {
  generate(request: ModelTextRequest): Promise<string>;
}
