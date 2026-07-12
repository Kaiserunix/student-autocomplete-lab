export function limitCompletionLines(text: string, maxLines = 3): string {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => !line.trim().startsWith("```"))
    .map((line) => line.replace(/<\|?cursor\|?>/gi, ""))
    .filter((line) => !isPromptEchoLine(line))
    .filter((line, index, allLines) => line.trim().length > 0 || allLines.slice(0, index).some((prior) => prior.trim().length > 0))
    .slice(0, maxLines);
  const firstBlankIndex = lines.findIndex((line) => line.trim().length === 0);
  const contiguousLines = firstBlankIndex >= 0 ? lines.slice(0, firstBlankIndex) : lines;

  if (contiguousLines.length === 0) {
    return "";
  }

  return [contiguousLines[0].trimStart(), ...contiguousLines.slice(1)].join("\n");
}

function isPromptEchoLine(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }
  const uncommented = trimmed.replace(/^(#|\/\/)\s*/, "");

  if (
    trimmed === "<|cursor|>" ||
    trimmed === "<cursor>" ||
    trimmed === "<safe_coding_habits>" ||
    trimmed === "</safe_coding_habits>" ||
    /^safe coding habits:?$/i.test(trimmed) ||
    /^complete the code at the cursor/i.test(trimmed) ||
    /^do not solve full problems/i.test(trimmed) ||
    /^ignore problem titles/i.test(trimmed) ||
    /^language:\s*/i.test(trimmed) ||
    /^file:\s*/i.test(trimmed) ||
    /^#\s*(problem|source|tags)\s*:/i.test(trimmed) ||
    /^[-*]\s*(prefer direct student code|return only the immediate local continuation)/i.test(trimmed)
  ) {
    return true;
  }

  return (
    /^(the first line|read input:|input format:|output format:)/i.test(uncommented) ||
    /^(题目|题面|输入格式|输出格式|样例|样例输入|样例输出|提示|标准答案|参考答案|AI\s*讲解|AI\s*反馈)\s*[：:]/i.test(
      uncommented
    )
  );
}
