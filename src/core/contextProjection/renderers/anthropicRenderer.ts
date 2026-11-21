import type {
  AnthropicMessage,
  AnthropicRenderContext,
  ProjectionPlan,
  RenderedAnthropicRequest
} from "../types";
import {
  cloneAuditWithRenderer,
  formatLayeredSystemPrompt
} from "./shared";

function buildAutocompleteAnthropicUserTurn(
  prefix: string,
  suffix: string
): string {
  return [
    "Complete only the immediate local code at <cursor>.",
    "<prefix>",
    prefix,
    "</prefix>",
    "<suffix>",
    suffix,
    "</suffix>"
  ].join("\n");
}

function normalizeAnthropicMessages(
  raw: readonly AnthropicMessage[]
): AnthropicMessage[] {
  const merged: AnthropicMessage[] = [];
  for (const item of raw) {
    if (!item.content) {
      continue;
    }
    const prev = merged[merged.length - 1];
    if (prev && prev.role === item.role) {
      prev.content = `${prev.content}\n\n${item.content}`;
    } else {
      merged.push({ role: item.role, content: item.content });
    }
  }

  // Anthropic Messages API requires the first message to be a "user" turn.
  while (merged.length > 0 && merged[0]?.role === "assistant") {
    merged.shift();
  }

  return merged;
}

export function renderAnthropicMessages(
  plan: ProjectionPlan,
  context: AnthropicRenderContext
): RenderedAnthropicRequest {
  const system = formatLayeredSystemPrompt(plan);
  const rawMessages: AnthropicMessage[] = [];

  if (context.history) {
    for (const turn of context.history) {
      rawMessages.push({ role: turn.role, content: turn.content });
    }
  }

  if (plan.route === "autocomplete") {
    const prefix = context.prefix ?? "";
    const suffix = context.suffix ?? "";
    rawMessages.push({
      role: "user",
      content:
        context.userPrompt ?? buildAutocompleteAnthropicUserTurn(prefix, suffix)
    });
  } else if (context.userPrompt !== undefined && context.userPrompt.length > 0) {
    rawMessages.push({ role: "user", content: context.userPrompt });
  }

  const messages = normalizeAnthropicMessages(rawMessages);
  const audit = cloneAuditWithRenderer(plan, "anthropic-messages");

  return {
    system,
    messages,
    stopSequences: [...plan.output.stopSequences],
    maxTokens: plan.output.maxTokens,
    maxLines: plan.output.maxLines,
    audit
  };
}
