import { mkdtemp, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, test } from "vitest";
import { appendLearningEvents } from "../src/practice/learningEventStore";

describe("learning event store", () => {
  test("creates parent directories and appends events as JSONL", async () => {
    const dir = await mkdtemp(join(tmpdir(), "learning-events-"));
    const target = join(dir, "nested", "learning_events.jsonl");

    await appendLearningEvents(target, [
      {
        problemId: "P4913",
        painPoint: "depth_definition",
        source: "verified_fixture",
        language: "python",
        evidence: "single-node tree depth",
        occurredAt: "2026-04-30T00:00:00.000Z"
      }
    ]);

    expect(await readFile(target, "utf8")).toContain('"painPoint":"depth_definition"');
  });
});
