import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, test } from "vitest";
import { runDemoSubmission } from "../prototypes/oj-console/backend/demoSubmission";
import { startOjConsoleServer, type OjConsoleServer } from "../prototypes/oj-console/backend/server";

const execFileAsync = promisify(execFile);
const servers: OjConsoleServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("OJ console PowerShell client", () => {
  test("runs a complete confirmed demo submission against the local backend", async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), "oj-console-powershell-"));
    const server = await startOjConsoleServer({
      runtimeRoot,
      port: 0,
      output: () => undefined,
      api: {
        checkTool: async () => ({ available: false, message: "not installed" }),
        runDemo: (input) => runDemoSubmission({ ...input, sleep: async () => undefined })
      }
    });
    servers.push(server);

    const scriptPath = path.resolve("prototypes/oj-console/scripts/try-backend.ps1");
    const sourcePath = path.resolve("prototypes/oj-console/examples/demo-source.cpp");
    const result = await execFileAsync("powershell.exe", [
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-File",
      scriptPath,
      "-RuntimeDescriptorPath",
      server.descriptorPath,
      "-SourcePath",
      sourcePath,
      "-ProblemUrl",
      "https://codeforces.com/contest/4/problem/A",
      "-Scenario",
      "accepted",
      "-Yes"
    ], { cwd: process.cwd(), timeout: 20_000, windowsHide: true });

    expect(result.stdout).toContain("[preview]");
    expect(result.stdout).toContain("mode=demo");
    expect(result.stdout).toMatch(/digest=[a-f0-9]{12}/);
    expect(result.stdout).toContain("state=accepted");
    expect(result.stdout).toContain("verdict=AC");
  });

  test("rejects a runtime descriptor that could send source bytes away from localhost", async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), "oj-console-descriptor-"));
    const descriptorPath = path.join(runtimeRoot, "server.json");
    await writeFile(descriptorPath, JSON.stringify({
      baseUrl: "https://localhost",
      token: "a".repeat(64)
    }), "utf8");
    const scriptPath = path.resolve("prototypes/oj-console/scripts/try-backend.ps1");
    const sourcePath = path.resolve("prototypes/oj-console/examples/demo-source.cpp");

    let failure: unknown;
    try {
      await execFileAsync("powershell.exe", [
        "-NoProfile",
        "-ExecutionPolicy",
        "Bypass",
        "-File",
        scriptPath,
        "-RuntimeDescriptorPath",
        descriptorPath,
        "-SourcePath",
        sourcePath,
        "-Yes"
      ], { cwd: process.cwd(), timeout: 20_000, windowsHide: true });
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ code: 1 });
    const stderr = String((failure as { stderr?: string }).stderr ?? "").replace(/\s+/g, " ");
    expect(stderr).toContain("Runtime descriptor must point to http://127.0.0.1");
  });
});
