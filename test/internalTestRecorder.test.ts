import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as path from "node:path";
import { describe, expect, test } from "vitest";
import {
  createInternalTestRecorder,
  isInternalTestBuild,
  summarizeInternalTestEvents
} from "../src/internalTesting/internalTestRecorder";
import { readJsonlRecords } from "../src/storage/jsonlStore";

describe("internal test recorder", () => {
  test("is enabled only for the internal package name or explicit env flag", () => {
    expect(isInternalTestBuild({ packageName: "student-autocomplete-lab" })).toBe(false);
    expect(isInternalTestBuild({ packageName: "student-autocomplete-lab-internal" })).toBe(true);
    expect(
      isInternalTestBuild({
        packageName: "student-autocomplete-lab",
        env: { STUDENT_AUTOCOMPLETE_INTERNAL_TEST: "1" }
      })
    ).toBe(true);
  });

  test("records local-only internal test events and builds a compact summary", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "student-autocomplete-internal-"));
    const recorder = createInternalTestRecorder({
      globalStoragePath: root,
      packageName: "student-autocomplete-lab-internal",
      displayName: "Student Autocomplete Lab 内测记录版",
      version: "0.1.0-beta.1-internal.1",
      workspaceFolder: "C:\\Users\\qwerf\\Desktop\\Source\\leetcodepy"
    });

    expect(recorder.enabled).toBe(true);
    await recorder.record({
      kind: "ai_coach",
      problemKey: "luogu:P1030",
      problemId: "P1030",
      platform: "luogu",
      action: "hint",
      painPoints: ["traversal_order_confusion"],
      model: "mimo-v2.5",
      note: "first hint"
    });
    await recorder.record({
      kind: "solution_score",
      problemKey: "luogu:P1030",
      problemId: "P1030",
      platform: "luogu",
      ojStatus: "AC",
      learningScore: 82,
      model: "mimo-v2.5"
    });

    const events = await readJsonlRecords<Record<string, unknown>>(recorder.eventsPath);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      schemaVersion: "internal-test/v1",
      build: {
        packageName: "student-autocomplete-lab-internal",
        version: "0.1.0-beta.1-internal.1"
      },
      workspace: {
        folder: "C:\\Users\\qwerf\\Desktop\\Source\\leetcodepy"
      },
      kind: "ai_coach",
      problemId: "P1030"
    });

    await expect(recorder.summary()).resolves.toMatchObject({
      enabled: true,
      totalEvents: 2,
      problemCount: 1,
      hintCount: 1,
      solutionScoreCount: 1,
      models: ["mimo-v2.5"]
    });
  });

  test("summarizes privacy-sensitive records without requiring upload", () => {
    const summary = summarizeInternalTestEvents([
      {
        schemaVersion: "internal-test/v1",
        eventId: "a",
        occurredAt: "2026-05-03T00:00:00.000Z",
        kind: "skill_feedback",
        build: { packageName: "student-autocomplete-lab-internal", version: "0.1.0-beta.1-internal.1" },
        workspace: { folder: "C:\\repo" },
        problemKey: "luogu:P4913",
        problemId: "P4913",
        platform: "luogu",
        action: "diagnosis_wrong",
        painPoints: ["recursion_base_case"],
        model: "mimo-v2.5",
        note: "好友认为这个判断不准"
      }
    ]);

    expect(summary.privacyNotice).toContain("本地");
    expect(summary.skillFeedbackCount).toBe(1);
    expect(summary.byKind.skill_feedback).toBe(1);
  });
});
