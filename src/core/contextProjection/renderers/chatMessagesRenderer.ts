import type {
  ChatMessage,
  ChatRenderContext,
  ProjectionPlan,
  RenderedChatRequest
} from "../types";
import {
  cloneAuditWithRenderer,
  formatLayeredSystemPrompt
} from "./shared";

function buildAutocompleteUserTurn(prefix: string, suffix: string): string {
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

export function renderChatMessages(
  plan: ProjectionPlan,
  context: ChatRenderContext
): RenderedChatRequest {
  const messages: ChatMessage[] = [];
  const systemPrompt = formatLayeredSystemPrompt(plan);
  if (systemPrompt.length > 0) {
    messages.push({ role: "system", content: systemPrompt });
  }

  if (context.history) {
    for (const turn of context.history) {
      if (turn.role === "system") {
        continue;
      }
      messages.push({ role: turn.role, content: turn.content });
    }
  }

  if (plan.route === "autocomplete") {
    const prefix = context.prefix ?? "";
    const suffix = context.suffix ?? "";
    messages.push({
      role: "user",
      content: context.userPrompt ?? buildAutocompleteUserTurn(prefix, suffix)
    });
  } else if (context.userPrompt !== undefined && context.userPrompt.length > 0) {
    messages.push({
      role: "user",
      content: context.userPrompt
    });
  }

  const audit = cloneAuditWithRenderer(plan, "chat-messages");

  return {
    messages,
    stop: [...plan.output.stopSequences],
    maxTokens: plan.output.maxTokens,
    maxLines: plan.output.maxLines,
    audit
  };
}
