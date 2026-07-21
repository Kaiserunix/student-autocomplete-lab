import {
  ChatCompletionProviderConfig,
  type ChatCompletionUsageSink,
  requestChatCompletionText
} from "../models/chatCompletionsClient";
import { providerCapabilitiesFor } from "../models/providerCapabilities";
import { composeCoachSkillPlan } from "../skills/composeSkillPlan";
import { selectLearnerRules } from "../skills/habitSelector";
import { renderCoachSkillPlan } from "../skills/renderers/skillRenderer";
import type {
  CoachSkillAction,
  ProviderCapabilities,
  SkillPlanAudit
} from "../skills/types";
import { createEmptyStudentSkill, type StudentSkill } from "./studentSkill";
import { parseTeachingDiagnosisReport, TeachingDiagnosisReport } from "./teachingReport";
import { buildTeachingDiagnosisPrompt } from "./teachingPrompt";
import { normalizeTeachingDiagnosisReport } from "./teachingTaxonomy";
import { TeachingDiagnosisContext } from "./types";

export interface TeachingDiagnosisSkillOptions {
  studentSkill?: StudentSkill;
  action?: CoachSkillAction;
  capabilities?: ProviderCapabilities;
  onAudit?: (audit: SkillPlanAudit) => void;
}

export async function requestMimoTeachingDiagnosis(
  config: ChatCompletionProviderConfig,
  context: TeachingDiagnosisContext,
  fetchImpl: typeof fetch = fetch,
  onUsage?: ChatCompletionUsageSink
): Promise<TeachingDiagnosisReport> {
  return requestMimoTeachingDiagnosisWithSkills(
    config,
    context,
    {},
    fetchImpl,
    onUsage
  );
}

export async function requestMimoTeachingDiagnosisWithSkills(
  config: ChatCompletionProviderConfig,
  context: TeachingDiagnosisContext,
  options: TeachingDiagnosisSkillOptions,
  fetchImpl: typeof fetch = fetch,
  onUsage?: ChatCompletionUsageSink
): Promise<TeachingDiagnosisReport> {
  const skill = options.studentSkill ?? createEmptyStudentSkill("legacy-coach");
  const learnerSelection = selectLearnerRules({
    skill,
    route: "coach",
    language: context.language,
    localCode: context.studentCode
  });
  const plan = composeCoachSkillPlan({
    language: context.language,
    action: options.action ?? "hint",
    learnerSelection
  });
  const capabilities = options.capabilities ?? providerCapabilitiesFor({
    format: config.format ?? "openai-chat",
    baseUrl: "baseUrl" in config ? config.baseUrl : "codex://app-server"
  });
  const rendered = renderCoachSkillPlan(
    plan,
    capabilities,
    buildTeachingDiagnosisPrompt(context)
  );
  options.onAudit?.(rendered.audit);

  const text = await requestChatCompletionText(
    config,
    {
      messages: rendered.messages,
      maxTokens: 1000,
      temperature: 0.2,
      responseFormat: { type: "json_object" },
      onUsage
    },
    fetchImpl
  );

  return parseAndNormalizeTeachingReport(text, context);
}

function parseAndNormalizeTeachingReport(
  text: string,
  context: TeachingDiagnosisContext
): TeachingDiagnosisReport {
  try {
    return normalizeTeachingDiagnosisReport(parseTeachingDiagnosisReport(text), {
      currentProblemId: context.problem.id,
      problemSummary: context.problem.summary
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const preview = text.slice(0, 240).replace(/\s+/g, " ").trim();
    throw new Error(
      "MiMo teaching diagnosis returned invalid JSON: " +
      message +
      ". Preview: " +
      (preview || "<empty>")
    );
  }
}
