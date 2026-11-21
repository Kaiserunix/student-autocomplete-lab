import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const CORE_DIRS = [
  "src/core",
  "src/problems",
  "src/runner",
  "src/submitBridge"
];

const VSCODE_IMPORT_RE = /(?:import\s+[^'"]*from\s+|require\s*\(\s*)['"]vscode['"]/;
const LEGACY_MIMO_RE = /\bmimo(?:Autocomplete|Teacher|Journey|Teaching)\b/i;

function walkTs(dir, acc = []) {
  try {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walkTs(full, acc);
      } else if (entry.endsWith(".ts")) {
        acc.push(full);
      }
    }
  } catch {
    // Directory may not exist yet during early bootstrap
  }
  return acc;
}

const violations = [];

for (const dir of CORE_DIRS) {
  for (const file of walkTs(dir)) {
    const content = readFileSync(file, "utf8");
    if (VSCODE_IMPORT_RE.test(content)) {
      violations.push(`Forbidden 'vscode' import in domain module: ${relative(process.cwd(), file)}`);
    }
  }
}

for (const file of walkTs("src")) {
  const content = readFileSync(file, "utf8");
  if (LEGACY_MIMO_RE.test(content)) {
    violations.push(`Legacy 'mimo' identifier found: ${relative(process.cwd(), file)}`);
  }
}

if (violations.length > 0) {
  console.error("Architecture boundary check failed:\n" + violations.map((v) => " - " + v).join("\n"));
  process.exit(1);
}

console.log("Architecture boundary check passed (zero vscode imports in domain layers, zero legacy mimo identifiers).");
