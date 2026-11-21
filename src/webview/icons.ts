/** Minimal monochrome inline SVG icons using currentColor (zero Unicode emoji). */
export type IconName = "play" | "x" | "warn" | "copy" | "ext" | "ref" | "plus" | "del" | "find" | "imp" | "vol" | "mute" | "shd" | "book";

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
  book: '<path d="M2.5 2.5h4.2v9H2.5zm4.8 0h4.2v9H7.3z"/>'
};

export const icon = (n: IconName, s = 12): string =>
  `<svg class="ic" width="${s}" height="${s}" viewBox="0 0 14 14" fill="none" stroke="currentColor" stroke-width="1.25" aria-hidden="true">${P[n]}</svg>`;
