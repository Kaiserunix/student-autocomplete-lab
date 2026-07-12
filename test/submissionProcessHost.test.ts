import { describe, expect, test } from "vitest";
import { runBoundedProcess } from "../src/submission/processHost";

describe("submission process host", () => {
  test("passes arguments without shell expansion", async () => {
    const marker = "student.cpp & echo injected";
    const result = await runBoundedProcess(
      process.execPath,
      ["-e", "process.stdout.write(process.argv[1])", marker],
      { timeoutMs: 2_000 }
    );

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toBe(marker);
    expect(result.stderr).toBe("");
    expect(result.timedOut).toBe(false);
  });

  test("bounds captured output", async () => {
    const result = await runBoundedProcess(
      process.execPath,
      ["-e", "process.stdout.write('abcdefghijklmnop')"],
      { timeoutMs: 2_000, maxOutputBytes: 8 }
    );

    expect(result.stdout).toBe("abcdefgh");
    expect(result.stdoutTruncated).toBe(true);
  });

  test("reports a missing executable without throwing", async () => {
    const result = await runBoundedProcess("student-autocomplete-missing-oj-command", [], { timeoutMs: 2_000 });

    expect(result.exitCode).toBeNull();
    expect(result.errorCode).toBe("ENOENT");
  });
});
