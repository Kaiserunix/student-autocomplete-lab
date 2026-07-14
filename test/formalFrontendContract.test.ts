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

  test("renders the posted problem as a complete competition brief", async () => {
    const source = await providerSource();

    expect(source.indexOf('id="problemPoster"')).toBeLessThan(source.indexOf('id="importManualMarkdownFile"'));
    expect(source).toContain("POSTED PROBLEM / 题目张贴板");
    expect(source).toContain("选择 Markdown 题目");
    expect(source).toContain("从洛谷获取");
    expect(source).toContain("function appendBriefSection");
    expect(source).toContain('textSpan("难度 " + problem.difficulty, "tag dossierTag amber")');
    expect(source).toContain('goCoachButton.textContent = "进入作答现场"');
    expect(source).toContain('goCoachButton.className = "posterPrimaryAction"');
  });

  test("derives the session masthead and attempt evidence from live state", async () => {
    const source = await providerSource();

    expect(source).toContain("function renderSessionMasthead()");
    expect(source).toContain('setElementText("sessionProblemTitle"');
    expect(source).toContain('setElementText("sessionEditorState"');
    expect(source).toContain('setElementText("sessionAttemptState"');
    expect(source).toContain('textSpan("ATTEMPT / "');
    expect(source).toContain('className = "attemptEvidenceRail"');
    expect(source).toContain("renderSessionMasthead();");
  });

  test("distinguishes account, preview, and official verdict states", async () => {
    const source = await providerSource();

    expect(source).toContain('codexOAuthPanel.dataset.authState = auth.status');
    expect(source).toContain('codexOAuthPanel.classList.toggle("isConnected", signedIn)');
    expect(source).toContain('id="codexConnectionStamp"');
    expect(source).toContain('ojSubmissionStatus.dataset.submissionState = "preview"');
    expect(source).toContain('ojSubmissionStatus.dataset.submissionState = result.verdict ? "official" : "transport"');
    expect(source).toContain('textSpan("OFFICIAL VERDICT / 平台结果", "evidenceCode")');
    expect(source).toContain("AI 估计，不代表官方 OJ");
  });

  test("numbers learner evidence and keeps correction beside the record", async () => {
    const source = await providerSource();

    expect(source).toContain("entries.forEach((entry, index)");
    expect(source).toContain("renderSkillEntry(entry, evidenceSequence.get(entry.name) ?? index)");
    expect(source).toContain('textSpan("E-" + String(index + 1).padStart(2, "0"), "evidenceCode")');
    expect(source).toContain('card.dataset.evidenceStatus = entry.status || "candidate"');
    expect(source).toContain("这条不准");
    expect(source).toContain("查看证据");
    expect(source).toContain("回滚到此版本");
  });

  test("contains no comments in frontend sources or the embedded document", async () => {
    const violations = frontendCommentViolations(await frontendSources());

    expect(violations).toEqual([]);
  });
});
