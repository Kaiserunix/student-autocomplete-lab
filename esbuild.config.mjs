import * as esbuild from "esbuild";
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { resolve } from "node:path";

const watch = process.argv.includes("--watch");

mkdirSync(resolve("dist"), { recursive: true });

const extensionConfig = {
  entryPoints: ["src/extension/extension.ts"],
  bundle: true,
  outfile: "dist/extension.js",
  external: ["vscode"],
  format: "cjs",
  platform: "node",
  target: "node20",
  sourcemap: true,
  minify: !watch,
  logLevel: "info"
};

const webviewConfig = {
  entryPoints: ["src/webview/main.ts"],
  bundle: true,
  outfile: "dist/webview.js",
  format: "iife",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  minify: !watch,
  logLevel: "info"
};

const readerConfig = {
  entryPoints: ["src/webview/readerMain.ts"],
  bundle: true,
  outfile: "dist/reader.js",
  format: "iife",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
  minify: !watch,
  logLevel: "info"
};

function copyCss() {
  const cssSrc = resolve("src/webview/styles.css");
  if (existsSync(cssSrc)) {
    copyFileSync(cssSrc, resolve("dist/webview.css"));
  }
}

async function main() {
  const extEntry = resolve("src/extension/extension.ts");
  const webEntry = resolve("src/webview/main.ts");
  const readerEntry = resolve("src/webview/readerMain.ts");

  const builds = [];
  if (existsSync(extEntry)) {
    builds.push(watch ? esbuild.context(extensionConfig) : esbuild.build(extensionConfig));
  }
  if (existsSync(webEntry)) {
    builds.push(watch ? esbuild.context(webviewConfig) : esbuild.build(webviewConfig));
  }
  if (existsSync(readerEntry)) {
    builds.push(watch ? esbuild.context(readerConfig) : esbuild.build(readerConfig));
  }

  const results = await Promise.all(builds);
  copyCss();

  if (watch) {
    await Promise.all(results.map((ctx) => ctx.watch()));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
