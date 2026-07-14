import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";
import {
  formalSidebarDestinations,
  formalSidebarLandmarkIds,
  frontendCommentViolations
} from "../src/sidebar/webview/formalDesign";
import {
  codexOAuthControlIds,
  formalWorkflowControlIds,
  ojActionButtonIds
} from "../src/sidebar/webview/main";

async function providerSource(): Promise<string> {
  return readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");
}

async function frontendSources(): Promise<Array<{ name: string; source: string }>> {
  const directory = "src/sidebar/webview";
  const files = (await readdir(directory)).filter((name) => /\.(?:ts|css)$/.test(name));
  const sources = await Promise.all(files.map(async (name) => ({
    name: path.join(directory, name),
    source: await readFile(path.join(directory, name), "utf8")
  })));
  const provider = await providerSource();
  const start = provider.indexOf("<!DOCTYPE html>");
  const end = provider.indexOf("</html>`;", start);
  sources.push({
    name: "ProblemBankViewProvider.renderHtml",
    source: provider.slice(start, end + "</html>".length)
  });
  return sources;
}

describe("formal sidebar frontend contract", () => {
  test("declares three dossier destinations and five stable landmarks", () => {
    expect(formalSidebarDestinations).toEqual([
      { pageId: "aiPage", tabId: "tabAi", label: "作答现场" },
      { pageId: "problemPage", tabId: "tabProblem", label: "题目张贴板" },
      { pageId: "skillPage", tabId: "tabSkill", label: "学习档案" }
    ]);
    expect(formalSidebarLandmarkIds).toEqual([
      "sessionMasthead",
      "problemPoster",
      "learningDossier",
      "submissionDocket",
      "accountModelDrawer"
    ]);
  });

  test("renders the formal shell with accessible state surfaces", async () => {
    const source = await providerSource();

    expect(source).toContain('data-design="competition-dossier"');
    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="status"');
    expect(source).toContain('aria-live="polite"');
    expect(source).toContain('aria-selected');
    expect(source).toContain("prefers-reduced-motion");
    expect(source).toContain("@media (max-width: 360px)");
    formalSidebarLandmarkIds.forEach((id) => expect(source).toContain(`id="${id}"`));
  });

  test("keeps real submission and Codex OAuth entry points explicit", async () => {
    const source = await providerSource();

    expect(ojActionButtonIds).toEqual(["ojLogin", "ojPreviewSubmit"]);
    expect(codexOAuthControlIds).toContain("codexBrowserLogin");
    expect(codexOAuthControlIds).toContain("codexDeviceLogin");
    expect(codexOAuthControlIds).toContain("codexTeachingModel");
    expect(codexOAuthControlIds).toContain("codexAutocompleteModel");
    expect(formalWorkflowControlIds).toEqual(expect.arrayContaining([
      "coachHint",
      "coachSendCustom",
      "ojLogin",
      "ojPreviewSubmit",
      "codexBrowserLogin",
      "codexDeviceLogin"
    ]));
    expect(source).toContain('command: "requestOjSubmissionPreview"');
    expect(source).toContain('command: "confirmOjSubmission"');
    expect(source).toContain('command: "startCodexBrowserLogin"');
    expect(source).toContain('command: "startCodexDeviceLogin"');
  });

  test("contains no comments in frontend sources or the embedded document", async () => {
    const violations = frontendCommentViolations(await frontendSources());

    expect(violations).toEqual([]);
  });
});
