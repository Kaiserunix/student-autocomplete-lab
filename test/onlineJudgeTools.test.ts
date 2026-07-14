import { describe, expect, test } from "vitest";
import {
  buildOjAvailabilityCommand,
  buildOjSubmitCommand,
  checkOnlineJudgeTools,
  parseOjSubmitOutput,
  submitWithOnlineJudgeTools
} from "../src/submission/onlineJudgeTools";
import type { ProcessRunner } from "../src/submission/processHost";

describe("online-judge-tools adapter", () => {
  test("builds fixed availability and non-interactive submit commands", () => {
    expect(buildOjAvailabilityCommand()).toEqual({ command: "oj", args: ["--version"] });
    expect(buildOjSubmitCommand("https://codeforces.com/contest/1200/problem/F", "C:/work/main.cpp")).toEqual({
      command: "oj",
      args: [
        "submit",
        "--yes",
        "--no-open",
        "--wait",
        "0",
        "https://codeforces.com/contest/1200/problem/F",
        "C:/work/main.cpp"
      ]
    });
  });

  test("does not expose source previews from oj output", () => {
    const parsed = parseOjSubmitOutput(
      0,
      [
        "[x] code (2341 byte):",
        "secret student source line",
        "[+] success: result: https://codeforces.com/contest/1200/my"
      ].join("\n")
    );

    expect(parsed).toEqual({
      status: "submitted",
      submissionUrl: "https://codeforces.com/contest/1200/my",
      message: "代码已提交到 Codeforces。"
    });
    expect(JSON.stringify(parsed)).not.toContain("secret student source line");
  });

  test("classifies login and generic failures without returning raw output", () => {
    expect(parseOjSubmitOutput(1, "You are not logged in.\nsecret source")).toEqual({
      status: "login_required",
      message: "Codeforces 登录已失效，请先重新登录。"
    });
    expect(parseOjSubmitOutput(1, "unexpected upstream body\nsecret source")).toEqual({
      status: "failed",
      message: "oj 未能确认提交成功；不会自动重试，请检查登录和题目链接。"
    });
  });

  test("uses an injected process runner for availability and submission", async () => {
    const calls: Array<{ command: string; args: string[] }> = [];
    const runner: ProcessRunner = async (command, args) => {
      calls.push({ command, args });
      return {
        exitCode: 0,
        stdout: calls.length === 1 ? "online-judge-tools 11.5.1" : "[+] success: result: https://codeforces.com/contest/1200/my",
        stderr: "",
        timedOut: false,
        stdoutTruncated: false,
        stderrTruncated: false
      };
    };

    await expect(checkOnlineJudgeTools(runner)).resolves.toMatchObject({ available: true, version: "11.5.1" });
    await expect(
      submitWithOnlineJudgeTools(
        "https://codeforces.com/contest/1200/problem/F",
        "C:/work/main.cpp",
        "C:/work",
        runner
      )
    ).resolves.toMatchObject({ status: "submitted" });
    expect(calls[1]).toEqual(buildOjSubmitCommand("https://codeforces.com/contest/1200/problem/F", "C:/work/main.cpp"));
  });
});
