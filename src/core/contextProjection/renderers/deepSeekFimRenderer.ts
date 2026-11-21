import { getLanguageProjectionStrategy } from "../languageRegistry";
import type {
  FimRenderContext,
  ProjectionPlan,
  ProjectionRule,
  RenderedFimRequest
} from "../types";
import {
  cloneAuditWithRenderer,
  recomputeAuditAfterOmissions,
  sanitizeSingleLine
} from "./shared";

const MAX_FIM_LEARNER_RULES = 2;
const MAX_FIM_LEARNER_CHARS = 160;

export function renderDeepSeekFim(
  plan: ProjectionPlan,
  context: FimRenderContext
): RenderedFimRequest {
  const strategy = getLanguageProjectionStrategy(plan.language);
  const commentPrefix = strategy.commentPrefix;

  const omitted: Array<{ rule: ProjectionRule; reason: string }> = [];
  const physicalRules: ProjectionRule[] = [];
  let learnerRuleCount = 0;
  let learnerCharCount = 0;

  for (const rule of plan.rules) {
    if (!commentPrefix) {
      if (rule.enforcement === "prompt") {
        omitted.push({ rule, reason: "renderer-unsupported" });
      }
      continue;
    }

    if (rule.source === "learner") {
      const compact = sanitizeSingleLine(
        rule.compactInstruction ?? rule.instruction
      );
      if (
        learnerRuleCount >= MAX_FIM_LEARNER_RULES ||
        learnerCharCount + compact.length > MAX_FIM_LEARNER_CHARS
      ) {
        omitted.push({ rule, reason: "renderer-budget" });
        continue;
      }
      learnerRuleCount += 1;
      learnerCharCount += compact.length;
    }

    physicalRules.push(rule);
  }

  let prompt: string;
  if (commentPrefix && physicalRules.length > 0) {
    const preamble = physicalRules
      .map((rule) => {
        const text = sanitizeSingleLine(
          rule.compactInstruction ?? rule.instruction
        );
        return `${commentPrefix} [ac:${rule.layer}] ${text}`;
      })
      .join("\n");
    prompt = `${preamble}\n${context.prefix}`;
  } else {
    prompt = context.prefix;
  }

  const baseAudit = cloneAuditWithRenderer(plan, "deepseek-fim");
  const audit = recomputeAuditAfterOmissions(baseAudit, plan, omitted, true);

  return {
    prompt,
    // Invariant: DeepSeek FIM suffix MUST remain byte-for-byte identical.
    suffix: context.suffix,
    stop: [...plan.output.stopSequences],
    maxLines: plan.output.maxLines ?? 3,
    maxTokens: plan.output.maxTokens ?? 64,
    audit
  };
}
