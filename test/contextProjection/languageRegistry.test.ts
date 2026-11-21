import { describe, expect, it } from "vitest";
import {
  getLanguageProjectionStrategy,
  normalizeLanguage,
  SUPPORTED_LANGUAGES
} from "../../src/core/contextProjection";

describe("languageRegistry", () => {
  it("normalizes aliases across python, cpp, c, rust, java, and generic", () => {
    expect(normalizeLanguage("python")).toBe("python");
    expect(normalizeLanguage("Py")).toBe("python");
    expect(normalizeLanguage("python3")).toBe("python");
    expect(normalizeLanguage("cpp")).toBe("cpp");
    expect(normalizeLanguage("C++")).toBe("cpp");
    expect(normalizeLanguage("cc")).toBe("cpp");
    expect(normalizeLanguage("cxx")).toBe("cpp");
    expect(normalizeLanguage("c")).toBe("c");
    expect(normalizeLanguage("rust")).toBe("rust");
    expect(normalizeLanguage("RS")).toBe("rust");
    expect(normalizeLanguage("java")).toBe("java");
    expect(normalizeLanguage("unknown-lang")).toBe("generic");
    expect(normalizeLanguage("   ")).toBe("generic");
  });

  it("provides native comment prefixes and rules for all supported languages", () => {
    expect(SUPPORTED_LANGUAGES).toEqual([
      "python",
      "cpp",
      "c",
      "rust",
      "java",
      "generic"
    ]);

    expect(getLanguageProjectionStrategy("python").commentPrefix).toBe("#");
    expect(getLanguageProjectionStrategy("cpp").commentPrefix).toBe("//");
    expect(getLanguageProjectionStrategy("c").commentPrefix).toBe("//");
    expect(getLanguageProjectionStrategy("rust").commentPrefix).toBe("//");
    expect(getLanguageProjectionStrategy("java").commentPrefix).toBe("//");
    expect(getLanguageProjectionStrategy("generic").commentPrefix).toBeUndefined();

    for (const lang of SUPPORTED_LANGUAGES) {
      const strategy = getLanguageProjectionStrategy(lang);
      expect(strategy.language).toBe(lang);
      expect(strategy.autocompleteRules.length).toBeGreaterThan(0);
      expect(strategy.coachRules.length).toBeGreaterThan(0);
      expect(strategy.stopSequences).toContain("\n\n");
    }
  });

  it("returns fresh strategy copies so callers cannot mutate registry state", () => {
    const first = getLanguageProjectionStrategy("cpp");
    first.autocompleteRules.pop();
    first.stopSequences.push("MUTATED");

    const second = getLanguageProjectionStrategy("cpp");
    expect(second.autocompleteRules.length).toBe(2);
    expect(second.stopSequences).not.toContain("MUTATED");
  });
});
