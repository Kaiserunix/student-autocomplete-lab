import type { DocumentCompleteness, ProblemIoMode, ProblemSourceId, SampleCaseResult, SupportedLanguage } from "../core/contracts";

export type UiLang = "zh-CN" | "en-US";
export const t = (l: UiLang, zh: string, en: string): string => (l === "en-US" ? en : zh);

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

const LANGS: Record<string, string> = { cpp: "C++", python: "Python", c: "C", rust: "Rust", java: "Java" };
export const langLabel = (lang: SupportedLanguage | undefined, l: UiLang): string =>
  (lang && LANGS[lang]) || t(l, "自动识别", "Auto");

const RANK_ZH: Record<string, string> = { D: "D · 起草", C: "C · 净码", B: "B · 成型", A: "A · 破题", S: "S · 锋芒", SS: "SS · 精准", SSS: "SSS · 无瑕" };

const CEIL_EXACT: Record<string, string> = {
  "Paste Cap active (capped at C)": "触发大段粘贴封顶（最高 C · 净码）",
  "Original samples modified (S+ locked)": "原题样例被修改，S+ 已锁定",
  "Write >= 3 valid lines with 0 errors to unlock C": "无报错手写 3 行代码解锁 C · 净码",
  "Write >= 5 valid lines with 0 errors to unlock B": "无报错手写 5 行代码解锁 B · 成型",
  "Pass >= 1 original sample to unlock A": "需通过原题样例解锁 A · 破题",
  "Pass all original samples to unlock S": "需通过全部原题样例解锁 S · 锋芒",
  "Pass >= 1 custom edge test or Official AC to unlock SS": "通过 1 组自建样例或官方 AC 解锁 SS · 精准",
  "Official AC (or verified offline solve with >= 2 edge tests) required for SSS": "需官方 AC（或离线通过 2 组自建样例）解锁 SSS · 无瑕",
  "Pre-sample score cap (399 / B): pass >= 1 original sample to advance": "过样例前上限 399（B），需通过原题样例解锁 A · 破题"
};

function translateClause(raw: string): string {
  const c = raw.trim();
  if (CEIL_EXACT[c]) return CEIL_EXACT[c];
  if (/^Official AC(?: on OJ)? required (?:to unlock|for) SSS$/i.test(c)) return "需在 OJ 官方评测 AC 解锁 SSS · 无瑕";
  let m = c.match(/^Hint L(\d) ceiling \(max ([A-Z]+)\)$/);
  if (m) return `已用 L${m[1]} 提示（封顶 ${RANK_ZH[m[2]!] ?? m[2]}）`;
  m = c.match(/^Blind Tab x(\d+) \(SS\/SSS locked\)$/);
  if (m) return `盲按补全 ×${m[1]} 次（锁定 SS / SSS）`;
  m = c.match(/^Fix (\d+) LSP error\(s\) to unlock C$/);
  if (m) return `修复 ${m[1]} 处语法报错解锁 C · 净码`;
  m = c.match(/^Failed runs \((\d+)\) > 2 \(SSS requires <= 2\)$/);
  if (m) return `失败 ${m[1]} 次（SSS 限 ≤2 次）`;
  return c;
}

export const localizeCeilingReason = (raw: string | undefined, l: UiLang): string =>
  !raw ? "" : l === "en-US" ? raw : raw.split("; ").map(translateClause).join("；");

export function localizeRankSummary(raw: string, l: UiLang): string {
  if (l === "en-US" || !raw) return raw;
  if (raw === "Session initialized") return "刷题已就绪，开始编码积累段位";
  if (raw === "Diagnostics clean (0 errors)") return "语法诊断通过（0 报错）";
  if (raw.startsWith("Official AC verified")) return "已确认官方评测 AC";
  let m = raw.match(/^Diagnostics report (\d+) syntax error\(s\)$/);
  if (m) return `当前存在 ${m[1]} 处语法报错`;
  m = raw.match(/^Hand-typed \+(\d+) valid line\(s\) \(\+(\d+) pts\)$/);
  if (m) return `手写 ${m[1]} 行代码（+${m[2]} 分）`;
  m = raw.match(/^Local run all green \((\d+)\/(\d+)\)$/);
  if (m) return `本地样例全通过（${m[1]}/${m[2]}）`;
  m = raw.match(/^Local run failed \((\d+)\/(\d+) original passed\)$/);
  if (m) return `本地未全过（原题 ${m[1]}/${m[2]}）`;
  return raw;
}
