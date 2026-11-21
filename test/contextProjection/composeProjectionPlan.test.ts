import { describe, expect, it } from "vitest";
import {
  composeProjectionPlan,
  LAYER_ORDER,
  SOURCE_PRECEDENCE,
  type ProjectionRule
} from "../../src/core/contextProjection";

function makeRule(overrides: Partial<ProjectionRule>): ProjectionRule {
  return {
    id: overrides.id ?? "rule.default",
    policyKey: overrides.policyKey ?? "policy.default",
    route: overrides.route ?? "coach",
    layer: overrides.layer ?? "body",
    source: overrides.source ?? "action",
    priority: overrides.priority ?? 500,
    instruction: overrides.instruction ?? "Default instruction",
    compactInstruction: overrides.compactInstruction,
    enforcement: overrides.enforcement ?? "prompt",
    language: overrides.language,
    projectedItem: overrides.projectedItem
  };
}

describe("composeProjectionPlan", () => {
  it("enforces deterministic 4-layer order head > body > tail > footer regardless of input order", () => {
    const rules: ProjectionRule[] = [
      makeRule({ id: "r.footer", policyKey: "p.footer", layer: "footer", source: "output" }),
      makeRule({ id: "r.tail", policyKey: "p.tail", layer: "tail", source: "learner" }),
      makeRule({ id: "r.body", policyKey: "p.body", layer: "body", source: "action" }),
      makeRule({ id: "r.head", policyKey: "p.head", layer: "head", source: "hard" })
    ];

    const planA = composeProjectionPlan({
      route: "coach",
      language: "cpp",
      rules,
      includeDefaultHardRules: false,
      includeDefaultLanguageRules: false
    });
    const planB = composeProjectionPlan({
      route: "coach",
      language: "cpp",
      rules: [...rules].reverse(),
      includeDefaultHardRules: false,
      includeDefaultLanguageRules: false
    });

    expect(LAYER_ORDER).toEqual(["head", "body", "tail", "footer"]);
    expect(planA.rules.map((r) => r.layer)).toEqual(["head", "body", "tail", "footer"]);
    expect(planA.rules.map((r) => r.id)).toEqual(planB.rules.map((r) => r.id));
    expect(planA.audit.includedRuleIds).toEqual(["r.head", "r.body", "r.tail", "r.footer"]);
  });

  it("arbitrates policyKey conflicts strictly by hard > output > action > language > learner", () => {
    expect(SOURCE_PRECEDENCE.hard).toBeGreaterThan(SOURCE_PRECEDENCE.output);
    expect(SOURCE_PRECEDENCE.output).toBeGreaterThan(SOURCE_PRECEDENCE.action);
    expect(SOURCE_PRECEDENCE.action).toBeGreaterThan(SOURCE_PRECEDENCE.language);
    expect(SOURCE_PRECEDENCE.language).toBeGreaterThan(SOURCE_PRECEDENCE.learner);

    const conflicting: ProjectionRule[] = [
      makeRule({ id: "learner.override", policyKey: "scope", source: "learner", priority: 9999 }),
      makeRule({ id: "language.override", policyKey: "scope", source: "language", priority: 9998 }),
      makeRule({ id: "action.override", policyKey: "scope", source: "action", priority: 100 }),
      makeRule({ id: "output.override", policyKey: "scope", source: "output", priority: 50 }),
      makeRule({ id: "hard.override", policyKey: "scope", source: "hard", priority: 1 })
    ];

    const plan = composeProjectionPlan({
      route: "coach",
      language: "python",
      rules: conflicting,
      includeDefaultHardRules: false,
      includeDefaultLanguageRules: false
    });

    expect(plan.rules.map((r) => r.id)).toEqual(["hard.override"]);
    expect(plan.audit.excludedRules).toHaveLength(4);
    for (const excluded of plan.audit.excludedRules) {
      expect(excluded.reason).toBe("conflict-overridden-by:hard.override");
    }
  });

  it("filters mismatched routes, mismatched languages, duplicate IDs, and enforces learner caps", () => {
    const plan = composeProjectionPlan({
      route: "autocomplete",
      language: "cpp",
      includeDefaultHardRules: true,
      includeDefaultLanguageRules: true,
      rules: [
        makeRule({ id: "wrong.route", route: "coach", policyKey: "wr" }),
        makeRule({
          id: "wrong.lang",
          route: "autocomplete",
          language: "python",
          policyKey: "wl"
        }),
        makeRule({
          id: "learner.h1",
          route: "autocomplete",
          layer: "tail",
          source: "learner",
          policyKey: "habit.1",
          priority: 200,
          instruction: "Use int64_t for sums",
          compactInstruction: "Use int64_t for sums",
          projectedItem: {
            id: "h1",
            kind: "code_habit",
            label: "Use int64_t for sums",
            muteable: true
          }
        }),
        makeRule({
          id: "learner.h2",
          route: "autocomplete",
          layer: "tail",
          source: "learner",
          policyKey: "habit.2",
          priority: 190,
          instruction: "Prefer emplace_back",
          compactInstruction: "Prefer emplace_back",
          projectedItem: {
            id: "h2",
            kind: "code_habit",
            label: "Prefer emplace_back",
            muteable: true
          }
        }),
        makeRule({
          id: "learner.h3",
          route: "autocomplete",
          layer: "tail",
          source: "learner",
          policyKey: "habit.3",
          priority: 180,
          instruction: "Prefer range-based for loops",
          compactInstruction: "Prefer range-based for loops",
          projectedItem: {
            id: "h3",
            kind: "code_habit",
            label: "Prefer range-based for loops",
            muteable: true
          }
        })
      ]
    });

    expect(plan.audit.includedRuleIds).toContain("learner.h1");
    expect(plan.audit.includedRuleIds).toContain("learner.h2");
    expect(plan.audit.includedRuleIds).not.toContain("learner.h3");
    expect(plan.audit.projectedItems.map((i) => i.id)).toEqual(["h1", "h2"]);

    const excludedReasons = Object.fromEntries(
      plan.audit.excludedRules.map((e) => [e.id, e.reason])
    );
    expect(excludedReasons["wrong.route"]).toBe("route-mismatch");
    expect(excludedReasons["wrong.lang"]).toBe("language-mismatch");
    expect(excludedReasons["learner.h3"]).toBe("learner-rule-limit");
  });

  it("allocates character budget in precedence order so learner rules cannot crowd out hard/language rules", () => {
    const plan = composeProjectionPlan({
      route: "coach",
      language: "rust",
      characterBudgetMax: 120,
      includeDefaultHardRules: false,
      includeDefaultLanguageRules: false,
      rules: [
        makeRule({
          id: "hard.core",
          policyKey: "k1",
          layer: "head",
          source: "hard",
          instruction: "A".repeat(70)
        }),
        makeRule({
          id: "language.rust",
          policyKey: "k2",
          layer: "body",
          source: "language",
          instruction: "B".repeat(40)
        }),
        makeRule({
          id: "learner.extra",
          policyKey: "k3",
          layer: "tail",
          source: "learner",
          instruction: "C".repeat(30)
        })
      ]
    });

    expect(plan.audit.includedRuleIds).toEqual(["hard.core", "language.rust"]);
    expect(plan.audit.characterBudgetUsed).toBe(110);
    expect(plan.audit.excludedRules).toContainEqual({
      id: "learner.extra",
      reason: "character-budget-exceeded"
    });
  });
});
