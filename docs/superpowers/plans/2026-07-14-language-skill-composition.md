# Language-Aware Modular Skill Composition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Introduce typed, language-aware SkillPlan composition for coach and autocomplete routes, safely append bounded learner habits, render the plan according to provider capabilities including DeepSeek FIM, and expose privacy-safe audit/status information without adding per-language model settings.

**Architecture:** Build a provider-neutral four-layer plan (head safety policy, language body, learner tail, action/output footer), then resolve conflicts with the fixed precedence safety > output > action > language > habits. Provider renderers translate the resolved plan into chat messages, Codex text, generic completions, or DeepSeek FIM. StudentSkill text is never forwarded verbatim: a controlled selector maps recognized evidence to stable learner rule IDs, caps the selection, and records only stable IDs/reasons in audit data. Coach and autocomplete remain separate typed entry points and share only the composition primitives.

**Tech Stack:** TypeScript 5.8 strict mode, VS Code Extension API 1.95, Vitest 3, OpenAI-compatible completions/chat, Anthropic Messages, Codex app-server OAuth transport, VSCE packaging.

---

## Source of truth and non-negotiable boundaries

- Approved design: docs/superpowers/specs/2026-07-14-language-skill-composition-design.md
- At plan-authoring time the worktree is on codex/formal-frontend-redesign. Before Task 1, create or switch this same worktree to the dedicated branch codex/language-skill-composition from the then-current intended integration HEAD. Do not implement these tasks directly on the frontend-redesign branch.
- Preserve all pre-existing dirty changes. The authoring snapshot contains changes in src/autocomplete/inlineProvider.ts and src/autocomplete/triggerPolicy.ts plus untracked test.c. Re-run git status because the list may change before execution.
- For a dirty target file, inspect the before/after diff, stage only this plan's hunks with git add -p, and inspect git diff --cached before every commit. Never stage a whole dirty file without proving every staged hunk belongs to this feature.
- Do not add per-language model selectors. Language changes rules and validation, not provider/model routing.
- Do not pass problem statements, teacher packs, reference answers, coach history, arbitrary StudentSkill strings, code prefix/suffix, file paths, API keys, or OAuth tokens into audit/log payloads.
- Do not synthesize a suffix for FIM. The request suffix must be the exact post-cursor text supplied by the context boundary.
- Keep the legacy requestMimoAutocomplete and requestMimoTeachingDiagnosis entry points working for CLI and existing tests while adding detailed entry points.

## Target dependency flow

    StudentSkill
        |
        v
    controlled habit selector ---- language registry
                 |                       |
                 +----------+------------+
                            v
                       SkillPlan
                            |
              provider capabilities / renderer
                            |
            +---------------+----------------+
            |                                |
      model request                    output validator
            |                                |
            +---------------+----------------+
                            v
                  suggestion/report + safe audit

### Task 0: Freeze the baseline and protect the dirty worktree

**Files:**

- Inspect only: all files reported by git status
- Do not create or modify product files in this task

- [ ] **Step 1: Record the exact baseline**

Run:

    Set-Location C:\Users\qwerf\Desktop\student-autocomplete-lab
    git branch --show-current
    git status --short
    git diff --check
    Get-Content -Raw README.md | Out-Null
    Get-Content -Raw docs\current-gaps-and-next-steps.md | Out-Null
    Get-Content -Raw docs\superpowers\specs\2026-07-14-language-skill-composition-design.md | Out-Null
    code --list-extensions --show-versions | Select-String "student-autocomplete"

Expected:

- The current integration branch/commit and installed extension IDs/versions are recorded.
- The dirty paths are classified as pre-existing, feature-owned, or scratch before any edit.
- git diff --check prints no whitespace errors. If it reports a pre-existing error, record the path and do not silently repair unrelated content.

- [ ] **Step 2: Create the dedicated feature branch in this worktree**

Run:

    git show-ref --verify --quiet refs/heads/codex/language-skill-composition
    if ($LASTEXITCODE -eq 0) {
      git switch codex/language-skill-composition
    } else {
      git switch -c codex/language-skill-composition
    }
    git branch --show-current
    git status --short

Expected:

- Current branch is codex/language-skill-composition.
- Pre-existing dirty changes are still present and unchanged.
- No second worktree is created.

- [ ] **Step 3: Run the focused baseline suite**

Run:

    npx vitest run test/modelRouter.test.ts test/completionsClient.test.ts test/mimoAutocomplete.test.ts test/mimoTeacher.test.ts test/teachingPrompt.test.ts test/studentSkill.test.ts test/problemBankWebviewScript.test.ts

Expected: all focused tests pass before feature work. If a test already fails, stop and classify it as baseline rather than changing feature expectations to hide it.

- [ ] **Step 4: Run the complete baseline suite**

Run:

    npm test
    npm run compile

Expected: Vitest exits 0 and TypeScript emits no errors.

There is no commit for this task.

### Task 1: Add the typed SkillPlan contract and language registry

**Files:**

- Create: src/skills/types.ts
- Create: src/skills/languageRegistry.ts
- Create: test/languageSkillRegistry.test.ts

- [ ] **Step 1: Write the failing language registry test**

Create test/languageSkillRegistry.test.ts with:

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
    });

- [ ] **Step 2: Verify the test is red**

Run:

    npx vitest run test/languageSkillRegistry.test.ts

Expected: FAIL because src/skills/languageRegistry.ts does not exist.

- [ ] **Step 3: Add the complete shared type contract**

Create src/skills/types.ts with:

    export type SkillRoute = "coach" | "autocomplete";
    export type NormalizedSkillLanguage = "python" | "c" | "cpp" | "rust" | "generic";
    export type SkillLayer = "head" | "body" | "tail" | "footer";
    export type SkillRuleStrength = "hard" | "soft";
    export type SkillRuleSource = "core" | "output" | "action" | "language" | "learner";
    export type SkillEnforcement = "prompt" | "stop" | "validator" | "prompt-and-validator";
    export type CoachSkillAction = "hint" | "specific" | "followUp" | "giveUp" | "recommend";
    export type SkillRendererId =
      | "unrendered"
      | "deepseek-fim"
      | "chat-messages"
      | "codex-text"
      | "generic-completion";

    export interface SkillRule {
      id: string;
      policyKey: string;
      route: SkillRoute;
      layer: SkillLayer;
      strength: SkillRuleStrength;
      source: SkillRuleSource;
      priority: number;
      instruction: string;
      compactInstruction?: string;
      enforcement: SkillEnforcement;
      language?: NormalizedSkillLanguage;
    }

    export interface ExcludedSkillRule {
      id: string;
      reason:
        | "conflict"
        | "disabled"
        | "wrong-diagnosis"
        | "not-relevant"
        | "budget"
        | "renderer-budget"
        | "unmapped";
    }

    export interface LearnerRuleSelection {
      rules: SkillRule[];
      excludedRules: ExcludedSkillRule[];
      budget: number;
      characterBudget: number;
      usedCharacters: number;
    }

    export interface SkillOutputContract {
      id: "autocomplete.code-only-v1" | "coach.teaching-json-v1";
      mode: "code-only" | "teaching-json";
      maxLines?: number;
      responseFormat?: "json_object";
    }

    export interface SkillPlanAudit {
      route: SkillRoute;
      language: NormalizedSkillLanguage;
      renderer: SkillRendererId;
      includedRuleIds: string[];
      excludedRules: ExcludedSkillRule[];
      learnerRuleCount: number;
      learnerRuleBudget: number;
      learnerCharacterCount: number;
      learnerCharacterBudget: number;
      enforcementKinds: SkillEnforcement[];
    }

    export interface SkillPlan {
      route: SkillRoute;
      language: NormalizedSkillLanguage;
      rules: SkillRule[];
      output: SkillOutputContract;
      audit: SkillPlanAudit;
    }

    export interface AutocompleteSkillContext {
      prefix: string;
      suffix: string;
      language: NormalizedSkillLanguage;
      fileLabel: string;
    }

    export interface ProviderCapabilities {
      renderer: Exclude<SkillRendererId, "unrendered">;
      requestShape: "fim" | "chat" | "anthropic-messages" | "codex-text" | "completion";
      supportsSystemInstruction: boolean;
      supportsFimSuffix: boolean;
      supportsStopSequences: boolean;
      prefixCacheFriendly: boolean;
      configurationIssue?: "deepseek-fim-beta-required";
    }

    export interface RenderedAutocompleteSkillRequest {
      prompt: string;
      systemInstruction?: string;
      suffix?: string;
      stop?: string[];
      maxLines: number;
      audit: SkillPlanAudit;
    }

    export interface RenderedCoachSkillRequest {
      messages: Array<{
        role: "system" | "user";
        content: string;
      }>;
      audit: SkillPlanAudit;
    }

- [ ] **Step 4: Implement the language registry with stable rule IDs**

Create src/skills/languageRegistry.ts. Keep aliases, comment style, rule IDs, policy keys, and instructions centralized. The complete registry shape is:

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

- [ ] **Step 5: Verify green and commit**

Run:

    npx vitest run test/languageSkillRegistry.test.ts
    npm run compile
    git add src/skills/types.ts src/skills/languageRegistry.ts test/languageSkillRegistry.test.ts
    git diff --cached --check
    git diff --cached --stat
    git commit -m "feat: add typed language skill registry"

Expected: tests and compile pass; the commit contains only the three new files.

### Task 2: Convert StudentSkill evidence into bounded controlled learner rules

**Files:**

- Create: src/skills/habitSelector.ts
- Create: test/habitSelector.test.ts
- Modify: src/teaching/studentSkill.ts
- Modify: test/studentSkill.test.ts

- [ ] **Step 1: Write failing selection and privacy tests**

Create test/habitSelector.test.ts with:

    import { describe, expect, test } from "vitest";
    import { selectLearnerRules } from "../src/skills/habitSelector";
    import { createEmptyStudentSkill } from "../src/teaching/studentSkill";

    describe("learner habit selector", () => {
      test("maps recognized Python evidence to controlled stable IDs", () => {
        const skill = createEmptyStudentSkill("student-a", "2026-07-14T00:00:00.000Z");
        skill.codeHabits.languageRules.python = [
          "Before a range loop, write the first and last valid indexes.",
          "Prefer direct student code."
        ];

        const selection = selectLearnerRules({
          skill,
          route: "autocomplete",
          language: "python",
          localCode: "for i in range(n):\n    values[i]"
        });

        expect(selection.rules.map((rule) => rule.id)).toEqual([
          "learner.loop-boundary",
          "learner.local-continuation"
        ]);
        expect(selection.budget).toBe(2);
        expect(selection.usedCharacters).toBeLessThanOrEqual(selection.characterBudget);
      });

      test("caps autocomplete at two and coach at three rules", () => {
        const skill = createEmptyStudentSkill("student-a", "2026-07-14T00:00:00.000Z");
        skill.codeHabits.globalRules = [
          "Check loop boundary.",
          "Initialize accumulators.",
          "Check array indexes.",
          "Preserve indentation."
        ];

        expect(selectLearnerRules({
          skill,
          route: "autocomplete",
          language: "python",
          localCode: "for i in range(n):\n    total += values[i]"
        }).rules).toHaveLength(2);
        expect(selectLearnerRules({
          skill,
          route: "coach",
          language: "python",
          localCode: "for i in range(n):\n    total += values[i]"
        }).rules).toHaveLength(3);
      });

      test("honors a wrong-diagnosis correction", () => {
        const skill = createEmptyStudentSkill("student-a", "2026-07-14T00:00:00.000Z");
        skill.skills["python-loop-boundary-check"] = {
          name: "python-loop-boundary-check",
          status: "active",
          reason: "Repeated misses.",
          rules: ["Write loop bounds first."],
          sourcePainPoints: ["loop_boundary"],
          evidenceCount: 3,
          score: 2.8,
          examples: [],
          lastSeen: "2026-07-14T00:00:00.000Z"
        };
        skill.correctionLog.push({
          type: "diagnosis_wrong",
          target: "python-loop-boundary-check",
          note: "This diagnosis was wrong.",
          source: "user",
          occurredAt: "2026-07-14T00:01:00.000Z"
        });

        const selection = selectLearnerRules({
          skill,
          route: "coach",
          language: "python",
          localCode: "for i in range(n): pass"
        });

        expect(selection.rules).toEqual([]);
        expect(selection.excludedRules).toContainEqual({
          id: "learner.loop-boundary",
          reason: "wrong-diagnosis"
        });
      });

      test("never forwards unknown raw text", () => {
        const skill = createEmptyStudentSkill("student-a", "2026-07-14T00:00:00.000Z");
        skill.codeHabits.globalRules = [
          "P1030 reference answer says root must be printed first and secret-token-123 must be copied."
        ];

        const selection = selectLearnerRules({
          skill,
          route: "autocomplete",
          language: "cpp",
          localCode: "cout << root;"
        });
        const serialized = JSON.stringify(selection);

        expect(selection.rules).toEqual([]);
        expect(selection.excludedRules).toEqual([{ id: "learner.unmapped", reason: "unmapped" }]);
        expect(serialized).not.toContain("P1030");
        expect(serialized).not.toContain("secret-token-123");
      });
    });

- [ ] **Step 2: Verify red**

Run:

    npx vitest run test/habitSelector.test.ts

Expected: FAIL because src/skills/habitSelector.ts does not exist.

- [ ] **Step 3: Implement the controlled catalog and deterministic selector**

Create src/skills/habitSelector.ts with the following catalog and public API:

    import { isStudentSkillTeachingActive } from "../teaching/studentSkillLifecycle";
    import type { StudentSkill } from "../teaching/studentSkill";
    import { normalizeSkillLanguage } from "./languageRegistry";
    import type {
      ExcludedSkillRule,
      LearnerRuleSelection,
      NormalizedSkillLanguage,
      SkillRoute,
      SkillRule
    } from "./types";

    interface HabitDefinition {
      id: string;
      policyKey: string;
      instruction: string;
      compactInstruction: string;
      priority: number;
      aliases: RegExp[];
      relevance: RegExp;
      languages?: NormalizedSkillLanguage[];
    }

    const HABITS: HabitDefinition[] = [
      {
        id: "learner.loop-boundary",
        policyKey: "habit.loop-boundary",
        instruction: "Check the first and last valid loop or range boundary before continuing.",
        compactInstruction: "check loop bounds",
        priority: 60,
        aliases: [/loop.*bound/i, /range.*(first|last|end)/i, /循环.*边界/, /首.*末.*下标/],
        relevance: /\b(for|while|range)\b|循环/
      },
      {
        id: "learner.initialization",
        policyKey: "habit.initialization",
        instruction: "Check that counters, accumulators, and state are initialized before first use.",
        compactInstruction: "check initialization",
        priority: 50,
        aliases: [/initiali[sz]/i, /accumulator/i, /初始化/, /初值/],
        relevance: /\b(sum|total|count|ans|result|state)\b|累计|计数/
      },
      {
        id: "learner.bounds",
        policyKey: "habit.bounds",
        instruction: "Check indexes and container or array bounds at the current access.",
        compactInstruction: "check indexes and bounds",
        priority: 55,
        aliases: [/array.*bound/i, /index/i, /out.of.bounds/i, /越界/, /下标/],
        relevance: /\[[^\]]+\]|\bat\s*\(|下标/
      },
      {
        id: "learner.indentation",
        policyKey: "habit.indentation",
        instruction: "Preserve the current indentation and block structure.",
        compactInstruction: "preserve indentation",
        priority: 40,
        aliases: [/indent/i, /缩进/],
        relevance: /\n[ \t]+\S/
      },
      {
        id: "learner.pointer",
        policyKey: "habit.pointer",
        instruction: "Check pointer validity and pointee lifetime before dereferencing.",
        compactInstruction: "check pointer validity",
        priority: 55,
        aliases: [/pointer/i, /dereference/i, /指针/, /解引用/],
        relevance: /->|\*\s*[A-Za-z_]|\bnull\b|\bnullptr\b/i,
        languages: ["c", "cpp"]
      },
      {
        id: "learner.local-continuation",
        policyKey: "habit.local-continuation",
        instruction: "Prefer the immediate local continuation over new scaffolding or a full solution.",
        compactInstruction: "continue locally",
        priority: 10,
        aliases: [/direct student code/i, /local continuation/i, /局部续写/, /直接续写/],
        relevance: /[\s\S]*/
      }
    ];

    interface LearnerRuleSelectionInput {
      skill: StudentSkill;
      route: SkillRoute;
      language: string;
      localCode?: string;
    }

    interface Candidate {
      definition: HabitDefinition;
      target?: string;
      score: number;
      relevant: boolean;
      confirmed: boolean;
      confidence: number;
      evidenceCount: number;
      lastSeen: string;
    }

    export function selectLearnerRules(input: LearnerRuleSelectionInput): LearnerRuleSelection {
      const language = normalizeSkillLanguage(input.language);
      const localCode = input.localCode ?? "";
      const budget = input.route === "autocomplete" ? 2 : 3;
      const characterBudget = input.route === "autocomplete" ? 240 : 480;
      const wrongTargets = new Set(
        input.skill.correctionLog
          .filter((item) => item.type === "diagnosis_wrong" && item.target)
          .map((item) => item.target as string)
      );
      const helpfulTargets = new Set(
        input.skill.correctionLog
          .filter((item) => item.type === "diagnosis_helpful" && item.target)
          .map((item) => item.target as string)
      );
      const excluded: ExcludedSkillRule[] = [];
      const candidates: Candidate[] = [];

      const addText = (
        text: string,
        target: string | undefined,
        baseScore: number,
        confidence = 0,
        evidenceCount = 0,
        lastSeen = ""
      ): void => {
        const definition = HABITS.find((habit) => habit.aliases.some((pattern) => pattern.test(text)));
        if (!definition) {
          excluded.push({ id: "learner.unmapped", reason: "unmapped" });
          return;
        }
        if (definition.languages && !definition.languages.includes(language)) {
          excluded.push({ id: definition.id, reason: "not-relevant" });
          return;
        }
        if (target && wrongTargets.has(target)) {
          excluded.push({ id: definition.id, reason: "wrong-diagnosis" });
          return;
        }
        if (target && input.skill.hardRules.disabledSkills.includes(target)) {
          excluded.push({ id: definition.id, reason: "disabled" });
          return;
        }

        const relevant = definition.relevance.test(localCode);
        candidates.push({
          definition,
          target,
          score: baseScore + definition.priority,
          relevant,
          confirmed: helpfulTargets.has(target ?? ""),
          confidence,
          evidenceCount,
          lastSeen
        });
      };

      for (const rawRule of input.skill.codeHabits.globalRules) {
        addText(rawRule, undefined, 10);
      }
      for (const rawRule of input.skill.codeHabits.languageRules[input.language] ?? []) {
        addText(rawRule, undefined, 15);
      }
      if (language !== input.language) {
        for (const rawRule of input.skill.codeHabits.languageRules[language] ?? []) {
          addText(rawRule, undefined, 15);
        }
      }
      for (const entry of Object.values(input.skill.skills)) {
        if (!isStudentSkillTeachingActive(entry.status)) {
          continue;
        }
        addText(
          [entry.name, entry.reason, entry.sourcePainPoints.join(" "), entry.rules.join(" ")].join(" "),
          entry.name,
          20,
          Math.min(1, entry.score / Math.max(1, entry.evidenceCount)),
          entry.evidenceCount,
          entry.lastSeen
        );
      }

      const byId = new Map<string, Candidate>();
      for (const candidate of candidates) {
        if (!candidate.relevant) {
          excluded.push({ id: candidate.definition.id, reason: "not-relevant" });
          continue;
        }
        const previous = byId.get(candidate.definition.id);
        if (!previous || compareCandidates(candidate, previous) < 0) {
          byId.set(candidate.definition.id, candidate);
        }
      }

      const ranked = [...byId.values()].sort(compareCandidates);

      const selected: Candidate[] = [];
      let usedCharacters = 0;
      for (const candidate of ranked) {
        const nextCharacters = usedCharacters + candidate.definition.instruction.length;
        if (selected.length >= budget || nextCharacters > characterBudget) {
          excluded.push({ id: candidate.definition.id, reason: "budget" });
          continue;
        }
        selected.push(candidate);
        usedCharacters = nextCharacters;
      }

      const rules: SkillRule[] = selected.map((candidate, index) => ({
        id: candidate.definition.id,
        policyKey: candidate.definition.policyKey,
        route: input.route,
        layer: "tail",
        strength: "soft",
        source: "learner",
        priority: 300 - index,
        instruction: candidate.definition.instruction,
        compactInstruction: candidate.definition.compactInstruction,
        enforcement: "prompt",
        language
      }));

      return {
        rules,
        excludedRules: uniqueExcluded(excluded),
        budget,
        characterBudget,
        usedCharacters
      };
    }

    function compareCandidates(left: Candidate, right: Candidate): number {
      return Number(right.relevant) - Number(left.relevant) ||
        Number(right.confirmed) - Number(left.confirmed) ||
        right.confidence - left.confidence ||
        right.lastSeen.localeCompare(left.lastSeen) ||
        right.evidenceCount - left.evidenceCount ||
        right.score - left.score ||
        left.definition.id.localeCompare(right.definition.id);
    }

    function uniqueExcluded(values: ExcludedSkillRule[]): ExcludedSkillRule[] {
      const seen = new Set<string>();
      return values.filter((item) => {
        const key = item.id + "|" + item.reason;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
    }

The executor may extract small pure helpers, but must preserve these controlled IDs/instructions, language relevance, correction handling, deterministic sort, and budgets. No StudentSkill text may be assigned to SkillRule.instruction.

- [ ] **Step 4: Migrate the public autocomplete context away from raw rules**

In src/teaching/studentSkill.ts, import selectLearnerRules and replace AutocompleteSkillContext.rules with:

    export interface AutocompleteSkillContext {
      allowFullSolutionAutocomplete: false;
      autocompleteMayReadProblemStatement: false;
      disabledSkills: string[];
      activeSkillNames: string[];
      learnerRuleIds: string[];
    }

Change buildAutocompleteSkillContext to accept localCode = "" and set:

    learnerRuleIds: selectLearnerRules({
      skill,
      route: "autocomplete",
      language,
      localCode
    }).rules.map((rule) => rule.id)

Keep the existing hard-rule and activeSkillNames fields unchanged.

In test/studentSkill.test.ts, replace the legacy raw-rule assertion with:

    expect(context.learnerRuleIds).toEqual([]);
    expect(JSON.stringify(context)).not.toContain("prefer sys.stdin.readline");
    expect(JSON.stringify(context)).not.toContain("P1030 standard answer");

This is an intentional migration: unknown legacy strings remain stored and inspectable but do not reach a model.

- [ ] **Step 5: Verify and stage only owned hunks**

Run:

    npx vitest run test/habitSelector.test.ts test/studentSkill.test.ts
    npm run compile
    git add src/skills/habitSelector.ts test/habitSelector.test.ts
    git add -p src/teaching/studentSkill.ts test/studentSkill.test.ts
    git diff --cached --check
    git diff --cached

Expected: the staged studentSkill hunks contain only the controlled-context migration.

- [ ] **Step 6: Commit**

Run:

    git commit -m "feat: select bounded learner skill rules"

### Task 3: Compose coach and autocomplete SkillPlans with fixed precedence

**Files:**

- Create: src/skills/composeSkillPlan.ts
- Create: test/skillPlan.test.ts

- [ ] **Step 1: Write failing composition tests**

Create test/skillPlan.test.ts with:

    import { describe, expect, test } from "vitest";
    import {
      composeAutocompleteSkillPlan,
      composeCoachSkillPlan
    } from "../src/skills/composeSkillPlan";
    import type { LearnerRuleSelection } from "../src/skills/types";

    const conflictingLearnerSelection: LearnerRuleSelection = {
      budget: 2,
      characterBudget: 240,
      usedCharacters: "Prefer the immediate local continuation over new scaffolding or a full solution.".length,
      excludedRules: [],
      rules: [
        {
          id: "learner.local-continuation",
          policyKey: "completion.scope",
          route: "autocomplete",
          layer: "tail",
          strength: "soft",
          source: "learner",
          priority: 300,
          instruction: "Prefer the immediate local continuation over new scaffolding or a full solution.",
          enforcement: "prompt",
          language: "python"
        }
      ]
    };

    describe("skill plan composition", () => {
      test("orders head, body, tail, and footer deterministically", () => {
        const plan = composeAutocompleteSkillPlan({
          language: "python",
          learnerSelection: {
            budget: 2,
            characterBudget: 240,
            usedCharacters: conflictingLearnerSelection.usedCharacters,
            excludedRules: [],
            rules: [{
              ...conflictingLearnerSelection.rules[0],
              policyKey: "habit.local-continuation"
            }]
          }
        });

        expect(plan.rules.map((rule) => rule.layer)).toEqual([
          "head",
          "head",
          "head",
          "body",
          "body",
          "tail",
          "footer"
        ]);
        expect(plan.audit.includedRuleIds).toEqual(plan.rules.map((rule) => rule.id));
        expect(plan.output).toEqual({
          id: "autocomplete.code-only-v1",
          mode: "code-only",
          maxLines: 3
        });
      });

      test("hard safety defeats a conflicting learner rule", () => {
        const plan = composeAutocompleteSkillPlan({
          language: "python",
          learnerSelection: conflictingLearnerSelection
        });

        expect(plan.rules.map((rule) => rule.id)).toContain("core.autocomplete.local-only");
        expect(plan.rules.map((rule) => rule.id)).not.toContain("learner.local-continuation");
        expect(plan.audit.excludedRules).toContainEqual({
          id: "learner.local-continuation",
          reason: "conflict"
        });
      });

      test("coach has an independent action and JSON contract", () => {
        const plan = composeCoachSkillPlan({
          language: "cpp",
          action: "specific",
          learnerSelection: {
            budget: 3,
            characterBudget: 480,
            usedCharacters: 0,
            excludedRules: [],
            rules: []
          }
        });

        expect(plan.route).toBe("coach");
        expect(plan.rules.map((rule) => rule.id)).toContain("action.coach.specific");
        expect(plan.rules.map((rule) => rule.id)).toContain("output.coach.json");
        expect(plan.output).toEqual({
          id: "coach.teaching-json-v1",
          mode: "teaching-json",
          responseFormat: "json_object"
        });
      });

      test("deduplicates a normalized rule ID before policy conflicts", () => {
        const duplicate = {
          ...conflictingLearnerSelection.rules[0],
          policyKey: "habit.second-key",
          priority: 299
        };
        const plan = composeAutocompleteSkillPlan({
          language: "python",
          learnerSelection: {
            ...conflictingLearnerSelection,
            rules: [conflictingLearnerSelection.rules[0], duplicate],
            usedCharacters: conflictingLearnerSelection.usedCharacters * 2
          }
        });

        expect(plan.audit.includedRuleIds.filter(
          (id) => id === "learner.local-continuation"
        )).toHaveLength(0);
        expect(plan.audit.excludedRules).toContainEqual({
          id: "learner.local-continuation",
          reason: "conflict"
        });
      });
    });

- [ ] **Step 2: Verify red**

Run:

    npx vitest run test/skillPlan.test.ts

Expected: FAIL because src/skills/composeSkillPlan.ts does not exist.

- [ ] **Step 3: Implement the composer**

Create src/skills/composeSkillPlan.ts with:

    import { getLanguageSkillStrategy } from "./languageRegistry";
    import type {
      CoachSkillAction,
      ExcludedSkillRule,
      LearnerRuleSelection,
      SkillPlan,
      SkillRoute,
      SkillRule,
      SkillRuleSource
    } from "./types";

    interface AutocompletePlanInput {
      language: string;
      learnerSelection: LearnerRuleSelection;
    }

    interface CoachPlanInput {
      language: string;
      action: CoachSkillAction;
      learnerSelection: LearnerRuleSelection;
    }

    const SOURCE_PRECEDENCE: Record<SkillRuleSource, number> = {
      core: 5,
      output: 4,
      action: 3,
      language: 2,
      learner: 1
    };

    const LAYER_ORDER = {
      head: 0,
      body: 1,
      tail: 2,
      footer: 3
    } as const;

    const COMPACT_CORE_INSTRUCTIONS: Record<string, string> = {
      "core.autocomplete.local-only": "complete local code only",
      "core.autocomplete.no-problem-context": "use visible code only",
      "core.autocomplete.no-full-solution": "do not write a full solution",
      "output.autocomplete.code-only": "code only; maximum three lines"
    };

    export function composeAutocompleteSkillPlan(input: AutocompletePlanInput): SkillPlan {
      const strategy = getLanguageSkillStrategy(input.language);
      return finalizePlan(
        "autocomplete",
        strategy.language,
        [
          coreRule("autocomplete", "core.autocomplete.local-only", "completion.scope", 1000,
            "Return only the smallest immediate continuation justified by visible student code.",
            "prompt-and-validator"),
          coreRule("autocomplete", "core.autocomplete.no-problem-context", "context.problem", 990,
            "Do not use problem statements, teacher packs, reference answers, coach history, or hidden context.",
            "prompt-and-validator"),
          coreRule("autocomplete", "core.autocomplete.no-full-solution", "output.solution-scope", 980,
            "Do not generate a full problem solution or unrelated scaffolding.",
            "prompt-and-validator"),
          ...strategy.autocompleteRules,
          ...input.learnerSelection.rules,
          outputRule("autocomplete", "output.autocomplete.code-only", "output.format", 900,
            "Output code only, without markdown or explanation, in at most three lines.",
            "prompt-and-validator")
        ],
        input.learnerSelection,
        {
          id: "autocomplete.code-only-v1",
          mode: "code-only",
          maxLines: 3
        }
      );
    }

    export function composeCoachSkillPlan(input: CoachPlanInput): SkillPlan {
      const strategy = getLanguageSkillStrategy(input.language);
      return finalizePlan(
        "coach",
        strategy.language,
        [
          coreRule("coach", "core.coach.evidence-only", "context.evidence", 1000,
            "Base the diagnosis on supplied evidence and distinguish observations from inference.",
            "prompt"),
          coreRule("coach", "core.coach.no-answer-leak", "output.solution-scope", 990,
            "Do not reveal a complete solution unless the explicit action is giveUp.",
            "prompt"),
          ...strategy.coachRules,
          ...input.learnerSelection.rules.map((rule) => ({ ...rule, route: "coach" as const })),
          actionRule(input.action),
          outputRule("coach", "output.coach.json", "output.format", 900,
            "Return exactly one valid teaching-diagnosis JSON object in the requested response language.",
            "prompt-and-validator")
        ],
        input.learnerSelection,
        {
          id: "coach.teaching-json-v1",
          mode: "teaching-json",
          responseFormat: "json_object"
        }
      );
    }

    function actionRule(action: CoachSkillAction): SkillRule {
      const instructions: Record<CoachSkillAction, string> = {
        hint: "Give one restrained next-step hint focused on the strongest current evidence.",
        specific: "Narrow the hint to concrete local variables, conditions, loops, returns, or output expressions.",
        followUp: "Answer the student's follow-up while preserving the current teaching boundary.",
        giveUp: "The student explicitly gave up; explain the approach progressively before any complete code.",
        recommend: "Recommend a next exercise from demonstrated needs without inventing performance evidence."
      };
      return {
        id: "action.coach." + action,
        policyKey: "action.coach",
        route: "coach",
        layer: "footer",
        strength: "hard",
        source: "action",
        priority: 850,
        instruction: instructions[action],
        enforcement: "prompt"
      };
    }

    function coreRule(
      route: SkillRoute,
      id: string,
      policyKey: string,
      priority: number,
      instruction: string,
      enforcement: SkillRule["enforcement"]
    ): SkillRule {
      return {
        id,
        policyKey,
        route,
        layer: "head",
        strength: "hard",
        source: "core",
        priority,
        instruction,
        compactInstruction: COMPACT_CORE_INSTRUCTIONS[id],
        enforcement
      };
    }

    function outputRule(
      route: SkillRoute,
      id: string,
      policyKey: string,
      priority: number,
      instruction: string,
      enforcement: SkillRule["enforcement"]
    ): SkillRule {
      return {
        id,
        policyKey,
        route,
        layer: "footer",
        strength: "hard",
        source: "output",
        priority,
        instruction,
        compactInstruction: COMPACT_CORE_INSTRUCTIONS[id],
        enforcement
      };
    }

    function finalizePlan(
      route: SkillRoute,
      language: SkillPlan["language"],
      candidates: SkillRule[],
      learnerSelection: LearnerRuleSelection,
      output: SkillPlan["output"]
    ): SkillPlan {
      const excluded: ExcludedSkillRule[] = [...learnerSelection.excludedRules];
      const byId = new Map<string, SkillRule>();
      for (const candidate of candidates) {
        const previous = byId.get(candidate.id);
        if (!previous || rank(candidate) > rank(previous)) {
          if (previous) {
            excluded.push({ id: previous.id, reason: "conflict" });
          }
          byId.set(candidate.id, candidate);
        } else {
          excluded.push({ id: candidate.id, reason: "conflict" });
        }
      }

      const winners = new Map<string, SkillRule>();
      for (const candidate of byId.values()) {
        const previous = winners.get(candidate.policyKey);
        if (!previous) {
          winners.set(candidate.policyKey, candidate);
          continue;
        }
        if (rank(candidate) > rank(previous)) {
          excluded.push({ id: previous.id, reason: "conflict" });
          winners.set(candidate.policyKey, candidate);
        } else {
          excluded.push({ id: candidate.id, reason: "conflict" });
        }
      }

      const rules = [...winners.values()].sort(
        (left, right) =>
          LAYER_ORDER[left.layer] - LAYER_ORDER[right.layer] ||
          right.priority - left.priority ||
          left.id.localeCompare(right.id)
      );
      return {
        route,
        language,
        rules,
        output,
        audit: {
          route,
          language,
          renderer: "unrendered",
          includedRuleIds: rules.map((rule) => rule.id),
          excludedRules: uniqueExcluded(excluded),
          learnerRuleCount: rules.filter((rule) => rule.source === "learner").length,
          learnerRuleBudget: learnerSelection.budget,
          learnerCharacterCount: rules
            .filter((rule) => rule.source === "learner")
            .reduce((sum, rule) => sum + rule.instruction.length, 0),
          learnerCharacterBudget: learnerSelection.characterBudget,
          enforcementKinds: [...new Set(rules.map((rule) => rule.enforcement))].sort()
        }
      };
    }

    function rank(rule: SkillRule): number {
      return SOURCE_PRECEDENCE[rule.source] * 10000 +
        (rule.strength === "hard" ? 1000 : 0) +
        rule.priority;
    }

    function uniqueExcluded(values: ExcludedSkillRule[]): ExcludedSkillRule[] {
      const seen = new Set<string>();
      return values.filter((item) => {
        const key = item.id + "|" + item.reason;
        if (seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });
    }

- [ ] **Step 4: Verify and commit**

Run:

    npx vitest run test/skillPlan.test.ts test/languageSkillRegistry.test.ts test/habitSelector.test.ts
    npm run compile
    git add src/skills/composeSkillPlan.ts test/skillPlan.test.ts
    git diff --cached --check
    git commit -m "feat: compose routed skill plans"

### Task 4: Normalize provider capabilities in the model routing layer

**Files:**

- Create: src/models/providerCapabilities.ts
- Create: test/providerCapabilities.test.ts
- Modify: src/models/providerContracts.ts
- Modify: src/models/modelRouter.ts
- Modify: test/modelRouter.test.ts

- [ ] **Step 1: Write failing capability tests**

Create test/providerCapabilities.test.ts with:

    import { describe, expect, test } from "vitest";
    import { providerCapabilitiesFor } from "../src/models/providerCapabilities";

    describe("provider capabilities", () => {
      test("recognizes only the real DeepSeek beta completions route as FIM", () => {
        expect(providerCapabilitiesFor({
          format: "openai-completions",
          baseUrl: "https://api.deepseek.com/beta"
        })).toMatchObject({
          renderer: "deepseek-fim",
          requestShape: "fim",
          supportsFimSuffix: true,
          supportsSystemInstruction: false
        });
      });

      test.each([
        ["https://api.deepseek.com/v1", "openai-completions"],
        ["https://proxy.example.test/beta", "openai-completions"],
        ["https://api.deepseek.com/beta", "openai-chat"]
      ] as const)("does not infer FIM from an incomplete match", (baseUrl, format) => {
        expect(providerCapabilitiesFor({ format, baseUrl }).supportsFimSuffix).toBe(false);
      });

      test("normalizes the DeepSeek non-beta configuration issue", () => {
        expect(providerCapabilitiesFor({
          format: "openai-completions",
          baseUrl: "https://api.deepseek.com/v1"
        }).configurationIssue).toBe("deepseek-fim-beta-required");
      });

      test("maps chat, Anthropic, Codex, and generic completions explicitly", () => {
        expect(providerCapabilitiesFor({
          format: "openai-chat",
          baseUrl: "https://api.openai.com/v1"
        }).renderer).toBe("chat-messages");
        expect(providerCapabilitiesFor({
          format: "anthropic-messages",
          baseUrl: "https://api.anthropic.com/v1"
        }).requestShape).toBe("anthropic-messages");
        expect(providerCapabilitiesFor({
          format: "codex-app-server",
          baseUrl: "codex://app-server"
        }).renderer).toBe("codex-text");
        expect(providerCapabilitiesFor({
          format: "openai-completions",
          baseUrl: "https://compatible.example.test/v1"
        }).renderer).toBe("generic-completion");
      });
    });

Append this test to test/modelRouter.test.ts:

    test("attaches normalized capabilities to autocomplete routes", () => {
      const route = routeAutocompleteModel({
        AI_PROVIDER_MODE: "openai-compatible",
        AI_OPENAI_COMPAT_BASE_URL: "https://api.deepseek.com/v1",
        AI_OPENAI_COMPAT_AUTOCOMPLETE_BASE_URL: "https://api.deepseek.com/beta",
        AI_OPENAI_COMPAT_API_KEY: "test-key",
        AI_OPENAI_COMPAT_CHAT_MODEL: "deepseek-v4-pro",
        AI_OPENAI_COMPAT_AUTOCOMPLETE_MODEL: "deepseek-v4-flash",
        AI_OPENAI_COMPAT_AUTOCOMPLETE_FORMAT: "openai-completions"
      });

      expect(route.capabilities.renderer).toBe("deepseek-fim");
      expect(route.capabilities.supportsFimSuffix).toBe(true);
    });

- [ ] **Step 2: Verify red**

Run:

    npx vitest run test/providerCapabilities.test.ts test/modelRouter.test.ts

Expected: FAIL because providerCapabilitiesFor and route.capabilities do not exist.

- [ ] **Step 3: Implement the capability mapping**

Create src/models/providerCapabilities.ts with:

    import type { ModelProtocolFormat } from "./providerContracts";
    import type { ProviderCapabilities } from "../skills/types";

    interface ProviderCapabilityInput {
      format: ModelProtocolFormat;
      baseUrl: string;
    }

    export function providerCapabilitiesFor(input: ProviderCapabilityInput): ProviderCapabilities {
      if (input.format === "codex-app-server") {
        return {
          renderer: "codex-text",
          requestShape: "codex-text",
          supportsSystemInstruction: false,
          supportsFimSuffix: false,
          supportsStopSequences: false,
          prefixCacheFriendly: false
        };
      }
      if (input.format === "openai-chat") {
        return {
          renderer: "chat-messages",
          requestShape: "chat",
          supportsSystemInstruction: true,
          supportsFimSuffix: false,
          supportsStopSequences: true,
          prefixCacheFriendly: false
        };
      }
      if (input.format === "anthropic-messages") {
        return {
          renderer: "chat-messages",
          requestShape: "anthropic-messages",
          supportsSystemInstruction: true,
          supportsFimSuffix: false,
          supportsStopSequences: false,
          prefixCacheFriendly: false
        };
      }
      if (input.format === "openai-completions" && isDeepSeekBeta(input.baseUrl)) {
        return {
          renderer: "deepseek-fim",
          requestShape: "fim",
          supportsSystemInstruction: false,
          supportsFimSuffix: true,
          supportsStopSequences: true,
          prefixCacheFriendly: true
        };
      }
      return {
        renderer: "generic-completion",
        requestShape: "completion",
        supportsSystemInstruction: false,
        supportsFimSuffix: false,
        supportsStopSequences: true,
        prefixCacheFriendly: true,
        ...(input.format === "openai-completions" && isDeepSeekHost(input.baseUrl)
          ? { configurationIssue: "deepseek-fim-beta-required" as const }
          : {})
      };
    }

    function isDeepSeekBeta(baseUrl: string): boolean {
      try {
        const url = new URL(baseUrl);
        return url.hostname.toLowerCase() === "api.deepseek.com" &&
          url.pathname.split("/").filter(Boolean).includes("beta");
      } catch {
        return false;
      }
    }

    function isDeepSeekHost(baseUrl: string): boolean {
      try {
        return new URL(baseUrl).hostname.toLowerCase() === "api.deepseek.com";
      } catch {
        return false;
      }
    }

- [ ] **Step 4: Attach capabilities to every model route**

In src/models/providerContracts.ts, import ProviderCapabilities as a type and add to ModelRoute:

    capabilities: ProviderCapabilities;

In src/models/modelRouter.ts, import providerCapabilitiesFor. Add this field to both HTTP route return objects:

    capabilities: providerCapabilitiesFor({
      format,
      baseUrl: config.baseUrl
    })

Add this field to codexOAuthRoute:

    capabilities: providerCapabilitiesFor({
      format: "codex-app-server",
      baseUrl: "codex://app-server"
    })

The capability layer is the only new layer allowed to inspect provider URL/format. Language rules and renderers consume ProviderCapabilities and must not repeat URL detection.

- [ ] **Step 5: Verify and commit only owned hunks**

Run:

    npx vitest run test/providerCapabilities.test.ts test/modelRouter.test.ts
    npm run compile
    git add src/models/providerCapabilities.ts test/providerCapabilities.test.ts
    git add -p src/models/providerContracts.ts src/models/modelRouter.ts test/modelRouter.test.ts
    git diff --cached --check
    git diff --cached
    git commit -m "feat: normalize provider skill capabilities"

### Task 5: Render SkillPlans for chat, Codex text, generic completions, and DeepSeek FIM

**Files:**

- Create: src/skills/renderers/renderRules.ts
- Create: src/skills/renderers/deepSeekFimRenderer.ts
- Create: src/skills/renderers/messageAutocompleteRenderer.ts
- Create: src/skills/renderers/genericCompletionRenderer.ts
- Create: src/skills/renderers/skillRenderer.ts
- Create: test/skillRenderers.test.ts

- [ ] **Step 1: Write failing renderer tests**

Create test/skillRenderers.test.ts with:

    import { describe, expect, test } from "vitest";
    import {
      composeAutocompleteSkillPlan,
      composeCoachSkillPlan
    } from "../src/skills/composeSkillPlan";
    import {
      renderAutocompleteSkillPlan,
      renderCoachSkillPlan
    } from "../src/skills/renderers/skillRenderer";
    import type { ProviderCapabilities } from "../src/skills/types";

    const deepSeek: ProviderCapabilities = {
      renderer: "deepseek-fim",
      requestShape: "fim",
      supportsSystemInstruction: false,
      supportsFimSuffix: true,
      supportsStopSequences: true,
      prefixCacheFriendly: true
    };

    const chat: ProviderCapabilities = {
      renderer: "chat-messages",
      requestShape: "chat",
      supportsSystemInstruction: true,
      supportsFimSuffix: false,
      supportsStopSequences: true,
      prefixCacheFriendly: false
    };

    const codex: ProviderCapabilities = {
      renderer: "codex-text",
      requestShape: "codex-text",
      supportsSystemInstruction: false,
      supportsFimSuffix: false,
      supportsStopSequences: false,
      prefixCacheFriendly: false
    };

    const genericCompletion: ProviderCapabilities = {
      renderer: "generic-completion",
      requestShape: "completion",
      supportsSystemInstruction: false,
      supportsFimSuffix: false,
      supportsStopSequences: true,
      prefixCacheFriendly: true
    };

    function learnerSelection(route: "coach" | "autocomplete") {
      const instruction =
        "Check the first and last valid loop or range boundary before continuing.";
      return {
        budget: route === "autocomplete" ? 2 : 3,
        characterBudget: route === "autocomplete" ? 240 : 480,
        usedCharacters: instruction.length,
        excludedRules: [],
        rules: [{
          id: "learner.loop-boundary",
          policyKey: "habit.loop-boundary",
          route,
          layer: "tail" as const,
          strength: "soft" as const,
          source: "learner" as const,
          priority: 300,
          instruction,
          enforcement: "prompt" as const,
          language: "python" as const
        }]
      };
    }

    describe("skill renderers", () => {
      test("DeepSeek FIM keeps the exact suffix and uses Python comments", () => {
        const plan = composeAutocompleteSkillPlan({
          language: "python",
          learnerSelection: learnerSelection("autocomplete")
        });
        const rendered = renderAutocompleteSkillPlan(plan, deepSeek, {
          prefix: "for i in range(n):\n    ",
          suffix: "\nprint(total)",
          language: "python",
          fileLabel: "practice/luogu/problem.py"
        });

        expect(rendered.prompt).toContain("# skill head:");
        expect(rendered.prompt).toContain("# skill tail:");
        expect(rendered.prompt).toEndWith("for i in range(n):\n    ");
        expect(rendered.suffix).toBe("\nprint(total)");
        expect(rendered.systemInstruction).toBeUndefined();
        expect(rendered.audit.renderer).toBe("deepseek-fim");
      });

      test("DeepSeek generic language adds no synthetic preamble", () => {
        const plan = composeAutocompleteSkillPlan({
          language: "plaintext",
          learnerSelection: {
            budget: 2,
            characterBudget: 240,
            usedCharacters: 0,
            excludedRules: [],
            rules: []
          }
        });
        const rendered = renderAutocompleteSkillPlan(plan, deepSeek, {
          prefix: "alpha = ",
          suffix: "\nomega()",
          language: "generic",
          fileLabel: "current-file"
        });

        expect(rendered.prompt).toBe("alpha = ");
        expect(rendered.suffix).toBe("\nomega()");
      });

      test("chat preserves logical layer order and embeds suffix in the user prompt", () => {
        const plan = composeAutocompleteSkillPlan({
          language: "python",
          learnerSelection: learnerSelection("autocomplete")
        });
        const rendered = renderAutocompleteSkillPlan(plan, chat, {
          prefix: "value = items[",
          suffix: "]\nprint(value)",
          language: "python",
          fileLabel: "trial.py"
        });
        const system = rendered.systemInstruction ?? "";

        expect(system.indexOf("[head]")).toBeLessThan(system.indexOf("[body]"));
        expect(system.indexOf("[body]")).toBeLessThan(system.indexOf("[tail]"));
        expect(system.indexOf("[tail]")).toBeLessThan(system.indexOf("[footer]"));
        expect(rendered.prompt).toContain("<suffix>\n]\nprint(value)\n</suffix>");
        expect(rendered.suffix).toBeUndefined();
      });

      test("coach puts learner habits before the action/output footer", () => {
        const plan = composeCoachSkillPlan({
          language: "python",
          action: "specific",
          learnerSelection: learnerSelection("coach")
        });
        const rendered = renderCoachSkillPlan(plan, chat, "diagnosis-context-json");
        const system = rendered.messages[0].content;
        const user = rendered.messages[1].content;

        expect(system).toContain("[head]");
        expect(system).toContain("[body]");
        expect(system).not.toContain("[tail]");
        expect(system).not.toContain("[footer]");
        expect(user.indexOf("diagnosis-context-json")).toBeLessThan(user.indexOf("[tail]"));
        expect(user.indexOf("[tail]")).toBeLessThan(user.indexOf("[footer]"));
        expect(user.trimEnd()).toEndWith("</action-output-footer>");
      });

      test("Codex text carries policy and both cursor sides in one prompt", () => {
        const plan = composeAutocompleteSkillPlan({
          language: "cpp",
          learnerSelection: {
            budget: 2,
            characterBudget: 240,
            usedCharacters: 0,
            excludedRules: [],
            rules: []
          }
        });
        const rendered = renderAutocompleteSkillPlan(plan, codex, {
          prefix: "value = items[",
          suffix: "];",
          language: "cpp",
          fileLabel: "src/main.cpp"
        });

        expect(rendered.prompt).toContain("<skill-policy>");
        expect(rendered.prompt).toContain("<suffix>\n];\n</suffix>");
        expect(rendered.audit.renderer).toBe("codex-text");
      });

      test("generic completions preserve stable file/language context and omit suffix", () => {
        const plan = composeAutocompleteSkillPlan({
          language: "python",
          learnerSelection: learnerSelection("autocomplete")
        });
        const rendered = renderAutocompleteSkillPlan(plan, genericCompletion, {
          prefix: "for i in range(n):\n    ",
          suffix: "\nprint(total)",
          language: "python",
          fileLabel: "practice/luogu/problem.py"
        });

        expect(rendered.prompt).toContain("Language: python");
        expect(rendered.prompt).toContain("File: practice/luogu/problem.py");
        expect(rendered.prompt).toContain("[tail]");
        expect(rendered.prompt).not.toContain("print(total)");
        expect(rendered.suffix).toBeUndefined();
      });
    });

- [ ] **Step 2: Verify red**

Run:

    npx vitest run test/skillRenderers.test.ts

Expected: FAIL because the renderer modules do not exist.

- [ ] **Step 3: Add ordered rule rendering and audit stamping**

Create src/skills/renderers/renderRules.ts:

    import type {
      SkillPlan,
      SkillPlanAudit,
      SkillRendererId
    } from "../types";

    export function renderOrderedRuleBlock(plan: SkillPlan): string {
      return plan.rules
        .map((rule) => "[" + rule.layer + "] " + rule.instruction)
        .join("\n");
    }

    export function stampRenderer(
      plan: SkillPlan,
      renderer: Exclude<SkillRendererId, "unrendered">
    ): SkillPlanAudit {
      return {
        ...plan.audit,
        renderer
      };
    }

- [ ] **Step 4: Add the DeepSeek FIM renderer**

Create src/skills/renderers/deepSeekFimRenderer.ts:

    import { getLanguageSkillStrategy } from "../languageRegistry";
    import type {
      AutocompleteSkillContext,
      RenderedAutocompleteSkillRequest,
      SkillPlan
    } from "../types";
    import { stampRenderer } from "./renderRules";

    export function renderDeepSeekFim(
      plan: SkillPlan,
      context: AutocompleteSkillContext
    ): RenderedAutocompleteSkillRequest {
      const strategy = getLanguageSkillStrategy(plan.language);
      const prompt = strategy.commentPrefix
        ? plan.rules
            .map((rule) =>
              strategy.commentPrefix + " skill " + rule.layer + ": " + rule.instruction
            )
            .join("\n") + "\n" + context.prefix
        : context.prefix;

      return {
        prompt,
        suffix: context.suffix,
        stop: strategy.stopSequences,
        maxLines: plan.output.maxLines ?? 3,
        audit: stampRenderer(plan, "deepseek-fim")
      };
    }

The exact context.suffix is assigned directly. Do not trim, normalize line endings, add markers, or generate a substitute suffix.

- [ ] **Step 5: Add message, Codex, and generic completion renderers**

Create src/skills/renderers/messageAutocompleteRenderer.ts:

    import type {
      AutocompleteSkillContext,
      RenderedAutocompleteSkillRequest,
      SkillPlan
    } from "../types";
    import { getLanguageSkillStrategy } from "../languageRegistry";
    import { renderOrderedRuleBlock, stampRenderer } from "./renderRules";

    export function renderMessageAutocomplete(
      plan: SkillPlan,
      context: AutocompleteSkillContext
    ): RenderedAutocompleteSkillRequest {
      return {
        systemInstruction: renderOrderedRuleBlock(plan),
        prompt: [
          "Language: " + plan.language,
          "File: " + context.fileLabel,
          "<prefix>",
          context.prefix,
          "</prefix>",
          "<suffix>",
          context.suffix,
          "</suffix>"
        ].join("\n"),
        stop: getLanguageSkillStrategy(plan.language).stopSequences,
        maxLines: plan.output.maxLines ?? 3,
        audit: stampRenderer(plan, "chat-messages")
      };
    }

Create src/skills/renderers/genericCompletionRenderer.ts:

    import type {
      AutocompleteSkillContext,
      RenderedAutocompleteSkillRequest,
      SkillPlan
    } from "../types";
    import { getLanguageSkillStrategy } from "../languageRegistry";
    import { renderOrderedRuleBlock, stampRenderer } from "./renderRules";

    export function renderCodexText(
      plan: SkillPlan,
      context: AutocompleteSkillContext
    ): RenderedAutocompleteSkillRequest {
      return {
        prompt: [
          "<skill-policy>",
          renderOrderedRuleBlock(plan),
          "</skill-policy>",
          "Language: " + plan.language,
          "File: " + context.fileLabel,
          "<prefix>",
          context.prefix,
          "</prefix>",
          "<suffix>",
          context.suffix,
          "</suffix>"
        ].join("\n"),
        maxLines: plan.output.maxLines ?? 3,
        audit: stampRenderer(plan, "codex-text")
      };
    }

    export function renderGenericCompletion(
      plan: SkillPlan,
      context: AutocompleteSkillContext
    ): RenderedAutocompleteSkillRequest {
      return {
        prompt: [
          renderOrderedRuleBlock(plan),
          "Language: " + plan.language,
          "File: " + context.fileLabel,
          context.prefix
        ].join("\n"),
        stop: getLanguageSkillStrategy(plan.language).stopSequences,
        maxLines: plan.output.maxLines ?? 3,
        audit: stampRenderer(plan, "generic-completion")
      };
    }

Generic completion intentionally omits context.suffix because the capability says the endpoint cannot consume a real FIM suffix.

- [ ] **Step 6: Add the dispatcher and coach renderer**

Create src/skills/renderers/skillRenderer.ts:

    import type {
      AutocompleteSkillContext,
      ProviderCapabilities,
      RenderedAutocompleteSkillRequest,
      RenderedCoachSkillRequest,
      SkillPlan
    } from "../types";
    import { renderDeepSeekFim } from "./deepSeekFimRenderer";
    import {
      renderCodexText,
      renderGenericCompletion
    } from "./genericCompletionRenderer";
    import { renderMessageAutocomplete } from "./messageAutocompleteRenderer";
    import { stampRenderer } from "./renderRules";

    export function renderAutocompleteSkillPlan(
      plan: SkillPlan,
      capabilities: ProviderCapabilities,
      context: AutocompleteSkillContext
    ): RenderedAutocompleteSkillRequest {
      if (plan.route !== "autocomplete") {
        throw new Error("Autocomplete renderer received a coach SkillPlan.");
      }
      if (plan.language !== context.language) {
        throw new Error("Autocomplete SkillPlan language does not match its context.");
      }
      if (capabilities.renderer === "deepseek-fim") {
        return renderDeepSeekFim(plan, context);
      }
      if (capabilities.renderer === "chat-messages") {
        return renderMessageAutocomplete(plan, context);
      }
      if (capabilities.renderer === "codex-text") {
        return renderCodexText(plan, context);
      }
      return renderGenericCompletion(plan, context);
    }

    export function renderCoachSkillPlan(
      plan: SkillPlan,
      capabilities: ProviderCapabilities,
      userPrompt: string
    ): RenderedCoachSkillRequest {
      if (plan.route !== "coach") {
        throw new Error("Coach renderer received an autocomplete SkillPlan.");
      }
      const systemRules = plan.rules.filter(
        (rule) => rule.layer === "head" || rule.layer === "body"
      );
      const learnerRules = plan.rules.filter((rule) => rule.layer === "tail");
      const footerRules = plan.rules.filter((rule) => rule.layer === "footer");
      const renderRules = (rules: SkillPlan["rules"]): string =>
        rules.map((rule) => "[" + rule.layer + "] " + rule.instruction).join("\n");
      return {
        messages: [
          {
            role: "system",
            content: renderRules(systemRules)
          },
          {
            role: "user",
            content: [
              userPrompt,
              ...(learnerRules.length > 0
                ? ["<learner-tail>", renderRules(learnerRules), "</learner-tail>"]
                : []),
              "<action-output-footer>",
              renderRules(footerRules),
              "</action-output-footer>"
            ].join("\n")
          }
        ],
        audit: stampRenderer(plan, capabilities.renderer)
      };
    }

- [ ] **Step 7: Verify and commit**

Run:

    npx vitest run test/skillRenderers.test.ts test/skillPlan.test.ts
    npm run compile
    git add src/skills/renderers test/skillRenderers.test.ts
    git diff --cached --check
    git commit -m "feat: render skills for provider protocols"

### Task 6: Let the completion transport consume rendered policy and normalized capabilities

**Files:**

- Modify: src/models/completionsClient.ts
- Modify: test/completionsClient.test.ts
- Verify: test/autocomplete.test.ts
- Verify: test/codexOAuthRouting.test.ts

- [ ] **Step 1: Add failing transport tests**

Append to test/completionsClient.test.ts:

    test("uses the rendered system instruction for chat autocomplete", async () => {
      const calls: Array<{ init?: RequestInit }> = [];
      const fakeFetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        calls.push({ init });
        return new Response(JSON.stringify({
          choices: [{ message: { content: "return value" } }]
        }), { status: 200 });
      };

      await requestCompletion(
        {
          format: "openai-chat",
          baseUrl: "https://api.example.test/v1",
          apiKey: "test-key",
          model: "chat-model"
        },
        {
          systemInstruction: "[head] local code only",
          prompt: "<prefix>\nvalue = \n</prefix>",
          maxTokens: 64,
          temperature: 0
        },
        fakeFetch as typeof fetch
      );

      const body = JSON.parse(String(calls[0].init?.body));
      expect(body.messages[0]).toEqual({
        role: "system",
        content: "[head] local code only"
      });
    });

    test("uses normalized capabilities rather than re-detecting suffix support", async () => {
      const calls: Array<{ init?: RequestInit }> = [];
      const fakeFetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        calls.push({ init });
        return new Response(JSON.stringify({ choices: [{ text: "value" }] }), { status: 200 });
      };

      await requestCompletion(
        {
          format: "openai-completions",
          baseUrl: "https://api.deepseek.com/beta",
          apiKey: "test-key",
          model: "deepseek-v4-flash"
        },
        {
          capabilities: {
            renderer: "generic-completion",
            requestShape: "completion",
            supportsSystemInstruction: false,
            supportsFimSuffix: false,
            supportsStopSequences: true,
            prefixCacheFriendly: true
          },
          prompt: "value = ",
          suffix: "\nprint(value)",
          maxTokens: 64,
          temperature: 0
        },
        fakeFetch as typeof fetch
      );

      expect(JSON.parse(String(calls[0].init?.body))).not.toHaveProperty("suffix");
    });

    test("uses the rendered system instruction for Anthropic autocomplete", async () => {
      const calls: Array<{ init?: RequestInit }> = [];
      const fakeFetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        calls.push({ init });
        return new Response(JSON.stringify({
          content: [{ type: "text", text: "return value" }]
        }), { status: 200 });
      };

      await requestCompletion(
        {
          format: "anthropic-messages",
          baseUrl: "https://api.anthropic.com/v1",
          apiKey: "test-key",
          model: "claude-fast"
        },
        {
          systemInstruction: "[head] local code only",
          prompt: "<prefix>\nvalue = \n</prefix>",
          maxTokens: 64,
          temperature: 0
        },
        fakeFetch as typeof fetch
      );

      expect(JSON.parse(String(calls[0].init?.body)).system)
        .toBe("[head] local code only");
    });

- [ ] **Step 2: Verify red**

Run:

    npx vitest run test/completionsClient.test.ts

Expected: the custom system instruction test fails and CompletionRequest does not accept capabilities.

- [ ] **Step 3: Extend CompletionRequest**

In src/models/completionsClient.ts, add type imports for ProviderCapabilities and providerCapabilitiesFor. Add these optional fields:

    systemInstruction?: string;
    capabilities?: ProviderCapabilities;

At the start of requestCompletion, derive the one capability object used for the whole request:

    const capabilities = request.capabilities ?? providerCapabilitiesFor({
      format: config.format ?? "openai-completions",
      baseUrl: "baseUrl" in config ? config.baseUrl : "codex://app-server"
    });

Pass capabilities to the HTTP completions suffix decision. Replace shouldSendFimSuffix with:

    function shouldSendFimSuffix(
      capabilities: ProviderCapabilities,
      request: CompletionRequest
    ): boolean {
      return Boolean(request.suffix && capabilities.supportsFimSuffix);
    }

The OpenAI completions body must use:

    ...(shouldSendFimSuffix(capabilities, request) ? { suffix: request.suffix } : {})

- [ ] **Step 4: Use rendered system policy in message protocols**

For OpenAI chat, replace the hard-coded system content with:

    content: request.systemInstruction ??
      "Return only the immediate code continuation. Do not explain."

For Anthropic Messages, replace the hard-coded system value with:

    system: request.systemInstruction ??
      "Return only the immediate code continuation. Do not explain."

Keep the defaults for legacy callers.

Update serializeCompletionPrompt so a direct Codex caller can also supply a system instruction:

    function serializeCompletionPrompt(request: CompletionRequest): string {
      const sections: string[] = [];
      if (request.systemInstruction) {
        sections.push("<system>", request.systemInstruction, "</system>");
      }
      sections.push(request.prompt);
      if (request.suffix !== undefined) {
        sections.push("<suffix>", request.suffix, "</suffix>");
      }
      return sections.join("\n");
    }

- [ ] **Step 5: Verify legacy and new transport behavior**

Run:

    npx vitest run test/completionsClient.test.ts test/autocomplete.test.ts test/codexOAuthRouting.test.ts
    npm run compile

Expected:

- Existing DeepSeek beta test still sends suffix through fallback capability derivation.
- Non-FIM endpoint still omits suffix.
- OpenAI chat and Anthropic still return text.
- Codex OAuth still serializes its request.

- [ ] **Step 6: Commit**

Run:

    git add src/models/completionsClient.ts test/completionsClient.test.ts
    git diff --cached --check
    git commit -m "feat: send rendered autocomplete policy"

### Task 7: Add output validation and the detailed autocomplete pipeline

**Files:**

- Create: src/skills/validators/autocompleteOutputPolicy.ts
- Create: test/autocompleteOutputPolicy.test.ts
- Create: src/autocomplete/fileLabel.ts
- Create: test/autocompleteFileLabel.test.ts
- Modify: src/autocomplete/mimoAutocomplete.ts
- Modify: test/mimoAutocomplete.test.ts
- Verify unchanged: src/autocomplete/prompt.ts
- Verify unchanged: test/autocomplete.test.ts

- [ ] **Step 1: Write failing validator tests**

Create test/autocompleteOutputPolicy.test.ts with:

    import { describe, expect, test } from "vitest";
    import { validateAutocompleteOutput } from "../src/skills/validators/autocompleteOutputPolicy";

    describe("autocomplete output policy", () => {
      test("distinguishes an empty model response", () => {
        expect(validateAutocompleteOutput("", 3, "python")).toEqual({
          status: "model-empty",
          suggestion: ""
        });
      });

      test("rejects explanations without returning their text", () => {
        expect(validateAutocompleteOutput("Here is the code:\nreturn value", 3, "python")).toEqual({
          status: "validator-rejected",
          suggestion: "",
          rejectionReason: "explanation"
        });
      });

      test("classifies a fully filtered prompt echo as validator rejection", () => {
        expect(validateAutocompleteOutput("# Problem: hidden statement", 3, "python")).toEqual({
          status: "validator-rejected",
          suggestion: "",
          rejectionReason: "empty-after-filter"
        });
      });

      test("keeps at most three contiguous code lines", () => {
        expect(validateAutocompleteOutput(
          "if value:\n    total += value\nreturn total\nprint(total)",
          3,
          "python"
        )).toEqual({
          status: "success",
          suggestion: "if value:\n    total += value\nreturn total"
        });
      });

      test("strips an echoed language-native skill preamble", () => {
        expect(validateAutocompleteOutput(
          "// skill tail: controlled rule\ntotal += values[i];",
          3,
          "cpp"
        )).toEqual({
          status: "success",
          suggestion: "total += values[i];"
        });
      });
    });

- [ ] **Step 2: Verify red**

Run:

    npx vitest run test/autocompleteOutputPolicy.test.ts

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement the validator with stable rejection reasons**

Create src/skills/validators/autocompleteOutputPolicy.ts:

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

    const EXPLANATION = /^(here(?:'s| is)|explanation|the code|下面|解释|代码如下)\b/i;
    const CONTEXT_MARKER =
      /<(?:prefix|suffix|skill-policy|system)>|(?:problem statement|reference answer|teacher pack|标准答案|参考答案|题面)/i;

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
      const withoutPreamble = commentPrefix
        ? raw
            .split(/\r?\n/)
            .filter((line) =>
              !line.trimStart().toLowerCase().startsWith(commentPrefix + " skill ")
            )
            .join("\n")
        : raw;
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

    Do not include raw response text in the rejection result or error/status event.

- [ ] **Step 4: Extract and test the permitted sanitized file label**

Create test/autocompleteFileLabel.test.ts:

    import { describe, expect, test } from "vitest";
    import { stableAutocompleteFileLabel } from "../src/autocomplete/fileLabel";

    describe("autocomplete file label", () => {
      test("masks problem IDs and absolute parents in practice files", () => {
        expect(stableAutocompleteFileLabel(
          "C:\\Users\\Ada\\practice\\luogu\\P1030.py"
        )).toBe("practice/luogu/problem.py");
      });

      test("keeps only a stable tail for ordinary files", () => {
        expect(stableAutocompleteFileLabel(
          "C:\\Users\\Ada\\project\\src\\solution.cpp"
        )).toBe("src/solution.cpp");
      });
    });

Run:

    npx vitest run test/autocompleteFileLabel.test.ts

Expected: FAIL because src/autocomplete/fileLabel.ts does not exist.

Create src/autocomplete/fileLabel.ts with:

    export function stableAutocompleteFileLabel(filePath: string): string {
      const parts = filePath
        .split(/[\\/]+/)
        .map((part) => part.trim())
        .filter(Boolean);
      let practiceIndex = -1;
      for (let index = parts.length - 1; index >= 0; index -= 1) {
        if (parts[index].toLowerCase() === "practice") {
          practiceIndex = index;
          break;
        }
      }
      if (practiceIndex >= 0 && parts.length > practiceIndex + 1) {
        const platform = sanitizePart(parts[practiceIndex + 1]);
        const extension = fileExtension(parts.at(-1) ?? "");
        return ["practice", platform || "source", "problem" + extension].join("/");
      }

      const fileName = parts.at(-1);
      if (fileName && /^[A-Z]\d+\.[A-Za-z0-9]+$/i.test(fileName)) {
        return "problem" + fileExtension(fileName);
      }
      return parts.slice(-2).map(sanitizePart).join("/") || "current-file";
    }

    function sanitizePart(value: string): string {
      return value.replace(/[^A-Za-z0-9._-]/g, "_")
        .replace(/^_+|_+$/g, "") || "path";
    }

    function fileExtension(fileName: string): string {
      const match = fileName.match(/(\.[A-Za-z0-9]+)$/);
      return match ? match[1] : "";
    }

- [ ] **Step 5: Write failing detailed-pipeline tests**

Extend test/mimoAutocomplete.test.ts imports with:

    import { requestMimoAutocompleteDetailed } from "../src/autocomplete/mimoAutocomplete";
    import { createEmptyStudentSkill } from "../src/teaching/studentSkill";

Append:

    test("uses a composed Python tail and exact DeepSeek FIM suffix", async () => {
      const calls: Array<{ init?: RequestInit }> = [];
      const fakeFetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        calls.push({ init });
        return new Response(JSON.stringify({
          choices: [{ text: "total += values[i]" }]
        }), { status: 200 });
      };
      const skill = createEmptyStudentSkill("student-a", "2026-07-14T00:00:00.000Z");
      skill.codeHabits.languageRules.python = ["Check loop boundary."];

      const result = await requestMimoAutocompleteDetailed(
        {
          format: "openai-completions",
          baseUrl: "https://api.deepseek.com/beta",
          apiKey: "test-key",
          model: "deepseek-v4-flash"
        },
        {
          prefix: "for i in range(n):\n    ",
          suffix: "\nprint(total)",
          language: "python",
          filePath: "C:\\private\\P1030.py",
          studentSkill: skill
        },
        fakeFetch as typeof fetch
      );
      const body = JSON.parse(String(calls[0].init?.body));

      expect(body.prompt).toContain("# skill tail:");
      expect(body.suffix).toBe("\nprint(total)");
      expect(result.status).toBe("success");
      expect(result.suggestion).toBe("total += values[i]");
      expect(JSON.stringify(result.audit)).not.toContain("P1030");
      expect(JSON.stringify(result.audit)).not.toContain("for i");
    });

    test("reports validator rejection separately from model-empty", async () => {
      let calls = 0;
      const fakeFetch = async (): Promise<Response> => {
        calls += 1;
        return new Response(JSON.stringify({
          choices: [{ text: "Here is the code:\nreturn answer" }]
        }), { status: 200 });
      };

      const result = await requestMimoAutocompleteDetailed(
        {
          baseUrl: "https://api.example.test/v1",
          apiKey: "test-key",
          model: "completion-model"
        },
        {
          prefix: "def solve():\n    ",
          suffix: "",
          language: "python",
          filePath: "solution.py"
        },
        fakeFetch as typeof fetch
      );

      expect(result).toMatchObject({
        status: "validator-rejected",
        suggestion: "",
        rejectionReason: "explanation"
      });
      expect(calls).toBe(1);
    });

- [ ] **Step 6: Replace production prompt construction with compose-render-validate**

In src/autocomplete/mimoAutocomplete.ts:

1. Remove the buildMimoAutocompletePrompt import.
2. Keep habits?: string[] for source compatibility, but mark it deprecated in a comment and route it through the controlled selector.
3. Add optional studentSkill and capabilities fields.
4. Add a detailed result and make the old function a wrapper.

Use this public surface:

    import { requestCompletion, type CompletionProviderConfig } from "../models/completionsClient";
    import { providerCapabilitiesFor } from "../models/providerCapabilities";
    import { stableAutocompleteFileLabel } from "./fileLabel";
    import { composeAutocompleteSkillPlan } from "../skills/composeSkillPlan";
    import { selectLearnerRules } from "../skills/habitSelector";
    import { renderAutocompleteSkillPlan } from "../skills/renderers/skillRenderer";
    import type {
      ProviderCapabilities,
      SkillPlanAudit
    } from "../skills/types";
    import {
      validateAutocompleteOutput,
      type AutocompleteRejectionReason,
      type AutocompleteValidationStatus
    } from "../skills/validators/autocompleteOutputPolicy";
    import {
      createEmptyStudentSkill,
      type StudentSkill
    } from "../teaching/studentSkill";

    export interface MimoAutocompleteInput {
      prefix: string;
      suffix: string;
      language: string;
      filePath: string;
      studentSkill?: StudentSkill;
      capabilities?: ProviderCapabilities;
      habits?: string[];
      signal?: AbortSignal;
    }

    export interface MimoAutocompleteResult {
      suggestion: string;
      status: AutocompleteValidationStatus;
      rejectionReason?: AutocompleteRejectionReason;
      audit: SkillPlanAudit;
    }

    export async function requestMimoAutocompleteDetailed(
      config: CompletionProviderConfig,
      input: MimoAutocompleteInput,
      fetchImpl: typeof fetch = fetch
    ): Promise<MimoAutocompleteResult> {
      const skill = input.studentSkill ?? skillFromLegacyHabits(input.habits);
      const learnerSelection = selectLearnerRules({
        skill,
        route: "autocomplete",
        language: input.language,
        localCode: input.prefix
      });
      const plan = composeAutocompleteSkillPlan({
        language: input.language,
        learnerSelection
      });
      const capabilities = input.capabilities ?? providerCapabilitiesFor({
        format: config.format ?? "openai-completions",
        baseUrl: "baseUrl" in config ? config.baseUrl : "codex://app-server"
      });
      const rendered = renderAutocompleteSkillPlan(plan, capabilities, {
        prefix: input.prefix,
        suffix: input.suffix,
        language: plan.language,
        fileLabel: stableAutocompleteFileLabel(input.filePath)
      });
      const raw = await requestCompletion(
        config,
        {
          prompt: rendered.prompt,
          systemInstruction: rendered.systemInstruction,
          suffix: rendered.suffix,
          stop: capabilities.supportsStopSequences ? rendered.stop : undefined,
          capabilities,
          maxTokens: 64,
          temperature: 0.1,
          signal: input.signal
        },
        fetchImpl
      );
      const validation = validateAutocompleteOutput(
        raw,
        rendered.maxLines,
        plan.language
      );
      return {
        ...validation,
        audit: rendered.audit
      };
    }

    export async function requestMimoAutocomplete(
      config: CompletionProviderConfig,
      input: MimoAutocompleteInput,
      fetchImpl: typeof fetch = fetch
    ): Promise<string> {
      return (await requestMimoAutocompleteDetailed(config, input, fetchImpl)).suggestion;
    }

    function skillFromLegacyHabits(habits: string[] | undefined): StudentSkill {
      const skill = createEmptyStudentSkill("legacy-autocomplete");
      skill.codeHabits.globalRules = [...(habits ?? [])];
      return skill;
    }

The absolute filePath remains a caller input only. The renderer/model may receive stableAutocompleteFileLabel(filePath); audit and result must not receive either the absolute path or sanitized label.

- [ ] **Step 7: Keep legacy prompt helpers isolated**

Run:

    rg -n "buildMimoAutocompletePrompt" src

Expected: only src/autocomplete/prompt.ts defines it; no production request path imports it. Do not edit src/autocomplete/prompt.ts or test/autocomplete.test.ts in this task.

- [ ] **Step 8: Verify and commit**

Run:

    npx vitest run test/autocompleteOutputPolicy.test.ts test/autocompleteFileLabel.test.ts test/mimoAutocomplete.test.ts test/autocomplete.test.ts test/completionsClient.test.ts
    npm run compile
    git add src/skills/validators/autocompleteOutputPolicy.ts test/autocompleteOutputPolicy.test.ts
    git add src/autocomplete/fileLabel.ts test/autocompleteFileLabel.test.ts
    git add src/autocomplete/mimoAutocomplete.ts test/mimoAutocomplete.test.ts
    git diff --cached --check
    git commit -m "feat: validate composed autocomplete results"

### Task 8: Feed StudentSkill into inline completion and expose validator rejection

**Files:**

- Modify: src/autocomplete/inlineProvider.ts
- Modify: src/extension.ts
- Create: test/inlineProviderSkillIntegration.test.ts

- [ ] **Step 1: Write a failing integration-boundary test**

Create test/inlineProviderSkillIntegration.test.ts:

    import { readFile } from "node:fs/promises";
    import { describe, expect, test } from "vitest";

    describe("inline provider skill integration", () => {
      test("loads StudentSkill, passes route capabilities, and distinguishes rejection", async () => {
        const provider = await readFile("src/autocomplete/inlineProvider.ts", "utf8");
        const extension = await readFile("src/extension.ts", "utf8");

        expect(provider).toContain("requestMimoAutocompleteDetailed");
        expect(provider).toContain("studentSkill:");
        expect(provider).toContain("capabilities: route.capabilities");
        expect(provider).toContain('type: "rejected"');
        expect(extension).toContain("createStudentAutocompleteStoragePaths");
        expect(extension).toContain("loadStudentSkill(storagePaths.studentSkill)");
        expect(extension).toContain('event.type === "rejected"');
      });
    });

- [ ] **Step 2: Verify red**

Run:

    npx vitest run test/inlineProviderSkillIntegration.test.ts

Expected: FAIL because inline completion still calls the string-only wrapper and extension does not load StudentSkill.

- [ ] **Step 3: Change the provider to keep the complete route**

In src/autocomplete/inlineProvider.ts:

- Replace requestMimoAutocomplete with requestMimoAutocompleteDetailed.
- Import StudentSkill as a type.
- Extend InlineCompletionEvent.type to:

    "request" | "success" | "empty" | "rejected" | "error"

- Add this required option:

    loadStudentSkill: () => Promise<StudentSkill>;

- Rename loadConfig to loadRoute and return routeAutocompleteModel rather than route.config.
- Inside the request block, load route and StudentSkill before the model call:

    const route = await loadRoute();
    const studentSkill = await options.loadStudentSkill();
    const result = await requestMimoAutocompleteDetailed(route.config, {
      ...input,
      studentSkill,
      capabilities: route.capabilities,
      signal: abortController.signal
    });

- Remove the hard-coded habits array.
- Replace suggestion references with result.suggestion.
- Handle statuses before caching:

    if (result.status === "model-empty") {
      options.onEvent?.({
        type: "empty",
        message: "The autocomplete model returned no continuation."
      });
      return [];
    }
    if (result.status === "validator-rejected") {
      options.onEvent?.({
        type: "rejected",
        message: "Autocomplete output rejected by policy: " +
          (result.rejectionReason ?? "unknown")
      });
      return [];
    }

Only status and stable rejectionReason may enter the event. Do not add result.audit, prefix, suffix, response text, or file content to the event.

- [ ] **Step 4: Wire the StudentSkill loader and rejected status bar**

In src/extension.ts, import:

    import { createStudentAutocompleteStoragePaths } from "./storage/StoragePaths";
    import { loadStudentSkill } from "./teaching/studentSkillStore";

After the internal recorder is created, add:

    const storagePaths = createStudentAutocompleteStoragePaths(
      context.globalStorageUri.fsPath
    );

Pass this option to createMimoInlineCompletionProvider:

    loadStudentSkill: () => loadStudentSkill(storagePaths.studentSkill),

Add a status branch before the generic error branch:

    } else if (event.type === "rejected") {
      autocompleteStatus.text = "$(shield) AI 补全已拦截";
      autocompleteStatus.tooltip = event.message;

The existing request, success, empty, and error behavior stays intact.

- [ ] **Step 5: Verify with focused tests**

Run:

    npx vitest run test/inlineProviderSkillIntegration.test.ts test/mimoAutocomplete.test.ts test/context.test.ts test/autocompleteRequestGate.test.ts
    npm run compile

Expected: all tests pass; TypeScript proves the new required loader is supplied.

- [ ] **Step 6: Stage the dirty provider safely and commit**

Run:

    git diff -- src/autocomplete/inlineProvider.ts
    git add -p src/autocomplete/inlineProvider.ts
    git add src/extension.ts test/inlineProviderSkillIntegration.test.ts
    git diff --cached --check
    git diff --cached

Confirm the staged inlineProvider diff contains only:

- detailed request import/call;
- route capabilities;
- StudentSkill loader;
- rejected status;
- removal of hard-coded habits.

Do not stage the earlier trigger/gating fix unless it is already separately committed and intentionally part of this branch.

Run:

    git commit -m "feat: apply learner skills to ghost text"

### Task 9: Apply the same composition model to coach without mixing route contexts

**Files:**

- Modify: src/teaching/mimoTeacher.ts
- Modify: test/mimoTeacher.test.ts
- Modify: src/sidebar/ProblemBankViewProvider.ts
- Verify unchanged: src/teaching/teachingPrompt.ts
- Verify: test/teachingPrompt.test.ts
- Verify: test/teachingWorkflow.test.ts

- [ ] **Step 1: Write a failing coach skill test**

Extend test/mimoTeacher.test.ts imports with:

    import { requestMimoTeachingDiagnosisWithSkills } from "../src/teaching/mimoTeacher";
    import { createEmptyStudentSkill } from "../src/teaching/studentSkill";
    import type { SkillPlanAudit } from "../src/skills/types";

Append:

    test("renders controlled learner habits in the coach tail before the action footer", async () => {
      const calls: Array<{ init?: RequestInit }> = [];
      const fakeFetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        calls.push({ init });
        return new Response(JSON.stringify({
          choices: [{
            message: {
              content: JSON.stringify({
                pain_points: [{
                  label: "loop_boundary",
                  confidence: 0.9,
                  evidence: "The final range endpoint is wrong."
                }],
                hint: "先检查 range 的末端。",
                skill_update: null
              })
            }
          }]
        }), { status: 200 });
      };
      const skill = createEmptyStudentSkill("student-a", "2026-07-14T00:00:00.000Z");
      skill.codeHabits.languageRules.python = [
        "Check loop boundary.",
        "unmapped-student-secret-123"
      ];
      let audit: SkillPlanAudit | undefined;

      await requestMimoTeachingDiagnosisWithSkills(
        {
          baseUrl: "https://api.example.test/v1",
          apiKey: "test-key",
          model: "teacher-model"
        },
        {
          problem: { id: "P1000", title: "A+B", summary: "Add two integers." },
          language: "python",
          studentCode: "for i in range(n): pass",
          ojVerdict: { status: "WA" },
          localEvidence: [],
          studentProfile: { painPointCounts: {}, activeSkills: [] }
        },
        {
          studentSkill: skill,
          action: "specific",
          onAudit: (value) => {
            audit = value;
          }
        },
        fakeFetch as typeof fetch
      );

      const body = JSON.parse(String(calls[0].init?.body));
      const system = String(body.messages[0].content);
      const user = String(body.messages[1].content);
      expect(system).not.toContain("[tail]");
      expect(user).toContain("Check the first and last valid loop or range boundary");
      expect(user.indexOf("[tail]")).toBeLessThan(user.indexOf("[footer]"));
      expect(user.trimEnd()).toEndWith("</action-output-footer>");
      expect(user).not.toContain("unmapped-student-secret-123");
      expect(audit?.includedRuleIds).toContain("learner.loop-boundary");
      expect(JSON.stringify(audit)).not.toContain("student-secret");
    });

- [ ] **Step 2: Verify red**

Run:

    npx vitest run test/mimoTeacher.test.ts

Expected: FAIL because requestMimoTeachingDiagnosisWithSkills does not exist.

- [ ] **Step 3: Add a skill-aware coach entry point while preserving the legacy function**

In src/teaching/mimoTeacher.ts, import providerCapabilitiesFor, the composer, selector, coach renderer, StudentSkill creation/type, and skill types. Add:

    export interface TeachingDiagnosisSkillOptions {
      studentSkill?: StudentSkill;
      action?: CoachSkillAction;
      capabilities?: ProviderCapabilities;
      onAudit?: (audit: SkillPlanAudit) => void;
    }

Implement the new function:

    export async function requestMimoTeachingDiagnosisWithSkills(
      config: ChatCompletionProviderConfig,
      context: TeachingDiagnosisContext,
      options: TeachingDiagnosisSkillOptions,
      fetchImpl: typeof fetch = fetch,
      onUsage?: ChatCompletionUsageSink
    ): Promise<TeachingDiagnosisReport> {
      const skill = options.studentSkill ?? createEmptyStudentSkill("legacy-coach");
      const learnerSelection = selectLearnerRules({
        skill,
        route: "coach",
        language: context.language,
        localCode: context.studentCode
      });
      const plan = composeCoachSkillPlan({
        language: context.language,
        action: options.action ?? "hint",
        learnerSelection
      });
      const capabilities = options.capabilities ?? providerCapabilitiesFor({
        format: config.format ?? "openai-chat",
        baseUrl: "baseUrl" in config ? config.baseUrl : "codex://app-server"
      });
      const rendered = renderCoachSkillPlan(
        plan,
        capabilities,
        buildTeachingDiagnosisPrompt(context)
      );
      options.onAudit?.(rendered.audit);

      const text = await requestChatCompletionText(
        config,
        {
          messages: rendered.messages,
          maxTokens: 1000,
          temperature: 0.2,
          responseFormat: { type: "json_object" },
          onUsage
        },
        fetchImpl
      );
      return parseAndNormalizeTeachingReport(text, context);
    }

Extract the current try/catch parsing block into:

    function parseAndNormalizeTeachingReport(
      text: string,
      context: TeachingDiagnosisContext
    ): TeachingDiagnosisReport {
      try {
        return normalizeTeachingDiagnosisReport(parseTeachingDiagnosisReport(text), {
          currentProblemId: context.problem.id,
          problemSummary: context.problem.summary
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const preview = text.slice(0, 240).replace(/\s+/g, " ").trim();
        throw new Error(
          "MiMo teaching diagnosis returned invalid JSON: " +
          message +
          ". Preview: " +
          (preview || "<empty>")
        );
      }
    }

Replace the legacy function body with:

    return requestMimoTeachingDiagnosisWithSkills(
      config,
      context,
      {},
      fetchImpl,
      onUsage
    );

This preserves every existing CLI/test call signature. Do not append learner rules to buildTeachingDiagnosisPrompt; the user/context prompt remains separate from the policy layers.

- [ ] **Step 4: Pass the actual route, StudentSkill, and action from the sidebar**

In handleAiCoachRequest in src/sidebar/ProblemBankViewProvider.ts:

- Keep the ModelRoute instead of immediately discarding it:

    const route = routeTeachingModel(
      await this.loadRuntimeModelEnv(),
      this.codexServices.text
    );
    const config = route.config;

- Add a local variable:

    let coachSkillAudit: SkillPlanAudit | undefined;

- Replace the diagnose callback with:

    diagnose: (diagnosisContext) =>
      requestMimoTeachingDiagnosisWithSkills(
        config,
        diagnosisContext,
        {
          studentSkill,
          action,
          capabilities: route.capabilities,
          onAudit: (audit) => {
            coachSkillAudit = audit;
          }
        }
      )

- Import requestMimoTeachingDiagnosisWithSkills and SkillPlanAudit.
- Add coachSkillAudit to the existing internal-test payload only as the typed audit object. Never add the rendered messages or TeachingDiagnosisContext.

Follow-up chat stays on requestMimoCoachFollowUp in this version. Its inclusion in CoachSkillAction reserves the contract, but migrating follow-up is out of scope.

- [ ] **Step 5: Verify coach taxonomy and workflow remain unchanged**

Run:

    npx vitest run test/mimoTeacher.test.ts test/teachingPrompt.test.ts test/teachingWorkflow.test.ts test/studentSkill.test.ts
    npm run compile

Expected:

- Existing teaching JSON normalization passes.
- Existing taxonomy expectations pass.
- Existing workflow still receives TeachingDiagnosisReport, not a new wrapper.
- New system policy contains controlled tail rules in the correct order.

- [ ] **Step 6: Stage the dirty sidebar file safely and commit**

Run:

    git add src/teaching/mimoTeacher.ts test/mimoTeacher.test.ts
    git add -p src/sidebar/ProblemBankViewProvider.ts
    git diff --cached --check
    git diff --cached

Confirm the staged sidebar hunks are limited to route retention, skill-aware diagnosis, and safe audit recording.

Run:

    git commit -m "feat: compose language skills for coach"

### Task 10: Surface privacy-safe audit, preview status, and real-pipeline health checks

**Files:**

- Create: src/skills/auditView.ts
- Create: test/skillAuditView.test.ts
- Modify: src/sidebar/stateView.ts
- Modify: src/sidebar/ProblemBankViewProvider.ts
- Modify: test/problemBankWebviewScript.test.ts

- [ ] **Step 1: Write a failing safe-audit test**

Create test/skillAuditView.test.ts:

    import { describe, expect, test } from "vitest";
    import { toPublicSkillPlanAudit } from "../src/skills/auditView";

    describe("public skill plan audit", () => {
      test("contains stable IDs and counts but no model context", () => {
        const view = toPublicSkillPlanAudit("autocomplete_preview", {
          route: "autocomplete",
          language: "python",
          renderer: "deepseek-fim",
          includedRuleIds: [
            "core.autocomplete.local-only",
            "learner.loop-boundary"
          ],
          excludedRules: [{
            id: "learner.pointer",
            reason: "not-relevant"
          }],
          learnerRuleCount: 1,
          learnerRuleBudget: 2,
          learnerCharacterCount: 74,
          learnerCharacterBudget: 240,
          enforcementKinds: ["prompt", "validator"]
        });

        expect(view).toEqual({
          action: "autocomplete_preview",
          route: "autocomplete",
          language: "python",
          renderer: "deepseek-fim",
          included: [
            "core.autocomplete.local-only",
            "learner.loop-boundary"
          ],
          excluded: ["learner.pointer:not-relevant"],
          learnerRules: {
            used: 1,
            budget: 2,
            usedCharacters: 74,
            characterBudget: 240
          },
          enforcement: ["prompt", "validator"]
        });
        expect(JSON.stringify(view)).not.toContain("prefix");
        expect(JSON.stringify(view)).not.toContain("suffix");
        expect(JSON.stringify(view)).not.toContain("filePath");
      });
    });

- [ ] **Step 2: Verify red and implement the view mapper**

Run:

    npx vitest run test/skillAuditView.test.ts

Expected: FAIL because src/skills/auditView.ts does not exist.

Create src/skills/auditView.ts:

    import type { SkillPlanAudit } from "./types";

    export interface PublicSkillPlanAudit {
      action: "autocomplete_preview" | "autocomplete_health" | "coach";
      route: SkillPlanAudit["route"];
      language: SkillPlanAudit["language"];
      renderer: SkillPlanAudit["renderer"];
      included: string[];
      excluded: string[];
      learnerRules: {
        used: number;
        budget: number;
        usedCharacters: number;
        characterBudget: number;
      };
      enforcement: string[];
    }

    export function toPublicSkillPlanAudit(
      action: PublicSkillPlanAudit["action"],
      audit: SkillPlanAudit
    ): PublicSkillPlanAudit {
      return {
        action,
        route: audit.route,
        language: audit.language,
        renderer: audit.renderer,
        included: [...audit.includedRuleIds],
        excluded: audit.excludedRules.map((item) => item.id + ":" + item.reason),
        learnerRules: {
          used: audit.learnerRuleCount,
          budget: audit.learnerRuleBudget,
          usedCharacters: audit.learnerCharacterCount,
          characterBudget: audit.learnerCharacterBudget
        },
        enforcement: [...audit.enforcementKinds]
      };
    }

Run:

    npx vitest run test/skillAuditView.test.ts

Expected: PASS.

- [ ] **Step 3: Move autocomplete preview onto the detailed pipeline**

In handleAutocompletePreview in src/sidebar/ProblemBankViewProvider.ts:

1. Keep the complete autocomplete route.
2. Load the current StudentSkill through loadStudentSkillForProfile.
3. Call requestMimoAutocompleteDetailed.
4. Convert result.audit with toPublicSkillPlanAudit.

The core replacement is:

    const route = routeAutocompleteModel(
      await this.loadRuntimeModelEnv(),
      this.codexServices.text
    );
    const profile = await loadStudentProfile(this.profilePath());
    const studentSkill = await this.loadStudentSkillForProfile(profile);
    const result = await requestMimoAutocompleteDetailed(route.config, {
      ...input,
      studentSkill,
      capabilities: route.capabilities
    });
    const contextAudit = toPublicSkillPlanAudit(
      "autocomplete_preview",
      result.audit
    );

Return:

    model: route.model,
    suggestion: result.suggestion,
    validationStatus: result.status,
    rejectionReason: result.rejectionReason,
    contextAudit

The status string must distinguish:

- success: AI 已生成一次补全预览。
- model-empty: AI 补全模型返回为空；请换到有局部上下文的代码位置再试。
- validator-rejected: AI 返回内容已被安全策略拦截：加上稳定 rejectionReason。

Update the internal event payload to contain result.status, result.rejectionReason, language, line number, and contextAudit. Do not include suggestion, prefix, suffix, absolute file path, or StudentSkill.

Delete the old static autocompletePreviewAudit function.

- [ ] **Step 4: Make health check exercise composition, rendering, transport, and validation**

In runAutocompleteSmokeHealthCheck:

- Keep the complete route.
- Replace deepSeekFimEndpointHint(route.config) with a check of route.capabilities.configurationIssue. If it is deepseek-fim-beta-required, return the existing visible /beta guidance. Delete the old URL-inspecting helper once no caller remains.
- Replace direct requestCompletion with:

    const result = await requestMimoAutocompleteDetailed(route.config, {
      prefix: "def add(a, b):\n    ",
      suffix: "\nprint(add(1, 2))",
      language: "python",
      filePath: "health-check.py",
      capabilities: route.capabilities
    });

- Treat model-empty as:

    throw new Error("Autocomplete smoke model returned empty.");

- Treat validator-rejected as:

    throw new Error(
      "Autocomplete smoke rejected by policy: " +
      (result.rejectionReason ?? "unknown")
    );

- Add renderer: result.audit.renderer to the pass step.

In src/sidebar/stateView.ts, add optional fields to AiHealthCheckStep:

    renderer?: SkillPlanAudit["renderer"];
    validationStatus?: AutocompleteValidationStatus;

Use type-only imports. Add renderer and validationStatus to safeAutocompleteRouteInfo so failure diagnostics identify the selected renderer without logging prompts.

Update the health-check webview renderer to show renderer beside format when present.

- [ ] **Step 5: Teach preview UI to distinguish rejection from empty**

In renderAutocompletePreview in the webview script:

- If validationStatus is validator-rejected, render a warning containing only rejectionReason.
- If validationStatus is model-empty, keep an empty-state message.
- If success, render suggestion as code.
- Continue calling appendContextAudit(data.contextAudit).

Extend test/problemBankWebviewScript.test.ts with:

    expect(source).toContain('data.validationStatus === "validator-rejected"');
    expect(source).toContain('data.validationStatus === "model-empty"');
    expect(source).toContain("data.rejectionReason");
    expect(source).toContain("data.contextAudit");
    expect(source).not.toContain("contextAudit.prefix");
    expect(source).not.toContain("contextAudit.suffix");

- [ ] **Step 6: Verify**

Run:

    npx vitest run test/skillAuditView.test.ts test/mimoAutocomplete.test.ts test/problemBankWebviewScript.test.ts
    npm run compile

Expected:

- Preview consumes detailed result.
- Health check uses the same pipeline as Ghost Text.
- UI distinguishes empty/rejected/success.
- Audit includes only stable IDs/counts/capability metadata.

- [ ] **Step 7: Stage overlapping dirty files by hunk and commit**

Run:

    git add src/skills/auditView.ts test/skillAuditView.test.ts src/sidebar/stateView.ts
    git add -p src/sidebar/ProblemBankViewProvider.ts test/problemBankWebviewScript.test.ts
    git diff --cached --check
    git diff --cached

Reject any staged hunks related to Luogu search, practice files, scoring, report changes, or unrelated webview work.

Run:

    git commit -m "feat: expose safe skill plan audit"

### Task 11: Lock the route boundary and StudentSkill evaluation invariants

**Files:**

- Create: test/skillContextBoundary.test.ts
- Modify: src/autocomplete/prompt.ts
- Modify: test/autocomplete.test.ts
- Modify: test/habitSelector.test.ts
- Verify: test/context.test.ts
- Verify: test/autocompleteRequestGate.test.ts
- Verify: test/teachingWorkflow.test.ts
- Verify: test/sidebarTeachingContext.test.ts
- Verify: test/studentSkillStore.test.ts

- [ ] **Step 1: Add an end-to-end request-body leakage test**

Create test/skillContextBoundary.test.ts:

    import { describe, expect, test } from "vitest";
    import { buildAutocompleteInputFromText } from "../src/autocomplete/context";
    import { requestMimoAutocompleteDetailed } from "../src/autocomplete/mimoAutocomplete";
    import { shouldRequestInlineCompletion } from "../src/autocomplete/triggerPolicy";
    import { buildTeachingDiagnosisPrompt } from "../src/teaching/teachingPrompt";
    import { createEmptyStudentSkill } from "../src/teaching/studentSkill";

    describe("skill route context boundary", () => {
      test("removes forbidden problem and learner text before the provider request", async () => {
        const text = [
          "# 题面：LEAK-PROBLEM-991",
          "# 标准答案：LEAK-ANSWER-992",
          "# ===== 学生代码开始 =====",
          "def solve():",
          "    total = 0",
          "    ",
          "# ===== 学生代码结束 =====",
          "# AI 讲解：LEAK-COACH-995"
        ].join("\n");
        const input = buildAutocompleteInputFromText({
          text,
          offset: text.indexOf("    ", text.indexOf("total = 0")) + 4,
          language: "python",
          filePath: "C:\\LEAK-PATH-993\\P991.py"
        });
        const skill = createEmptyStudentSkill("student-a", "2026-07-14T00:00:00.000Z");
        skill.codeHabits.globalRules = ["LEAK-HABIT-994"];
        const calls: Array<{ init?: RequestInit }> = [];
        const fakeFetch = async (_url: string | URL | Request, init?: RequestInit): Promise<Response> => {
          calls.push({ init });
          return new Response(JSON.stringify({
            choices: [{ text: "return total" }]
          }), { status: 200 });
        };

        await requestMimoAutocompleteDetailed(
          {
            format: "openai-completions",
            baseUrl: "https://api.deepseek.com/beta",
            apiKey: "test-key",
            model: "deepseek-v4-flash"
          },
          {
            ...input,
            studentSkill: skill
          },
          fakeFetch as typeof fetch
        );

        const requestBody = String(calls[0].init?.body);
        expect(requestBody).toContain("def solve");
        expect(requestBody).not.toContain("LEAK-PROBLEM-991");
        expect(requestBody).not.toContain("LEAK-ANSWER-992");
        expect(requestBody).not.toContain("LEAK-PATH-993");
        expect(requestBody).not.toContain("LEAK-HABIT-994");
        expect(requestBody).not.toContain("LEAK-COACH-995");
      });

      test("keeps problem context on coach while excluding it from autocomplete", () => {
        const prompt = buildTeachingDiagnosisPrompt({
          problem: {
            id: "P991",
            title: "Coach-visible problem",
            summary: "COACH-PROBLEM-ALLOWED"
          },
          language: "python",
          studentCode: "return total",
          ojVerdict: { status: "WA" },
          localEvidence: [],
          studentProfile: { painPointCounts: {}, activeSkills: [] }
        });

        expect(prompt).toContain("COACH-PROBLEM-ALLOWED");
      });

      test("does not automatically trigger on problem comments", () => {
        expect(shouldRequestInlineCompletion(
          "# 题面：LEAK-PROBLEM-991",
          { languageId: "python" }
        )).toBe(false);
        expect(shouldRequestInlineCompletion(
          "// Reference Solution: LEAK-ANSWER-992",
          { languageId: "cpp" }
        )).toBe(false);
      });
    });

- [ ] **Step 2: Remove the obsolete activeProblem escape hatch**

The legacy AutocompletePromptInput in src/autocomplete/prompt.ts still declares an unused activeProblem object containing statement and referenceSolution. Remove that entire optional field. Import stableAutocompleteFileLabel from ./fileLabel, use it in both legacy builders, and delete the private stableFileLabel, sanitizeFileLabelPart, and fileExtension copies.

In test/autocomplete.test.ts, remove activeProblem from the two direct prompt-builder object literals and keep the existing Codex request test whose variable structurally carries forbidden extra fields. The new provider-bound test above plus the Codex test prove the production routes ignore those extras.

After the edit, run:

    rg -n "activeProblem|referenceSolution|function stableFileLabel|function sanitizeFileLabelPart" src/autocomplete

Expected: no matches.

- [ ] **Step 3: Add selector invariants for disabled and helpful evidence**

Append to test/habitSelector.test.ts:

    test("never reactivates a disabled skill through selection", () => {
      const skill = createEmptyStudentSkill("student-a", "2026-07-14T00:00:00.000Z");
      skill.hardRules.disabledSkills = ["python-loop-boundary-check"];
      skill.skills["python-loop-boundary-check"] = {
        name: "python-loop-boundary-check",
        status: "disabled",
        reason: "User disabled it.",
        rules: ["Check loop boundary."],
        sourcePainPoints: ["loop_boundary"],
        evidenceCount: 8,
        score: 9,
        examples: [],
        lastSeen: "2026-07-14T00:00:00.000Z"
      };

      expect(selectLearnerRules({
        skill,
        route: "coach",
        language: "python",
        localCode: "for i in range(n): pass"
      }).rules).toEqual([]);
    });

    test("helpful feedback affects ranking without exceeding budget", () => {
      const skill = createEmptyStudentSkill("student-a", "2026-07-14T00:00:00.000Z");
      skill.codeHabits.globalRules = [
        "Initialize accumulators.",
        "Check array indexes."
      ];
      skill.skills["python-loop-boundary-check"] = {
        name: "python-loop-boundary-check",
        status: "active",
        reason: "Repeated loop boundary misses.",
        rules: ["Check loop boundary."],
        sourcePainPoints: ["loop_boundary"],
        evidenceCount: 3,
        score: 2.5,
        examples: [],
        lastSeen: "2026-07-14T00:00:00.000Z"
      };
      skill.correctionLog.push({
        type: "diagnosis_helpful",
        target: "python-loop-boundary-check",
        note: "Useful.",
        source: "user",
        occurredAt: "2026-07-14T00:01:00.000Z"
      });

      const selection = selectLearnerRules({
        skill,
        route: "autocomplete",
        language: "python",
        localCode: "for i in range(n): total += values[i]"
      });

      expect(selection.rules).toHaveLength(2);
      expect(selection.rules.map((rule) => rule.id)).toContain("learner.loop-boundary");
    });

- [ ] **Step 4: Run the context-boundary verification set**

Run:

    npx vitest run test/skillContextBoundary.test.ts test/context.test.ts test/autocomplete.test.ts test/autocompleteRequestGate.test.ts
    npx vitest run test/teachingWorkflow.test.ts test/sidebarTeachingContext.test.ts
    npm run compile

Then inspect crossings:

    rg -n "teacherPack|standard|solution|statement|problem\.statement|coachThread" src\autocomplete src\teaching src\sidebar test

Expected:

- Tests pass.
- Matches in teaching/sidebar are reviewed as route-appropriate.
- No autocomplete import or request path can obtain Teacher Pack, standard answer, coach thread, or a problem record.
- Defensive policy strings are not mistaken for leaked payload data.

- [ ] **Step 5: Run the StudentSkill evaluation ladder without paid calls**

Run:

    npx vitest run test/habitSelector.test.ts test/studentSkill.test.ts test/studentSkillStore.test.ts test/recommendationEngine.test.ts
    npm run trial:longitudinal-self-evolution -- --provider fixture --limit 1000 --no-write

Expected hard gates:

- autocomplete leakage: zero;
- parser crashes on fixture dry run: zero;
- disabled-skill reactivation: zero;
- learner rule budget violations: zero;
- recommendation without visible reason: zero;
- difficulty increase without transfer/repeated low-hint evidence: zero.

Do not run trial:mimo-journey or another paid provider route in this task. Live calls belong to the explicit installed-extension acceptance task.

- [ ] **Step 6: Stage dirty prompt/tests by hunk and commit**

Run:

    git add test/skillContextBoundary.test.ts
    git add -p src/autocomplete/prompt.ts test/autocomplete.test.ts test/habitSelector.test.ts
    git diff --cached --check
    git diff --cached

Confirm the staged changes contain only activeProblem removal and the new boundary/evaluation tests.

Run:

    git commit -m "test: lock skill composition boundaries"

### Task 12: Make the release package carry the new runtime and exclude scratch source

**Files:**

- Modify: scripts/packageBetaReleaseVsix.js
- Modify: .vscodeignore
- Create: test/skillPackaging.test.ts
- Verify: scripts/checkProjectHygiene.js
- Verify: test/projectHygieneScript.test.ts

- [ ] **Step 1: Write the failing packaging contract test**

Create test/skillPackaging.test.ts:

    import { readFile } from "node:fs/promises";
    import { describe, expect, test } from "vitest";

    describe("skill composition packaging", () => {
      test("ships compiled skills and excludes root scratch source files", async () => {
        const packager = await readFile("scripts/packageBetaReleaseVsix.js", "utf8");
        const vscodeIgnore = await readFile(".vscodeignore", "utf8");

        expect(packager).toContain('"skills"');
        expect(vscodeIgnore.split(/\r?\n/)).toEqual(expect.arrayContaining([
          "*.c",
          "*.cpp",
          "*.py",
          "*.rs"
        ]));
      });
    });

- [ ] **Step 2: Verify red**

Run:

    npx vitest run test/skillPackaging.test.ts

Expected: FAIL because skills is not in allowedTopLevelRuntime and root test.c is not ignored.

- [ ] **Step 3: Include the compiled skill runtime**

In scripts/packageBetaReleaseVsix.js, add:

    "skills",

to allowedTopLevelRuntime. Do not enumerate individual skill files; the complete compiled src/skills tree is required because extension, autocomplete, model, sidebar, and teaching modules all import it.

- [ ] **Step 4: Exclude root scratch source from the development VSIX**

Add to .vscodeignore:

    *.c
    *.cpp
    *.py
    *.rs

The existing practice directory ignore remains. These new patterns prevent ad-hoc root files such as test.c from entering npm run package:beta.

- [ ] **Step 5: Verify both package variants and hygiene**

Run:

    npx vitest run test/skillPackaging.test.ts test/projectHygieneScript.test.ts test/extensionManifest.test.ts
    npm run package:beta
    npm run package:beta-release
    npm run check:hygiene

Expected:

- Both VSIX commands exit 0.
- The release staging tree passes the existing secret/runtime/source-map checks.
- test.c is absent from the development package.

Inspect the clean release file list:

    Push-Location .runtime\beta-release-vsix\student-autocomplete-lab-beta-release
    $releaseFiles = npx --yes @vscode/vsce ls
    Pop-Location
    $releaseFiles | Select-String "dist/src/skills/"
    $releaseFiles | Select-String "test\.c|secrets/|\.runtime/|docs/|scripts/|\.js\.map"

Expected:

- The first Select-String prints the compiled skill modules.
- The second Select-String prints nothing.

- [ ] **Step 6: Commit**

Run:

    git add scripts/packageBetaReleaseVsix.js .vscodeignore test/skillPackaging.test.ts
    git diff --cached --check
    git commit -m "build: package modular skill runtime"

### Task 13: Prove the installed VS Code golden path

**Files:**

- Update conditionally: MANUAL-ACCEPTANCE.md
- Write runtime evidence only under ignored .runtime/ui-audit or the extension globalStorage
- Do not commit screenshots, model output, tokens, or provider credentials

- [ ] **Step 1: Snapshot installed state and route metadata**

Run:

    git status --short
    code --list-extensions --show-versions | Select-String "student-autocomplete"

Record extension IDs/versions, selected provider mode, model names, base URLs, formats, and renderer IDs. Redact API keys and OAuth tokens completely. Do not print SecretStorage or models.env.

- [ ] **Step 2: Install the clean release package**

Run:

    code --install-extension .runtime\student-autocomplete-lab-0.1.0-beta.1-release.vsix --force
    code --list-extensions --show-versions | Select-String "student-autocomplete"

Expected: kaiserunix.student-autocomplete-lab-beta-release@0.1.0-beta.1 is installed from the just-built artifact.

Reload the VS Code window before UI testing. A source test or sidebar preview is not evidence that Ghost Text works in the installed extension.

- [ ] **Step 3: Use Computer Use for the real UI path when available**

Before operating VS Code, read and follow the computer-use:computer-use skill. In the installed beta-release extension:

1. Open AI 接口配置.
2. Run model list, chat smoke, and autocomplete smoke without displaying keys.
3. Confirm autocomplete health reports renderer and distinguishes transport failure, model-empty, and validator-rejected.
4. Run once with the already-authorized Codex OAuth route and its actually listed autocomplete model; do not invent a Spark model absent from the account.
5. If a configured DeepSeek key is available and live-call authorization remains current, use chat at /v1 and autocomplete at /beta/completions for one bounded FIM smoke. Confirm the provider request contains the exact post-cursor suffix.

If no authorized DeepSeek credential is configured, record live DeepSeek as not verified; deterministic DeepSeek client/renderer tests remain mandatory but do not count as a live call.

- [ ] **Step 4: Verify language-specific Ghost Text**

Open one small local file for each supported language and trigger inline completion at a non-comment code location:

- Python: an indented range loop;
- C: an open statement or loop body;
- C++: a vector/container access or loop body;
- Rust: an iterator/match/Result-shaped local continuation.

For each:

- Ghost Text appears in the editor, not only in the preview card.
- Output is code-only and at most three contiguous lines.
- Python preserves indentation.
- C/C++ preserve braces, semicolons, types, and bounds-oriented style.
- Rust preserves ownership/borrowing and Result/Option structure without gratuitous unwrap.
- Output is either accepted or visibly classified as model-empty/validator-rejected.
- No full problem solution, explanation, or prompt echo appears.

Capture UI evidence under .runtime/ui-audit only. Do not accept a suggestion if doing so would overwrite valuable user code; a disposable smoke file is preferred.

- [ ] **Step 5: Verify the same learner session through coach and recommendation**

Using one current problem/session:

1. Import or select a Luogu/Markdown problem.
2. Create/open its source file.
3. Trigger a 1–3 line inline completion.
4. Request a hint.
5. Request a more specific hint and confirm it narrows the same current issue instead of revealing the full answer.
6. Mark the attempt completed or abandoned.
7. Inspect StudentSkill: revision/evidence changes only when the teaching workflow supplies evidence; autocomplete itself does not promote a skill.
8. Confirm a user-disabled or wrong-diagnosis skill does not appear in the applied-rule audit.
9. Request a next problem and verify the UI shows a reason.

The preview/coach audit may show route, language, renderer, included/excluded stable rule IDs, learner budget, and enforcement kinds. It must not show code, prompt, suffix, statement, Teacher Pack, standard answer, file path, key, or token.

- [ ] **Step 6: Resolve the manual-acceptance document**

If Computer Use completes every account/UI step, remove the now-stale MANUAL-ACCEPTANCE.md because no user action remains.

If any account-owned or unavailable UI step remains, replace MANUAL-ACCEPTANCE.md with only:

- the unverified step;
- why automation could not complete it;
- the exact expected visible result;
- whether reload/reinstall is required;
- no secret value or copied model output.

Stage the deletion/update only after checking that it reflects actual installed-extension evidence:

    git add -p MANUAL-ACCEPTANCE.md
    git diff --cached

If changed, commit:

    git commit -m "docs: record remaining skill acceptance"

### Task 14: Run the final completion audit and prepare handoff

**Files:**

- Inspect: every feature commit since the approved design
- Inspect: docs/superpowers/specs/2026-07-14-language-skill-composition-design.md
- Inspect: this plan
- Do not absorb unrelated dirty changes

- [ ] **Step 1: Run all automated gates from a fresh build**

Run:

    npm run compile
    npm test
    npm run compile:release
    npm run package:beta-release
    npm run check:hygiene

Expected: every command exits 0.

- [ ] **Step 2: Re-run the high-risk focused set**

Run:

    npx vitest run test/languageSkillRegistry.test.ts test/habitSelector.test.ts test/skillPlan.test.ts test/providerCapabilities.test.ts test/skillRenderers.test.ts
    npx vitest run test/completionsClient.test.ts test/autocompleteOutputPolicy.test.ts test/mimoAutocomplete.test.ts test/inlineProviderSkillIntegration.test.ts
    npx vitest run test/mimoTeacher.test.ts test/teachingPrompt.test.ts test/teachingWorkflow.test.ts test/skillAuditView.test.ts
    npx vitest run test/skillContextBoundary.test.ts test/context.test.ts test/autocomplete.test.ts test/problemBankWebviewScript.test.ts test/skillPackaging.test.ts

Expected: all files pass independently as well as in the full suite.

- [ ] **Step 3: Perform the privacy and placeholder scans**

Run:

    rg -n "teacherPack|standardAnswer|referenceSolution|problem\.statement|coachThread" src\autocomplete src\skills
    rg -n "apiKey|accessToken|refreshToken|authorization" src\skills
    rg -n "TODO|TBD|FIXME|HACK|placeholder|not implemented" src\skills test\languageSkillRegistry.test.ts test\habitSelector.test.ts test\skillPlan.test.ts test\skillRenderers.test.ts

Expected:

- No forbidden context dependency in autocomplete/skill code.
- No credential fields in SkillPlan/audit code.
- No unfinished implementation markers in new modules/tests.
- Policy instructions that name a forbidden category are reviewed separately from actual data dependencies.

- [ ] **Step 4: Audit every approved requirement against evidence**

Use this checklist:

- Typed head/body/tail/footer SkillPlan exists.
- Coach and autocomplete have separate composers and context types.
- Precedence is safety > output > action > language > habits and conflict tests prove it.
- Python/C/C++/Rust/generic strategies have stable IDs.
- StudentSkill raw strings are controlled, relevant, correction-aware, and capped at 3 coach/2 autocomplete.
- DeepSeek FIM sends the exact suffix; known languages use native comments; generic adds no synthetic preamble.
- OpenAI chat, Anthropic, Codex OAuth, and generic OpenAI-compatible requests preserve legacy compatibility.
- Validator distinguishes success, model-empty, and validator-rejected with no automatic retry.
- Preview, health, status bar, audit, and installed Ghost Text use the same detailed pipeline.
- Audit contains stable IDs/counts only.
- No per-language model UI and no DeepSeek-specific chat prefix were added.
- Fixture evaluation has zero leakage/parser crash/disabled reactivation/budget violations.
- Clean VSIX contains dist/src/skills and no scratch source, secrets, runtime data, docs, scripts, tests, or source maps.
- Installed-extension evidence names which OAuth/DeepSeek paths and golden-path steps were actually verified.

Treat missing or indirect evidence as incomplete; fix it and repeat the relevant gate.

- [ ] **Step 5: Inspect Git boundaries**

Run:

    git status --short
    git log --oneline --decorate -20
    git diff --check
    git diff --cached --check

Expected:

- Feature commits are small and named by task.
- No staged changes remain.
- Pre-existing unrelated dirty files remain preserved rather than silently committed.
- Any remaining MANUAL-ACCEPTANCE.md accurately lists only unverified user work.

- [ ] **Step 6: Write the final implementation report**

Report:

- route/context changes and included/excluded data;
- new language and learner-rule behavior;
- provider/renderers tested, including whether DeepSeek was deterministic-only or live;
- StudentSkill fixture/evaluation hard gates;
- targeted/full/compile/package/hygiene results;
- installed extension ID/version and whether reload/reinstall was performed;
- golden-path steps verified and any step not verified with reason;
- remaining dirty files that belong to the user.

Do not say the feature is real, ready, fixed, or complete unless the installed-extension and requirement-by-requirement evidence above supports that exact claim.
