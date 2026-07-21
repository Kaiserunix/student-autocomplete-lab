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
