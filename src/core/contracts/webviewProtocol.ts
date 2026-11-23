import type {
  CoachAction,
  CoachResponsePayload,
  CoachStrictness,
  GhostTextMode,
  HintLevel,
  MicroFrictionMode,
  SoundEventKind,
  StuckCategory,
  StylishRankState,
  TypingSoundPack
} from "./coach";
import type { AiProviderKind, FeatureFlags, PresetMode } from "./config";
import type {
  AutocompleteCodeHabit,
  LearnerSnapshotV2,
  RecommendationItem,
  TeachingPreferences,
  UserOverridesV2
} from "./learner";
import type { ProblemDocument, ProblemSourceId, SupportedLanguage } from "./problem";
import type { LocalRunResult, OfficialVerdictStatus, ToolchainProbe } from "./runner";

export interface SidebarHealthCheckSummary {
  ranAt: string;
  ok: boolean;
  steps: Array<{
    step: "models" | "chat" | "fim";
    ok: boolean;
    latencyMs: number;
    code?: string;
    message: string;
    remediation?: string;
  }>;
}

export interface SidebarAiConfigView {
  chat: {
    provider: AiProviderKind;
    baseUrl: string;
    model: string;
    hasApiKey: boolean;
  };
  fim: {
    provider: AiProviderKind;
    baseUrl: string;
    model: string;
    hasApiKey: boolean;
  };
  codeforcesHandle: string;
  ojHandles?: {
    codeforces: string;
    leetcodeCn: string;
    leetcodeGlobal: string;
    atcoder: string;
  };
}

export interface SidebarBridgeStatus {
  listening: boolean;
  port?: number;
  lastError?: string;
}

export interface SidebarRecentEvent {
  eventId: string;
  title: string;
  verdict: string;
  timestamp: string;
}

export interface SidebarSearchResults {
  keyword: string;
  sources: ProblemSourceId[];
  items: ProblemDocument[];
  failedSources: ProblemSourceId[];
}

export interface SidebarStateSnapshot {
  flags: FeatureFlags;
  visualPresetApplied: boolean;
  audioMuted: boolean;
  activeProblem?: ProblemDocument;
  activeSubmitUrl?: string;
  activeFilePath?: string;
  activeLanguage?: SupportedLanguage;
  problems: ProblemDocument[];
  searchBusy?: boolean;
  searchResults?: SidebarSearchResults;
  lastRun?: LocalRunResult;
  hintLevel: HintLevel;
  giveUpUnlocked?: boolean;
  coachHistory: CoachResponsePayload[];
  coachBusy: boolean;
  runnerBusy: boolean;
  verdictSyncing?: boolean;
  learnerSnapshot: LearnerSnapshotV2;
  userOverrides: UserOverridesV2;
  recommendations: RecommendationItem[];
  recentEvents?: SidebarRecentEvent[];
  stylishRank?: StylishRankState;
  aiConfig: SidebarAiConfigView;
  lastHealthCheck?: SidebarHealthCheckSummary;
  toolchains: ToolchainProbe[];
  bridgeStatus: SidebarBridgeStatus;
  curatedSheets: Array<{
    id: string;
    title: string;
    source: "leetcode-global" | "leetcode-cn";
    count: number;
  }>;
  statusBanner?: {
    level: "info" | "warn" | "error";
    text: string;
    undoEventId?: string;
  };
}

export type HostToWebviewMessage =
  | { type: "state/sync"; payload: SidebarStateSnapshot }
  | {
      type: "sfx/play";
      payload: {
        kind: SoundEventKind;
        pack: TypingSoundPack;
        volume: number;
        gainDbOffset: number;
        pitchJitter: number;
        overtone: boolean;
      };
    }
  | { type: "coach/streamDelta"; payload: { requestId: string; delta: string } }
  | { type: "toast/inline"; payload: { level: "info" | "warn" | "error"; text: string; undoEventId?: string } }
  | { type: "ui/switchTab"; payload: { tab: "workspace" | "problems" | "coach" | "dossier" | "settings" } };

export type WebviewToHostMessage =
  | { type: "webview/ready" }
  | { type: "preset/select"; payload: { preset: PresetMode } }
  | {
      type: "flag/update";
      payload: {
        key:
          | "starterPackEnabled"
          | "shortcutHintsEnabled"
          | "ghostTextMode"
          | "strictWordAccept"
          | "microFriction"
          | "coachStrictness"
          | "patternMapperEnabled"
          | "mockInterviewEnabled"
          | "stylishRankEnabled"
          | "typingSoundEnabled"
          | "typingSoundPack"
          | "typingSoundVolume"
          | "celebrationSoundEnabled"
          | "celebrationSoundVolume"
          | "uiLanguage";
        value: boolean | string | number | GhostTextMode | MicroFrictionMode | CoachStrictness | TypingSoundPack;
      };
    }
  | { type: "starter/applyVisualPreset" }
  | { type: "starter/restoreVisualPreset" }
  | { type: "starter/openWalkthrough" }
  | { type: "starter/loadWarmupPack" }
  | { type: "problem/select"; payload: { problemKey: string; openFile?: boolean; language?: SupportedLanguage } }
  | {
      type: "problem/importRef";
      payload: { source?: ProblemSourceId; input: string; language?: SupportedLanguage };
    }
  | { type: "problem/importClipboard"; payload: { text: string; mergeWithActive?: boolean } }
  | { type: "problem/loadSheet"; payload: { sheetId: string } }
  | { type: "problem/search"; payload: { source?: ProblemSourceId; sources?: ProblemSourceId[]; keyword: string } }
  | { type: "problem/clearSearch" }
  | { type: "problem/addSample"; payload: { problemKey: string; input: string; expectedOutput: string } }
  | { type: "problem/deleteSample"; payload: { problemKey: string; sampleId: string } }
  | { type: "problem/openReader"; payload?: { problemKey?: string } }
  | { type: "clipboard/copy"; payload: { text: string; label?: string } }
  | { type: "runner/runSamples" }
  | { type: "runner/checkToolchains" }
  | { type: "submit/copyAndOpen" }
  | { type: "submit/copyOnly" }
  | { type: "submit/reportVerdict"; payload: { verdict: OfficialVerdictStatus } }
  | { type: "submit/syncVerdict" }
  | { type: "submit/syncCodeforces" }
  | { type: "bridge/copyUserscript" }
  | {
      type: "coach/request";
      payload: {
        action: CoachAction;
        stuckCategory?: StuckCategory;
        studentQuestion?: string;
        confirmGiveUp?: boolean;
      };
    }
  | { type: "learner/muteMisconception"; payload: { misconceptionId: string; muted: boolean } }
  | { type: "learner/voidEvent"; payload: { eventId: string } }
  | { type: "learner/updatePreferences"; payload: Partial<TeachingPreferences> }
  | { type: "learner/upsertCodeHabit"; payload: AutocompleteCodeHabit }
  | { type: "learner/deleteCodeHabit"; payload: { id: string } }
  | {
      type: "ai/saveConfig";
      payload: {
        chat: { provider: AiProviderKind; baseUrl: string; model: string; apiKey?: string };
        fim: { provider: AiProviderKind; baseUrl: string; model: string; apiKey?: string };
        codeforcesHandle?: string;
        ojHandles?: {
          codeforces?: string;
          leetcodeCn?: string;
          leetcodeGlobal?: string;
          atcoder?: string;
        };
      };
    }
  | { type: "ai/runHealthCheck" }
  | { type: "audio/toggleMute" }
  | { type: "audio/testSound"; payload: { kind: SoundEventKind } };

export interface ProblemReaderSnapshot {
  problem?: ProblemDocument;
  uiLanguage: "zh-CN" | "en-US";
  activeLanguage?: SupportedLanguage;
  lastRun?: LocalRunResult;
  hintLevel: HintLevel;
  runnerBusy: boolean;
  coachBusy: boolean;
}

export type HostToReaderMessage =
  | { type: "reader/sync"; payload: ProblemReaderSnapshot }
  | { type: "toast/inline"; payload: { level: "info" | "warn" | "error"; text: string } };

export type ReaderToHostMessage =
  | { type: "reader/ready" }
  | { type: "runner/runSamples" }
  | { type: "submit/copyAndOpen" }
  | {
      type: "coach/request";
      payload: {
        action: CoachAction;
        stuckCategory?: StuckCategory;
        studentQuestion?: string;
        confirmGiveUp?: boolean;
      };
    }
  | { type: "clipboard/copy"; payload: { text: string; label?: string } }
  | { type: "problem/importClipboard"; payload: { text: string; mergeWithActive?: boolean } };
