import { limitCompletionLines } from "../../autocomplete/filter";
import type { NormalizedSkillLanguage } from "../types";

export type AutocompleteValidationStatus =
  | "success"
  | "model-empty"
  | "validator-rejected";

export type AutocompleteRejectionReason =
  | "empty-after-filter"
  | "explanation"
  | "context-marker";

export interface AutocompleteValidationResult {
  status: AutocompleteValidationStatus;
  suggestion: string;
  rejectionReason?: AutocompleteRejectionReason;
}

const EXPLANATION =
  /^(?:(?:here(?:'s| is)|explanation|the code|sure|certainly|of course|below is)\b|下面|解释|代码如下|以下是|完整代码)/i;
const CONTEXT_MARKER =
  /<\/?(?:prefix|suffix|skill-policy|system|learner-tail|action-output-footer|untrusted_student_code|untrusted_student_request)>|(?:problem statement|reference answer|reference code|standard solution|accepted code|ac code|teacher pack|标准答案|参考答案|参考代码|完整\s*ac\s*代码|题解|标程|题面)|(?:^|\n)\s*(?:#|\/\/)?\s*problem\s*:|(?:you are a student-safe|do not solve full problems|ignore problem titles|return only a short local continuation)|\b(?:sk-[A-Za-z0-9_-]{12,}|gh[pousr]_[A-Za-z0-9_]{12,})\b|[A-Za-z]:(?:\\\\|\\|\/)Users(?:\\\\|\\|\/)|(?:^|[\s"'`(])\/(?:Users|home)\/[A-Za-z0-9._-]+\//i;

export function validateAutocompleteOutput(
  raw: string,
  maxLines: number,
  language: NormalizedSkillLanguage
): AutocompleteValidationResult {
  if (!raw.trim()) {
    return {
      status: "model-empty",
      suggestion: ""
    };
  }
  if (EXPLANATION.test(raw.trimStart())) {
    return {
      status: "validator-rejected",
      suggestion: "",
      rejectionReason: "explanation"
    };
  }
  if (CONTEXT_MARKER.test(raw)) {
    return {
      status: "validator-rejected",
      suggestion: "",
      rejectionReason: "context-marker"
    };
  }

  const commentPrefix =
    language === "python" ? "#" :
    language === "c" || language === "cpp" || language === "rust" ? "//" :
    undefined;
  const withoutPreamble = raw
    .split(/\r?\n/)
    .filter((line) => !isSkillControlLine(line, commentPrefix))
    .join("\n");
  const suggestion = limitCompletionLines(withoutPreamble, maxLines);
  if (!suggestion.trim()) {
    return {
      status: "validator-rejected",
      suggestion: "",
      rejectionReason: "empty-after-filter"
    };
  }
  return {
    status: "success",
    suggestion
  };
}

function isSkillControlLine(
  line: string,
  commentPrefix: "#" | "//" | undefined
): boolean {
  const trimmed = line.trimStart();
  if (/^\[(?:head|body|tail|footer)\]\s+/i.test(trimmed)) {
    return true;
  }
  return Boolean(
    commentPrefix &&
    trimmed.toLowerCase().startsWith(commentPrefix + " skill ")
  );
}
