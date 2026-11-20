import {
  requestMimoAutocompleteDetailed,
  type MimoAutocompleteInput,
  type MimoAutocompleteResult
} from "../autocomplete/mimoAutocomplete";
import type {
  AiProviderMode,
  AutocompleteProviderConfig,
  ModelEnv,
  TeachingProviderConfig
} from "../config/modelEnv";
import type { ProblemRecord } from "../problemBank/types";
import type { ProviderCapabilities } from "../skills/types";
import {
  requestMimoCoachFollowUpWithSkills,
  type CoachFollowUpContext,
  type CoachFollowUpReport,
  type CoachFollowUpSkillOptions
} from "../teaching/coachFollowUp";
import {
  requestMimoLessonReport,
  type LessonReport,
  type LessonReportContext
} from "../teaching/lessonReport";
import {
  requestMimoTeachingDiagnosisWithSkills,
  type TeachingDiagnosisSkillOptions
} from "../teaching/mimoTeacher";
import {
  requestMimoOptimizationReport,
  type OptimizationReport,
  type OptimizationReportContext
} from "../teaching/optimizationReport";
import {
  requestMimoSolutionScore,
  type SolutionScoreContext,
  type SolutionScoreReport
} from "../teaching/solutionScore";
import {
  requestMimoSubmissionJudge,
  type SubmissionJudgeContext,
  type SubmissionJudgeReport
} from "../teaching/submissionJudge";
import {
  requestMimoTeacherPack,
  type TeacherPackRecord
} from "../teaching/teacherPack";
import type { TeachingDiagnosisReport } from "../teaching/teachingReport";
import type { TeachingDiagnosisContext } from "../teaching/types";
import type { ChatCompletionProviderConfig, ChatCompletionUsageSink } from "./chatCompletionsClient";
import type { CompletionProviderConfig } from "./completionsClient";
import { routeAutocompleteModel, routeTeachingModel } from "./modelRouter";
import type { ModelTextTransport } from "./modelTextTransport";
import type { CodexOAuthProviderConfig, ModelProtocolFormat, ModelRoute } from "./providerContracts";

export interface TeachingModelAdapter {
  readonly model: string;
  readonly providerMode: AiProviderMode;
  readonly endpoint: string;
  readonly format: ModelProtocolFormat;
  readonly capabilities: ProviderCapabilities;
  readonly config: ChatCompletionProviderConfig;
  diagnose(
    context: TeachingDiagnosisContext,
    options?: TeachingDiagnosisSkillOptions
  ): Promise<TeachingDiagnosisReport>;
  followUp(
    context: CoachFollowUpContext,
    options?: CoachFollowUpSkillOptions
  ): Promise<CoachFollowUpReport>;
  generateLessonReport(context: LessonReportContext): Promise<LessonReport>;
  scoreSolution(context: SolutionScoreContext): Promise<SolutionScoreReport>;
  reviewOptimization(context: OptimizationReportContext): Promise<OptimizationReport>;
  judgeSubmission(context: SubmissionJudgeContext): Promise<SubmissionJudgeReport>;
  generateTeacherPack(problem: ProblemRecord, generatedAt?: string): Promise<TeacherPackRecord>;
}

export interface AutocompleteModelAdapter {
  readonly model: string;
  readonly providerMode: AiProviderMode;
  readonly endpoint: string;
  readonly format: ModelProtocolFormat;
  readonly capabilities: ProviderCapabilities;
  readonly config: CompletionProviderConfig;
  completeDetailed(
    input: Omit<MimoAutocompleteInput, "capabilities">
  ): Promise<MimoAutocompleteResult>;
  complete(input: Omit<MimoAutocompleteInput, "capabilities">): Promise<string>;
}

export interface ProviderAdapterOptions {
  oauthTransport?: ModelTextTransport;
  fetchImpl?: typeof fetch;
  onUsage?: ChatCompletionUsageSink;
}

export function createTeachingModelAdapter(
  route: ModelRoute<TeachingProviderConfig | CodexOAuthProviderConfig>,
  options: Omit<ProviderAdapterOptions, "oauthTransport"> = {}
): TeachingModelAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const { config, capabilities } = route;

  return {
    model: route.model,
    providerMode: route.providerMode,
    endpoint: route.endpoint,
    format: route.format,
    capabilities,
    config,
    diagnose(context, skillOptions = {}) {
      return requestMimoTeachingDiagnosisWithSkills(
        config,
        context,
        {
          ...skillOptions,
          capabilities: skillOptions.capabilities ?? capabilities
        },
        fetchImpl,
        options.onUsage
      );
    },
    followUp(context, skillOptions = {}) {
      return requestMimoCoachFollowUpWithSkills(
        config,
        context,
        {
          ...skillOptions,
          capabilities: skillOptions.capabilities ?? capabilities
        },
        fetchImpl,
        options.onUsage
      );
    },
    generateLessonReport(context) {
      return requestMimoLessonReport(config, context, fetchImpl);
    },
    scoreSolution(context) {
      return requestMimoSolutionScore(config, context, fetchImpl);
    },
    reviewOptimization(context) {
      return requestMimoOptimizationReport(config, context, fetchImpl, options.onUsage);
    },
    judgeSubmission(context) {
      return requestMimoSubmissionJudge(config, context, fetchImpl);
    },
    generateTeacherPack(problem, generatedAt) {
      return requestMimoTeacherPack(config, problem, fetchImpl, options.onUsage, generatedAt);
    }
  };
}

export function createAutocompleteModelAdapter(
  route: ModelRoute<AutocompleteProviderConfig | CodexOAuthProviderConfig>,
  options: Pick<ProviderAdapterOptions, "fetchImpl"> = {}
): AutocompleteModelAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const { config, capabilities } = route;

  return {
    model: route.model,
    providerMode: route.providerMode,
    endpoint: route.endpoint,
    format: route.format,
    capabilities,
    config,
    completeDetailed(input) {
      return requestMimoAutocompleteDetailed(
        config,
        {
          ...input,
          capabilities
        },
        fetchImpl
      );
    },
    async complete(input) {
      const detailed = await requestMimoAutocompleteDetailed(
        config,
        {
          ...input,
          capabilities
        },
        fetchImpl
      );
      return detailed.suggestion;
    }
  };
}

export function routeTeachingModelAdapter(
  env: ModelEnv,
  options: ProviderAdapterOptions = {}
): TeachingModelAdapter {
  return createTeachingModelAdapter(routeTeachingModel(env, options.oauthTransport), options);
}

export function routeAutocompleteModelAdapter(
  env: ModelEnv,
  options: ProviderAdapterOptions = {}
): AutocompleteModelAdapter {
  return createAutocompleteModelAdapter(routeAutocompleteModel(env, options.oauthTransport), options);
}
