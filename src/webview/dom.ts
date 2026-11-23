import { icon } from "./icons";
import { escapeHtml } from "./state";

/** Strict-CSP HTML builders (zero inline styles, zero emoji, 4-layer elevation primitives). */

export const h = (tag: string, cls: string, body: string, attrs = ""): string =>
  `<${tag}${cls ? ` class="${cls}"` : ""}${attrs ? ` ${attrs}` : ""}>${body}</${tag}>`;

export const d = (cls: string, body: string, attrs = ""): string =>
  `<div class="${cls}"${attrs ? ` ${attrs}` : ""}>${body}</div>`;

export const sp = (cls: string, body: string): string => `<span class="${cls}">${body}</span>`;
export const cnt = (n: number | string): string => `<span class="mn mo">${n}</span>`;
export const ap = (b: boolean): string => `aria-pressed="${b}"`;

export const sec = (title: string, body: string, right = "", patchKey = "", extraCls = ""): string =>
  `<section class="card${extraCls ? ` ${extraCls}` : ""}"${patchKey ? ` data-patch="${patchKey}"` : ""}><div class="sh"><span class="st">${title}</span>${right}</div>${body}</section>`;

export const drawer = (id: string, title: string, body: string, right = "", open = false): string =>
  `<details class="card drawer" data-drawer="${escapeHtml(id)}"${open ? " open" : ""}><summary class="dh"><span class="dh-l">${icon("chev", 11)}<span class="st">${title}</span></span>${right}</summary><div class="drawer-body">${body}</div></details>`;

export const badge = (text: string, tone = "m", mono = false): string =>
  `<span class="bg bg-${tone}${mono ? " mo" : ""}">${escapeHtml(text)}</span>`;

export const btn = (label: string, action: string, v = "s", sz = "sm", attrs = "", dis = false): string =>
  `<button class="b b-${v}${sz ? ` b-${sz}` : ""}" type="button" data-action="${action}"${attrs ? ` ${attrs}` : ""}${dis ? " disabled" : ""}>${label}</button>`;
export const openBtn = (pk: string, lbl: string): string =>
  btn(lbl, "problem-select", "s", "xs", `data-problem-key="${escapeHtml(pk)}"`);
export const al = (x: string): string => {
  const e = escapeHtml(x);
  return `title="${e}" aria-label="${e}"`;
};
export const rbtn = (cls: string, body: string, attrs = ""): string =>
  `<button class="${cls}" type="button" ${attrs}>${body}</button>`;

export const sel = (items: ReadonlyArray<[string, string]>, cur: string, attrs: string, cls = "sel"): string =>
  `<select class="${cls}" ${attrs}>${items.map(([v, l]) => `<option value="${escapeHtml(v)}"${v === cur ? " selected" : ""}>${escapeHtml(l)}</option>`).join("")}</select>`;

export const inp = (draft: string, val: string, ph: string, cls = "in", type = "text", extra = ""): string =>
  `<input class="${cls}" type="${type}" data-draft="${draft}" value="${escapeHtml(val)}" placeholder="${escapeHtml(ph)}"${extra}>`;

export const toggleRow = (key: string, label: string, desc: string, checked: boolean): string =>
  `<label class="tr"><div class="tc"><span class="tr-l">${escapeHtml(label)}</span><span class="mu">${escapeHtml(desc)}</span></div><input class="ck" type="checkbox" data-action="flag-toggle" data-key="${key}"${checked ? " checked" : ""}></label>`;

export const dataRow = (top: string, sub: string, right: string): string =>
  `<div class="row"><div class="f1">${top}${sub}</div>${right}</div>`;

export const emptyBox = (text: string): string => `<div class="em">${escapeHtml(text)}</div>`;
export const emptyCard = (art: string, title: string, desc: string, acts: string, extra = ""): string =>
  h("section", "card", d("c g2", art + h("h2", "pt", escapeHtml(title)) + d("mu", escapeHtml(desc)) + d("r rw g1 mt1", acts) + extra));
export const tbl = (head: string, body: string): string =>
  `<div class="tb-wrap"><table class="tb"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
export const meterSvg = (pct: number): string =>
  `<svg class="mt" width="26" height="4" viewBox="0 0 100 4" aria-hidden="true"><rect width="100" height="4" rx="2" class="mt-bg"/><rect width="${Math.max(0, Math.min(100, Math.round(pct)))}" height="4" rx="2" class="mt-fg"/></svg>`;

export const subTabs = (key: string, items: ReadonlyArray<[string, string]>, cur: string, aria: string): string =>
  h(
    "div",
    "stabs",
    items
      .map(([v, lbl]) =>
        h(
          "button",
          `stab${v === cur ? " stab-a" : ""}`,
          lbl,
          `type="button" role="tab" aria-selected="${v === cur}" data-action="sub-tab" data-sub-key="${key}" data-sub-val="${v}"`
        )
      )
      .join(""),
    `role="tablist" aria-label="${escapeHtml(aria)}"`
  );
