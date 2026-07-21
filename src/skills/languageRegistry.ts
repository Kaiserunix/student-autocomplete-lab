import type { NormalizedSkillLanguage, SkillRule } from "./types";

export interface LanguageSkillStrategy {
  language: NormalizedSkillLanguage;
  commentPrefix?: "#" | "//";
  autocompleteRules: SkillRule[];
  coachRules: SkillRule[];
  stopSequences: string[];
}

const ALIASES: Record<string, NormalizedSkillLanguage> = {
  py: "python",
  python: "python",
  c: "c",
  cpp: "cpp",
  "c++": "cpp",
  rust: "rust",
  rs: "rust"
};

export function normalizeSkillLanguage(value: string): NormalizedSkillLanguage {
  return ALIASES[value.trim().toLowerCase()] ?? "generic";
}

const COMPACT_LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  "language.python.indentation": "preserve Python indentation",
  "language.python.local-continuation": "continue the local Python construct",
  "language.python.range-boundaries": "check Python range bounds",
  "language.python.runtime-shape": "separate syntax, runtime, and algorithm errors",
  "language.python.collection-input": "check input, mutation, and list indexes",
  "language.python.recursion-depth": "check recursion base and depth",
  "language.c.syntax": "preserve C types, braces, and semicolons",
  "language.c.local-continuation": "continue the local C construct",
  "language.c.memory-bounds": "check C memory and bounds",
  "language.c.integer-behavior": "check C integer behavior",
  "language.c.io-undefined-behavior": "check C I/O and undefined behavior",
  "language.cpp.syntax": "preserve C++ types, braces, and semicolons",
  "language.cpp.local-continuation": "continue the local C++ construct",
  "language.cpp.container-bounds": "check C++ container and iterator bounds",
  "language.cpp.value-lifetime": "check C++ value and reference lifetime",
  "language.cpp.comparator-signedness": "check comparators and signedness",
  "language.rust.syntax": "preserve Rust ownership-shaped syntax",
  "language.rust.local-continuation": "continue the local Rust construct",
  "language.rust.ownership": "check Rust ownership and borrowing",
  "language.rust.result-option": "check Result and Option flow",
  "language.rust.indexing-recursion": "check Rust indexes and recursion",
  "language.generic.local-continuation": "continue the smallest local construct",
  "language.generic.evidence": "use visible evidence only"
};

function rule(
  language: NormalizedSkillLanguage,
  route: "coach" | "autocomplete",
  id: string,
  policyKey: string,
  priority: number,
  instruction: string
): SkillRule {
  return {
    id,
    policyKey,
    route,
    layer: "body",
    strength: "soft",
    source: "language",
    priority,
    instruction,
    compactInstruction: COMPACT_LANGUAGE_INSTRUCTIONS[id],
    enforcement: "prompt",
    language
  };
}

const fence = String.fromCharCode(96).repeat(3);

const REGISTRY: Record<NormalizedSkillLanguage, LanguageSkillStrategy> = {
  python: {
    language: "python",
    commentPrefix: "#",
    autocompleteRules: [
      rule("python", "autocomplete", "language.python.indentation", "syntax.indentation", 620,
        "Preserve the current Python indentation and complete only the open local block."),
      rule("python", "autocomplete", "language.python.local-continuation", "language.completion-style", 610,
        "Prefer a direct Python expression or statement that follows from the visible prefix.")
    ],
    coachRules: [
      rule("python", "coach", "language.python.range-boundaries", "diagnosis.boundaries", 620,
        "When relevant, check range endpoints, negative indexes, and empty sequences explicitly."),
      rule("python", "coach", "language.python.runtime-shape", "diagnosis.runtime", 610,
        "Distinguish Python syntax, runtime exceptions, and algorithmic mistakes before giving a hint."),
      rule("python", "coach", "language.python.collection-input", "diagnosis.collection-input", 600,
        "When relevant, check mutable values, input parsing, list indexes, and empty collections."),
      rule("python", "coach", "language.python.recursion-depth", "diagnosis.recursion", 590,
        "When relevant, check the base case, progress measure, and recursion-depth constraint.")
    ],
    stopSequences: ["\n\n", fence]
  },
  c: {
    language: "c",
    commentPrefix: "//",
    autocompleteRules: [
      rule("c", "autocomplete", "language.c.syntax", "syntax.statement", 620,
        "Preserve C declarations, braces, semicolons, and the types visible in local code."),
      rule("c", "autocomplete", "language.c.local-continuation", "language.completion-style", 610,
        "Complete only the current C expression, statement, or smallest open block.")
    ],
    coachRules: [
      rule("c", "coach", "language.c.memory-bounds", "diagnosis.bounds", 620,
        "When relevant, check array bounds, pointer validity, initialization, and lifetime."),
      rule("c", "coach", "language.c.integer-behavior", "diagnosis.numeric", 610,
        "When relevant, distinguish integer overflow, signedness, and format-specifier mistakes."),
      rule("c", "coach", "language.c.io-undefined-behavior", "diagnosis.io-contract", 600,
        "When relevant, check buffer sizing, I/O contracts, and undefined behavior before changing the algorithm.")
    ],
    stopSequences: ["\n\n", fence]
  },
  cpp: {
    language: "cpp",
    commentPrefix: "//",
    autocompleteRules: [
      rule("cpp", "autocomplete", "language.cpp.syntax", "syntax.statement", 620,
        "Preserve visible C++ types, templates, namespaces, braces, and semicolons."),
      rule("cpp", "autocomplete", "language.cpp.local-continuation", "language.completion-style", 610,
        "Complete only the current C++ expression, statement, or smallest open block.")
    ],
    coachRules: [
      rule("cpp", "coach", "language.cpp.container-bounds", "diagnosis.bounds", 620,
        "When relevant, check container size, iterator validity, indexing, and one-past-the-end behavior."),
      rule("cpp", "coach", "language.cpp.value-lifetime", "diagnosis.runtime", 610,
        "When relevant, distinguish value, reference, move, and object-lifetime mistakes."),
      rule("cpp", "coach", "language.cpp.comparator-signedness", "diagnosis.comparator", 600,
        "When relevant, check comparator validity, copies versus references, and signed/unsigned comparisons.")
    ],
    stopSequences: ["\n\n", fence]
  },
  rust: {
    language: "rust",
    commentPrefix: "//",
    autocompleteRules: [
      rule("rust", "autocomplete", "language.rust.syntax", "syntax.statement", 620,
        "Preserve visible Rust ownership, borrowing, match, and Result or Option structure."),
      rule("rust", "autocomplete", "language.rust.local-continuation", "language.completion-style", 610,
        "Complete only the current Rust expression, statement, or smallest open block.")
    ],
    coachRules: [
      rule("rust", "coach", "language.rust.ownership", "diagnosis.ownership", 620,
        "When relevant, explain whether ownership, borrowing, lifetime, or mutability causes the symptom."),
      rule("rust", "coach", "language.rust.result-option", "diagnosis.runtime", 610,
        "When relevant, inspect Result and Option flow without recommending an unmotivated unwrap."),
      rule("rust", "coach", "language.rust.indexing-recursion", "diagnosis.bounds-recursion", 600,
        "When relevant, check indexing, mutation, recursion progress, and stack constraints.")
    ],
    stopSequences: ["\n\n", fence]
  },
  generic: {
    language: "generic",
    autocompleteRules: [
      rule("generic", "autocomplete", "language.generic.local-continuation", "language.completion-style", 600,
        "Preserve visible syntax and complete only the smallest local construct.")
    ],
    coachRules: [
      rule("generic", "coach", "language.generic.evidence", "diagnosis.evidence", 600,
        "Base the diagnosis on visible code and observed behavior without assuming language-specific semantics.")
    ],
    stopSequences: ["\n\n", fence]
  }
};

export function getLanguageSkillStrategy(value: string): LanguageSkillStrategy {
  return REGISTRY[normalizeSkillLanguage(value)];
}
