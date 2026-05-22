import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { appendJsonlRecord, readJsonlRecords, writeJsonlRecords } from "../src/storage/jsonlStore";

interface TestRecord {
  id: string;
  value: number;
}

let tempDir: string;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "student-autocomplete-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("jsonl store", () => {
  test("reads a missing file as an empty list", async () => {
    const records = await readJsonlRecords<TestRecord>(join(tempDir, "missing.jsonl"));

    expect(records).toEqual([]);
  });

  test("appends and reads records", async () => {
    const path = join(tempDir, "events", "events.jsonl");

    await appendJsonlRecord<TestRecord>(path, { id: "a", value: 1 });
    await appendJsonlRecord<TestRecord>(path, { id: "b", value: 2 });

    await expect(readJsonlRecords<TestRecord>(path)).resolves.toEqual([
      { id: "a", value: 1 },
      { id: "b", value: 2 }
    ]);
  });

  test("overwrites records", async () => {
    const path = join(tempDir, "events", "events.jsonl");

    await appendJsonlRecord<TestRecord>(path, { id: "a", value: 1 });
    await writeJsonlRecords<TestRecord>(path, [{ id: "b", value: 2 }]);

    await expect(readJsonlRecords<TestRecord>(path)).resolves.toEqual([{ id: "b", value: 2 }]);
  });

  test("reads files with a UTF-8 BOM on the first line", async () => {
    const path = join(tempDir, "events.jsonl");

    await writeFile(path, `\uFEFF{"id":"a","value":1}\n{"id":"b","value":2}\n`, "utf8");

    await expect(readJsonlRecords<TestRecord>(path)).resolves.toEqual([
      { id: "a", value: 1 },
      { id: "b", value: 2 }
    ]);
  });
});
