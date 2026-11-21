import { escapeHtml } from "./state";

/** Ultra-compact strict-CSP HTML builders (zero inline styles, zero emoji). */

export const h = (tag: string, cls: string, body: string, attrs = ""): string =>
  `<${tag}${cls ? ` class="${cls}"` : ""}${attrs ? ` ${attrs}` : ""}>${body}</${tag}>`;

export const d = (cls: string, body: string): string => `<div class="${cls}">${body}</div>`;
export const sp = (cls: string, body: string): string => `<span class="${cls}">${body}</span>`;
export const cnt = (n: number | string): string => `<span class="mn mo">${n}</span>`;

export const sec = (title: string, body: string, right = ""): string =>
  `<section class="sec"><div class="sh"><span class="st">${title}</span>${right}</div>${body}</section>`;

export const badge = (text: string, tone = "m", mono = false): string =>
  `<span class="bg bg-${tone}${mono ? " mo" : ""}">${escapeHtml(text)}</span>`;

export const btn = (label: string, action: string, v = "s", sz = "sm", attrs = "", dis = false): string =>
  `<button class="b b-${v}${sz ? ` b-${sz}` : ""}" type="button" data-action="${action}"${attrs ? ` ${attrs}` : ""}${dis ? " disabled" : ""}>${label}</button>`;

export const sel = (items: ReadonlyArray<[string, string]>, cur: string, attrs: string, cls = "sel"): string =>
  `<select class="${cls}" ${attrs}>${items.map(([v, l]) => `<option value="${escapeHtml(v)}"${v === cur ? " selected" : ""}>${escapeHtml(l)}</option>`).join("")}</select>`;

export const inp = (draft: string, val: string, ph: string, cls = "in", type = "text", extra = ""): string =>
  `<input class="${cls}" type="${type}" data-draft="${draft}" value="${escapeHtml(val)}" placeholder="${escapeHtml(ph)}"${extra}>`;

export const toggleRow = (key: string, label: string, desc: string, checked: boolean): string =>
  `<label class="tr"><div class="tc"><span>${escapeHtml(label)}</span><span class="mu">${escapeHtml(desc)}</span></div><input class="ck" type="checkbox" data-action="flag-toggle" data-key="${key}"${checked ? " checked" : ""}></label>`;

export const dataRow = (top: string, sub: string, right: string): string =>
  `<div class="row"><div class="f1">${top}${sub}</div>${right}</div>`;

export const emptyBox = (text: string): string => `<div class="em">${escapeHtml(text)}</div>`;
export const tbl = (head: string, body: string): string => `<table class="tb"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
export const meterSvg = (pct: number): string =>
  `<svg class="mt" width="36" height="4" viewBox="0 0 100 4" aria-hidden="true"><rect width="100" height="4" class="mt-bg"/><rect width="${Math.max(0, Math.min(100, Math.round(pct)))}" height="4" class="mt-fg"/></svg>`;
