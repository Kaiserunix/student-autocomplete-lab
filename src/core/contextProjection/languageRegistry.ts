import type { SupportedLanguage } from "../contracts";
import type { ProjectionRoute, ProjectionRule } from "./types";

export interface LanguageProjectionStrategy {
  language: SupportedLanguage;
  commentPrefix?: "#" | "//";
  autocompleteRules: ProjectionRule[];
  coachRules: ProjectionRule[];
  stopSequences: string[];
}

export const SUPPORTED_LANGUAGES: readonly SupportedLanguage[] = [
  "python",
  "cpp",
  "c",
  "rust",
  "java",
  "generic"
];

const LANGUAGE_ALIASES: Record<string, SupportedLanguage> = {
  py: "python",
  python: "python",
  python3: "python",
  py3: "python",
  c: "c",
  h: "c",
  cpp: "cpp",
  "c++": "cpp",
  cc: "cpp",
  cxx: "cpp",
  hpp: "cpp",
  rust: "rust",
  rs: "rust",
  java: "java",
  generic: "generic",
  plaintext: "generic"
};

export function normalizeLanguage(value: string): SupportedLanguage {
  const normalized = value.trim().toLowerCase();
  return LANGUAGE_ALIASES[normalized] ?? "generic";
}

const COMPACT_LANGUAGE_INSTRUCTIONS: Record<string, string> = {
  "language.python.indentation": "preserve Python indentation",
  "language.python.local-continuation": "continue local Python syntax only",
  "language.python.range-boundaries": "check Python range bounds and slicing",
  "language.python.runtime-shape": "separate syntax, runtime, and algorithm bugs",
  "language.python.collection-input": "check mutability, input parsing, and list indexes",
  "language.python.recursion-depth": "check base case and recursion limit",
  "language.c.syntax": "preserve C types, braces, and semicolons",
  "language.c.local-continuation": "continue local C syntax only",
  "language.c.memory-bounds": "check C array bounds and pointer validity",
  "language.c.integer-behavior": "check C integer overflow and signedness",
  "language.c.io-undefined-behavior": "check C buffer sizing and I/O contracts",
  "language.cpp.syntax": "preserve C++ types, templates, braces, and semicolons",
  "language.cpp.local-continuation": "continue local C++ syntax only",
  "language.cpp.container-bounds": "check C++ container and iterator bounds",
  "language.cpp.value-lifetime": "check C++ value, reference, and lifetime semantics",
  "language.cpp.comparator-signedness": "check strict weak ordering and signedness",
  "language.rust.syntax": "preserve Rust ownership and borrowing syntax",
  "language.rust.local-continuation": "continue local Rust syntax only",
  "language.rust.ownership": "check Rust ownership, borrowing, and mutability",
  "language.rust.result-option": "check Result and Option handling safely",
  "language.rust.indexing-recursion": "check Rust usize indexing and recursion bounds",
  "language.java.syntax": "preserve Java types, generics, braces, and semicolons",
  "language.java.local-continuation": "continue local Java syntax only",
  "language.java.collections-bounds": "check Java array/List bounds and reference equality",
  "language.java.null-reference": "check null safety and object initialization",
  "language.java.numeric-overflow": "check 32-bit int overflow and Fast I/O buffering",
  "language.generic.local-continuation": "continue smallest local construct only",
  "language.generic.evidence": "use visible code and run evidence only"
};

function createLanguageRule(
  language: SupportedLanguage,
  route: ProjectionRoute,
  id: string,
  policyKey: string,
  priority: number,
  instruction: string
): ProjectionRule {
  return {
    id,
    policyKey,
    route,
    layer: "body",
    source: "language",
    priority,
    instruction,
    compactInstruction: COMPACT_LANGUAGE_INSTRUCTIONS[id],
    enforcement: "prompt",
    language
  };
}

const CODE_FENCE = "`".repeat(3);

const LANGUAGE_REGISTRY: Record<SupportedLanguage, LanguageProjectionStrategy> = {
  python: {
    language: "python",
    commentPrefix: "#",
    autocompleteRules: [
      createLanguageRule(
        "python",
        "autocomplete",
        "language.python.indentation",
        "syntax.indentation",
        620,
        "Preserve the current Python indentation and complete only the open local syntax."
      ),
      createLanguageRule(
        "python",
        "autocomplete",
        "language.python.local-continuation",
        "language.completion-style",
        610,
        "Prefer a short local Python expression or boilerplate continuation from the visible prefix."
      )
    ],
    coachRules: [
      createLanguageRule(
        "python",
        "coach",
        "language.python.range-boundaries",
        "diagnosis.boundaries",
        620,
        "When relevant, check range endpoints, negative indexes, and empty sequences explicitly."
      ),
      createLanguageRule(
        "python",
        "coach",
        "language.python.runtime-shape",
        "diagnosis.runtime",
        610,
        "Distinguish Python syntax, runtime exceptions, and algorithmic mistakes before giving a hint."
      ),
      createLanguageRule(
        "python",
        "coach",
        "language.python.collection-input",
        "diagnosis.collection-input",
        600,
        "When relevant, check mutable aliasing, input parsing, list indexes, and empty collections."
      ),
      createLanguageRule(
        "python",
        "coach",
        "language.python.recursion-depth",
        "diagnosis.recursion",
        590,
        "When relevant, check the base case, progress measure, and Python recursion depth limit."
      )
    ],
    stopSequences: ["\n\n", CODE_FENCE]
  },
  c: {
    language: "c",
    commentPrefix: "//",
    autocompleteRules: [
      createLanguageRule(
        "c",
        "autocomplete",
        "language.c.syntax",
        "syntax.statement",
        620,
        "Preserve C declarations, braces, semicolons, and visible local types."
      ),
      createLanguageRule(
        "c",
        "autocomplete",
        "language.c.local-continuation",
        "language.completion-style",
        610,
        "Complete only the current C statement or smallest open local construct."
      )
    ],
    coachRules: [
      createLanguageRule(
        "c",
        "coach",
        "language.c.memory-bounds",
        "diagnosis.bounds",
        620,
        "When relevant, check array bounds, pointer validity, initialization, and lifetime."
      ),
      createLanguageRule(
        "c",
        "coach",
        "language.c.integer-behavior",
        "diagnosis.numeric",
        610,
        "When relevant, distinguish integer overflow, signedness, and format-specifier mistakes."
      ),
      createLanguageRule(
        "c",
        "coach",
        "language.c.io-undefined-behavior",
        "diagnosis.io-contract",
        600,
        "When relevant, check buffer sizing, I/O contracts, and undefined behavior before changing the algorithm."
      )
    ],
    stopSequences: ["\n\n", CODE_FENCE]
  },
  cpp: {
    language: "cpp",
    commentPrefix: "//",
    autocompleteRules: [
      createLanguageRule(
        "cpp",
        "autocomplete",
        "language.cpp.syntax",
        "syntax.statement",
        620,
        "Preserve visible C++ types, templates, namespaces, braces, and semicolons."
      ),
      createLanguageRule(
        "cpp",
        "autocomplete",
        "language.cpp.local-continuation",
        "language.completion-style",
        610,
        "Complete only the current C++ expression, statement, or smallest open local shell."
      )
    ],
    coachRules: [
      createLanguageRule(
        "cpp",
        "coach",
        "language.cpp.container-bounds",
        "diagnosis.bounds",
        620,
        "When relevant, check container size, iterator validity, indexing, and one-past-the-end behavior."
      ),
      createLanguageRule(
        "cpp",
        "coach",
        "language.cpp.value-lifetime",
        "diagnosis.runtime",
        610,
        "When relevant, distinguish value, reference, move, and object-lifetime mistakes."
      ),
      createLanguageRule(
        "cpp",
        "coach",
        "language.cpp.comparator-signedness",
        "diagnosis.comparator",
        600,
        "When relevant, check comparator strict weak ordering, copies versus references, and signed/unsigned comparisons."
      )
    ],
    stopSequences: ["\n\n", CODE_FENCE]
  },
  rust: {
    language: "rust",
    commentPrefix: "//",
    autocompleteRules: [
      createLanguageRule(
        "rust",
        "autocomplete",
        "language.rust.syntax",
        "syntax.statement",
        620,
        "Preserve visible Rust ownership, borrowing, match, and Result or Option syntax."
      ),
      createLanguageRule(
        "rust",
        "autocomplete",
        "language.rust.local-continuation",
        "language.completion-style",
        610,
        "Complete only the current Rust expression, statement, or smallest local shell."
      )
    ],
    coachRules: [
      createLanguageRule(
        "rust",
        "coach",
        "language.rust.ownership",
        "diagnosis.ownership",
        620,
        "When relevant, explain whether ownership, borrowing, lifetime, or mutability causes the symptom."
      ),
      createLanguageRule(
        "rust",
        "coach",
        "language.rust.result-option",
        "diagnosis.runtime",
        610,
        "When relevant, inspect Result and Option flow without recommending an unmotivated unwrap."
      ),
      createLanguageRule(
        "rust",
        "coach",
        "language.rust.indexing-recursion",
        "diagnosis.bounds-recursion",
        600,
        "When relevant, check usize indexing underflow, mutation, recursion progress, and stack limits."
      )
    ],
    stopSequences: ["\n\n", CODE_FENCE]
  },
  java: {
    language: "java",
    commentPrefix: "//",
    autocompleteRules: [
      createLanguageRule(
        "java",
        "autocomplete",
        "language.java.syntax",
        "syntax.statement",
        620,
        "Preserve visible Java class/method types, generics, braces, and semicolons."
      ),
      createLanguageRule(
        "java",
        "autocomplete",
        "language.java.local-continuation",
        "language.completion-style",
        610,
        "Complete only the current Java expression, statement, or smallest local construct."
      )
    ],
    coachRules: [
      createLanguageRule(
        "java",
        "coach",
        "language.java.collections-bounds",
        "diagnosis.bounds",
        620,
        "When relevant, check array/List bounds, String/Integer equals() vs ==, and mutability."
      ),
      createLanguageRule(
        "java",
        "coach",
        "language.java.null-reference",
        "diagnosis.runtime",
        610,
        "When relevant, check null references, uninitialized collection entries, and autoboxing overhead."
      ),
      createLanguageRule(
        "java",
        "coach",
        "language.java.numeric-overflow",
        "diagnosis.numeric",
        600,
        "When relevant, check 32-bit int overflow versus long and BufferedReader/StringBuilder I/O performance."
      )
    ],
    stopSequences: ["\n\n", CODE_FENCE]
  },
  generic: {
    language: "generic",
    autocompleteRules: [
      createLanguageRule(
        "generic",
        "autocomplete",
        "language.generic.local-continuation",
        "language.completion-style",
        600,
        "Preserve visible syntax and complete only the smallest local construct."
      )
    ],
    coachRules: [
      createLanguageRule(
        "generic",
        "coach",
        "language.generic.evidence",
        "diagnosis.evidence",
        600,
        "Base the diagnosis on visible code and observed run evidence without assuming language-specific semantics."
      )
    ],
    stopSequences: ["\n\n", CODE_FENCE]
  }
};

export function getLanguageProjectionStrategy(
  value: string
): LanguageProjectionStrategy {
  const strategy = LANGUAGE_REGISTRY[normalizeLanguage(value)];
  return {
    language: strategy.language,
    commentPrefix: strategy.commentPrefix,
    autocompleteRules: strategy.autocompleteRules.map((rule) => ({ ...rule })),
    coachRules: strategy.coachRules.map((rule) => ({ ...rule })),
    stopSequences: [...strategy.stopSequences]
  };
}
