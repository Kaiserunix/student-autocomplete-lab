import type { LocalRunResult, OfficialVerdictStatus, ProblemSample, SampleCaseResult } from "../../core/contracts";
import { badge, btn, cnt, d, emptyBox, h, sec, sp } from "../dom";
import { completenessLabel, sourceLabel, t, type UiLang } from "../i18n";
import { icon } from "../icons";
import { escapeHtml as E, escapeMultilineHtml as EM, getDraftOrFallback as dr, sanitizeExternalUrl, type WebviewState } from "../state";

function renderDiff(c: SampleCaseResult): string {
  const e = (c.expected ?? "").replace(/\r\n/g, "\n").split("\n"), a = c.actual.replace(/\r\n/g, "\n").split("\n");
  const n = Math.min(Math.max(e.length, a.length), 24);
  let rows = "";
  for (let i = 0; i < n; i++) {
    const el = e[i] ?? "", al = a[i] ?? "";
    const rw = (cls: string, s: string, x: string) => d(`dr${cls}`, sp("dn", String(i + 1)) + sp("ds", s) + h("span", "", E(x)));
    rows += el.trimEnd() === al.trimEnd() ? rw("", " ", al) : rw(" ac-diff-del", "-", el) + rw(" ac-diff-add", "+", al);
  }
  return d("db", d("dm", sp("", "In:") + h("pre", "pi", E(c.input || "(empty)"))) + (c.diffSummary ? d("mu", E(c.diffSummary)) : "") + d("dl mo", rows) + (c.stderr ? sp("lx", "stderr") + h("pre", "pre", E(c.stderr)) : ""));
}

const delBtn = (orig: boolean, pk: string, id: string): string =>
  orig ? "" : h("button", "bi", icon("del"), `type="button" data-action="sample-delete" data-problem-key="${E(pk)}" data-sample-id="${E(id)}"`);

const caseRow = (orig: boolean, i: number, pk: string, id: string, mid: string, extra = ""): string =>
  d("si", d("r g1", sp("mo fw", `${orig ? "" : "C"}#${i + 1}`) + mid + sp("sp", "") + delBtn(orig, pk, id)) + extra);

function renderRun(run: LocalRunResult, pk: string): string {
  const ce = run.compileOk ? "" : d("al al-err", d("at", `${icon("x")} CE`) + h("pre", "pre", E(run.compileStderr ?? "")));
  const cases = run.cases.map((c, i) =>
    caseRow(c.isOriginal, i, pk, c.id, badge(c.verdict, c.verdict === "AC" ? "ok" : c.verdict === "SKIPPED" ? "m" : "er", true) + cnt(`${Math.round(c.durationMs)}ms`) + (c.peakMemoryKb !== undefined ? cnt(`${Math.round(c.peakMemoryKb)}KB`) : ""), c.verdict !== "AC" ? renderDiff(c) : "")
  ).join("");
  return d("rs", sp(`mo ${run.allPassed ? "ok" : "er"}`, run.allPassed ? "PASS" : "FAIL") + cnt(`${run.originalPassed}/${run.originalTotal}${run.customTotal ? `+${run.customPassed}/${run.customTotal}` : ""}`) + sp("mu", E(run.mode))) + ce + cases + (run.memoryNote ? d("fn", E(run.memoryNote)) : "");
}

const ioBox = (l: string, x: string) => d("f1", sp("lx", l) + h("pre", "pre", E(x)));
const renderSamples = (ss: readonly ProblemSample[], pk: string): string =>
  ss.length ? ss.map((s, i) => caseRow(s.isOriginal, i, pk, s.id, badge("READY"), d("g2", ioBox("IN", s.input) + ioBox("OUT", s.expectedOutput ?? "")))).join("") : emptyBox("No samples");

export function renderWorkspaceView(st: WebviewState): string {
  const { snapshot: snap } = st, l: UiLang = snap.flags.uiLanguage, T = (zh: string, en: string) => t(l, zh, en), p = snap.activeProblem;
  if (!p) {
    return h("section", "sec", d("c g2", d("pt", T("未选题", "No Problem")) + d("r rw g1", btn(`${icon("book")} ${T("题库", "Problems")}`, "switch-tab", "p", "sm", 'data-tab="problems"') + (snap.flags.starterPackEnabled ? btn(`${icon("play")} Warmup`, "starter-load-warmup") : ""))));
  }

  const [ct, cTone] = completenessLabel(p.completeness, l), url = sanitizeExternalUrl(p.canonicalUrl);
  const rk = snap.flags.stylishRankEnabled ? snap.stylishRank : undefined;
  const run = snap.lastRun?.problemKey === p.problemKey ? snap.lastRun : undefined;
  const showCf = p.source === "codeforces" || snap.aiConfig.codeforcesHandle.trim().length > 0;
  const vs: OfficialVerdictStatus[] = ["AC", "WA", "TLE", "RE"];

  const hdr = h(
    "section",
    "sec",
    d(
      "c g1",
      d("r rw g1", badge(sourceLabel(p.source, l), "a") + badge(p.sourceId, "m", true) + badge(ct, cTone) + (p.difficulty?.rawLabel ? badge(p.difficulty.rawLabel) : "")) +
        h("h2", "pt", E(p.title) + (url ? h("a", "lk", icon("ext", 11), `href="${E(url)}"`) : "")) +
        d("r rw g2 mo mu", sp("", E(snap.activeLanguage ?? "auto")) + (p.constraints?.timeLimitMs ? sp("", `TL ${p.constraints.timeLimitMs}ms`) : "") + (p.constraints?.memoryLimitMb ? sp("", `ML ${p.constraints.memoryLimitMb}MB`) : "") + sp("", E(p.ioMode))) +
        (rk ? d("rk", sp("rkb mo", E(rk.meta.statusBarLabel)) + cnt(`${Math.round(rk.score)}pt`) + (rk.ceilingReason ? sp("wn", `${T("封顶", "Cap")}: ${E(rk.ceilingReason)}`) : sp("mu", E(rk.lastEventSummary)))) : "") +
        (p.statementMarkdown ? h("details", "dt", h("summary", "", T("题面", "Statement"), 'data-action="toggle-panel" data-panel="stmt"') + d("sb", EM(p.statementMarkdown.slice(0, 2400))), st.panels.stmt ? "open" : "") : "")
    )
  );

  const form = st.panels.sample
    ? d("sub", h("textarea", "ta mo", E(dr(st, "sin")), 'rows="3" placeholder="stdin" data-draft="sin"') + h("textarea", "ta mo", E(dr(st, "sex")), 'rows="2" placeholder="expected" data-draft="sex"') + d("r g1", btn(T("保存", "Save"), "sample-add-submit", "p", "sm", `data-problem-key="${E(p.problemKey)}"`) + btn(T("取消", "Cancel"), "toggle-panel", "s", "sm", 'data-panel="sample"')))
    : "";

  return (
    hdr +
    sec(T("样例", "Samples"), form + (run ? renderRun(run, p.problemKey) : renderSamples(p.samples, p.problemKey)), d("r g1", btn(icon("plus"), "toggle-panel", "s", "sm", 'data-panel="sample"') + btn(`${icon("play")} ${snap.runnerBusy ? "..." : "Ctrl+Alt+R"}`, "runner-run", "p", "sm", "", snap.runnerBusy))) +
    sec(T("提交", "Submit"), d("r rw g1", btn(`${icon("copy")} ${T("复制并打开", "Copy & Open")}`, "submit-copy-open") + (showCf ? btn(`${icon("ref")} CF`, "submit-sync-cf") : "")) + d("vb", sp("lx", T("回填", "Verdict")) + d("r g1", vs.map((v) => btn(v, "submit-verdict", v === "AC" ? "ok" : "s", "sm", `data-verdict="${v}"`)).join(""))))
  );
}
