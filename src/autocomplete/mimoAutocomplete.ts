import { requestCompletion, type CompletionProviderConfig } from "../models/completionsClient";
import { limitCompletionLines } from "./filter";
import { buildMimoAutocompletePrompt } from "./prompt";

export interface MimoAutocompleteInput {
  prefix: string;
  suffix: string;
  language: string;
  filePath: string;
  habits?: string[];
  signal?: AbortSignal;
}

export async function requestMimoAutocomplete(
  config: CompletionProviderConfig,
  input: MimoAutocompleteInput,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  const prompt = buildMimoAutocompletePrompt(input);
  const raw = await requestCompletion(
    config,
    {
      prompt,
      suffix: input.suffix,
      maxTokens: 64,
      temperature: 0.1,
      signal: input.signal
    },
    fetchImpl
  );

  return limitCompletionLines(raw);
}
