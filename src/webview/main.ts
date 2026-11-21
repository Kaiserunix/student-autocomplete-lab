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
  createInitialWebviewState,
  escapeHtml,
  escapeMultilineHtml,
  getDraftOrFallback as dr,
  setActiveTab,
  setDraftValue,
  setGiveUpConfirmPending,
  WebviewStore,
  type SidebarTab,
  type WebviewState
} from "./state";
import { renderCoachView } from "./views/coachView";
import { renderDossierView } from "./views/dossierView";
import { renderProblemsView } from "./views/problemsView";
import { renderSettingsView } from "./views/settingsView";
import { renderWorkspaceView } from "./views/workspaceView";

export interface VsCodeWebviewApi { postMessage(message: WebviewToHostMessage): void; }
declare function acquireVsCodeApi(): VsCodeWebviewApi;

const TABS: ReadonlyArray<[SidebarTab, string, string]> = [["workspace", "工作区", "Work"], ["problems", "题库", "Problems"], ["coach", "教练", "Coach"], ["dossier", "档案", "Dossier"], ["settings", "设置", "Settings"]];
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
  workspace: renderWorkspaceView, problems: renderProblemsView, coach: renderCoachView, dossier: renderDossierView, settings: renderSettingsView
};

export const renderTabBody = (s: WebviewState): string => VIEWS[s.activeTab](s);

export function renderAppShell(s: WebviewState): string {
  const l: UiLang = s.snapshot.flags.uiLanguage;
  const tabs = TABS.map(([id, zh, en]) => h("button", `tab${s.activeTab === id ? " tab-a" : ""}`, escapeHtml(t(l, zh, en)), `type="button" role="tab" aria-selected="${s.activeTab === id}" data-action="switch-tab" data-tab="${id}"`)).join("");
  const toast = s.toast ? h("div", `toast toast-${escapeHtml(s.toast.level)}`, `<span>${escapeHtml(s.toast.text)}</span>` + h("button", "bi", icon("x", 11), 'type="button" data-action="dismiss-toast"'), 'role="status"') : "";
  return h("div", "shell", h("nav", "tabs", tabs, 'role="tablist"') + toast + h("main", "main", renderTabBody(s)));
}

const PROVS = ["openai-compatible", "openai", "anthropic", "ollama"];
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

  const render = (): void => {
    const top = root.querySelector(".main")?.scrollTop ?? 0;
    const ae = document.activeElement, dk = isField(ae) ? ae.getAttribute("data-draft") : null;
    const s0 = ae && "selectionStart" in ae ? (ae as HTMLInputElement).selectionStart : null;
    const s1 = ae && "selectionEnd" in ae ? (ae as HTMLInputElement).selectionEnd : null;
    root.innerHTML = renderAppShell(store.getState());
    const nm = root.querySelector(".main");
    if (nm && top > 0) nm.scrollTop = top;
    if (dk) {
      const el = root.querySelector(`[data-draft="${dk.replace(/"/g, '\\"')}"]`);
      if (isField(el)) {
        el.focus();
        if ("setSelectionRange" in el && s0 !== null && s1 !== null) try { el.setSelectionRange(s0, s1); } catch { /* ignore */ }
      }
    }
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
      const box = root.querySelector('[data-stream-target="true"]');
      if (box && next.stream) box.innerHTML = escapeMultilineHtml(next.stream.text);
      else render();
    } else if (msg.type === "toast/inline") upd((p) => ({ ...p, toast: msg.payload }));
  };

  const onMsg = (e: MessageEvent): void => handleHostMessage(e.data as HostToWebviewMessage);

  const submitDraft = (key: string): void => {
    const s = store.getState(), val = dv(s, key);
    if (!val) return;
    if (key === "imp") {
      const src = dr(s, "isrc", "auto");
      emit("problem/importRef", { source: src === "auto" ? undefined : (src as ProblemSourceId), input: val, language: s.snapshot.activeLanguage });
    } else if (key === "qry") {
      emit("problem/search", { source: dr(s, "ssrc", "leetcode-cn") as ProblemSourceId, keyword: val });
      return;
    } else if (key === "ask") coach("followUp", { stuckCategory: s.stuck, studentQuestion: val });
    else if (key === "hab") emit("learner/upsertCodeHabit", { id: `habit-${Date.now()}`, language: dr(s, "hlang", "cpp") as SupportedLanguage, ruleText: val, enabled: true });
    upd((p) => clearDraftKeys(p, [key]));
  };

  const ACT: Record<string, (d: DOMStringMap, s: WebviewState) => void> = {
    "switch-tab": (d) => d.tab && upd((p) => setActiveTab(p, d.tab as SidebarTab)),
    "dismiss-toast": () => upd((p) => ({ ...p, toast: null })),
    "toggle-panel": (d) => d.panel && (d.panel === "stmt" ? store.updateSilent.bind(store) : upd)((p) => ({ ...p, panels: { ...p.panels, [d.panel!]: !p.panels[d.panel!] } })),
    "sample-add-submit": (d, s) => {
      const pk = d.problemKey ?? s.snapshot.activeProblem?.problemKey, input = dr(s, "sin");
      if (pk && input.trim()) {
        emit("problem/addSample", { problemKey: pk, input, expectedOutput: dr(s, "sex") });
        upd((p) => ({ ...clearDraftKeys(p, ["sin", "sex"]), panels: { ...p.panels, sample: false } }));
      }
    },
    "sample-delete": (d) => d.problemKey && d.sampleId && emit("problem/deleteSample", { problemKey: d.problemKey, sampleId: d.sampleId }),
    "submit-verdict": (d) => d.verdict && emit("submit/reportVerdict", { verdict: d.verdict as OfficialVerdictStatus }),
    "problem-select": (d) => { if (d.problemKey) { emit("problem/select", { problemKey: d.problemKey, openFile: true }); upd((p) => setActiveTab(p, "workspace")); } },
    "problem-import-ref": () => submitDraft("imp"),
    "problem-search": () => submitDraft("qry"),
    "problem-load-sheet": (d) => d.sheetId && emit("problem/loadSheet", { sheetId: d.sheetId }),
    "problem-import-clipboard": (d, s) => {
      const text = dv(s, "clp");
      if (text) { emit("problem/importClipboard", { text, mergeWithActive: d.merge === "true" }); upd((p) => ({ ...clearDraftKeys(p, ["clp"]), panels: { ...p.panels, clip: false } })); }
    },
    "coach-select-stuck": (d) => d.stuck && upd((p) => ({ ...p, stuck: d.stuck as StuckCategory })),
    "coach-hint": (_, s) => coach("hint", { stuckCategory: s.stuck }),
    "coach-pattern-map": () => coach("patternMap"),
    "coach-dry-run": () => coach("dryRun", { stuckCategory: "partial_wa" }),
    "coach-review": () => coach("review"),
    "coach-followup": () => submitDraft("ask"),
    "coach-giveup-arm": () => upd((p) => setGiveUpConfirmPending(p, true)),
    "coach-giveup-cancel": () => upd((p) => setGiveUpConfirmPending(p, false)),
    "coach-giveup-confirm": () => { upd((p) => setGiveUpConfirmPending(p, false)); coach("giveUp", { confirmGiveUp: true }); },
    "learner-mute-misconception": (d) => d.misconceptionId && emit("learner/muteMisconception", { misconceptionId: d.misconceptionId, muted: d.muted !== "false" }),
    "learner-void-event": (_, s) => {
      const eid = dv(s, "vid");
      if (eid) { emit("learner/voidEvent", { eventId: eid }); upd((p) => clearDraftKeys(p, ["vid"])); }
    },
    "habit-add": () => submitDraft("hab"),
    "habit-delete": (d) => d.habitId && emit("learner/deleteCodeHabit", { id: d.habitId }),
    "preset-select": (d) => d.preset && emit("preset/select", { preset: d.preset as PresetMode }),
    "flag-update": (d) => d.key && d.value !== undefined && emit("flag/update", { key: d.key as FlagKey, value: d.value }),
    "audio-preview-unlock": (d, s) => {
      const kind = (d.soundKind as SoundEventKind | undefined) ?? "key_normal", f = s.snapshot.flags;
      void audio.unlockFromUserGesture().then((st) => {
        upd((p) => ({ ...p, audioState: st }));
        audio.play({ kind, pack: f.typingSoundPack, volume: Math.max(0.25, kind.startsWith("chime_") ? f.celebrationSoundVolume : f.typingSoundVolume), gainDbOffset: 0, pitchJitter: 0, overtone: kind === "key_punct_close" });
        emit("audio/testSound", { kind });
      });
    },
    "ai-fill-deepseek": () => upd((p) => {
      const b = "https://api.deepseek.com/", oc = "openai-compatible", m = "deepseek-chat";
      return { ...p, drafts: { ...p.drafts, "ai.chat.provider": oc, "ai.chat.baseUrl": `${b}v1`, "ai.chat.model": m, "ai.fim.provider": oc, "ai.fim.baseUrl": `${b}beta`, "ai.fim.model": m } };
    }),
    "ai-save-config": (_, s) => {
      const cfg = s.snapshot.aiConfig;
      const role = (r: "chat" | "fim") => {
        const p = `ai.${r}.`, k = dv(s, `${p}apiKey`), pv = dv(s, `${p}provider`, cfg[r].provider);
        return { provider: (PROVS.includes(pv) ? pv : cfg[r].provider) as AiProviderKind, baseUrl: dv(s, `${p}baseUrl`, cfg[r].baseUrl), model: dv(s, `${p}model`, cfg[r].model), ...(k ? { apiKey: k } : {}) };
      };
      emit("ai/saveConfig", { chat: role("chat"), fim: role("fim"), codeforcesHandle: dv(s, "ai.codeforcesHandle", cfg.codeforcesHandle) });
      upd(clearDirtyAiDrafts);
    }
  };

  const syncDraft = (el: EventTarget | null): void => {
    if (isField(el)) { const k = el.getAttribute("data-draft"); if (k) store.updateSilent((p) => setDraftValue(p, k, el.value)); }
  };

  const listeners: Array<[string, EventListener]> = [
    ["click", (e) => {
      const el = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-action]") : null, act = el?.dataset.action;
      if (el && act) BARE[act] ? emit(BARE[act]) : ACT[act]?.(el.dataset, store.getState());
    }],
    ["input", (e) => {
      syncDraft(e.target);
      if (isIn(e.target) && e.target.dataset.action === "flag-range" && e.target.nextElementSibling) e.target.nextElementSibling.textContent = `${e.target.value}%`;
    }],
    ["change", (e) => {
      syncDraft(e.target);
      const el = e.target;
      if (!isField(el)) return;
      const d = el.dataset, a = d.action;
      if (d.key && (a === "flag-toggle" || a === "flag-select" || a === "flag-range")) {
        emit("flag/update", { key: d.key as FlagKey, value: a === "flag-toggle" ? (el as HTMLInputElement).checked : a === "flag-range" ? Math.max(0, Math.min(1, Number(el.value) / 100)) : el.value });
      } else if (a === "pref-update" && d.prefKey) emit("learner/updatePreferences", { [d.prefKey]: el.value } as Partial<TeachingPreferences>);
      else if (a === "habit-toggle" && d.habitId) {
        const hb = store.getState().snapshot.userOverrides.autocompleteCodeHabits.find((x) => x.id === d.habitId);
        if (hb) emit("learner/upsertCodeHabit", { ...hb, enabled: (el as HTMLInputElement).checked });
      }
    }],
    ["keydown", (e) => {
      const ke = e as KeyboardEvent;
      if (ke.key !== "Enter" || ke.isComposing || !isIn(ke.target)) return;
      const dk = ke.target.getAttribute("data-draft");
      if (dk === "imp" || dk === "qry" || dk === "ask" || dk === "hab") { ke.preventDefault(); submitDraft(dk); }
    }]
  ];

  for (const [ev, fn] of listeners) root.addEventListener(ev, fn);
  window.addEventListener("message", onMsg);
  render();
  emit("webview/ready");

  return {
    store, handleHostMessage,
    dispose: () => {
      unsub();
      for (const [ev, fn] of listeners) root.removeEventListener(ev, fn);
      window.removeEventListener("message", onMsg);
      void audio.dispose();
    }
  };
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  const boot = (): void => {
    const root = document.getElementById("app") ?? document.getElementById("root") ?? document.body.appendChild(Object.assign(document.createElement("div"), { id: "app" }));
    mountWebview(root, typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : { postMessage: () => undefined });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
}
