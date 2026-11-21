import { spawn } from "node:child_process";
import type { SupportedLanguage, ToolchainProbe } from "../core/contracts";

export type ConcreteLanguage = Exclude<SupportedLanguage, "generic">;

export interface CommandSpec {
  bin: string;
  prefixArgs: string[];
  displayCommand: string;
}

export interface ProbeCommandResult {
  ok: boolean;
  stdout: string;
  stderr: string;
}

export type CommandProber = (
  bin: string,
  args: string[],
  timeoutMs: number
) => Promise<ProbeCommandResult>;

const ALL_LANGUAGES: ConcreteLanguage[] = ["python", "cpp", "c", "rust", "java"];

export function splitCommandSpec(command: string): CommandSpec {
  const parts = command.trim().split(/\s+/).filter(Boolean);
  const bin = parts[0] ?? command.trim();
  const prefixArgs = parts.slice(1);
  return { bin, prefixArgs, displayCommand: command.trim() };
}

function getInstallHint(language: ConcreteLanguage, platform: NodeJS.Platform): string {
  if (platform === "win32") {
    switch (language) {
      case "python":
        return "Install Python 3: winget install Python.Python.3.12 (or https://www.python.org/downloads/)";
      case "cpp":
        return "Install GCC/G++ (MinGW-w64): winget install BrechtSanders.WinLibs.POSIX.UCRT or MSYS2 (pacman -S mingw-w64-ucrt-x86_64-gcc)";
      case "c":
        return "Install GCC (MinGW-w64): winget install BrechtSanders.WinLibs.POSIX.UCRT or MSYS2";
      case "rust":
        return "Install Rust via rustup: winget install Rustlang.Rustup (or https://rustup.rs)";
      case "java":
        return "Install JDK 21: winget install EclipseAdoptium.Temurin.21.JDK";
    }
  }

  if (platform === "darwin") {
    switch (language) {
      case "python":
        return "Install Python 3: brew install python";
      case "cpp":
        return "Install Xcode Command Line Tools (clang++): xcode-select --install";
      case "c":
        return "Install Xcode Command Line Tools (clang): xcode-select --install";
      case "rust":
        return "Install Rust via rustup: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh";
      case "java":
        return "Install OpenJDK: brew install openjdk";
    }
  }

  switch (language) {
    case "python":
      return "Install Python 3: sudo apt install python3";
    case "cpp":
      return "Install G++: sudo apt install g++";
    case "c":
      return "Install GCC: sudo apt install gcc";
    case "rust":
      return "Install Rust via rustup: curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh";
    case "java":
      return "Install JDK: sudo apt install default-jdk";
  }
}

export async function defaultCommandProber(
  bin: string,
  args: string[],
  timeoutMs: number
): Promise<ProbeCommandResult> {
  return new Promise<ProbeCommandResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let settled = false;

    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok, stdout, stderr });
    };

    let child;
    try {
      child = spawn(bin, args, {
        shell: false,
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"]
      });
    } catch {
      resolve({ ok: false, stdout: "", stderr: "" });
      return;
    }

    const timer = setTimeout(() => {
      try {
        child.kill();
      } catch {
        // ignore
      }
      finish(false);
    }, timeoutMs);

    child.stdout?.on("data", (chunk: Buffer) => {
      if (stdout.length < 4096) {
        stdout += chunk.toString("utf8");
      }
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      if (stderr.length < 4096) {
        stderr += chunk.toString("utf8");
      }
    });
    child.on("error", () => finish(false));
    child.on("close", (code) => finish(code === 0));
  });
}

function firstNonEmptyLine(text: string): string | undefined {
  return text
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0);
}

export async function probeSingleToolchain(
  language: ConcreteLanguage,
  options?: {
    platform?: NodeJS.Platform;
    prober?: CommandProber;
    timeoutMs?: number;
  }
): Promise<ToolchainProbe> {
  const platform = options?.platform ?? process.platform;
  const prober = options?.prober ?? defaultCommandProber;
  const timeoutMs = options?.timeoutMs ?? 3000;
  const installHint = getInstallHint(language, platform);

  if (language === "python") {
    // On Windows, prefer `python` and `py -3` BEFORE `python3` to avoid Microsoft Store alias stubs.
    const candidates = platform === "win32" ? ["python", "py -3", "python3"] : ["python3", "python"];
    for (const candidate of candidates) {
      const spec = splitCommandSpec(candidate);
      const res = await prober(spec.bin, [...spec.prefixArgs, "--version"], timeoutMs);
      const combined = `${res.stdout}\n${res.stderr}`;
      if (res.ok && /Python\s+\d+\.\d+/i.test(combined)) {
        return {
          language,
          available: true,
          command: spec.displayCommand,
          version: firstNonEmptyLine(combined),
          installHint
        };
      }
    }
    return { language, available: false, installHint };
  }

  if (language === "cpp") {
    for (const candidate of ["g++", "clang++"]) {
      const res = await prober(candidate, ["--version"], timeoutMs);
      const combined = `${res.stdout}\n${res.stderr}`;
      if (res.ok && firstNonEmptyLine(combined)) {
        return {
          language,
          available: true,
          command: candidate,
          version: firstNonEmptyLine(combined),
          installHint
        };
      }
    }
    return { language, available: false, installHint };
  }

  if (language === "c") {
    for (const candidate of ["gcc", "clang"]) {
      const res = await prober(candidate, ["--version"], timeoutMs);
      const combined = `${res.stdout}\n${res.stderr}`;
      if (res.ok && firstNonEmptyLine(combined)) {
        return {
          language,
          available: true,
          command: candidate,
          version: firstNonEmptyLine(combined),
          installHint
        };
      }
    }
    return { language, available: false, installHint };
  }

  if (language === "rust") {
    const res = await prober("rustc", ["--version"], timeoutMs);
    const combined = `${res.stdout}\n${res.stderr}`;
    if (res.ok && /rustc\s+\d+/i.test(combined)) {
      return {
        language,
        available: true,
        command: "rustc",
        version: firstNonEmptyLine(combined),
        installHint
      };
    }
    return { language, available: false, installHint };
  }

  // java requires both javac (compiler) and java (runtime)
  const [javacRes, javaRes] = await Promise.all([
    prober("javac", ["-version"], timeoutMs),
    prober("java", ["-version"], timeoutMs)
  ]);
  const javacLine = firstNonEmptyLine(`${javacRes.stdout}\n${javacRes.stderr}`);
  if (javacRes.ok && javaRes.ok && javacLine) {
    return {
      language: "java",
      available: true,
      command: "javac",
      version: javacLine,
      installHint
    };
  }
  return { language: "java", available: false, installHint };
}

export async function probeAllToolchains(options?: {
  platform?: NodeJS.Platform;
  prober?: CommandProber;
  timeoutMs?: number;
}): Promise<ToolchainProbe[]> {
  return Promise.all(ALL_LANGUAGES.map((lang) => probeSingleToolchain(lang, options)));
}
