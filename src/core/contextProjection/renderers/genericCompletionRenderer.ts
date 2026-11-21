import { getLanguageProjectionStrategy } from "../languageRegistry";
import type {
  GenericCompletionRenderContext,
  ProjectionPlan,
  RenderedGenericCompletionRequest
} from "../types";
import {
  cloneAuditWithRenderer,
  sanitizeSingleLine
} from "./shared";

const DEFAULT_SUFFIX_HINT_CHARS = 240;

export function renderGenericCompletion(
  plan: ProjectionPlan,
  context: GenericCompletionRenderContext
): RenderedGenericCompletionRequest {
  const strategy = getLanguageProjectionStrategy(plan.language);
  const prefixMarker = strategy.commentPrefix ?? "#";

  const headerLines = plan.rules.map((rule) => {
    const text = sanitizeSingleLine(
      rule.compactInstruction ?? rule.instruction
    );
    return `${prefixMarker} [ac:${rule.layer}] ${text}`;
  });

  if (context.includeSuffixHint && context.suffix && context.suffix.trim().length > 0) {
    const maxHint = context.maxSuffixHintChars ?? DEFAULT_SUFFIX_HINT_CHARS;
    const boundedSuffix = sanitizeSingleLine(context.suffix).slice(0, maxHint);
    if (boundedSuffix.length > 0) {
      headerLines.push(`${prefixMarker} [ac:suffix-hint] ${boundedSuffix}`);
    }
  }

  const prompt =
    headerLines.length > 0
      ? `${headerLines.join("\n")}\n${context.prefix}`
      : context.prefix;

  const audit = cloneAuditWithRenderer(plan, "generic-completion");

  return {
    prompt,
    stop: [...plan.output.stopSequences],
    maxLines: plan.output.maxLines ?? 3,
    maxTokens: plan.output.maxTokens ?? 64,
    audit
  };
}
