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

const EXPLANATION = /^(?:(?:here(?:'s| is)|explanation|the code)\b|下面|解释|代码如下)/i;
const CONTEXT_MARKER =
  /<(?:prefix|suffix|skill-policy|system)>|(?:problem statement|reference answer|teacher pack|标准答案|参考答案|题面)|(?:^|\n)\s*(?:#|\/\/)?\s*problem\s*:/i;

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
