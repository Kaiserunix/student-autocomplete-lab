import { describe, expect, test } from "vitest";
import type { CodeforcesTarget } from "../src/submission/types";
import { PrototypeConfirmationStore } from "../prototypes/oj-console/backend/confirmationStore";
import { REAL_MODE_UNLOCK_PHRASE, RealModeGate } from "../prototypes/oj-console/backend/modeGate";
import type { SourceRecord } from "../prototypes/oj-console/backend/contracts";

const target: CodeforcesTarget = {
  platform: "codeforces",
  contestKind: "contest",
  contestId: 4,
  problemIndex: "A",
  canonicalUrl: "https://codeforces.com/contest/4/problem/A"
};

const source: SourceRecord = {
  metadata: {
    sourceId: "source-1",
    fileName: "main.cpp",
    language: "cpp",
    byteSize: 20,
    digest: "abcdef123456",
    expiresAt: new Date(600_000).toISOString()
  },
  bytes: Buffer.from("SECRET_SOURCE_MARKER"),
  contentDigest: "abcdef1234567890"
};

describe("OJ console real mode gate", () => {
  test("requires the exact process-local unlock phrase", () => {
    const gate = new RealModeGate();

    expect(gate.isUnlocked()).toBe(false);
    expect(() => gate.requireUnlocked()).toThrow("真实模式仍处于锁定状态");
    expect(() => gate.unlock("wrong phrase")).toThrow("确认短语不正确");
    gate.unlock(REAL_MODE_UNLOCK_PHRASE);
    expect(gate.isUnlocked()).toBe(true);
    expect(() => gate.requireUnlocked()).not.toThrow();
  });
});

describe("OJ console confirmation store", () => {
  test("returns safe preview metadata and consumes it exactly once", () => {
    const store = new PrototypeConfirmationStore({ now: () => 1_000, createId: () => "confirm-1" });
    const preview = store.create({
      source,
      target,
      mode: "demo",
      scenario: "accepted",
      codeforcesHandle: " tourist "
    });

    expect(preview).toMatchObject({
      confirmationId: "confirm-1",
      mode: "demo",
      scenario: "accepted",
      codeforcesHandle: "tourist",
      source: source.metadata,
      target
    });
    expect(JSON.stringify(preview)).not.toContain("SECRET_SOURCE_MARKER");
    expect(store.consume(preview.confirmationId, source)).toMatchObject({
      confirmationId: "confirm-1",
      sourceId: "source-1",
      sourceContentDigest: "abcdef1234567890"
    });
    expect(() => store.consume(preview.confirmationId, source)).toThrow("已经使用");
  });

  test("rejects expired and mismatched source confirmations", () => {
    let now = 1_000;
    let id = 0;
    const store = new PrototypeConfirmationStore({ now: () => now, createId: () => `confirm-${++id}` });
    const mismatchPreview = store.create({ source, target, mode: "demo", scenario: "wrong_answer" });

    expect(() => store.consume(mismatchPreview.confirmationId, {
      ...source,
      contentDigest: "changed-content-digest"
    })).toThrow("源码已变化");

    const expiredPreview = store.create({ source, target, mode: "real" });
    now += 120_001;
    expect(() => store.consume(expiredPreview.confirmationId, source)).toThrow("已过期");
  });
});
