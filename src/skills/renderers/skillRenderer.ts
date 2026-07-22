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
