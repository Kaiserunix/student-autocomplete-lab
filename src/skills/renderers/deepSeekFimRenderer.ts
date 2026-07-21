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
  const learnerRules = plan.rules.filter((rule) => rule.source === "learner");
  const renderedLearnerId = strategy.commentPrefix ? learnerRules[0]?.id : undefined;
  const physicalRules = plan.rules.filter(
    (rule) => rule.source !== "learner" || rule.id === renderedLearnerId
  );
  const omittedLearnerRules = learnerRules.filter(
    (rule) => rule.id !== renderedLearnerId
  );
  const omittedPromptOnlyRules = strategy.commentPrefix
    ? []
    : physicalRules.filter((rule) => rule.enforcement === "prompt");
  const prompt = strategy.commentPrefix
    ? physicalRules
        .map((rule) =>
          strategy.commentPrefix + " skill " + rule.layer + ": " +
            (rule.compactInstruction ?? rule.id)
        )
        .join("\n") + "\n" + context.prefix
    : context.prefix;
  const audit = stampRenderer(plan, "deepseek-fim");
  if (omittedLearnerRules.length > 0 || omittedPromptOnlyRules.length > 0) {
    const omittedIds = new Set(
      [...omittedLearnerRules, ...omittedPromptOnlyRules].map((rule) => rule.id)
    );
    audit.includedRuleIds = audit.includedRuleIds.filter((id) => !omittedIds.has(id));
    audit.excludedRules = [
      ...audit.excludedRules,
      ...omittedLearnerRules.map((rule) => ({
        id: rule.id,
        reason: strategy.commentPrefix
          ? "renderer-budget" as const
          : "renderer-unsupported" as const
      })),
      ...omittedPromptOnlyRules.map((rule) => ({
        id: rule.id,
        reason: "renderer-unsupported" as const
      }))
    ];
    audit.learnerRuleCount = physicalRules.filter(
      (rule) => rule.source === "learner"
    ).length;
    audit.learnerCharacterCount = physicalRules
      .filter((rule) => rule.source === "learner")
      .reduce((sum, rule) => sum + rule.instruction.length, 0);
    const includedIds = new Set(audit.includedRuleIds);
    audit.enforcementKinds = [...new Set(
      plan.rules
        .filter((rule) => includedIds.has(rule.id))
        .map((rule) => rule.enforcement)
    )].sort();
  }

  return {
    prompt,
    suffix: context.suffix,
    stop: strategy.stopSequences,
    maxLines: plan.output.maxLines ?? 3,
    audit
  };
}
