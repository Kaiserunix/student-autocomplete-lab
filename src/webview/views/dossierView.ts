import type { RecommendationBucket } from "../../core/contracts";
import { badge, btn, cnt, d, dataRow, emptyBox, h, inp, meterSvg, sec, sel, sp, tbl } from "../dom";
import { t, type UiLang } from "../i18n";
import { icon } from "../icons";
import { escapeHtml as E, getDraftOrFallback as dr, type WebviewState } from "../state";

const LANGS: ReadonlyArray<[string, string]> = "cpp,python,c,rust,java,generic".split(",").map((x) => [x, x]);
const BUCKETS: ReadonlyArray<[RecommendationBucket, string]> = [["fsrs_due", "FSRS Due"], ["targeted_transfer", "Transfer"], ["zpd_stretch", "ZPD Stretch"]];
const openBtn = (pk: string, lbl: string): string => btn(lbl, "problem-select", "s", "xs", `data-problem-key="${E(pk)}"`);

export function renderDossierView(st: WebviewState): string {
  const { snapshot: snap } = st, l: UiLang = snap.flags.uiLanguage, T = (zh: string, en: string) => t(l, zh, en);
  const lr = snap.learnerSnapshot, ov = snap.userOverrides, pr = ov.teachingPreferences;
  const now = Number.isFinite(Date.parse(lr.derivedAt)) ? Date.parse(lr.derivedAt) : Date.now();
  const vals = Object.values;
  const pSel = (k: string, list: ReadonlyArray<[string, string]>, cur: string) => sel(list, cur, `data-action="pref-update" data-pref-key="${k}"`);
  const kp = (lbl: string, val: string) => d("kp", sp("lx", lbl) + sp("kv", val));
  const revLbl = T("复习", "Review");

  const dueM = vals(lr.mistakeNotebook).filter((e) => { const du = Date.parse(e.fsrsCard.due); return Number.isFinite(du) && du <= now; }).sort((a, b) => a.fsrsCard.due.localeCompare(b.fsrsCard.due));
  const dueSet = new Set(dueM.map((m) => m.problemKey));
  const dueR = snap.recommendations.filter((r) => r.bucket === "fsrs_due" && !dueSet.has(r.problemKey));
  const dueN = dueM.length + dueR.length;
  const dueHtml = dueN
    ? [...dueM.map((m) => dataRow(d("lt", E(m.title)), d("mu mo", `${E(m.fsrsCard.due.slice(0, 10))} · ${E(m.lastStatus)}`), openBtn(m.problemKey, revLbl))), ...dueR.map((r) => dataRow(d("lt", E(r.title)), d("mu", E(r.rationale)), openBtn(r.problemKey, revLbl)))].join("")
    : emptyBox("None due");

  const concepts = vals(lr.conceptMastery).sort((a, b) => b.attemptedCount - a.attemptedCount || b.masteryScore - a.masteryScore);
  const conceptHtml = concepts.length
    ? tbl(`<th>Tag</th><th class="num">Score</th><th class="num">AC</th><th class="num">Tier</th>`, concepts.map((c) => {
        const pct = Math.max(0, Math.min(100, Math.round(c.masteryScore * 100)));
        return `<tr><td class="mo">${E(c.conceptTag)}</td><td class="num mo">${sp("mc", meterSvg(pct) + sp("", `${pct}%`))}</td><td class="num mo">${c.independentAcCount}/${c.attemptedCount}</td><td class="num mo">T${c.highestIndependentTier}</td></tr>`;
      }).join(""))
    : emptyBox("No data");

  const miscs = vals(lr.misconceptionStats).sort((a, b) => Number(a.muted) - Number(b.muted) || b.recentWeightedCount - a.recentWeightedCount);
  const miscHtml = miscs.length
    ? miscs.map((m) => {
        const mu = m.muted || Boolean(ov.mutedMisconceptionIds[m.misconceptionId]);
        return dataRow(d("r g1", sp(`mo${mu ? " sk" : ""}`, E(m.misconceptionId)) + badge(mu ? "Muted" : "Active", mu ? "m" : "wn")), d("mu mo", `w=${m.recentWeightedCount.toFixed(1)} · ${m.uniqueProblemKeys.length}p`), btn(mu ? T("恢复", "Restore") : T("屏蔽", "Mute"), "learner-mute-misconception", "s", "xs", `data-misconception-id="${E(m.misconceptionId)}" data-muted="${mu ? "false" : "true"}"`));
      }).join("")
    : emptyBox("No blind spots");

  const mistakes = vals(lr.mistakeNotebook).sort((a, b) => b.lastAttemptAt.localeCompare(a.lastAttemptAt));
  const mistakeHtml = mistakes.length ? mistakes.slice(0, 12).map((m) => dataRow(d("lt", E(m.title)), d("mu", E(m.takeaway || m.lastStatus)), openBtn(m.problemKey, "Open"))).join("") : emptyBox("Empty");

  const recHtml = snap.recommendations.length
    ? BUCKETS.map(([b, lbl]) => {
        const its = snap.recommendations.filter((r) => r.bucket === b);
        return its.length ? d("c g1", sp("lx", lbl) + its.map((r) => dataRow(d("r g1", sp("lt", E(r.title)) + badge(`T${r.difficultyTier}`, "m", true)), d("mu", E(r.rationale)), openBtn(r.problemKey, "Go"))).join("")) : "";
      }).join("")
    : emptyBox("No recs");

  const habits = ov.autocompleteCodeHabits.length
    ? ov.autocompleteCodeHabits.map((hb) => d("row", h("label", "r g1 f1", `<input class="ck" type="checkbox" data-action="habit-toggle" data-habit-id="${E(hb.id)}"${hb.enabled ? " checked" : ""}>` + badge(hb.language, "m", true) + sp("lt", E(hb.ruleText))) + h("button", "bi", icon("del"), `type="button" data-action="habit-delete" data-habit-id="${E(hb.id)}"`))).join("")
    : emptyBox("No habits");

  const kpi = h("section", "sec", d("g3 mo", kp("7d", String(lr.recentTrajectory.last7dAttempts)) + kp("Indep AC", `${Math.round((lr.recentTrajectory.independentAcRate || 0) * 100)}%`) + kp("Avg Hint", `L${lr.recentTrajectory.avgHintLevel.toFixed(1)}`)));
  const pref = d(
    "c g2",
    d("g3", pSel("hintStyle", [["socratic", "socratic"], ["direct_minimal", "direct"], ["dry_run_first", "dry_run"]], pr.hintStyle) + pSel("verbosity", [["concise", "concise"], ["detailed", "detailed"]], pr.verbosity) + pSel("targetGoal", [["beginner_cs", "CS"], ["interview_leetcode", "Interview"], ["contest_icpc_oi", "Contest"]], pr.targetGoal)) +
      d("c g1", sp("lx", "Code Habits") + habits + d("r g1", sel(LANGS, dr(st, "hlang", "cpp"), 'data-draft="hlang"', "sel sc") + inp("hab", dr(st, "hab"), "Prefer long long", "in f1", "text", ' maxlength="120"') + btn(icon("plus"), "habit-add"))) +
      h("details", "dt", h("summary", "", `Void Event (${ov.voidedEventIds.length})`) + d("r g1 mt1", inp("vid", dr(st, "vid"), "eventId", "in f1 mo") + btn("Void", "learner-void-event")))
  );

  return kpi + sec("1. FSRS Due", dueHtml, cnt(dueN)) + sec(T("2. 掌握度", "2. Mastery"), conceptHtml, cnt(concepts.length)) + sec(T("3. 错题与盲区", "3. Mistakes"), d("c g2", d("", miscHtml) + d("", mistakeHtml)), cnt(miscs.length)) + sec(T("推荐", "Recs"), d("c g2", recHtml), cnt(snap.recommendations.length)) + sec(T("偏好与习惯", "Prefs"), pref);
}
