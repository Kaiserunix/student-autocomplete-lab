import type { ProblemSourceId, StylishRankLetter } from "../core/contracts";
import { escapeAttr } from "./markdownMath";

let baseOv: string | undefined;

export const setAssetsBaseUri = (uri?: string): void => {
  baseOv = uri;
};

export const getAssetsBaseUri = (): string =>
  (
    baseOv ??
    (typeof document !== "undefined"
      ? document.querySelector?.('meta[name="ac-assets"]')?.getAttribute?.("content")
      : "") ??
    ""
  ).replace(/\/+$/, "");

const img = (f: string, c: string, w: number, h = w, b = getAssetsBaseUri()): string =>
  b && `<img class="${c}" src="${escapeAttr(`${b}/${f}`)}" width="${w}" height="${h}" alt="">`;

const art = (f: string, c: string, w: number, h: number, el = img(f, `${c}-img`, w, h)): string =>
  el && `<div class="${c}">${el}</div>`;

export const rankCrestImg = (r: StylishRankLetter): string =>
  img(
    `rank-${r === "SSS" ? "apex" : r[0] === "S" ? "gold" : r === "A" || r === "B" ? "alloy" : "iron"}.webp`,
    "rk-crest",
    52
  );

export const workbenchArtImg = (): string => art("empty-workbench.webp", "empty-art", 480, 270);

export const readerArtImg = (): string => art("empty-reader.webp", "rd-empty-art", 640, 360);

export const ojIconImg = (s: ProblemSourceId): string =>
  img(
    `oj-${s.startsWith("leetcode") ? "leetcode" : /^(codeforces|luogu|atcoder|nowcoder)$/.test(s) ? s : "local"}.svg`,
    "oj-ic",
    14
  );
