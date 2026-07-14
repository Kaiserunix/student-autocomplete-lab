import type { DemoScenario } from "./contracts";
import type { SubmissionJobStore } from "./submissionJobs";

export interface DemoSubmissionInput {
  jobs: SubmissionJobStore;
  jobId: string;
  scenario: DemoScenario;
  sleep?: (milliseconds: number) => Promise<void>;
}

export async function runDemoSubmission(input: DemoSubmissionInput): Promise<void> {
  const sleep = input.sleep ?? delay;
  if (input.scenario === "login_required") {
    input.jobs.update(input.jobId, {
      state: "failed",
      message: "演示结果：Codeforces 登录已失效。"
    });
    return;
  }

  input.jobs.update(input.jobId, {
    state: "queued",
    message: "演示提交已进入队列。"
  });
  await sleep(300);
  input.jobs.update(input.jobId, {
    state: "judging",
    message: "演示判题正在运行。"
  });
  await sleep(450);

  if (input.scenario === "accepted") {
    input.jobs.update(input.jobId, {
      state: "accepted",
      verdict: "AC",
      message: "演示判题完成：Accepted。"
    });
    return;
  }
  if (input.scenario === "wrong_answer") {
    input.jobs.update(input.jobId, {
      state: "rejected",
      verdict: "WA",
      message: "演示判题完成：Wrong Answer。"
    });
    return;
  }
  if (input.scenario === "compile_error") {
    input.jobs.update(input.jobId, {
      state: "rejected",
      verdict: "CE",
      message: "演示判题完成：Compilation Error。"
    });
    return;
  }
  input.jobs.update(input.jobId, {
    state: "unknown",
    verdict: "UNKNOWN",
    message: "演示查询超时：结果未知，不会自动重试提交。"
  });
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
