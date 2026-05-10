import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

interface ExtensionManifest {
  main?: string;
  activationEvents?: string[];
  contributes?: {
    viewsContainers?: {
      activitybar?: Array<{ id?: string; title?: string }>;
    };
    commands?: Array<{ command?: string; title?: string }>;
    views?: Record<string, Array<{ id?: string; type?: string }>>;
    configurationDefaults?: Record<string, unknown>;
    configuration?: {
      properties?: Record<string, unknown>;
    };
  };
}

describe("VS Code extension manifest", () => {
  test("points main at the compiled extension entry emitted by the current tsconfig", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as ExtensionManifest;

    expect(manifest.main).toBe("./dist/src/extension.js");
  });

  test("activates early enough to register the problem-bank view and inline provider", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as ExtensionManifest;

    expect(manifest.activationEvents).toContain("onStartupFinished");
  });

  test("contributes the problem-bank view as a webview", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as ExtensionManifest;

    const views = manifest.contributes?.views?.studentAutocomplete ?? [];
    const problemBankView = views.find((view) => view.id === "studentAutocomplete.problemBankWebview");

    expect(problemBankView).toMatchObject({
      id: "studentAutocomplete.problemBankWebview",
      type: "webview"
    });
  });

  test("uses Chinese AI-first labels in the VS Code shell", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as ExtensionManifest;

    expect(manifest.contributes?.viewsContainers?.activitybar?.[0]?.title).toBe("AI 做题陪练");
    expect(manifest.contributes?.views?.studentAutocomplete?.[0]).toMatchObject({
      name: "做题陪练"
    });
    expect(manifest.contributes?.commands?.find((item) => item.command === "studentAutocomplete.giveHint")?.title).toBe(
      "AI 做题陪练：给点提示"
    );
  });

  test("makes inline completion discoverable and enabled by default", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as ExtensionManifest;

    expect(manifest.contributes?.configurationDefaults?.["editor.inlineSuggest.enabled"]).toBe(true);
    expect(
      manifest.contributes?.commands?.find((item) => item.command === "studentAutocomplete.triggerInlineCompletion")
        ?.title
    ).toBe("AI 做题陪练：触发自动补全");
  });

  test("exposes real AI provider settings instead of a webview-only config", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as ExtensionManifest;
    const properties = manifest.contributes?.configuration?.properties ?? {};

    expect(properties).toHaveProperty("studentAutocomplete.ai.providerMode");
    expect(properties).toHaveProperty("studentAutocomplete.ai.openai.baseUrl");
    expect(properties).toHaveProperty("studentAutocomplete.ai.openai.chatModel");
    expect(properties).toHaveProperty("studentAutocomplete.ai.openaiCompatible.autocompleteFormat");
    expect(properties).toHaveProperty("studentAutocomplete.ai.anthropic.chatModel");
  });

  test("exposes a beta UI language setting for Chinese and English", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as ExtensionManifest;
    const properties = manifest.contributes?.configuration?.properties ?? {};

    expect(properties).toHaveProperty("studentAutocomplete.ui.language");
    expect(JSON.stringify(properties["studentAutocomplete.ui.language"])).toContain("zh");
    expect(JSON.stringify(properties["studentAutocomplete.ui.language"])).toContain("en");
  });

  test("command palette entries do not point at stale planned-feature placeholders", async () => {
    const source = await readFile("src/extension.ts", "utf8");

    expect(source).not.toContain("planned for the next slice");
    expect(source).not.toContain("answer reveal and wrong-problem bank are planned");
    expect(source).toContain("请在左侧 AI 教练");
  });
});
