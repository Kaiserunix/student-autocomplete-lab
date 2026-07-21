import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("inline provider skill integration", () => {
  test("loads StudentSkill, passes route capabilities, and distinguishes rejection", async () => {
    const provider = await readFile("src/autocomplete/inlineProvider.ts", "utf8");
    const extension = await readFile("src/extension.ts", "utf8");

    expect(provider).toContain("requestMimoAutocompleteDetailed");
    expect(provider).toContain("studentSkill:");
    expect(provider).toContain("capabilities: route.capabilities");
    expect(provider).toContain('type: "rejected"');
    expect(provider).not.toContain("${document.uri.fsPath}:");
    expect(extension).toContain("createStudentAutocompleteStoragePaths");
    expect(extension).toContain("loadStudentSkill(storagePaths.studentSkill)");
    expect(extension).toContain('event.type === "rejected"');
    expect(extension).not.toContain("editor.document.uri.fsPath");
  });
});
