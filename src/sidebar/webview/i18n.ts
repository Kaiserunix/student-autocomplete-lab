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
    tabAi: "AI 教练",
    tabProblem: "题目",
    tabSkill: "学习画像",
    askAi: "问 AI",
    send: "发送",
    continueChat: "继续聊",
    learningProfile: "AI 根据你的做题记录形成的可纠偏教学记忆",
    deleteProblem: "直接删除",
    },
  en: {
    tabAi: "AI Coach",
    tabProblem: "Problems",
    tabSkill: "Learning Profile",
    askAi: "Ask AI",
    send: "Send",
    continueChat: "Continue",
    learningProfile: "Correctable teaching memory built from your attempts.",
    deleteProblem: "Delete",
  }
};

export function normalizeUiLanguage(value: string | undefined): UiLanguage {
  return value === "en" ? "en" : "zh";
}

export function getSidebarUiCopy(language: string | undefined): SidebarUiCopy {
  return sidebarUiCopy[normalizeUiLanguage(language)];
}
