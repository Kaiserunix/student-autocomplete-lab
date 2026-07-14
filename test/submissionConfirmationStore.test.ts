import { describe, expect, test } from "vitest";
import { SubmissionConfirmationStore } from "../src/submission/confirmationStore";
import type { CodeforcesTarget, EditorSubmissionIdentity } from "../src/submission/types";

const target: CodeforcesTarget = {
  platform: "codeforces",
  contestKind: "contest",
  contestId: 1200,
  problemIndex: "F",
  canonicalUrl: "https://codeforces.com/contest/1200/problem/F"
};

const editor: EditorSubmissionIdentity = {
  uri: "file:///main.cpp",
  filePath: "C:/work/main.cpp",
  version: 7,
  languageId: "cpp",
  codeSize: 120
};

describe("submission confirmation store", () => {
  test("consumes a matching confirmation exactly once", () => {
    const store = new SubmissionConfirmationStore({ now: () => 1_000, createId: () => "confirm-1" });
    const preview = store.create({ problemKey: "manual:1", target, editor, codeforcesHandle: " tourist " });

    expect(preview).toMatchObject({
      confirmationId: "confirm-1",
      problemKey: "manual:1",
      codeforcesHandle: "tourist"
    });
    expect(store.consume(preview.confirmationId, preview.editor)).toMatchObject({ confirmationId: "confirm-1" });
    expect(() => store.consume(preview.confirmationId, preview.editor)).toThrow("已经使用");
  });

  test("rejects expired or changed editor confirmations", () => {
    let now = 1_000;
    const store = new SubmissionConfirmationStore({ now: () => now, createId: () => "confirm-2", ttlMs: 120_000 });
    const preview = store.create({ problemKey: "manual:1", target, editor });

    expect(() => store.consume(preview.confirmationId, { ...editor, version: editor.version + 1 })).toThrow("代码已变化");
    now += 120_001;
    expect(() => store.consume(preview.confirmationId, editor)).toThrow("已过期");
  });

  test("does not store source content in a preview", () => {
    const store = new SubmissionConfirmationStore({ now: () => 1_000, createId: () => "confirm-3" });
    const preview = store.create({ problemKey: "manual:1", target, editor });

    expect(Object.keys(preview.editor).sort()).toEqual(["codeSize", "filePath", "languageId", "uri", "version"]);
    expect(JSON.stringify(preview)).not.toContain("sourceContent");
  });
});
