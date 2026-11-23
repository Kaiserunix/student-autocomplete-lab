import type { DocumentCompleteness, ProblemIoMode, ProblemSourceId, SampleCaseResult, SupportedLanguage } from "../core/contracts";

export type UiLang = "zh-CN" | "en-US";
export const t = (l: UiLang, zh: string, en: string): string => (l === "en-US" ? en : zh);
export const tr = (l: UiLang) => (zh: string, en: string): string => (l === "en-US" ? en : zh);

export const verdictBadgeLabel = (v: SampleCaseResult["verdict"], l: UiLang): string =>
  v === "SKIPPED" ? t(l, "跳过", "Skipped") : v;

const M_STAT: Record<string, [string, string]> = {
  unresolved: ["待攻克", "Unresolved"],
  reviewed: ["已复习", "Reviewed"],
  resolved: ["已掌握", "Mastered"],
  mastered: ["已掌握", "Mastered"],
  assisted_ac: ["辅助 AC", "Assisted AC"],
  independent_ac: ["独立 AC", "Independent AC"]
};
export const mistakeStatusLabel = (s: string, l: UiLang): string => (M_STAT[s] ? t(l, M_STAT[s][0], M_STAT[s][1]) : s);

const SRCS: Record<string, [string, string]> = {
  "leetcode-cn": ["力扣中国", "LeetCode CN"],
  "leetcode-global": ["LeetCode", "LeetCode"],
  luogu: ["洛谷", "Luogu"],
  codeforces: ["Codeforces", "Codeforces"],
  atcoder: ["AtCoder", "AtCoder"],
  nowcoder: ["牛客", "NowCoder"],
  "local-markdown": ["本地题面", "Markdown"],
  "warmup-pack": ["热身包", "Warmup"]
};
export const sourceLabel = (s: ProblemSourceId, l: UiLang): string => (SRCS[s] ? t(l, SRCS[s][0], SRCS[s][1]) : s);

export const completenessLabel = (c: DocumentCompleteness, l: UiLang): [string, string] =>
  c === "full"
    ? [t(l, "完整题面", "Full Statement"), "ok"]
    : c === "samples_only"
      ? [t(l, "仅含样例", "Samples Only"), "wn"]
      : [t(l, "仅元信息", "Metadata Only"), "wn"];

export const ioModeLabel = (m: ProblemIoMode | "leetcode_harness", l: UiLang): string =>
  m === "stdio" ? t(l, "标准输入输出", "Stdio") : m === "function" || m === "leetcode_harness" ? t(l, "函数模式", "Function") : t(l, "交互模式", "Interactive");

export const LANG_OPTS: ReadonlyArray<[string, string]> = [
  ["cpp", "C++"],
  ["python", "Python"],
  ["c", "C"],
  ["rust", "Rust"],
  ["java", "Java"]
];
const LANGS: Record<string, string> = Object.fromEntries(LANG_OPTS);
export const langLabel = (lang: SupportedLanguage | undefined, l: UiLang): string =>
  (lang && LANGS[lang]) || t(l, "自动识别", "Auto");

const RZ: Record<string, string> = { D: "起草", C: "净码", B: "成型", A: "破题", S: "锋芒", SS: "精准", SSS: "无瑕" };
const rkZh = (k: string) => (RZ[k] ? `${k} · ${RZ[k]}` : k);

type RxRule = [RegExp, (...m: string[]) => string];
const rxMap = (s: string, rules: readonly RxRule[]): string | undefined => {
  for (const [re, fn] of rules) {
    const m = s.match(re);
    if (m) return fn(...m.slice(1));
  }
  return undefined;
};

const CLAUSE_RX: readonly RxRule[] = [
  [/^Paste/, () => `触发大段粘贴封顶（最高 ${rkZh("C")}）`],
  [/^Orig/, () => "原题样例被修改，S+ 已锁定"],
  [/^Write >= (\d).*(\w)$/, (n, r) => `无报错手写 ${n} 行代码解锁 ${rkZh(r)}`],
  [/^Pass >= 1 orig/, () => `需通过原题样例解锁 ${rkZh("A")}`],
  [/^Pass all/, () => `需通过全部原题样例解锁 ${rkZh("S")}`],
  [/^Pass >= 1 cust/, () => `通过 1 组自建样例或官方 AC 解锁 ${rkZh("SS")}`],
  [/^Official AC \(/, () => `需官方 AC（或离线通过 2 组自建样例）解锁 ${rkZh("SSS")}`],
  [/^Pre-sample/, () => `过样例前上限 399（B），需通过原题样例解锁 ${rkZh("A")}`],
  [/^Official AC/i, () => `需在 OJ 官方评测 AC 解锁 ${rkZh("SSS")}`],
  [/^Hint L(\d).* ([A-Z]+)\)$/, (lv, rk) => `已用 L${lv} 提示（封顶 ${rkZh(rk)}）`],
  [/^Blind Tab x(\d+)/, (n) => `盲按补全 ×${n} 次（锁定 SS / SSS）`],
  [/^Fix (\d+)/, (n) => `修复 ${n} 处语法报错解锁 ${rkZh("C")}`],
  [/^Failed runs \((\d+)\)/, (n) => `失败 ${n} 次（SSS 限 ≤2 次）`]
];

const SUM_RX: readonly RxRule[] = [
  [/^Session/, () => "刷题已就绪，开始编码积累段位"],
  [/^Diagnostics c/, () => "语法诊断通过（0 报错）"],
  [/^Official AC/, () => "已确认官方评测 AC"],
  [/^Diagnostics r.* (\d+)/, (n) => `当前存在 ${n} 处语法报错`],
  [/^Hand-typed \+(\d+).*\+(\d+)/, (n, p) => `手写 ${n} 行代码（+${p} 分）`],
  [/^Local run all.*\((\d+)\/(\d+)\)/, (a, b) => `本地样例全通过（${a}/${b}）`],
  [/^Local run fail.*\((\d+)\/(\d+)/, (a, b) => `本地未全过（原题 ${a}/${b}）`]
];

export const localizeCeilingReason = (raw: string | undefined, l: UiLang): string =>
  !raw ? "" : l === "en-US" ? raw : raw.split("; ").map((x) => rxMap(x.trim(), CLAUSE_RX) ?? x.trim()).join("；");

export const localizeRankSummary = (raw: string, l: UiLang): string =>
  l === "en-US" || !raw ? raw : rxMap(raw, SUM_RX) ?? raw;
