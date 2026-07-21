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
