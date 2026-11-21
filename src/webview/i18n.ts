import type { DocumentCompleteness, ProblemSourceId } from "../core/contracts";

export type UiLang = "zh-CN" | "en-US";
export const t = (l: UiLang, zh: string, en: string): string => (l === "en-US" ? en : zh);

const SRC: Record<string, string> = { "leetcode-cn": "LC CN", "leetcode-global": "LeetCode", codeforces: "Codeforces", atcoder: "AtCoder", "local-markdown": "MD" };
export const sourceLabel = (s: ProblemSourceId, l: UiLang): string =>
  SRC[s] ?? (s === "luogu" ? t(l, "洛谷", "Luogu") : s === "nowcoder" ? t(l, "牛客", "NowCoder") : s === "warmup-pack" ? t(l, "热身", "Warmup") : s);

export const completenessLabel = (c: DocumentCompleteness, l: UiLang): [string, string] =>
  c === "full" ? [t(l, "完整", "Full"), "ok"] : c === "samples_only" ? [t(l, "仅样例", "Samples"), "wn"] : [t(l, "仅元信息", "Meta"), "wn"];
