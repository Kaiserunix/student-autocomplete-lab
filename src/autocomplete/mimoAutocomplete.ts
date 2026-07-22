import { requestCompletion, type CompletionProviderConfig } from "../models/completionsClient";
import { providerCapabilitiesFor } from "../models/providerCapabilities";
import { composeAutocompleteSkillPlan } from "../skills/composeSkillPlan";
import { selectLearnerRules } from "../skills/habitSelector";
import { renderAutocompleteSkillPlan } from "../skills/renderers/skillRenderer";
import type {
  ProviderCapabilities,
  SkillPlanAudit
} from "../skills/types";
import {
  validateAutocompleteOutput,
  type AutocompleteRejectionReason,
  type AutocompleteValidationStatus
} from "../skills/validators/autocompleteOutputPolicy";
import {
  createEmptyStudentSkill,
  type StudentSkill
} from "../teaching/studentSkill";
import { stableAutocompleteFileLabel } from "./fileLabel";

export interface MimoAutocompleteInput {
  prefix: string;
  suffix: string;
  language: string;
  filePath: string;
  studentSkill?: StudentSkill;
  capabilities?: ProviderCapabilities;
  /** @deprecated Legacy habit strings are normalized through the controlled selector. */
  habits?: string[];
  signal?: AbortSignal;
}

export interface MimoAutocompleteResult {
  suggestion: string;
  status: AutocompleteValidationStatus;
  rejectionReason?: AutocompleteRejectionReason;
  audit: SkillPlanAudit;
}

export async function requestMimoAutocompleteDetailed(
  config: CompletionProviderConfig,
  input: MimoAutocompleteInput,
  fetchImpl: typeof fetch = fetch
): Promise<MimoAutocompleteResult> {
  const skill = input.studentSkill ?? skillFromLegacyHabits(input.habits);
  const learnerSelection = selectLearnerRules({
    skill,
    route: "autocomplete",
    language: input.language,
    localCode: input.prefix
  });
  const plan = composeAutocompleteSkillPlan({
    language: input.language,
    learnerSelection
  });
  const capabilities = input.capabilities ?? providerCapabilitiesFor({
    format: config.format ?? "openai-completions",
    baseUrl: "baseUrl" in config ? config.baseUrl : "codex://app-server"
  });
  const rendered = renderAutocompleteSkillPlan(plan, capabilities, {
    prefix: input.prefix,
    suffix: input.suffix,
    language: plan.language,
    fileLabel: stableAutocompleteFileLabel(input.filePath)
  });
  const raw = await requestCompletion(
    config,
    {
      prompt: rendered.prompt,
      systemInstruction: rendered.systemInstruction,
      suffix: rendered.suffix,
      stop: capabilities.supportsStopSequences ? rendered.stop : undefined,
      capabilities,
      maxTokens: 64,
      temperature: 0.1,
      signal: input.signal
    },
    fetchImpl
  );
  const validation = validateAutocompleteOutput(
    raw,
    rendered.maxLines,
    plan.language
  );
  return {
    ...validation,
    audit: rendered.audit
  };
}

export async function requestMimoAutocomplete(
  config: CompletionProviderConfig,
  input: MimoAutocompleteInput,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  return (await requestMimoAutocompleteDetailed(config, input, fetchImpl)).suggestion;
}

function skillFromLegacyHabits(habits: string[] | undefined): StudentSkill {
  const skill = createEmptyStudentSkill("legacy-autocomplete");
  skill.codeHabits.globalRules = [...(habits ?? [])];
  return skill;
}
