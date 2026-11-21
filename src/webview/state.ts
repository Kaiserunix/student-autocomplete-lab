import type { SidebarStateSnapshot, StuckCategory } from "../core/contracts";
import type { AudioEngineState } from "./audioSynth";

export type SidebarTab = "workspace" | "problems" | "coach" | "dossier" | "settings";
export interface InlineToast { level: "info" | "warn" | "error"; text: string; }
export interface StreamBufferState { requestId: string; text: string; }

export interface WebviewState {
  readonly snapshot: SidebarStateSnapshot;
  readonly activeTab: SidebarTab;
  readonly stuck: StuckCategory;
  readonly giveUpConfirmPending: boolean;
  readonly panels: Readonly<Record<string, boolean>>;
  readonly audioState: AudioEngineState;
  readonly toast: InlineToast | null;
  readonly stream: StreamBufferState | null;
  readonly drafts: Readonly<Record<string, string>>;
  readonly dirtyAiFields: Readonly<Record<string, boolean>>;
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "`": "&#96;" };
export const escapeHtml = (v: string | number | undefined | null): string =>
  v == null ? "" : String(v).replace(/[&<>"'`]/g, (c) => ESC[c] ?? c);
export const escapeMultilineHtml = (v: string | undefined | null): string => escapeHtml(v).replace(/\r?\n/g, "<br>");
export const sanitizeExternalUrl = (raw: string | undefined): string | null => {
  const s = raw?.trim();
  return s && /^https?:\/\/[^\s"'<>]+$/i.test(s) ? s : null;
};

const F = false;
const AI_DEF = { provider: "openai-compatible" as const, model: "deepseek-chat", hasApiKey: F };
const DS = "https://api.deepseek.com/";

export const createInitialSnapshot = (): SidebarStateSnapshot => ({
  flags: {
    preset: "focus", uiLanguage: "zh-CN", starterPackEnabled: F, shortcutHintsEnabled: F,
    ghostTextMode: "adaptive", strictWordAccept: F, microFriction: "off", coachStrictness: "standard",
    patternMapperEnabled: true, mockInterviewEnabled: F, stylishRankEnabled: true,
    typingSoundEnabled: F, typingSoundPack: "muted-brown", typingSoundVolume: 0.25,
    celebrationSoundEnabled: F, celebrationSoundVolume: 0.35
  },
  visualPresetApplied: F, audioMuted: F, problems: [], hintLevel: 0, coachHistory: [], coachBusy: F, runnerBusy: F,
  learnerSnapshot: { schemaVersion: "2.0", derivedAt: "", totalTerminalEvents: 0, conceptMastery: {}, mistakeNotebook: {}, misconceptionStats: {}, recentTrajectory: { last7dAttempts: 0, independentAcRate: 0, avgHintLevel: 0 } },
  userOverrides: { schemaVersion: "2.0", updatedAt: "", teachingPreferences: { hintStyle: "socratic", verbosity: "concise", targetGoal: "interview_leetcode" }, autocompleteCodeHabits: [], mutedMisconceptionIds: {}, manualConceptOverrides: {}, voidedEventIds: [] },
  recommendations: [],
  aiConfig: { chat: { ...AI_DEF, baseUrl: `${DS}v1` }, fim: { ...AI_DEF, baseUrl: `${DS}beta` }, codeforcesHandle: "" },
  toolchains: [], bridgeStatus: { listening: F },
  curatedSheets: [
    { id: "lc-cn-hot-100", title: "Hot 100", source: "leetcode-cn", count: 100 },
    { id: "blind-75", title: "Blind 75", source: "leetcode-global", count: 75 },
    { id: "neetcode-150", title: "NeetCode 150", source: "leetcode-global", count: 150 }
  ]
});

export const createInitialWebviewState = (snapshot = createInitialSnapshot(), audioState: AudioEngineState = "uninitialized"): WebviewState => ({
  snapshot, activeTab: "workspace", stuck: "no_idea", giveUpConfirmPending: F,
  panels: {}, audioState, toast: null, stream: null, drafts: {}, dirtyAiFields: {}
});

export const applyStateSync = (p: WebviewState, next: SidebarStateSnapshot): WebviewState => ({
  ...p, snapshot: next,
  giveUpConfirmPending: p.snapshot.activeProblem?.problemKey !== next.activeProblem?.problemKey ? F : p.giveUpConfirmPending,
  stream: next.coachBusy ? p.stream : null,
  toast: next.statusBanner ? { ...next.statusBanner } : p.toast
});

export const setActiveTab = (p: WebviewState, activeTab: SidebarTab): WebviewState =>
  p.activeTab === activeTab ? p : { ...p, activeTab, giveUpConfirmPending: F };

export const setGiveUpConfirmPending = (p: WebviewState, giveUpConfirmPending: boolean): WebviewState => ({ ...p, giveUpConfirmPending });
export const appendCoachStreamDelta = (p: WebviewState, requestId: string, delta: string): WebviewState =>
  !requestId ? p : { ...p, stream: { requestId, text: p.stream?.requestId === requestId ? p.stream.text + delta : delta } };

export const setDraftValue = (p: WebviewState, k: string, v: string): WebviewState =>
  p.drafts[k] === v ? p : { ...p, drafts: { ...p.drafts, [k]: v }, dirtyAiFields: k.startsWith("ai.") ? { ...p.dirtyAiFields, [k]: true } : p.dirtyAiFields };

export const clearDraftKeys = (p: WebviewState, keys: readonly string[]): WebviewState => {
  const drafts = { ...p.drafts }, dirtyAiFields = { ...p.dirtyAiFields };
  for (const k of keys) { delete drafts[k]; delete dirtyAiFields[k]; }
  return { ...p, drafts, dirtyAiFields };
};

export const clearDirtyAiDrafts = (p: WebviewState): WebviewState => {
  const drafts: Record<string, string> = {};
  for (const [k, v] of Object.entries(p.drafts)) if (!k.startsWith("ai.")) drafts[k] = v;
  return { ...p, drafts, dirtyAiFields: {} };
};

export const getDraftOrFallback = (s: WebviewState, k: string, fb = ""): string => s.drafts[k] ?? fb;

export class WebviewStore {
  private s: WebviewState;
  private readonly subs = new Set<(s: WebviewState) => void>();
  constructor(init?: WebviewState) { this.s = init ?? createInitialWebviewState(); }
  getState(): WebviewState { return this.s; }
  update(fn: (p: WebviewState) => WebviewState, notify = true): WebviewState {
    const n = fn(this.s);
    if (n !== this.s) { this.s = n; if (notify) for (const f of this.subs) f(n); }
    return this.s;
  }
  updateSilent(fn: (p: WebviewState) => WebviewState): WebviewState { return this.update(fn, F); }
  subscribe(fn: (s: WebviewState) => void): () => void {
    this.subs.add(fn);
    return () => { this.subs.delete(fn); };
  }
}
