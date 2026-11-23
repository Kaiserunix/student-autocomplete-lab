import type {
  HintLevel,
  LocalRunResult,
  OfficialVerdictStatus,
  ProblemDocument,
  ProblemSample,
  SampleCaseResult,
  StylishRankLetter,
  StylishRankState
} from "../../core/contracts";
import { ojIconImg, rankCrestImg, workbenchArtImg } from "../assets";
import { al, badge, btn, cnt, d, emptyBox, emptyCard, h, rbtn, sec, sp } from "../dom";
import {
  completenessLabel,
  ioModeLabel,
  langLabel,
  localizeCeilingReason,
  localizeRankSummary,
  sourceLabel,
  t,
  tr,
  verdictBadgeLabel,
  type UiLang
} from "../i18n";
import { icon } from "../icons";
import { escapeAttr, renderMarkdownMath } from "../markdownMath";
import { escapeHtml as E, getDraftOrFallback as dr, sanitizeExternalUrl, type WebviewState } from "../state";

const RANK_ORDER: readonly StylishRankLetter[] = ["D", "C", "B", "A", "S", "SS", "SSS"];
const ctx = (st: WebviewState) => {
  const snap = st.snapshot, l: UiLang = snap.flags.uiLanguage;
  return [snap, l, tr(l)] as const;
};

function rankIndex(r: StylishRankLetter): number {
  const idx = RANK_ORDER.indexOf(r);
  return idx === -1 ? 0 : idx;
}

function copyMiniBtn(text: string, label: string, uiLabel: string): string {
  return h(
    "button",
    "b b-g b-xs",
    `${icon("copy", 10)} ${E(uiLabel)}`,
    `type="button" data-action="copy-text" data-copy="${escapeAttr(text)}" data-copy-label="${escapeAttr(label)}"`
  );
}

function renderFailureActions(verdict: SampleCaseResult["verdict"], caseId: string, lv: HintLevel, nextHint: HintLevel, l: UiLang, coachBusy: boolean): string {
  const T = tr(l);
  const dryRunLbl = verdict === "CE"
    ? T("让教练解读报错", "Explain Compile Error")
    : T("手推这组错例", "Trace Counterexample");
  const hintLbl = lv >= 5 ? T("已达 L5", "L5 Max") : T(`下一级提示 L${nextHint}`, `Hint L${nextHint}`);
  return d(
    "fail-dock",
    btn(`${icon("trace", 11)} ${dryRunLbl}`, "coach-dry-run-case", "t", "xs", `data-case-id="${E(caseId)}" data-verdict="${E(verdict)}"`, coachBusy) +
      btn(`${icon("bulb", 11)} ${hintLbl}`, "coach-hint-case", "s", "xs", `data-verdict="${E(verdict)}"`, coachBusy || lv >= 5)
  );
}

const lines = (s: string) => s.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");

function renderDiff(c: SampleCaseResult, lv: HintLevel, nextHint: HintLevel, l: UiLang, coachBusy: boolean): string {
  const T = tr(l);
  const e = lines(c.expected ?? "");
  const a = lines(c.actual);
  const n = Math.min(Math.max(e.length, a.length), 24);
  let rows = "";
  for (let i = 0; i < n; i++) {
    const el = e[i] ?? "";
    const al = a[i] ?? "";
    const rw = (cls: string, s: string, x: string) => d(`dr${cls}`, sp("dn", String(i + 1)) + sp("ds", s) + h("span", "", E(x)));
    rows += el.trimEnd() === al.trimEnd() ? rw("", " ", al) : rw(" ac-diff-del", "-", al) + rw(" ac-diff-add", "+", el);
  }
  const inputRow = d(
    "dm",
    sp("lx", T("输入", "Input")) +
      h("pre", "pi well", E(c.input || T("(空输入)", "(empty)"))) +
      copyMiniBtn(c.input, T("失败样例输入", "failing sample input"), T("复制", "Copy"))
  );
  return d(
    "db",
    inputRow +
      (c.diffSummary ? d("mu", E(c.diffSummary)) : "") +
      d("mu mo", E(T("- 实际 · + 预期", "- Actual · + Expected"))) +
      d("dl well mo", rows) +
      (c.stderr ? sp("lx", "stderr") + h("pre", "pre well", E(c.stderr)) : "") +
      renderFailureActions(c.verdict, c.id, lv, nextHint, l, coachBusy)
  );
}

const delBtn = (orig: boolean, pk: string, id: string, l: UiLang): string =>
  orig ? "" : rbtn("bi", icon("del"), `${al(t(l, "删除自建样例", "Delete custom sample"))} data-action="sample-delete" data-problem-key="${E(pk)}" data-sample-id="${E(id)}"`);

const caseRow = (orig: boolean, i: number, pk: string, id: string, l: UiLang, mid: string, extra = ""): string => {
  const title = orig ? t(l, `原题样例 #${i + 1}`, `Sample #${i + 1}`) : t(l, `自建样例 #${i + 1}`, `Custom #${i + 1}`);
  return d("si", d("r g1 rw", sp("si-t", E(title)) + mid + sp("sp", "") + delBtn(orig, pk, id, l)) + extra);
};

function ioBox(label: string, copyTitle: string, x: string, l: UiLang): string {
  return d(
    "f1 c g1",
    d("r rb g1", sp("lx", E(label)) + (x ? copyMiniBtn(x, copyTitle, t(l, "复制", "Copy")) : "")) +
      h("pre", "pre well", E(x || t(l, "(空)", "(empty)")))
  );
}

function renderUnifiedSamples(
  ss: readonly ProblemSample[],
  run: LocalRunResult | undefined,
  pk: string,
  lv: HintLevel,
  nextHint: HintLevel,
  l: UiLang,
  coachBusy: boolean
): string {
  const T = tr(l);
  const caseMap = new Map<string, SampleCaseResult>((run?.cases ?? []).map((c) => [c.id, c]));
  let op = 0, ot = 0, cp = 0, ct = 0;
  for (const s of ss) {
    const r = caseMap.get(s.id);
    if (r) {
      if (s.isOriginal) { ot++; if (r.verdict === "AC") op++; }
      else { ct++; if (r.verdict === "AC") cp++; }
    }
  }
  const liveTot = ot + ct;
  const allOk = Boolean(run?.compileOk && liveTot > 0 && op === ot && cp === ct);
  const ratio = [
    ot ? (ct ? T(`原题 ${op}/${ot}`, `${op}/${ot} orig`) : T(`通过 ${op}/${ot}`, `${op}/${ot} passed`)) : "",
    ct ? T(`自建 ${cp}/${ct}`, `${cp}/${ct} custom`) : ""
  ].filter(Boolean).join(" · ");
  const showRun = Boolean(run && (!run.compileOk || liveTot > 0));
  const summary = showRun && run
    ? d(
        "rs",
        sp(`fw ${allOk ? "ok" : "er"}`, allOk ? T("全部通过", "All Passed") : T("存在未通过样例", "Tests Failed")) +
          (ratio ? cnt(ratio) : "") +
          sp("mu", E(ioModeLabel(run.mode, l)))
      ) +
      (run.compileOk
        ? ""
        : d(
            "al al-err",
            d("at", `${icon("x")} ${T("编译错误 CE", "Compile Error")}`) +
              h("pre", "pre well", E(run.compileStderr ?? "")) +
              renderFailureActions("CE", "compile-error", lv, nextHint, l, coachBusy)
          ))
    : "";

  const rows = ss.length
    ? ss
        .map((s, i) => {
          const res = caseMap.get(s.id);
          const mid = res
            ? badge(verdictBadgeLabel(res.verdict, l), res.verdict === "AC" ? "ok" : res.verdict === "SKIPPED" ? "m" : "er", true) +
              cnt(`${Math.round(res.durationMs)}ms`) +
              (res.peakMemoryKb !== undefined ? cnt(`${Math.round(res.peakMemoryKb)}KB`) : "")
            : "";
          const ioGrid = () =>
            d(
              "g2 mt1",
              ioBox(T("输入", "Input"), T(`样例 #${i + 1} 输入`, `Sample #${i + 1} input`), s.input, l) +
                ioBox(T("期望输出", "Expected"), T(`样例 #${i + 1} 输出`, `Sample #${i + 1} expected`), s.expectedOutput ?? "", l)
            );
          const extra = !res
            ? ioGrid()
            : res.verdict !== "AC" && res.verdict !== "SKIPPED"
              ? renderDiff(res, lv, nextHint, l, coachBusy)
              : h("details", "si-io", h("summary", "", E(T("查看输入/输出", "Inspect I/O"))) + ioGrid(), `data-drawer="si-${E(s.id)}"`);
          return caseRow(s.isOriginal, i, pk, s.id, l, mid, extra);
        })
        .join("")
    : emptyBox(T("当前题目暂无样例，可点击上方按钮手动添加。", "No samples yet. Add a custom sample above."));

  return summary + rows + (showRun && run?.memoryNote ? d("fn", E(run.memoryNote)) : "");
}

export function renderWorkspaceRankCard(st: WebviewState): string {
  const [snap, l, T] = ctx(st);
  const rk: StylishRankState | undefined = snap.flags.stylishRankEnabled ? snap.stylishRank : undefined;
  if (!rk) return d("patch-slot", "", 'data-patch="rank-card"');

  const curIdx = rankIndex(rk.effectiveRank);
  const effectiveCapIdx = Math.min(rankIndex(rk.hintCeiling), rankIndex(rk.pasteCeiling), rankIndex(rk.gateCeiling));
  const pct = Math.max(0, Math.min(100, Math.round((rk.score / 1000) * 100)));

  const segs = RANK_ORDER.map((letter, idx) => {
    const s = idx === curIdx ? "cur" : idx < curIdx ? "done" : idx > effectiveCapIdx ? "lock" : "";
    return sp(s ? `rk-seg rk-seg-${s}` : "rk-seg", letter);
  }).join("");

  const barSvg = `<svg class="rk-bar" viewBox="0 0 100 3" preserveAspectRatio="none" aria-hidden="true"><rect width="100" height="3" rx="1.5" class="rk-bar-bg"/><rect width="${pct}" height="3" rx="1.5" class="rk-bar-fg"/></svg>`;
  const crest = rankCrestImg(rk.effectiveRank);
  const titleHtml =
    l === "zh-CN"
      ? sp("rk-grade mo", E(rk.meta.statusBarLabel)) + sp("rk-name", E(rk.meta.zhName))
      : sp("rk-grade mo", E(rk.meta.statusBarLabel));

  const ceilingLocalized = localizeCeilingReason(rk.ceilingReason, l);
  const statusLine = ceilingLocalized
    ? d("rk-foot rk-cap wn", `${icon("warn", 11)}<span>${E(T("封顶：", "Cap: "))}${E(ceilingLocalized)}</span>`)
    : d("rk-foot rk-note mu", E(localizeRankSummary(rk.lastEventSummary, l)));

  const card = h(
    "section",
    `card rank-card rk-t-${rk.effectiveRank.toLowerCase()}`,
    d("rk-emblem mo", crest || E(rk.effectiveRank)) +
      d(
        "rk-body f1",
        d("r rb g1 rk-head", d("r g1 rw", titleHtml) + sp("rk-score mo", `<strong>${Math.round(rk.score)}</strong><span class="mu"> / 1000</span>`)) +
          d("rk-rail mo", segs) +
          barSvg +
          statusLine
      )
  );
  return d("patch-slot", card, 'data-patch="rank-card"');
}

export function renderWorkspaceProblemCard(st: WebviewState, p: ProblemDocument): string {
  const [snap, l, T] = ctx(st);
  const [ct, cTone] = completenessLabel(p.completeness, l);
  const url = sanitizeExternalUrl(p.canonicalUrl);
  const expanded = Boolean(st.panels.stmtFull);

  const specParts = [
    langLabel(snap.activeLanguage, l),
    p.constraints?.timeLimitMs ? `${p.constraints.timeLimitMs}ms` : "",
    p.constraints?.memoryLimitMb ? `${p.constraints.memoryLimitMb}MB` : "",
    ioModeLabel(p.ioMode, l)
  ].filter(Boolean);

  const topRow = d(
    "r g1 anchor-top",
    h("span", "bg bg-a oj-chip", ojIconImg(p.source) + E(sourceLabel(p.source, l))) +
      h("h2", "pt pt-c f1", E(p.title), `title="${E(p.title)}"`) +
      btn(`${icon("split", 11)} ${T("分屏读题", "Split")}`, "problem-open-reader", "t", "sm") +
      (url
        ? h("a", "b b-g b-xs lk-btn", icon("ext", 11), `href="${E(url)}" rel="noopener noreferrer" ${al(T("原题页", "Original"))}`)
        : "")
  );

  const metaRow = d(
    "r rw g1 rb anchor-meta",
    d(
      "r rw g1 f1",
      h("span", "bg bg-m mo", E(p.sourceId), `title="${E(p.sourceId)}"`) +
        (p.difficulty?.rawLabel ? badge(p.difficulty.rawLabel) : "") +
        (p.completeness !== "full" ? badge(ct, cTone) : "") +
        sp("mu mo", E(specParts.join(" · ")))
    ) +
      (p.statementMarkdown
        ? btn(
            `${icon(expanded ? "collapse" : "expand", 10)} ${expanded ? T("收起", "Hide") : T("题面", "Text")}`,
            "toggle-panel",
            "g",
            "xs",
            `data-panel="stmtFull" aria-expanded="${expanded}"`
          )
        : "")
  );

  const stmtBlock = p.statementMarkdown
    ? expanded
      ? d("stmt-box stmt-full", renderMarkdownMath(p.statementMarkdown, l), 'data-protect-selection="true"')
      : ""
    : d(
        "stmt-empty",
        d("mu", E(T("仅含元信息，可从剪贴板补全。", "Metadata only. Paste from clipboard."))) +
          d("r rw g1 mt1", btn(`${icon("imp", 11)} ${T("从剪贴板补全题面", "Paste Statement")}`, "problem-merge-clipboard", "t", "sm"))
      );

  const card = h("section", "card problem-card anchor-card", d("c g1", topRow + metaRow + stmtBlock));
  return d("patch-slot", card, 'data-patch="problem-card"');
}

export function renderWorkspaceSamplesCard(st: WebviewState, p: ProblemDocument): string {
  const [snap, l, T] = ctx(st);
  const run = snap.lastRun?.problemKey === p.problemKey ? snap.lastRun : undefined;
  const nextHint = Math.min(5, snap.hintLevel + 1) as HintLevel;
  const sampleOpen = Boolean(st.panels.sample);
  const sinPh =
    p.ioMode === "function"
      ? T("函数参数（每行一个 JSON 值）", "Arguments (one JSON value per line)")
      : T("输入数据", "Input (stdin)");
  const sexPh = T("期望输出", "Expected output");

  const form = sampleOpen
    ? d(
        "sub-sep",
        sp("lx", T("添加自建边界样例", "Add Custom Edge Sample")) +
          h("textarea", "ta mo", E(dr(st, "sin")), `rows="3" placeholder="${E(sinPh)}" aria-label="${E(sinPh)}" data-draft="sin"`) +
          h("textarea", "ta mo", E(dr(st, "sex")), `rows="2" placeholder="${E(sexPh)}" aria-label="${E(sexPh)}" data-draft="sex"`) +
          d(
            "r g1",
            btn(T("保存样例", "Save Sample"), "sample-add-submit", "t", "sm", `data-problem-key="${E(p.problemKey)}"`) +
              btn(T("取消", "Cancel"), "toggle-panel", "g", "sm", 'data-panel="sample"')
          )
      )
    : "";

  const runLabel = snap.runnerBusy
    ? T("运行中...", "Running...")
    : `${T("运行样例", "Run Samples")} <span class="kbd mo">Ctrl+Alt+R</span>`;

  const card = sec(
    T("本地样例", "Local Samples"),
    form + renderUnifiedSamples(p.samples, run, p.problemKey, snap.hintLevel, nextHint, l, snap.coachBusy),
    d(
      "r g1 sh-acts",
      btn(`${icon("plus", 11)} ${T("自建", "Add")}`, "toggle-panel", "g", "sm", `data-panel="sample" aria-expanded="${sampleOpen}"`) +
        btn(`${icon("play", 11)} ${runLabel}`, "runner-run", "p", "sm", "", snap.runnerBusy)
    )
  );
  return d("patch-slot", card, 'data-patch="samples-card"');
}

export function renderWorkspaceSubmitCard(st: WebviewState, p: ProblemDocument): string {
  const [snap, l, T] = ctx(st);
  const showSync = ["codeforces", "leetcode-cn", "leetcode-global", "atcoder"].includes(p.source);
  const showRev = Boolean((snap.lastRun?.problemKey === p.problemKey && snap.lastRun.allPassed) || snap.stylishRank?.effectiveRank === "SSS");
  const submitUrl = snap.activeSubmitUrl ? sanitizeExternalUrl(snap.activeSubmitUrl) : null;
  const vs: OfficialVerdictStatus[] = ["AC", "WA", "TLE", "RE"];

  const card = sec(
    T("提交与回填", "Submit & Verdict"),
    d(
      "r rw g1",
      btn(`${icon("copy", 11)} ${T("复制并打开提交页", "Copy & Open")}`, "submit-copy-open", "s", "sm") +
        btn(`${icon("copy", 11)} ${T("仅复制代码", "Copy Code")}`, "submit-copy-only", "g", "sm") +
        (submitUrl ? btn(`${icon("ext", 11)} ${T("复制链接", "Copy URL")}`, "copy-text", "g", "sm", `data-copy="${E(submitUrl)}" data-copy-label="${E(T("官方提交页链接", "Submit URL"))}"`) : "") +
        (showSync
          ? btn(
              `${icon("ref", 11)} ${snap.verdictSyncing ? T("同步中...", "Syncing...") : T("同步官方结果", "Sync OJ")}`,
              "submit-sync-verdict",
              "s",
              "sm",
              "",
              Boolean(snap.verdictSyncing)
            )
          : "") +
        (showRev ? btn(`${icon("bulb", 11)} ${T("面试复杂度复盘", "Complexity Review")}`, "coach-review-open", "t", "sm", "", snap.coachBusy) : "")
    ) +
      d("fn", E(T("未在默认浏览器登录？点「复制链接」到常用浏览器，再「仅复制代码」粘贴。", "Not signed in? Copy URL for your browser, then Copy Code."))) +
      d(
        "vb",
        sp("lx", T("网页提交后记录结果", "Record OJ Result")) +
          d("r g1", vs.map((v) => btn(v, "submit-verdict", v === "AC" ? "ok" : "s", "sm", `data-verdict="${v}"`)).join(""))
      )
  );
  return d("patch-slot", card, 'data-patch="submit-card"');
}

export function renderWorkspaceView(st: WebviewState): string {
  const [snap, l, T] = ctx(st);
  const p = snap.activeProblem;
  if (!p) {
    return emptyCard(
      workbenchArtImg(),
      T("尚未选择题目", "No Active Problem"),
      T("在「选题」导题，或加载 3 题离线热身包。", "Import in Bank or load 3-problem warmup."),
      btn(`${icon("book")} ${T("前往选题", "Browse Problems")}`, "switch-tab", "p", "sm", 'data-tab="problems"') +
        btn(`${icon("play")} ${T("加载 3 题热身包", "Load 3-Problem Warmup")}`, "starter-load-warmup") +
        btn(`${icon("book")} ${T("新手教程", "Walkthrough")}`, "starter-open-walkthrough", "g", "sm")
    );
  }

  return (
    renderWorkspaceProblemCard(st, p) +
    renderWorkspaceSamplesCard(st, p) +
    renderWorkspaceRankCard(st) +
    renderWorkspaceSubmitCard(st, p)
  );
}
