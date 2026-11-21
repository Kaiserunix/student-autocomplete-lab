import type { ProblemSourceId } from "../../core/contracts";
import { badge, btn, cnt, d, emptyBox, h, inp, sec, sel, sp } from "../dom";
import { completenessLabel, sourceLabel, t, type UiLang } from "../i18n";
import { icon } from "../icons";
import { escapeHtml as E, getDraftOrFallback as dr, type WebviewState } from "../state";

const SRCS: readonly ProblemSourceId[] = ["leetcode-cn", "leetcode-global", "luogu", "codeforces", "atcoder", "nowcoder"];

export function renderProblemsView(st: WebviewState): string {
  const { snapshot: snap } = st, l: UiLang = snap.flags.uiLanguage, T = (zh: string, en: string) => t(l, zh, en), ak = snap.activeProblem?.problemKey;
  const opts: Array<[string, string]> = SRCS.map((id) => [id, sourceLabel(id, l)]);

  const starter = snap.flags.starterPackEnabled
    ? sec("Starter Pack", d("r rw g1", btn(`${icon("play")} ${T("3 题热身包", "3-Problem Warmup")}`, "starter-load-warmup", "p") + btn(`${icon("book")} Walkthrough`, "starter-open-walkthrough")), badge("ON", "a"))
    : "";

  const imp = sec(
    T("导入 / 搜索", "Import / Search"),
    d("c g1", d("r g1", sel([["auto", "Auto"], ...opts], dr(st, "isrc", "auto"), 'data-draft="isrc"', "sel sc") + inp("imp", dr(st, "imp"), "URL / P1001 / 1900A / abc350_c", "in f1") + btn(icon("imp"), "problem-import-ref", "p")) + d("r g1", sel(opts, dr(st, "ssrc", "leetcode-cn"), 'data-draft="ssrc"', "sel sc") + inp("qry", dr(st, "qry"), T("关键词", "Keyword"), "in f1") + btn(icon("find"), "problem-search")))
  );

  const sheets = sec(T("路线单", "Sheets"), d("r rw g1", snap.curatedSheets.map((s) => btn(`${E(s.title)} ${cnt(s.count)}`, "problem-load-sheet", "s", "sm", `data-sheet-id="${E(s.id)}"`)).join("")));

  const clip = sec(
    "Clipboard / MD",
    st.panels.clip ? d("c g1", h("textarea", "ta mo", E(dr(st, "clp")), 'rows="4" data-draft="clp"') + d("r g1", btn(T("新题", "New"), "problem-import-clipboard", "p", "sm", 'data-merge="false"') + btn(T("合并", "Merge"), "problem-import-clipboard", "s", "sm", 'data-merge="true"', !ak))) : "",
    btn(st.panels.clip ? "-" : "+", "toggle-panel", "s", "xs", 'data-panel="clip"')
  );

  const b = snap.bridgeStatus;
  const br = h("section", "sec", d("r g1 mo mn", sp(`dot ${b.listening ? "dot-ok" : "dot-m"}`, "") + sp("", "Bridge") + sp("sp", "") + sp("", b.listening && b.port ? `127.0.0.1:${b.port}` : "Off")) + (b.lastError ? d("fn er", E(b.lastError)) : ""));

  const list = snap.problems.length
    ? snap.problems.map((p) => {
        const [, tone] = completenessLabel(p.completeness, l);
        return h("button", `lr${p.problemKey === ak ? " lr-a" : ""}`, d("r g1", badge(sourceLabel(p.source, l)) + sp("lt", E(p.title))) + d("r rw g1 mo mu", sp("", E(p.sourceId)) + (p.difficulty?.rawLabel ? sp("", E(p.difficulty.rawLabel)) : "") + sp("", `${p.samples.length}c`) + sp(tone, E(p.completeness))), `type="button" data-action="problem-select" data-problem-key="${E(p.problemKey)}"`);
      }).join("")
    : emptyBox("No problems");

  return starter + imp + sheets + clip + br + sec(T("题库", "Problems"), list, cnt(snap.problems.length));
}
