import type { AiProviderMode } from "../config/modelEnv";
import type { InternalTestSummary } from "../internalTesting/internalTestRecorder";
import type { ProviderModelInfo } from "../models/providerModelsClient";
import type { ProblemSetSearchResult } from "../problemBank/types";
import type { OjSubmissionPreview, OjSubmissionResult } from "../submission/types";
import type { OjPlatformId, OjProviderStatusView } from "../oj/types";
import type { AiHealthCheckResult, ProblemBankStateView } from "./stateView";

export const hostEventTypeNames = [
  "aiHealthCheckResult",
  "aiModelResults",
  "autocompletePreview",
  "coachFollowUp",
  "internalTestSummary",
  "ojSubmissionPreview",
  "ojSubmissionResult",
  "ojProblemSearchResults",
  "ojProviderStatus",
  "optimizationReport",
  "problemBankState",
  "problemRecommendation",
  "problemSetSearchResults",
  "status",
  "submissionJudge",
  "teachingDiagnosis"
] as const;

export type HostEventType = (typeof hostEventTypeNames)[number];

export interface StatusHostEvent {
  type: "status";
  text: string;
  tone?: string;
}

export interface ProblemSetSearchResultsHostEvent {
  type: "problemSetSearchResults";
  keyword: string;
  total: number;
  items: ProblemSetSearchResult[];
}

export interface AiModelResultsHostEvent {
  type: "aiModelResults";
  mode: AiProviderMode;
  endpoint: string;
  models: ProviderModelInfo[];
  status: string;
}

export interface AiHealthCheckResultHostEvent {
  type: "aiHealthCheckResult";
  result: AiHealthCheckResult;
  status: string;
}

export interface InternalTestSummaryHostEvent {
  type: "internalTestSummary";
  summary: InternalTestSummary;
  status: string;
}

export interface OjSubmissionPreviewHostEvent {
  type: "ojSubmissionPreview";
  preview: OjSubmissionPreview;
  toolVersion?: string;
  status: string;
}

export interface OjSubmissionResultHostEvent {
  type: "ojSubmissionResult";
  problemKey: string;
  result: OjSubmissionResult;
  status: string;
}

export interface OjProblemSearchResultsHostEvent {
  type: "ojProblemSearchResults";
  platform: OjPlatformId;
  query: string;
  items: Array<{
    platform: OjPlatformId;
    nativeId: string;
    title: string;
    sourceUrl: string;
    difficulty?: string;
    tags: string[];
    canImport: boolean;
  }>;
  nextCursor?: string;
  providers: OjProviderStatusView[];
}

export interface OjProviderStatusHostEvent {
  type: "ojProviderStatus";
  providers: OjProviderStatusView[];
  status: string;
}

export type LooseTypedHostEvent =
  | { type: "autocompletePreview"; [key: string]: unknown }
  | { type: "coachFollowUp"; [key: string]: unknown }
  | { type: "optimizationReport"; [key: string]: unknown }
  | { type: "problemRecommendation"; [key: string]: unknown }
  | { type: "submissionJudge"; [key: string]: unknown }
  | { type: "teachingDiagnosis"; [key: string]: unknown };

export type HostEvent =
  | StatusHostEvent
  | ProblemBankStateView
  | ProblemSetSearchResultsHostEvent
  | AiModelResultsHostEvent
  | AiHealthCheckResultHostEvent
  | InternalTestSummaryHostEvent
  | OjSubmissionPreviewHostEvent
  | OjSubmissionResultHostEvent
  | OjProblemSearchResultsHostEvent
  | OjProviderStatusHostEvent
  | LooseTypedHostEvent;
