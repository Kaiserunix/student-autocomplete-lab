export const sidebarPageIds = ["aiPage", "problemPage", "skillPage"] as const;

export const primaryCoachButtonIds = [
  "coachHint",
  "coachFollowUp",
  "coachGiveUp",
  "coachCompleted",
  "coachSolutionScore",
  "coachOptimize",
  "coachRecommendRule",
  "coachSubmissionJudge",
  "coachSendCustom"
] as const;

export const problemImportButtonIds = [
  "importManualMarkdownFile",
  "importLuoguProblem",
  "importLuoguProblemSet",
  "searchProblem",
  "searchProblemSet"
] as const;

export const codexOAuthControlIds = [
  "aiOpenAiAuthMode",
  "codexOAuthPanel",
  "codexAuthStatus",
  "codexBrowserLogin",
  "codexDeviceLogin",
  "codexCancelLogin",
  "codexLogout",
  "codexRefreshModels",
  "codexTeachingModel",
  "codexAutocompleteModel"
] as const;

export type SidebarPageId = (typeof sidebarPageIds)[number];
export type CoachButtonId = (typeof primaryCoachButtonIds)[number];
export type ProblemImportButtonId = (typeof problemImportButtonIds)[number];

export function disabledReasonForCoachAction(input: {
  hasProblem: boolean;
  isBusy: boolean;
  isArchivedProblem?: boolean;
}): string | undefined {
  if (input.isBusy) {
    return "AI 正在处理上一条请求。";
  }
  if (!input.hasProblem) {
    return "先导入或选择一道题。";
  }
  if (input.isArchivedProblem) {
    return "已归档题只能继续复盘、评分或优化。";
  }

  return undefined;
}
