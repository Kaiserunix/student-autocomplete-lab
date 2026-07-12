import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { createWebviewNonce, htmlLanguage, renderWebviewDocumentShell } from "../src/sidebar/html";
import {
  codexOAuthControlIds,
  disabledReasonForCoachAction,
  primaryCoachButtonIds,
  sidebarPageIds
} from "../src/sidebar/webview/main";
import { getSidebarUiCopy, normalizeUiLanguage } from "../src/sidebar/webview/i18n";
import { normalizeMathText, parseMarkdownBlocks, renderMarkdownToHtml } from "../src/sidebar/webview/markdown";

describe("sidebar webview modules", () => {
  test("keeps shell helpers deterministic and language-aware", () => {
    expect(createWebviewNonce(123)).toBe("123");
    expect(htmlLanguage("zh")).toBe("zh-CN");
    expect(htmlLanguage("en")).toBe("en");
    expect(renderWebviewDocumentShell({
      language: "en",
      nonce: "n1",
      cspSource: "vscode-webview://test",
      style: "body{display:block}",
      body: "<main>ok</main>",
      script: "console.log('ok')"
    })).toContain('<html lang="en">');
  });

  test("covers Chinese and English labels from one copy module", () => {
    expect(normalizeUiLanguage(undefined)).toBe("zh");
    expect(normalizeUiLanguage("en")).toBe("en");
    expect(getSidebarUiCopy("zh")).toMatchObject({
      tabAi: "AI 教练",
      tabProblem: "题目",
      tabSkill: "学习画像",
      send: "发送"
    });
    expect(getSidebarUiCopy("en")).toMatchObject({
      tabAi: "AI Coach",
      tabProblem: "Problems",
      tabSkill: "Learning Profile",
      send: "Send"
    });
  });

  test("keeps primary page and coach button inventories explicit", () => {
    expect([...sidebarPageIds]).toEqual(["aiPage", "problemPage", "skillPage"]);
    expect([...primaryCoachButtonIds]).toContain("coachSendCustom");
    expect([...primaryCoachButtonIds]).toContain("coachRecommendRule");
    expect(disabledReasonForCoachAction({ hasProblem: false, isBusy: false })).toContain("先导入");
    expect(disabledReasonForCoachAction({ hasProblem: true, isBusy: true })).toContain("正在处理");
  });

  test("renders contest markdown safely, including inline math and code fences", () => {
    const markdown = [
      "# A+B Problem",
      "",
      "输入两个整数 $a, b$，输出它们的和（$|a|,|b| \\le {10}^9$）。",
      "",
      "```text",
      "1 2",
      "```",
      "",
      "> 任何一个伟大的思想，都有一个微不足道的开始。"
    ].join("\n");

    const blocks = parseMarkdownBlocks(markdown);
    const html = renderMarkdownToHtml(markdown);

    expect(blocks.map((block) => block.type)).toEqual(["heading", "paragraph", "code", "quote"]);
    expect(normalizeMathText("|a|,|b| \\le {10}^9")).toBe("|a|,|b| ≤ 10^9");
    expect(html).toContain('<span class="mathInline">a, b</span>');
    expect(html).toContain("|a|,|b| ≤ 10<sup>9</sup>");
    expect(html).toContain("<pre><code data-language=\"text\">1 2</code></pre>");
    expect(html).not.toContain("<script>");
  });

  test("keeps extracted css available for release hygiene checks", async () => {
    const css = await readFile("src/sidebar/webview/styles.css", "utf8");

    expect(css).toContain(".markdownBody");
    expect(css).toContain(".coachPrimaryAction");
    expect(css).toContain(".codexOAuthPanel");
  });

  test("keeps Codex OAuth control inventory explicit", () => {
    expect(codexOAuthControlIds).toEqual([
      "aiOpenAiAuthMode",
      "codexOAuthPanel",
      "codexAuthStatus",
      "codexBrowserLogin",
      "codexDeviceLogin",
      "codexCancelLogin",
      "codexLogout",
      "codexRefreshModels",
      "codexTeachingModel",
      "codexAutocompleteModel"
    ]);
  });
});
