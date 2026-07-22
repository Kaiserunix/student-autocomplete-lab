import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("OJ runtime loading", () => {
  test("loads the MCP SDK only when a provider connection is requested", async () => {
    const source = await readFile("src/oj/broker.ts", "utf8");

    expect(source).toContain('await import("./mcpSdkClient")');
    expect(source).not.toContain('import { connectOjMcpSession } from "./mcpSdkClient"');
  });

  test("loads the HTML parser only when a problem is imported", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain('await import("../oj/problemDocument")');
    expect(source).not.toContain('import { ojProblemDocumentToRecord } from "../oj/problemDocument"');
  });
});
