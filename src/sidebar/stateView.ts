import type { AiConfigView } from "../config/modelEnv";
import type { CodexAuthState } from "../codex/codexAuthService";
import type { CodexModelInfo } from "../codex/codexModelService";
import type { AttemptSession } from "../attempt/schema";
import type { InternalTestSummary } from "../internalTesting/internalTestRecorder";
import type { ProblemRecord } from "../problemBank/types";
import type { SkillPlanAudit } from "../skills/types";
import type { AutocompleteValidationStatus } from "../skills/validators/autocompleteOutputPolicy";
import type { StudentSkill } from "../teaching/studentSkill";
import type { CompletedProblemRecord } from "./problemArchive";

export type UiLanguage = "zh" | "en";

export interface SavedProblemRecord extends ProblemRecord {
  savedAt: string;
  sourceSetId?: string;
}

export interface StarterPreset {
  id: string;
  title: string;
  subtitle: string;
  problemIds: string[];
  painPoints: string[];
}

export type AiHealthCheckStepStatus = "pass" | "fail";

export interface AiHealthCheckStep {
  status: AiHealthCheckStepStatus;
  endpoint?: string;
  model?: string;
  format?: string;
  renderer?: SkillPlanAudit["renderer"];
  validationStatus?: AutocompleteValidationStatus;
  keyState?: "provided" | "saved" | "missing";
  count?: number;
  error?: string;
  errorHint?: string;
  latencyMs?: number;
}

export interface AiHealthCheckResult {
  checkedAt: string;
  providerMode?: string;
  models: AiHealthCheckStep;
  chatSmoke: AiHealthCheckStep;
  autocompleteSmoke: AiHealthCheckStep;
}

export interface AiRuntimeStatus {
  envPath: string;
  providerMode?: string;
  healthCheck?: AiHealthCheckResult;
  autocomplete: {
    configured: boolean;
    model?: string;
    endpoint?: string;
    format?: string;
    error?: string;
  };
  teaching: {
    configured: boolean;
    model?: string;
    endpoint?: string;
    format?: string;
    error?: string;
  };
}

export interface CodexOAuthStateView {
  auth: CodexAuthState;
  models: CodexModelInfo[];
  recommendedTeachingModel?: string;
  recommendedAutocompleteModel?: string;
  error?: string;
}

export interface StudentSkillVersionView {
  versionId: string;
  archivedAt: string;
  reason: string;
  revision: number;
  activeSkillCount: number;
  candidateSkillCount: number;
  disabledSkillCount: number;
}

export interface CompletedProblemStateView extends CompletedProblemRecord {
  painSummary: string;
}

export interface ProblemBankStateView {
  type: "problemBankState";
  problems: SavedProblemRecord[];
  completedProblems: CompletedProblemStateView[];
  aiStatus: AiRuntimeStatus;
  aiConfig: AiConfigView;
  codexOAuth: CodexOAuthStateView;
  uiLanguage: UiLanguage;
  studentSkill: StudentSkill;
  studentSkillVersions: StudentSkillVersionView[];
  attemptSessions: AttemptSession[];
  internalTesting: InternalTestSummary;
  selectedKey: string;
  status?: string;
  [key: string]: unknown;
}
