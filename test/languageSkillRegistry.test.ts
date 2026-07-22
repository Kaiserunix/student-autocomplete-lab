import { describe, expect, test } from "vitest";
import {
  getLanguageSkillStrategy,
  normalizeSkillLanguage
} from "../src/skills/languageRegistry";

describe("language skill registry", () => {
  test.each([
    ["py", "python"],
    ["python", "python"],
    ["c", "c"],
    ["cpp", "cpp"],
    ["c++", "cpp"],
    ["rust", "rust"],
    ["rs", "rust"],
    ["plaintext", "generic"],
    ["", "generic"]
  ] as const)("normalizes %s to %s", (input, expected) => {
    expect(normalizeSkillLanguage(input)).toBe(expected);
  });

  test("keeps coach and autocomplete language bodies separate", () => {
    const python = getLanguageSkillStrategy("py");

    expect(python.language).toBe("python");
    expect(python.commentPrefix).toBe("#");
    expect(python.autocompleteRules.map((rule) => rule.id)).toEqual([
      "language.python.indentation",
      "language.python.local-continuation"
    ]);
    expect(python.coachRules.map((rule) => rule.id)).toEqual(expect.arrayContaining([
      "language.python.range-boundaries",
      "language.python.runtime-shape"
    ]));
  });

  test("generic strategy has no synthetic comment prefix", () => {
    const strategy = getLanguageSkillStrategy("unknown-language");

    expect(strategy.language).toBe("generic");
    expect(strategy.commentPrefix).toBeUndefined();
    expect(strategy.autocompleteRules).toHaveLength(1);
  });

  test.each([
    ["python", "#", "language.python.range-boundaries"],
    ["c", "//", "language.c.memory-bounds"],
    ["cpp", "//", "language.cpp.container-bounds"],
    ["rust", "//", "language.rust.ownership"]
  ] as const)("registers a complete %s strategy", (language, commentPrefix, coachRuleId) => {
    const strategy = getLanguageSkillStrategy(language);

    expect(strategy.commentPrefix).toBe(commentPrefix);
    expect(strategy.coachRules.map((rule) => rule.id)).toContain(coachRuleId);
    expect(strategy.autocompleteRules.every(
      (rule) => Boolean(rule.compactInstruction?.trim())
    )).toBe(true);
    expect(strategy.stopSequences.length).toBeGreaterThan(0);
  });
});
