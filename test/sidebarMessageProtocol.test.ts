import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { hostEventTypeNames } from "../src/sidebar/hostEvents";
import { webviewCommandNames } from "../src/sidebar/messageProtocol";

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

describe("sidebar message protocol", () => {
  test("exposes the complete Codex OAuth command contract", () => {
    expect(webviewCommandNames).toEqual(expect.arrayContaining([
      "readCodexAuth",
      "startCodexBrowserLogin",
      "startCodexDeviceLogin",
      "cancelCodexLogin",
      "logoutCodex",
      "refreshCodexModels"
    ]));
  });

  test("exports every command dispatched by the webview script", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");
    const dispatched = unique(
      Array.from(source.matchAll(/vscode\.postMessage\(\{\s*command:\s*"([^"]+)"/g)).map((match) => match[1])
    );

    expect(unique([...webviewCommandNames])).toEqual(dispatched);
  });

  test("exports every command handled by the host provider", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");
    const handled = unique(Array.from(source.matchAll(/message\.command === "([^"]+)"/g)).map((match) => match[1]));

    expect(unique([...webviewCommandNames])).toEqual(handled);
  });

  test("keeps host event type inventory explicit", () => {
    expect([...hostEventTypeNames].sort()).toEqual([
      "aiHealthCheckResult",
      "aiModelResults",
      "autocompletePreview",
      "coachFollowUp",
      "internalTestSummary",
      "ojSubmissionPreview",
      "ojSubmissionResult",
      "optimizationReport",
      "problemBankState",
      "problemRecommendation",
      "problemSearchResults",
      "problemSetSearchResults",
      "status",
      "submissionJudge",
      "teachingDiagnosis"
    ]);
  });
});
