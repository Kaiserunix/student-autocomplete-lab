import { describe, expect, test } from "vitest";
import { ojProblemDocumentToRecord, textBlockToPlainText } from "../src/oj/problemDocument";
import type { OjProblemDocument, OjTextBlock } from "../src/oj/types";

describe("OJ problem document conversion", () => {
  test("parses HTML as data, decodes entities, and drops active content", () => {
    const text = textBlockToPlainText({
      text: '<section><h2>A &amp; B</h2><p>Line<br>two</p><script>alert("secret")</script><style>.x{}</style><ul><li>first</li><li>second</li></ul></section>',
      format: "html",
      locale: "en",
      truncated: false,
      sha256: "0".repeat(64)
    });

    expect(text).toContain("A & B");
    expect(text).toContain("Line\ntwo");
    expect(text).toContain("- first");
    expect(text).not.toContain("alert");
    expect(text).not.toContain(".x{}");
  });

  test("maps only the canonical problem fields into the local problem bank", () => {
    const document = problemDocument();
    const record = ojProblemDocumentToRecord(document);

    expect(record).toMatchObject({
      platform: "atcoder",
      id: "abc086_a",
      title: "Product",
      statement: "Multiply two integers.\n\n约束\n- 1 <= a, b <= 100",
      inputFormat: "a b",
      outputFormat: "Even or Odd",
      samples: [{ input: "3 4", output: "Even" }]
    });
    expect(JSON.stringify(record)).not.toContain("raw-provider-payload");
  });
});

function problemDocument(): OjProblemDocument {
  const source = {
    kind: "page_adapter" as const,
    adapterId: "atcoder-test-provider",
    adapterVersion: "1.0.0",
    fetchedAt: "2026-07-22T10:00:00.000Z",
    sourceUrl: "https://atcoder.jp/contests/abc086/tasks/abc086_a",
    rawRef: "raw-provider-payload",
    confidence: "derived" as const
  };
  const block = (text: string): OjTextBlock => ({
    text,
    format: "text",
    locale: "en",
    truncated: false,
    originalChars: text.length,
    sha256: "0".repeat(64)
  });
  return {
    schemaVersion: "oj.problem-document/v1",
    ref: {
      schemaVersion: "oj.problem-ref/v1",
      platform: "atcoder",
      nativeId: "abc086_a",
      canonicalId: "atcoder:abc086_a",
      url: source.sourceUrl,
      source
    },
    title: "Product",
    locale: "en",
    access: "public",
    tags: [{ namespace: "platform", slug: "math", name: "Math" }],
    content: {
      statement: block("Multiply two integers."),
      input: block("a b"),
      output: block("Even or Odd")
    },
    constraints: ["1 <= a, b <= 100", "1 <= a, b <= 100"],
    samples: [{ ordinal: 1, input: "3 4", output: "Even" }],
    limits: { timeMs: 2_000, memoryBytes: 1_073_741_824 },
    io: { mode: "stdin_stdout" },
    starterCode: [],
    source
  };
}
