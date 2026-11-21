import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProblemDocument } from "../../src/core/contracts";
import {
  NodeRunnerEngine,
  probeAllToolchains,
  probeSingleToolchain,
  type CommandProber,
  type SandboxRunOptions,
  type SandboxRunResult
} from "../../src/runner";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
});

function makeStdioProblem(): ProblemDocument {
  return {
    schemaVersion: "problem-doc/v2",
    problemKey: "luogu:P1001",
    source: "luogu",
    sourceId: "P1001",
    title: "A+B Problem",
    locale: "zh-CN",
    completeness: "full",
    ioMode: "stdio",
    samples: [],
    rawTags: [],
    provenance: { ingestChannel: "builtin-adapter", fetchedAt: new Date().toISOString() }
  };
}

describe("toolchains (Toolchain Doctor)", () => {
  it("on Windows skips broken python3 Store stub and picks working python or py -3", async () => {
    const prober: CommandProber = async (bin, args) => {
      if (bin === "python") {
        return { ok: false, stdout: "", stderr: "not found" };
      }
      if (bin === "py" && args[0] === "-3") {
        return { ok: true, stdout: "Python 3.12.4\n", stderr: "" };
      }
      return { ok: false, stdout: "", stderr: "" };
    };

    const probe = await probeSingleToolchain("python", { platform: "win32", prober });
    expect(probe.available).toBe(true);
    expect(probe.command).toBe("py -3");
    expect(probe.version).toContain("Python 3.12");
  });

  it("requires both javac and java for Java availability and returns helpful install hints", async () => {
    const jreOnlyProber: CommandProber = async (bin) => {
      if (bin === "java") return { ok: true, stdout: "", stderr: 'openjdk version "21.0.1"' };
      return { ok: false, stdout: "", stderr: "javac not found" };
    };
    const javaProbe = await probeSingleToolchain("java", { platform: "win32", prober: jreOnlyProber });
    expect(javaProbe.available).toBe(false);
    expect(javaProbe.installHint).toContain("JDK");
  });

  it("probes real local machine toolchains cleanly", async () => {
    const probes = await probeAllToolchains();
    expect(probes.map((p) => p.language)).toEqual(["python", "cpp", "c", "rust", "java"]);
    const py = probes.find((p) => p.language === "python");
    expect(py?.available).toBe(true);
    expect(py?.version).toMatch(/Python 3\./i);
  });
});

describe("NodeRunnerEngine (real Python execution + sandbox + cache)", () => {
  it("runs ACM stdio samples, separates original vs custom counts, and enforces PYTHONUTF8=1", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "algo-coach-run-"));
    tempDirs.push(cacheDir);

    const engine = new NodeRunnerEngine();
    const res = await engine.runSamples({
      problem: makeStdioProblem(),
      language: "python",
      sourceCode: `
import sys
line = sys.stdin.read().strip()
if line == "unicode":
    print("你好算法")
else:
    a, b = map(int, line.split())
    print(a + b)
`,
      samples: [
        { id: "orig-1", input: "1 2", expectedOutput: "3", isOriginal: true },
        { id: "orig-2", input: "10 20", expectedOutput: "30", isOriginal: true },
        { id: "cust-1", input: "unicode", expectedOutput: "你好算法", isOriginal: false },
        { id: "cust-2", input: "5 5", expectedOutput: "999", isOriginal: false }
      ],
      cacheDir
    });

    expect(res.schemaVersion).toBe("local-run/v2");
    expect(res.source).toBe("local_runner");
    expect(res.mode).toBe("stdio");
    expect(res.compileOk).toBe(true);
    expect(res.originalTotal).toBe(2);
    expect(res.originalPassed).toBe(2);
    expect(res.customTotal).toBe(2);
    expect(res.customPassed).toBe(1);
    expect(res.allPassed).toBe(false);
    expect(res.cases[2]?.verdict).toBe("AC");
    expect(res.cases[3]?.verdict).toBe("WA");
    expect(res.cases[3]?.diffSummary).toContain("999");
  });

  it("terminates runaway infinite loop with TLE and excessive output with OLE", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "algo-coach-sandbox-"));
    tempDirs.push(cacheDir);

    const engine = new NodeRunnerEngine({ maxOutputBytes: 4096 });

    // TLE test
    const tleRes = await engine.runSamples({
      problem: makeStdioProblem(),
      language: "python",
      sourceCode: "while True:\n    pass\n",
      samples: [{ id: "s1", input: "", expectedOutput: "ok", isOriginal: true }],
      timeoutMs: 300,
      cacheDir
    });
    expect(tleRes.cases[0]?.verdict).toBe("TLE");

    // OLE test (> 4 KiB output triggers hard cap & termination)
    const oleRes = await engine.runSamples({
      problem: makeStdioProblem(),
      language: "python",
      sourceCode: 'while True:\n    print("A" * 512, flush=True)\n',
      samples: [{ id: "s1", input: "", expectedOutput: "ok", isOriginal: true }],
      timeoutMs: 3000,
      cacheDir
    });
    expect(oleRes.cases[0]?.verdict).toBe("OLE");
    expect(Buffer.byteLength(oleRes.cases[0]?.actual ?? "", "utf8")).toBeLessThanOrEqual(4096);

    // RE test
    const reRes = await engine.runSamples({
      problem: makeStdioProblem(),
      language: "python",
      sourceCode: "raise RuntimeError('boom')\n",
      samples: [{ id: "s1", input: "", expectedOutput: "ok", isOriginal: true }],
      cacheDir
    });
    expect(reRes.cases[0]?.verdict).toBe("RE");
    expect(reRes.cases[0]?.stderr).toContain("RuntimeError: boom");
  });

  it("runs LeetCode function-harness end-to-end with clean user Solution code", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "algo-coach-lc-run-"));
    tempDirs.push(cacheDir);

    const lcProblem: ProblemDocument = {
      schemaVersion: "problem-doc/v2",
      problemKey: "lc-cn:two-sum",
      source: "leetcode-cn",
      sourceId: "two-sum",
      title: "两数之和",
      locale: "zh-CN",
      completeness: "full",
      ioMode: "function",
      samples: [],
      functionMeta: {
        entryName: "twoSum",
        params: [
          { name: "nums", type: "integer[]" },
          { name: "target", type: "integer" }
        ],
        returnType: "integer[]",
        codeSnippets: {}
      },
      rawTags: ["array"],
      provenance: { ingestChannel: "builtin-adapter", fetchedAt: new Date().toISOString() }
    };

    const engine = new NodeRunnerEngine();
    const res = await engine.runSamples({
      problem: lcProblem,
      language: "python",
      sourceCode: `class Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:\n        m = {}\n        for i, x in enumerate(nums):\n            if target - x in m:\n                return [m[target - x], i]\n            m[x] = i\n        return []\n`,
      samples: [
        { id: "s1", input: "[2,7,11,15]\n9", expectedOutput: "[0,1]", isOriginal: true },
        { id: "s2", input: "[3,2,4]\n6", expectedOutput: "[1,2]", isOriginal: true }
      ],
      cacheDir
    });

    expect(res.mode).toBe("leetcode_harness");
    expect(res.compileOk).toBe(true);
    expect(res.allPassed).toBe(true);
    expect(res.originalPassed).toBe(2);
  });

  it("caches compiled binaries by sha256(source+flags) so identical runs skip recompilation", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "algo-coach-cache-"));
    tempDirs.push(cacheDir);

    let compileCalls = 0;
    const mockSandbox = vi.fn(async (opts: SandboxRunOptions): Promise<SandboxRunResult> => {
      if (opts.command === "g++") {
        compileCalls += 1;
        // Write fake compiled artifact at `-o <binPath>`
        const outIdx = (opts.args ?? []).indexOf("-o");
        const outPath = opts.args?.[outIdx + 1];
        if (outPath) {
          await writeFile(outPath, "fake-binary", "utf8");
        }
        return {
          exitCode: 0,
          signal: null,
          stdout: "",
          stderr: "",
          durationMs: 42,
          timedOut: false,
          outputLimitExceeded: false,
          aborted: false
        };
      }
      return {
        exitCode: 0,
        signal: null,
        stdout: "3\n",
        stderr: "",
        durationMs: 5,
        timedOut: false,
        outputLimitExceeded: false,
        aborted: false
      };
    });

    const engine = new NodeRunnerEngine({
      probeSingleImpl: async () => ({
        language: "cpp",
        available: true,
        command: "g++",
        version: "g++ 13.2.0",
        installHint: ""
      }),
      sandboxRunner: mockSandbox
    });

    const req = {
      problem: makeStdioProblem(),
      language: "cpp" as const,
      sourceCode: "int main() { return 0; }\n",
      samples: [{ id: "s1", input: "1 2", expectedOutput: "3", isOriginal: true }],
      cacheDir
    };

    const run1 = await engine.runSamples(req);
    const run2 = await engine.runSamples(req);

    expect(run1.allPassed).toBe(true);
    expect(run2.allPassed).toBe(true);
    expect(run1.codeHash).toBe(run2.codeHash);
    expect(compileCalls).toBe(1);
    expect(run2.compileTimeMs).toBe(0);
  });

  it("degrades honestly on unsupported LeetCode design classes and missing toolchains", async () => {
    const cacheDir = await mkdtemp(join(tmpdir(), "algo-coach-degrade-"));
    tempDirs.push(cacheDir);

    const engine = new NodeRunnerEngine({
      probeSingleImpl: async (lang) => ({
        language: lang,
        available: false,
        installHint: `Install ${lang} compiler`
      })
    });

    const missingToolRes = await engine.runSamples({
      problem: makeStdioProblem(),
      language: "rust",
      sourceCode: "fn main() {}",
      samples: [{ id: "s1", input: "", expectedOutput: "", isOriginal: true }],
      cacheDir
    });
    expect(missingToolRes.compileOk).toBe(false);
    expect(missingToolRes.compileStderr).toContain("Install rust compiler");
    expect(missingToolRes.cases[0]?.verdict).toBe("CE");

    const designProblem: ProblemDocument = {
      ...makeStdioProblem(),
      problemKey: "lc-global:lru-cache",
      source: "leetcode-global",
      sourceId: "lru-cache",
      ioMode: "function",
      functionMeta: {
        entryName: "class:LRUCache",
        params: [],
        returnType: "void",
        codeSnippets: {}
      }
    };
    const designRes = await engine.runSamples({
      problem: designProblem,
      language: "python",
      sourceCode: "class LRUCache:\n    pass\n",
      samples: [{ id: "s1", input: "", expectedOutput: "", isOriginal: true }],
      cacheDir
    });
    expect(designRes.mode).toBe("leetcode_harness");
    expect(designRes.compileOk).toBe(false);
    expect(designRes.compileStderr).toContain("Class-design");
    expect(designRes.cases[0]?.verdict).toBe("SKIPPED");
  });
});
