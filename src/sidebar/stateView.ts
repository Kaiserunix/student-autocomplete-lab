import type { AiConfigView } from "../config/modelEnv";
import type { AttemptSession } from "../attempt/schema";
import type { InternalTestSummary } from "../internalTesting/internalTestRecorder";
import type { ProblemRecord } from "../problemBank/types";
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

export interface AiRuntimeStatus {
  envPath: string;
  providerMode?: string;
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
  uiLanguage: UiLanguage;
  studentSkill: StudentSkill;
  studentSkillVersions: StudentSkillVersionView[];
  attemptSessions: AttemptSession[];
  internalTesting: InternalTestSummary;
  selectedKey: string;
  status?: string;
  [key: string]: unknown;
}
