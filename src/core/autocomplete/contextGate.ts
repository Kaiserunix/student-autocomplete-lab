import type { AutocompleteCodeHabit, SupportedLanguage } from "../contracts";
import { normalizeLanguage } from "../contextProjection";
import type { ProjectionRule } from "../contextProjection";

/**
 * Physically isolated autocomplete input contract.
 * Intentionally omits problem statements (`statementMarkdown`),
 * `mistakeNotebook`, `conceptMastery`, `coachHistory`, and `apiKey`
 * at the TypeScript type level so anti-spoiler boundaries are compiler-checked.
 */
export interface AutocompleteContextInput {
  language: string;
  prefix: string;
  suffix: string;
  codeHabits?: readonly AutocompleteCodeHabit[];
  maxPrefixChars?: number;
  maxSuffixChars?: number;
}

export interface IsolatedAutocompleteContext {
  language: SupportedLanguage;
  prefix: string;
  suffix: string;
  strippedCommentLineCount: number;
  habits: AutocompleteCodeHabit[];
  excludedHabits: Array<{ id: string; reason: string }>;
  habitCharCount: number;
  droppedForbiddenKeys: string[];
}

export const MAX_AUTOCOMPLETE_HABITS = 2;
export const MAX_AUTOCOMPLETE_HABIT_CHARS = 160;
export const DEFAULT_MAX_PREFIX_CHARS = 4_000;
export const DEFAULT_MAX_SUFFIX_CHARS = 2_000;

export const FORBIDDEN_AUTOCOMPLETE_KEYS = [
  "statementMarkdown",
  "mistakeNotebook",
  "conceptMastery",
  "coachHistory",
  "apiKey"
] as const;

const UNSAFE_HABIT_RE =
  /<\/?(?:system|prefix|suffix|untrusted_problem|untrusted_student_code)>|\b(?:sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,})\b|(?:problem statement|reference solution|标准答案|完整\s*ac\s*代码|ignore previous instructions)/i;

function isRustLifetime(text: string, idx: number): boolean {
  const next = text[idx + 1];
  if (!next || !/[A-Za-z_]/.test(next)) {
    return false;
  }
  return text[idx + 2] !== "'";
}

/**
 * Strips natural-language comment lines and trailing inline comments
 * while preserving string literals, C/C++ preprocessor directives (#include/#define/#pragma),
 * and Rust attributes (#[derive]/#![allow]).
 */
export function stripNaturalLanguageComments(
  text: string,
  language: SupportedLanguage
): { text: string; strippedLineCount: number } {
  if (!text) {
    return { text: "", strippedLineCount: 0 };
  }

  let strippedLineCount = 0;
  let out = "";
  let inBlockComment = false;
  let blockCommentWasPureLine = false;
  let stringQuote: string | null = null;
  let pyTripleQuote: string | null = null;
  let pyTripleIsStandaloneDocstring = false;

  const lines = text.split("\n");
  const resultLines: string[] = [];

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const rawLine = lines[lineIdx] ?? "";
    const hasCarriageReturn = rawLine.endsWith("\r");
    const line = hasCarriageReturn ? rawLine.slice(0, -1) : rawLine;

    let lineOut = "";
    let lineHadComment = false;
    let codeSeenBeforeComment = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i]!;
      const next = line[i + 1];

      if (inBlockComment) {
        lineHadComment = true;
        if (ch === "*" && next === "/") {
          inBlockComment = false;
          i += 1;
        }
        continue;
      }

      if (pyTripleQuote) {
        if (pyTripleIsStandaloneDocstring) {
          lineHadComment = true;
        } else {
          lineOut += ch;
        }
        if (
          ch === pyTripleQuote[0] &&
          next === pyTripleQuote[0] &&
          line[i + 2] === pyTripleQuote[0]
        ) {
          if (!pyTripleIsStandaloneDocstring) {
            lineOut += `${next}${line[i + 2]}`;
          }
          pyTripleQuote = null;
          pyTripleIsStandaloneDocstring = false;
          i += 2;
        }
        continue;
      }

      if (stringQuote) {
        lineOut += ch;
        if (ch === "\\" && next !== undefined) {
          lineOut += next;
          i += 1;
          continue;
        }
        if (ch === stringQuote) {
          stringQuote = null;
        }
        continue;
      }

      // Python standalone docstring or # comment
      if (language === "python") {
        if (
          (ch === '"' || ch === "'") &&
          next === ch &&
          line[i + 2] === ch
        ) {
          pyTripleQuote = ch.repeat(3);
          pyTripleIsStandaloneDocstring = !codeSeenBeforeComment;
          if (pyTripleIsStandaloneDocstring) {
            lineHadComment = true;
          } else {
            lineOut += pyTripleQuote;
          }
          i += 2;
          continue;
        }
        if (ch === "#") {
          // Preserve shebang on line 0
          if (lineIdx === 0 && !codeSeenBeforeComment && next === "!") {
            lineOut += line.slice(i);
            break;
          }
          lineHadComment = true;
          break;
        }
      } else {
        // C / C++ / Rust / Java / Generic: // and /* */
        if (ch === "/" && next === "/") {
          lineHadComment = true;
          break;
        }
        if (ch === "/" && next === "*") {
          inBlockComment = true;
          blockCommentWasPureLine = !codeSeenBeforeComment;
          lineHadComment = true;
          i += 1;
          continue;
        }
      }

      // String literal start
      if (ch === '"' || ch === "`") {
        stringQuote = ch;
        codeSeenBeforeComment = true;
        lineOut += ch;
        continue;
      }
      if (ch === "'") {
        if (language === "rust" && isRustLifetime(line, i)) {
          codeSeenBeforeComment = true;
          lineOut += ch;
          continue;
        }
        stringQuote = "'";
        codeSeenBeforeComment = true;
        lineOut += ch;
        continue;
      }

      if (!/\s/.test(ch)) {
        codeSeenBeforeComment = true;
      }
      lineOut += ch;
    }

    const isPureCommentLine =
      lineHadComment && lineOut.trim().length === 0 && (blockCommentWasPureLine || !codeSeenBeforeComment);

    if (isPureCommentLine) {
      strippedLineCount += 1;
      // Drop pure natural-language comment lines completely so their text cannot leak
      continue;
    }

    const cleanedLine = lineHadComment ? lineOut.trimEnd() : lineOut;
    resultLines.push(hasCarriageReturn ? `${cleanedLine}\r` : cleanedLine);
    if (!inBlockComment) {
      blockCommentWasPureLine = false;
    }
  }

  out = resultLines.join("\n");
  return { text: out, strippedLineCount };
}

function selectAutocompleteHabits(
  habits: readonly AutocompleteCodeHabit[] | undefined,
  language: SupportedLanguage
): {
  selected: AutocompleteCodeHabit[];
  excluded: Array<{ id: string; reason: string }>;
  totalChars: number;
} {
  if (!habits || habits.length === 0) {
    return { selected: [], excluded: [], totalChars: 0 };
  }

  const selected: AutocompleteCodeHabit[] = [];
  const excluded: Array<{ id: string; reason: string }> = [];
  let totalChars = 0;

  for (const habit of habits) {
    if (!habit.enabled) {
      excluded.push({ id: habit.id, reason: "disabled" });
      continue;
    }
    if (normalizeLanguage(habit.language) !== language) {
      excluded.push({ id: habit.id, reason: "language-mismatch" });
      continue;
    }

    const sanitizedText = habit.ruleText
      .replace(/[\r\n]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!sanitizedText) {
      excluded.push({ id: habit.id, reason: "empty-rule" });
      continue;
    }

    if (UNSAFE_HABIT_RE.test(sanitizedText)) {
      excluded.push({ id: habit.id, reason: "unsafe-habit-content" });
      continue;
    }

    if (selected.length >= MAX_AUTOCOMPLETE_HABITS) {
      excluded.push({ id: habit.id, reason: "habit-count-limit" });
      continue;
    }

    if (totalChars + sanitizedText.length > MAX_AUTOCOMPLETE_HABIT_CHARS) {
      excluded.push({ id: habit.id, reason: "habit-char-budget" });
      continue;
    }

    selected.push({
      id: habit.id,
      language,
      ruleText: sanitizedText,
      enabled: true
    });
    totalChars += sanitizedText.length;
  }

  return { selected, excluded, totalChars };
}

export function buildIsolatedAutocompleteContext(
  input: AutocompleteContextInput
): IsolatedAutocompleteContext {
  // Defensive runtime inspection in case unsafe callers bypass TS types via `as any`
  const rawRecord = input as unknown as Record<string, unknown>;
  const droppedForbiddenKeys: string[] = [];
  for (const forbiddenKey of FORBIDDEN_AUTOCOMPLETE_KEYS) {
    if (
      Object.prototype.hasOwnProperty.call(rawRecord, forbiddenKey) &&
      rawRecord[forbiddenKey] !== undefined
    ) {
      droppedForbiddenKeys.push(forbiddenKey);
    }
  }

  // Whitelist-only destructuring: forbidden keys can never enter downstream objects
  const language = normalizeLanguage(input.language);
  const maxPrefixChars = input.maxPrefixChars ?? DEFAULT_MAX_PREFIX_CHARS;
  const maxSuffixChars = input.maxSuffixChars ?? DEFAULT_MAX_SUFFIX_CHARS;

  const strippedPrefix = stripNaturalLanguageComments(input.prefix, language);
  const strippedSuffix = stripNaturalLanguageComments(input.suffix, language);

  const boundedPrefix =
    strippedPrefix.text.length > maxPrefixChars
      ? strippedPrefix.text.slice(strippedPrefix.text.length - maxPrefixChars)
      : strippedPrefix.text;

  const boundedSuffix =
    strippedSuffix.text.length > maxSuffixChars
      ? strippedSuffix.text.slice(0, maxSuffixChars)
      : strippedSuffix.text;

  const habitSelection = selectAutocompleteHabits(input.codeHabits, language);

  return {
    language,
    prefix: boundedPrefix,
    suffix: boundedSuffix,
    strippedCommentLineCount:
      strippedPrefix.strippedLineCount + strippedSuffix.strippedLineCount,
    habits: habitSelection.selected,
    excludedHabits: habitSelection.excluded,
    habitCharCount: habitSelection.totalChars,
    droppedForbiddenKeys
  };
}

export function habitsToProjectionRules(
  habits: readonly AutocompleteCodeHabit[],
  language: SupportedLanguage
): ProjectionRule[] {
  return habits.map((habit, index) => ({
    id: `learner.habit.${habit.id}`,
    policyKey: `learner.code-habit.${habit.id}`,
    route: "autocomplete",
    layer: "tail",
    source: "learner",
    priority: 200 - index,
    instruction: habit.ruleText,
    compactInstruction: habit.ruleText,
    enforcement: "prompt",
    language,
    projectedItem: {
      id: habit.id,
      kind: "code_habit",
      label: habit.ruleText,
      sourceKey: `code_habit:${language}:${habit.id}`,
      muteable: true
    }
  }));
}
