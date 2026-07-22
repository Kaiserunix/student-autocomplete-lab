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

  test("activates immediately for supported code languages and still warms up after startup", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as ExtensionManifest;

    expect(manifest.activationEvents).toContain("onStartupFinished");
    expect(manifest.activationEvents).toEqual(expect.arrayContaining([
      "onLanguage:python",
      "onLanguage:c",
      "onLanguage:cpp",
      "onLanguage:rust"
    ]));
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
    ).toBe("AI 做题陪练：立即补全一次（备用）");

    const source = await readFile("src/extension.ts", "utf8");
    expect(source).toContain('autocompleteStatus.text = "$(sparkle) AI 自动补全已开启"');
    expect(source).toContain("停下输入约 350 毫秒后自动显示灰色 Ghost Text");
  });

  test("exposes real AI provider settings instead of a webview-only config", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as ExtensionManifest;
    const properties = manifest.contributes?.configuration?.properties ?? {};

    expect(properties).toHaveProperty("studentAutocomplete.ai.providerMode");
    expect(properties).toHaveProperty("studentAutocomplete.ai.openai.baseUrl");
    expect(properties).toHaveProperty("studentAutocomplete.ai.openai.authMode");
    expect(properties).toHaveProperty("studentAutocomplete.ai.codex.executablePath");
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

  test("exposes five-platform OJ connection settings without credential fields", async () => {
    const manifest = JSON.parse(await readFile("package.json", "utf8")) as ExtensionManifest;
    const properties = manifest.contributes?.configuration?.properties ?? {};

    expect(properties).toHaveProperty("studentAutocomplete.oj.luogu.endpoint");
    expect(properties).toHaveProperty("studentAutocomplete.oj.leetcode.entrypoint");
    expect(properties).toHaveProperty("studentAutocomplete.oj.nowcoder.entrypoint");
    expect(properties).toHaveProperty("studentAutocomplete.oj.codeforces.endpoint");
    expect(properties).toHaveProperty("studentAutocomplete.oj.atcoder.endpoint");
    expect(Object.keys(properties).filter((key) => key.startsWith("studentAutocomplete.oj"))).not.toEqual(
      expect.arrayContaining([
        expect.stringMatching(/cookie/i),
        expect.stringMatching(/apiKey/i),
        expect.stringMatching(/remoteKey/i)
      ])
    );
  });

  test("command palette entries do not point at stale planned-feature placeholders", async () => {
    const source = await readFile("src/extension.ts", "utf8");

    expect(source).not.toContain("planned for the next slice");
    expect(source).not.toContain("answer reveal and wrong-problem bank are planned");
    expect(source).toContain("请在左侧 AI 教练");
  });

  test("documents the optional Codeforces and AtCoder submission dependency and ships its notice", async () => {
    const readme = await readFile("README.md", "utf8");
    const notices = await readFile("THIRD_PARTY_NOTICES.md", "utf8");
    const releaseReadme = await readFile("README.release.md", "utf8");
    const releasePackager = await readFile("scripts/packageBetaReleaseVsix.js", "utf8");

    expect(readme).toContain("online-judge-tools");
    expect(readme).toContain("每次提交前，你都要亲自检查");
    expect(readme).toContain("提交始终需要用户显式确认");
    expect(readme).toContain("实验性 Codeforces / AtCoder 提交");
    expect(readme).toContain("自己安装");
    expect(notices).toContain("https://github.com/online-judge-tools/oj");
    expect(notices).toContain("`@modelcontextprotocol/sdk`");
    expect(notices).toContain("`parse5`");
    expect(notices).toContain("`entities`");
    expect(notices).toContain("The MIT License (MIT)");
    expect(notices).toContain("Copyright (c) 2017-2020 Kimiyuki Onaka");
    expect(notices).toContain("not affiliated with or endorsed by Codeforces, AtCoder");
    expect(releaseReadme).toContain("online-judge-tools");
    expect(releasePackager).toContain('"submission"');
    expect(releasePackager).toContain('"oj"');
    expect(releasePackager).toContain('copyIfExists("THIRD_PARTY_NOTICES.md")');
    expect(releasePackager).toContain('"THIRD_PARTY_NOTICES.md"');
  });
});
