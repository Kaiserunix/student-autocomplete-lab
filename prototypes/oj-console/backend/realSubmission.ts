import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { pollCodeforcesVerdict } from "../../../src/submission/codeforcesVerdict";
import { submitWithOnlineJudgeTools } from "../../../src/submission/onlineJudgeTools";
import type { CodeforcesTarget } from "../../../src/submission/types";
import type { SourceRecord } from "./contracts";
import type { SubmissionJobStore } from "./submissionJobs";

export interface RealSubmissionInput {
  jobs: SubmissionJobStore;
  jobId: string;
  source: SourceRecord;
  target: CodeforcesTarget;
  codeforcesHandle?: string;
  runtimeRoot: string;
}

export interface RealSubmissionDependencies {
  submit?: typeof submitWithOnlineJudgeTools;
  poll?: typeof pollCodeforcesVerdict;
  now?: () => number;
  makeDirectory?: typeof mkdir;
  writeSource?: typeof writeFile;
  removeDirectory?: typeof rm;
}

export async function runRealSubmission(
  input: RealSubmissionInput,
  dependencies: RealSubmissionDependencies = {}
): Promise<void> {
  const submit = dependencies.submit ?? submitWithOnlineJudgeTools;
  const poll = dependencies.poll ?? pollCodeforcesVerdict;
  const now = dependencies.now ?? Date.now;
  const makeDirectory = dependencies.makeDirectory ?? mkdir;
  const writeSource = dependencies.writeSource ?? writeFile;
  const removeDirectory = dependencies.removeDirectory ?? rm;
  const jobDirectory = path.join(input.runtimeRoot, input.jobId);
  const filePath = path.join(jobDirectory, input.source.metadata.fileName);

  input.jobs.update(input.jobId, {
    state: "submitting",
    message: "正在向 Codeforces 提交一次。"
  });

  try {
    await makeDirectory(jobDirectory, { recursive: true });
    await writeSource(filePath, input.source.bytes);
    const submittedAfterSeconds = Math.floor(now() / 1_000);
    const cliResult = await submit(input.target.canonicalUrl, filePath, jobDirectory);
    if (cliResult.status !== "submitted") {
      input.jobs.update(input.jobId, {
        state: "failed",
        message: cliResult.message,
        ...(cliResult.submissionUrl ? { submissionUrl: cliResult.submissionUrl } : {})
      });
      return;
    }

    if (!input.codeforcesHandle) {
      input.jobs.update(input.jobId, {
        state: "unknown",
        verdict: "UNKNOWN",
        message: "代码已提交；未填写 handle，无法自动确认最终判题，不会自动重试。",
        ...(cliResult.submissionUrl ? { submissionUrl: cliResult.submissionUrl } : {})
      });
      return;
    }

    input.jobs.update(input.jobId, {
      state: "queued",
      message: "代码已提交，正在等待 Codeforces 判题。",
      ...(cliResult.submissionUrl ? { submissionUrl: cliResult.submissionUrl } : {})
    });
    input.jobs.update(input.jobId, {
      state: "judging",
      message: "正在查询 Codeforces 公共判题状态。",
      ...(cliResult.submissionUrl ? { submissionUrl: cliResult.submissionUrl } : {})
    });

    try {
      const pollResult = await poll({
        handle: input.codeforcesHandle,
        target: input.target,
        submittedAfterSeconds
      });
      if (pollResult.status === "timeout") {
        input.jobs.update(input.jobId, {
          state: "unknown",
          verdict: "UNKNOWN",
          message: "查询在限定时间内没有得到终态；不会自动重试提交。",
          ...(cliResult.submissionUrl ? { submissionUrl: cliResult.submissionUrl } : {})
        });
        return;
      }
      const state = pollResult.verdict === "AC"
        ? "accepted"
        : pollResult.verdict === "UNKNOWN"
          ? "unknown"
          : "rejected";
      input.jobs.update(input.jobId, {
        state,
        verdict: pollResult.verdict,
        message: `Codeforces 判题完成：${pollResult.verdict}。`,
        submissionUrl: pollResult.submissionUrl,
        submissionId: pollResult.submissionId,
        ...(typeof pollResult.passedTestCount === "number"
          ? { passedTestCount: pollResult.passedTestCount }
          : {})
      });
    } catch {
      input.jobs.update(input.jobId, {
        state: "unknown",
        verdict: "UNKNOWN",
        message: "代码已提交，但公共状态查询失败；不会自动重试提交。",
        ...(cliResult.submissionUrl ? { submissionUrl: cliResult.submissionUrl } : {})
      });
    }
  } finally {
    await removeDirectory(jobDirectory, { recursive: true, force: true });
  }
}
