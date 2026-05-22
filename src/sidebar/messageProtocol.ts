import type { AiProviderConfigUpdate } from "../config/modelEnv";
import type { StudentSkillCorrectionType } from "../teaching/studentSkill";
import type { OjVerdict } from "../teaching/types";
import type { CompletionReason } from "./problemArchive";
import type { UiLanguage } from "./stateView";

export type AiCoachAction = "hint" | "specific" | "followUp" | "giveUp" | "recommend";
export type CoachResponseLanguage = "zh" | "en" | "raw";

export const webviewCommandNames = [
  "archiveProblem",
  "copyInternalTestSummary",
  "deleteProblem",
  "disableStudentSkill",
  "fetchAiModels",
  "importLuogu",
  "importLuoguProblemSet",
  "importManualMarkdownFile",
  "importPreset",
  "loadProblems",
  "recordStudentSkillFeedback",
  "requestAiCoach",
  "requestAutocompletePreview",
  "requestOptimizationReview",
  "requestSolutionScore",
  "requestSubmissionJudge",
  "rollbackStudentSkill",
  "runAiHealthCheck",
  "saveAiConfig",
  "saveUiLanguage",
  "searchLuoguProblems",
  "searchLuoguProblemSets"
] as const;

export type WebviewCommandName = (typeof webviewCommandNames)[number];

export type WebviewMessage =
  | { command: "loadProblems" }
  | { command: "importLuogu"; pid: string; language?: string; createFile?: boolean }
  | { command: "importPreset"; presetId: string }
  | { command: "importLuoguProblemSet"; id: string }
  | { command: "searchLuoguProblems"; keyword: string }
  | { command: "searchLuoguProblemSets"; keyword: string }
  | { command: "saveAiConfig"; config: AiProviderConfigUpdate }
  | { command: "fetchAiModels"; config: AiProviderConfigUpdate }
  | { command: "runAiHealthCheck"; config: AiProviderConfigUpdate }
  | { command: "saveUiLanguage"; language: UiLanguage }
  | { command: "importManualMarkdownFile" }
  | {
      command: "requestAiCoach";
      action: AiCoachAction;
      problemKey: string;
      ojVerdict?: OjVerdict;
      responseLanguage?: CoachResponseLanguage;
      studentRequest?: string;
      previousCoachTurn?: string;
    }
  | {
      command: "requestSolutionScore";
      problemKey: string;
      ojVerdict?: OjVerdict;
      studentRequest?: string;
      archiveOnComplete?: boolean;
    }
  | { command: "requestOptimizationReview"; problemKey: string; studentRequest?: string }
  | { command: "requestSubmissionJudge"; problemKey: string }
  | { command: "requestAutocompletePreview" }
  | { command: "copyInternalTestSummary" }
  | { command: "archiveProblem"; problemKey: string; reason?: CompletionReason }
  | { command: "deleteProblem"; problemKey: string; deleteScope: "active" | "completed" }
  | { command: "disableStudentSkill"; skillName: string; reason?: string }
  | {
      command: "recordStudentSkillFeedback";
      skillName: string;
      feedbackType: StudentSkillCorrectionType;
      note?: string;
    }
  | { command: "rollbackStudentSkill"; versionId: string };

export function isKnownWebviewCommandName(value: string): value is WebviewCommandName {
  return (webviewCommandNames as readonly string[]).includes(value);
}
