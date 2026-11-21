import type { FeatureFlags, PresetMode } from "../../core/contracts";
import { badge, btn, cnt, d, emptyBox, h, inp, sec, sel, sp, tbl, toggleRow } from "../dom";
import { t, type UiLang } from "../i18n";
import { icon } from "../icons";
import { escapeHtml as E, getDraftOrFallback as dr, type WebviewState } from "../state";

const PRESETS: ReadonlyArray<[PresetMode, string, string]> = [["starter", "新手", "Starter"], ["focus", "专注", "Focus"], ["contest", "竞赛", "Contest"]];
const opts = (s: string): Array<[string, string]> => s.split(",").map((x) => [x, x]);
const FLAGS: ReadonlyArray<[keyof FeatureFlags, string, string]> = [
  ["patternMapperEnabled", "30s Pattern Mapper", "Pattern card"],
  ["mockInterviewEnabled", "Mock Interview", "Review"],
  ["stylishRankEnabled", "DMC Rank (D-SSS)", "Stylish rank"],
  ["starterPackEnabled", "Starter Pack", "Warmup"],
  ["shortcutHintsEnabled", "Shortcut Whispers", "6s hints"]
];

export function renderSettingsView(st: WebviewState): string {
  const { snapshot: snap } = st, { flags: f, aiConfig: ai } = snap, l: UiLang = f.uiLanguage;
  const T = (zh: string, en: string) => t(l, zh, en), g = (k: string, fb = "") => dr(st, k, fb);
  const fSel = (k: string, items: ReadonlyArray<[string, string]>, cur: string, cls = "sel sm") => sel(items, cur, `data-action="flag-select" data-key="${k}"`, cls);
  const fRow = (lbl: string, k: string, list: string, cur: string) => h("label", "fi", sp("", lbl) + fSel(k, opts(list), cur));
  const slider = (k: string, v: number) => {
    const pct = Math.round(v * 100);
    return h("label", "sr", sp("", "Vol") + `<input class="rg" type="range" min="0" max="100" step="5" value="${pct}" data-action="flag-range" data-key="${k}">` + cnt(`${pct}%`));
  };
  const roleBox = (r: "chat" | "fim", title: string, ph: string) => {
    const c = ai[r], p = `ai.${r}.`;
    return d("sub", sp("lx", title) + sel(opts("openai-compatible,openai,anthropic,ollama"), g(`${p}provider`, c.provider), `data-draft="${p}provider"`) + inp(`${p}baseUrl`, g(`${p}baseUrl`, c.baseUrl), ph, "in mo") + inp(`${p}model`, g(`${p}model`, c.model), "deepseek-chat", "in mo") + inp(`${p}apiKey`, g(`${p}apiKey`), c.hasApiKey ? "Saved (SecretStorage)" : "API Key", "in mo", "password"));
  };

  const hc = snap.lastHealthCheck
    ? d("c g1 mt1", d("r rb", sp("lx", "Health") + badge(snap.lastHealthCheck.ok ? "PASS" : "FAIL", snap.lastHealthCheck.ok ? "ok" : "er")) + snap.lastHealthCheck.steps.map((s) => d("hr", d("r g1", badge(s.step.toUpperCase(), s.ok ? "ok" : "er", true) + cnt(`${Math.round(s.latencyMs)}ms`) + (s.code ? badge(s.code, "m", true) : "")) + d("mu", E(s.message)) + (s.remediation ? d("fn", E(s.remediation)) : ""))).join(""))
    : "";

  const tcHtml = snap.toolchains.length
    ? tbl("<th>Lang</th><th>Status</th><th>Detail</th>", snap.toolchains.map((tc) => `<tr><td class="mo">${E(tc.language)}</td><td>${badge(tc.available ? "OK" : "MISS", tc.available ? "ok" : "er")}</td><td class="mu">${E(tc.available ? [tc.command, tc.version].filter(Boolean).join(" ") || "ready" : tc.installHint)}</td></tr>`).join(""))
    : emptyBox("Probe toolchains");

  return (
    sec("Preset", d("g3", PRESETS.map(([p, zh, en]) => h("button", `pr${f.preset === p ? " pr-a" : ""}`, sp("fw", T(zh, en)), `type="button" data-action="preset-select" data-preset="${p}"`)).join("")), fSel("uiLanguage", [["zh-CN", "中文"], ["en-US", "EN"]], f.uiLanguage, "sel sc")) +
    sec(T("开关", "Flags"), d("c g1", fRow("Ghost Text", "ghostTextMode", "adaptive,fast-syntax,manual,off", f.ghostTextMode) + toggleRow("strictWordAccept", "strictWordAccept", "Word Tab", f.strictWordAccept) + fRow("Friction", "microFriction", "off,multi-choice,lead-and-reveal", f.microFriction) + FLAGS.map(([k, lb, de]) => toggleRow(k, lb, de, Boolean(f[k]))).join(""))) +
    sec(T("视觉预设", "Visual"), d("r rw g1", btn(T("应用", "Apply"), "starter-apply-visual") + btn(T("还原", "Restore"), "starter-restore-visual", "s", "sm", "", !snap.visualPresetApplied) + btn("Walkthrough", "starter-open-walkthrough", "g")), badge(snap.visualPresetApplied ? "ON" : "OFF", snap.visualPresetApplied ? "ok" : "m")) +
    sec(T("音效", "Audio"), d("c g1", toggleRow("typingSoundEnabled", T("打字音", "Typing"), "Blur mute", f.typingSoundEnabled) + fRow("Pack", "typingSoundPack", "crisp-blue,muted-brown,soft-drop", f.typingSoundPack) + slider("typingSoundVolume", f.typingSoundVolume) + toggleRow("celebrationSoundEnabled", T("AC 和弦", "AC Chime"), "Pass/S+", f.celebrationSoundEnabled) + slider("celebrationSoundVolume", f.celebrationSoundVolume) + d("r rw g1 mt1", btn(`${icon("vol")} ${T("试听解锁", "Preview & Unlock")}`, "audio-preview-unlock", "p", "sm", 'data-sound-kind="key_normal"') + btn("AC", "audio-preview-unlock", "s", "sm", 'data-sound-kind="chime_pass"') + btn(icon(snap.audioMuted ? "mute" : "vol"), "audio-toggle-mute"))), badge(st.audioState, st.audioState === "running" ? "ok" : "m", true)) +
    sec("AI (Chat / FIM)", d("c g1", roleBox("chat", "Chat", "https://api.deepseek.com/v1") + roleBox("fim", "FIM", "https://api.deepseek.com/beta") + inp("ai.codeforcesHandle", g("ai.codeforcesHandle", ai.codeforcesHandle), "CF handle", "in mo") + d("r g1", btn(T("保存", "Save"), "ai-save-config", "p") + btn(T("3 步自检", "Health"), "ai-health-check")) + hc), btn("DeepSeek /beta", "ai-fill-deepseek", "g", "xs")) +
    sec("Toolchain Doctor", tcHtml, btn(`${icon("ref", 11)} Probe`, "runner-check-toolchains", "s", "xs"))
  );
}
