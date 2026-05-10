import type { MimoAutocompleteInput } from "./mimoAutocomplete";

interface TextContextInput {
  text: string;
  offset: number;
  language: string;
  filePath: string;
}

const STUDENT_CODE_START_MARKER = "===== 学生代码开始 =====";
const STUDENT_CODE_END_MARKER = "===== 学生代码结束 =====";
const MAX_PREFIX_CHARS = 6000;
const MAX_SUFFIX_CHARS = 1200;

export function buildAutocompleteInputFromText(input: TextContextInput): MimoAutocompleteInput {
  const offset = Math.max(0, Math.min(input.offset, input.text.length));
  const section = studentCodeSectionBounds(input.text, offset);
  const prefix = sanitizeAutocompletePrefix(input.text.slice(section.start, offset), input.language);
  const suffix = sanitizeAutocompleteSuffix(input.text.slice(offset, section.end), input.language);

  return {
    prefix,
    suffix,
    language: input.language,
    filePath: input.filePath
  };
}

export function extractStudentCodeFromText(text: string): string {
  const startMarkerIndex = text.indexOf(STUDENT_CODE_START_MARKER);
  if (startMarkerIndex < 0) {
    return text;
  }

  const startLineEnd = text.indexOf("\n", startMarkerIndex);
  const start = startLineEnd >= 0 ? startLineEnd + 1 : startMarkerIndex + STUDENT_CODE_START_MARKER.length;
  const endMarkerIndex = text.indexOf(STUDENT_CODE_END_MARKER, start);
  const endLineStart = endMarkerIndex >= 0 ? text.lastIndexOf("\n", endMarkerIndex) : -1;
  return text.slice(start, endLineStart >= start ? endLineStart : text.length);
}

function studentCodeSectionBounds(text: string, offset: number): { start: number; end: number } {
  const startMarkerIndex = text.lastIndexOf(STUDENT_CODE_START_MARKER, offset);
  if (startMarkerIndex < 0) {
    return {
      start: 0,
      end: text.length
    };
  }

  const startLineEnd = text.indexOf("\n", startMarkerIndex);
  const start = startLineEnd >= 0 ? startLineEnd + 1 : startMarkerIndex + STUDENT_CODE_START_MARKER.length;
  const endMarkerIndex = text.indexOf(STUDENT_CODE_END_MARKER, offset);
  const endLineStart = endMarkerIndex >= 0 ? text.lastIndexOf("\n", endMarkerIndex) : -1;

  return {
    start,
    end: endLineStart >= offset ? endLineStart : text.length
  };
}

function sanitizeAutocompletePrefix(prefix: string, language: string): string {
  const windowed = prefix.slice(Math.max(0, prefix.length - MAX_PREFIX_CHARS));
  const lines = windowed.split(/\r?\n/);
  const firstCodeLine = lines.findIndex((line) => isStrongCodeLine(line, language));
  if (firstCodeLine < 0) {
    return "";
  }

  return stripProblemProseBlocks(lines.slice(firstCodeLine), language).join("\n");
}

function sanitizeAutocompleteSuffix(suffix: string, language: string): string {
  const windowed = suffix.slice(0, MAX_SUFFIX_CHARS);
  const lines = windowed.split(/\r?\n/);
  const stopIndex = lines.findIndex((line) => isProblemProseLine(line) && !isStrongCodeLine(line, language));
  return (stopIndex >= 0 ? lines.slice(0, stopIndex) : lines).join("\n");
}

function isStrongCodeLine(line: string, language: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || isProblemProseLine(trimmed) || isCommentLine(trimmed, language)) {
    return false;
  }

  const code = trimmed;
  if (language === "python") {
    return /^(import|from|def|class|if\s+__name__|for|while|if|elif|else:|try:|except|with|return|print\(|input\(|[A-Za-z_]\w*\s*=)/.test(code);
  }

  if (language === "cpp" || language === "c" || language === "c++") {
    return /^(#include|using\s+namespace|int\s+main|auto|int|long|char|bool|double|float|for\s*\(|while\s*\(|if\s*\(|return|std::|cin|cout)/.test(code);
  }

  if (language === "rust") {
    return /^(use\s+|fn\s+|let\s+|if\s+|for\s+|while\s+|match\s+|println!|return\b)/.test(code);
  }

  return /^[A-Za-z_]\w*[\s({:=]/.test(code);
}

function stripProblemProseBlocks(lines: string[], language: string): string[] {
  const safeLines: string[] = [];
  let skippingProblemBlock = false;

  for (const line of lines) {
    if (isProblemProseLine(line)) {
      skippingProblemBlock = true;
      continue;
    }

    if (skippingProblemBlock) {
      if (isStrongCodeLine(line, language)) {
        skippingProblemBlock = false;
        safeLines.push(line);
      }
      continue;
    }

    safeLines.push(line);
  }

  return safeLines;
}

function isCommentLine(trimmed: string, language: string): boolean {
  if ((language === "cpp" || language === "c" || language === "c++") && /^#include\b/.test(trimmed)) {
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

function isProblemProseLine(line: string): boolean {
  const text = line.trim().replace(/^(#|\/\/)\s*/, "");
  return /^(题目|题面|输入格式|输出格式|样例|提示|标准答案|参考答案|AI\s*讲解|AI\s*反馈|Problem|Statement|Input|Output|Sample|Hint|Reference Solution|Solution)\s*[：:]/i.test(text);
}
