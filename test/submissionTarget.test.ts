import { describe, expect, test } from "vitest";
import {
  getSubmissionPlatformCapability,
  parseSubmissionTarget
} from "../src/submission/submissionTarget";

describe("submission target registry", () => {
  test("normalizes an AtCoder task URL", () => {
    expect(parseSubmissionTarget("https://atcoder.jp/contests/abc350/tasks/abc350_a?lang=en")).toEqual({
      platform: "atcoder",
      contestId: "abc350",
      taskId: "abc350_a",
      canonicalUrl: "https://atcoder.jp/contests/abc350/tasks/abc350_a"
    });
  });

  test("exposes fixed AtCoder submission and login capabilities", () => {
    expect(getSubmissionPlatformCapability("atcoder")).toEqual({
      platform: "atcoder",
      displayName: "AtCoder",
      loginUrl: "https://atcoder.jp/",
      verdictPolling: "submission_url"
    });
  });
});
