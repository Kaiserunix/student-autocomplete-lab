export interface InlineCompletionPresentationInput {
  linePrefix: string;
  lineSuffix?: string;
  suggestion: string;
  selectedCompletion?: {
    text: string;
    rangeStartCharacter: number;
  };
}

export interface InlineCompletionPresentation {
  insertText: string;
  useSelectedCompletionRange: boolean;
}

export function inlineCompletionPresentation(
  input: InlineCompletionPresentationInput
): InlineCompletionPresentation | undefined {
  const normalizedSuggestion = input.suggestion.replace(/\r\n/g, "\n");
  if (input.selectedCompletion && normalizedSuggestion.startsWith(input.selectedCompletion.text)) {
    const insertText = stripExistingSuffix(normalizedSuggestion, input.lineSuffix ?? "");
    return insertText
      ? { insertText, useSelectedCompletionRange: true }
      : undefined;
  }

  const continuation = inlineCompletionContinuation(
    input.linePrefix,
    input.suggestion,
    input.lineSuffix
  );
  if (!continuation) {
    return undefined;
  }

  if (!input.selectedCompletion) {
    return {
      insertText: continuation,
      useSelectedCompletionRange: false
    };
  }

  const completedText = input.linePrefix + continuation;
  const insertText = completedText.slice(input.selectedCompletion.rangeStartCharacter);
  if (!insertText.startsWith(input.selectedCompletion.text)) {
    return undefined;
  }

  return {
    insertText,
    useSelectedCompletionRange: true
  };
}

export function inlineCompletionContinuation(
  linePrefix: string,
  suggestion: string,
  lineSuffix = ""
): string {
  const normalizedSuggestion = suggestion.replace(/\r\n/g, "\n");
  const newlineIndex = normalizedSuggestion.indexOf("\n");
  const firstLine = newlineIndex >= 0
    ? normalizedSuggestion.slice(0, newlineIndex)
    : normalizedSuggestion;
  const remainingLines = newlineIndex >= 0
    ? normalizedSuggestion.slice(newlineIndex)
    : "";
  const consumed = echoedPrefixLength(linePrefix, firstLine);
  if (consumed < 0) {
    return "";
  }

  return stripExistingSuffix(firstLine.slice(consumed) + remainingLines, lineSuffix);
}

function echoedPrefixLength(linePrefix: string, suggestionLine: string): number {
  const exactOverlap = longestExactOverlap(linePrefix, suggestionLine);
  if (exactOverlap > 0) {
    return exactOverlap;
  }

  if (/\s$/.test(linePrefix) && linePrefix.trim().length > 0) {
    if (longestExactOverlap(linePrefix.trimEnd(), suggestionLine) > 0) {
      return -1;
    }
    return 0;
  }

  const typed = significantCharacters(linePrefix);
  const proposed = significantCharacters(suggestionLine);
  const maxOverlap = Math.min(typed.length, proposed.length);

  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    const typedStart = typed.length - overlap;
    let matches = true;
    for (let index = 0; index < overlap; index += 1) {
      if (typed[typedStart + index].character !== proposed[index].character) {
        matches = false;
        break;
      }
    }
    if (!matches) {
      continue;
    }

    return proposed[overlap - 1].sourceIndex + 1;
  }

  return 0;
}

function longestExactOverlap(linePrefix: string, suggestionLine: string): number {
  const maxOverlap = Math.min(linePrefix.length, suggestionLine.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (linePrefix.slice(-overlap) === suggestionLine.slice(0, overlap)) {
      return overlap;
    }
  }
  return 0;
}

function significantCharacters(text: string): Array<{ character: string; sourceIndex: number }> {
  const characters: Array<{ character: string; sourceIndex: number }> = [];
  for (let index = 0; index < text.length; index += 1) {
    if (!/\s/.test(text[index])) {
      characters.push({ character: text[index], sourceIndex: index });
    }
  }
  return characters;
}

function stripExistingSuffix(insertText: string, lineSuffix: string): string {
  const maxOverlap = Math.min(insertText.length, lineSuffix.length);
  for (let overlap = maxOverlap; overlap > 0; overlap -= 1) {
    if (insertText.slice(-overlap) === lineSuffix.slice(0, overlap)) {
      return insertText.slice(0, -overlap);
    }
  }
  return insertText;
}
