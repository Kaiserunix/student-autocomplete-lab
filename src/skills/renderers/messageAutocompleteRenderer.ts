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
