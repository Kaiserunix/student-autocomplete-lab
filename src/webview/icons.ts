/** Minimal monochrome inline SVG icons using currentColor (zero Unicode emoji). */
export type IconName =
  | "play"
  | "x"
  | "warn"
  | "copy"
  | "ext"
  | "ref"
  | "plus"
  | "del"
  | "find"
  | "imp"
  | "vol"
  | "mute"
  | "shd"
  | "book"
  | "split"
  | "expand"
  | "collapse"
  | "bulb"
  | "trace"
  | "chev"
  | "check"
  | "gear";

const P: Record<IconName, string> = {
  play: '<path d="M4 3v8l7-4z" fill="currentColor"/>',
  x: '<path d="M3.5 3.5l7 7m0-7l-7 7"/>',
  warn: '<path d="M7 2l5.5 10h-11zM7 6v3m0 1.4v.6"/>',
  copy: '<rect x="5" y="5" width="7" height="7"/><path d="M2 9V2h7"/>',
  ext: '<path d="M8 2h4v4m0-4L6 8m4 0v4H2V4h4"/>',
  ref: '<path d="M11.5 7A4.5 4.5 0 1 1 10 3.8M11.5 2v2.5H9"/>',
  plus: '<path d="M7 2.5v9M2.5 7h9"/>',
  del: '<path d="M2.5 4h9M5 4V2.5h4V4M4 4l.5 7.5h5L10 4"/>',
  find: '<circle cx="6" cy="6" r="3.6"/><path d="M9 9l3 3"/>',
  imp: '<path d="M7 2v7M4 6.5L7 9.5l3-3M2.5 11.5h9"/>',
  vol: '<path d="M2.5 5h2.3l3-2.5v9l-3-2.5H2.5zm7.3 0a2.8 2.8 0 0 1 0 4"/>',
  mute: '<path d="M2.5 5h2.3l3-2.5v9l-3-2.5H2.5zm7.1 0l3 4m0-4l-3 4"/>',
  shd: '<path d="M7 2l4.5 1.5V7c0 2.6-1.8 4.4-4.5 5.2C4.3 11.4 2.5 9.6 2.5 7V3.5z"/>',
  book: '<path d="M2.5 2.5h4.2v9H2.5zm4.8 0h4.2v9H7.3z"/>',
  split: '<rect x="1.8" y="2.2" width="10.4" height="9.6" rx="1"/><path d="M7 2.2v9.6"/>',
  expand: '<path d="M8.5 2.5h3v3m0-3L8 6M5.5 11.5h-3v-3m0 3L6 8"/>',
  collapse: '<path d="M11.5 5.5h-3v-3m0 3L12 2M2.5 8.5h3v3m0-3L2 12"/>',
  bulb: '<path d="M5 10.5h4M5.5 12h3M4.2 8.2A3.6 3.6 0 1 1 9.8 8.2c-.5.5-.8 1-.8 1.8H5c0-.8-.3-1.3-.8-1.8z"/>',
  trace: '<path d="M2.5 4h4l1.5 3h3.5M8.5 7l-1.5 3H2.5"/><circle cx="11.2" cy="7" r="1.2"/>',
  chev: '<path d="M5 3.5l4 3.5-4 3.5"/>',
  check: '<path d="M2.8 7.3L5.6 10l5.6-6"/>',
  gear: '<circle cx="7" cy="7" r="2"/><path d="M5.8 1.5h2.4l.3 1.4 1.2.7 1.4-.5 1.2 2.1-1.1 1v1.6l1.1 1-1.2 2.1-1.4-.5-1.2.7-.3 1.4H5.8l-.3-1.4-1.2-.7-1.4.5-1.2-2.1 1.1-1V6.2l-1.1-1 1.2-2.1 1.4.5 1.2-.7z"/>'
};

export const icon = (n: IconName, s = 12): string =>
  `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true">${P[n]}</svg>`;
