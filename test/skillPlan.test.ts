import { describe, expect, test } from "vitest";
import {
  composeAutocompleteSkillPlan,
  composeCoachSkillPlan,
  resolveSkillRuleConflicts
} from "../src/skills/composeSkillPlan";
import type {
  LearnerRuleSelection,
  SkillRule,
  SkillRuleSource
} from "../src/skills/types";

const conflictingLearnerSelection: LearnerRuleSelection = {
  budget: 2,
  characterBudget: 160,
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

function sourceRule(source: SkillRuleSource, priority = 1): SkillRule {
  return {
    id: "test." + source,
    policyKey: "test.shared-policy",
    route: "autocomplete",
    layer: "head",
    strength: "soft",
    source,
    priority,
    instruction: source,
    enforcement: "prompt"
  };
}

describe("skill plan composition", () => {
  test("orders head, body, tail, and footer deterministically", () => {
    const plan = composeAutocompleteSkillPlan({
      language: "python",
      learnerSelection: {
        budget: 2,
        characterBudget: 160,
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
        characterBudget: 225,
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

  test("follow-up selects its own JSON footer without changing the route", () => {
    const plan = composeCoachSkillPlan({
      language: "python",
      action: "followUp",
      learnerSelection: {
        budget: 3,
        characterBudget: 225,
        usedCharacters: 0,
        excludedRules: [],
        rules: []
      }
    });

    expect(plan.rules.map((rule) => rule.id)).toContain("output.coach.follow-up-json");
    expect(plan.output).toEqual({
      id: "coach.follow-up-json-v1",
      mode: "coach-follow-up-json",
      responseFormat: "json_object"
    });
  });

  test("rejects learner rules selected for another route or language", () => {
    const plan = composeCoachSkillPlan({
      language: "python",
      action: "hint",
      learnerSelection: {
        ...conflictingLearnerSelection,
        rules: [
          conflictingLearnerSelection.rules[0],
          {
            ...conflictingLearnerSelection.rules[0],
            id: "learner.cpp-only",
            route: "coach",
            language: "cpp"
          }
        ],
        usedCharacters: conflictingLearnerSelection.usedCharacters * 2
      }
    });

    expect(plan.rules.every((rule) => rule.source !== "learner")).toBe(true);
    expect(plan.audit.excludedRules).toEqual(expect.arrayContaining([
      { id: "learner.local-continuation", reason: "route-mismatch" },
      { id: "learner.cpp-only", reason: "language-mismatch" }
    ]));
  });

  test.each([
    ["core", "output"],
    ["output", "action"],
    ["action", "language"],
    ["language", "learner"]
  ] as const)("%s outranks %s for the same policy", (higher, lower) => {
    const resolution = resolveSkillRuleConflicts([
      sourceRule(lower, 999_999),
      sourceRule(higher, -999_999)
    ]);

    expect(resolution.rules.map((rule) => rule.id)).toEqual(["test." + higher]);
    expect(resolution.excludedRules).toEqual([{
      id: "test." + lower,
      reason: "conflict"
    }]);
  });

  test("deduplicates a normalized rule ID before policy conflicts", () => {
    const higher = {
      ...sourceRule("learner", 2),
      id: "learner.duplicate",
      policyKey: "habit.first"
    };
    const lower = {
      ...sourceRule("learner", 1),
      id: "learner.duplicate",
      policyKey: "habit.second"
    };
    const resolution = resolveSkillRuleConflicts([lower, higher]);

    expect(resolution.rules).toEqual([higher]);
    expect(resolution.excludedRules).toEqual([{
      id: "learner.duplicate",
      reason: "duplicate"
    }]);
  });
});
