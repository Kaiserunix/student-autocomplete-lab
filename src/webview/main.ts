import type {
  AiProviderKind,
  HostToWebviewMessage,
  OfficialVerdictStatus,
  PresetMode,
  ProblemSourceId,
  SoundEventKind,
  StuckCategory,
  SupportedLanguage,
  TeachingPreferences,
  WebviewToHostMessage
} from "../core/contracts";
import { createAudioSynth, type AudioSynthEngine } from "./audioSynth";
import { h } from "./dom";
import { t, type UiLang } from "./i18n";
import { icon } from "./icons";
import {
  appendCoachStreamDelta,
  applyStateSync,
  clearDirtyAiDrafts,
  clearDraftKeys,
  countDueReviews,
  createInitialWebviewState,
  DS,
  escapeHtml,
  escapeMultilineHtml,
  getDraftOrFallback as dr,
  setActiveTab,
  setDraftValue,
  setGiveUpConfirmPending,
  WebviewStore,
  type InlineToast,
  type SidebarTab,
  type WebviewState
} from "./state";
import { renderCoachControlsCard, renderCoachHistoryCard, renderCoachView } from "./views/coachView";
import { renderDossierView } from "./views/dossierView";
import { renderProblemsView } from "./views/problemsView";
import { renderSettingsView } from "./views/settingsView";
import {
  renderWorkspaceProblemCard,
  renderWorkspaceRankCard,
  renderWorkspaceSamplesCard,
  renderWorkspaceSubmitCard,
  renderWorkspaceView
} from "./views/workspaceView";

export interface VsCodeWebviewApi { postMessage(message: WebviewToHostMessage): void; }
declare function acquireVsCodeApi(): VsCodeWebviewApi;

const TABS: ReadonlyArray<[SidebarTab, string, string]> = [
  ["workspace", "做题", "Solve"],
  ["coach", "教练", "Coach"],
  ["problems", "选题", "Bank"],
  ["dossier", "成长", "Stats"]
];

type FlagKey = Extract<WebviewToHostMessage, { type: "flag/update" }>["payload"]["key"];

const BARE: Record<string, string> = {
  "runner-run": "runner/runSamples",
  "runner-check-toolchains": "runner/checkToolchains",
  "submit-copy-open": "submit/copyAndOpen",
  "submit-sync-cf": "submit/syncCodeforces",
  "starter-load-warmup": "starter/loadWarmupPack",
  "starter-open-walkthrough": "starter/openWalkthrough",
  "starter-apply-visual": "starter/applyVisualPreset",
  "starter-restore-visual": "starter/restoreVisualPreset",
  "audio-toggle-mute": "audio/toggleMute",
  "ai-health-check": "ai/runHealthCheck"
};

const VIEWS: Record<SidebarTab, (s: WebviewState) => string> = {
  workspace: renderWorkspaceView,
  problems: renderProblemsView,
  coach: renderCoachView,
  dossier: renderDossierView,
  settings: renderSettingsView
};

export const renderTabBody = (s: WebviewState): string => VIEWS[s.activeTab](s);

export function renderTabsNav(s: WebviewState): string {
  const l: UiLang = s.snapshot.flags.uiLanguage;
  const due = countDueReviews(s.snapshot);
  const tabs = TABS.map(([id, zh, en]) => {
    const lbl = escapeHtml(t(l, zh, en));
    const badgeHtml = id === "problems" && due > 0 ? `<span class="tab-n mo">${due}</span>` : "";
    return h(
      "button",
      `tab${s.activeTab === id ? " tab-a" : ""}`,
      `${lbl}${badgeHtml}`,
      `type="button" role="tab" title="${lbl}" aria-selected="${s.activeTab === id}" data-action="switch-tab" data-tab="${id}"`
    );
  }).join("");
  const setLbl = escapeHtml(t(l, "设置", "Settings"));
  const gear = h(
    "button",
    `tab tab-gear${s.activeTab === "settings" ? " tab-a" : ""}`,
    icon("gear", 14),
    `type="button" role="tab" title="${setLbl}" aria-label="${setLbl}" aria-selected="${s.activeTab === "settings"}" data-action="switch-tab" data-tab="settings"`
  );
  return h("nav", "nav-row", h("div", "tabs", tabs) + gear, `role="tablist" aria-label="${escapeHtml(t(l, "主导航", "Main navigation"))}"`);
}

export function renderToastSlot(s: WebviewState): string {
  if (!s.toast) return "";
  const l = s.snapshot.flags.uiLanguage;
  const cl = escapeHtml(t(l, "关闭提示", "Dismiss"));
  const undo = s.toast.undoEventId
    ? h("button", "b b-g b-xs", escapeHtml(t(l, "撤销", "Undo")), `type="button" data-action="learner-void-id" data-event-id="${escapeHtml(s.toast.undoEventId)}"`)
    : "";
  return h(
    "div",
    `toast toast-${escapeHtml(s.toast.level)}`,
    `<span class="f1">${escapeHtml(s.toast.text)}</span>` +
      undo +
      h("button", "bi", icon("x", 11), `type="button" title="${cl}" aria-label="${cl}" data-action="dismiss-toast"`)
  );
}

export function renderAppShell(s: WebviewState): string {
  return h(
    "div",
    "shell",
    h("header", "tabs-bar", renderTabsNav(s), 'data-patch="tabs"') +
      h("div", "toast-slot", renderToastSlot(s), 'data-patch="toast" aria-live="polite"') +
      h("main", "main", renderTabBody(s), 'data-patch="main" role="tabpanel"')
  );
}

export type WorkspaceRegionKey = "problem-card" | "rank-card" | "samples-card" | "submit-card";
export type CoachRegionKey = "coach-controls" | "coach-history";
export type PatchRegionKey = WorkspaceRegionKey | CoachRegionKey;

export interface RenderCache {
  activeTab: SidebarTab;
  uiLanguage: UiLang;
  activeProblemKey?: string;
  tabsHtml: string;
  toastHtml: string;
  mainHtml: string;
  wsRegions?: Record<WorkspaceRegionKey, string>;
  coachRegions?: Record<CoachRegionKey, string>;
}

export interface SidebarPatchPlan {
  tabsChanged: boolean;
  toastChanged: boolean;
  mode: "noop" | "workspace-regions" | "coach-regions" | "replace-main";
  changedRegions: PatchRegionKey[];
  nextCache: RenderCache;
}

export function buildRenderCache(s: WebviewState): RenderCache {
  const p = s.snapshot.activeProblem;
  const wsRegions =
    s.activeTab === "workspace" && p
      ? {
          "problem-card": renderWorkspaceProblemCard(s, p),
          "rank-card": renderWorkspaceRankCard(s),
          "samples-card": renderWorkspaceSamplesCard(s, p),
          "submit-card": renderWorkspaceSubmitCard(s, p)
        }
      : undefined;
  const coachRegions =
    s.activeTab === "coach" && p
      ? {
          "coach-controls": renderCoachControlsCard(s),
          "coach-history": renderCoachHistoryCard(s)
        }
      : undefined;
  const mainHtml = wsRegions
    ? wsRegions["problem-card"] + wsRegions["samples-card"] + wsRegions["rank-card"] + wsRegions["submit-card"]
    : coachRegions
      ? coachRegions["coach-controls"] + coachRegions["coach-history"]
      : renderTabBody(s);
  return {
    activeTab: s.activeTab,
    uiLanguage: s.snapshot.flags.uiLanguage,
    activeProblemKey: p?.problemKey,
    tabsHtml: renderTabsNav(s),
    toastHtml: renderToastSlot(s),
    mainHtml,
    wsRegions,
    coachRegions
  };
}

/**
 * Pure non-destructive DOM patch planner.
 * Protects problem statement & coach history selection/scroll when background rank/status updates arrive.
 */
export function planSidebarPatch(prev: RenderCache | null, nextState: WebviewState): SidebarPatchPlan {
  const next = buildRenderCache(nextState);
  if (!prev) {
    return { tabsChanged: true, toastChanged: true, mode: "replace-main", changedRegions: [], nextCache: next };
  }

  const tabsChanged = prev.tabsHtml !== next.tabsHtml;
  const toastChanged = prev.toastHtml !== next.toastHtml;
  const sameProblem =
    prev.activeTab === next.activeTab &&
    prev.uiLanguage === next.uiLanguage &&
    prev.activeProblemKey !== undefined &&
    prev.activeProblemKey === next.activeProblemKey;

  const diffRegions = <K extends PatchRegionKey>(
    mode: "workspace-regions" | "coach-regions",
    a: Record<K, string> | undefined,
    b: Record<K, string> | undefined
  ): SidebarPatchPlan | null => {
    if (!sameProblem || !a || !b) return null;
    const changedRegions = (Object.keys(b) as K[]).filter((k) => a[k] !== b[k]);
    return { tabsChanged, toastChanged, mode: changedRegions.length ? mode : "noop", changedRegions, nextCache: next };
  };

  return (
    diffRegions("workspace-regions", prev.wsRegions, next.wsRegions) ??
    diffRegions("coach-regions", prev.coachRegions, next.coachRegions) ?? {
      tabsChanged,
      toastChanged,
      mode: prev.mainHtml === next.mainHtml ? "noop" : "replace-main",
      changedRegions: [],
      nextCache: next
    }
  );
}

function verdictToStuck(verdict: string | undefined): StuckCategory {
  if (verdict === "TLE" || verdict === "OLE") return "tle";
  if (verdict === "RE" || verdict === "CE") return "implementation";
  return "partial_wa";
}

const PROV_URLS: Record<string, string> = {
  "openai-compatible": `${DS}v1`,
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  ollama: "http://localhost:11434/v1"
};
const DEF_URLS = new Set([...Object.values(PROV_URLS), `${DS}beta`]);
const PROVS = Object.keys(PROV_URLS);
const FA = "tab key value pref-key habit-id panel stuck preset verdict problem-key sheet-id misconception-id sound-kind sub-key sub-val event-id".split(" ");
const esc = (v: string) => v.replace(/["\\]/g, "\\$&");
type FieldEl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const isIn = (el: unknown): el is HTMLInputElement => el instanceof HTMLInputElement;
const isField = (el: EventTarget | null): el is FieldEl =>
  isIn(el) || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;

export function mountWebview(
  root: HTMLElement,
  vscode: VsCodeWebviewApi,
  audio: AudioSynthEngine = createAudioSynth()
): { store: WebviewStore; handleHostMessage: (msg: HostToWebviewMessage) => void; dispose: () => void } {
  const store = new WebviewStore(createInitialWebviewState(undefined, audio.getState()));
  const emit = (type: string, payload?: unknown): void =>
    vscode.postMessage((payload !== undefined ? { type, payload } : { type }) as WebviewToHostMessage);
  const upd = (fn: (p: WebviewState) => WebviewState): void => { store.update(fn); };
  const coach = (action: string, extra?: Record<string, unknown>) => emit("coach/request", { action, ...extra });
  const dv = (s: WebviewState, k: string, fb = "") => dr(s, k, fb).trim();

  let renderCache: RenderCache | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let lastToast: InlineToast | null = null;

  const clearToastTimer = () => { clearTimeout(toastTimer); toastTimer = undefined; };

  const syncToastTimer = (next: InlineToast | null) => {
    if (next === lastToast) return;
    lastToast = next;
    clearToastTimer();
    if (next && next.level !== "error") {
      toastTimer = setTimeout(() => {
        toastTimer = undefined;
        upd((p) => (p.toast === next ? { ...p, toast: null } : p));
      }, next.level === "warn" ? 7000 : 4000);
    }
  };

  const q = <T extends Element = HTMLElement>(s: string) => root.querySelector<T>(s);

  const setDraftDom = (vals: Readonly<Record<string, string>>) => {
    for (const [k, v] of Object.entries(vals)) {
      const el = q(`[data-draft="${esc(k)}"]`);
      if (isField(el)) el.value = v;
    }
  };

  const clearDraftDom = (keys: readonly string[]) => {
    for (const k of keys) setDraftDom({ [k]: "" });
  };

  const captureFocus = () => {
    const ae = document.activeElement;
    if (!(ae instanceof Element) || root.contains?.(ae) === false) return null;
    const dk = isField(ae) ? ae.getAttribute("data-draft") : null;
    if (dk) return { sel: `[data-draft="${esc(dk)}"]`, s0: (ae as HTMLInputElement).selectionStart ?? null, s1: (ae as HTMLInputElement).selectionEnd ?? null };
    const drw = ae.tagName === "SUMMARY" ? ae.parentElement?.getAttribute?.("data-drawer") : null;
    if (drw) return { sel: `details[data-drawer="${esc(drw)}"]>summary`, s0: null as number | null, s1: null as number | null };
    const act = ae.getAttribute("data-action");
    if (!act) return null;
    let sel = `[data-action="${esc(act)}"]`;
    for (const a of FA) {
      const v = ae.getAttribute(`data-${a}`);
      if (v !== null) sel += `[data-${a}="${esc(v)}"]`;
    }
    return { sel, s0: null as number | null, s1: null as number | null };
  };

  const restoreFocus = (f: ReturnType<typeof captureFocus>) => {
    if (!f || root.contains?.(document.activeElement)) return;
    const x = q<HTMLButtonElement>(f.sel);
    const el = x && !x.disabled ? x : q<HTMLButtonElement>(".tab-a");
    if (el && !el.disabled) {
      el.focus({ preventScroll: true });
      if (isField(el) && "setSelectionRange" in el && f.s0 !== null && f.s1 !== null) {
        try { el.setSelectionRange(f.s0, f.s1); } catch { /* ignore */ }
      }
    }
  };

  const getOpenDrawers = (el: ParentNode): string[] =>
    Array.from(el.querySelectorAll<HTMLDetailsElement>("details[data-drawer][open]"), (x) => x.dataset.drawer).filter((id): id is string => Boolean(id));
  const setOpenDrawers = (el: ParentNode | null, ids: readonly string[]) => {
    if (!el) return;
    for (const id of ids) {
      const d = el.querySelector<HTMLDetailsElement>(`details[data-drawer="${esc(id)}"]`);
      if (d) d.open = true;
    }
  };

  const render = (): void => {
    const st = store.getState();
    syncToastTimer(st.toast);
    const plan = planSidebarPatch(renderCache, st);

    if (!renderCache) {
      root.innerHTML = renderAppShell(st);
      renderCache = plan.nextCache;
      return;
    }

    const dirty = plan.tabsChanged || plan.toastChanged || plan.mode !== "noop";
    const foc = dirty ? captureFocus() : null;

    if (plan.tabsChanged) {
      const tabsEl = q('[data-patch="tabs"]');
      if (tabsEl) tabsEl.innerHTML = plan.nextCache.tabsHtml;
    }

    if (plan.toastChanged) {
      const toastEl = q('[data-patch="toast"]');
      if (toastEl) toastEl.innerHTML = plan.nextCache.toastHtml;
    }

    const regions: Record<string, string> | undefined =
      plan.mode === "workspace-regions"
        ? plan.nextCache.wsRegions
        : plan.mode === "coach-regions"
          ? plan.nextCache.coachRegions
          : undefined;
    if (regions) {
      for (const regionKey of plan.changedRegions) {
        const slot = q(`[data-patch="${regionKey}"]`);
        if (slot && regions[regionKey] !== undefined) {
          const openIds = getOpenDrawers(slot);
          slot.outerHTML = regions[regionKey]!;
          if (openIds.length) setOpenDrawers(q(`[data-patch="${regionKey}"]`), openIds);
        }
      }
    } else if (plan.mode === "replace-main") {
      const mainEl = q('[data-patch="main"]');
      if (mainEl) {
        const prevScroll = mainEl.scrollTop;
        const openDrawers = getOpenDrawers(mainEl);
        const sameTab = renderCache.activeTab === plan.nextCache.activeTab;

        mainEl.innerHTML = plan.nextCache.mainHtml;

        if (sameTab) {
          setOpenDrawers(mainEl, openDrawers);
          if (prevScroll > 0) mainEl.scrollTop = prevScroll;
        } else {
          mainEl.scrollTop = 0;
        }
      } else {
        root.innerHTML = renderAppShell(st);
      }
    }

    if (dirty) restoreFocus(foc);
    renderCache = plan.nextCache;
  };

  const unsub = store.subscribe(render);

  const handleHostMessage = (msg: HostToWebviewMessage): void => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "state/sync") upd((p) => applyStateSync(p, msg.payload));
    else if (msg.type === "sfx/play") {
      audio.play(msg.payload);
      const st = audio.getState();
      if (st !== store.getState().audioState) upd((p) => ({ ...p, audioState: st }));
    } else if (msg.type === "coach/streamDelta") {
      const next = store.updateSilent((p) => appendCoachStreamDelta(p, msg.payload.requestId, msg.payload.delta));
      const box = q('[data-stream-target="true"]');
      if (box && next.stream) box.innerHTML = escapeMultilineHtml(next.stream.text);
      else render();
    } else if (msg.type === "toast/inline") upd((p) => ({ ...p, toast: msg.payload }));
    else if (msg.type === "ui/switchTab") upd((p) => setActiveTab(p, msg.payload.tab));
  };

  const onMsg = (e: MessageEvent): void => handleHostMessage(e.data as HostToWebviewMessage);

  const submitDraft = (key: string): void => {
    const s = store.getState();
    const val = dv(s, key);
    if (!val) { q(`[data-draft="${esc(key)}"]`)?.focus(); return; }
    if (key === "imp") {
      const src = dr(s, "isrc", "auto");
      emit("problem/importRef", { source: src === "auto" ? undefined : (src as ProblemSourceId), input: val, language: s.snapshot.activeLanguage });
    } else if (key === "qry") {
      emit("problem/search", { source: dr(s, "ssrc", "leetcode-cn") as ProblemSourceId, keyword: val });
      upd((p) => setDraftValue(p, "sub.problems", "saved"));
      return;
    } else if (key === "ask") coach("followUp", { stuckCategory: s.stuck, studentQuestion: val });
    else if (key === "hab") emit("learner/upsertCodeHabit", { id: `habit-${Date.now()}`, language: dr(s, "hlang", s.snapshot.activeLanguage ?? "cpp") as SupportedLanguage, ruleText: val, enabled: true });
    else if (key === "vid") emit("learner/voidEvent", { eventId: val });
    clearDraftDom([key]);
    upd((p) => clearDraftKeys(p, [key]));
  };

  const ACT: Record<string, (d: DOMStringMap, s: WebviewState) => void> = {
    "switch-tab": (d) => d.tab && upd((p) => setActiveTab(p, d.tab as SidebarTab)),
    "sub-tab": (d) => { if (d.subKey && d.subVal) upd((p) => setDraftValue(p, `sub.${d.subKey}`, d.subVal!)); },
    "settings-open-env": () => upd((p) => setDraftValue(setActiveTab(p, "settings"), "sub.settings", "env")),
    "dismiss-toast": () => upd((p) => ({ ...p, toast: null })),
    "toggle-panel": (d) => d.panel && upd((p) => ({ ...p, panels: { ...p.panels, [d.panel!]: !p.panels[d.panel!] } })),
    "problem-open-reader": (d, s) => emit("problem/openReader", { problemKey: d.problemKey ?? s.snapshot.activeProblem?.problemKey }),
    "copy-text": (d) => {
      const text = d.copy ?? "";
      emit("clipboard/copy", { text, label: d.copyLabel });
    },
    "sample-add-submit": (d, s) => {
      const pk = d.problemKey ?? s.snapshot.activeProblem?.problemKey;
      const input = dr(s, "sin");
      if (pk && input.trim()) {
        emit("problem/addSample", { problemKey: pk, input, expectedOutput: dr(s, "sex") });
        clearDraftDom(["sin", "sex"]);
        upd((p) => ({ ...clearDraftKeys(p, ["sin", "sex"]), panels: { ...p.panels, sample: false } }));
      } else q('[data-draft="sin"]')?.focus();
    },
    "sample-delete": (d) => d.problemKey && d.sampleId && emit("problem/deleteSample", { problemKey: d.problemKey, sampleId: d.sampleId }),
    "submit-verdict": (d) => d.verdict && emit("submit/reportVerdict", { verdict: d.verdict as OfficialVerdictStatus }),
    "problem-select": (d) => {
      if (d.problemKey) {
        emit("problem/select", { problemKey: d.problemKey, openFile: true });
        upd((p) => setActiveTab(p, "workspace"));
      }
    },
    "problem-import-ref": () => submitDraft("imp"),
    "problem-search": () => submitDraft("qry"),
    "problem-load-sheet": (d) => {
      if (d.sheetId) {
        emit("problem/loadSheet", { sheetId: d.sheetId });
        upd((p) => setDraftValue(p, "sub.problems", "saved"));
      }
    },
    "problem-merge-clipboard": () => emit("problem/importClipboard", { text: "", mergeWithActive: true }),
    "problem-import-clipboard": (d, s) => {
      const text = dv(s, "clp");
      emit("problem/importClipboard", { text, mergeWithActive: d.merge === "true" });
      clearDraftDom(["clp"]);
      upd((p) => ({ ...clearDraftKeys(p, ["clp"]), panels: { ...p.panels, clip: false } }));
    },
    "coach-select-stuck": (d) => d.stuck && upd((p) => ({ ...p, stuck: d.stuck as StuckCategory })),
    "coach-hint": (_, s) => coach("hint", { stuckCategory: s.stuck }),
    "coach-pattern-map": () => coach("patternMap"),
    "coach-dry-run": (_, s) => {
      const run = s.snapshot.lastRun;
      const isCe = Boolean(run && !run.compileOk);
      const fail = run?.cases.find((c) => c.verdict !== "AC" && c.verdict !== "SKIPPED");
      coach("dryRun", { stuckCategory: verdictToStuck(isCe ? "CE" : fail?.verdict) });
    },
    "coach-dry-run-case": (d, s) => {
      const stuck = verdictToStuck(d.verdict);
      const matched = s.snapshot.lastRun?.cases.find((c) => c.id === d.caseId);
      const q = matched
        ? `Dry-run failing sample (${matched.verdict}): input=${matched.input.slice(0, 120)}`
        : undefined;
      upd((p) => ({ ...setActiveTab(p, "coach"), stuck }));
      coach("dryRun", { stuckCategory: stuck, ...(q ? { studentQuestion: q } : {}) });
    },
    "coach-hint-case": (d) => {
      const stuck = verdictToStuck(d.verdict);
      upd((p) => ({ ...setActiveTab(p, "coach"), stuck }));
      coach("hint", { stuckCategory: stuck });
    },
    "coach-review": () => coach("review"),
    "coach-review-open": () => { upd((p) => setActiveTab(p, "coach")); coach("review"); },
    "coach-followup": () => submitDraft("ask"),
    "coach-giveup-arm": () => upd((p) => setGiveUpConfirmPending(p, true)),
    "coach-giveup-cancel": () => upd((p) => setGiveUpConfirmPending(p, false)),
    "coach-giveup-confirm": () => {
      upd((p) => setGiveUpConfirmPending(p, false));
      coach("giveUp", { confirmGiveUp: true });
    },
    "learner-mute-misconception": (d) => d.misconceptionId && emit("learner/muteMisconception", { misconceptionId: d.misconceptionId, muted: d.muted !== "false" }),
    "learner-void-event": () => submitDraft("vid"),
    "learner-void-id": (d) => { if (d.eventId) { emit("learner/voidEvent", { eventId: d.eventId }); upd((p) => ({ ...p, toast: null })); } },
    "habit-add": () => submitDraft("hab"),
    "habit-delete": (d) => d.habitId && emit("learner/deleteCodeHabit", { id: d.habitId }),
    "preset-select": (d) => d.preset && emit("preset/select", { preset: d.preset as PresetMode }),
    "flag-update": (d) => d.key && d.value !== undefined && emit("flag/update", { key: d.key as FlagKey, value: d.value }),
    "audio-preview-unlock": (d, s) => {
      const kind = (d.soundKind as SoundEventKind | undefined) ?? "key_normal";
      const f = s.snapshot.flags;
      void audio.unlockFromUserGesture().then((st) => {
        upd((p) => ({ ...p, audioState: st }));
        audio.play({
          kind,
          pack: f.typingSoundPack,
          volume: Math.max(0.25, kind.startsWith("chime_") ? f.celebrationSoundVolume : f.typingSoundVolume),
          gainDbOffset: 0,
          pitchJitter: 0,
          overtone: kind === "key_punct_close"
        });
        emit("audio/testSound", { kind });
      });
    },
    "ai-fill-deepseek": (_, s) => {
      const oc = "openai-compatible", m = "deepseek-chat";
      const vals = { "ai.chat.provider": oc, "ai.chat.baseUrl": `${DS}v1`, "ai.chat.model": m, "ai.fim.provider": oc, "ai.fim.baseUrl": `${DS}beta`, "ai.fim.model": m };
      setDraftDom(vals);
      upd((p) => ({ ...p, drafts: { ...p.drafts, ...vals }, toast: { level: "info", text: t(s.snapshot.flags.uiLanguage, "已填 DeepSeek 预设，请保存。", "DeepSeek preset filled. Save.") } }));
    },
    "ai-fill-ollama": (_, s) => {
      const vals = { "ai.chat.provider": "ollama", "ai.chat.baseUrl": PROV_URLS.ollama!, "ai.chat.model": "qwen2.5-coder:7b" };
      setDraftDom(vals);
      upd((p) => ({ ...p, drafts: { ...p.drafts, ...vals }, toast: { level: "info", text: t(s.snapshot.flags.uiLanguage, "已填 Ollama 本地预设，请保存。", "Ollama preset filled. Save.") } }));
    },
    "ai-save-config": (_, s) => {
      const cfg = s.snapshot.aiConfig;
      const role = (r: "chat" | "fim") => {
        const p = `ai.${r}.`;
        const k = dv(s, `${p}apiKey`);
        const pv = dv(s, `${p}provider`, cfg[r].provider);
        return {
          provider: (PROVS.includes(pv) ? pv : cfg[r].provider) as AiProviderKind,
          baseUrl: dv(s, `${p}baseUrl`, cfg[r].baseUrl),
          model: dv(s, `${p}model`, cfg[r].model),
          ...(k ? { apiKey: k } : {})
        };
      };
      emit("ai/saveConfig", {
        chat: role("chat"),
        fim: role("fim"),
        codeforcesHandle: dv(s, "ai.codeforcesHandle", cfg.codeforcesHandle)
      });
      clearDraftDom(["ai.chat.apiKey", "ai.fim.apiKey"]);
      upd(clearDirtyAiDrafts);
    }
  };

  const syncDraft = (el: EventTarget | null): void => {
    if (isField(el)) {
      const k = el.getAttribute("data-draft");
      if (k) store.updateSilent((p) => setDraftValue(p, k, el.value));
    }
  };

  const listeners: Array<[string, EventListener]> = [
    ["click", (e) => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-action]") : null;
      const act = el?.dataset.action;
      if (el && act) BARE[act] ? emit(BARE[act]) : ACT[act]?.(el.dataset, store.getState());
    }],
    ["input", (e) => {
      syncDraft(e.target);
      if (isIn(e.target) && e.target.dataset.action === "flag-range" && e.target.nextElementSibling) {
        e.target.nextElementSibling.textContent = `${e.target.value}%`;
      }
    }],
    ["change", (e) => {
      syncDraft(e.target);
      const el = e.target;
      if (!isField(el)) return;
      const dk = el.getAttribute("data-draft");
      if (dk === "ai.chat.provider" || dk === "ai.fim.provider") {
        const r: "chat" | "fim" = dk[3] === "f" ? "fim" : "chat";
        const uk = `ai.${r}.baseUrl`, st = store.getState();
        const cur = dr(st, uk, st.snapshot.aiConfig[r].baseUrl).trim().replace(/\/+$/, "");
        const nu = el.value === "openai-compatible" && r === "fim" ? `${DS}beta` : PROV_URLS[el.value];
        if (nu && (!cur || DEF_URLS.has(cur))) {
          setDraftDom({ [uk]: nu });
          store.updateSilent((p) => setDraftValue(p, uk, nu));
        }
        return;
      }
      const d = el.dataset;
      const a = d.action;
      if (d.key && (a === "flag-toggle" || a === "flag-select" || a === "flag-range")) {
        emit("flag/update", {
          key: d.key as FlagKey,
          value: a === "flag-toggle"
            ? (el as HTMLInputElement).checked
            : a === "flag-range"
              ? Math.max(0, Math.min(1, Number(el.value) / 100))
              : el.value
        });
      } else if (a === "pref-update" && d.prefKey) {
        emit("learner/updatePreferences", { [d.prefKey]: el.value } as Partial<TeachingPreferences>);
      } else if (a === "habit-toggle" && d.habitId) {
        const hb = store.getState().snapshot.userOverrides.autocompleteCodeHabits.find((x) => x.id === d.habitId);
        if (hb) emit("learner/upsertCodeHabit", { ...hb, enabled: (el as HTMLInputElement).checked });
      }
    }],
    ["keydown", (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key !== "Enter" || ke.isComposing || !isIn(ke.target)) return;
      const dk = ke.target.getAttribute("data-draft");
      if (dk && /^(?:imp|qry|ask|hab|vid)$/.test(dk)) {
        ke.preventDefault();
        submitDraft(dk);
      }
    }]
  ];

  for (const [ev, fn] of listeners) root.addEventListener(ev, fn);
  window.addEventListener("message", onMsg);
  render();
  emit("webview/ready");

  return {
    store,
    handleHostMessage,
    dispose: () => {
      clearToastTimer();
      unsub();
      for (const [ev, fn] of listeners) root.removeEventListener(ev, fn);
      window.removeEventListener("message", onMsg);
      void audio.dispose();
    }
  };
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  const boot = (): void => {
    const root =
      document.getElementById("app") ??
      document.getElementById("root") ??
      document.body.appendChild(Object.assign(document.createElement("div"), { id: "app" }));
    mountWebview(root, typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : { postMessage: () => undefined });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
}
