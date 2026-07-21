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
