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
  const output = coachOutput(input.action);
  return finalizePlan(
    "coach",
    strategy.language,
    [
      coreRule("coach", "core.coach.restrained-teacher", "role.coach", 1010,
        "Act as a restrained algorithm teacher and follow the requested response language.",
        "prompt"),
      coreRule("coach", "core.coach.evidence-only", "context.evidence", 1000,
        "Base the diagnosis on supplied evidence and distinguish observations from inference.",
        "prompt"),
      coreRule("coach", "core.coach.no-answer-leak", "output.solution-scope", 990,
        "Do not reveal a complete solution unless the explicit action is giveUp.",
        "prompt"),
      ...strategy.coachRules,
      ...input.learnerSelection.rules,
      actionRule(input.action),
      output.rule
    ],
    input.learnerSelection,
    output.contract
  );
}

function coachOutput(action: CoachSkillAction): {
  rule: SkillRule;
  contract: SkillPlan["output"];
} {
  if (action === "followUp") {
    return {
      rule: outputRule(
        "coach",
        "output.coach.follow-up-json",
        "output.format",
        900,
        "Return exactly one follow-up JSON object with answer and optional tiny_example, next_action, and boundary fields, without markdown.",
        "prompt-and-validator"
      ),
      contract: {
        id: "coach.follow-up-json-v1",
        mode: "coach-follow-up-json",
        responseFormat: "json_object"
      }
    };
  }
  return {
    rule: outputRule(
      "coach",
      "output.coach.json",
      "output.format",
      900,
      "Return exactly one valid teaching-diagnosis JSON object without markdown.",
      "prompt-and-validator"
    ),
    contract: {
      id: "coach.teaching-json-v1",
      mode: "teaching-json",
      responseFormat: "json_object"
    }
  };
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
    priority: 950,
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

export interface SkillRuleResolution {
  rules: SkillRule[];
  excludedRules: ExcludedSkillRule[];
}

export function resolveSkillRuleConflicts(
  candidates: SkillRule[],
  initialExcluded: readonly ExcludedSkillRule[] = []
): SkillRuleResolution {
  const excluded: ExcludedSkillRule[] = [...initialExcluded];
  const byId = new Map<string, SkillRule>();
  for (const candidate of candidates) {
    const previous = byId.get(candidate.id);
    if (!previous || compareRulePrecedence(candidate, previous) > 0) {
      if (previous) {
        excluded.push({ id: previous.id, reason: "duplicate" });
      }
      byId.set(candidate.id, candidate);
    } else {
      excluded.push({ id: candidate.id, reason: "duplicate" });
    }
  }

  const winners = new Map<string, SkillRule>();
  for (const candidate of byId.values()) {
    const previous = winners.get(candidate.policyKey);
    if (!previous) {
      winners.set(candidate.policyKey, candidate);
      continue;
    }
    if (compareRulePrecedence(candidate, previous) > 0) {
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
    rules,
    excludedRules: uniqueExcluded(excluded)
  };
}

function finalizePlan(
  route: SkillRoute,
  language: SkillPlan["language"],
  candidates: SkillRule[],
  learnerSelection: LearnerRuleSelection,
  output: SkillPlan["output"]
): SkillPlan {
  const scopeExcluded: ExcludedSkillRule[] = [];
  const scopedCandidates = candidates.filter((candidate) => {
    if (candidate.source !== "learner") {
      return true;
    }
    if (candidate.route !== route) {
      scopeExcluded.push({ id: candidate.id, reason: "route-mismatch" });
      return false;
    }
    if (candidate.language && candidate.language !== language) {
      scopeExcluded.push({ id: candidate.id, reason: "language-mismatch" });
      return false;
    }
    return true;
  });
  const resolution = resolveSkillRuleConflicts(
    scopedCandidates,
    [...learnerSelection.excludedRules, ...scopeExcluded]
  );
  const rules = resolution.rules;
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
      excludedRules: resolution.excludedRules,
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

function compareRulePrecedence(left: SkillRule, right: SkillRule): number {
  return SOURCE_PRECEDENCE[left.source] - SOURCE_PRECEDENCE[right.source] ||
    Number(left.strength === "hard") - Number(right.strength === "hard") ||
    left.priority - right.priority ||
    right.id.localeCompare(left.id) ||
    right.policyKey.localeCompare(left.policyKey);
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
