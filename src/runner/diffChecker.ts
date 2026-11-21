import type { DiffMode } from "../core/contracts";

export interface DiffOptions {
  mode?: DiffMode;
  floatEpsilon?: number;
  maxDiffLines?: number;
}

export interface DiffResult {
  passed: boolean;
  mode: DiffMode;
  diffSummary?: string;
}

const FLOAT_TOKEN_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function normalizeLines(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
}

function tokenize(text: string): string[] {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
  if (!normalized) {
    return [];
  }
  return normalized.split(/\s+/);
}

function truncateLine(line: string, maxLen = 120): string {
  return line.length > maxLen ? `${line.slice(0, maxLen)}…` : line;
}

export function buildLineDiffSummary(
  actual: string,
  expected: string,
  maxLines = 6
): string {
  const expLines = normalizeLines(expected);
  const actLines = normalizeLines(actual);
  const total = Math.max(expLines.length, actLines.length);
  const diffs: string[] = [];

  for (let i = 0; i < total; i += 1) {
    const exp = expLines[i];
    const act = actLines[i];
    if (exp !== act) {
      diffs.push(
        `L${i + 1}: expected ${exp === undefined ? "<EOF>" : JSON.stringify(truncateLine(exp))}, got ${
          act === undefined ? "<EOF>" : JSON.stringify(truncateLine(act))
        }`
      );
      if (diffs.length >= maxLines) {
        if (i + 1 < total) {
          diffs.push(`… (${total - i - 1} more line(s) checked)`);
        }
        break;
      }
    }
  }

  return diffs.join("\n");
}

function canonicalizeJsonUnordered(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((item) => canonicalizeJsonUnordered(item)).sort();
    return `[${items.join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const pairs = keys.map((k) => `${JSON.stringify(k)}:${canonicalizeJsonUnordered(record[k])}`);
  return `{${pairs.join(",")}}`;
}

export function compareOutput(
  actual: string,
  expected: string,
  options: DiffOptions = {}
): DiffResult {
  const mode: DiffMode = options.mode ?? "token";
  const maxLines = options.maxDiffLines ?? 6;

  if (mode === "exact") {
    if (actual === expected) {
      return { passed: true, mode };
    }
    return {
      passed: false,
      mode,
      diffSummary: buildLineDiffSummary(actual, expected, maxLines) || "Exact output mismatch (whitespace or line-ending difference)."
    };
  }

  if (mode === "token") {
    const actTokens = tokenize(actual);
    const expTokens = tokenize(expected);
    if (actTokens.length === expTokens.length && actTokens.every((tok, idx) => tok === expTokens[idx])) {
      return { passed: true, mode };
    }
    const lineDiff = buildLineDiffSummary(
      actual.replace(/\r\n/g, "\n").trimEnd(),
      expected.replace(/\r\n/g, "\n").trimEnd(),
      maxLines
    );
    const firstDiffIdx = Math.max(
      0,
      Math.min(actTokens.length, expTokens.length)
    );
    let tokHint = "";
    for (let i = 0; i < Math.max(actTokens.length, expTokens.length); i += 1) {
      if (actTokens[i] !== expTokens[i]) {
        tokHint = `First differing token #${i + 1}: expected ${JSON.stringify(expTokens[i] ?? "<EOF>")}, got ${JSON.stringify(actTokens[i] ?? "<EOF>")}`;
        break;
      }
    }
    const summary = [tokHint, lineDiff].filter(Boolean).join("\n") || `Token count mismatch (expected ${expTokens.length}, got ${actTokens.length}, idx ${firstDiffIdx}).`;
    return { passed: false, mode, diffSummary: summary };
  }

  if (mode === "float-epsilon") {
    const eps = options.floatEpsilon ?? 1e-6;
    const actTokens = tokenize(actual);
    const expTokens = tokenize(expected);

    if (actTokens.length !== expTokens.length) {
      return {
        passed: false,
        mode,
        diffSummary: `Token count mismatch: expected ${expTokens.length}, got ${actTokens.length}.\n${buildLineDiffSummary(actual, expected, maxLines)}`
      };
    }

    for (let i = 0; i < expTokens.length; i += 1) {
      const expTok = expTokens[i]!;
      const actTok = actTokens[i]!;
      if (expTok === actTok) {
        continue;
      }
      if (FLOAT_TOKEN_RE.test(expTok) && FLOAT_TOKEN_RE.test(actTok)) {
        const expNum = Number(expTok);
        const actNum = Number(actTok);
        const tol = Math.max(eps, eps * Math.abs(expNum));
        if (Number.isFinite(expNum) && Number.isFinite(actNum) && Math.abs(actNum - expNum) <= tol) {
          continue;
        }
      }
      return {
        passed: false,
        mode,
        diffSummary: `Token #${i + 1} outside epsilon (${eps}): expected ${expTok}, got ${actTok}`
      };
    }

    return { passed: true, mode };
  }

  // json-unordered
  let expJson: unknown;
  let actJson: unknown;
  try {
    expJson = JSON.parse(expected.trim());
  } catch (error) {
    return {
      passed: false,
      mode,
      diffSummary: `Expected output is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    };
  }
  try {
    actJson = JSON.parse(actual.trim());
  } catch (error) {
    return {
      passed: false,
      mode,
      diffSummary: `Actual output is not valid JSON: ${error instanceof Error ? error.message : String(error)}`
    };
  }

  const expCanon = canonicalizeJsonUnordered(expJson);
  const actCanon = canonicalizeJsonUnordered(actJson);
  if (expCanon === actCanon) {
    return { passed: true, mode };
  }
  return {
    passed: false,
    mode,
    diffSummary: `Unordered JSON mismatch:\nexpected: ${truncateLine(expected.trim(), 200)}\nactual:   ${truncateLine(actual.trim(), 200)}`
  };
}
