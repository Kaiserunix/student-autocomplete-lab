import { badge, btn, cnt, d, dataRow, drawer, emptyBox, h, meterSvg, openBtn, sec, sp, tbl } from "../dom";
import { mistakeStatusLabel, tr, type UiLang } from "../i18n";
import { escapeHtml as E, type WebviewState } from "../state";

export function renderDossierView(st: WebviewState): string {
  const { snapshot: snap } = st;
  const l: UiLang = snap.flags.uiLanguage;
  const T = tr(l);
  const lr = snap.learnerSnapshot;
  const ov = snap.userOverrides;
  const vals = Object.values;
  const kpiCell = (val: string, lbl: string) => d("kp-cell", sp("kv mo", E(val)) + sp("kp-lbl", E(lbl)));

  const concepts = vals(lr.conceptMastery).sort((a, b) => b.attemptedCount - a.attemptedCount || b.masteryScore - a.masteryScore);
  const conceptHtml = concepts.length
    ? tbl(
        `<th>${E(T("知识点", "Concept"))}</th><th class="num">${E(T("掌握度", "Mastery"))}</th><th class="num">${E(T("独立", "AC"))}</th><th class="num">${E(T("难度", "Tier"))}</th>`,
        concepts
          .map((c) => {
            const pct = Math.max(0, Math.min(100, Math.round(c.masteryScore <= 1 ? c.masteryScore * 100 : c.masteryScore)));
            return `<tr><td class="mo"><span class="tag-cell" title="${E(c.conceptTag)}">${E(c.conceptTag)}</span></td><td class="num mo">${sp("mc", meterSvg(pct) + sp("", `${pct}%`))}</td><td class="num mo">${c.independentAcCount}/${c.attemptedCount}</td><td class="num mo">T${c.highestIndependentTier}</td></tr>`;
          })
          .join("")
      )
    : emptyBox(T("回填官方结果后追踪各知识点掌握度。", "Record verdicts to track mastery."));

  const miscs = vals(lr.misconceptionStats).sort((a, b) => Number(a.muted) - Number(b.muted) || b.recentWeightedCount - a.recentWeightedCount);
  const miscHtml = miscs.length
    ? miscs
        .map((m) => {
          const mu = m.muted || Boolean(ov.mutedMisconceptionIds[m.misconceptionId]);
          const detail = T(`加权 ${m.recentWeightedCount.toFixed(1)} · ${m.uniqueProblemKeys.length} 题`, `Wt ${m.recentWeightedCount.toFixed(1)} · ${m.uniqueProblemKeys.length} prob`);
          return dataRow(
            d("r g1 rw", sp(`mo${mu ? " sk" : ""}`, E(m.misconceptionId)) + badge(mu ? T("已屏蔽", "Muted") : T("活跃", "Active"), mu ? "m" : "wn")),
            d("mu", E(detail)),
            btn(mu ? T("恢复", "Restore") : T("屏蔽", "Mute"), "learner-mute-misconception", "g", "xs", `data-misconception-id="${E(m.misconceptionId)}" data-muted="${mu ? "false" : "true"}"`)
          );
        })
        .join("")
    : emptyBox(T("暂无高频盲区记录。", "No blind spots yet."));

  const mistakes = vals(lr.mistakeNotebook).sort((a, b) => b.lastAttemptAt.localeCompare(a.lastAttemptAt));
  const mistakeHtml = mistakes.length
    ? mistakes.slice(0, 12).map((m) => dataRow(d("lt", E(m.title), `title="${E(m.title)}"`), d("mu", E(m.takeaway || mistakeStatusLabel(m.lastStatus, l))), openBtn(m.problemKey, T("打开", "Open")))).join("")
    : emptyBox(T("错题本为空。", "Mistake notebook is empty."));

  const kpi = h(
    "section",
    "card kpi-card",
    d(
      "kpi-strip",
      kpiCell(String(lr.recentTrajectory.last7dAttempts), T("7 天作答", "7d Runs")) +
        kpiCell(`${Math.round((lr.recentTrajectory.independentAcRate || 0) * 100)}%`, T("独立 AC", "Indep AC")) +
        kpiCell(`L${lr.recentTrajectory.avgHintLevel.toFixed(1)}`, T("平均提示", "Avg Hint"))
    )
  );

  const recentList = (snap.recentEvents ?? []).length
    ? (snap.recentEvents ?? [])
        .map((ev) => dataRow(d("r g1", badge(ev.verdict, ev.verdict === "AC" ? "ok" : "er", true) + sp("lt f1", E(ev.title))), d("mu mo", E(ev.timestamp.slice(0, 16).replace("T", " "))), btn(T("作废", "Void"), "learner-void-id", "g", "xs", `data-event-id="${E(ev.eventId)}"`)))
        .join("")
    : "";

  const voidDrawer = drawer(
    "dossier-void",
    T("作废误填评测事件", "Void Event"),
    recentList ? d("c g1", recentList) : emptyBox(T("暂无近期可作废事件。", "No recent events to void.")),
    cnt(ov.voidedEventIds.length)
  );

  return (
    kpi +
    sec(T("知识点掌握度", "Concept Mastery"), conceptHtml, cnt(concepts.length)) +
    sec(T("高频盲区与错题本", "Blind Spots & Mistakes"), d("c g2", d("c g1", sp("lx", T("活跃盲区", "Blind Spots")) + miscHtml) + d("sub-sep", sp("lx", T("近期错题", "Mistakes")) + mistakeHtml)), cnt(miscs.length)) +
    voidDrawer
  );
}
