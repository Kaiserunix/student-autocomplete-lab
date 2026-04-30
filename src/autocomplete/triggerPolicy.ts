export function shouldRequestInlineCompletion(linePrefix: string): boolean {
  if (linePrefix.length === 0) {
    return false;
  }

  return linePrefix.trim().length > 0 || /^\s+$/.test(linePrefix);
}
