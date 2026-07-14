import { spawn } from "node:child_process";
import { OjConsoleError } from "./contracts";

export type TerminalLauncher = (
  command: string,
  args: string[],
  options: { detached: boolean; stdio: "ignore"; windowsHide: boolean }
) => { unref(): void };

export interface LoginTerminalOptions {
  platform?: NodeJS.Platform;
  launcher?: TerminalLauncher;
}

export function openCodeforcesLoginTerminal(options: LoginTerminalOptions = {}): void {
  const platform = options.platform ?? process.platform;
  if (platform !== "win32") {
    throw new OjConsoleError("login_terminal_unavailable", "可见登录终端当前仅支持 Windows。", 501);
  }
  const launcher = options.launcher ?? (spawn as unknown as TerminalLauncher);
  const child = launcher(
    "powershell.exe",
    ["-NoExit", "-Command", "oj login https://codeforces.com/"],
    { detached: true, stdio: "ignore", windowsHide: false }
  );
  child.unref();
}
