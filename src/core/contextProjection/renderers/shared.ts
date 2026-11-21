import type { ProjectionAudit } from "../../contracts";
import { LAYER_ORDER } from "../composeProjectionPlan";
import type {
  ProjectionPlan,
  ProjectionRendererId,
  ProjectionRule
} from "../types";

export function cloneAuditWithRenderer(
  plan: ProjectionPlan,
  renderer: ProjectionRendererId
): ProjectionAudit {
  return {
    route: plan.audit.route,
    language: plan.audit.language,
    renderer,
    includedRuleIds: [...plan.audit.includedRuleIds],
    excludedRules: plan.audit.excludedRules.map((item) => ({ ...item })),
    projectedItems: plan.audit.projectedItems.map((item) => ({ ...item })),
    characterBudgetUsed: plan.audit.characterBudgetUsed,
    characterBudgetMax: plan.audit.characterBudgetMax
  };
}

export function sanitizeSingleLine(text: string): string {
  return text.replace(/[\r\n]+/g, " ").replace(/\s+/g, " ").trim();
}

export function formatLayeredSystemPrompt(plan: ProjectionPlan): string {
  const sections: string[] = [];

  for (const layer of LAYER_ORDER) {
    const layerRules = plan.layers[layer];
    if (layerRules.length === 0) {
      continue;
    }
    const header = `[${layer}]`;
    const body = layerRules
      .map((rule) => `- (${rule.source}) ${rule.instruction.trim()}`)
      .join("\n");
    sections.push(`${header}\n${body}`);
  }

  return sections.join("\n\n");
}

export function recomputeAuditAfterOmissions(
  audit: ProjectionAudit,
  plan: ProjectionPlan,
  omitted: ReadonlyArray<{ rule: ProjectionRule; reason: string }>,
  useCompactMeasure: boolean
): ProjectionAudit {
  if (omitted.length === 0) {
    return audit;
  }

  const omittedIds = new Set(omitted.map((item) => item.rule.id));
  const remainingRules = plan.rules.filter((rule) => !omittedIds.has(rule.id));

  return {
    ...audit,
    includedRuleIds: remainingRules.map((rule) => rule.id),
    excludedRules: [
      ...audit.excludedRules,
      ...omitted.map((item) => ({ id: item.rule.id, reason: item.reason }))
    ],
    projectedItems: remainingRules
      .filter((rule) => rule.projectedItem !== undefined)
      .map((rule) => ({ ...rule.projectedItem! })),
    characterBudgetUsed: remainingRules.reduce((sum, rule) => {
      const text = useCompactMeasure
        ? (rule.compactInstruction ?? rule.instruction)
        : rule.instruction;
      return sum + text.trim().length;
    }, 0)
  };
}
