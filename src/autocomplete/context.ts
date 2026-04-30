import type { MimoAutocompleteInput } from "./mimoAutocomplete";

interface TextContextInput {
  text: string;
  offset: number;
  language: string;
  filePath: string;
}

const STUDENT_CODE_START_MARKER = "===== 学生代码开始 =====";
const STUDENT_CODE_END_MARKER = "===== 学生代码结束 =====";

export function buildAutocompleteInputFromText(input: TextContextInput): MimoAutocompleteInput {
  const offset = Math.max(0, Math.min(input.offset, input.text.length));
  const section = studentCodeSectionBounds(input.text, offset);

  return {
    prefix: input.text.slice(section.start, offset),
    suffix: input.text.slice(offset, section.end),
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
