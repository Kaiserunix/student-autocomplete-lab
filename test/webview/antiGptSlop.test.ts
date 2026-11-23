import * as esbuild from "esbuild";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEBVIEW_DIR = resolve("src/webview");
const CSS_PATH = resolve("src/webview/styles.css");
const AUDIO_SYNTH_PATH = resolve("src/webview/audioSynth.ts");
const MARKDOWN_MATH_PATH = resolve("src/webview/markdownMath.ts");

function walkFiles(dir: string, exts: string[], acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      walkFiles(full, exts, acc);
    } else if (exts.some((ext) => entry.endsWith(ext))) {
      acc.push(full);
    }
  }
  return acc;
}

describe("Anti-GPT-Slop static redlines & bundle budgets (src/webview)", () => {
  const css = readFileSync(CSS_PATH, "utf8");
  const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const tsFiles = walkFiles(WEBVIEW_DIR, [".ts"]);
  const allWebviewFiles = walkFiles(WEBVIEW_DIR, [".ts", ".css"]);

  it("styles.css contains zero hardcoded hex, rgb(), rgba(), hsl(), hsla(), or purple tokens", () => {
    expect(cssNoComments).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(cssNoComments).not.toMatch(/\brgba?\s*\(/i);
    expect(cssNoComments).not.toMatch(/\bhsla?\s*\(/i);
    expect(cssNoComments).not.toMatch(/\bpurple\b/i);
  });

  it("styles.css uses native --vscode-* tokens, tabular-nums, and lawful color-mix()", () => {
    expect(css).toContain("--vscode-sideBar-background");
    expect(css).toContain("--vscode-editor-background");
    expect(css).toContain("--vscode-textCodeBlock-background");
    expect(css).toContain("--vscode-widget-shadow");
    expect(css).toContain("--vscode-foreground");
    expect(css).toContain("--vscode-panel-border");
    expect(css).toContain("--vscode-button-background");
    expect(css).toContain("--vscode-editor-font-family");
    expect(css).toContain("tabular-nums");

    // Every color-mix() must reference only native --vscode-* tokens and transparent
    const mixMatches = [...css.matchAll(/color-mix\(([^;{}]+)\)/gi)];
    expect(mixMatches.length).toBeGreaterThan(0);
    for (const m of mixMatches) {
      const inner = m[1] ?? "";
      expect(inner).toMatch(/var\(--vscode-[a-zA-Z0-9-]+\)/);
      expect(inner).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/i);
    }
  });

  it("styles.css bans gradients, glassmorphism, neon glow text-shadow, and @keyframes while allowing restrained native widget shadows", () => {
    expect(css).not.toMatch(/\b(?:linear|radial|conic)-gradient\s*\(/i);
    expect(css).not.toMatch(/\bbackdrop-filter\b/i);
    expect(css).not.toMatch(/\btext-shadow\b/i);
    expect(css).not.toMatch(/@keyframes\b/i);

    // Every box-shadow must be either `none` or composed strictly of --vscode-widget-shadow / restrained color-mix top highlight
    const shadowMatches = [...css.matchAll(/box-shadow\s*:\s*([^;]+);/gi)];
    expect(shadowMatches.length).toBeGreaterThan(0);
    for (const match of shadowMatches) {
      const val = (match[1] ?? "").trim();
      if (val === "none") continue;
      expect(val).not.toMatch(/#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(|\bhsla?\s*\(/i);
      const hasApprovedToken =
        val.includes("var(--vscode-widget-shadow)") ||
        /color-mix\(in srgb,\s*var\(--vscode-foreground\)/.test(val);
      expect(hasApprovedToken, `Disallowed box-shadow: ${val}`).toBe(true);
      // Keep blur radii restrained (<= 10px, zero large neon halos)
      for (const px of val.matchAll(/(\d+(?:\.\d+)?)px/gi)) {
        expect(Number(px[1])).toBeLessThanOrEqual(10);
      }
    }
  });

  it("styles.css keeps every border-radius <= 6px and every transition <= 150ms", () => {
    const radiusMatches = [...css.matchAll(/border-radius\s*:\s*([^;]+);/gi)];
    expect(radiusMatches.length).toBeGreaterThan(0);
    for (const match of radiusMatches) {
      const value = (match[1] ?? "").trim();
      expect(value).not.toContain("%");
      const pxValues = [...value.matchAll(/(\d+(?:\.\d+)?)px/gi)];
      expect(pxValues.length).toBeGreaterThan(0);
      for (const px of pxValues) {
        expect(Number(px[1])).toBeLessThanOrEqual(6);
      }
    }

    const transitionMatches = [...css.matchAll(/transition\s*:\s*([^;]+);/gi)];
    for (const match of transitionMatches) {
      const value = match[1] ?? "";
      for (const dur of value.matchAll(/(\d+(?:\.\d+)?)(ms|s)\b/gi)) {
        const raw = Number(dur[1]);
        const ms = dur[2]?.toLowerCase() === "s" ? raw * 1000 : raw;
        expect(ms).toBeLessThanOrEqual(150);
      }
    }
  });

  it("all src/webview files contain zero Unicode emoji, zero vscode imports, and zero inline style= (strict CSP)", () => {
    const emojiRe = /[\p{Extended_Pictographic}\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/u;
    const vscodeImportRe = /(?:import\s+[^'"]*from\s+|require\s*\(\s*)['"]vscode['"]/;

    for (const file of allWebviewFiles) {
      const content = readFileSync(file, "utf8");
      const found = content.match(emojiRe);
      expect(
        found,
        `Forbidden Unicode emoji/pictograph "${found?.[0] ?? ""}" in ${relative(process.cwd(), file)}`
      ).toBeNull();
    }

    for (const file of tsFiles) {
      const content = readFileSync(file, "utf8");
      expect(content).not.toMatch(vscodeImportRe);
      expect(content).not.toMatch(/\bstyle\s*=\s*["']/i);
      expect(content).not.toMatch(/\bon(?:click|input|change|error|load)\s*=\s*["']/i);
    }
  });

  it("keeps minified webview.js < 80KB, reader.js < 26KB, markdownMath < 12KB (gzip < 5KB), and audioSynth < 10KB", async () => {
    const { gzipSync } = await import("node:zlib");
    const [webRes, readerRes, mdRes, audioRes] = await Promise.all([
      esbuild.build({
        entryPoints: [resolve("src/webview/main.ts")],
        bundle: true,
        format: "iife",
        platform: "browser",
        target: "es2022",
        minify: true,
        write: false
      }),
      esbuild.build({
        entryPoints: [resolve("src/webview/readerMain.ts")],
        bundle: true,
        format: "iife",
        platform: "browser",
        target: "es2022",
        minify: true,
        write: false
      }),
      esbuild.build({
        entryPoints: [MARKDOWN_MATH_PATH],
        bundle: true,
        format: "esm",
        platform: "browser",
        target: "es2022",
        minify: true,
        write: false
      }),
      esbuild.build({
        entryPoints: [AUDIO_SYNTH_PATH],
        bundle: true,
        format: "esm",
        platform: "browser",
        target: "es2022",
        minify: true,
        write: false
      })
    ]);

    const webviewBytes = webRes.outputFiles[0]?.contents.length ?? Number.POSITIVE_INFINITY;
    const readerBytes = readerRes.outputFiles[0]?.contents.length ?? Number.POSITIVE_INFINITY;
    const mdRaw = mdRes.outputFiles[0]?.contents ?? new Uint8Array();
    const mdBytes = mdRaw.length;
    const mdGzipBytes = gzipSync(mdRaw).length;
    const audioMinBytes = audioRes.outputFiles[0]?.contents.length ?? Number.POSITIVE_INFINITY;
    const audioRawBytes = statSync(AUDIO_SYNTH_PATH).size;

    expect(webviewBytes).toBeLessThan(80 * 1024);
    expect(readerBytes).toBeLessThan(26 * 1024);
    expect(mdBytes).toBeLessThan(12 * 1024);
    expect(mdGzipBytes).toBeLessThan(5 * 1024);
    expect(audioMinBytes).toBeLessThan(10 * 1024);
    expect(audioRawBytes).toBeLessThan(10 * 1024);
  });

  it("enforces P0 layout/contrast/typography/a11y regressions (non-collapsing drawers, focus-visible, lining math, >=11px floor)", () => {
    // P0-1: Cards, drawers, and patch slots must never collapse under flex column .main
    expect(cssNoComments).toMatch(/\.card\s*\{[^}]*flex-shrink\s*:\s*0/s);
    expect(cssNoComments).toMatch(/\.drawer\s*\{[^}]*flex-shrink\s*:\s*0/s);
    expect(cssNoComments).toMatch(/\.patch-slot\s*\{[^}]*flex-shrink\s*:\s*0/s);

    // P0-2: Tables scroll cleanly inside .tb-wrap and long concept tags truncate safely
    expect(cssNoComments).toMatch(/\.tb-wrap\s*\{[^}]*overflow-x\s*:\s*auto/s);
    expect(cssNoComments).toMatch(/\.tag-cell\s*\{[^}]*text-overflow\s*:\s*ellipsis/s);

    // P0-3: Selected list rows override nested muted/semantic colors for Light+ contrast
    expect(cssNoComments).toContain(".lr-a .mu");
    expect(cssNoComments).toContain(".lr-a .ok");
    expect(cssNoComments).toContain(".lr-a .bg");
    expect(cssNoComments).toContain("var(--vscode-list-activeSelectionForeground)");

    // P0-4: Math font uses lining numerals (no Georgia old-style 0) and zero-line-height scripts
    expect(cssNoComments).not.toMatch(/\.md-math[^{]*\{[^}]*font-family\s*:\s*Georgia/s);
    expect(cssNoComments).toMatch(/\.md-math\s*\{[^}]*font-variant-numeric\s*:\s*lining-nums/s);
    expect(cssNoComments).toMatch(/\.md-math\s+sup\s*,\s*\.md-math\s+sub\s*\{[^}]*line-height\s*:\s*0/s);

    // Universal keyboard focus rings & zero bare outline: none
    expect(cssNoComments).toContain(":focus-visible");
    expect(cssNoComments).toContain("outline: 1px solid var(--vscode-focusBorder)");
    expect(cssNoComments).not.toMatch(/\boutline\s*:\s*none\b/i);

    // Ban Light+-muddy foreground inset top bevels, decorative 3px side-tabs, and sub-11px micro text
    expect(cssNoComments).not.toMatch(/inset\s+0\s+1px\s+0\s+color-mix\(in srgb,\s*var\(--vscode-foreground\)/i);
    expect(cssNoComments).not.toMatch(/border-left\s*:\s*3px\b/i);
    expect(cssNoComments).not.toMatch(/font-size\s*:\s*(?:[1-9]|10)px\b/i);
  });
});
