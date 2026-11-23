import type { CoachResponsePayload, CoachStrictness, HintLevel, ProjectedContextItem, StuckCategory } from "../../core/contracts";
import { workbenchArtImg } from "../assets";
import { ap, badge, btn, cnt, d, emptyBox, emptyCard, h, inp, sec, sel, sp } from "../dom";
import { t, tr, type UiLang } from "../i18n";
import { icon } from "../icons";
import { renderMarkdownMath } from "../markdownMath";
import { escapeHtml as E, escapeMultilineHtml as EM, getDraftOrFallback as dr, type WebviewState } from "../state";

const STUCKS: ReadonlyArray<[StuckCategory, string, string]> = [
  ["no_idea", "没思路", "No Idea"],
  ["tle", "超时 TLE", "Time Limit"],
  ["partial_wa", "部分 WA", "Wrong Answer"],
  ["implementation", "实现卡壳", "Impl Stuck"]
];

const STRICTS: ReadonlyArray<[CoachStrictness, string, string]> = [
  ["gentle", "温和", "Gentle"],
  ["standard", "标准", "Standard"],
  ["strict", "严厉", "Strict"]
];

const ACT_LBL: Record<CoachResponsePayload["action"], [string, string]> = {
  hint: ["渐进提示", "Hint"],
  followUp: ["追问解答", "Follow-Up"],
  dryRun: ["手推错例", "Trace"],
  patternMap: ["审题模式", "Pattern Map"],
  review: ["复杂度复盘", "Review"],
  giveUp: ["完整讲解", "Full Guide"]
};

const KIND_LBL: Record<ProjectedContextItem["kind"], [string, string]> = {
  active_misconception: ["盲区", "Blind Spot"],
  concept_level: ["掌握度", "Mastery"],
  code_habit: ["习惯", "Habit"],
  preference: ["偏好", "Pref"]
};

const strictLbl = (s: CoachStrictness, l: UiLang) => {
  const x = STRICTS.find(([m]) => m === s);
  return x ? t(l, x[1], x[2]) : s;
};

function renderPrefsDrawer(st: WebviewState, l: UiLang): string {
  const { snapshot: snap } = st;
  const T = tr(l);
  const pr = snap.userOverrides.teachingPreferences;
  const opt = (rs: ReadonlyArray<[string, string, string]>): Array<[string, string]> => rs.map(([k, z, e]) => [k, T(z, e)]);
  const styles = opt([["socratic", "苏格拉底", "Socratic"], ["direct_minimal", "极简要点", "Direct"], ["dry_run_first", "错例优先", "Trace First"]]);
  const verbs = opt([["concise", "精炼", "Concise"], ["detailed", "详细", "Detailed"]]);
  const goals = opt([["beginner_cs", "基础入门", "CS Basics"], ["interview_leetcode", "面试刷题", "Interview"], ["contest_icpc_oi", "算法竞赛", "Contest"]]);
  const pRow = (lbl: string, k: string, list: ReadonlyArray<[string, string]>, cur: string) =>
    h("label", "fi", sp("lx", lbl) + sel(list, cur, `data-action="pref-update" data-pref-key="${k}"`, "sel sm"));
  const stricts = STRICTS.map(([m, zh, en]) => h("button", `seg-btn${snap.flags.coachStrictness === m ? " seg-btn-a" : ""}`, E(T(zh, en)), `type="button" ${ap(snap.flags.coachStrictness === m)} data-action="flag-update" data-key="coachStrictness" data-value="${m}"`)).join("");
  const sum = `${T("风格与偏好", "Style")} · ${strictLbl(snap.flags.coachStrictness, l)} · ${styles.find(([v]) => v === pr.hintStyle)?.[1] ?? ""}`;
  return h(
    "details",
    "dt",
    h("summary", "", `${icon("chev", 11)} ${E(sum)}`) +
      d(
        "c g2 mt1",
        d("c g1", sp("lx", T("教练语气", "Tone")) + d("seg-track seg-3", stricts)) +
          d(
            "c g1",
            pRow(T("提示风格", "Style"), "hintStyle", styles, pr.hintStyle) +
              pRow(T("回复详略", "Detail"), "verbosity", verbs, pr.verbosity) +
              pRow(T("训练目标", "Goal"), "targetGoal", goals, pr.targetGoal)
          )
      ),
    'data-drawer="coach-prefs"'
  );
}

function renderAudit(r: CoachResponsePayload, l: UiLang, idx: number): string {
  const T = tr(l);
  const its = r.audit.projectedItems.slice(0, 3);
  const rows = its.length
    ? its
        .map((it: ProjectedContextItem) =>
          d("r g1 au", badge(t(l, KIND_LBL[it.kind][0], KIND_LBL[it.kind][1])) + sp("lt f1", E(it.label)) + (it.muteable ? btn(T("屏蔽", "Mute"), "learner-mute-misconception", "g", "xs", `data-misconception-id="${E(it.sourceKey ?? it.id)}" data-muted="true"`) : ""))
        )
        .join("")
    : d("mu", E(T("未注入画像条目", "No profile items")));
  const summaryText = T(`上下文审计 · ${its.length}/3 · ${r.audit.characterBudgetUsed}/${r.audit.characterBudgetMax}`, `Audit · ${its.length}/3 · ${r.audit.characterBudgetUsed}/${r.audit.characterBudgetMax}`);
  return h("details", "dt", h("summary", "", `${icon("shd", 11)} ${E(summaryText)}`) + d("ab", rows + d("fn mo", `${E(r.audit.route)} · ${E(r.audit.renderer)}`)), `data-drawer="audit-${idx}"`);
}

const renderEntry = (r: CoachResponsePayload, l: UiLang, idx: number): string => {
  const badgeText = r.action === "dryRun" && r.stuckCategory === "implementation" && !r.dryRunPrompt ? t(l, "编译诊断", "CE Diagnosis") : t(l, ACT_LBL[r.action][0], ACT_LBL[r.action][1]);
  return h(
    "article",
    "ce",
    d("r rw g1", badge(badgeText, "a") + sp("mn mo", `L${r.hintLevel} · ${E(strictLbl(r.strictness, l))}`) + (r.spoilerSafe ? "" : badge(t(l, "已防剧透", "Sanitized"), "wn"))) +
      d("ce-h fw", E(r.headline)) +
      d("cb", renderMarkdownMath(r.guidance, l), 'data-protect-selection="true"') +
      (r.dryRunPrompt ? d("sub-sep", sp("lx", t(l, "最小反例输入", "Minimal Input")) + h("pre", "pre well mo", E(r.dryRunPrompt.minimalInput)) + d("cb", renderMarkdownMath(r.dryRunPrompt.question, l))) : "") +
      (r.guidingQuestion ? d("co", renderMarkdownMath(r.guidingQuestion, l)) : "") +
      renderAudit(r, l, idx)
  );
};

export function renderCoachControlsCard(st: WebviewState): string {
  const { snapshot: snap } = st;
  const l: UiLang = snap.flags.uiLanguage;
  const T = tr(l);
  const lv = snap.hintLevel;
  const next = Math.min(5, lv + 1) as HintLevel;
  const isCe = Boolean(snap.lastRun && !snap.lastRun.compileOk);
  const fail = snap.lastRun?.cases.find((c) => c.verdict !== "AC" && c.verdict !== "SKIPPED");
  const busy = snap.coachBusy;
  const noAi = !snap.aiConfig.chat.hasApiKey && snap.aiConfig.chat.provider !== "ollama";
  const giveUpUnlocked = Boolean(snap.giveUpUnlocked || snap.coachHistory.some((e) => e.action === "giveUp" && e.headline && !/尚未解锁|Locked/.test(e.headline)));

  const ladder = ([1, 2, 3, 4, 5] as const).map((s) => sp(`ld-s mo${s < lv ? " ld-d" : s === lv ? " ld-a" : ""}`, `L${s}`)).join("");
  const stucks = STUCKS.map(([c, zh, en]) => h("button", `sg${st.stuck === c ? " sg-a" : ""}`, E(T(zh, en)), `type="button" ${ap(st.stuck === c)} data-action="coach-select-stuck" data-stuck="${c}"`)).join("");

  const giveUp = giveUpUnlocked
    ? ""
    : st.giveUpConfirmPending
      ? d("al al-wn", d("at", `${icon("warn")} ${E(T("确认放弃并看完整讲解？", "Confirm Give Up?"))}`) + d("mu", E(T("本场段位封顶 C · 净码。", "Caps this problem's rank at C."))) + d("r g1 mt1", btn(T("确认放弃", "Confirm"), "coach-giveup-confirm", "d", "sm", "", busy) + btn(T("继续思考", "Cancel"), "coach-giveup-cancel")))
      : btn(T("放弃并查看讲解", "Give Up & Guide"), "coach-giveup-arm", "g", "xs", "", busy);

  const hintLbl = lv >= 5 ? T("已达最高提示 L5", "Max Hint L5") : T(`请求 L${next} 引导`, `Hint L${next}`);
  const askPh = T("输入思路或追问...", "Share idea or ask...");
  const ctxTitle = snap.activeProblem
    ? d("coach-ctx r g1", badge(snap.activeProblem.sourceId, "m", true) + sp("lt f1 fw", E(snap.activeProblem.title)))
    : "";
  const aiTip = noAi ? d("coach-offline r rb g1", sp("mu", E(T("离线基础提示（未配大模型）", "Offline mode (no AI key)"))) + btn(T("去配置 AI", "Setup AI"), "settings-open-env", "g", "xs")) : "";

  const ctl = d(
    "c g2",
    ctxTitle +
      aiTip +
      d("ld-head", d("ld", ladder)) +
      d("c g1", sp("lx", T("当前卡点", "Where stuck?")) + d("g2", stucks)) +
      d(
        "r rw g1",
        btn(`${icon("bulb", 11)} ${hintLbl}`, "coach-hint", "p", "sm", "", busy || lv >= 5) +
          (snap.flags.patternMapperEnabled ? btn(T("审题模式", "Pattern Map"), "coach-pattern-map", "s", "sm", "", busy) : "") +
          btn(`${icon("trace", 11)} ${isCe ? T("解读 CE 报错", "Explain CE") : fail ? T(`手推错例 (${fail.verdict})`, `Trace (${fail.verdict})`) : T("手推错例", "Trace")}`, "coach-dry-run", "s", "sm", "", busy) +
          (snap.flags.mockInterviewEnabled || snap.lastRun?.allPassed ? btn(T("复杂度复盘", "Review"), "coach-review", "s", "sm", "", busy) : "")
      ) +
      d("r g1", inp("ask", dr(st, "ask"), askPh, "in f1", "text", ` aria-label="${E(askPh)}"`) + btn(T("发送", "Send"), "coach-followup", "s", "sm", "", busy)) +
      renderPrefsDrawer(st, l) +
      (giveUp ? d("", giveUp) : "")
  );

  return d("patch-slot", sec(T("互动诊断与引导", "Coaching"), ctl, cnt(`L${lv}/5`)), 'data-patch="coach-controls"');
}

export function renderCoachHistoryCard(st: WebviewState): string {
  const { snapshot: snap } = st;
  const l: UiLang = snap.flags.uiLanguage;
  const T = tr(l);
  const stream = snap.coachBusy || st.stream ? d("sub-sep", badge(T("思考中", "Thinking"), "a") + h("div", "cb mt1", EM(st.stream?.text ?? T("分析中...", "Analyzing...")), 'data-stream-target="true"')) : "";
  const log = snap.coachHistory.length || stream ? snap.coachHistory.map((e, i) => renderEntry(e, l, i)).reverse().join("") : emptyBox(T("点上方按钮发起引导或手推错例。", "Pick Hint or Trace above."));
  return d("patch-slot", sec(T("对话记录", "History"), stream + log, cnt(snap.coachHistory.length)), 'data-patch="coach-history"');
}

export function renderCoachView(st: WebviewState): string {
  const { snapshot: snap } = st;
  const l: UiLang = snap.flags.uiLanguage;
  const T = tr(l);
  if (!snap.activeProblem) {
    return emptyCard(
      workbenchArtImg(),
      T("尚未选择题目", "No Active Problem"),
      T("先在「选题」导题或加载热身包。", "Pick a problem in Bank or load warmup."),
      btn(`${icon("book")} ${T("前往选题", "Browse")}`, "switch-tab", "p", "sm", 'data-tab="problems"') +
        btn(`${icon("play")} ${T("加载 3 题热身包", "Load 3-Problem Warmup")}`, "starter-load-warmup"),
      renderPrefsDrawer(st, l)
    );
  }
  return renderCoachControlsCard(st) + renderCoachHistoryCard(st);
}
