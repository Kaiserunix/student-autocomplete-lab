import type { MimoAutocompleteInput } from "./mimoAutocomplete";

interface TextContextInput {
  text: string;
  offset: number;
  language: string;
  filePath: string;
}

export function buildAutocompleteInputFromText(input: TextContextInput): MimoAutocompleteInput {
  const offset = Math.max(0, Math.min(input.offset, input.text.length));

  return {
    prefix: input.text.slice(0, offset),
    suffix: input.text.slice(offset),
    language: input.language,
    filePath: input.filePath
  };
}
