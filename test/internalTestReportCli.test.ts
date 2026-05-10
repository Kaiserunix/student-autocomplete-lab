import { appendFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import { appendJsonlRecord } from "../src/storage/jsonlStore";
import { buildInternalTestReportSummary } from "../src/cli/internalTestReport";

describe("internal test report CLI helpers", () => {
  test("builds a report from valid JSONL rows while counting corrupt rows", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "student-autocomplete-report-"));
    const eventsPath = path.join(root, "internalTestEvents.jsonl");

    await appendJsonlRecord(eventsPath, {
      schemaVersion: "internal-test/v1",
      eventId: "a",
      occurredAt: "2026-05-04T00:00:00.000Z",
      build: { packageName: "student-autocomplete-lab-internal" },
      workspace: { folder: "C:\\Users\\student\\Desktop\\Source\\leetcodepy" },
      kind: "autocomplete_event",
      action: "request"
    });
    await appendFile(eventsPath, "\\\\Desktop\\\\Python开发驱动练习题库\\\\题目\"}}\n", "utf8");

    await expect(buildInternalTestReportSummary(eventsPath)).resolves.toMatchObject({
      enabled: true,
      totalEvents: 1,
      autocompleteRequestCount: 1,
      invalidRecordCount: 1
    });
  });
});
