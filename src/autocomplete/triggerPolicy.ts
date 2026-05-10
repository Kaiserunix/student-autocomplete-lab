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

export function shouldRequestInlineCompletion(linePrefix: string): boolean {
  if (linePrefix.length === 0) {
    return false;
  }

  const trimmed = linePrefix.trim();
  if (isCommentPrefix(trimmed)) {
    return false;
  }

  return linePrefix.trim().length > 0 || /^\s+$/.test(linePrefix);
}

function isCommentPrefix(trimmed: string): boolean {
  return (
    trimmed.startsWith("#") ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/*") ||
    trimmed.startsWith("*") ||
    trimmed.startsWith('"""') ||
    trimmed.startsWith("'''")
  );
}
