import { createHash } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type {
  LocalRunResult,
  RunnerEngine,
  RunnerRequest,
  SampleCaseResult,
  SampleVerdict,
  ToolchainProbe
} from "../core/contracts";
import { compareOutput } from "./diffChecker";
import { generateLeetCodeHarness } from "./leetcodeHarness";
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

function detectJavaClassName(source: string): string {
  const match = source.match(/\bpublic\s+class\s+([A-Za-z_][A-Za-z0-9_]*)\b/);
  return match?.[1] ?? "Main";
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
    const isLeetCodeMode =
      request.problem.ioMode === "function" && Boolean(request.problem.functionMeta);
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
      const cases = buildSkippedOrCompileErrorCases(request, "CE", msg);
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
    const diffMode = request.diffMode ?? "token";
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
        signal: request.signal
      });

      const caseResult = this.evaluateSampleResult(sample, runRes, diffMode, request.floatEpsilon);
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
      if (await fileExists(classFile)) {
        return {
          ok: true,
          execCommand: "java",
          execArgs: ["-cp", classDir, className],
          execCwd: classDir,
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
        execCommand: "java",
        execArgs: ["-cp", classDir, className],
        execCwd: classDir,
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
        compileTimeMs: 0
      };
    }

    await writeFile(srcPath, effectiveSource, "utf8");
    const compileArgs =
      language === "rust"
        ? [...flags, srcPath, "-o", binPath]
        : [...flags, srcPath, "-o", binPath];

    const compileRes = await this.sandboxRunner({
      command: probe.command!,
      args: compileArgs,
      cwd: cacheDir,
      timeoutMs: this.compileTimeoutMs,
      maxOutputBytes: this.maxOutputBytes,
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
      compileTimeMs: compileRes.durationMs
    };
  }

  private evaluateSampleResult(
    sample: RunnerRequest["samples"][number],
    runRes: SandboxRunResult,
    diffMode: NonNullable<RunnerRequest["diffMode"]>,
    floatEpsilon?: number
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
      floatEpsilon
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
