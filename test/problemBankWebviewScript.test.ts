import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";

describe("problem bank webview script", () => {
  test("keeps the embedded webview JavaScript syntactically valid", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");
    const rawScript = source.match(/<script nonce="\$\{nonce\}">([\s\S]*?)<\/script>/)?.[1];

    expect(rawScript).toBeTruthy();
    const script = new Function(
      "starterPresetsJson",
      "practiceLanguageOptionsJson",
      `return \`${rawScript}\`;`
    )("[]", "[]") as string;
    expect(() => new Function(script!)).not.toThrow();
  });

  test("exposes Codex OAuth account actions and separate role model selectors", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    for (const id of [
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
    ]) {
      expect(source).toContain(`id="${id}"`);
    }
    for (const command of [
      "readCodexAuth",
      "startCodexBrowserLogin",
      "startCodexDeviceLogin",
      "cancelCodexLogin",
      "logoutCodex",
      "refreshCodexModels"
    ]) {
      expect(source).toContain(`command: "${command}"`);
    }
    expect(source).toContain('value="api-key"');
    expect(source).toContain('value="codex-oauth"');
    expect(source).toContain(".codexOAuthPanel[hidden]");
  });

  test("keeps fix-hint newlines escaped inside the embedded script", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain('issue.fixHint ? "\\\\n提示：" + issue.fixHint : ""');
  });

  test("routes completed action through AI review before archiving", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain('id="coachCompleted"');
    expect(source).toContain('id="completedList"');
    expect(source).toContain("requestCompletionReview()");
    expect(source).toContain("archiveOnComplete: true");
    expect(source).toContain("完成后复盘");
    expect(source).toContain("AI 已完成");
    expect(source).toContain("完成复盘并更新学习画像");
    expect(source).not.toContain('document.getElementById("coachCompleted").addEventListener("click", () => requestArchiveProblem("completed"))');
  });

  test("keeps archived problems selectable and coachable after learning score", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain("function selectedActiveProblem()");
    expect(source).toContain("function selectedArchivedProblem()");
    expect(source).toContain("function selectedCoachProblem()");
    expect(source).toContain("return selectedActiveProblem() || selectedArchivedProblem();");
    expect(source).toContain("const activeProblemSelected = state.problems.some((problem) => keyOf(problem) === state.selectedKey);");
    expect(source).toContain("const archivedProblemSelected = state.completedProblems.some((problem) => keyOf(problem) === state.selectedKey);");
    expect(source).toContain("(await this.loadCompletedProblems()).find(");
    expect(source).toContain("item.problemKey === problemKey || makeProblemKey(item) === problemKey");
    expect(source).toContain("const selectedKey = problemKey;");
    expect(source).toContain("const isArchivedCoachProblem = Boolean(selectedArchivedProblem());");
    expect(source).toContain("coachGiveUp.disabled = Boolean(isBusy || isArchivedCoachProblem);");
    expect(source).toContain("coachCompleted.disabled = Boolean(isBusy || isArchivedCoachProblem);");
    expect(source).toContain("复盘归档题");
  });

  test("exposes direct problem deletion without archiving", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain('command: "deleteProblem"');
    expect(source).toContain("handleDeleteProblemRequest");
    expect(source).toContain("requestDeleteProblem");
    expect(source).toContain('requestDeleteProblem(keyOf(problem), "active")');
    expect(source).toContain('requestDeleteProblem(keyOf(problem), "completed")');
    expect(source).toContain('deleteScope: "active" | "completed"');
    expect(source).toContain("直接删除");
    expect(source).toContain("不写入已归档");
    expect(source).toContain("removeProblemFromCompletedArchive");
    expect(source).not.toContain("requestDeleteProblem(reason)");
  });

  test("makes the formal attempt workspace the first screen and keeps three Chinese dossier layers", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain('activePage: "ai"');
    expect(source).toContain('switchPage("ai")');
    expect(source).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(source).toContain('id="tabProblem"');
    expect(source).toContain('id="tabAi"');
    expect(source).not.toContain('id="tabSearch"');
    expect(source).toContain('id="problemPage"');
    expect(source).toContain('id="aiPage"');
    expect(source).not.toContain('id="searchPage"');
    expect(source).toContain('id="tabSkill"');
    expect(source).toContain(">作答现场<");
    expect(source).toContain(">题目张贴板<");
    expect(source).toContain(">学习档案<");
    expect(source).toContain("AI 下次会这样教你");
    expect(source).toContain('id="coachQuestion"');
    expect(source).toContain('id="coachHint"');
    expect(source).toContain('id="coachFollowUp"');
    expect(source).toContain('id="coachSendCustom"');
    expect(source).toContain('id="coachCompleted"');
    expect(source).not.toContain('id="coachAsk"');
    expect(source).not.toContain('id="coachRecommend"');
    expect(source).not.toContain('id="coachSolved"');
    expect(source).not.toContain('id="coachSubmitCheck"');
    expect(source).toContain('id="coachAutocomplete"');
    expect(source).toContain('class="coachQuestionActions"');
    expect(source).toContain("追问 / 闲聊");
    expect(source).toContain("吐槽两句都可以");
    expect(source).toContain(">发送<");
    expect(source).toContain(">继续追问<");
    expect(source).toContain('function sendCustomFollowUp()');
    expect(source).toContain('document.getElementById("coachSendCustom").addEventListener("click", () => sendCustomFollowUp())');
    expect(source).toContain('document.getElementById("coachFollowUp").addEventListener("click", () => requestAiCoach("followUp"))');
    expect(source).toContain('document.getElementById("coachHint").addEventListener("click", () => requestAiCoach("hint"))');
    expect(source).toContain('source !== "custom"');
    expect(source).toContain("请根据上一轮内容继续讲");
    expect(source).toContain('if ("selectedKey" in data)');
    expect(source).not.toContain("data.selectedKey || state.selectedKey");
    expect(source).not.toContain("planned for the next slice");
    expect(source).not.toContain('document.getElementById("coachRecommend").addEventListener');
    expect(source).not.toContain('document.getElementById("coachSolved").addEventListener');
    expect(source).not.toContain('document.getElementById("coachSubmitCheck").addEventListener');
    expect(source).toContain('document.getElementById("coachAutocomplete").addEventListener("click", () => requestAutocompletePreview())');
    expect(source).toContain('command: "requestAutocompletePreview"');
    expect(source).toContain("event.ctrlKey && event.key === \"Enter\"");
    expect(source).toContain('type: "coachFollowUp"');
    expect(source).toContain("renderCoachFollowUp(data)");
    expect(source).toContain("appendCoachFollowUpTurn");
    expect(source).toContain('id="coachOjVerdict"');
    expect(source).toContain('<details id="accountModelDrawer" class="aiConfigBox accountModelDrawer">');
    expect(source).toContain("<summary>账户与模型</summary>");
    expect(source.indexOf('<div class="field coachAskBox">')).toBeLessThan(source.indexOf('id="accountModelDrawer"'));
    expect(source.indexOf('<div id="aiResponse" class="aiResponse">')).toBeLessThan(source.indexOf('id="accountModelDrawer"'));
    expect(source).toContain('label for="aiBaseUrl">分析接口 Base URL</label>');
    expect(source).toContain('label for="aiAutocompleteBaseUrl">补全接口 Base URL</label>');
    expect(source).toContain('label for="aiApiKey">API Key / 密钥</label>');
    expect(source).toContain('id="aiConfigMode"');
    expect(source).toContain('id="aiAutocompleteFormat"');
    expect(source).toContain('command: "saveAiConfig"');
    expect(source).toContain('id="fetchAiModels"');
    expect(source).toContain('id="runAiHealthCheck"');
    expect(source).toContain('id="aiModelResults"');
    expect(source).toContain('command: "fetchAiModels"');
    expect(source).toContain('command: "runAiHealthCheck"');
    expect(source).toContain("Provider Health Check");
    expect(source).toContain('type: "aiHealthCheckResult"');
    expect(source).toContain("renderAiHealthCheckResult(data)");
    expect(source).toContain('renderAiModelResults(data)');
    expect(source).toContain("设为分析");
    expect(source).toContain("设为补全");
    expect(source).toContain('command: "requestOptimizationReview"');
    expect(source).toContain("renderOptimizationReport(data.optimizationReport)");
    expect(source).toContain("buildLuoguMcpRecommendationCandidates");
    expect(source).toContain("Luogu MCP：搜索 ");
    expect(source).toContain("luoguMcpQueryCount");
    expect(source).toContain("课程调度解释");
    expect(source).toContain("为什么不是更难");
    expect(source).toContain("为什么不是重复上一题");
    expect(source).toContain("requestSubmissionJudge(keyOf(problem))");
    expect(source).toContain("找错复盘");
    expect(source).toContain("requestSolutionScore(keyOf(problem))");
    expect(source).toContain("优化复盘");
    expect(source).toContain("AI 估计，不代表官方 OJ");
    expect(source).toContain('command: "requestSolutionScore"');
    expect(source).toContain("const rawStudentRequest = coachQuestion.value.trim();");
    expect(source).toContain('action === "followUp" && !rawStudentRequest && source !== "custom"');
    expect(source).toContain("正在发送你的追问：");
    expect(source).toContain("coachThreads: {}");
    expect(source).toContain("previousCoachTurn: summarizeCoachThreadForPrompt(keyOf(problem))");
    expect(source).toContain("appendCoachTurn(problemKey, data, report, localized)");
    expect(source).toContain("workflowAudit: result.audit");
    expect(source).toContain("appendContextAudit(data.workflowAudit)");
    expect(source).toContain("上下文边界");
    expect(source).not.toContain('command: "requestSolutionScore",\n        problemKey: keyOf(problem),\n        studentRequest: coachQuestion.value.trim(),\n        ojVerdict: {\n          status: "AC"\n        }');
  });

  test("connects a trusted one-time multi-platform submission host flow", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain('message.command === "requestOjLogin"');
    expect(source).toContain('message.command === "requestOjSubmissionPreview"');
    expect(source).toContain('message.command === "confirmOjSubmission"');
    expect(source).toContain("vscode.workspace.isTrusted");
    expect(source).toContain("SubmissionConfirmationStore");
    expect(source).toContain("editor.document.save()");
    expect(source).toContain("parseSubmissionTarget");
    expect(source).toContain("checkOnlineJudgeTools");
    expect(source).toContain("submitWithOnlineJudgeTools");
    expect(source).toContain("pollCodeforcesVerdict");
    expect(source).toContain('type: "ojSubmissionPreview"');
    expect(source).toContain('type: "ojSubmissionResult"');
    expect(source).not.toContain("result.stdout");
    expect(source).not.toContain("result.stderr");
  });

  test("renders an explicit two-step multi-platform submission confirmation", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain('id="ojProblemUrl"');
    expect(source).toContain('id="ojPlatform"');
    expect(source).toContain('<option value="atcoder">AtCoder</option>');
    expect(source).toContain('id="ojCodeforcesHandle"');
    expect(source).toContain('id="ojLogin"');
    expect(source).toContain('id="ojPreviewSubmit"');
    expect(source).toContain('id="ojSubmissionPanel"');
    expect(source).toContain('id="submissionDocket"');
    expect(source).toContain("提交公文夹");
    expect(source).toContain("打开真实 OJ 提交流程");
    expect(source).toContain("提交前确认");
    expect(source).toContain("确认并提交一次");
    expect(source).toContain("不会自动重试提交");
    expect(source).toContain("renderOjSubmissionPreview(data)");
    expect(source).toContain("renderOjSubmissionResult(data)");
    expect(source).toContain('command: "requestOjLogin", platform: ojPlatform.value');
    expect(source).toContain("platform: ojPlatform.value");
    expect(source).toContain("confirmButton.remove()");
    expect(source).toContain('coachOjVerdict.value = "UNKNOWN";');
    expect(source).toContain('state.ojVerdict = "UNKNOWN";');
    expect(source).toContain('data.type === "ojSubmissionPreview"');
    expect(source).toContain('data.type === "ojSubmissionResult"');
  });

  test("keeps the coach UI output-first and touchable in the narrow sidebar", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain(".coachMetaGrid");
    expect(source).toContain("grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));");
    expect(source).toContain("补全不读题面");
    expect(source.indexOf('<div id="aiResponse" class="aiResponse">')).toBeLessThan(
      source.indexOf('<div class="field coachAskBox">')
    );
    expect(source.indexOf('<div id="aiResponse" class="aiResponse">')).toBeLessThan(
      source.indexOf('<div class="coachActions">')
    );
    expect(source).toContain(".coachActions button:first-child");
    expect(source).toContain(".coachQuestionActions button");
    expect(source).toContain("@media (max-width: 360px)");
    expect(source).toContain(".skillActionRow");
    expect(source).toContain(".detailActions");
  });

  test("shows context boundary audits for AI diagnosis and autocomplete preview", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain("function autocompletePreviewAudit()");
    expect(source).toContain('included: ["student_code_prefix_suffix", "language", "file_path", "code_habits"]');
    expect(source).toContain('"problem_statement"');
    expect(source).toContain('"teacher_pack"');
    expect(source).toContain('"standard_answer"');
    expect(source).toContain("contextAudit");
    expect(source).toContain("appendContextAudit(data.contextAudit)");
    expect(source).toContain('included: ["problem_statement", "student_code", "recent_hints", "student_profile", "teacher_pack_reference"]');
    expect(source).toContain("lessonReportContextAudit(report)");
    expect(source).toContain("已使用：");
    expect(source).toContain("未使用：");
    expect(source).toContain("不会读取题面、Teacher Pack 或标准答案");
  });

  test("exposes beta English UI and AI-output switches", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain('id="uiLanguage"');
    expect(source).toContain('command: "saveUiLanguage"');
    expect(source).toContain('uiLanguage: "zh"');
    expect(source).toContain('value="en">English');
    expect(source).toContain('option value="en"');
    expect(source).toContain('responseLanguage === "en" ? "en-US"');
    expect(source).toContain("applyUiLanguage()");
    expect(source).toContain("AI Coach");
    expect(source).toContain("Problems");
    expect(source).toContain("Learning Profile");
  });

  test("persists Student Skill updates from AI coaching actions", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain("studentSkillPath()");
    expect(source).toContain("studentSkillVersionsDir()");
    expect(source).toContain("runCoachDiagnosisWorkflow");
    expect(source).toContain("saveStudentSkill(this.studentSkillPath()");
    expect(source).toContain("archiveStudentSkillVersion(");
    expect(source).toContain("this.studentSkillVersionsDir()");
    expect(source).toContain("studentSkillMerge");
  });

  test("exposes Student Skill review controls for disable and rollback", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain('id="tabSkill"');
    expect(source).toContain('id="skillPage"');
    expect(source).toContain('id="studentSkillPanel"');
    expect(source).toContain('id="studentSkillVersions"');
    expect(source).toContain("这条不准");
    expect(source).toContain("查看证据");
    expect(source).toContain('command: "recordStudentSkillFeedback"');
    expect(source).toContain("handleStudentSkillFeedbackRequest");
    expect(source).toContain("renderStudentSkill()");
    expect(source).toContain('command: "disableStudentSkill"');
    expect(source).toContain('command: "rollbackStudentSkill"');
    expect(source).toContain("handleDisableStudentSkillRequest");
    expect(source).toContain("handleRollbackStudentSkillRequest");
    expect(source).toContain("listStudentSkillVersions");
  });

  test("does not rely on blocked browser dialogs for webview actions", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).not.toContain("prompt(");
    expect(source).not.toContain("confirm(");
    expect(source).not.toContain("alert(");
    expect(source).toContain("renderEvidenceDetails");
    expect(source).toContain("defaultSkillFeedbackNoteForWebview");
  });

  test("renders AI and problem text through a safe markdown renderer", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain("function markdownBlock(text, className)");
    expect(source).toContain("function parseMarkdownBlocks(text)");
    expect(source).toContain("function appendMarkdownBlock(root, block)");
    expect(source).toContain('block.appendChild(markdownBlock(bodyText, "hint"));');
    expect(source).toContain('const block = markdownBlock(bodyText, "textBlock markdownBody");');
    expect(source).toContain("appendInlineMarkdown");
    expect(source).toContain("appendMarkdownLink");
    expect(source).toContain("function appendMathInline(parent, source)");
    expect(source).toContain("function normalizeInlineMathText(source)");
    expect(source).toContain('appendMathInline(parent, value.slice(next.start + 1, end));');
    expect(source).toContain("mathInline");
    expect(source).toContain("mathSup");
    expect(source).toContain("function appendMathTextWithScripts(parent, text)");
    expect(source).toContain("function readMathScript(value, start)");
    expect(source).toContain("≤");
    expect(source).toContain("markdownQuote");
    expect(source).toContain("markdownParagraph");
    expect(source).toContain("markdownBody");
    expect(source).not.toContain("math.textContent = value.slice(next.start, end + 1);");
    expect(source).not.toContain("marked.parse");
    expect(source).not.toContain(".innerHTML = markdown");
  });

  test("renders more-specific AI hints as a separate stronger coaching layer", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain('data.action === "specific"');
    expect(source).toContain('data.action === "followUp"');
    expect(source).toContain("rawSpecificHint");
    expect(source).toContain("specificHintTitle");
    expect(source).toContain("checkpointTitle");
    expect(source).toContain("microStepsTitle");
    expect(source).toContain("optionalDetailsBlock");
    expect(source).toContain("requestFollowUpWithText");
    expect(source).toContain("讲简单点");
    expect(source).toContain("再讲简单点");
    expect(source).toContain("继续追问");
    expect(source).toContain("小例子");
    expect(source).toContain("更具体的下一步");
  });

  test("uses Markdown file import instead of in-panel problem paste", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain('<details class="panel manualPastePanel ledgerPanel" open>');
    expect(source).toContain("<summary>Markdown 文件导入</summary>");
    expect(source).toContain('id="importManualMarkdownFile"');
    expect(source).toContain('command: "importManualMarkdownFile"');
    expect(source).toContain("showOpenDialog");
    expect(source).toContain("AI 写题规范");
    expect(source).toContain("handleManualMarkdownFileImport");
    expect(source).toContain("buildManualProblemFromMarkdownFile");
    expect(source).toContain("sourceUrl: fileUri.toString()");
    expect(source).toContain("markdown: await readFile(fileUri.fsPath, \"utf8\")");
    expect(source).toContain("已从 Markdown 文件导入");
    expect(source).not.toContain('textarea id="manualStatement"');
    expect(source).not.toContain('command: "saveManual"');
    expect(source).not.toContain('id="manualPreview"');
    expect(source).not.toContain("function renderManualPreview()");
    expect(source).not.toContain("manualProblemTemplate");
    expect(source).not.toContain("Markdown 预览");
    expect(source).toContain("<summary>题号导入 / 搜索</summary>");
    expect(source).not.toContain('<details class="panel" open>\n        <summary>题号导入 / 搜索</summary>');
  });

  test("keeps AI actions on the coach page instead of duplicating them in problem detail", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain('actions.className = "detailActions";');
    expect(source).toContain('goCoachButton.textContent = "进入作答现场";');
    expect(source).toContain('goCoachButton.className = "posterPrimaryAction";');
    expect(source).toContain('id="coachHint"');
    expect(source).not.toContain('goCoachButton.addEventListener("click", () => requestAiCoach');
    expect(source).not.toContain('deleteButton.addEventListener("click", () => requestAiCoach');
  });

  test("routes next-problem recommendation through the rule engine", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain("handleRuleBasedRecommendationRequest");
    expect(source).toContain("recommendNextProblems");
    expect(source).toContain("mergeRecommendationCandidates");
    expect(source).toContain('type: "problemRecommendation"');
    expect(source).toContain("renderProblemRecommendation(data)");
    expect(source).toContain("规则推荐");
  });

  test("exposes internal-test recording only as a clearly labeled local panel", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

    expect(source).toContain('id="internalTestPanel"');
    expect(source).toContain("内测记录版");
    expect(source).toContain("internalTesting");
    expect(source).toContain('command: "copyInternalTestSummary"');
    expect(source).toContain("renderInternalTesting()");
    expect(source).toContain("本地记录");
    expect(source).toContain("损坏记录");
  });
});
