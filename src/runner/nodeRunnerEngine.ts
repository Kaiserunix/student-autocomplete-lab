import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { delimiter, dirname, join } from "node:path";
import type {
  DiffMode,
  LocalRunResult,
  RunnerEngine,
  RunnerRequest,
  SampleCaseResult,
  SampleVerdict,
  ToolchainProbe
} from "../core/contracts";
import { compareOutput } from "./diffChecker";
import { generateLeetCodeHarness, normalizeLeetCodeType } from "./leetcodeHarness";
import {
  DEFAULT_MAX_OUTPUT_BYTES,
  DEFAULT_TIMEOUT_MS,
  runSandboxedProcess,
  type SandboxRunOptions,
  type SandboxRunResult
} from "./processSandbox";
import {
  probeAllToolchains,
  probeSingleToolchain,
  splitCommandSpec,
  type ConcreteLanguage
} from "./toolchains";

export interface NodeRunnerEngineOptions {
  /** Override toolchain probing (useful for deterministic unit tests). */
  probeToolchainsImpl?: () => Promise<ToolchainProbe[]>;
  probeSingleImpl?: (lang: ConcreteLanguage) => Promise<ToolchainProbe>;
  /** Override sandboxed process runner (useful for deterministic unit tests). */
  sandboxRunner?: (opts: SandboxRunOptions) => Promise<SandboxRunResult>;
  /** Maximum output bytes per sample before OLE hard truncation (default 1 MiB). */
  maxOutputBytes?: number;
  /** Default compile timeout in ms (default 20000). */
  compileTimeoutMs?: number;
}

const DEFAULT_COMPILE_FLAGS: Record<ConcreteLanguage, string[]> = {
  python: [],
  cpp: ["-std=c++17", "-O2", "-pipe"],
  c: ["-std=c11", "-O2", "-pipe"],
  rust: ["-O"],
  java: ["-encoding", "UTF-8"]
};

const MEMORY_NOTE =
  "Local reference execution (Node sandbox; peak memory is best-effort and not equivalent to OJ cgroup limits).";

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function stripJavaCommentsAndStrings(source: string): string {
  let out = "";
  let inLine = false;
  let inBlock = false;
  let quote: string | null = null;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i]!;
    const next = source[i + 1];
    if (inLine) {
      if (ch === "\n") {
        inLine = false;
        out += "\n";
      } else {
        out += " ";
      }
      continue;
    }
    if (inBlock) {
      if (ch === "*" && next === "/") {
        inBlock = false;
        out += "  ";
        i += 1;
      } else {
        out += ch === "\n" ? "\n" : " ";
      }
      continue;
    }
    if (quote) {
      if (ch === "\\") {
        out += "  ";
        i += 1;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      out += ch === "\n" ? "\n" : " ";
      continue;
    }
    if (ch === "/" && next === "/") {
      inLine = true;
      out += "  ";
      i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlock = true;
      out += "  ";
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      out += " ";
      continue;
    }
    out += ch;
  }
  return out;
}

export function detectJavaClassName(source: string): string {
  const cleaned = stripJavaCommentsAndStrings(source);
  const publicMatch = cleaned.match(
    /\bpublic\s+(?:(?:final|abstract|strictfp)\s+)*class\s+([A-Za-z_][A-Za-z0-9_]*)\b/
  );
  if (publicMatch?.[1]) {
    return publicMatch[1];
  }

  // Scan top-level (braceDepth === 0) class declarations, preferring one containing main()
  const topLevelClasses: Array<{ name: string; body: string }> = [];
  let depth = 0;
  let i = 0;
  while (i < cleaned.length) {
    const ch = cleaned[i]!;
    if (ch === "{") {
      depth += 1;
      i += 1;
      continue;
    }
    if (ch === "}") {
      depth = Math.max(0, depth - 1);
      i += 1;
      continue;
    }
    if (depth === 0 && ch === "c" && !/[A-Za-z0-9_.]/.test(cleaned[i - 1] ?? "")) {
      const m = cleaned.slice(i).match(/^class\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
      if (m?.[1]) {
        const openBrace = cleaned.indexOf("{", i + m[0].length);
        if (openBrace !== -1) {
          let b = openBrace + 1;
          let bodyDepth = 1;
          while (b < cleaned.length && bodyDepth > 0) {
            if (cleaned[b] === "{") bodyDepth += 1;
            else if (cleaned[b] === "}") bodyDepth -= 1;
            b += 1;
          }
          topLevelClasses.push({ name: m[1], body: cleaned.slice(openBrace, b) });
          i = b;
          continue;
        }
      }
    }
    i += 1;
  }

  const withMain = topLevelClasses.find((c) => /\bstatic\s+void\s+main\s*\(/.test(c.body));
  if (withMain) {
    return withMain.name;
  }
  const namedMain = topLevelClasses.find((c) => c.name === "Main");
  if (namedMain) {
    return namedMain.name;
  }
  return topLevelClasses[0]?.name ?? "Main";
}

function buildToolchainPathEnv(command: string): Record<string, string | undefined> | undefined {
  if (!command.includes("/") && !command.includes("\\")) {
    return undefined;
  }
  const binDir = dirname(command);
  if (!binDir || binDir === ".") {
    return undefined;
  }
  const existingPath = process.env.PATH ?? process.env.Path ?? "";
  const nextPath = existingPath ? `${binDir}${delimiter}${existingPath}` : binDir;
  return { PATH: nextPath };
}

function buildSkippedOrCompileErrorCases(
  request: RunnerRequest,
  verdict: Extract<SampleVerdict, "CE" | "SKIPPED">,
  message: string
): SampleCaseResult[] {
  return request.samples.map((sample) => ({
    id: sample.id,
    isOriginal: sample.isOriginal,
    verdict,
    durationMs: 0,
    input: sample.input,
    ...(sample.expectedOutput !== undefined ? { expected: sample.expectedOutput } : {}),
    actual: "",
    stderr: verdict === "CE" ? message : "",
    diffSummary: message
  }));
}

function summarizeCounts(cases: SampleCaseResult[]): {
  originalTotal: number;
  originalPassed: number;
  customTotal: number;
  customPassed: number;
} {
  let originalTotal = 0;
  let originalPassed = 0;
  let customTotal = 0;
  let customPassed = 0;
  for (const c of cases) {
    if (c.isOriginal) {
      originalTotal += 1;
      if (c.verdict === "AC") originalPassed += 1;
    } else {
      customTotal += 1;
      if (c.verdict === "AC") customPassed += 1;
    }
  }
  return { originalTotal, originalPassed, customTotal, customPassed };
}

export class NodeRunnerEngine implements RunnerEngine {
  readonly engineId = "node-runner-v2";

  private readonly probeToolchainsImpl: () => Promise<ToolchainProbe[]>;
  private readonly probeSingleImpl: (lang: ConcreteLanguage) => Promise<ToolchainProbe>;
  private readonly sandboxRunner: (opts: SandboxRunOptions) => Promise<SandboxRunResult>;
  private readonly maxOutputBytes: number;
  private readonly compileTimeoutMs: number;
  private readonly probeCache = new Map<ConcreteLanguage, ToolchainProbe>();

  constructor(options: NodeRunnerEngineOptions = {}) {
    this.probeToolchainsImpl = options.probeToolchainsImpl ?? (() => probeAllToolchains());
    this.probeSingleImpl = options.probeSingleImpl ?? ((lang) => probeSingleToolchain(lang));
    this.sandboxRunner = options.sandboxRunner ?? runSandboxedProcess;
    this.maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
    this.compileTimeoutMs = options.compileTimeoutMs ?? 20_000;
  }

  async probeToolchains(): Promise<ToolchainProbe[]> {
    const probes = await this.probeToolchainsImpl();
    for (const p of probes) {
      this.probeCache.set(p.language, p);
    }
    return probes;
  }

  private async getToolchain(language: ConcreteLanguage): Promise<ToolchainProbe> {
    const cached = this.probeCache.get(language);
    if (cached && cached.available) {
      return cached;
    }
    const probe = await this.probeSingleImpl(language);
    this.probeCache.set(language, probe);
    return probe;
  }

  async runSamples(request: RunnerRequest): Promise<LocalRunResult> {
    const nowIso = new Date().toISOString();
    const isLeetCodeMode = request.problem.ioMode === "function";
    const mode: "stdio" | "leetcode_harness" = isLeetCodeMode ? "leetcode_harness" : "stdio";

    if (request.language === "generic") {
      const msg = "Language 'generic' cannot be executed locally. Choose python, cpp, c, rust, or java.";
      const cases = buildSkippedOrCompileErrorCases(request, "SKIPPED", msg);
      const counts = summarizeCounts(cases);
      return {
        schemaVersion: "local-run/v2",
        source: "local_runner",
        problemKey: request.problem.problemKey,
        language: request.language,
        mode,
        codeHash: this.hashContent(request.sourceCode, request.language, [], mode),
        compileOk: false,
        compileStderr: msg,
        skippedReason: "unsupported_language",
        allPassed: false,
        ...counts,
        cases,
        memoryNote: MEMORY_NOTE,
        timestamp: nowIso
      };
    }

    const language: ConcreteLanguage = request.language;
    let effectiveSource = request.sourceCode;

    if (mode === "leetcode_harness") {
      const harness = generateLeetCodeHarness({
        meta: request.problem.functionMeta,
        language,
        studentSource: request.sourceCode
      });
      if (!harness.supported || !harness.driverSource) {
        const reason =
          harness.reason ??
          "Automatic LeetCode Function-Harness is not supported for this problem.";
        const cases = buildSkippedOrCompileErrorCases(request, "SKIPPED", reason);
        const counts = summarizeCounts(cases);
        return {
          schemaVersion: "local-run/v2",
          source: "local_runner",
          problemKey: request.problem.problemKey,
          language,
          mode,
          codeHash: this.hashContent(request.sourceCode, language, [], mode),
          compileOk: false,
          compileStderr: reason,
          skippedReason: "unsupported_harness",
          allPassed: false,
          ...counts,
          cases,
          memoryNote: MEMORY_NOTE,
          timestamp: nowIso
        };
      }
      effectiveSource = harness.driverSource;
    }

    const flags = DEFAULT_COMPILE_FLAGS[language];
    const codeHash = this.hashContent(effectiveSource, language, flags, mode);
    const probe = await this.getToolchain(language);

    if (!probe.available || !probe.command) {
      const msg = `Toolchain for ${language} is not available. ${probe.installHint}`;
      const cases = buildSkippedOrCompileErrorCases(request, "SKIPPED", msg);
      const counts = summarizeCounts(cases);
      return {
        schemaVersion: "local-run/v2",
        source: "local_runner",
        problemKey: request.problem.problemKey,
        language,
        mode,
        codeHash,
        compileOk: false,
        compileStderr: msg,
        skippedReason: "missing_toolchain",
        allPassed: false,
        ...counts,
        cases,
        memoryNote: MEMORY_NOTE,
        timestamp: nowIso
      };
    }

    await mkdir(request.cacheDir, { recursive: true });

    // Prepare / compile artifact keyed by sha256(source + flags) to reuse cache and avoid Windows Defender locks
    const prepared = await this.prepareExecutable({
      language,
      probe,
      effectiveSource,
      flags,
      codeHash,
      cacheDir: request.cacheDir,
      signal: request.signal
    });

    if (!prepared.ok) {
      const cases = buildSkippedOrCompileErrorCases(request, "CE", prepared.compileStderr);
      const counts = summarizeCounts(cases);
      return {
        schemaVersion: "local-run/v2",
        source: "local_runner",
        problemKey: request.problem.problemKey,
        language,
        mode,
        codeHash,
        compileOk: false,
        compileStderr: prepared.compileStderr,
        compileTimeMs: prepared.compileTimeMs,
        allPassed: false,
        ...counts,
        cases,
        memoryNote: MEMORY_NOTE,
        timestamp: nowIso
      };
    }

    const timeoutMs = request.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const normReturn =
      mode === "leetcode_harness" && request.problem.functionMeta?.returnType
        ? normalizeLeetCodeType(request.problem.functionMeta.returnType)
        : null;
    const isFloatReturn = normReturn === "double" || normReturn === "double[]";
    const diffMode: DiffMode = request.diffMode ?? (isFloatReturn ? "float-epsilon" : "token");
    const floatEpsilon =
      request.floatEpsilon ?? (diffMode === "float-epsilon" && isFloatReturn ? 1e-5 : undefined);
    const cases: SampleCaseResult[] = [];

    for (const sample of request.samples) {
      if (request.signal?.aborted) {
        cases.push({
          id: sample.id,
          isOriginal: sample.isOriginal,
          verdict: "SKIPPED",
          durationMs: 0,
          input: sample.input,
          ...(sample.expectedOutput !== undefined ? { expected: sample.expectedOutput } : {}),
          actual: "",
          stderr: "",
          diffSummary: "Run cancelled."
        });
        continue;
      }

      const runRes = await this.sandboxRunner({
        command: prepared.execCommand,
        args: prepared.execArgs,
        cwd: prepared.execCwd,
        stdin: sample.input.endsWith("\n") ? sample.input : `${sample.input}\n`,
        timeoutMs,
        maxOutputBytes: this.maxOutputBytes,
        injectPythonUtf8: language === "python",
        ...(prepared.execEnv ? { env: prepared.execEnv } : {}),
        signal: request.signal
      });

      const caseResult = this.evaluateSampleResult(
        sample,
        runRes,
        diffMode,
        floatEpsilon,
        mode === "leetcode_harness"
      );
      cases.push(caseResult);
    }

    const counts = summarizeCounts(cases);
    const allPassed = cases.length > 0 && cases.every((c) => c.verdict === "AC");

    return {
      schemaVersion: "local-run/v2",
      source: "local_runner",
      problemKey: request.problem.problemKey,
      language,
      mode,
      codeHash,
      compileOk: true,
      compileTimeMs: prepared.compileTimeMs,
      allPassed,
      ...counts,
      cases,
      memoryNote: MEMORY_NOTE,
      timestamp: nowIso
    };
  }

  private hashContent(
    source: string,
    language: string,
    flags: string[],
    mode: string
  ): string {
    return createHash("sha256")
      .update(`${language}\0${mode}\0${flags.join(" ")}\0${source}`)
      .digest("hex")
      .slice(0, 24);
  }

  private async prepareExecutable(opts: {
    language: ConcreteLanguage;
    probe: ToolchainProbe;
    effectiveSource: string;
    flags: string[];
    codeHash: string;
    cacheDir: string;
    signal?: AbortSignal;
  }): Promise<
    | {
        ok: true;
        execCommand: string;
        execArgs: string[];
        execCwd: string;
        execEnv?: Record<string, string | undefined>;
        compileTimeMs: number;
      }
    | {
        ok: false;
        compileStderr: string;
        compileTimeMs: number;
      }
  > {
    const { language, probe, effectiveSource, flags, codeHash, cacheDir, signal } = opts;
    const exeSuffix = process.platform === "win32" ? ".exe" : "";
    const toolchainEnv = buildToolchainPathEnv(probe.command!);

    if (language === "python") {
      const scriptPath = join(cacheDir, `${codeHash}.py`);
      if (!(await fileExists(scriptPath))) {
        await writeFile(scriptPath, effectiveSource, "utf8");
      }
      const spec = splitCommandSpec(probe.command!);
      return {
        ok: true,
        execCommand: spec.bin,
        execArgs: [...spec.prefixArgs, scriptPath],
        execCwd: cacheDir,
        compileTimeMs: 0
      };
    }

    if (language === "java") {
      const className = detectJavaClassName(effectiveSource);
      const classDir = join(cacheDir, `java-${codeHash}`);
      const classFile = join(classDir, `${className}.class`);
      const javaCmd =
        probe.command!.includes("/") || probe.command!.includes("\\")
          ? join(dirname(probe.command!), process.platform === "win32" ? "java.exe" : "java")
          : "java";
      if (await fileExists(classFile)) {
        return {
          ok: true,
          execCommand: javaCmd,
          execArgs: ["-cp", classDir, className],
          execCwd: classDir,
          ...(toolchainEnv ? { execEnv: toolchainEnv } : {}),
          compileTimeMs: 0
        };
      }
      await mkdir(classDir, { recursive: true });
      const srcFile = join(classDir, `${className}.java`);
      await writeFile(srcFile, effectiveSource, "utf8");

      const compileRes = await this.sandboxRunner({
        command: probe.command!,
        args: [...flags, "-d", classDir, srcFile],
        cwd: classDir,
        timeoutMs: this.compileTimeoutMs,
        maxOutputBytes: this.maxOutputBytes,
        ...(toolchainEnv ? { env: toolchainEnv } : {}),
        signal
      });
      if (compileRes.exitCode !== 0 || compileRes.spawnError || compileRes.timedOut) {
        return {
          ok: false,
          compileStderr:
            compileRes.stderr ||
            compileRes.stdout ||
            compileRes.spawnError ||
            (compileRes.timedOut ? "Compilation timed out." : "Compilation failed."),
          compileTimeMs: compileRes.durationMs
        };
      }
      return {
        ok: true,
        execCommand: javaCmd,
        execArgs: ["-cp", classDir, className],
        execCwd: classDir,
        ...(toolchainEnv ? { execEnv: toolchainEnv } : {}),
        compileTimeMs: compileRes.durationMs
      };
    }

    // Native compiled languages: cpp, c, rust
    const ext = language === "cpp" ? "cpp" : language === "c" ? "c" : "rs";
    const srcPath = join(cacheDir, `${codeHash}.${ext}`);
    const binPath = join(cacheDir, `${codeHash}${exeSuffix}`);

    // Reuse hash-keyed binary directly when cached (also avoids overwriting active Windows Defender locks)
    if (await fileExists(binPath)) {
      return {
        ok: true,
        execCommand: binPath,
        execArgs: [],
        execCwd: cacheDir,
        ...(toolchainEnv ? { execEnv: toolchainEnv } : {}),
        compileTimeMs: 0
      };
    }

    await writeFile(srcPath, effectiveSource, "utf8");
    const compileArgs =
      language === "c" && process.platform !== "win32"
        ? [...flags, srcPath, "-o", binPath, "-lm"]
        : [...flags, srcPath, "-o", binPath];

    const compileRes = await this.sandboxRunner({
      command: probe.command!,
      args: compileArgs,
      cwd: cacheDir,
      timeoutMs: this.compileTimeoutMs,
      maxOutputBytes: this.maxOutputBytes,
      ...(toolchainEnv ? { env: toolchainEnv } : {}),
      signal
    });

    if (compileRes.exitCode !== 0 || compileRes.spawnError || compileRes.timedOut) {
      return {
        ok: false,
        compileStderr:
          compileRes.stderr ||
          compileRes.stdout ||
          compileRes.spawnError ||
          (compileRes.timedOut ? "Compilation timed out." : "Compilation failed."),
        compileTimeMs: compileRes.durationMs
      };
    }

    return {
      ok: true,
      execCommand: binPath,
      execArgs: [],
      execCwd: cacheDir,
      ...(toolchainEnv ? { execEnv: toolchainEnv } : {}),
      compileTimeMs: compileRes.durationMs
    };
  }

  private evaluateSampleResult(
    sample: RunnerRequest["samples"][number],
    runRes: SandboxRunResult,
    diffMode: NonNullable<RunnerRequest["diffMode"]>,
    floatEpsilon?: number,
    normalizeJson = false
  ): SampleCaseResult {
    const base = {
      id: sample.id,
      isOriginal: sample.isOriginal,
      durationMs: runRes.durationMs,
      input: sample.input,
      ...(sample.expectedOutput !== undefined ? { expected: sample.expectedOutput } : {}),
      actual: runRes.stdout,
      stderr: runRes.stderr
    };

    if (runRes.aborted) {
      return { ...base, verdict: "SKIPPED", diffSummary: "Execution aborted." };
    }
    if (runRes.outputLimitExceeded) {
      return {
        ...base,
        verdict: "OLE",
        diffSummary: `Output limit exceeded (> ${Math.round(this.maxOutputBytes / 1024)} KiB); process terminated.`
      };
    }
    if (runRes.timedOut) {
      return {
        ...base,
        verdict: "TLE",
        diffSummary: `Time limit exceeded (${runRes.durationMs} ms); process tree terminated.`
      };
    }
    if (runRes.spawnError || runRes.exitCode !== 0) {
      const detail = runRes.spawnError
        ? `Process spawn error: ${runRes.spawnError}`
        : `Exited with code ${String(runRes.exitCode)}${runRes.signal ? ` (signal ${runRes.signal})` : ""}`;
      return {
        ...base,
        verdict: "RE",
        diffSummary: detail
      };
    }

    if (sample.expectedOutput === undefined) {
      return {
        ...base,
        verdict: "SKIPPED",
        diffSummary: "No expected output provided (run-only mode)."
      };
    }

    const diff = compareOutput(runRes.stdout, sample.expectedOutput, {
      mode: diffMode,
      floatEpsilon,
      normalizeJson
    });
    if (diff.passed) {
      return { ...base, verdict: "AC" };
    }
    return {
      ...base,
      verdict: "WA",
      ...(diff.diffSummary ? { diffSummary: diff.diffSummary } : {})
    };
  }
}
