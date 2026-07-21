import type { UiLanguage } from "../stateView";

export interface SidebarUiCopy {
  tabAi: string;
  tabProblem: string;
  tabSkill: string;
  askAi: string;
  send: string;
  continueChat: string;
  learningProfile: string;
  deleteProblem: string;
}

export const sidebarUiCopy: Record<UiLanguage, SidebarUiCopy> = {
  zh: {
    tabAi: "作答现场",
    tabProblem: "题目张贴板",
    tabSkill: "学习档案",
    askAi: "追问",
    send: "发送",
    continueChat: "继续复盘",
    learningProfile: "可查看、可纠正",
    deleteProblem: "直接删除",
  },
  en: {
    tabAi: "AI Coach",
    tabProblem: "Problems",
    tabSkill: "Learning Profile",
    askAi: "Ask AI",
    send: "Send",
    continueChat: "Continue",
    learningProfile: "Reviewable and correctable.",
    deleteProblem: "Delete",
  }
};

export function normalizeUiLanguage(value: string | undefined): UiLanguage {
  return value === "en" ? "en" : "zh";
}

export function getSidebarUiCopy(language: string | undefined): SidebarUiCopy {
  return sidebarUiCopy[normalizeUiLanguage(language)];
}
