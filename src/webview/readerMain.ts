import type {
  HintLevel,
  HostToReaderMessage,
  LocalRunResult,
  ProblemDocument,
  ProblemReaderSnapshot,
  ReaderToHostMessage,
  SampleCaseResult,
  StuckCategory
} from "../core/contracts";
import { ojIconImg, readerArtImg } from "./assets";
import { badge, btn, cnt, d, emptyBox, h, sp } from "./dom";
import { completenessLabel, langLabel, sourceLabel, t, verdictBadgeLabel, type UiLang } from "./i18n";
import { icon } from "./icons";
import { escapeAttr, renderMarkdownMath } from "./markdownMath";
import { escapeHtml as E, sanitizeExternalUrl, type InlineToast } from "./state";

export interface ReaderVsCodeApi {
  postMessage(message: ReaderToHostMessage): void;
  getState?: () => { fontScale?: ReaderFontScale } | undefined;
  setState?: (state: { fontScale: ReaderFontScale }) => void;
}
declare function acquireVsCodeApi(): ReaderVsCodeApi;

export type ReaderFontScale = "sm" | "md" | "lg";
const FONT_SCALES: readonly ReaderFontScale[] = ["sm", "md", "lg"];

function verdictTone(v: SampleCaseResult["verdict"]): string {
  return v === "AC" ? "ok" : v === "SKIPPED" ? "m" : "er";
}

function verdictToStuck(verdict: string | undefined): StuckCategory {
  if (verdict === "TLE" || verdict === "OLE") return "tle";
  if (verdict === "RE" || verdict === "CE") return "implementation";
  return "partial_wa";
}

function copyButton(text: string, copyLabel: string, l: UiLang): string {
  return h(
    "button",
    "b b-g b-xs",
    `${icon("copy", 11)} ${E(t(l, "复制", "Copy"))}`,
    `type="button" data-action="copy-text" data-copy="${escapeAttr(text)}" data-copy-label="${escapeAttr(copyLabel)}"`
  );
}

function renderReaderToast(toast: InlineToast | null, l: UiLang): string {
  if (!toast) return "";
  const cl = E(t(l, "关闭提示", "Dismiss"));
  return h(
    "div",
    `toast toast-${E(toast.level)}`,
    `<span>${E(toast.text)}</span>` +
      h("button", "bi", icon("x", 11), `type="button" title="${cl}" aria-label="${cl}" data-action="dismiss-toast"`)
  );
}

export function renderReaderBar(snap: ProblemReaderSnapshot, fontScale: ReaderFontScale): string {
  const l: UiLang = snap.uiLanguage;
  const T = (zh: string, en: string) => t(l, zh, en);
  const p = snap.problem;
  const nextHint = Math.min(5, snap.hintLevel + 1) as HintLevel;
  const url = p ? sanitizeExternalUrl(p.canonicalUrl) : null;

  const specParts = p
    ? [
        sourceLabel(p.source, l),
        p.sourceId,
        p.constraints?.timeLimitMs ? `${p.constraints.timeLimitMs}ms` : "",
        p.constraints?.memoryLimitMb ? `${p.constraints.memoryLimitMb}MB` : "",
        langLabel(snap.activeLanguage, l)
      ].filter(Boolean)
    : [];
  const specText = specParts.join(" · ");
  const origLbl = T("原题页", "Original");

  const left = p
    ? d(
        "rd-bar-meta",
        ojIconImg(p.source) +
          h("span", "rd-spec mo", E(specText), `title="${E(specText)}"`) +
          (url
            ? h(
                "a",
                "b b-g b-xs lk-btn rd-ext",
                `${icon("ext", 11)} ${sp("rd-ext-lbl", E(origLbl))}`,
                `href="${E(url)}" rel="noopener noreferrer" title="${E(origLbl)}" aria-label="${E(origLbl)}"`
              )
            : "")
      )
    : d("rd-bar-meta", sp("fw", E(T("Algo Coach · 分屏读题", "Algo Coach · Split Reader"))));

  const scaleIdx = FONT_SCALES.indexOf(fontScale);
  const decLbl = E(T("缩小字号", "Smaller font"));
  const incLbl = E(T("放大字号", "Larger font"));
  const stepper = d(
    "rd-stepper",
    btn("A-", "font-dec", "g", "xs", `title="${decLbl}" aria-label="${decLbl}"`, scaleIdx <= 0) +
      btn("A+", "font-inc", "g", "xs", `title="${incLbl}" aria-label="${incLbl}"`, scaleIdx >= FONT_SCALES.length - 1)
  );

  const hintLbl = snap.hintLevel >= 5 ? T("已达 L5", "L5 Max") : T(`提示 L${nextHint}`, `Hint L${nextHint}`);

  const right = d(
    "rd-bar-acts",
    stepper +
      (p
        ? btn(`${icon("play", 11)} ${snap.runnerBusy ? T("运行中...", "Running...") : T("运行样例", "Run Samples")}`, "runner-run", "p", "sm", "", snap.runnerBusy) +
          btn(`${icon("bulb", 11)} ${hintLbl}`, "coach-hint", "s", "sm", "", snap.coachBusy || snap.hintLevel >= 5) +
          btn(`${icon("copy", 11)} ${T("提交", "Submit")}`, "submit-copy-open", "g", "sm")
        : "")
  );

  return d("rd-bar-inner", left + right);
}

export function renderReaderStatementCard(p: ProblemDocument, l: UiLang): string {
  const T = (zh: string, en: string) => t(l, zh, en);
  const [compText, compTone] = completenessLabel(p.completeness, l);
  const headBadges = [
    p.completeness !== "full" ? badge(compText, compTone) : "",
    p.difficulty?.rawLabel ? badge(p.difficulty.rawLabel, "a") : "",
    ...p.rawTags.slice(0, 8).map((tag) => badge(tag, "m"))
  ].filter(Boolean);

  const body = p.statementMarkdown
    ? renderMarkdownMath(p.statementMarkdown, l)
    : d(
        "stmt-empty",
        d(
          "mu",
          E(
            T(
              "当前仅含题目元信息，尚未包含完整题面。可从剪贴板一键补全，或在侧栏「题库 → 剪贴板与桥接」粘贴。",
              "Metadata only. Paste statement from clipboard below or via sidebar Problems -> Clipboard & Bridge."
            )
          )
        ) +
          d(
            "r rw g1 mt1",
            btn(`${icon("imp", 11)} ${T("从剪贴板补全题面", "Paste Statement from Clipboard")}`, "problem-merge-clipboard", "t", "sm")
          )
      );

  return h(
    "article",
    "rd-stmt-card",
    d(
      "rd-head",
      h("h1", "rd-title", E(p.title)) +
        (headBadges.length ? d("r rw g1 mt1", headBadges.join("")) : "")
    ) + d("rd-body", body, 'data-protect-selection="true"')
  );
}

function renderReaderDiff(c: SampleCaseResult, l: UiLang, coachBusy: boolean): string {
  const T = (zh: string, en: string) => t(l, zh, en);
  const e = (c.expected ?? "").replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const a = c.actual.replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const n = Math.min(Math.max(e.length, a.length), 30);
  let rows = "";
  for (let i = 0; i < n; i++) {
    const el = e[i] ?? "";
    const al = a[i] ?? "";
    const rw = (cls: string, s: string, x: string) => d(`dr${cls}`, sp("dn", String(i + 1)) + sp("ds", s) + h("span", "", E(x)));
    rows += el.trimEnd() === al.trimEnd() ? rw("", " ", al) : rw(" ac-diff-del", "-", al) + rw(" ac-diff-add", "+", el);
  }
  return d(
    "db mt1",
    (c.diffSummary ? d("mu", E(c.diffSummary)) : "") +
      d("mu mo", E(T("- 实际 · + 预期", "- Actual · + Expected"))) +
      d("dl well mo", rows) +
      (c.stderr ? sp("lx", "stderr") + h("pre", "pre well", E(c.stderr)) : "") +
      d(
        "fail-dock",
        btn(`${icon("trace", 11)} ${T("用此反例让教练 Dry-Run", "Dry-Run Counterexample")}`, "coach-dry-run-case", "t", "xs", `data-case-id="${E(c.id)}" data-verdict="${E(c.verdict)}"`, coachBusy)
      )
  );
}

export function renderReaderSamplesSection(
  p: ProblemDocument,
  lastRun: LocalRunResult | undefined,
  l: UiLang,
  coachBusy: boolean
): string {
  const T = (zh: string, en: string) => t(l, zh, en);
  const run = lastRun?.problemKey === p.problemKey ? lastRun : undefined;
  const caseMap = new Map<string, SampleCaseResult>((run?.cases ?? []).map((c) => [c.id, c]));

  const ceLbl = T("编译错误 CE", "Compile Error");
  const ceBanner =
    run && !run.compileOk
      ? d(
          "al al-err mt1",
          d("at", `${icon("x")} ${E(ceLbl)}`) +
            h("pre", "pre well", E(run.compileStderr ?? "")) +
            d(
              "fail-dock",
              btn(
                `${icon("trace", 11)} ${T("让教练解读报错", "Explain Compile Error")}`,
                "coach-dry-run-case",
                "t",
                "xs",
                'data-case-id="compile-error" data-verdict="CE"',
                coachBusy
              )
            )
        )
      : "";

  const items = p.samples.length
    ? p.samples
        .map((s, idx) => {
          const res = caseMap.get(s.id);
          const title = s.isOriginal ? T(`原题样例 #${idx + 1}`, `Sample #${idx + 1}`) : T(`自建样例 #${idx + 1}`, `Custom Sample #${idx + 1}`);
          const status = res
            ? badge(verdictBadgeLabel(res.verdict, l), verdictTone(res.verdict), true) +
              cnt(`${Math.round(res.durationMs)}ms`) +
              (res.peakMemoryKb !== undefined ? cnt(`${Math.round(res.peakMemoryKb)}KB`) : "")
            : "";
          return h(
            "section",
            "rd-sample-card",
            d("sh", d("r g1 rw", sp("fw", E(title)) + status)) +
              d(
                "rd-io-grid",
                d(
                  "c g1",
                  d("r rb g1", sp("lx", E(T("输入", "Input"))) + (s.input ? copyButton(s.input, T(`样例 #${idx + 1} 输入`, `Sample #${idx + 1} input`), l) : "")) +
                    h("pre", "rd-pre well mo", E(s.input || T("(空)", "(empty)")))
                ) +
                  d(
                    "c g1",
                    d("r rb g1", sp("lx", E(T("期望输出", "Expected"))) + (s.expectedOutput ? copyButton(s.expectedOutput, T(`样例 #${idx + 1} 输出`, `Sample #${idx + 1} expected`), l) : "")) +
                      h("pre", "rd-pre well mo", E(s.expectedOutput ?? T("(未提供)", "(none)")))
                  )
              ) +
              (s.explanation ? d("rd-exp mt1", sp("lx", E(T("样例说明", "Explanation"))) + renderMarkdownMath(s.explanation, l)) : "") +
              (res && res.verdict !== "AC" && res.verdict !== "SKIPPED" ? renderReaderDiff(res, l, coachBusy) : "")
          );
        })
        .join("")
    : d("rd-sample-card", emptyBox(T("当前题目暂无样例，可在侧栏工作区添加自建样例。", "No samples yet. Add custom samples in the sidebar workspace.")));

  let op = 0, ot = 0, cp = 0, ct = 0;
  for (const s of p.samples) {
    const r = caseMap.get(s.id);
    if (!r) continue;
    if (s.isOriginal) { ot++; if (r.verdict === "AC") op++; }
    else { ct++; if (r.verdict === "AC") cp++; }
  }
  const liveTot = ot + ct;
  const sp_ = ot ? op : cp, st_ = ot ? ot : ct;
  const allOk = Boolean(run?.compileOk && liveTot > 0 && op === ot && cp === ct);

  return h(
    "section",
    "rd-samples",
    d(
      "r rb g1 rd-sec-hd",
      h("h2", "st", E(T("样例与本地评测", "Samples & Local Verification"))) +
        (run && (!run.compileOk || liveTot > 0)
          ? badge(
              !run.compileOk
                ? ceLbl
                : allOk
                  ? T(`全部通过 ${sp_}/${st_}`, `Passed ${sp_}/${st_}`)
                  : T(`未通过 ${sp_}/${st_}`, `Failed ${sp_}/${st_}`),
              allOk ? "ok" : "er",
              true
            )
          : cnt(T(`共 ${p.samples.length} 组`, `${p.samples.length} total`)))
    ) +
      ceBanner +
      d("c mt1", items)
  );
}

function renderReaderEmpty(l: UiLang): string {
  const T = (zh: string, en: string) => t(l, zh, en);
  return h(
    "section",
    "rd-empty",
    (readerArtImg() || d("rd-empty-ic", icon("book", 24))) +
      h("h2", "rd-empty-t", E(T("尚未打开题目", "No Problem Selected"))) +
      d(
        "rd-empty-d mu",
        E(T("在左侧「题库」选择、导入题目或加载离线热身包后，即可在此宽屏阅读。", "Select or import a problem from the Problems tab, or load the offline warmup pack to read here."))
      )
  );
}

export function renderReaderShell(
  snap: ProblemReaderSnapshot,
  fontScale: ReaderFontScale = "md",
  toast: InlineToast | null = null
): string {
  const l: UiLang = snap.uiLanguage;
  const toastHtml = renderReaderToast(toast, l);
  const p = snap.problem;
  const content = p
    ? d("patch-slot", renderReaderStatementCard(p, l), 'data-patch="rd-statement"') +
      d("patch-slot", renderReaderSamplesSection(p, snap.lastRun, l, snap.coachBusy), 'data-patch="rd-samples"')
    : renderReaderEmpty(l);

  return h(
    "div",
    `rd-shell rd-fs-${fontScale}`,
    h("header", "rd-bar", renderReaderBar(snap, fontScale), 'data-patch="rd-bar"') +
      h("div", "toast-slot", toastHtml, 'data-patch="rd-toast" aria-live="polite"') +
      h("main", "rd-main", h("div", p ? "rd-article" : "rd-article rd-article-empty", content, 'data-patch="rd-article"'))
  );
}

export function mountReaderWebview(root: HTMLElement, vscode: ReaderVsCodeApi): {
  handleHostMessage: (msg: HostToReaderMessage) => void;
  dispose: () => void;
} {
  let snap: ProblemReaderSnapshot = {
    uiLanguage: "zh-CN",
    hintLevel: 0,
    runnerBusy: false,
    coachBusy: false
  };
  let fontScale: ReaderFontScale = vscode.getState?.()?.fontScale ?? "md";
  if (!FONT_SCALES.includes(fontScale)) fontScale = "md";
  let toast: InlineToast | null = null;
  let toastTimer: ReturnType<typeof setTimeout> | undefined;
  let mounted = false;
  let lastStmtKey = "";
  let lastBarHtml = "";
  let lastToastHtml = "";
  let lastSamplesHtml = "";

  const emit = (msg: ReaderToHostMessage): void => vscode.postMessage(msg);
  const q = <T extends Element = HTMLElement>(s: string, p: ParentNode = root) => p.querySelector<T>(s);
  const clearToastTimer = () => {
    if (toastTimer !== undefined) {
      clearTimeout(toastTimer);
      toastTimer = undefined;
    }
  };
  const setToast = (next: InlineToast | null) => {
    clearToastTimer();
    toast = next;
    if (next && next.level !== "error") {
      toastTimer = setTimeout(() => {
        toastTimer = undefined;
        toast = null;
        render();
      }, next.level === "warn" ? 7000 : 4000);
    }
    render();
  };

  const render = (): void => {
    const p = snap.problem;
    const sam = () => (p ? renderReaderSamplesSection(p, snap.lastRun, snap.uiLanguage, snap.coachBusy) : "");
    const stmtKey = p ? `${p.problemKey}|${snap.uiLanguage}|${p.completeness}|${p.title}|${p.statementMarkdown ?? ""}` : `__empty__|${snap.uiLanguage}`;

    if (!mounted) {
      root.innerHTML = renderReaderShell(snap, fontScale, toast);
      mounted = true;
      lastStmtKey = stmtKey;
      lastBarHtml = renderReaderBar(snap, fontScale);
      lastToastHtml = q('[data-patch="rd-toast"]')?.innerHTML ?? "";
      lastSamplesHtml = sam();
      return;
    }

    const shellEl = q(".rd-shell");
    if (shellEl) shellEl.className = `rd-shell rd-fs-${fontScale}`;

    const nextBar = renderReaderBar(snap, fontScale);
    if (nextBar !== lastBarHtml) {
      const barEl = q('[data-patch="rd-bar"]');
      if (barEl) {
        const ae = document.activeElement, a = ae instanceof Element && barEl.contains?.(ae) !== false ? ae.getAttribute("data-action") : null;
        barEl.innerHTML = nextBar;
        if (a && !barEl.contains?.(document.activeElement)) {
          const b = (k: string) => q<HTMLButtonElement>(`[data-action="${k}"]`, barEl);
          let x = b(a);
          if (!x || x.disabled) x = b(a === "font-inc" ? "font-dec" : "font-inc");
          (x && !x.disabled ? x : q("button:not(:disabled)", barEl))?.focus({ preventScroll: true });
        }
      }
      lastBarHtml = nextBar;
    }

    const nextToast = renderReaderToast(toast, snap.uiLanguage);
    if (nextToast !== lastToastHtml) {
      const toastEl = q('[data-patch="rd-toast"]');
      if (toastEl) toastEl.innerHTML = nextToast;
      lastToastHtml = nextToast;
    }

    if (stmtKey !== lastStmtKey) {
      const articleEl = q('[data-patch="rd-article"]');
      const mainEl = q(".rd-main");
      const nextSam = sam();
      if (articleEl) {
        articleEl.className = p ? "rd-article" : "rd-article rd-article-empty";
        articleEl.innerHTML = p
          ? d("patch-slot", renderReaderStatementCard(p, snap.uiLanguage), 'data-patch="rd-statement"') +
            d("patch-slot", nextSam, 'data-patch="rd-samples"')
          : renderReaderEmpty(snap.uiLanguage);
        if (mainEl) mainEl.scrollTop = 0;
      }
      lastStmtKey = stmtKey;
      lastSamplesHtml = nextSam;
      return;
    }

    if (p) {
      const nextSamples = sam();
      if (nextSamples !== lastSamplesHtml) {
        const samplesEl = q('[data-patch="rd-samples"]');
        if (samplesEl) samplesEl.innerHTML = nextSamples;
        lastSamplesHtml = nextSamples;
      }
    }
  };

  const handleHostMessage = (msg: HostToReaderMessage): void => {
    if (!msg || typeof msg !== "object") return;
    if (msg.type === "reader/sync") {
      snap = msg.payload;
      render();
    } else if (msg.type === "toast/inline") {
      setToast(msg.payload);
    }
  };

  const onMsg = (e: MessageEvent): void => handleHostMessage(e.data as HostToReaderMessage);
  const onClick = (e: Event): void => {
    const el = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-action]") : null;
    const act = el?.dataset.action;
    if (!el || !act) return;
    if (act === "dismiss-toast") {
      const inToast = document.activeElement instanceof Element && Boolean(document.activeElement.closest('[data-patch="rd-toast"]'));
      setToast(null);
      if (inToast) q(".rd-bar button:not(:disabled)")?.focus({ preventScroll: true });
    } else if (act === "font-dec" || act === "font-inc") {
      const idx = FONT_SCALES.indexOf(fontScale);
      const nextIdx = Math.max(0, Math.min(FONT_SCALES.length - 1, idx + (act === "font-inc" ? 1 : -1)));
      fontScale = FONT_SCALES[nextIdx] ?? "md";
      vscode.setState?.({ fontScale });
      render();
    } else if (act === "copy-text") {
      emit({ type: "clipboard/copy", payload: { text: el.dataset.copy ?? "", label: el.dataset.copyLabel } });
    } else if (act === "problem-merge-clipboard") {
      emit({ type: "problem/importClipboard", payload: { text: "", mergeWithActive: true } });
    } else if (act === "runner-run") emit({ type: "runner/runSamples" });
    else if (act === "submit-copy-open") emit({ type: "submit/copyAndOpen" });
    else if (act === "coach-hint") emit({ type: "coach/request", payload: { action: "hint" } });
    else if (act === "coach-dry-run-case") {
      const stuck = verdictToStuck(el.dataset.verdict);
      const matched = snap.lastRun?.cases.find((c) => c.id === el.dataset.caseId);
      const studentQuestion = matched
        ? `Dry-run failing sample (${matched.verdict}): input=${matched.input.slice(0, 120)}`
        : undefined;
      emit({ type: "coach/request", payload: { action: "dryRun", stuckCategory: stuck, ...(studentQuestion ? { studentQuestion } : {}) } });
    }
  };

  root.addEventListener("click", onClick);
  window.addEventListener("message", onMsg);
  render();
  emit({ type: "reader/ready" });

  return {
    handleHostMessage,
    dispose: () => {
      clearToastTimer();
      root.removeEventListener("click", onClick);
      window.removeEventListener("message", onMsg);
    }
  };
}

if (typeof document !== "undefined" && typeof window !== "undefined") {
  const boot = (): void => {
    const root =
      document.getElementById("reader-app") ??
      document.getElementById("app") ??
      document.body.appendChild(Object.assign(document.createElement("div"), { id: "reader-app" }));
    mountReaderWebview(root, typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : { postMessage: () => undefined });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
}
