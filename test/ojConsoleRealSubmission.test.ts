import { access, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";
import type { AtCoderTarget, CodeforcesTarget, SubmissionTarget } from "../src/submission/types";
import type { SourceRecord } from "../prototypes/oj-console/backend/contracts";
import {
  openCodeforcesLoginTerminal,
  openPlatformLoginTerminal
} from "../prototypes/oj-console/backend/loginTerminal";
import { runRealSubmission } from "../prototypes/oj-console/backend/realSubmission";
import { SubmissionJobStore } from "../prototypes/oj-console/backend/submissionJobs";

const source: SourceRecord = {
  metadata: {
    sourceId: "source-1",
    fileName: "main.cpp",
    language: "cpp",
    byteSize: 20,
    digest: "abcdef123456",
    expiresAt: new Date(600_000).toISOString()
  },
  bytes: Buffer.from("SECRET_SOURCE_MARKER"),
  contentDigest: "abcdef1234567890"
};

const target: CodeforcesTarget = {
  platform: "codeforces",
  contestKind: "contest",
  contestId: 4,
  problemIndex: "A",
  canonicalUrl: "https://codeforces.com/contest/4/problem/A"
};

const atCoderTarget: AtCoderTarget = {
  platform: "atcoder",
  contestId: "abc350",
  taskId: "abc350_a",
  canonicalUrl: "https://atcoder.jp/contests/abc350/tasks/abc350_a"
};

async function makeJob(handle?: string) {
  const runtimeRoot = await mkdtemp(path.join(tmpdir(), "oj-console-real-"));
  const jobs = new SubmissionJobStore({ createId: () => "job-1", now: () => 10_000 });
  const job = jobs.create({ mode: "real", source: source.metadata, target, codeforcesHandle: handle });
  return { runtimeRoot, jobs, job };
}

describe("OJ console real submission", () => {
  test("submits once, polls a public verdict, and always deletes temporary source", async () => {
    const { runtimeRoot, jobs, job } = await makeJob("tourist");
    const submit = vi.fn(async (_target: SubmissionTarget, filePath: string) => {
      expect(await readFile(filePath, "utf8")).toBe("SECRET_SOURCE_MARKER");
      return { status: "submitted" as const, message: "submitted", submissionUrl: "https://codeforces.com/contest/4/my" };
    });
    const poll = vi.fn(async () => ({
      status: "judged" as const,
      verdict: "AC" as const,
      submissionId: 42,
      passedTestCount: 10,
      creationTimeSeconds: 10,
      submissionUrl: "https://codeforces.com/contest/4/submission/42"
    }));

    await runRealSubmission({ jobs, jobId: job.jobId, source, target, codeforcesHandle: "tourist", runtimeRoot }, {
      submit,
      poll,
      now: () => 10_000
    });

    expect(submit).toHaveBeenCalledTimes(1);
    expect(poll).toHaveBeenCalledTimes(1);
    expect(jobs.get(job.jobId)).toMatchObject({
      state: "accepted",
      verdict: "AC",
      submissionId: 42,
      passedTestCount: 10
    });
    await expect(access(path.join(runtimeRoot, job.jobId))).rejects.toThrow();
  });

  test("does not poll without a handle and reports an unknown remote result", async () => {
    const { runtimeRoot, jobs, job } = await makeJob();
    const submit = vi.fn(async () => ({ status: "submitted" as const, message: "submitted" }));
    const poll = vi.fn();

    await runRealSubmission({ jobs, jobId: job.jobId, source, target, runtimeRoot }, { submit, poll });

    expect(submit).toHaveBeenCalledTimes(1);
    expect(poll).not.toHaveBeenCalled();
    expect(jobs.get(job.jobId)).toMatchObject({ state: "unknown", verdict: "UNKNOWN" });
  });

  test("maps polling errors to UNKNOWN without another submit", async () => {
    const { runtimeRoot, jobs, job } = await makeJob("tourist");
    const submit = vi.fn(async () => ({ status: "submitted" as const, message: "submitted" }));
    const poll = vi.fn(async () => {
      throw new Error("SECRET_REMOTE_BODY");
    });

    await runRealSubmission({ jobs, jobId: job.jobId, source, target, codeforcesHandle: "tourist", runtimeRoot }, {
      submit,
      poll
    });

    expect(submit).toHaveBeenCalledTimes(1);
    expect(jobs.get(job.jobId)).toMatchObject({ state: "unknown", verdict: "UNKNOWN" });
    expect(JSON.stringify(jobs.get(job.jobId))).not.toContain("SECRET_REMOTE_BODY");
  });

  test("maps CLI failures safely and cleans temporary files", async () => {
    const { runtimeRoot, jobs, job } = await makeJob("tourist");
    const submit = vi.fn(async () => ({ status: "login_required" as const, message: "请登录" }));
    const poll = vi.fn();

    await runRealSubmission({ jobs, jobId: job.jobId, source, target, codeforcesHandle: "tourist", runtimeRoot }, {
      submit,
      poll
    });

    expect(jobs.get(job.jobId)).toMatchObject({ state: "failed", message: "请登录" });
    expect(poll).not.toHaveBeenCalled();
    await expect(access(path.join(runtimeRoot, job.jobId))).rejects.toThrow();
  });

  test("records an AtCoder submission without inventing a verdict or polling", async () => {
    const runtimeRoot = await mkdtemp(path.join(tmpdir(), "oj-console-atcoder-"));
    const jobs = new SubmissionJobStore({ createId: () => "job-atcoder", now: () => 10_000 });
    const job = jobs.create({ mode: "real", source: source.metadata, target: atCoderTarget });
    const submit = vi.fn(async () => ({
      status: "submitted" as const,
      message: "submitted",
      submissionUrl: "https://atcoder.jp/contests/abc350/submissions/123456"
    }));
    const poll = vi.fn();

    await runRealSubmission({
      jobs,
      jobId: job.jobId,
      source,
      target: atCoderTarget,
      runtimeRoot
    }, { submit, poll });

    expect(submit).toHaveBeenCalledWith(atCoderTarget, expect.any(String), expect.any(String));
    expect(poll).not.toHaveBeenCalled();
    expect(jobs.get(job.jobId)).toMatchObject({
      state: "submitted",
      message: "代码已提交到 AtCoder；请通过提交链接查看判题结果，不会自动重试。",
      submissionUrl: "https://atcoder.jp/contests/abc350/submissions/123456"
    });
    expect(jobs.get(job.jobId).verdict).toBeUndefined();
    await expect(access(path.join(runtimeRoot, job.jobId))).rejects.toThrow();
  });
});

describe("OJ console login terminal", () => {
  test("uses one fixed visible PowerShell command", () => {
    const unref = vi.fn();
    const launcher = vi.fn(() => ({ unref }));

    openCodeforcesLoginTerminal({ platform: "win32", launcher });

    expect(launcher).toHaveBeenCalledWith(
      "powershell.exe",
      ["-NoExit", "-Command", "oj login https://codeforces.com/"],
      expect.objectContaining({ detached: true, stdio: "ignore", windowsHide: false })
    );
    expect(unref).toHaveBeenCalledOnce();
  });

  test("rejects non-Windows hosts before launching anything", () => {
    const launcher = vi.fn();
    expect(() => openCodeforcesLoginTerminal({ platform: "linux", launcher })).toThrow("仅支持 Windows");
    expect(launcher).not.toHaveBeenCalled();
  });

  test("maps AtCoder to one fixed visible login command", () => {
    const launcher = vi.fn(() => ({ unref: vi.fn() }));

    openPlatformLoginTerminal("atcoder", { platform: "win32", launcher });

    expect(launcher).toHaveBeenCalledWith(
      "powershell.exe",
      ["-NoExit", "-Command", "oj login https://atcoder.jp/"],
      { detached: true, stdio: "ignore", windowsHide: false }
    );
  });
});
