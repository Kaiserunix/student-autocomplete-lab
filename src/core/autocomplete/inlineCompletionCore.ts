import type {
  GhostTextMode,
  LexicalZoneResult,
  ProjectionAudit
} from "../contracts";
import {
  composeProjectionPlan,
  createSafeAuditView,
  renderAnthropicMessages,
  renderChatMessages,
  renderDeepSeekFim,
  renderGenericCompletion,
  type ProjectionPlan,
  type ProjectionRendererId,
  type ProjectionRule,
  type RenderedAnthropicRequest,
  type RenderedChatRequest,
  type RenderedFimRequest,
  type RenderedGenericCompletionRequest,
  type SafeProjectionAuditView
} from "../contextProjection";
import {
  evaluateAdaptiveTrigger,
  type TriggerDecision,
  type TriggerKind,
  type TriggerSignals
} from "./adaptiveTriggerPolicy";
import {
  buildIsolatedAutocompleteContext,
  habitsToProjectionRules,
  type AutocompleteContextInput,
  type IsolatedAutocompleteContext
} from "./contextGate";
import { classifyLexicalZone } from "./lexicalZoneClassifier";
import {
  evaluateAutocompleteOutput,
  type AutocompleteRejectionReason,
  type OutputPolicyResult,
  type PlaceholderRange
} from "./outputPolicy";

export type RenderedAutocompleteRequest =
  | { renderer: "deepseek-fim"; payload: RenderedFimRequest }
  | { renderer: "chat-messages"; payload: RenderedChatRequest }
  | { renderer: "anthropic-messages"; payload: RenderedAnthropicRequest }
  | { renderer: "generic-completion"; payload: RenderedGenericCompletionRequest };

export type AutocompleteTransport = (
  request: RenderedAutocompleteRequest,
  signal?: AbortSignal
) => Promise<string>;

export interface PrepareInlineCompletionInput {
  mode: GhostTextMode;
  triggerKind: TriggerKind;
  context: AutocompleteContextInput;
  signals?: TriggerSignals;
  activeFunctionName?: string;
  renderer?: ProjectionRendererId;
  nowMs?: number;
}

export interface PreparedInlineCompletion {
  shouldInvokeTransport: boolean;
  zone: LexicalZoneResult;
  trigger: TriggerDecision;
  isolatedContext?: IsolatedAutocompleteContext;
  plan?: ProjectionPlan;
  renderedRequest?: RenderedAutocompleteRequest;
  audit?: ProjectionAudit;
  safeAuditView?: SafeProjectionAuditView;
}

export interface InlineCompletionPipelineInput
  extends PrepareInlineCompletionInput {
  transport: AutocompleteTransport;
  signal?: AbortSignal;
  precomputed?: PreparedInlineCompletion;
}

export type InlineCompletionDecisionStatus =
  | "suppressed"
  | "accepted"
  | "empty"
  | "rejected"
  | "aborted"
  | "transport-error";

export interface InlineCompletionPipelineResult {
  status: InlineCompletionDecisionStatus;
  zone: LexicalZoneResult;
  trigger: TriggerDecision;
  suggestion: string;
  placeholders: PlaceholderRange[];
  primaryPlaceholder?: PlaceholderRange;
  rejectionReason?: AutocompleteRejectionReason;
  outputPolicy?: OutputPolicyResult;
  isolatedContext?: IsolatedAutocompleteContext;
  renderedRequest?: RenderedAutocompleteRequest;
  audit?: ProjectionAudit;
  safeAuditView?: SafeProjectionAuditView;
  errorMessage?: string;
}

function createZoneActionRule(zone: LexicalZoneResult): ProjectionRule {
  if (zone.zone === "algo_core") {
    return {
      id: "action.autocomplete.algo-core-faded",
      policyKey: "action.completion-scope",
      route: "autocomplete",
      layer: "body",
      source: "action",
      priority: 750,
      instruction:
        "High-spoiler algorithmic slot: emit at most 1 short skeletal line with plain-text placeholders like /* 条件 */ or /* 转移 */ instead of solving the condition.",
      compactInstruction:
        "1 line skeleton max; use /* 条件 */ placeholder instead of solving logic",
      enforcement: "both"
    };
  }
  if (zone.zone === "neutral") {
    return {
      id: "action.autocomplete.neutral-single-line",
      policyKey: "action.completion-scope",
      route: "autocomplete",
      layer: "body",
      source: "action",
      priority: 720,
      instruction:
        "Neutral statement slot: emit at most 1 concise line without nested control flow or loop state transitions.",
      compactInstruction: "1 concise line max; no nested control flow",
      enforcement: "both"
    };
  }
  return {
    id: `action.autocomplete.${zone.zone}`,
    policyKey: "action.completion-scope",
    route: "autocomplete",
    layer: "body",
    source: "action",
    priority: 700,
    instruction:
      "Boilerplate or API syntax slot: complete only the immediate mechanical shell in 1 to 3 lines.",
    compactInstruction: "mechanical shell or API syntax only (1-3 lines)",
    enforcement: "both"
  };
}

function renderForTarget(
  renderer: ProjectionRendererId,
  plan: ProjectionPlan,
  isolatedContext: IsolatedAutocompleteContext
): RenderedAutocompleteRequest {
  switch (renderer) {
    case "deepseek-fim":
      return {
        renderer: "deepseek-fim",
        payload: renderDeepSeekFim(plan, {
          prefix: isolatedContext.prefix,
          suffix: isolatedContext.suffix
        })
      };
    case "chat-messages":
      return {
        renderer: "chat-messages",
        payload: renderChatMessages(plan, {
          prefix: isolatedContext.prefix,
          suffix: isolatedContext.suffix
        })
      };
    case "anthropic-messages":
      return {
        renderer: "anthropic-messages",
        payload: renderAnthropicMessages(plan, {
          prefix: isolatedContext.prefix,
          suffix: isolatedContext.suffix
        })
      };
    case "generic-completion":
      return {
        renderer: "generic-completion",
        payload: renderGenericCompletion(plan, {
          prefix: isolatedContext.prefix,
          suffix: isolatedContext.suffix,
          includeSuffixHint: true
        })
      };
  }
}

/**
 * Synchronous pre-flight step (classify -> adaptive trigger -> context gate -> projection render).
 * Allows IDE hosts to check `trigger.shouldTrigger` and `trigger.debounceMs` before firing network calls.
 */
export function prepareInlineCompletionRequest(
  input: PrepareInlineCompletionInput
): PreparedInlineCompletion {
  // Classify on raw editor prefix/suffix so anti-Shepherding sees preceding comments accurately
  const zone = classifyLexicalZone({
    language: input.context.language,
    prefix: input.context.prefix,
    suffix: input.context.suffix,
    activeFunctionName: input.activeFunctionName
  });

  const trigger = evaluateAdaptiveTrigger({
    mode: input.mode,
    triggerKind: input.triggerKind,
    zoneResult: zone,
    signals: input.signals,
    nowMs: input.nowMs
  });

  if (!trigger.shouldTrigger) {
    return {
      shouldInvokeTransport: false,
      zone,
      trigger
    };
  }

  // Physical context isolation gate strips natural-language comments & forbids spoiler fields
  const isolatedContext = buildIsolatedAutocompleteContext(input.context);

  const renderer = input.renderer ?? "deepseek-fim";
  const stopSequences = ["\n\n", "```"];

  const extraRules: ProjectionRule[] = [
    createZoneActionRule(zone),
    ...habitsToProjectionRules(isolatedContext.habits, isolatedContext.language)
  ];

  const plan = composeProjectionPlan({
    route: "autocomplete",
    language: isolatedContext.language,
    renderer,
    rules: extraRules,
    output: {
      maxLines: trigger.maxLines,
      maxTokens: trigger.maxTokens,
      stopSequences,
      format: "code"
    }
  });

  const renderedRequest = renderForTarget(renderer, plan, isolatedContext);
  const audit = renderedRequest.payload.audit;
  const safeAuditView = createSafeAuditView(audit);

  return {
    shouldInvokeTransport: true,
    zone,
    trigger,
    isolatedContext,
    plan,
    renderedRequest,
    audit,
    safeAuditView
  };
}

/**
 * Full pure-TS anti-spoiler inline completion pipeline:
 * classify -> trigger policy -> isolated context gate -> stateless projection ->
 * transport callback -> output policy filter & placeholder extraction.
 */
export async function runInlineCompletionPipeline(
  input: InlineCompletionPipelineInput
): Promise<InlineCompletionPipelineResult> {
  if (input.signal?.aborted) {
    const zone = classifyLexicalZone({
      language: input.context.language,
      prefix: input.context.prefix,
      suffix: input.context.suffix,
      activeFunctionName: input.activeFunctionName
    });
    const trigger = evaluateAdaptiveTrigger({
      mode: input.mode,
      triggerKind: input.triggerKind,
      zoneResult: zone,
      signals: input.signals,
      nowMs: input.nowMs
    });
    return {
      status: "aborted",
      zone,
      trigger,
      suggestion: "",
      placeholders: []
    };
  }

  const prepared = input.precomputed ?? prepareInlineCompletionRequest(input);

  if (!prepared.shouldInvokeTransport || !prepared.renderedRequest || !prepared.isolatedContext) {
    return {
      status: "suppressed",
      zone: prepared.zone,
      trigger: prepared.trigger,
      suggestion: "",
      placeholders: []
    };
  }

  let rawOutput: string;
  try {
    rawOutput = await input.transport(prepared.renderedRequest, input.signal);
  } catch (err) {
    if (input.signal?.aborted) {
      return {
        status: "aborted",
        zone: prepared.zone,
        trigger: prepared.trigger,
        suggestion: "",
        placeholders: [],
        isolatedContext: prepared.isolatedContext,
        renderedRequest: prepared.renderedRequest,
        audit: prepared.audit,
        safeAuditView: prepared.safeAuditView
      };
    }
    const rawMessage = err instanceof Error ? err.message : String(err);
    const sanitizedError = rawMessage
      .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, "[REDACTED_KEY]")
      .replace(/\bBearer\s+[A-Za-z0-9._-]{8,}\b/gi, "Bearer [REDACTED]");
    return {
      status: "transport-error",
      zone: prepared.zone,
      trigger: prepared.trigger,
      suggestion: "",
      placeholders: [],
      isolatedContext: prepared.isolatedContext,
      renderedRequest: prepared.renderedRequest,
      audit: prepared.audit,
      safeAuditView: prepared.safeAuditView,
      errorMessage: sanitizedError
    };
  }

  if (input.signal?.aborted) {
    return {
      status: "aborted",
      zone: prepared.zone,
      trigger: prepared.trigger,
      suggestion: "",
      placeholders: [],
      isolatedContext: prepared.isolatedContext,
      renderedRequest: prepared.renderedRequest,
      audit: prepared.audit,
      safeAuditView: prepared.safeAuditView
    };
  }

  const outputPolicy = evaluateAutocompleteOutput({
    raw: rawOutput,
    zone: prepared.zone.zone,
    language: prepared.isolatedContext.language,
    maxLines: prepared.trigger.maxLines,
    maxTokens: prepared.trigger.maxTokens,
    prefix: prepared.isolatedContext.prefix
  });

  if (outputPolicy.status === "model-empty") {
    return {
      status: "empty",
      zone: prepared.zone,
      trigger: prepared.trigger,
      suggestion: "",
      placeholders: [],
      outputPolicy,
      isolatedContext: prepared.isolatedContext,
      renderedRequest: prepared.renderedRequest,
      audit: prepared.audit,
      safeAuditView: prepared.safeAuditView
    };
  }

  if (outputPolicy.status === "rejected") {
    return {
      status: "rejected",
      zone: prepared.zone,
      trigger: prepared.trigger,
      suggestion: "",
      placeholders: [],
      rejectionReason: outputPolicy.rejectionReason,
      outputPolicy,
      isolatedContext: prepared.isolatedContext,
      renderedRequest: prepared.renderedRequest,
      audit: prepared.audit,
      safeAuditView: prepared.safeAuditView
    };
  }

  return {
    status: "accepted",
    zone: prepared.zone,
    trigger: prepared.trigger,
    suggestion: outputPolicy.suggestion,
    placeholders: outputPolicy.placeholders,
    primaryPlaceholder: outputPolicy.primaryPlaceholder,
    outputPolicy,
    isolatedContext: prepared.isolatedContext,
    renderedRequest: prepared.renderedRequest,
    audit: prepared.audit,
    safeAuditView: prepared.safeAuditView
  };
}
