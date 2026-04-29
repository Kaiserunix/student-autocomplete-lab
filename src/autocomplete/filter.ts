export function limitCompletionLines(text: string, maxLines = 3): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line, index, allLines) => line.trim().length > 0 || allLines.slice(0, index).some((prior) => prior.trim().length > 0))
    .slice(0, maxLines);
  const firstBlankIndex = lines.findIndex((line) => line.trim().length === 0);
  const contiguousLines = firstBlankIndex >= 0 ? lines.slice(0, firstBlankIndex) : lines;

  if (contiguousLines.length === 0) {
    return "";
  }

  return [contiguousLines[0].trimStart(), ...contiguousLines.slice(1)].join("\n");
}
