import { describe, expect, test } from "vitest";
import { OjConsoleError } from "../prototypes/oj-console/backend/contracts";
import { SourceStore } from "../prototypes/oj-console/backend/sourceStore";

describe("OJ console source store", () => {
  test("returns safe metadata while preserving an immutable private byte copy", () => {
    const store = new SourceStore({ now: () => 1_000, createId: () => "source-1" });
    const input = Buffer.from("SECRET_SOURCE_MARKER");

    const metadata = store.add("../main.cpp", input);
    input.fill(0);

    expect(metadata).toEqual({
      sourceId: "source-1",
      fileName: "main.cpp",
      language: "cpp",
      byteSize: 20,
      digest: expect.stringMatching(/^[0-9a-f]{12}$/),
      expiresAt: new Date(301_000).toISOString()
    });
    expect(JSON.stringify(metadata)).not.toContain("SECRET_SOURCE_MARKER");
    const firstRead = store.read("source-1");
    expect(firstRead.bytes.toString()).toBe("SECRET_SOURCE_MARKER");
    firstRead.bytes.fill(0);
    expect(store.read("source-1").bytes.toString()).toBe("SECRET_SOURCE_MARKER");
  });

  test("accepts the documented language suffixes and rejects unsafe sources", () => {
    let id = 0;
    const store = new SourceStore({ createId: () => `source-${++id}`, maxEntries: 20 });

    for (const name of [
      "a.c", "a.cc", "a.cpp", "a.cxx", "a.py", "a.py3", "A.java",
      "A.kt", "a.rs", "a.go", "a.js", "a.ts", "a.cs", "a.swift"
    ]) {
      expect(store.add(name, Buffer.from("x")).fileName).toBe(name);
    }
    expect(() => store.add("notes.txt", Buffer.from("x"))).toThrowError(OjConsoleError);
    expect(() => store.add("empty.cpp", Buffer.alloc(0))).toThrow("不能为空");
    expect(() => store.add("huge.cpp", Buffer.alloc(1024 * 1024 + 1))).toThrow("1 MiB");
  });

  test("enforces count and total-byte limits after pruning expired entries", () => {
    let now = 1_000;
    let id = 0;
    const countStore = new SourceStore({ now: () => now, createId: () => `count-${++id}` });
    for (let index = 0; index < 8; index += 1) {
      countStore.add(`${index}.cpp`, Buffer.from("x"));
    }
    expect(() => countStore.add("ninth.cpp", Buffer.from("x"))).toThrow("最多保留 8");
    now += 300_001;
    expect(countStore.add("fresh.cpp", Buffer.from("x")).fileName).toBe("fresh.cpp");

    let totalId = 0;
    const totalStore = new SourceStore({ createId: () => `total-${++totalId}` });
    for (let index = 0; index < 4; index += 1) {
      totalStore.add(`${index}.cpp`, Buffer.alloc(1024 * 1024));
    }
    expect(() => totalStore.add("overflow.cpp", Buffer.from("x"))).toThrow("4 MiB");
  });

  test("rejects missing and expired sources", () => {
    let now = 1_000;
    const store = new SourceStore({ now: () => now, createId: () => "source-expiring" });
    store.add("main.cpp", Buffer.from("int main(){}"));

    expect(() => store.read("missing")).toThrow("找不到源码");
    now += 300_001;
    expect(() => store.read("source-expiring")).toThrow("已过期");
    expect(store.stats()).toEqual({ count: 0, totalBytes: 0 });
  });
});
