import type { AiProviderConfigUpdate } from "../config/modelEnv";
import type { StudentSkillCorrectionType } from "../teaching/studentSkill";
import type { OjVerdict } from "../teaching/types";
import type { SubmissionPlatform } from "../submission/types";
import type { CompletionReason } from "./problemArchive";
import type { UiLanguage } from "./stateView";
import type { OjPlatformId } from "../oj/types";

export type AiCoachAction = "hint" | "specific" | "followUp" | "giveUp" | "recommend";
export type CoachResponseLanguage = "zh" | "en" | "raw";

export const webviewCommandNames = [
  "archiveProblem",
  "cancelCodexLogin",
  "confirmOjSubmission",
  "configureNowCoderSession",
  "configureOjRemoteKey",
  "clearNowCoderSession",
  "clearOjRemoteKey",
  "copyInternalTestSummary",
  "deleteProblem",
  "disableStudentSkill",
  "fetchAiModels",
  "importLuogu",
  "importLuoguProblemSet",
  "importManualMarkdownFile",
  "importPreset",
  "importOjProblem",
  "loadProblems",
  "logoutCodex",
  "openOjProblem",
  "openOjSettings",
  "readCodexAuth",
  "recordStudentSkillFeedback",
  "requestAiCoach",
  "requestAutocompletePreview",
  "requestOptimizationReview",
  "requestOjLogin",
  "requestOjSubmissionPreview",
  "requestSolutionScore",
  "requestSubmissionJudge",
  "refreshCodexModels",
  "refreshOjProviders",
  "rollbackStudentSkill",
  "runAiHealthCheck",
  "saveAiConfig",
  "saveUiLanguage",
  "searchLuoguProblemSets",
  "searchOjProblems",
  "startCodexBrowserLogin",
  "startCodexDeviceLogin"
] as const;

export type WebviewCommandName = (typeof webviewCommandNames)[number];

export type WebviewMessage =
  | { command: "loadProblems" }
  | { command: "readCodexAuth" }
  | { command: "startCodexBrowserLogin" }
  | { command: "startCodexDeviceLogin" }
  | { command: "cancelCodexLogin" }
  | { command: "logoutCodex" }
  | { command: "refreshCodexModels" }
  | { command: "refreshOjProviders" }
  | { command: "configureNowCoderSession" }
  | { command: "clearNowCoderSession" }
  | { command: "configureOjRemoteKey"; platform: "luogu" | "codeforces" | "atcoder" }
  | { command: "clearOjRemoteKey"; platform: "luogu" | "codeforces" | "atcoder" }
  | { command: "importLuogu"; pid: string; language?: string; createFile?: boolean }
  | { command: "importPreset"; presetId: string }
  | { command: "importLuoguProblemSet"; id: string }
  | { command: "searchLuoguProblemSets"; keyword: string }
  | { command: "searchOjProblems"; platform: OjPlatformId; query: string }
  | {
      command: "importOjProblem";
      platform: OjPlatformId;
      nativeId: string;
      language?: string;
      createFile?: boolean;
    }
  | { command: "openOjProblem"; platform: OjPlatformId; nativeId: string }
  | { command: "openOjSettings" }
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
  | { command: "requestOjLogin"; platform: SubmissionPlatform }
  | {
      command: "requestOjSubmissionPreview";
      problemKey: string;
      problemUrl: string;
      platform: SubmissionPlatform;
      codeforcesHandle?: string;
    }
  | { command: "confirmOjSubmission"; confirmationId: string }
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
