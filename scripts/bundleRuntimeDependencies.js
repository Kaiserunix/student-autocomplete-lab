const path = require("node:path");
const { existsSync } = require("node:fs");
const esbuild = require("esbuild");

const outputRoot = path.resolve(process.argv[2] || "dist");
const entries = [
  path.join(outputRoot, "src", "oj", "mcpSdkClient.js"),
  path.join(outputRoot, "src", "oj", "problemDocument.js")
];

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main() {
  for (const entry of entries) {
    if (!existsSync(entry)) {
      throw new Error(`Runtime bundle entry does not exist: ${entry}`);
    }
    await esbuild.build({
      entryPoints: [entry],
      outfile: entry,
      allowOverwrite: true,
      bundle: true,
      platform: "node",
      format: "cjs",
      target: "node18",
      sourcemap: true,
      logLevel: "warning"
    });
  }
}
