import type { CoachResponsePayload, CoachStrictness, HintLevel, ProjectedContextItem, StuckCategory } from "../../core/contracts";
import { badge, btn, cnt, d, emptyBox, h, inp, sec, sp } from "../dom";
import { t, type UiLang } from "../i18n";
import { icon } from "../icons";
import { escapeHtml as E, escapeMultilineHtml as EM, getDraftOrFallback as dr, type WebviewState } from "../state";

const STUCKS: ReadonlyArray<[StuckCategory, string, string]> = [["no_idea", "没思路", "No idea"], ["tle", "TLE", "TLE"], ["partial_wa", "边界 WA", "WA"], ["implementation", "实现", "Impl"]];
const STRICTS: ReadonlyArray<[CoachStrictness, string, string]> = [["gentle", "温和", "Gentle"], ["standard", "标准", "Std"], ["strict", "严厉", "Strict"]];

function renderAudit(r: CoachResponsePayload, l: UiLang): string {
  const its = r.audit.projectedItems.slice(0, 3);
  const rows = its.length
    ? its.map((it: ProjectedContextItem) => d("r g1 au", badge(it.kind === "active_misconception" ? "Spot" : it.kind === "concept_level" ? "Lvl" : it.kind === "code_habit" ? "Habit" : "Pref") + sp("lt f1", E(it.label)) + (it.muteable ? btn(t(l, "已克服/屏蔽", "Mute"), "learner-mute-misconception", "s", "xs", `data-misconception-id="${E(it.sourceKey ?? it.id)}" data-muted="true"`) : ""))).join("")
    : d("mu", "None");
  return h("details", "dt", h("summary", "", `${icon("shd", 11)} Audit ${cnt(`(${its.length}/3 · ${r.audit.characterBudgetUsed}/${r.audit.characterBudgetMax}c)`)}`) + d("ab", rows + d("fn mo", `${E(r.audit.route)} · ${E(r.audit.renderer)}`)));
}

const renderEntry = (r: CoachResponsePayload, l: UiLang): string =>
  h("article", "ce", d("r rw g1", badge(r.action.toUpperCase(), "a", true) + badge(`L${r.hintLevel}`, "m", true) + badge(r.strictness) + (r.spoilerSafe ? "" : badge("Sanitized", "wn"))) + d("fw", E(r.headline)) + d("cb", EM(r.guidance)) + (r.dryRunPrompt ? d("sub", sp("lx", "Dry-Run") + h("pre", "pre mo", E(r.dryRunPrompt.minimalInput)) + d("", EM(r.dryRunPrompt.question))) : "") + (r.guidingQuestion ? d("co", EM(r.guidingQuestion)) : "") + renderAudit(r, l));

export function renderCoachView(st: WebviewState): string {
  const { snapshot: snap } = st, l: UiLang = snap.flags.uiLanguage, T = (zh: string, en: string) => t(l, zh, en);
  const lv = snap.hintLevel, next = Math.min(5, lv + 1) as HintLevel, fail = snap.lastRun?.cases.find((c) => c.verdict !== "AC"), busy = snap.coachBusy;

  const ladder = ([1, 2, 3, 4, 5] as const).map((s) => sp(`ld-s mo${s < lv ? " ld-d" : s === lv ? " ld-a" : ""}`, `L${s}`)).join("");
  const stucks = STUCKS.map(([c, zh, en]) => h("button", `sg${st.stuck === c ? " sg-a" : ""}`, T(zh, en), `type="button" data-action="coach-select-stuck" data-stuck="${c}"`)).join("");
  const stricts = STRICTS.map(([m, zh, en]) => h("button", `sg${snap.flags.coachStrictness === m ? " sg-a" : ""}`, T(zh, en), `type="button" data-action="flag-update" data-key="coachStrictness" data-value="${m}"`)).join("");

  const giveUp = st.giveUpConfirmPending
    ? d("al al-wn", d("at", `${icon("warn")} ${T("确认放弃？", "Confirm Give Up?")}`) + d("mu", T("段位封顶 C", "Caps rank at C")) + d("r g1 mt1", btn(T("确认", "Confirm"), "coach-giveup-confirm", "d", "sm", "", busy) + btn(T("取消", "Cancel"), "coach-giveup-cancel")))
    : btn(T("我放弃了（完整讲解）", "Give Up (Full)"), "coach-giveup-arm", "g", "xs", "", busy);

  const stream = busy || st.stream ? d("sub", badge("LIVE", "a", true) + h("div", "cb", EM(st.stream?.text ?? "..."), 'data-stream-target="true"')) : "";
  const log = snap.coachHistory.length || stream ? [...snap.coachHistory].reverse().map((e) => renderEntry(e, l)).join("") : emptyBox("L1-L5 Socratic hints");

  const ctl = d(
    "c g2",
    d("g2", stucks) +
      d("r rb", sp("lx", T("严厉度", "Tone")) + d("r g1", stricts)) +
      d("r rw g1", btn(`L${next} ${T("引导", "Hint")}`, "coach-hint", "p", "sm", "", busy) + (snap.flags.patternMapperEnabled ? btn("30s Pattern", "coach-pattern-map", "s", "sm", "", busy) : "") + btn(fail ? `Dry-Run (${fail.verdict})` : "Dry-Run", "coach-dry-run", "s", "sm", "", busy) + (snap.flags.mockInterviewEnabled || snap.lastRun?.allPassed ? btn(T("复盘", "Review"), "coach-review", "s", "sm", "", busy) : "")) +
      d("r g1", inp("ask", dr(st, "ask"), T("追问...", "Follow-up..."), "in f1") + btn(T("发", "Ask"), "coach-followup", "s", "sm", "", busy)) +
      d("", giveUp)
  );

  return sec(T("阶梯", "Ladder"), d("ld", ladder), cnt(`L${lv}`)) + h("section", "sec", ctl) + sec(T("记录", "Log"), stream + log, cnt(snap.coachHistory.length));
}
