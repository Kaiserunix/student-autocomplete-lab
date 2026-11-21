import * as esbuild from "esbuild";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const WEBVIEW_DIR = resolve("src/webview");
const CSS_PATH = resolve("src/webview/styles.css");
const AUDIO_SYNTH_PATH = resolve("src/webview/audioSynth.ts");

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
  const tsFiles = walkFiles(WEBVIEW_DIR, [".ts"]);
  const allWebviewFiles = walkFiles(WEBVIEW_DIR, [".ts", ".css"]);

  it("styles.css contains zero hardcoded hex, rgb(), rgba(), hsl(), or hsla() colors", () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\s*\(/i);
    expect(css).not.toMatch(/\bhsla?\s*\(/i);
  });

  it("styles.css uses native --vscode-* theme tokens and tabular-nums", () => {
    expect(css).toContain("--vscode-sideBar-background");
    expect(css).toContain("--vscode-foreground");
    expect(css).toContain("--vscode-panel-border");
    expect(css).toContain("--vscode-button-background");
    expect(css).toContain("--vscode-editor-font-family");
    expect(css).toContain("tabular-nums");
  });

  it("styles.css contains zero gradients, glow shadows, or glassmorphism backdrop-filter", () => {
    expect(css).not.toMatch(/\b(?:linear|radial|conic)-gradient\s*\(/i);
    expect(css).not.toMatch(/\bbackdrop-filter\b/i);
    expect(css).not.toMatch(/\bbox-shadow\b/i);
    expect(css).not.toMatch(/\btext-shadow\b/i);
    expect(css).not.toMatch(/@keyframes\b/i);
  });

  it("styles.css keeps every border-radius <= 3px and every transition <= 150ms", () => {
    const radiusMatches = [...css.matchAll(/border-radius\s*:\s*([^;]+);/gi)];
    expect(radiusMatches.length).toBeGreaterThan(0);
    for (const match of radiusMatches) {
      const value = (match[1] ?? "").trim();
      expect(value).not.toContain("%");
      const pxValues = [...value.matchAll(/(\d+(?:\.\d+)?)px/gi)];
      expect(pxValues.length).toBeGreaterThan(0);
      for (const px of pxValues) {
        expect(Number(px[1])).toBeLessThanOrEqual(3);
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

  it("keeps minified webview.js < 35KB and audioSynth.ts < 10KB", async () => {
    const [webRes, audioRes] = await Promise.all([
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
    const audioMinBytes = audioRes.outputFiles[0]?.contents.length ?? Number.POSITIVE_INFINITY;
    const audioRawBytes = statSync(AUDIO_SYNTH_PATH).size;

    expect(webviewBytes).toBeLessThan(35 * 1024);
    expect(audioMinBytes).toBeLessThan(10 * 1024);
    expect(audioRawBytes).toBeLessThan(10 * 1024);
  });
});
