#!/usr/bin/env node
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXTENSION_ID = "kaiserunix.algo-coach";
const DEFAULT_BRIDGE_PORT_START = 27121;
const DEFAULT_BRIDGE_PORT_END = 27130;

const SET_ALIASES = {
  "1": ["set1-warmup"],
  set1: ["set1-warmup"],
  "set1-warmup": ["set1-warmup"],
  "2": ["set2-fundamentals"],
  set2: ["set2-fundamentals"],
  "set2-fundamentals": ["set2-fundamentals"],
  "3": ["set3-search-graph-dp"],
  set3: ["set3-search-graph-dp"],
  "set3-search-graph-dp": ["set3-search-graph-dp"],
  "4": ["set4-advanced"],
  set4: ["set4-advanced"],
  "set4-advanced": ["set4-advanced"],
  all: [
    "set1-warmup",
    "set2-fundamentals",
    "set3-search-graph-dp",
    "set4-advanced",
  ],
};

function sanitizeKeyForFile(problemKey) {
  return problemKey.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function printHelp() {
  console.log(`Algo Coach Problem-List Importer (CS-Guidebook · algo-coach v0.2.1)

Usage:
  node import-to-algo-coach.mjs [options]

Options:
  --mode <cache|bridge>    Import mode (default: cache)
  --cache                  Alias for --mode cache (silent problem-doc/v2 write)
  --bridge                 Alias for --mode bridge (POST to Localhost Bridge)
  --set <id>               Set to import: 1|2|3|4|set1|set2|set3|set4|all
  --all                    Alias for --set all
  --target, --target-dir   Custom problems-cache/problems directory (cache mode)
  --port <number>          Fixed Bridge port (bridge mode; default probes 27121..27130)
  --force, --overwrite     Overwrite existing cached JSON files (cache mode)
  --dry-run                Preview actions without writing files or sending HTTP POST
  -h, --help               Show this help message

Examples:
  node import-to-algo-coach.mjs --all --dry-run
  node import-to-algo-coach.mjs --mode cache --set set1
  node import-to-algo-coach.mjs --mode cache --all --target "/custom/problems"
  node import-to-algo-coach.mjs --mode bridge --set set1 --dry-run
  node import-to-algo-coach.mjs --set 1 --bridge
`);
}

function parseArgs(argv) {
  if (argv.length === 0) {
    return { help: true };
  }

  const opts = {
    mode: "cache",
    set: null,
    targetDir: null,
    port: null,
    force: false,
    dryRun: false,
    help: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      opts.help = true;
    } else if (arg === "--cache") {
      opts.mode = "cache";
    } else if (arg === "--bridge") {
      opts.mode = "bridge";
    } else if (arg === "--all") {
      opts.set = "all";
    } else if (arg === "--force" || arg === "--overwrite") {
      opts.force = true;
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (arg === "--mode") {
      const val = argv[++i];
      if (val !== "cache" && val !== "bridge") {
        throw new Error(`Invalid --mode "${val ?? ""}". Expected "cache" or "bridge".`);
      }
      opts.mode = val;
    } else if (arg.startsWith("--mode=")) {
      const val = arg.slice("--mode=".length);
      if (val !== "cache" && val !== "bridge") {
        throw new Error(`Invalid --mode "${val}". Expected "cache" or "bridge".`);
      }
      opts.mode = val;
    } else if (arg === "--set") {
      const val = (argv[++i] ?? "").toLowerCase();
      if (!SET_ALIASES[val]) {
        throw new Error(`Invalid --set "${val}". Expected 1|2|3|4|set1|set2|set3|set4|all.`);
      }
      opts.set = val;
    } else if (arg.startsWith("--set=")) {
      const val = arg.slice("--set=".length).toLowerCase();
      if (!SET_ALIASES[val]) {
        throw new Error(`Invalid --set "${val}". Expected 1|2|3|4|set1|set2|set3|set4|all.`);
      }
      opts.set = val;
    } else if (arg === "--target" || arg === "--target-dir") {
      const val = argv[++i];
      if (!val) {
        throw new Error(`Missing directory path after ${arg}.`);
      }
      opts.targetDir = val;
    } else if (arg.startsWith("--target=")) {
      opts.targetDir = arg.slice("--target=".length);
    } else if (arg.startsWith("--target-dir=")) {
      opts.targetDir = arg.slice("--target-dir=".length);
    } else if (arg === "--port") {
      const raw = argv[++i];
      const port = Number(raw);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid --port "${raw ?? ""}".`);
      }
      opts.port = port;
    } else if (arg.startsWith("--port=")) {
      const raw = arg.slice("--port=".length);
      const port = Number(raw);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(`Invalid --port "${raw}".`);
      }
      opts.port = port;
    } else {
      throw new Error(`Unknown option: ${arg}. Run with --help for usage.`);
    }
  }

  if (!opts.set) {
    opts.set = "all";
  }
  return opts;
}

function getEditorConfigRoots() {
  const editorNames = ["Code", "Code - Insiders", "Cursor", "VSCodium"];
  let baseDir;
  if (process.platform === "win32") {
    baseDir = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
  } else if (process.platform === "darwin") {
    baseDir = path.join(os.homedir(), "Library", "Application Support");
  } else {
    baseDir = process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config");
  }
  return editorNames.map((name) => path.join(baseDir, name, "User", "globalStorage", EXTENSION_ID));
}

function resolveTargetCacheDir(customTarget) {
  if (customTarget) {
    const resolved = path.resolve(customTarget);
    if (path.basename(resolved).toLowerCase() === EXTENSION_ID) {
      return {
        problemsDir: path.join(resolved, "problems-cache", "problems"),
        detectedFrom: "custom-extension-root",
        extensionExists: fs.existsSync(resolved),
      };
    }
    return {
      problemsDir: resolved,
      detectedFrom: "custom-target",
      extensionExists: fs.existsSync(resolved),
    };
  }

  const candidates = getEditorConfigRoots();
  for (const extRoot of candidates) {
    const problemsDir = path.join(extRoot, "problems-cache", "problems");
    if (fs.existsSync(problemsDir) || fs.existsSync(extRoot)) {
      return {
        problemsDir,
        detectedFrom: `auto-detected (${path.basename(path.resolve(extRoot, "../../.."))})`,
        extensionExists: true,
      };
    }
  }

  const fallbackRoot = candidates[0];
  return {
    problemsDir: path.join(fallbackRoot, "problems-cache", "problems"),
    detectedFrom: "default-vscode-path (not yet initialized)",
    extensionExists: false,
  };
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateProblemDoc(doc, contextLabel) {
  if (!doc || typeof doc !== "object") {
    throw new Error(`${contextLabel}: expected JSON object.`);
  }
  if (doc.schemaVersion !== "problem-doc/v2") {
    throw new Error(`${contextLabel}: invalid schemaVersion "${doc.schemaVersion}".`);
  }
  if (typeof doc.problemKey !== "string" || doc.problemKey.trim().length === 0) {
    throw new Error(`${contextLabel}: missing non-empty problemKey.`);
  }
  if (!doc.provenance || typeof doc.provenance.fetchedAt !== "string") {
    throw new Error(`${contextLabel}: missing provenance.fetchedAt ISO-8601 string.`);
  }
}

function runCacheMode(opts) {
  const setSlugs = SET_ALIASES[opts.set];
  const target = resolveTargetCacheDir(opts.targetDir);

  console.log(`[Mode] cache (problem-doc/v2 silent import)`);
  console.log(`[Sets] ${setSlugs.join(", ")}`);
  console.log(`[Target] ${target.problemsDir} (${target.detectedFrom})`);
  if (opts.dryRun) {
    console.log(`[Dry-Run] No files or directories will be created or modified.`);
  } else {
    fs.mkdirSync(target.problemsDir, { recursive: true });
  }

  let written = 0;
  let skipped = 0;
  let total = 0;

  for (const slug of setSlugs) {
    const bundlePath = path.join(SCRIPT_DIR, "cache-v2", `${slug}.bundle.json`);
    const bundle = readJsonFile(bundlePath);
    if (!Array.isArray(bundle)) {
      throw new Error(`Expected array in ${bundlePath}`);
    }

    for (const bundleItem of bundle) {
      total++;
      validateProblemDoc(bundleItem, `${slug}.bundle.json#${total}`);
      const safeFile = `${sanitizeKeyForFile(bundleItem.problemKey)}.json`;
      const sourceProblemPath = path.join(SCRIPT_DIR, "cache-v2", "problems", safeFile);
      const docToWrite = fs.existsSync(sourceProblemPath)
        ? readJsonFile(sourceProblemPath)
        : bundleItem;
      validateProblemDoc(docToWrite, safeFile);

      const destPath = path.join(target.problemsDir, safeFile);
      const exists = fs.existsSync(destPath);

      if (exists && !opts.force) {
        skipped++;
        console.log(`  [SKIP] ${safeFile} (already cached; pass --force to overwrite)`);
        continue;
      }

      if (opts.dryRun) {
        written++;
        console.log(
          `  [DRY-RUN] ${exists ? "OVERWRITE" : "WRITE"} ${safeFile} <- ${docToWrite.problemKey} (${docToWrite.title})`
        );
      } else {
        fs.writeFileSync(destPath, JSON.stringify(docToWrite, null, 2) + "\n", "utf8");
        written++;
        console.log(`  [OK] ${safeFile} <- ${docToWrite.problemKey}`);
      }
    }
  }

  console.log(
    `\nSummary: ${written} ${opts.dryRun ? "would write" : "written"}, ${skipped} skipped, ${total} total.`
  );
  if (!opts.dryRun && written > 0) {
    console.log(
      `Next step in VS Code: run "Developer: Reload Window" (or reopen Algo Coach) and check "选题 -> 已存".`
    );
  }
}

function httpRequest({ host, port, method, pathName, body }) {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host,
        port,
        method,
        path: pathName,
        timeout: 1500,
        headers: payload
          ? {
              "Content-Type": "application/json",
              "Content-Length": Buffer.byteLength(payload, "utf8"),
            }
          : {},
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
          });
        });
      }
    );
    req.on("timeout", () => {
      req.destroy(new Error("Request timeout"));
    });
    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

async function detectBridgePort(fixedPort) {
  const ports = fixedPort
    ? [fixedPort]
    : Array.from(
        { length: DEFAULT_BRIDGE_PORT_END - DEFAULT_BRIDGE_PORT_START + 1 },
        (_, idx) => DEFAULT_BRIDGE_PORT_START + idx
      );

  for (const port of ports) {
    try {
      const res = await httpRequest({
        host: "127.0.0.1",
        port,
        method: "GET",
        pathName: "/health",
      });
      if (res.statusCode >= 200 && res.statusCode < 300) {
        return port;
      }
    } catch {
      // Try next port in range.
    }
  }
  return null;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runBridgeMode(opts) {
  const setSlugs = SET_ALIASES[opts.set];
  const items = [];

  for (const slug of setSlugs) {
    const ccPath = path.join(SCRIPT_DIR, "bridge", `${slug}.cc.json`);
    const arr = readJsonFile(ccPath);
    if (!Array.isArray(arr)) {
      throw new Error(`Expected array in ${ccPath}`);
    }
    for (const item of arr) {
      items.push({ slug, payload: item });
    }
  }

  console.log(`[Mode] bridge (Competitive Companion HTTP POST)`);
  console.log(`[Sets] ${setSlugs.join(", ")} (${items.length} problems)`);
  console.log(
    `[Note] Bridge mode creates and opens a practice/ editor tab per pushed problem.`
  );

  if (opts.dryRun) {
    const previewPort = opts.port ?? DEFAULT_BRIDGE_PORT_START;
    console.log(
      `[Dry-Run] Would probe 127.0.0.1:${opts.port ? opts.port : `${DEFAULT_BRIDGE_PORT_START}..${DEFAULT_BRIDGE_PORT_END}`} via GET /health and POST ${items.length} items to http://127.0.0.1:${previewPort}/`
    );
    for (const { slug, payload } of items) {
      console.log(`  [DRY-RUN] POST (${slug}) ${payload.name} -> ${payload.url}`);
    }
    console.log(`\nSummary: ${items.length} payloads validated (dry-run, no HTTP sent).`);
    return;
  }

  const activePort = await detectBridgePort(opts.port);
  if (!activePort) {
    const rangeDesc = opts.port
      ? `127.0.0.1:${opts.port}`
      : `127.0.0.1:${DEFAULT_BRIDGE_PORT_START}..${DEFAULT_BRIDGE_PORT_END}`;
    throw new Error(
      `Algo Coach Localhost Bridge not detected on ${rangeDesc}. Open VS Code with Algo Coach active (green Bridge indicator) and retry.`
    );
  }

  console.log(`[Bridge] Connected to http://127.0.0.1:${activePort}/`);
  let okCount = 0;

  for (let i = 0; i < items.length; i++) {
    const { payload } = items[i];
    const res = await httpRequest({
      host: "127.0.0.1",
      port: activePort,
      method: "POST",
      pathName: "/",
      body: payload,
    });
    if (res.statusCode >= 200 && res.statusCode < 300) {
      okCount++;
      console.log(`  [OK] (${i + 1}/${items.length}) ${payload.name}`);
    } else {
      console.error(
        `  [FAIL] (${i + 1}/${items.length}) ${payload.name} -> HTTP ${res.statusCode}: ${res.body}`
      );
    }
    if (i + 1 < items.length) {
      await sleep(150);
    }
  }

  console.log(`\nSummary: ${okCount}/${items.length} pushed via Bridge.`);
  if (okCount < items.length) {
    process.exitCode = 1;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    printHelp();
    return;
  }

  if (opts.mode === "cache") {
    runCacheMode(opts);
  } else {
    await runBridgeMode(opts);
  }
}

main().catch((err) => {
  console.error(`[Error] ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
