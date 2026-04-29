import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

export interface ProgramRunResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

export interface PythonCommand {
  command: string;
  args: string[];
}

export function buildPythonCommand(scriptPath: string, platform: NodeJS.Platform = process.platform): PythonCommand {
  if (platform === "win32") {
    return {
      command: "py",
      args: ["-3", scriptPath]
    };
  }

  return {
    command: "python3",
    args: [scriptPath]
  };
}

export function normalizeProgramOutput(text: string): string {
  return text.replace(/\r\n/g, "\n").trim();
}

export async function runPythonCode(code: string, input: string, timeoutMs = 2_000): Promise<ProgramRunResult> {
  const dir = await mkdtemp(join(tmpdir(), "student-practice-"));
  const scriptPath = join(dir, "main.py");

  try {
    await writeFile(scriptPath, code, "utf8");
    const command = buildPythonCommand(scriptPath);

    return await runProcess(command.command, command.args, input, timeoutMs);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function runProcess(command: string, args: string[], input: string, timeoutMs: number): Promise<ProgramRunResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    let settled = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({
        exitCode: 1,
        stdout,
        stderr: `${stderr}${error.message}`,
        timedOut
      });
    });
    child.on("close", (exitCode) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ exitCode, stdout, stderr, timedOut });
    });
    child.stdin.end(input);
  });
}
