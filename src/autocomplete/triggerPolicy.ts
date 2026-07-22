const SUPPORTED_AUTOCOMPLETE_LANGUAGES = new Set([
  "python",
  "cpp",
  "c",
  "c++",
  "rust"
]);

export function isSupportedAutocompleteLanguage(languageId: string): boolean {
  return SUPPORTED_AUTOCOMPLETE_LANGUAGES.has(languageId.toLowerCase());
}

export interface InlineCompletionTriggerOptions {
  languageId?: string;
  explicit?: boolean;
}

export function shouldRequestInlineCompletion(
  linePrefix: string,
  options: InlineCompletionTriggerOptions = {}
): boolean {
  if (options.explicit) {
    return true;
  }
  if (linePrefix.length === 0) {
    return false;
  }

  const trimmed = linePrefix.trim();
  if (isCommentPrefix(trimmed, options.languageId)) {
    return false;
  }

  return linePrefix.trim().length > 0 || /^\s+$/.test(linePrefix);
}

function isCommentPrefix(trimmed: string, languageId?: string): boolean {
  if (
    (languageId === "c" || languageId === "cpp" || languageId === "c++") &&
    /^#include\b/.test(trimmed)
  ) {
    return false;
  }

  return (
    trimmed.startsWith("#") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith('"""') ||
    trimmed.startsWith("'''")
  );
}
