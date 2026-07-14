import { describe, expect, test } from "vitest";
import type { CodeforcesTarget } from "../src/submission/types";
import type { DemoScenario, SourceMetadata, SubmissionJobState } from "../prototypes/oj-console/backend/contracts";
import { runDemoSubmission } from "../prototypes/oj-console/backend/demoSubmission";
import { SubmissionJobStore } from "../prototypes/oj-console/backend/submissionJobs";

const source: SourceMetadata = {
  sourceId: "source-1",
  fileName: "main.cpp",
  language: "cpp",
  byteSize: 20,
  digest: "abcdef123456",
  expiresAt: new Date(600_000).toISOString()
};

const target: CodeforcesTarget = {
  platform: "codeforces",
  contestKind: "contest",
  contestId: 4,
  problemIndex: "A",
  canonicalUrl: "https://codeforces.com/contest/4/problem/A"
};

async function runScenario(scenario: DemoScenario) {
  let now = 1_000;
  const history: SubmissionJobState[] = [];
  const jobs = new SubmissionJobStore({
    now: () => now,
    createId: () => `job-${scenario}`,
    onChange: (view) => history.push(view.state)
  });
  const job = jobs.create({ mode: "demo", scenario, source, target });
  await runDemoSubmission({
    jobs,
    jobId: job.jobId,
    scenario,
    sleep: async () => {
      now += 10;
    }
  });
  return { history, final: jobs.get(job.jobId) };
}

describe("OJ console demo submission", () => {
  test("runs the exact accepted demo sequence", async () => {
    const result = await runScenario("accepted");
    expect(result.history).toEqual(["created", "queued", "judging", "accepted"]);
    expect(result.final).toMatchObject({ state: "accepted", verdict: "AC" });
  });

  test.each([
    ["wrong_answer", "rejected", "WA"],
    ["compile_error", "rejected", "CE"],
    ["unknown", "unknown", "UNKNOWN"]
  ] as const)("maps %s to a safe terminal result", async (scenario, state, verdict) => {
    const result = await runScenario(scenario);
    expect(result.history).toEqual(["created", "queued", "judging", state]);
    expect(result.final).toMatchObject({ state, verdict });
  });

  test("simulates login-required without queued or judging states", async () => {
    const result = await runScenario("login_required");
    expect(result.history).toEqual(["created", "failed"]);
    expect(result.final).toMatchObject({ state: "failed" });
    expect(result.final.verdict).toBeUndefined();
  });

  test("returns cloned job views and rejects missing jobs", () => {
    const jobs = new SubmissionJobStore({ createId: () => "job-1", now: () => 1_000 });
    const created = jobs.create({ mode: "demo", scenario: "accepted", source, target });
    created.source.fileName = "changed.cpp";

    expect(jobs.get("job-1").source.fileName).toBe("main.cpp");
    expect(() => jobs.get("missing")).toThrow("找不到提交任务");
  });
});
