import type { ProblemDocument, ProblemSourceId, RecommendationBucket } from "../../core/contracts";
import { ojIconImg } from "../assets";
import { ap, badge, btn, cnt, d, dataRow, drawer, emptyBox, h, inp, openBtn, rbtn, sec, sel, sp, subTabs } from "../dom";
import { completenessLabel, mistakeStatusLabel, sourceLabel, t, tr, type UiLang } from "../i18n";
import { icon } from "../icons";
import { escapeHtml as E, getDraftOrFallback as dr, getDueReviewItems, type WebviewState } from "../state";

const SRCS: readonly ProblemSourceId[] = ["leetcode-cn", "leetcode-global", "luogu", "codeforces", "atcoder", "nowcoder"];
export const SEARCH_SRCS: readonly ProblemSourceId[] = ["leetcode-cn", "leetcode-global", "luogu", "codeforces", "atcoder"];
export const DEF_SEARCH_SRCS = "leetcode-cn,luogu,codeforces";
const chipName = (id: ProblemSourceId, l: UiLang): string =>
  id === "leetcode-global" ? (l === "en-US" ? "LC" : "LeetCode") : id === "codeforces" ? "CF" : id === "leetcode-cn" && l === "en-US" ? "LC-CN" : sourceLabel(id, l);

export function getSearchSrcs(st: WebviewState): ProblemSourceId[] {
  const valid = dr(st, "ssrcs", DEF_SEARCH_SRCS).split(",").filter((x): x is ProblemSourceId => SEARCH_SRCS.includes(x as ProblemSourceId));
  return valid.length ? [...new Set(valid)] : ["leetcode-cn"];
}

function problemRow(p: ProblemDocument, l: UiLang, ak?: string): string {
  const [compText, tone] = completenessLabel(p.completeness, l);
  const meta = [
    sp("mo", E(p.sourceId)),
    p.difficulty?.rawLabel ? sp("", E(p.difficulty.rawLabel)) : "",
    p.samples.length ? sp("", E(t(l, `${p.samples.length} 组`, `${p.samples.length}`))) : "",
    p.completeness !== "full" ? sp(tone, E(compText)) : ""
  ].filter(Boolean).join("");
  const active = p.problemKey === ak;
  return rbtn(
    `lr${active ? " lr-a" : ""}`,
    d("r g1", h("span", "bg bg-m oj-chip", ojIconImg(p.source) + E(sourceLabel(p.source, l))) + sp("lt f1", E(p.title))) + d("r rw g2 mu", meta),
    `${active ? 'aria-current="true" ' : ""}data-action="problem-select" data-problem-key="${E(p.problemKey)}"`
  );
}

export function renderProblemsView(st: WebviewState): string {
  const { snapshot: snap } = st;
  const l: UiLang = snap.flags.uiLanguage;
  const T = tr(l);
  const ak = snap.activeProblem?.problemKey;
  const opts: Array<[string, string]> = SRCS.map((id) => [id, sourceLabel(id, l)]);
  const pmode = dr(st, "sub.pmode", "imp") === "qry" ? "qry" : "imp";
  const sub = dr(st, "sub.problems", "saved");
  const { dueM, dueR, count: dueN } = getDueReviewItems(snap);

  const b = snap.bridgeStatus;
  const bridgePill = d("r g1 mo mn", sp(`dot ${b.listening ? "dot-ok" : "dot-m"}`, "") + sp("", b.listening && b.port ? `127.0.0.1:${b.port}` : T("离线", "Off")));
  const modeSeg = d(
    "seg-track mode-seg",
    rbtn(`seg-btn${pmode === "imp" ? " seg-btn-a" : ""}`, E(T("导题", "Import")), `${ap(pmode === "imp")} data-action="sub-tab" data-sub-key="pmode" data-sub-val="imp"`) +
      rbtn(`seg-btn${pmode === "qry" ? " seg-btn-a" : ""}`, E(T("搜题", "Search")), `${ap(pmode === "qry")} data-action="sub-tab" data-sub-key="pmode" data-sub-val="qry"`)
  );

  const picked = new Set(getSearchSrcs(st));
  const allOn = picked.size === SEARCH_SRCS.length;
  const chips = d(
    "src-picks",
    SEARCH_SRCS.map((id) => rbtn(`chip${picked.has(id) ? " chip-a" : ""}`, E(chipName(id, l)), `${ap(picked.has(id))} data-action="search-toggle-src" data-src="${id}"`)).join("") +
      rbtn(`chip${allOn ? " chip-a" : ""}`, E(T("全选", "All")), `${ap(allOn)} data-action="search-toggle-all"`),
    `role="group" aria-label="${E(T("搜索平台", "Search platforms"))}"`
  );
  const sr = snap.searchResults;
  const srHtml = sr
    ? d(
        "sub-sep",
        d("r rb g1", sp("lx", E(T(`「${sr.keyword}」· ${sr.items.length} 题`, `"${sr.keyword}" · ${sr.items.length}`))) + btn(T("清空", "Clear"), "problem-clear-search", "g", "xs")) +
          (sr.failedSources.length ? d("fn wn", E(T(`暂不可用：${sr.failedSources.map((s) => chipName(s, l)).join(" / ")}`, `Unavailable: ${sr.failedSources.map((s) => chipName(s, l)).join(", ")}`))) : "") +
          (sr.items.length ? d("lr-list sr-list mt1", sr.items.map((p) => problemRow(p, l, ak)).join("")) : emptyBox(T("未搜到匹配题目。", "No matches found.")))
      )
    : "";

  const omniCard = h(
    "section",
    "card",
    d(
      "c g2",
      d("r rb g1 rw", modeSeg + bridgePill) +
        (pmode === "imp"
          ? d(
              "field-bar",
              sel([["auto", T("自动", "Auto")], ...opts], dr(st, "isrc", "auto"), `data-draft="isrc" aria-label="${E(T("平台", "Platform"))}"`, "sel sc fb-sel") +
                inp("imp", dr(st, "imp"), "#1 / two-sum / P1001 / CF1900A", "in f1 fb-in", "text", ` aria-label="${E(T("链接或题号", "URL or ID"))}"`) +
                btn(`${icon("imp")} ${T("导入", "Import")}`, "problem-import-ref", "p", "sm", 'data-role="fb-btn"')
            )
          : d(
              "r g1",
              inp("qry", dr(st, "qry"), T("跨平台关键词...", "Cross-OJ keyword..."), "in f1", "text", ` aria-label="${E(T("搜索", "Search"))}"`) +
                btn(`${icon("find")} ${snap.searchBusy ? T("搜索中", "Busy") : T("搜题", "Search")}`, "problem-search", "p", "sm", "", snap.searchBusy)
            ) +
              chips +
              srHtml)
    )
  );

  const nav = subTabs(
    "problems",
    [
      ["saved", `${E(T("已存", "Saved"))} ${cnt(snap.problems.length)}`],
      ["today", `${E(T("今日计划", "Today"))}${dueN > 0 ? ` <span class="tab-n mo">${dueN}</span>` : ""}`],
      ["sheets", E(T("题单", "Sheets"))]
    ],
    sub,
    T("选题视图", "Problem views")
  );

  let body = "";
  if (sub === "today") {
    const revLbl = T("复习", "Review");
    const dueHtml = dueN
      ? [
          ...dueM.map((m) => dataRow(d("lt", E(m.title), `title="${E(m.title)}"`), d("mu mo", `${m.fsrsCard.due.slice(0, 10)} · ${E(mistakeStatusLabel(m.lastStatus, l))}`), openBtn(m.problemKey, revLbl))),
          ...dueR.map((r) => dataRow(d("lt", E(r.title), `title="${E(r.title)}"`), d("mu", E(r.rationale)), openBtn(r.problemKey, revLbl)))
        ].join("")
      : emptyBox(T("今日暂无到期复习。", "No reviews due."));
    const shown = new Set([...dueM.map((m) => m.problemKey), ...dueR.map((r) => r.problemKey)]);
    const deduped = snap.recommendations.filter((r) => !(r.bucket === "fsrs_due" && shown.has(r.problemKey)));
    const buckets: ReadonlyArray<[RecommendationBucket, string]> = [
      ["fsrs_due", T("间隔复习", "Spaced Review")],
      ["targeted_transfer", T("薄弱迁移", "Targeted Transfer")],
      ["zpd_stretch", T("进阶挑战", "Stretch Challenge")]
    ];
    const recHtml = deduped.length
      ? buckets
          .map(([bk, lbl]) => {
            const its = deduped.filter((r) => r.bucket === bk);
            return its.length
              ? d("c g1", sp("lx", E(lbl)) + its.map((r) => dataRow(d("r g1", h("span", "lt f1", E(r.title), `title="${E(r.title)}"`) + badge(`T${r.difficultyTier}`, "m", true)), d("mu", E(r.rationale)), openBtn(r.problemKey, T("做题", "Solve")))).join(""))
              : "";
          })
          .join("")
      : emptyBox(T("回填结果后生成推荐。", "Record verdicts for recs."));
    body = sec(T("今日到期复习", "Due for Review"), dueHtml, cnt(dueN)) + sec(T("下一步推荐", "Recommended Next"), d("c g2", recHtml), cnt(deduped.length));
  } else if (sub === "sheets") {
    const starter = snap.flags.starterPackEnabled
      ? sec(
          T("新手热身包", "Starter Warmup"),
          d("mu", E(T("离线体验 IO、函数模式与调试。", "Offline IO, function & binary search."))) +
            d("r rw g1 mt1", btn(`${icon("play")} ${T("加载 3 题热身包", "Load 3-Problem Warmup")}`, "starter-load-warmup", "t") + btn(`${icon("book")} ${T("新手教程", "Walkthrough")}`, "starter-open-walkthrough"))
        )
      : "";
    body =
      sec(
        T("精选路线单", "Curated Sheets"),
        d("r rw g1", snap.curatedSheets.map((s) => btn(`${E(s.title)} ${cnt(T(`${s.count} 题`, `· ${s.count}`))}`, "problem-load-sheet", "s", "sm", `data-sheet-id="${E(s.id)}"`)).join(""))
      ) + starter;
  } else {
    const list = snap.problems.length
      ? d("lr-list", snap.problems.map((p) => problemRow(p, l, ak)).join(""))
      : emptyBox(T("暂无已存题目。", "No saved problems."));
    body = sec(T("已存题目", "Saved Problems"), list, cnt(snap.problems.length));
  }

  const metaOnly = snap.activeProblem?.completeness === "metadata_only";
  const clpLbl = T("粘贴题面（留空读剪贴板）", "Paste statement (or clipboard)");
  const advancedDrawer = drawer(
    "problems-advanced",
    T("粘贴题面 / 6 平台同步", "Clipboard / 6-OJ Sync"),
    d(
      "c g2",
      d(
        "c g1",
        sp("lx", clpLbl) +
          h("textarea", "ta mo", E(dr(st, "clp")), `rows="3" placeholder="${E(T("粘贴题面或样例...", "Paste statement..."))}" aria-label="${E(clpLbl)}" data-draft="clp"`) +
          d("r rw g1", btn(T("导入为新题", "Import New"), "problem-import-clipboard", metaOnly ? "s" : "t", "sm", 'data-merge="false"') + btn(T("合并到当前题", "Merge Active"), "problem-import-clipboard", metaOnly ? "t" : "s", "sm", 'data-merge="true"', !ak))
      ) +
        d(
          "sub-sep c g1",
          sp("lx fw", "Companion / 油猴") +
            d("mu", E(T("推题 & 6 平台回传。", "Push & 6-OJ verdict sync."))) +
            d("r rw g1", btn(`${icon("copy", 11)} ${T("复制 6 平台油猴脚本", "Copy 6-OJ Userscript")}`, "bridge-copy-userscript", "g", "sm")) +
            (b.lastError ? d("fn er", E(b.lastError)) : "")
        )
    ),
    "",
    Boolean(st.panels.clip)
  );

  return omniCard + nav + body + advancedDrawer;
}
