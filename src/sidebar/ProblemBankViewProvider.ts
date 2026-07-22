import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { appendAttemptEventToSession, ensureAttemptSession, loadAttemptSessions } from "../attempt/store";
import type { AttemptStorePaths, CoachThreadTurn } from "../attempt/schema";
import { problemRefFromRecord } from "../attempt/session";
import { buildAutocompleteInputFromText, extractStudentCodeFromText } from "../autocomplete/context";
import { requestMimoAutocompleteDetailed } from "../autocomplete/mimoAutocomplete";
import type { CodexServices } from "../codex/codexServices";
import { sanitizeCodexPublicError } from "../codex/codexAuthService";
import type { CodexModelService, CodexModelsView } from "../codex/codexModelService";
import {
  type AiConfigView,
  type AiProviderConfigUpdate,
  type AiProviderMode,
  type ModelEnv
} from "../config/modelEnv";
import {
  buildAiConfigViewFromVsCode,
  loadModelEnvFromVsCode,
  saveAiConfigToVsCode
} from "../config/vscodeModelEnv";
import {
  createInternalTestRecorder,
  type InternalTestEventInput,
  type InternalTestRecorder
} from "../internalTesting/internalTestRecorder";
import { requestChatCompletionText, type ChatCompletionProviderConfig } from "../models/chatCompletionsClient";
import type { CompletionProviderConfig } from "../models/completionsClient";
import { listProviderModels } from "../models/providerModelsClient";
import { routeAutocompleteModel, routeTeachingModel } from "../models/modelRouter";
import type { ModelTextTransport } from "../models/modelTextTransport";
import { toPublicSkillPlanAudit } from "../skills/auditView";
import type { SkillPlanAudit } from "../skills/types";
import { OjMcpBroker } from "../oj/broker";
import { ojProblemDocumentToRecord } from "../oj/problemDocument";
import { ojPlatformIds, type OjPlatformId, type OjProblemSummary } from "../oj/types";
import {
  clearNowCoderSession,
  clearRemoteOjKey,
  isRemoteOjPlatform,
  promptAndStoreNowCoderSession,
  promptAndStoreRemoteOjKey,
  reloadVsCodeOjBroker
} from "../oj/vscodeProviderConfiguration";
import { fetchLuoguProblem } from "../problemBank/luoguClient";
import { fetchLuoguProblemSet } from "../problemBank/luoguProblemSetClient";
import { searchLuoguProblemSets } from "../problemBank/luoguSearchClient";
import type { ProblemRecord, ProblemSetRecord } from "../problemBank/types";
import { appendJsonlRecord, readJsonlRecords, writeJsonlRecords } from "../storage/jsonlStore";
import { createStudentAutocompleteStoragePaths, type StudentAutocompleteStoragePaths } from "../storage/StoragePaths";
import { pollCodeforcesVerdict } from "../submission/codeforcesVerdict";
import { SubmissionConfirmationStore } from "../submission/confirmationStore";
import { checkOnlineJudgeTools, submitWithOnlineJudgeTools } from "../submission/onlineJudgeTools";
import { getSubmissionPlatformCapability, parseSubmissionTarget } from "../submission/submissionTarget";
import type { EditorSubmissionIdentity, OjSubmissionResult, SubmissionPlatform } from "../submission/types";
import { buildAttemptEvent, summarizeAttemptEvents, type AttemptEvent } from "../teaching/attemptEvent";
import { requestMimoCoachFollowUpWithSkills } from "../teaching/coachFollowUp";
import { requestMimoLessonReport } from "../teaching/lessonReport";
import { buildLuoguMcpRecommendationCandidates } from "../teaching/luoguMcpRecommendationCandidates";
import { requestMimoTeachingDiagnosisWithSkills } from "../teaching/mimoTeacher";
import { requestMimoOptimizationReport, type OptimizationReport } from "../teaching/optimizationReport";
import {
  mergeRecommendationCandidates,
  recommendationCandidatesFromProblems
} from "../recommendation/candidatePool";
import { recommendNextProblems } from "../recommendation/rules";
import { requestMimoSolutionScore } from "../teaching/solutionScore";
import { hasSubstantiveStudentCode, normalizeScoreOjVerdict } from "../teaching/solutionScoreGate";
import { applyTeachingDiagnosis, profileSummary, type StudentProfile } from "../teaching/studentProfile";
import { loadStudentProfile, saveStudentProfile } from "../teaching/studentProfileStore";
import {
  applyStudentSkillPatch,
  studentSkillFromProfile,
  studentSkillSummaryForTeaching,
  type StudentSkill,
  type StudentSkillCorrectionType
} from "../teaching/studentSkill";
import {
  archiveStudentSkillVersion,
  listStudentSkillVersions,
  loadStudentSkill,
  rollbackStudentSkill,
  saveStudentSkill
} from "../teaching/studentSkillStore";
import { requestMimoSubmissionJudge } from "../teaching/submissionJudge";
import type { TeachingPainPoint } from "../teaching/teachingReport";
import {
  findTeacherPack,
  requestMimoTeacherPack,
  toTeacherPackReference,
  upsertTeacherPack,
  type TeacherPackRecord
} from "../teaching/teacherPack";
import type { OjVerdict } from "../teaching/types";
import { runCoachDiagnosisWorkflow } from "../teaching/workflow/actions";
import type { HostEvent } from "./hostEvents";
import { localizeTeachingDiagnosisReport } from "./localizeTeachingReport";
import { buildManualProblemFromMarkdownFile } from "./manualMarkdownImport";
import type { AiCoachAction, CoachResponseLanguage, WebviewMessage } from "./messageProtocol";
import {
  buildCompletedProblemRecord,
  type CompletedProblemRecord,
  type CompletionReason,
  removeProblemFromCompletedArchive,
  removeProblemFromActiveQueue,
  summarizePainSnapshot
} from "./problemArchive";
import {
  buildPracticeFileContent,
  buildPracticeFileRelativePath,
  practiceLanguageOptions,
  type PracticeLanguage
} from "./practiceFile";
import { buildSidebarTeachingContext } from "./sidebarTeachingContext";
import { createWebviewNonce } from "./html";
import type {
  AiHealthCheckResult,
  AiHealthCheckStep,
  AiRuntimeStatus,
  ProblemBankStateView,
  SavedProblemRecord,
  StarterPreset,
  StudentSkillVersionView,
  UiLanguage
} from "./stateView";
import { normalizeUiLanguage as normalizeSidebarUiLanguage } from "./webview/i18n";

const starterPresets: StarterPreset[] = [
  {
    id: "diagnostic",
    title: "初始诊断",
    subtitle: "用 6 道低门槛题先观察输入、循环、数组、输出格式痛点。",
    problemIds: ["P1001", "P5703", "P5704", "P5705", "P1427", "P1428"],
    painPoints: ["输入解析", "表达式建模", "字符串/字符", "循环终止", "数组计数", "输出格式"]
  },
  {
    id: "input-output",
    title: "跳过诊断：输入输出",
    subtitle: "从最基础的读入、计算、格式输出开始，不做算法压力测试。",
    problemIds: ["P1001", "P5703", "P5704", "P5705", "P5706", "P5708"],
    painPoints: ["读题转公式", "数值类型", "保留小数", "单行输出", "基础调试"]
  }
];

export class ProblemBankViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "studentAutocomplete.problemBankWebview";

  private readonly internalRecorder: InternalTestRecorder;
  private readonly storagePaths: StudentAutocompleteStoragePaths;
  private readonly submissionConfirmations = new SubmissionConfirmationStore();
  private codexModelsView: CodexModelsView = { models: [] };
  private codexModelsError?: string;
  private codexModelsRefresh?: Promise<void>;
  private webview?: vscode.Webview;
  private readonly recentOjSearchResults = new Map<string, OjProblemSummary>();

  public constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly codexServices: CodexServices,
    private readonly ojBroker: OjMcpBroker
  ) {
    this.storagePaths = createStudentAutocompleteStoragePaths(context.globalStorageUri.fsPath);
    this.internalRecorder = createInternalTestRecorder({
      globalStoragePath: context.globalStorageUri.fsPath,
      packageName: String(context.extension.packageJSON.name ?? "student-autocomplete-lab"),
      displayName: String(context.extension.packageJSON.displayName ?? ""),
      version: String(context.extension.packageJSON.version ?? ""),
      workspaceFolder: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath
    });
    this.codexServices.auth.onDidChange((state) => {
      void this.handleCodexAuthChange(state.status).catch((error) => {
        console.warn("Student Autocomplete Codex state update failed", sanitizeCodexPublicError(errorMessage(error)));
      });
    });
  }

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.webview = webviewView.webview;
    webviewView.onDidDispose(() => {
      if (this.webview === webviewView.webview) {
        this.webview = undefined;
      }
    });
    webviewView.webview.options = {
      enableScripts: true
    };

    webviewView.webview.html = this.renderHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (message: WebviewMessage) => {
      try {
        const result = await this.handleMessage(message);
        webviewView.webview.postMessage(
          result ?? {
            type: "status",
            text: "已保存。"
          }
        );
      } catch (error) {
        webviewView.webview.postMessage({
          type: "status",
          tone: "error",
          text: error instanceof Error ? error.message : String(error)
        });
      }
    });
  }

  private async handleMessage(message: WebviewMessage): Promise<HostEvent | Record<string, unknown> | void> {
    if (message.command === "loadProblems") {
      return this.problemBankState();
    }

    if (message.command === "readCodexAuth") {
      const auth = await this.codexServices.auth.refresh();
      if (auth.status === "signed-in") {
        try {
          await this.refreshCodexModels();
        } catch {}
      }
      return this.problemBankState();
    }

    if (message.command === "startCodexBrowserLogin") {
      const auth = await this.codexServices.auth.startBrowserLogin();
      if (auth.status === "login-pending" && auth.authUrl) {
        await vscode.env.openExternal(vscode.Uri.parse(auth.authUrl));
      }
      return this.problemBankState(undefined, auth.status === "error" ? auth.error : "已在浏览器打开 Codex 登录页。");
    }

    if (message.command === "startCodexDeviceLogin") {
      const auth = await this.codexServices.auth.startDeviceLogin();
      return this.problemBankState(
        undefined,
        auth.status === "error" ? auth.error : "设备码已生成；复制代码并打开验证页完成登录。"
      );
    }

    if (message.command === "cancelCodexLogin") {
      await this.codexServices.auth.cancelLogin();
      return this.problemBankState(undefined, "已取消 Codex 登录。");
    }

    if (message.command === "logoutCodex") {
      await this.codexServices.auth.logout();
      this.codexModelsView = { models: [] };
      this.codexModelsError = undefined;
      return this.problemBankState(undefined, "已退出 Codex OAuth。");
    }

    if (message.command === "refreshCodexModels") {
      try {
        await this.refreshCodexModels();
        return this.problemBankState(undefined, `已刷新 ${this.codexModelsView.models.length} 个 Codex 模型。`);
      } catch {
        return this.problemBankState(undefined, `Codex 模型刷新失败：${this.codexModelsError ?? "未知错误"}`);
      }
    }

    if (message.command === "refreshOjProviders") {
      const providers = await this.ojBroker.refreshAll();
      const healthy = providers.filter((provider) => provider.overall === "healthy").length;
      return {
        type: "ojProviderStatus",
        providers,
        status: `题库连接检查完成：${healthy}/${providers.length} 个健康。`
      };
    }

    if (message.command === "configureNowCoderSession") {
      const stored = await promptAndStoreNowCoderSession(this.context);
      if (!stored) return { type: "status", text: "已取消更新牛客登录态。" };
      await reloadVsCodeOjBroker(this.context, this.ojBroker);
      return {
        type: "ojProviderStatus",
        providers: await this.ojBroker.refreshAll(),
        status: "牛客登录态已写入 SecretStorage，并已重启本地 MCP 连接。"
      };
    }

    if (message.command === "clearNowCoderSession") {
      await clearNowCoderSession(this.context);
      await reloadVsCodeOjBroker(this.context, this.ojBroker);
      return {
        type: "ojProviderStatus",
        providers: this.ojBroker.providerStatuses(),
        status: "已清除牛客登录态。公开搜题和导题仍可使用。"
      };
    }

    if (message.command === "configureOjRemoteKey") {
      const platform = normalizeRemoteOjPlatform(message.platform);
      const stored = await promptAndStoreRemoteOjKey(this.context, platform);
      if (!stored) return { type: "status", text: "已取消更新托管 MCP 访问密钥。" };
      await reloadVsCodeOjBroker(this.context, this.ojBroker);
      return {
        type: "ojProviderStatus",
        providers: await this.ojBroker.refreshAll(),
        status: `${platform} 的访问密钥已写入 SecretStorage。`
      };
    }

    if (message.command === "clearOjRemoteKey") {
      const platform = normalizeRemoteOjPlatform(message.platform);
      await clearRemoteOjKey(this.context, platform);
      await reloadVsCodeOjBroker(this.context, this.ojBroker);
      return {
        type: "ojProviderStatus",
        providers: this.ojBroker.providerStatuses(),
        status: `已清除 ${platform} 的托管 MCP 访问密钥。`
      };
    }

    if (message.command === "searchOjProblems") {
      const platform = normalizeOjPlatform(message.platform);
      const result = await this.ojBroker.searchProblems({ platform, query: message.query, limit: 20 });
      for (const item of result.items) {
        this.recentOjSearchResults.set(ojSearchKey(item.ref.platform, item.ref.nativeId), item);
      }
      return {
        type: "ojProblemSearchResults",
        platform,
        query: message.query.trim(),
        items: result.items.map((item) => ({
          platform: item.ref.platform,
          nativeId: item.ref.nativeId,
          title: item.title,
          sourceUrl: item.ref.url,
          difficulty: item.difficulty?.label ?? (item.difficulty?.value === undefined ? undefined : String(item.difficulty.value)),
          tags: item.tags.map((tag) => tag.name),
          canImport: item.ref.platform !== "codeforces"
        })),
        nextCursor: result.nextCursor
      };
    }

    if (message.command === "importOjProblem") {
      const platform = normalizeOjPlatform(message.platform);
      const nativeId = message.nativeId.trim();
      const summary = this.recentOjSearchResults.get(ojSearchKey(platform, nativeId));
      if (!summary) throw new Error("这条搜索结果已失效，请重新搜索后再导入。");
      const problem = ojProblemDocumentToRecord(await this.ojBroker.fetchProblem(summary));
      await this.saveProblem(problem);
      const teacherPack = await this.tryPrepareTeacherPack(problem);
      const practiceFile = message.createFile
        ? await this.createPracticeFile(problem, normalizePracticeLanguage(message.language))
        : undefined;
      const fileSuffix = practiceFile ? ` 已创建练习文件：${practiceFile.relativePath}` : "";
      const packSuffix = teacherPack ? " 已生成隐藏 Teacher Pack。" : " Teacher Pack 将在首次 AI 分析时尝试生成。";
      return this.problemBankState(makeProblemKey(problem), `已从 ${platform} 导入 ${problem.id}。${fileSuffix}${packSuffix}`, {
        createdFile: practiceFile,
        teacherPackReady: Boolean(teacherPack)
      });
    }

    if (message.command === "openOjProblem") {
      const platform = normalizeOjPlatform(message.platform);
      const summary = this.recentOjSearchResults.get(ojSearchKey(platform, message.nativeId));
      if (!summary) throw new Error("这条搜索结果已失效，请重新搜索后再打开。");
      await vscode.env.openExternal(vscode.Uri.parse(summary.ref.url));
      return { type: "status", text: `已在浏览器打开 ${summary.ref.nativeId}。` };
    }

    if (message.command === "openOjSettings") {
      await vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "@ext:kaiserunix.student-autocomplete-lab studentAutocomplete.oj"
      );
      return { type: "status", text: "已打开题库连接设置。" };
    }

    if (message.command === "importLuogu") {
      const problem = await fetchLuoguProblem(message.pid.trim());
      await this.saveProblem(problem);
      const teacherPack = await this.tryPrepareTeacherPack(problem);
      const practiceFile = message.createFile
        ? await this.createPracticeFile(problem, normalizePracticeLanguage(message.language))
        : undefined;
      const fileSuffix = practiceFile ? " 练习文件已创建。" : "";
      return this.problemBankState(makeProblemKey(problem), `已导入 ${problem.id}。${fileSuffix}`, {
        createdFile: practiceFile,
        teacherPackReady: Boolean(teacherPack)
      });
    }

    if (message.command === "importPreset") {
      const preset = starterPresets.find((item) => item.id === message.presetId);
      if (!preset) {
        throw new Error(`未知预设：${message.presetId}`);
      }

      const result = await this.importLuoguProblems(preset.problemIds);
      const selectedKey = result.imported[0] ? makeProblemKey(result.imported[0]) : undefined;
      const failedSuffix = result.failed.length > 0 ? `；${result.failed.length} 题下载失败` : "";
      return this.problemBankState(selectedKey, `已导入「${preset.title}」${result.imported.length} 题${failedSuffix}。`);
    }

    if (message.command === "searchLuoguProblemSets") {
      const results = await searchLuoguProblemSets(message.keyword);
      return {
        type: "problemSetSearchResults",
        keyword: message.keyword,
        total: results.total,
        items: results.items.slice(0, 20)
      };
    }

    if (message.command === "saveAiConfig") {
      return this.handleSaveAiConfigRequest(message.config);
    }

    if (message.command === "fetchAiModels") {
      return this.handleFetchAiModelsRequest(message.config);
    }

    if (message.command === "runAiHealthCheck") {
      return this.handleRunAiHealthCheckRequest(message.config);
    }

    if (message.command === "saveUiLanguage") {
      return this.handleSaveUiLanguageRequest(message.language);
    }

    if (message.command === "importLuoguProblemSet") {
      const problemSet = await fetchLuoguProblemSet(message.id.trim());
      await this.saveProblemSet(problemSet);
      const summaries = problemSet.problems.map((problem): SavedProblemRecord => ({
        platform: "luogu",
        id: problem.id,
        title: problem.title,
        sourceUrl: problem.sourceUrl,
        difficulty: problem.difficulty,
        tags: problem.tags,
        statement: "",
        inputFormat: "",
        outputFormat: "",
        samples: [],
        sourceSetId: problemSet.id,
        savedAt: new Date().toISOString()
      }));
      await this.upsertProblems(summaries);

      const selectedKey = summaries.length > 0 ? makeProblemKey(summaries[0]) : undefined;
      return this.problemBankState(selectedKey, `已导入题单《${problemSet.title}》，共 ${summaries.length} 题。`);
    }

    if (message.command === "importManualMarkdownFile") {
      return this.handleManualMarkdownFileImport();
    }

    if (message.command === "requestAiCoach") {
      if (message.action === "recommend") {
        return this.handleRuleBasedRecommendationRequest(message.problemKey);
      }

      if (message.action === "giveUp") {
        return this.handleLessonReportRequest(message.problemKey, message.studentRequest);
      }

      return this.handleAiCoachRequest(
        message.action,
        message.problemKey,
        message.ojVerdict,
        normalizeCoachResponseLanguage(message.responseLanguage),
        message.studentRequest,
        message.previousCoachTurn
      );
    }

    if (message.command === "requestSolutionScore") {
      return this.handleSolutionScoreRequest(
        message.problemKey,
        message.ojVerdict,
        message.studentRequest,
        Boolean(message.archiveOnComplete)
      );
    }

    if (message.command === "requestOptimizationReview") {
      return this.handleOptimizationReviewRequest(message.problemKey, message.studentRequest);
    }

    if (message.command === "requestAutocompletePreview") {
      return this.handleAutocompletePreview();
    }

    if (message.command === "requestOjLogin") {
      return this.handleOjLoginRequest(message.platform);
    }

    if (message.command === "requestOjSubmissionPreview") {
      return this.handleOjSubmissionPreviewRequest(
        message.problemKey,
        message.problemUrl,
        message.platform,
        message.codeforcesHandle
      );
    }

    if (message.command === "confirmOjSubmission") {
      return this.handleOjSubmissionConfirmation(message.confirmationId);
    }

    if (message.command === "copyInternalTestSummary") {
      return {
        type: "internalTestSummary",
        summary: await this.internalRecorder.summary(),
        status: "已生成内测记录摘要。"
      };
    }

    if (message.command === "requestSubmissionJudge") {
      return this.handleSubmissionJudgeRequest(message.problemKey);
    }

    if (message.command === "archiveProblem") {
      return this.handleArchiveProblemRequest(message.problemKey, normalizeCompletionReason(message.reason));
    }

    if (message.command === "deleteProblem") {
      return this.handleDeleteProblemRequest(message.problemKey, message.deleteScope);
    }

    if (message.command === "disableStudentSkill") {
      return this.handleDisableStudentSkillRequest(message.skillName, message.reason);
    }

    if (message.command === "recordStudentSkillFeedback") {
      return this.handleStudentSkillFeedbackRequest(message.skillName, message.feedbackType, message.note);
    }

    if (message.command === "rollbackStudentSkill") {
      return this.handleRollbackStudentSkillRequest(message.versionId);
    }

    throw new Error(`未知的侧栏动作：${(message as { command: string }).command}`);
  }

  private problemsPath(): string {
    return this.storagePaths.problems;
  }

  private profilePath(): string {
    return this.storagePaths.studentProfile;
  }

  private studentSkillPath(): string {
    return this.storagePaths.studentSkill;
  }

  private studentSkillVersionsDir(): string {
    return this.storagePaths.studentSkillVersionsDir;
  }

  private completedProblemsPath(): string {
    return this.storagePaths.completedProblems;
  }

  private attemptEventsPath(): string {
    return this.storagePaths.attemptEvents;
  }

  private attemptSessionsPath(): string {
    return this.storagePaths.attemptSessions;
  }

  private teacherPacksPath(): string {
    return this.storagePaths.teacherPacks;
  }

  private problemSetsPath(): string {
    return this.storagePaths.problemSets;
  }

  private modelEnvPath(): string | undefined {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      return undefined;
    }

    return path.join(workspaceFolder.uri.fsPath, "secrets", "models.env");
  }

  private async loadRuntimeModelEnv(): Promise<ModelEnv> {
    return loadModelEnvFromVsCode(this.context, this.modelEnvPath());
  }

  private async problemBankState(
    selectedKey?: string,
    status?: string,
    extra: Record<string, unknown> = {}
  ): Promise<ProblemBankStateView> {
    const problems = await this.loadSavedProblems();
    const completedProblems = await this.loadCompletedProblems();
    const studentSkillState = await this.loadStudentSkillState();
    const attemptSessions = await this.loadAttemptSessions();
    return {
      type: "problemBankState",
      problems,
      completedProblems: completedProblems.map((record) => ({
        ...record,
        painSummary: summarizePainSnapshot(record.painSnapshot)
      })),
      aiStatus: await this.aiRuntimeStatus(),
      aiConfig: await this.aiConfigView(),
      codexOAuth: {
        auth: this.codexServices.auth.getState(),
        ...this.codexModelsView,
        ...(this.codexModelsError ? { error: this.codexModelsError } : {})
      },
      activeEditor: this.activeEditorState(),
      uiLanguage: this.readUiLanguage(),
      studentSkill: studentSkillState.studentSkill,
      studentSkillVersions: studentSkillState.versions,
      attemptSessions,
      internalTesting: await this.internalRecorder.summary(),
      ojProviders: this.ojBroker.providerStatuses(),
      selectedKey:
        selectedKey ??
        (problems[0] ? makeProblemKey(problems[0]) : completedProblems[0] ? makeProblemKey(completedProblems[0]) : ""),
      status,
      ...extra
    };
  }

  private async loadStudentSkillState(
    profile?: StudentProfile
  ): Promise<{ studentSkill: StudentSkill; versions: StudentSkillVersionView[] }> {
    const studentProfile = profile ?? (await loadStudentProfile(this.profilePath()));
    return {
      studentSkill: await this.loadStudentSkillForProfile(studentProfile),
      versions: await this.studentSkillVersionViews()
    };
  }

  private async studentSkillVersionViews(): Promise<StudentSkillVersionView[]> {
    return (await listStudentSkillVersions(this.studentSkillVersionsDir()))
      .map(toStudentSkillVersionView)
      .reverse()
      .slice(0, 3);
  }

  private async handleSaveAiConfigRequest(config: AiProviderConfigUpdate): Promise<Record<string, unknown>> {
    await saveAiConfigToVsCode(this.context, {
      mode: normalizeAiProviderMode(config.mode),
      authMode: config.authMode,
      baseUrl: config.baseUrl?.trim() ?? "",
      autocompleteBaseUrl: config.autocompleteBaseUrl?.trim() ?? "",
      apiKey: config.apiKey,
      chatModel: config.chatModel?.trim() ?? "",
      autocompleteModel: config.autocompleteModel?.trim() ?? "",
      autocompleteFormat: normalizeAutocompleteFormat(config.autocompleteFormat)
    });

    return this.problemBankState(undefined, "AI 配置已保存到 VS Code Settings；API key 留空时已保留 SecretStorage 里的旧值。");
  }

  private async refreshCodexModels(): Promise<void> {
    if (this.codexModelsRefresh) {
      return this.codexModelsRefresh;
    }
    const pending = this.loadCodexModels();
    this.codexModelsRefresh = pending;
    try {
      await pending;
    } finally {
      if (this.codexModelsRefresh === pending) {
        this.codexModelsRefresh = undefined;
      }
    }
  }

  private async loadCodexModels(): Promise<void> {
    try {
      this.codexModelsView = await this.codexServices.models.listModels();
      this.codexModelsError = undefined;
    } catch (error) {
      this.codexModelsError = sanitizeCodexPublicError(error instanceof Error ? error.message : String(error));
      throw error;
    }
  }

  private async handleCodexAuthChange(status: string): Promise<void> {
    if (status === "signed-out") {
      this.codexModelsView = { models: [] };
      this.codexModelsError = undefined;
    } else if (status === "signed-in") {
      try {
        await this.refreshCodexModels();
      } catch {}
    }
    if (this.webview) {
      await this.webview.postMessage(await this.problemBankState());
    }
  }

  private async handleSaveUiLanguageRequest(language: UiLanguage): Promise<Record<string, unknown>> {
    const normalized = normalizeSidebarUiLanguage(language);
    await vscode.workspace.getConfiguration("studentAutocomplete.ui").update(
      "language",
      normalized,
      vscode.ConfigurationTarget.Global
    );

    return this.problemBankState(undefined, normalized === "en" ? "UI language saved: English." : "界面语言已保存为中文。");
  }

  private async handleFetchAiModelsRequest(config: AiProviderConfigUpdate): Promise<Record<string, unknown>> {
    const mode = normalizeAiProviderMode(config.mode);
    const env = await this.loadRuntimeModelEnv();
    const baseUrl = config.baseUrl?.trim() || savedBaseUrlForMode(env, mode);
    const apiKey = config.apiKey?.trim() || savedApiKeyForMode(env, mode);

    if (!baseUrl) {
      throw new Error("请先填写接口地址 Base URL，再拉取模型。");
    }
    if (!apiKey) {
      throw new Error("请先填写 API Key，或先保存一个可用的 API Key。");
    }

    const result = await listProviderModels({
      mode,
      baseUrl,
      apiKey,
      anthropicVersion: "2023-06-01"
    });

    await this.recordInternalTestEvent({
      kind: "state_loaded",
      action: "fetch_models",
      outcome: "success",
      payload: {
        mode,
        count: result.models.length
      }
    });

    return {
      type: "aiModelResults",
      mode,
      endpoint: result.endpoint,
      models: result.models,
      status: `已拉取 ${result.models.length} 个模型。`
    };
  }

  private async handleRunAiHealthCheckRequest(config: AiProviderConfigUpdate): Promise<Record<string, unknown>> {
    const mode = normalizeAiProviderMode(config.mode);
    const baseEnv = await this.loadRuntimeModelEnv();
    const env = applyAiConfigUpdateForHealthCheck(baseEnv, config);
    const knownSecrets = collectKnownSecrets(baseEnv, env, config);
    const checkedAt = new Date().toISOString();

    const models = await runModelListHealthCheck(
      env,
      mode,
      config,
      knownSecrets,
      this.codexServices.models
    );
    const chatSmoke = await runChatSmokeHealthCheck(
      env,
      config,
      knownSecrets,
      this.codexServices.text
    );
    const autocompleteSmoke = await runAutocompleteSmokeHealthCheck(
      env,
      config,
      knownSecrets,
      this.codexServices.text
    );
    const result: AiHealthCheckResult = {
      checkedAt,
      providerMode: mode,
      models,
      chatSmoke,
      autocompleteSmoke
    };
    const allPassed = [models, chatSmoke, autocompleteSmoke].every((step) => step.status === "pass");

    await this.recordInternalTestEvent({
      kind: "state_loaded",
      action: "ai_health_check",
      outcome: allPassed ? "success" : "failure",
      payload: {
        mode,
        models: models.status,
        chatSmoke: chatSmoke.status,
        autocompleteSmoke: autocompleteSmoke.status,
        modelCount: models.count ?? 0,
        chatModel: chatSmoke.model,
        autocompleteModel: autocompleteSmoke.model,
        autocompleteFormat: autocompleteSmoke.format
      }
    });

    return {
      type: "aiHealthCheckResult",
      result,
      status: allPassed
        ? "连接检测通过。"
        : "连接检测完成，有项目需要检查。"
    };
  }

  private async handleManualMarkdownFileImport(): Promise<Record<string, unknown>> {
    const selected = await vscode.window.showOpenDialog({
      title: "选择手动导入的 Markdown 题目",
      canSelectFiles: true,
      canSelectFolders: false,
      canSelectMany: false,
      filters: {
        Markdown: ["md", "markdown"],
        Text: ["txt"]
      }
    });
    if (!selected?.[0]) {
      return this.problemBankState(undefined, "已取消 Markdown 文件导入。");
    }

    const fileUri = selected[0];
    const problem = buildManualProblemFromMarkdownFile({
      filePath: fileUri.fsPath,
      sourceUrl: fileUri.toString(),
      markdown: await readFile(fileUri.fsPath, "utf8")
    });
    await this.saveProblem(problem);
    const teacherPack = await this.tryPrepareTeacherPack(problem);
    return this.problemBankState(makeProblemKey(problem), `已导入《${problem.title}》。`, {
      teacherPackReady: Boolean(teacherPack)
    });
  }

  private async handleArchiveProblemRequest(
    problemKey: string,
    reason: CompletionReason
  ): Promise<Record<string, unknown>> {
    const problems = await this.loadSavedProblems();
    const problem = problems.find((item) => makeProblemKey(item) === problemKey);
    if (!problem) {
      throw new Error("这道题已经不在练习队列里了。");
    }

    const profile = await loadStudentProfile(this.profilePath());
    const archivedProblem = buildCompletedProblemRecord({
      problem,
      completedAt: new Date().toISOString(),
      reason,
      painSnapshot: profileSummary(profile)
    });
    await writeJsonlRecords(this.problemsPath(), removeProblemFromActiveQueue(problems, problemKey));
    await this.upsertCompletedProblems([archivedProblem]);
    await this.appendAttemptEvent(
      problem,
      buildAttemptEvent({
        problemKey,
        problemId: problem.id,
        platform: problem.platform,
        kind: "archived",
        outcome: reason,
        occurredAt: archivedProblem.completedAt
      })
    );
    await this.recordInternalTestEvent({
      kind: "archive",
      problemKey,
      problemId: problem.id,
      platform: problem.platform,
      outcome: reason
    });

    const actionText = completionReasonLabel(reason);
    return this.problemBankState(problemKey, `${actionText} ${problem.id}，已跳过解析并归档当前痛点快照。`, {
      archivedProblem: {
        ...archivedProblem,
        painSummary: summarizePainSnapshot(archivedProblem.painSnapshot)
      }
    });
  }

  private async handleDeleteProblemRequest(
    problemKey: string,
    deleteScope: "active" | "completed"
  ): Promise<Record<string, unknown>> {
    const savedProblems = await this.loadSavedProblems();
    const completedProblems = await this.loadCompletedProblems();
    const activeProblem = savedProblems.find((problem) => makeProblemKey(problem) === problemKey);
    const completedProblem = completedProblems.find(
      (problem) => problem.problemKey === problemKey || makeProblemKey(problem) === problemKey
    );
    const problem = deleteScope === "active" ? activeProblem : completedProblem;
    if (!problem) {
      throw new Error("找不到要删除的题目。");
    }

    if (deleteScope === "active") {
      await writeJsonlRecords(this.problemsPath(), removeProblemFromActiveQueue(savedProblems, problemKey));
    } else {
      await writeJsonlRecords(this.completedProblemsPath(), removeProblemFromCompletedArchive(completedProblems, problemKey));
    }
    await this.appendAttemptEvent(
      problem,
      buildAttemptEvent({
        problemKey,
        problemId: problem.id,
        platform: problem.platform,
        kind: "archived",
        outcome: "removed",
        occurredAt: new Date().toISOString(),
        note: `direct_delete:${deleteScope}`
      })
    );
    await this.recordInternalTestEvent({
      kind: "archive",
      action: "delete_problem",
      problemKey,
      problemId: problem.id,
      platform: problem.platform,
      outcome: "deleted"
    });

    const nextProblems = await this.loadSavedProblems();
    const nextCompleted = await this.loadCompletedProblems();
    const nextSelectedKey = nextProblems[0]
      ? makeProblemKey(nextProblems[0])
      : nextCompleted[0]
        ? makeProblemKey(nextCompleted[0])
        : "";
    const scopeText = deleteScope === "active" ? "练习队列" : "已归档记录";
    return this.problemBankState(nextSelectedKey, `已从${scopeText}直接删除 ${problem.id}，不写入已归档。`);
  }

  private async handleAiCoachRequest(
    action: AiCoachAction,
    problemKey: string,
    ojVerdict?: OjVerdict,
    responseLanguage: CoachResponseLanguage = "zh",
    studentRequest?: string,
    previousCoachTurn?: string
  ): Promise<Record<string, unknown>> {
    const problem =
      (await this.loadSavedProblems()).find((item) => makeProblemKey(item) === problemKey) ??
      (await this.loadCompletedProblems()).find(
        (item) => item.problemKey === problemKey || makeProblemKey(item) === problemKey
      );
    if (!problem) {
      throw new Error("先在左侧选择一道题或已归档题。");
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error("先打开你的代码文件，AI 才能分析当前卡点。");
    }

    const route = routeTeachingModel(
      await this.loadRuntimeModelEnv(),
      this.codexServices.text
    );
    const config = route.config;
    const profile = await loadStudentProfile(this.profilePath());
    const studentSkill = await this.loadStudentSkillForProfile(profile);
    let coachSkillAudit: SkillPlanAudit | undefined;
    const teacherPack = await this.ensureTeacherPack(problem, config);
    const occurredAt = new Date().toISOString();
    const context = buildSidebarTeachingContext({
      problem,
      teacherPack: teacherPack ? toTeacherPackReference(teacherPack) : undefined,
      language: editor.document.languageId,
      studentCode: extractStudentCodeFromText(editor.document.getText()),
      profileSummary: studentSkillSummaryForTeaching(studentSkill),
      ojVerdict,
      requestPurpose: mergeRequestPurpose(describeAiCoachAction(action, responseLanguage), studentRequest, previousCoachTurn),
      responseLanguage: responseLanguage === "zh" ? "zh-CN" : responseLanguage === "en" ? "en-US" : "raw"
    });

    if (action === "followUp") {
      const followUpReport = await requestMimoCoachFollowUpWithSkills(
        config,
        {
          problem: context.problem,
          teacherPack: context.teacherPack,
          language: context.language,
          studentCode: context.studentCode,
          studentProfile: context.studentProfile,
          studentRequest: studentRequest?.trim() || "请把上一条提示讲得更详细但更容易懂。",
          previousCoachTurn,
          responseLanguage: context.responseLanguage
        },
        {
          studentSkill,
          capabilities: route.capabilities,
          onAudit: (audit) => {
            coachSkillAudit = audit;
          }
        }
      );
      const event = buildAttemptEvent({
          problemKey,
          problemId: problem.id,
          platform: problem.platform,
          kind: actionToAttemptEventKind(action),
          occurredAt,
          action,
          painPoints: [],
          model: config.model
        });
      await this.appendAttemptEvent(problem, event, [
        {
          role: "student",
          kind: event.kind,
          text: studentRequest?.trim() || "请把上一条提示讲得更详细但更容易懂。",
          occurredAt
        },
        {
          role: "assistant",
          kind: event.kind,
          text: compactMultiline([followUpReport.answer, followUpReport.tinyExample, followUpReport.nextAction]),
          occurredAt,
          model: config.model
        }
      ]
      );
      await this.recordInternalTestEvent({
        kind: "ai_coach",
        problemKey,
        problemId: problem.id,
        platform: problem.platform,
        action,
        model: config.model,
        payload: {
          followUpOnly: true,
          hasPreviousCoachTurn: Boolean(previousCoachTurn?.trim()),
          hasStudentRequest: Boolean(studentRequest?.trim()),
          coachSkillAudit
        }
      });
      const skillAudit = coachSkillAudit
        ? toPublicSkillPlanAudit("coach", coachSkillAudit)
        : undefined;

      return {
        type: "coachFollowUp",
        action,
        problemKey,
        model: config.model,
        report: followUpReport,
        skillAudit,
        status: `AI 已回答 ${problem.id} 的追问。`
      };
    }

    const result = await runCoachDiagnosisWorkflow({
      action: action === "specific" ? "specific" : "hint",
      problemKey,
      platform: problem.platform,
      context,
      profile,
      studentSkill,
      occurredAt,
      patchSource: config.model,
      diagnose: (diagnosisContext) =>
        requestMimoTeachingDiagnosisWithSkills(
          config,
          diagnosisContext,
          {
            studentSkill,
            action,
            capabilities: route.capabilities,
            onAudit: (audit) => {
              coachSkillAudit = audit;
            }
          }
        )
    });
    await saveStudentProfile(this.profilePath(), result.updatedProfile);
    await saveStudentSkill(this.studentSkillPath(), result.updatedStudentSkill);
    await archiveStudentSkillVersion(
      this.studentSkillVersionsDir(),
      result.updatedStudentSkill,
      `${action} ${problem.id} via ${config.model}`,
      occurredAt
    );
    const event = buildAttemptEvent(result.attemptEventInput);
    await this.appendAttemptEvent(problem, event, [
      {
        role: "student",
        kind: event.kind,
        text: studentRequest?.trim() || describeAiCoachAction(action, responseLanguage),
        occurredAt
      },
      {
        role: "assistant",
        kind: event.kind,
        text: compactMultiline([result.report.hint, result.report.specificHint, result.report.checkpoint]),
        occurredAt,
        model: config.model
      }
    ]
    );
    await this.recordInternalTestEvent({
      kind: "ai_coach",
      problemKey,
      problemId: problem.id,
      platform: problem.platform,
      action,
      painPoints: result.report.painPoints.map((painPoint) => painPoint.label),
      model: config.model,
      payload: {
        candidateSkill: result.report.skillUpdate?.candidate,
        skillMergeChangeCount: result.studentSkillMerge.changeSummary.length,
        workflowAudit: result.audit,
        coachSkillAudit
      }
    });
    const skillAudit = coachSkillAudit
      ? toPublicSkillPlanAudit("coach", coachSkillAudit)
      : undefined;

    return {
      type: "teachingDiagnosis",
      action,
      problemKey,
      model: config.model,
      report: result.report,
      localizedReport: localizeTeachingDiagnosisReport(result.report),
      profileSummary: profileSummary(result.updatedProfile),
      studentSkill: result.updatedStudentSkill,
      studentSkillVersions: await this.studentSkillVersionViews(),
      studentSkillSummary: studentSkillSummaryForTeaching(result.updatedStudentSkill),
      studentSkillMerge: result.studentSkillMerge,
      workflowAudit: result.audit,
      skillAudit,
      teacherPack: teacherPack
        ? {
            generatedAt: teacherPack.generatedAt,
            model: teacherPack.model,
            expectedAlgorithm: teacherPack.expectedAlgorithm,
            bruteForce: teacherPack.bruteForce
          }
        : undefined,
      status: `AI 已根据当前代码分析 ${problem.id}。`
    };
  }

  private async loadStudentSkillForProfile(profile: StudentProfile): Promise<StudentSkill> {
    const existing = await readTextIfExists(this.studentSkillPath());
    if (existing.trim().length > 0) {
      return loadStudentSkill(this.studentSkillPath(), profile.studentId);
    }

    return studentSkillFromProfile(profile);
  }

  private async handleDisableStudentSkillRequest(
    skillName: string,
    reason?: string
  ): Promise<Record<string, unknown>> {
    const name = skillName.trim();
    if (!name) {
      throw new Error("请选择要禁用的 Student Skill。");
    }

    const profile = await loadStudentProfile(this.profilePath());
    const studentSkill = await this.loadStudentSkillForProfile(profile);
    const occurredAt = new Date().toISOString();
    const disabledReason = reason?.trim() || "用户在 Student Skill 页面禁用：认为该规则暂不适合当前学习。";
    const merge = applyStudentSkillPatch(studentSkill, {
      source: "sidebar-user",
      occurredAt,
      disableSkills: [{ name, reason: disabledReason }]
    });
    await saveStudentSkill(this.studentSkillPath(), merge.skill);
    await archiveStudentSkillVersion(this.studentSkillVersionsDir(), merge.skill, `disable ${name}`, occurredAt);
    await this.recordInternalTestEvent({
      kind: "skill_feedback",
      action: "disabled",
      note: disabledReason,
      payload: {
        skillName: name,
        skillMergeChangeCount: merge.changeSummary.length
      }
    });

    return this.problemBankState(undefined, `已禁用 Skill：${name}。后续 AI 会把它当作人工纠偏处理。`);
  }

  private async handleStudentSkillFeedbackRequest(
    skillName: string,
    feedbackType: StudentSkillCorrectionType,
    note?: string
  ): Promise<Record<string, unknown>> {
    const name = skillName.trim();
    if (!name) {
      throw new Error("请选择要纠偏的学习画像条目。");
    }

    const occurredAt = new Date().toISOString();
    const feedbackNote = note?.trim() || defaultSkillFeedbackNote(feedbackType);
    const profile = await loadStudentProfile(this.profilePath());
    const studentSkill = await this.loadStudentSkillForProfile(profile);
    const merge = applyStudentSkillPatch(studentSkill, {
      source: "sidebar-user",
      occurredAt,
      corrections: [
        {
          type: feedbackType,
          target: name,
          note: feedbackNote,
          source: "sidebar-user",
          occurredAt
        }
      ]
    });
    await saveStudentSkill(this.studentSkillPath(), merge.skill);
    await archiveStudentSkillVersion(this.studentSkillVersionsDir(), merge.skill, `${feedbackType} ${name}`, occurredAt);
    await this.recordInternalTestEvent({
      kind: "skill_feedback",
      action: feedbackType,
      note: feedbackNote,
      payload: {
        skillName: name,
        skillMergeChangeCount: merge.changeSummary.length
      }
    });

    return this.problemBankState(undefined, studentSkillFeedbackStatus(feedbackType, name));
  }

  private async handleRollbackStudentSkillRequest(versionId: string): Promise<Record<string, unknown>> {
    const id = versionId.trim();
    if (!id) {
      throw new Error("请选择要回滚的 Student Skill 版本。");
    }

    const versions = await listStudentSkillVersions(this.studentSkillVersionsDir());
    const target = versions.find((version) => version.versionId === id);
    if (!target) {
      throw new Error(`找不到 Student Skill 版本：${id}`);
    }

    const occurredAt = new Date().toISOString();
    const rolledBackSkill = await rollbackStudentSkill(this.studentSkillPath(), target.path);
    await archiveStudentSkillVersion(
      this.studentSkillVersionsDir(),
      rolledBackSkill,
      `rollback to ${target.versionId}`,
      occurredAt
    );

    return this.problemBankState(
      undefined,
      `已回滚 Student Skill 到 rev ${target.revision}（${formatDateTimeForStatus(target.archivedAt)}）。`
    );
  }

  private async handleRuleBasedRecommendationRequest(problemKey: string): Promise<Record<string, unknown>> {
    const problems = await this.loadSavedProblems();
    const completedProblems = await this.loadCompletedProblems();
    const currentProblem =
      problems.find((item) => makeProblemKey(item) === problemKey) ||
      completedProblems.find((item) => item.problemKey === problemKey || makeProblemKey(item) === problemKey);
    if (!currentProblem) {
      throw new Error("先选择一道题或已归档题，推荐引擎需要知道当前题和当前阶段。");
    }

    const profile = await loadStudentProfile(this.profilePath());
    const studentSkill = await this.loadStudentSkillForProfile(profile);
    const attemptEvents = await this.loadAttemptEvents();
    const localCandidates = mergeRecommendationCandidates(recommendationCandidatesFromProblems(problems));
    const previewRecommendation = recommendNextProblems({
      profile,
      studentSkill,
      attemptEvents,
      candidates: localCandidates,
      currentProblemId: currentProblem.id,
      limit: 5
    });
    const luoguMcpCandidates = await buildLuoguMcpRecommendationCandidates(previewRecommendation.strategy.topPainPoints);
    const recommendation = recommendNextProblems({
      profile,
      studentSkill,
      attemptEvents,
      candidates: mergeRecommendationCandidates([...recommendationCandidatesFromProblems(problems), ...luoguMcpCandidates.candidates]),
      currentProblemId: currentProblem.id,
      limit: 5
    });
    const occurredAt = new Date().toISOString();
    await this.appendAttemptEvent(
      currentProblem,
      buildAttemptEvent({
        problemKey,
        problemId: currentProblem.id,
        platform: currentProblem.platform,
        kind: "recommendation_requested",
        occurredAt,
        painPoints: recommendation.strategy.topPainPoints.map((painPoint) => painPoint.label),
        note: `rule-engine targetDifficulty=${recommendation.strategy.targetDifficulty}`
      })
    );
    await this.recordInternalTestEvent({
      kind: "recommendation",
      problemKey,
      problemId: currentProblem.id,
      platform: currentProblem.platform,
      painPoints: recommendation.strategy.topPainPoints.map((painPoint) => painPoint.label),
      payload: {
        targetDifficulty: recommendation.strategy.targetDifficulty,
        recommendationCount: recommendation.recommendations.length,
        luoguMcpQueryCount: luoguMcpCandidates.queryCount,
        luoguMcpCandidateCount: luoguMcpCandidates.candidates.length,
        luoguMcpSearchHints: luoguMcpCandidates.searchHints,
        luoguMcpErrorCount: luoguMcpCandidates.errorMessages.length
      }
    });
    const recommendationLimitations =
      luoguMcpCandidates.errorMessages.length > 0
        ? "部分在线候选未返回，已继续使用本地题库。"
        : undefined;

    return {
      type: "problemRecommendation",
      problemKey,
      currentProblem: { id: currentProblem.id, title: currentProblem.title },
      recommendation,
      luoguMcp: luoguMcpCandidates,
      recommendationLimitations,
      profileSummary: profileSummary(profile),
      studentSkill,
      studentSkillVersions: await this.studentSkillVersionViews(),
      status: recommendationLimitations
        ? `${recommendationLimitations} 已推荐 ${recommendation.recommendations.length} 题。`
        : `已推荐 ${recommendation.recommendations.length} 题。`
    };
  }

  private async handleLessonReportRequest(problemKey: string, studentRequest?: string): Promise<Record<string, unknown>> {
    const problem = (await this.loadSavedProblems()).find((item) => makeProblemKey(item) === problemKey);
    if (!problem) {
      throw new Error("先在左侧选择一道题。");
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error("先打开你的代码文件，AI 才能进入讲解/补救阶段。");
    }

    const occurredAt = new Date().toISOString();
    const config = routeTeachingModel(await this.loadRuntimeModelEnv(), this.codexServices.text).config;
    const profile = await loadStudentProfile(this.profilePath());
    const attemptStats = summarizeAttemptEvents(await this.loadAttemptEvents(), problemKey);
    const teachingContext = buildSidebarTeachingContext({
      problem,
      language: editor.document.languageId,
      studentCode: extractStudentCodeFromText(editor.document.getText()),
      profileSummary: profileSummary(profile),
      requestPurpose: mergeRequestPurpose("学生点击「我放弃了」：进入讲解/补救阶段。", studentRequest),
      responseLanguage: "zh-CN"
    });
    const report = await requestMimoLessonReport(config, {
      problem: teachingContext.problem,
      language: teachingContext.language,
      studentCode: teachingContext.studentCode,
      studentProfile: teachingContext.studentProfile,
      studentRequest,
      hintCount: attemptStats.hintCount
    });
    const updatedProfile = applyTeachingDiagnosis(
      profile,
      {
        painPoints: report.painPoints,
        hint: report.minimalFixPath[0] ?? report.standardApproach,
        recommendation: report.remedialExercise.problemId
          ? {
              problemId: report.remedialExercise.problemId,
              reason: report.remedialExercise.reason
            }
          : undefined
      },
      occurredAt
    );
    await saveStudentProfile(this.profilePath(), updatedProfile);

    const archivedProblem = buildCompletedProblemRecord({
      problem,
      completedAt: occurredAt,
      reason: report.archiveReason,
      painSnapshot: profileSummary(updatedProfile),
      lessonReport: report
    });
    await writeJsonlRecords(this.problemsPath(), removeProblemFromActiveQueue(await this.loadSavedProblems(), problemKey));
    await this.upsertCompletedProblems([archivedProblem]);
    await this.appendAttemptEvent(
      problem,
      buildAttemptEvent({
        problemKey,
        problemId: problem.id,
        platform: problem.platform,
        kind: "lesson_reported",
        outcome: report.archiveReason,
        occurredAt,
        painPoints: report.painPoints.map((painPoint) => painPoint.label),
        model: config.model
      }),
      [
        {
          role: "student",
          kind: "lesson_reported",
          text: studentRequest?.trim() || "我放弃了，需要讲解/补救。",
          occurredAt
        },
        {
          role: "assistant",
          kind: "lesson_reported",
          text: compactMultiline([report.standardApproach, ...report.minimalFixPath]),
          occurredAt,
          model: config.model
        }
      ]
    );
    await this.recordInternalTestEvent({
      kind: "lesson_report",
      problemKey,
      problemId: problem.id,
      platform: problem.platform,
      outcome: report.archiveReason,
      painPoints: report.painPoints.map((painPoint) => painPoint.label),
      model: config.model,
      payload: {
        hintCount: attemptStats.hintCount,
        remedialExercise: report.remedialExercise.problemId
      }
    });

    return this.problemBankState(problemKey, `AI 已生成 ${problem.id} 的讲解/补救报告，并归档为错题。`, {
      lessonReport: {
        problem: { id: problem.id, title: problem.title },
        model: config.model,
        report
      },
      archivedProblem: {
        ...archivedProblem,
        painSummary: summarizePainSnapshot(archivedProblem.painSnapshot)
      },
      profileSummary: profileSummary(updatedProfile)
    });
  }

  private async handleSolutionScoreRequest(
    problemKey: string,
    ojVerdict?: OjVerdict,
    studentRequest?: string,
    archiveOnComplete = false
  ): Promise<Record<string, unknown>> {
    const savedProblems = await this.loadSavedProblems();
    const completedProblems = await this.loadCompletedProblems();
    const activeProblem = savedProblems.find((item) => makeProblemKey(item) === problemKey);
    const existingArchivedProblem = completedProblems.find(
      (item) => item.problemKey === problemKey || makeProblemKey(item) === problemKey
    );
    const problem = activeProblem ?? existingArchivedProblem;
    if (!problem) {
      throw new Error("先在左侧选择一道题，或在已归档列表里点学习评分。");
    }
    const isArchivedReview = Boolean(existingArchivedProblem && !activeProblem);
    const isCompletionReview = archiveOnComplete && Boolean(activeProblem) && !isArchivedReview;

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error("先打开你的代码文件，AI 才能回顾当前做题过程并更新学习画像。");
    }

    const occurredAt = new Date().toISOString();
    const config = routeTeachingModel(await this.loadRuntimeModelEnv(), this.codexServices.text).config;
    const profile = await loadStudentProfile(this.profilePath());
    const attemptStats = summarizeAttemptEvents(await this.loadAttemptEvents(), problemKey);
    const studentCode = extractStudentCodeFromText(editor.document.getText());
    const safeOjVerdict = normalizeScoreOjVerdict(ojVerdict);
    if (!hasSubstantiveStudentCode(studentCode)) {
      throw new Error("当前学生代码看起来还是模板或空 pass，不能做学习评分。先写一点真实代码；如果已经卡住，请用“给点提示”或“我放弃了”。");
    }
    const teachingContext = buildSidebarTeachingContext({
      problem,
      language: editor.document.languageId,
      studentCode,
      profileSummary: profileSummary(profile),
      ojVerdict: safeOjVerdict,
      requestPurpose: mergeRequestPurpose(
        isCompletionReview
          ? "学生点击「我已完成」：这是完成后复盘。请回顾题目上下文、当前编辑器代码、提示次数、是否放弃/看答案和学生历史画像，更新这次做题反映出的学习画像。OJ 结果可能未提交或不确定；不要假装官方 AC，但仍要给学习评分、痛点和下一步。"
          : isArchivedReview
            ? "已归档题目的学习评分：请基于当前编辑器代码、题目上下文和历史提示，区分 OJ 结果与学习成长价值。"
            : "学生点击「我 AC 了 / 评分」：请区分 OJ AC 与学习评分。",
        studentRequest
      ),
      responseLanguage: "zh-CN"
    });
    const rawReport = await requestMimoSolutionScore(config, {
      problem: teachingContext.problem,
      language: teachingContext.language,
      studentCode: teachingContext.studentCode,
      studentProfile: teachingContext.studentProfile,
      ojVerdict: safeOjVerdict,
      attemptStats: {
        hintCount: attemptStats.hintCount,
        gaveUp: attemptStats.gaveUp,
        revealedAnswer: attemptStats.revealedAnswer
      },
      studentRequest
    });
    const report = {
      ...rawReport,
      ojResult: safeOjVerdict.status
    };
    const updatedProfile = applyTeachingDiagnosis(
      profile,
      {
        painPoints: report.painPoints,
        hint: report.nextAction,
        recommendation: report.recommendation
      },
      occurredAt
    );
    await saveStudentProfile(this.profilePath(), updatedProfile);

    const shouldArchive = (safeOjVerdict.status === "AC" || isCompletionReview) && !isArchivedReview;
    let archivedProblem: CompletedProblemRecord | undefined;
    if (shouldArchive) {
      archivedProblem = buildCompletedProblemRecord({
        problem,
        completedAt: occurredAt,
        reason: "completed",
        painSnapshot: profileSummary(updatedProfile),
        solutionScore: report
      });
      await writeJsonlRecords(this.problemsPath(), removeProblemFromActiveQueue(await this.loadSavedProblems(), problemKey));
      await this.upsertCompletedProblems([archivedProblem]);
    } else if (isArchivedReview && existingArchivedProblem) {
      archivedProblem = {
        ...existingArchivedProblem,
        painSnapshot: profileSummary(updatedProfile),
        solutionScore: report
      };
      await this.upsertCompletedProblems([archivedProblem]);
    }

    await this.appendAttemptEvent(
      problem,
      buildAttemptEvent({
        problemKey,
        problemId: problem.id,
        platform: problem.platform,
        kind: "solution_scored",
        outcome: isArchivedReview || isCompletionReview ? "completed" : report.ojResult === "AC" ? "ac" : "active",
        ojStatus: report.ojResult,
        learningScore: report.learningScore,
        occurredAt,
        painPoints: report.painPoints.map((painPoint) => painPoint.label),
        model: config.model,
        note: isCompletionReview ? "completion_review" : isArchivedReview ? "archived_review" : undefined
      }),
      [
        {
          role: "student",
          kind: "solution_scored",
          text: studentRequest?.trim() || (isCompletionReview ? "我已完成，进行复盘。" : "请做学习评分。"),
          occurredAt
        },
        {
          role: "assistant",
          kind: "solution_scored",
          text: compactMultiline([report.summary, report.nextAction, report.complexityAssessment.reason]),
          occurredAt,
          model: config.model
        }
      ]
    );
    await this.recordInternalTestEvent({
      kind: "solution_score",
      problemKey,
      problemId: problem.id,
      platform: problem.platform,
      outcome: shouldArchive || isArchivedReview ? "archived" : "active",
      ojStatus: report.ojResult,
      learningScore: report.learningScore,
      painPoints: report.painPoints.map((painPoint) => painPoint.label),
      model: config.model,
      payload: {
        completionReview: isCompletionReview,
        complexityVerdict: report.complexityAssessment.verdict
      }
    });

    const selectedKey = problemKey;
    return this.problemBankState(
      selectedKey,
      isCompletionReview
        ? `AI 已完成 ${problem.id} 的完成复盘并更新学习画像。`
        : `AI 已完成 ${problem.id} 的学习评分。`,
      {
      solutionScore: {
        problem: { id: problem.id, title: problem.title },
        model: config.model,
        report
      },
      archivedProblem: archivedProblem
        ? {
            ...archivedProblem,
            painSummary: summarizePainSnapshot(archivedProblem.painSnapshot)
          }
        : undefined,
      profileSummary: profileSummary(updatedProfile)
      }
    );
  }

  private async handleOptimizationReviewRequest(
    problemKey: string,
    studentRequest?: string
  ): Promise<Record<string, unknown>> {
    const archivedProblem = (await this.loadCompletedProblems()).find((item) => item.problemKey === problemKey);
    if (!archivedProblem) {
      throw new Error("先在已归档列表里选择一道题，再做优化复盘。");
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error("先打开这道题对应的代码文件，AI 才能判断是否值得继续优化。");
    }

    const studentCode = extractStudentCodeFromText(editor.document.getText());
    if (!hasSubstantiveStudentCode(studentCode)) {
      throw new Error("当前学生代码看起来还是模板或空 pass，不能做优化复盘。先打开真实作答代码。");
    }

    const occurredAt = new Date().toISOString();
    const config = routeTeachingModel(await this.loadRuntimeModelEnv(), this.codexServices.text).config;
    const profile = await loadStudentProfile(this.profilePath());
    const profileBefore = profileSummary(profile);
    const teachingContext = buildSidebarTeachingContext({
      problem: archivedProblem,
      language: editor.document.languageId,
      studentCode,
      profileSummary: profileBefore,
      requestPurpose: mergeRequestPurpose(
        "已归档题目的第二层优化复盘：判断是否值得继续优化算法、内存、Big-O 或代码质量；简单题允许明确说无需优化。",
        studentRequest
      ),
      responseLanguage: "zh-CN"
    });
    const report = await requestMimoOptimizationReport(config, {
      problem: teachingContext.problem,
      language: teachingContext.language,
      studentCode: teachingContext.studentCode,
      archivedReason: archivedProblem.completionReason,
      previousScoreSummary: summarizePreviousLearning(archivedProblem),
      studentProfile: teachingContext.studentProfile,
      studentRequest
    });

    const painPoints = optimizationPainPoints(report);
    const updatedProfile =
      painPoints.length > 0
        ? applyTeachingDiagnosis(
            profile,
            {
              painPoints,
              hint: report.nextStep,
              skillUpdate: optimizationSkillUpdate(report)
            },
            occurredAt
          )
        : profile;
    if (updatedProfile !== profile) {
      await saveStudentProfile(this.profilePath(), updatedProfile);
    }

    const completedWithReport: CompletedProblemRecord = {
      ...archivedProblem,
      painSnapshot: profileSummary(updatedProfile),
      optimizationReport: report
    };
    await this.upsertCompletedProblems([completedWithReport]);
    await this.appendAttemptEvent(
      archivedProblem,
      buildAttemptEvent({
        problemKey,
        problemId: archivedProblem.id,
        platform: archivedProblem.platform,
        kind: "optimization_reviewed",
        outcome: archivedProblem.completionReason,
        occurredAt,
        painPoints: painPoints.map((painPoint) => painPoint.label),
        model: config.model,
        note: report.verdict
      }),
      [
        {
          role: "student",
          kind: "optimization_reviewed",
          text: studentRequest?.trim() || "请复盘这道已归档题是否还需要优化。",
          occurredAt
        },
        {
          role: "assistant",
          kind: "optimization_reviewed",
          text: compactMultiline([report.summary, report.nextStep, report.verdict]),
          occurredAt,
          model: config.model
        }
      ]
    );
    await this.recordInternalTestEvent({
      kind: "optimization_review",
      problemKey,
      problemId: archivedProblem.id,
      platform: archivedProblem.platform,
      outcome: report.verdict,
      painPoints: painPoints.map((painPoint) => painPoint.label),
      model: config.model,
      payload: {
        optimizationNeeded: report.optimizationNeeded
      }
    });

    return {
      type: "optimizationReport",
      problemKey,
      model: config.model,
      optimizationReport: {
        problem: { id: archivedProblem.id, title: archivedProblem.title },
        model: config.model,
        report
      },
      completedProblem: {
        ...completedWithReport,
        painSummary: summarizePainSnapshot(completedWithReport.painSnapshot)
      },
      profileSummary: profileSummary(updatedProfile),
      status:
        report.verdict === "no_need"
          ? `AI 判断 ${archivedProblem.id} 暂时无需继续优化。`
          : `AI 已完成 ${archivedProblem.id} 的优化复盘。`
    };
  }

  private async createPracticeFile(problem: ProblemRecord, language: PracticeLanguage): Promise<{
    absolutePath: string;
    relativePath: string;
    created: boolean;
  }> {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("先在 VS Code 打开一个工作区，再创建练习文件。");
    }

    const relativePath = buildPracticeFileRelativePath(problem, language);
    const absolutePath = path.join(workspaceFolder.uri.fsPath, relativePath);
    let created = true;
    await mkdir(path.dirname(absolutePath), { recursive: true });

    try {
      await writeFile(absolutePath, buildPracticeFileContent(problem, language), {
        encoding: "utf8",
        flag: "wx"
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
      created = false;
    }

    const document = await vscode.workspace.openTextDocument(absolutePath);
    await vscode.window.showTextDocument(document, vscode.ViewColumn.One, false);
    return { absolutePath, relativePath, created };
  }

  private async handleAutocompletePreview(): Promise<Record<string, unknown>> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error("先打开你的代码文件，再测试补全。");
    }

    const route = routeAutocompleteModel(
      await this.loadRuntimeModelEnv(),
      this.codexServices.text
    );
    const position = editor.selection.active;
    const input = buildAutocompleteInputFromText({
      text: editor.document.getText(),
      offset: editor.document.offsetAt(position),
      language: editor.document.languageId,
      filePath: editor.document.uri.fsPath
    });
    const profile = await loadStudentProfile(this.profilePath());
    const studentSkill = await this.loadStudentSkillForProfile(profile);
    const result = await requestMimoAutocompleteDetailed(route.config, {
      ...input,
      studentSkill,
      capabilities: route.capabilities
    });
    const contextAudit = toPublicSkillPlanAudit(
      "autocomplete_preview",
      result.audit
    );
    await this.recordInternalTestEvent({
      kind: "autocomplete_event",
      action: "preview",
      model: route.model,
      payload: {
        language: editor.document.languageId,
        line: position.line + 1,
        validationStatus: result.status,
        rejectionReason: result.rejectionReason,
        contextAudit
      }
    });

    const status =
      result.status === "success"
        ? "AI 已生成一次补全预览。"
        : result.status === "model-empty"
          ? "AI 补全模型返回为空；请换到有局部上下文的代码位置再试。"
          : "AI 返回内容已被安全策略拦截：" +
            (result.rejectionReason ?? "unknown");

    return {
      type: "autocompletePreview",
      model: route.model,
      suggestion: result.suggestion,
      validationStatus: result.status,
      rejectionReason: result.rejectionReason,
      language: editor.document.languageId,
      line: position.line + 1,
      contextAudit,
      status
    };
  }

  private async handleOjLoginRequest(platformValue: SubmissionPlatform): Promise<Record<string, unknown>> {
    this.requireTrustedWorkspaceForSubmission();
    const platform = normalizeSubmissionPlatform(platformValue);
    const capability = getSubmissionPlatformCapability(platform);
    const availability = await checkOnlineJudgeTools();
    if (!availability.available) {
      throw new Error(availability.message);
    }

    const terminal = vscode.window.createTerminal({ name: "OJ 登录" });
    terminal.sendText(`oj login ${capability.loginUrl}`, true);
    terminal.show();
    return {
      type: "status",
      text: `已打开 OJ 登录终端；请按提示亲自完成 ${capability.displayName} 登录和图形验证。`
    };
  }

  private async handleOjSubmissionPreviewRequest(
    problemKey: string,
    problemUrl: string,
    platformValue: SubmissionPlatform,
    codeforcesHandle?: string
  ): Promise<Record<string, unknown>> {
    this.requireTrustedWorkspaceForSubmission();
    await this.requireKnownProblem(problemKey);
    const target = parseSubmissionTarget(problemUrl);
    const platform = normalizeSubmissionPlatform(platformValue);
    if (target.platform !== platform) {
      throw new Error("所选平台与题目链接不一致。");
    }
    const handle = target.platform === "codeforces"
      ? normalizeOptionalCodeforcesHandle(codeforcesHandle)
      : undefined;
    if (target.platform === "atcoder" && codeforcesHandle?.trim()) {
      throw new Error("AtCoder 提交不使用 Codeforces handle。");
    }
    const availability = await checkOnlineJudgeTools();
    if (!availability.available) {
      throw new Error(availability.message);
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== "file") {
      throw new Error("先打开一个已经保存到磁盘的代码文件。");
    }
    const saved = await editor.document.save();
    if (!saved) {
      throw new Error("当前代码文件保存失败，未创建提交确认。");
    }

    const preview = this.submissionConfirmations.create({
      problemKey,
      target,
      editor: this.editorSubmissionIdentity(editor),
      codeforcesHandle: handle
    });
    return {
      type: "ojSubmissionPreview",
      preview,
      toolVersion: availability.version,
      status: "提交预览已生成；尚未发送代码。"
    };
  }

  private async handleOjSubmissionConfirmation(confirmationId: string): Promise<Record<string, unknown>> {
    this.requireTrustedWorkspaceForSubmission();
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.uri.scheme !== "file") {
      throw new Error("提交前必须保持预览时的代码文件处于打开状态。");
    }
    if (editor.document.isDirty) {
      throw new Error("预览后代码已修改，请保存并重新生成提交预览。");
    }

    const preview = this.submissionConfirmations.consume(
      confirmationId,
      this.editorSubmissionIdentity(editor)
    );
    const submittedAfterSeconds = Math.floor(Date.now() / 1_000);
    const cliResult = await submitWithOnlineJudgeTools(
      preview.target,
      preview.editor.filePath,
      path.dirname(preview.editor.filePath)
    );

    if (cliResult.status !== "submitted") {
      const result: OjSubmissionResult = {
        status: cliResult.status,
        message: cliResult.message,
        submissionUrl: cliResult.submissionUrl
      };
      return {
        type: "ojSubmissionResult",
        problemKey: preview.problemKey,
        result,
        status: result.message
      };
    }

    if (preview.target.platform === "atcoder") {
      const result: OjSubmissionResult = {
        status: "submitted",
        message: "代码已提交到 AtCoder；请通过提交链接查看判题结果，不会自动重试。",
        submissionUrl: cliResult.submissionUrl
      };
      return {
        type: "ojSubmissionResult",
        problemKey: preview.problemKey,
        result,
        status: result.message
      };
    }

    if (!preview.codeforcesHandle) {
      const result: OjSubmissionResult = {
        status: "submitted",
        message: "代码已提交；未填写 Codeforces handle，因此没有自动查询判题结果。",
        submissionUrl: cliResult.submissionUrl
      };
      return {
        type: "ojSubmissionResult",
        problemKey: preview.problemKey,
        result,
        status: result.message
      };
    }

    try {
      const pollResult = await pollCodeforcesVerdict({
        handle: preview.codeforcesHandle,
        target: preview.target,
        submittedAfterSeconds
      });
      const result: OjSubmissionResult =
        pollResult.status === "judged"
          ? {
              status: "judged",
              message: `Codeforces 判题完成：${pollResult.verdict}。`,
              submissionUrl: pollResult.submissionUrl,
              submissionId: pollResult.submissionId,
              verdict: pollResult.verdict,
              passedTestCount: pollResult.passedTestCount
            }
          : {
              status: "submitted",
              message: "代码已提交，但自动查询在限定时间内没有得到最终结果；不会自动重试提交。",
              submissionUrl: cliResult.submissionUrl,
              verdict: "UNKNOWN"
            };
      return {
        type: "ojSubmissionResult",
        problemKey: preview.problemKey,
        result,
        status: result.message
      };
    } catch {
      const result: OjSubmissionResult = {
        status: "submitted",
        message: "代码已提交，但 Codeforces 公共状态查询失败；不会自动重试提交。",
        submissionUrl: cliResult.submissionUrl,
        verdict: "UNKNOWN"
      };
      return {
        type: "ojSubmissionResult",
        problemKey: preview.problemKey,
        result,
        status: result.message
      };
    }
  }

  private requireTrustedWorkspaceForSubmission(): void {
    if (!vscode.workspace.isTrusted) {
      throw new Error("真实 OJ 提交在受限工作区中已禁用；请先确认并信任当前工作区。");
    }
  }

  private async requireKnownProblem(problemKey: string): Promise<void> {
    const savedProblems = await this.loadSavedProblems();
    const completedProblems = await this.loadCompletedProblems();
    const known =
      savedProblems.some((problem) => makeProblemKey(problem) === problemKey) ||
      completedProblems.some(
        (problem) => problem.problemKey === problemKey || makeProblemKey(problem) === problemKey
      );
    if (!known) {
      throw new Error("先选择一道已导入或已归档的题目。");
    }
  }

  private editorSubmissionIdentity(editor: vscode.TextEditor): EditorSubmissionIdentity {
    return {
      uri: editor.document.uri.toString(),
      filePath: editor.document.uri.fsPath,
      version: editor.document.version,
      languageId: editor.document.languageId,
      codeSize: Buffer.byteLength(editor.document.getText(), "utf8")
    };
  }

  private async handleSubmissionJudgeRequest(problemKey: string): Promise<Record<string, unknown>> {
    const savedProblems = await this.loadSavedProblems();
    const completedProblems = await this.loadCompletedProblems();
    const activeProblem = savedProblems.find((item) => makeProblemKey(item) === problemKey);
    const archivedProblem = completedProblems.find((item) => item.problemKey === problemKey || makeProblemKey(item) === problemKey);
    const problem = activeProblem ?? archivedProblem;
    if (!problem) {
      throw new Error("先选择一道题，或在已归档列表里点找错复盘。");
    }
    const isArchivedReview = Boolean(archivedProblem && !activeProblem);

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error("先打开你的代码文件，再做 AI 找错复盘。");
    }

    const config = routeTeachingModel(await this.loadRuntimeModelEnv(), this.codexServices.text).config;
    const profile = await loadStudentProfile(this.profilePath());
    const teachingContext = buildSidebarTeachingContext({
      problem,
      language: editor.document.languageId,
      studentCode: extractStudentCodeFromText(editor.document.getText()),
      profileSummary: profileSummary(profile),
      requestPurpose: isArchivedReview
        ? "已完成后的 AI 找错复盘：从当前编辑器代码、题目上下文和学生历史痛点中找仍可能存在的错误或隐患；不要假装官方 OJ。"
        : "交题前 AI 自检：保守判断当前代码可能 AC、WA、RE、TLE，或者需要先运行样例。",
      responseLanguage: "zh-CN"
    });
    const report = await requestMimoSubmissionJudge(config, {
      problem: teachingContext.problem,
      language: teachingContext.language,
      studentCode: teachingContext.studentCode,
      studentProfile: teachingContext.studentProfile
    });
    await this.recordInternalTestEvent({
      kind: "submission_judge",
      problemKey,
      problemId: problem.id,
      platform: problem.platform,
      model: config.model,
      outcome: isArchivedReview ? "archived_review" : "active",
      payload: report as unknown as Record<string, unknown>
    });

    return {
      type: "submissionJudge",
      model: config.model,
      problemKey,
      reviewStage: isArchivedReview ? "archived" : "active",
      report,
      status: isArchivedReview ? `AI 已完成 ${problem.id} 的找错复盘。` : `AI 已完成 ${problem.id} 的交题前自检。`
    };
  }

  private async recordInternalTestEvent(event: InternalTestEventInput): Promise<void> {
    try {
      await this.internalRecorder.record(event);
    } catch (error) {
      console.warn("Student Autocomplete internal-test record failed", error);
    }
  }

  private async aiRuntimeStatus(): Promise<AiRuntimeStatus> {
    const envPath = this.modelEnvPath();
    try {
      const env = await this.loadRuntimeModelEnv();
      const configView = await buildAiConfigViewFromVsCode(this.context, envPath);
      return {
        envPath: envPath ?? "VS Code Settings",
        providerMode: configView.mode,
        autocomplete: readAutocompleteStatus(env, this.codexServices.text),
        teaching: readTeachingStatus(env, this.codexServices.text)
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        envPath: envPath ?? "VS Code Settings",
        providerMode: "openai-compatible",
        autocomplete: { configured: false, error: message },
        teaching: { configured: false, error: message }
      };
    }
  }

  private async aiConfigView(): Promise<AiConfigView> {
    return buildAiConfigViewFromVsCode(this.context, this.modelEnvPath());
  }

  private activeEditorState(): Record<string, string> | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }

    const workspaceFolder = vscode.workspace.getWorkspaceFolder(editor.document.uri);
    return {
      fileName: path.basename(editor.document.uri.fsPath),
      relativePath: workspaceFolder
        ? path.relative(workspaceFolder.uri.fsPath, editor.document.uri.fsPath)
        : editor.document.uri.fsPath,
      language: editor.document.languageId
    };
  }

  private readUiLanguage(): UiLanguage {
    const inspected = vscode.workspace.getConfiguration("studentAutocomplete.ui").inspect<string>("language");
    return normalizeSidebarUiLanguage(inspected?.globalValue);
  }

  private async loadSavedProblems(): Promise<SavedProblemRecord[]> {
    const records = await readJsonlRecords<SavedProblemRecord>(this.problemsPath());
    const deduped = new Map<string, SavedProblemRecord>();

    for (const record of records) {
      deduped.set(makeProblemKey(record), record);
    }

    return [...deduped.values()].sort((left, right) => right.savedAt.localeCompare(left.savedAt));
  }

  private async loadCompletedProblems(): Promise<CompletedProblemRecord[]> {
    const records = await readJsonlRecords<CompletedProblemRecord>(this.completedProblemsPath());
    const deduped = new Map<string, CompletedProblemRecord>();

    for (const record of records) {
      deduped.set(record.problemKey, record);
    }

    return [...deduped.values()].sort((left, right) => right.completedAt.localeCompare(left.completedAt));
  }

  private async loadAttemptEvents(): Promise<AttemptEvent[]> {
    return readJsonlRecords<AttemptEvent>(this.attemptEventsPath());
  }

  private async loadAttemptSessions() {
    return loadAttemptSessions(this.attemptSessionsPath());
  }

  private attemptStorePaths(): AttemptStorePaths {
    return {
      eventsPath: this.attemptEventsPath(),
      sessionsPath: this.attemptSessionsPath()
    };
  }

  private async appendAttemptEvent(
    problem: Pick<ProblemRecord, "id" | "platform" | "title">,
    event: AttemptEvent,
    coachThreadTurns: CoachThreadTurn[] = []
  ) {
    return appendAttemptEventToSession({
      paths: this.attemptStorePaths(),
      problem: problemRefFromRecord(event.problemKey, problem),
      event,
      coachThreadTurns
    });
  }

  private async tryPrepareTeacherPack(problem: ProblemRecord): Promise<TeacherPackRecord | undefined> {
    try {
      const config = routeTeachingModel(await this.loadRuntimeModelEnv(), this.codexServices.text).config;
      return this.ensureTeacherPack(problem, config);
    } catch {
      return undefined;
    }
  }

  private async ensureTeacherPack(
    problem: ProblemRecord,
    config: ChatCompletionProviderConfig
  ): Promise<TeacherPackRecord | undefined> {
    const cached = await findTeacherPack(this.teacherPacksPath(), problem.platform, problem.id);
    if (cached) {
      return cached;
    }

    if (!hasProblemDetailsForTeacherPack(problem)) {
      return undefined;
    }

    try {
      const pack = await requestMimoTeacherPack(config, problem);
      await upsertTeacherPack(this.teacherPacksPath(), pack);
      return pack;
    } catch {
      return undefined;
    }
  }

  private async saveProblem(problem: ProblemRecord): Promise<void> {
    await this.upsertProblems([
      {
        ...problem,
        savedAt: new Date().toISOString()
      }
    ]);
  }

  private async importLuoguProblems(problemIds: string[]): Promise<{
    imported: SavedProblemRecord[];
    failed: Array<{ id: string; error: string }>;
  }> {
    const imported: SavedProblemRecord[] = [];
    const failed: Array<{ id: string; error: string }> = [];

    for (const id of problemIds) {
      try {
        imported.push({
          ...(await fetchLuoguProblem(id)),
          savedAt: new Date().toISOString()
        });
      } catch (error) {
        failed.push({
          id,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }

    await this.upsertProblems(imported);
    return { imported, failed };
  }

  private async upsertProblems(problems: SavedProblemRecord[]): Promise<void> {
    if (problems.length === 0) {
      return;
    }

    const existing = await readJsonlRecords<SavedProblemRecord>(this.problemsPath());
    const nextByKey = new Map<string, SavedProblemRecord>();

    for (const record of existing) {
      nextByKey.set(makeProblemKey(record), record);
    }

    for (const problem of problems) {
      const key = makeProblemKey(problem);
      nextByKey.set(key, mergeSavedProblemRecord(nextByKey.get(key), problem));
    }

    await writeJsonlRecords(this.problemsPath(), [...nextByKey.values()]);
    for (const problem of problems) {
      await ensureAttemptSession(this.attemptSessionsPath(), problemRefFromRecord(makeProblemKey(problem), problem));
    }
  }

  private async upsertCompletedProblems(problems: CompletedProblemRecord[]): Promise<void> {
    if (problems.length === 0) {
      return;
    }

    const existing = await readJsonlRecords<CompletedProblemRecord>(this.completedProblemsPath());
    const nextByKey = new Map<string, CompletedProblemRecord>();

    for (const record of existing) {
      nextByKey.set(record.problemKey, record);
    }

    for (const problem of problems) {
      nextByKey.set(problem.problemKey, problem);
    }

    await writeJsonlRecords(this.completedProblemsPath(), [...nextByKey.values()]);
  }

  private async saveProblemSet(problemSet: ProblemSetRecord): Promise<void> {
    await appendJsonlRecord(this.problemSetsPath(), {
      ...problemSet,
      savedAt: new Date().toISOString()
    });
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = createWebviewNonce();
    const starterPresetsJson = safeJson(starterPresets);
    const practiceLanguageOptionsJson = safeJson(practiceLanguageOptions);

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${nonce}">
    :root {
      --line: var(--vscode-sideBarSectionHeader-border, rgba(128, 128, 128, 0.28));
      --soft: color-mix(in srgb, var(--vscode-sideBar-background) 82%, var(--vscode-editor-foreground) 18%);
      --surface: color-mix(in srgb, var(--vscode-editor-background) 84%, var(--vscode-sideBar-background));
      --surfaceRaised: color-mix(in srgb, var(--vscode-list-hoverBackground) 52%, var(--vscode-sideBar-background));
      --accent: var(--vscode-textLink-foreground);
      --good: var(--vscode-testing-iconPassed, #4aa564);
      --warn: var(--vscode-editorWarning-foreground, #d7a542);
      --danger: var(--vscode-errorForeground, #f14c4c);
      --focusGlow: color-mix(in srgb, var(--vscode-focusBorder) 30%, transparent);
      --dossierCyan: color-mix(in srgb, var(--vscode-textLink-foreground) 82%, #57d7e5);
      --dossierAmber: color-mix(in srgb, var(--vscode-editorWarning-foreground) 82%, #eebf68);
      --dossierMint: color-mix(in srgb, var(--vscode-testing-iconPassed) 82%, #7bd7ae);
      --dossierInk: color-mix(in srgb, var(--vscode-editor-background) 92%, #071016);
      --dossierRule: color-mix(in srgb, var(--dossierCyan) 32%, var(--line));
      --mono: var(--vscode-editor-font-family, ui-monospace, SFMono-Regular, Consolas, monospace);
    }

    * {
      box-sizing: border-box;
    }

    body {
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.45;
      margin: 0;
      overflow-x: hidden;
      padding: 0;
    }

    button,
    input,
    textarea {
      font: inherit;
    }

    button {
      background: var(--vscode-button-background);
      border: 1px solid transparent;
      border-radius: 6px;
      color: var(--vscode-button-foreground);
      cursor: pointer;
      font-weight: 600;
      min-height: 30px;
      padding: 4px 9px;
      transition: background 120ms ease, border-color 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button:disabled {
      cursor: not-allowed;
      opacity: 0.58;
    }

    button:focus-visible,
    input:focus-visible,
    select:focus-visible,
    textarea:focus-visible {
      box-shadow: 0 0 0 2px var(--focusGlow);
      outline: 1px solid var(--vscode-focusBorder);
      outline-offset: 1px;
    }

    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
    }

    button.danger {
      color: var(--danger);
    }

    input,
    textarea {
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--line));
      border-radius: 6px;
      color: var(--vscode-input-foreground);
      outline: none;
      padding: 7px 8px;
      width: 100%;
    }

    input:focus,
    textarea:focus {
      border-color: var(--vscode-focusBorder);
    }

    textarea {
      min-height: 120px;
      resize: vertical;
    }

    a {
      color: var(--accent);
      text-decoration: none;
    }

    a:hover {
      text-decoration: underline;
    }

    .app {
      display: grid;
      gap: 11px;
      padding: 10px 10px 14px;
    }

    .pageTabs {
      background: color-mix(in srgb, var(--vscode-sideBar-background) 86%, var(--vscode-editor-foreground) 14%);
      border: 1px solid var(--line);
      border-radius: 8px;
      box-shadow: 0 1px 0 color-mix(in srgb, var(--vscode-editor-foreground) 8%, transparent);
      display: grid;
      gap: 4px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      padding: 4px;
      position: sticky;
      top: 0;
      z-index: 5;
    }

    .tabButton {
      background: transparent;
      border-color: transparent;
      color: var(--vscode-descriptionForeground);
      min-height: 30px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .tabButton.active {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }

    .page {
      display: grid;
      gap: 10px;
    }

    .page[hidden] {
      display: none;
    }

    .topbar {
      border-bottom: 1px solid var(--line);
      display: grid;
      gap: 5px;
      padding: 4px 0 10px;
    }

    .title {
      align-items: baseline;
      display: flex;
      gap: 8px;
      justify-content: space-between;
    }

    .topbarTools {
      align-items: end;
      display: grid;
      gap: 4px;
      grid-template-columns: minmax(0, 1fr) 104px;
    }

    .languageSwitch label {
      display: block;
      margin-bottom: 3px;
    }

    h1,
    h2,
    h3,
    p {
      margin: 0;
    }

    h1 {
      font-size: 16px;
      font-weight: 700;
    }

    h2 {
      font-size: 12px;
      letter-spacing: 0;
      text-transform: none;
    }

    h3 {
      font-size: 13px;
      line-height: 1.35;
    }

    .hint {
      color: var(--vscode-descriptionForeground);
      line-height: 1.5;
    }

    .markdownBody {
      display: grid;
      gap: 6px;
      line-height: 1.55;
      white-space: normal;
    }

    .markdownBody p,
    .markdownBody ul,
    .markdownBody ol {
      margin: 0;
    }

    .markdownBody ul,
    .markdownBody ol {
      padding-left: 18px;
    }

    .markdownBody li {
      margin: 2px 0;
    }

    .markdownBody code {
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--line);
      border-radius: 4px;
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-editor-font-family);
      padding: 1px 4px;
    }

    .markdownBody strong {
      color: var(--vscode-foreground);
    }

    .markdownParagraph {
      margin: 0;
    }

    .markdownHeading {
      color: var(--vscode-foreground);
      margin: 0;
    }

    .markdownQuote {
      background: color-mix(in srgb, var(--accent) 9%, var(--vscode-editor-background));
      border-left: 3px solid var(--accent);
      border-radius: 4px;
      color: var(--vscode-descriptionForeground);
      margin: 0;
      padding: 7px 9px;
    }

    .markdownList {
      display: grid;
      gap: 3px;
      margin: 0;
      padding-left: 20px;
    }

    .markdownRule {
      border-top: 1px solid var(--line);
      height: 1px;
      margin: 2px 0;
    }

    .markdownBody a {
      color: var(--vscode-textLink-foreground);
      text-decoration: none;
    }

    .markdownBody a:hover {
      text-decoration: underline;
    }

    .mathInline {
      background: color-mix(in srgb, var(--accent) 10%, var(--vscode-textCodeBlock-background));
      border: 1px solid color-mix(in srgb, var(--accent) 18%, var(--line));
      border-radius: 4px;
      color: var(--vscode-editor-foreground);
      font-family: var(--vscode-editor-font-family);
      padding: 0 4px;
      white-space: nowrap;
    }

    .mathInline sup,
    .mathInline sub,
    .mathSup,
    .mathSub {
      font-size: 0.76em;
      line-height: 0;
    }

    .status {
      border-left: 3px solid var(--accent);
      color: var(--vscode-descriptionForeground);
      line-height: 1.45;
      min-height: 22px;
      padding: 2px 0 2px 8px;
    }

    .status.error {
      border-left-color: var(--vscode-errorForeground);
      color: var(--vscode-errorForeground);
    }

    .stats {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .pill {
      background: color-mix(in srgb, var(--vscode-badge-background) 24%, transparent);
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--vscode-badge-foreground);
      padding: 2px 7px;
      white-space: nowrap;
    }

    .panel {
      background: color-mix(in srgb, var(--vscode-sideBar-background) 92%, var(--vscode-editor-background));
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }

    .panelHeader,
    summary {
      align-items: center;
      background: color-mix(in srgb, var(--vscode-sideBarSectionHeader-background) 88%, transparent);
      border-bottom: 1px solid var(--line);
      display: flex;
      gap: 8px;
      justify-content: space-between;
      padding: 8px 9px;
    }

    summary {
      cursor: pointer;
      font-weight: 700;
    }

    .panelBody {
      display: grid;
      gap: 9px;
      padding: 9px;
    }

    .coachPanel {
      border-color: color-mix(in srgb, var(--accent) 46%, var(--line));
      box-shadow: inset 3px 0 0 color-mix(in srgb, var(--accent) 76%, transparent);
    }

    .coachPanel .panelBody {
      gap: 11px;
    }

    .coachProblem {
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--accent) 9%, var(--surface)),
        var(--surface)
      );
      border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--line));
      border-radius: 8px;
      display: grid;
      gap: 8px;
      line-height: 1.45;
      padding: 10px;
    }

    .coachSummary {
      display: grid;
      gap: 6px;
    }

    .coachActions {
      display: grid;
      gap: 7px;
      grid-template-columns: 1fr 1fr;
    }

    .coachActions button {
      min-height: 36px;
    }

    .coachActions:not(.coachMoreActions) button:first-child {
      grid-column: 1 / -1;
    }

    .coachOptions {
      display: grid;
      gap: 7px;
      grid-template-columns: repeat(auto-fit, minmax(126px, 1fr));
    }

    .coachQuestion {
      min-height: 62px;
    }

    .coachAskBox {
      background: var(--surfaceRaised);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 8px;
    }

    .coachQuestionActions {
      display: grid;
      gap: 7px;
      grid-template-columns: 1fr;
      margin-top: 7px;
    }

    .coachQuestionActions button {
      min-height: 36px;
    }

    .coachPrimaryAction {
      font-weight: 700;
      min-height: 40px;
      width: 100%;
    }

    .compactDrawer,
    .utilityDrawer {
      border: 1px solid var(--line);
      overflow: hidden;
    }

    .compactDrawer > summary,
    .utilityDrawer summary {
      background: transparent;
      border-bottom: 0;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-weight: 600;
      min-height: 30px;
      padding: 6px 8px;
    }

    .compactDrawer[open] > summary,
    .utilityDrawer details[open] > summary,
    .utilityDrawer[open] > summary {
      border-bottom: 1px solid var(--line);
      color: var(--vscode-foreground);
    }

    .compactDrawer > .coachOptions,
    .compactDrawer > .coachMoreActions,
    .compactDrawer > .aiStatusGrid {
      padding: 8px;
    }

    .utilityShelf {
      border-top: 1px solid var(--line);
      display: grid;
      gap: 5px;
      padding-top: 7px;
    }

    .archiveDetails {
      border-top: 1px solid var(--line);
    }

    .archiveDetails > summary {
      background: transparent;
      border: 0;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      font-weight: 600;
      padding: 6px 0;
    }

    .archiveDetails[open] > summary {
      color: var(--vscode-foreground);
    }

    .archiveDetailsBody {
      display: grid;
      gap: 4px;
      padding: 0 0 7px;
    }

    .archivePrimaryAction {
      width: 100%;
    }

    .row.archiveActionGrid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      padding: 8px;
    }

    .connectionPill {
      color: var(--dossierMint);
      font-family: var(--mono);
      font-size: 10px;
      white-space: nowrap;
    }

    .aiConfigBox {
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }

    .aiConfigGrid {
      display: grid;
      gap: 7px;
      grid-template-columns: 1fr 1fr;
    }

    .aiConfigGrid .wide {
      grid-column: 1 / -1;
    }

    .codexOAuthPanel {
      background: color-mix(in srgb, var(--vscode-editor-background) 84%, transparent);
      border: 1px solid var(--line);
      border-radius: 7px;
      display: grid;
      gap: 8px;
      grid-column: 1 / -1;
      padding: 9px;
    }

    .field[hidden],
    .codexOAuthPanel[hidden] {
      display: none !important;
    }

    .codexOAuthActions {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .codexDeviceCode {
      font-family: var(--vscode-editor-font-family);
      letter-spacing: 0.08em;
    }

    .modelResults {
      border-top: 1px solid var(--line);
      display: grid;
      gap: 6px;
      max-height: 220px;
      overflow: auto;
      padding-top: 8px;
    }

    select {
      background: var(--vscode-dropdown-background);
      border: 1px solid var(--vscode-dropdown-border, var(--line));
      border-radius: 6px;
      color: var(--vscode-dropdown-foreground);
      min-height: 28px;
      padding: 4px 7px;
      width: 100%;
    }

    .aiStatusGrid {
      display: grid;
      gap: 6px;
      grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    }

    .aiStatusItem {
      background: var(--surfaceRaised);
      border: 1px solid var(--line);
      border-left: 3px solid var(--line);
      border-radius: 7px;
      display: grid;
      gap: 3px;
      line-height: 1.35;
      min-width: 0;
      padding: 7px;
    }

    .aiStatusItem.ready {
      border-left-color: var(--good);
    }

    .aiStatusItem .hint {
      font-size: 11px;
      overflow-wrap: anywhere;
    }

    .aiResponse {
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--accent) 7%, var(--surface)),
        var(--surface)
      );
      border: 1px solid color-mix(in srgb, var(--accent) 46%, var(--line));
      border-left: 3px solid var(--accent);
      border-radius: 8px;
      display: grid;
      gap: 10px;
      line-height: 1.5;
      min-height: 86px;
      padding: 11px;
    }

    .aiResponseTitle {
      color: var(--accent);
      font-size: 14px;
      font-weight: 700;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }

    .responseSectionTitle {
      color: var(--vscode-foreground);
      font-weight: 700;
    }

    .resultBlock {
      background: color-mix(in srgb, var(--accent) 10%, var(--vscode-editor-background));
      border: 1px solid color-mix(in srgb, var(--accent) 42%, var(--line));
      border-left: 3px solid color-mix(in srgb, var(--accent) 82%, var(--line));
      border-radius: 7px;
      display: grid;
      gap: 5px;
      padding: 8px;
      overflow-wrap: anywhere;
    }

    .resultDetailsDrawer {
      border-top: 1px solid color-mix(in srgb, var(--accent) 34%, var(--line));
      min-width: 0;
    }

    .resultDetailsDrawer > summary {
      background: transparent;
      border-bottom: 0;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      min-height: 30px;
      padding: 6px 2px;
    }

    .resultDetailsDrawer[open] > summary {
      border-bottom: 1px solid var(--line);
      color: var(--vscode-foreground);
    }

    .resultDetailsBody {
      display: grid;
      gap: 7px;
      padding-top: 8px;
    }

    .skillPanelBody {
      display: grid;
      gap: 9px;
      padding: 9px;
    }

    .skillSummary {
      display: grid;
      gap: 7px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }

    .skillMetric {
      background: color-mix(in srgb, var(--vscode-editor-background) 78%, transparent);
      border: 1px solid var(--line);
      border-radius: 7px;
      display: grid;
      gap: 2px;
      padding: 7px;
    }

    .skillMetric strong {
      color: var(--accent);
      font-size: 15px;
    }

    .skillGroup {
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
    }

    .skillList,
    .versionList {
      display: grid;
      gap: 7px;
      padding: 8px;
    }

    .skillCard,
    .versionItem {
      background: color-mix(in srgb, var(--vscode-list-hoverBackground) 46%, transparent);
      border: 1px solid var(--line);
      border-radius: 8px;
      display: grid;
      gap: 6px;
      padding: 8px;
    }

    .skillCard.disabled {
      opacity: 0.72;
    }

    .skillTop {
      align-items: start;
      display: grid;
      gap: 5px;
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .skillActionRow,
    .detailActions {
      display: grid;
      gap: 7px;
      grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
    }

    .skillActionRow button,
    .detailActions button {
      min-height: 34px;
    }

    .skillRules {
      display: grid;
      gap: 3px;
      padding-left: 10px;
    }

    .problemList {
      display: grid;
      gap: 6px;
      max-height: 320px;
      overflow: auto;
      padding: 8px;
    }

    .problemItem {
      background: color-mix(in srgb, var(--vscode-list-hoverBackground) 58%, transparent);
      border: 1px solid transparent;
      border-radius: 8px;
      color: var(--vscode-foreground);
      display: grid;
      gap: 4px;
      padding: 8px;
      text-align: left;
      width: 100%;
    }

    .problemItem:hover {
      border-color: var(--line);
    }

    .problemItem.active {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }

    .problemMeta,
    .tagRow,
    .row {
      align-items: center;
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }

    .problemId {
      color: var(--accent);
      font-weight: 700;
    }

    .problemTitle {
      display: block;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }

    .mini {
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
    }

    .tag {
      border: 1px solid var(--line);
      border-radius: 999px;
      color: var(--vscode-descriptionForeground);
      font-size: 11px;
      padding: 1px 6px;
    }

    .detail {
      display: grid;
      gap: 10px;
      padding: 10px;
    }

    .detailTitle {
      display: grid;
      gap: 5px;
    }

    .detailTitle .problemTitle {
      font-size: 14px;
      font-weight: 700;
    }

    .textBlock {
      background: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
      border: 1px solid var(--line);
      border-radius: 8px;
      line-height: 1.55;
      max-height: 520px;
      overflow: auto;
      padding: 9px;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .textBlock.markdownBody {
      white-space: normal;
    }

    .manualPastePanel {
      border-color: color-mix(in srgb, var(--accent) 34%, var(--line));
    }

    .manualPasteBody {
      gap: 10px;
    }

    .manualFormatGuide {
      border: 1px dashed color-mix(in srgb, var(--accent) 32%, var(--line));
      border-radius: 8px;
      padding: 7px 9px;
    }

    .manualImportHero {
      background: linear-gradient(
        180deg,
        color-mix(in srgb, var(--accent) 8%, var(--surfaceRaised)),
        var(--surfaceRaised)
      );
      border: 1px solid var(--line);
      border-radius: 8px;
      display: grid;
      gap: 8px;
      padding: 10px;
    }

    .manualImportHero button {
      min-height: 36px;
    }

    .formatGuideBody {
      display: grid;
      gap: 7px;
      padding-top: 7px;
    }

    .markdownBody pre,
    .codeBlock {
      border-color: color-mix(in srgb, var(--accent) 42%, var(--line));
      display: block;
    }

    .sampleGrid {
      display: grid;
      gap: 8px;
    }

    .sample {
      display: grid;
      gap: 5px;
    }

    pre {
      background: var(--vscode-textCodeBlock-background);
      border: 1px solid var(--line);
      border-radius: 6px;
      margin: 0;
      overflow: auto;
      padding: 8px;
      white-space: pre;
    }

    @media (max-width: 360px) {
      .app {
        padding: 8px;
      }

      .topbarTools,
      .aiConfigGrid,
      .coachOptions {
        grid-template-columns: 1fr;
      }

      .aiStatusGrid,
      .skillSummary {
        grid-template-columns: 1fr;
      }
    }

    .empty {
      color: var(--vscode-descriptionForeground);
      line-height: 1.5;
      padding: 14px 9px;
    }

    .searchResults {
      display: grid;
      gap: 6px;
      max-height: 220px;
      overflow: auto;
    }

    .ojProviderStatus {
      display: grid;
      gap: 5px;
      grid-template-columns: repeat(auto-fit, minmax(92px, 1fr));
    }

    .ojProviderItem {
      border: 1px solid var(--line);
      border-left: 3px solid var(--line);
      border-radius: 6px;
      cursor: pointer;
      display: grid;
      gap: 2px;
      min-width: 0;
      padding: 6px 7px;
    }

    .ojProviderItem.healthy {
      border-left-color: var(--good);
    }

    .ojProviderItem.degraded,
    .ojProviderItem.auth_required {
      border-left-color: var(--warn);
    }

    .ojProviderItem.unavailable {
      border-left-color: var(--danger);
    }

    .ojProviderItem.selected {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
      outline: 1px solid var(--vscode-focusBorder);
    }

    .ojProviderItem .problemTitle,
    .ojProviderItem .mini {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .embeddedDetails {
      border-top: 1px solid var(--line);
    }

    .embeddedDetails > summary {
      background: transparent;
      border-bottom: 0;
      padding-left: 0;
      padding-right: 0;
    }

    .compactPanelBody {
      padding: 4px 0 0;
    }

    .resultItem {
      align-items: start;
      border-bottom: 1px solid var(--line);
      display: grid;
      gap: 6px;
      grid-template-columns: auto 1fr;
      padding: 7px 0;
    }

    .resultItem > div {
      display: grid;
      gap: 3px;
      min-width: 0;
    }

    .row input {
      flex: 1 1 120px;
      min-width: 0;
    }

    .row button {
      flex: 0 0 auto;
    }

    .actions {
      display: grid;
      gap: 7px;
      grid-template-columns: 1fr 1fr;
    }

    .field {
      display: grid;
      gap: 4px;
    }

    .presetGrid {
      display: grid;
      gap: 8px;
    }

    .presetItem {
      background: color-mix(in srgb, var(--vscode-list-hoverBackground) 45%, transparent);
      border: 1px solid var(--line);
      border-radius: 8px;
      display: grid;
      gap: 7px;
      padding: 9px;
    }

    .presetTitle {
      font-weight: 700;
    }

    .presetProblems {
      color: var(--vscode-descriptionForeground);
      font-family: var(--vscode-editor-font-family);
      font-size: 11px;
      overflow-wrap: anywhere;
    }

    .dossierApp {
      background:
        linear-gradient(90deg, transparent 0 9px, color-mix(in srgb, var(--dossierCyan) 7%, transparent) 9px 10px, transparent 10px),
        var(--vscode-sideBar-background);
      gap: 12px;
      min-height: 100vh;
      padding: 10px 10px 18px;
    }

    .sessionMasthead {
      background:
        linear-gradient(135deg, color-mix(in srgb, var(--dossierCyan) 12%, transparent), transparent 42%),
        var(--dossierInk);
      border: 1px solid var(--dossierRule);
      clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
      display: grid;
      gap: 7px;
      padding: 10px 11px 11px;
      position: relative;
    }

    .sessionMasthead::after {
      background: var(--dossierCyan);
      content: "";
      height: 1px;
      opacity: 0.75;
      position: absolute;
      right: 11px;
      top: 8px;
      width: 28px;
    }

    .dossierEyebrow,
    .evidenceCode,
    .stateStamp {
      color: var(--dossierCyan);
      font-family: var(--mono);
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .mastheadTitle {
      align-items: end;
      display: flex;
      gap: 8px;
      justify-content: space-between;
    }

    .mastheadTitle h1 {
      font-size: 16px;
      letter-spacing: -0.02em;
      line-height: 1.15;
    }

    .mastheadTitle .stateStamp {
      color: var(--dossierMint);
      flex: 0 0 auto;
    }

    .sessionMasthead .topbarTools {
      grid-template-columns: minmax(0, 1fr) 92px;
    }

    .sessionBrief {
      display: grid;
      gap: 3px 10px;
      grid-template-columns: minmax(0, 1fr) auto;
      min-width: 0;
    }

    .sessionBrief strong {
      color: var(--vscode-foreground);
      font-size: 12px;
      grid-column: 1 / -1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sessionBrief span {
      color: var(--vscode-descriptionForeground);
      font-size: 10px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    .sessionBrief span:last-child {
      text-align: right;
    }

    .sessionStatus {
      border-left: 2px solid var(--dossierAmber);
      color: var(--vscode-descriptionForeground);
      min-height: 24px;
      padding: 3px 6px;
    }

    .dossierTabs {
      background: color-mix(in srgb, var(--dossierInk) 90%, transparent);
      border-color: var(--dossierRule);
      border-radius: 0;
      clip-path: polygon(0 0, 100% 0, 100% calc(100% - 7px), calc(100% - 7px) 100%, 0 100%);
      padding: 3px;
    }

    .dossierTabs .tabButton {
      border-radius: 0;
      font-family: var(--mono);
      font-size: 10px;
      letter-spacing: 0.03em;
      min-height: 34px;
    }

    .dossierTabs .tabButton.active {
      background: color-mix(in srgb, var(--dossierCyan) 18%, var(--vscode-button-background));
      box-shadow: inset 0 -2px 0 var(--dossierCyan);
    }

    .dossierPanel,
    .problemPoster,
    .submissionDocket,
    .accountModelDrawer,
    .learningDossier {
      border-color: var(--dossierRule);
      border-radius: 0;
      clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%);
      position: relative;
    }

    .dossierPanel::before,
    .problemPoster::before,
    .learningDossier::before {
      background: var(--dossierCyan);
      content: "";
      height: 18px;
      left: 0;
      position: absolute;
      top: 0;
      width: 2px;
      z-index: 2;
    }

    .page {
      animation: dossier-enter 140ms ease-out;
    }

    @keyframes dossier-enter {
      from {
        opacity: 0;
        transform: translateY(3px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      *,
      *::before,
      *::after {
        animation-duration: 0.01ms !important;
        scroll-behavior: auto !important;
        transition-duration: 0.01ms !important;
      }
    }

    .problemPoster {
      background:
        linear-gradient(180deg, color-mix(in srgb, var(--dossierAmber) 8%, transparent), transparent 92px),
        var(--surface);
      border: 1px solid color-mix(in srgb, var(--dossierAmber) 48%, var(--line));
      display: grid;
      gap: 0;
    }

    .posterHeading,
    .dossierHeading {
      align-items: start;
      border-bottom: 1px solid var(--dossierRule);
      display: flex;
      gap: 10px;
      justify-content: space-between;
      padding: 10px 11px 9px;
    }

    .posterHeading .dossierEyebrow {
      color: var(--dossierAmber);
    }

    .posterPin {
      border: 1px solid var(--dossierAmber);
      color: var(--dossierAmber);
      font-family: var(--mono);
      font-size: 9px;
      letter-spacing: 0.08em;
      padding: 2px 5px;
    }

    .problemPoster .detail {
      border: 0;
      border-radius: 0;
    }

    .ledgerPanel,
    .skillCard,
    .resultBlock,
    .versionItem,
    .presetItem {
      border-radius: 0;
    }

    .ledgerPanel > .panelHeader,
    .ledgerPanel > summary,
    .dossierPanel > .panelHeader,
    .dossierPanel > summary {
      font-family: var(--mono);
      letter-spacing: 0.025em;
    }

    .coachPanel {
      box-shadow: inset 2px 0 0 var(--dossierCyan);
    }

    .coachPanel > .panelHeader {
      align-items: center;
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .coachPanel #aiProvider {
      overflow-wrap: anywhere;
    }

    .coachProblem,
    .aiResponse,
    .coachAskBox {
      border-radius: 0;
      clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%);
    }

    .aiResponse {
      border-left-color: var(--dossierCyan);
    }

    .coachActions button {
      border-radius: 0;
      min-height: 38px;
      position: relative;
    }

    .submissionDocket {
      display: block;
    }

    .submissionDocket > details,
    .accountModelDrawer {
      border: 1px solid var(--dossierRule);
      border-radius: 0;
    }

    .accountModelDrawer > summary {
      align-items: center;
      display: flex;
      justify-content: space-between;
    }

    .codexOAuthPanel {
      border-color: color-mix(in srgb, var(--dossierMint) 55%, var(--line));
      border-radius: 0;
      box-shadow: inset 2px 0 0 var(--dossierMint);
    }

    .codexOAuthHeading {
      align-items: start;
      display: grid;
      gap: 4px;
      grid-template-columns: minmax(0, 1fr) auto;
    }

    .codexOAuthHeading .hint {
      grid-column: 1 / -1;
    }

    .connectionStamp {
      border: 1px solid var(--dossierRule);
      color: var(--vscode-descriptionForeground);
      font-family: var(--mono);
      font-size: 9px;
      letter-spacing: 0.06em;
      padding: 2px 5px;
    }

    .codexOAuthPanel.isConnected .connectionStamp {
      border-color: var(--dossierMint);
      color: var(--dossierMint);
    }

    #ojSubmissionStatus[data-submission-state="preview"] {
      border-left-color: var(--dossierAmber);
    }

    #ojSubmissionStatus[data-submission-state="official"] {
      border-left-color: var(--dossierMint);
    }

    #ojSubmissionStatus[data-submission-state="transport"] {
      border-left-color: var(--dossierCyan);
    }

    .emptyPosterActions {
      display: grid;
      gap: 6px;
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .dossierTag.amber {
      border-color: color-mix(in srgb, var(--dossierAmber) 65%, var(--line));
      color: var(--dossierAmber);
    }

    .posterPrimaryAction {
      min-height: 38px;
    }

    .learningDossier .dossierHeading {
      background: color-mix(in srgb, var(--dossierMint) 7%, transparent);
    }

    .learningDossier .dossierEyebrow {
      color: var(--dossierMint);
    }

    .skillCard {
      box-shadow: inset 2px 0 0 var(--dossierRule);
      position: relative;
    }

    .skillCard.active,
    .skillCard.mastered {
      box-shadow: inset 2px 0 0 var(--dossierMint);
    }

    .skillCard.disabled {
      box-shadow: inset 2px 0 0 var(--vscode-disabledForeground);
    }

    .evidenceCode {
      display: block;
      margin-bottom: 3px;
    }

    @media (max-width: 360px) {
      .dossierApp {
        padding: 8px 7px 14px;
      }

      .emptyPosterActions {
        grid-template-columns: 1fr;
      }

      .posterHeading,
      .dossierHeading {
        align-items: start;
        flex-direction: column;
      }
    }
  </style>
</head>
<body>
  <main class="app dossierApp" data-design="competition-dossier">
    <header id="sessionMasthead" class="topbar sessionMasthead">
      <div class="title mastheadTitle">
        <h1 id="appTitle">做题陪练</h1>
        <span id="appSubtitle" class="stateStamp">待选题</span>
      </div>
      <div class="sessionBrief">
        <strong id="sessionProblemTitle">未选择题目</strong>
        <span id="sessionEditorState">未打开文件</span>
        <span id="sessionAttemptState">0 次提示</span>
      </div>
      <div class="topbarTools">
        <p id="status" class="status sessionStatus" role="status" aria-live="polite">正在加载…</p>
        <div class="languageSwitch">
          <label id="uiLanguageLabel" class="mini" for="uiLanguage">界面</label>
          <select id="uiLanguage">
            <option value="zh" selected>中文</option>
            <option value="en">English</option>
          </select>
        </div>
      </div>
    </header>

    <nav class="pageTabs dossierTabs" role="tablist" aria-label="主工作区">
      <button id="tabAi" class="tabButton active" type="button" role="tab" aria-controls="aiPage" aria-selected="true" tabindex="0">作答现场</button>
      <button id="tabProblem" class="tabButton" type="button" role="tab" aria-controls="problemPage" aria-selected="false" tabindex="-1">题目张贴板</button>
      <button id="tabSkill" class="tabButton" type="button" role="tab" aria-controls="skillPage" aria-selected="false" tabindex="-1">学习档案</button>
    </nav>

    <section id="problemPage" class="page" role="tabpanel" aria-labelledby="tabProblem" hidden>
      <section id="problemPoster" class="problemPoster">
        <div class="posterHeading">
          <div>
            <span class="dossierEyebrow">POSTED PROBLEM / 题目张贴板</span>
            <h2>当前题目</h2>
          </div>
          <span class="posterPin">置顶</span>
        </div>
        <section id="problemDetail" class="panel detail">
          <p class="empty">导入或选择一道题后，这里显示题面、样例和题目来源。</p>
        </section>
      </section>

      <details class="panel manualPastePanel ledgerPanel">
        <summary>导入 Markdown</summary>
        <div class="panelBody manualPasteBody">
          <div class="manualImportHero">
            <span class="responseSectionTitle">.md 题目</span>
            <p class="mini">选择文件后自动解析题面、样例和标签。</p>
            <button id="importManualMarkdownFile" type="button">选择文件</button>
          </div>
          <details class="manualFormatGuide">
            <summary>AI 写题规范</summary>
            <div class="formatGuideBody">
              <p class="mini">推荐结构：一级标题为题名；元数据写“难度”和“标签”；正文使用“题面 / 输入格式 / 输出格式 / 样例 1 / 提示”。样例输入输出请放在 text 代码块中。</p>
              <p class="mini">导入失败时，优先检查样例标题是否成对出现、代码块是否闭合、题面是否没有把标准答案写进去。</p>
            </div>
          </details>
        </div>
      </details>

      <section class="panel ledgerPanel">
        <div class="panelHeader">
          <h2>练习队列</h2>
          <span id="problemCount" class="mini">0 题</span>
        </div>
        <div class="panelBody">
          <input id="localFilter" placeholder="筛选题号、标题、标签">
        </div>
        <div id="problemList" class="problemList"></div>
      </section>

      <section class="panel ledgerPanel">
        <div class="panelHeader">
          <h2>已归档</h2>
          <span id="completedCount" class="mini">0 题</span>
        </div>
        <div id="completedList" class="problemList"></div>
      </section>

      <details class="panel ledgerPanel">
        <summary>在线题库</summary>
        <div class="panelBody">
          <div class="field">
            <label for="ojSearchPlatform">平台</label>
            <select id="ojSearchPlatform">
              <option value="luogu">洛谷</option>
              <option value="leetcode">LeetCode</option>
              <option value="nowcoder">牛客</option>
              <option value="codeforces">Codeforces</option>
              <option value="atcoder">AtCoder</option>
            </select>
          </div>
          <div class="field">
            <label for="ojSearchQuery">题号、题名或标签</label>
            <input id="ojSearchQuery" placeholder="二叉树 / P1305 / 1200A / abc086/abc086_a">
          </div>
          <div class="actions">
            <button id="searchOjProblems" type="button">搜索</button>
            <button id="refreshOjProviders" class="secondary" type="button">检查连接</button>
          </div>
          <div id="ojProviderStatus" class="ojProviderStatus"></div>
          <div id="ojSearchResults" class="searchResults"></div>
          <details class="embeddedDetails">
            <summary>连接与登录</summary>
            <div class="panelBody compactPanelBody">
              <div class="actions">
                <button id="configureOjCredential" class="secondary" type="button">更新当前平台凭据</button>
                <button id="clearOjCredential" class="secondary" type="button">清除当前平台凭据</button>
                <button id="openOjSettings" class="secondary" type="button">打开连接设置</button>
              </div>
            </div>
          </details>
        </div>
      </details>

      <details class="panel ledgerPanel">
        <summary>初始路线</summary>
        <div class="panelBody">
          <p class="hint">新学生建议先导入诊断题；已经确定要从基础题单开始，可以直接跳过诊断。</p>
          <div id="starterPresets" class="presetGrid"></div>
        </div>
      </details>

      <details class="panel ledgerPanel">
        <summary>洛谷题号与题单</summary>
        <div class="panelBody">
          <div class="field">
            <label for="luoguPid">洛谷题号</label>
            <div class="row">
              <input id="luoguPid" placeholder="例如 P5730 / 5730 / B2002，不是题单 ID">
              <button id="importPid" type="button">下载并建文件</button>
            </div>
          </div>
          <div class="field">
            <label for="luoguProblemSetId">洛谷题单 ID</label>
            <div class="row">
              <input id="luoguProblemSetId" placeholder="例如 100">
              <button id="importProblemSet" type="button">导入题单</button>
            </div>
          </div>
          <div class="field">
            <label for="luoguProblemSetKeyword">搜索洛谷题单</label>
            <input id="luoguProblemSetKeyword" placeholder="二叉树 / 动态规划">
          </div>
          <button id="searchProblemSets" class="secondary" type="button">搜索题单</button>
          <div id="problemSetSearchResults" class="searchResults"></div>
        </div>
      </details>
    </section>

    <section id="aiPage" class="page" role="tabpanel" aria-labelledby="tabAi">
      <section class="panel coachPanel dossierPanel">
        <div class="panelHeader">
          <div>
            <h2>当前作答</h2>
          </div>
          <span id="aiProvider" class="connectionPill">正在连接</span>
        </div>
        <div class="panelBody">
          <div id="coachSelection" class="coachProblem"></div>
          <div id="aiResponse" class="aiResponse">
            <span class="aiResponseTitle">准备好了</span>
            <span class="hint">写代码，需要时要一个提示。</span>
          </div>
          <div class="field coachAskBox">
            <label for="coachQuestion">追问</label>
            <textarea id="coachQuestion" class="coachQuestion" placeholder="输入问题，Ctrl+Enter 发送"></textarea>
            <div class="coachQuestionActions">
              <button id="coachSendCustom" class="secondary" type="button">发送</button>
            </div>
          </div>
          <details id="attemptOptionsDrawer" class="compactDrawer">
            <summary>作答选项</summary>
            <div class="coachOptions">
              <div class="field">
                <label for="practiceLanguage">文件语言</label>
                <select id="practiceLanguage"></select>
              </div>
              <div class="field">
                <label for="coachResponseLanguage">回答语言</label>
                <select id="coachResponseLanguage">
                  <option value="zh" selected>中文</option>
                  <option value="en">English</option>
                  <option value="raw">原文</option>
                </select>
              </div>
              <div class="field">
                <label for="coachOjVerdict">OJ 结果</label>
                <select id="coachOjVerdict">
                  <option value="UNKNOWN" selected>未确定</option>
                  <option value="AC">AC</option>
                  <option value="WA">WA</option>
                  <option value="RE">RE</option>
                  <option value="TLE">TLE</option>
                  <option value="MLE">MLE</option>
                </select>
              </div>
            </div>
          </details>
          <button id="coachHint" class="coachPrimaryAction" type="button">给一个提示</button>
          <details id="coachMoreDrawer" class="compactDrawer">
            <summary>更多操作</summary>
            <div class="coachActions coachMoreActions">
              <button id="coachSpecific" class="secondary" type="button">提示更具体</button>
              <button id="coachFollowUp" class="secondary" type="button">继续追问</button>
              <button id="coachGiveUp" class="secondary" type="button">我卡住了</button>
              <button id="coachCompleted" class="secondary" type="button">完成复盘</button>
              <button id="coachAutocomplete" class="secondary" type="button">测试补全接口</button>
            </div>
          </details>
          <div class="utilityShelf">
          <section id="submissionDocket" class="submissionDocket utilityDrawer">
            <details id="ojSubmissionPanel" class="aiConfigBox">
            <summary>提交到 OJ</summary>
            <div class="panelBody">
              <span class="hint">Codeforces 实验功能，每次提交都要确认。</span>
              <div class="field">
                <label for="ojPlatform">提交平台</label>
                <select id="ojPlatform">
                  <option value="codeforces">Codeforces</option>
                  <option value="atcoder">AtCoder</option>
                </select>
              </div>
              <div class="field">
                <label for="ojProblemUrl">题目链接</label>
                <input id="ojProblemUrl" type="url" placeholder="https://codeforces.com/contest/1234/problem/A">
              </div>
              <div class="field" id="ojCodeforcesHandleField">
                <label for="ojCodeforcesHandle">Codeforces handle（可选）</label>
                <input id="ojCodeforcesHandle" autocomplete="off" placeholder="用于公开查询本次判题结果">
              </div>
              <div class="coachActions">
                <button id="ojLogin" class="secondary" type="button">登录 Codeforces</button>
                <button id="ojPreviewSubmit" type="button">提交前确认</button>
              </div>
              <div id="ojSubmissionStatus" class="aiResponse" data-submission-state="idle">
                <span class="hint">只提交一次，不会自动重试。</span>
              </div>
            </div>
            </details>
          </section>
          <details id="connectionStatusDrawer" class="compactDrawer utilityDrawer">
            <summary>连接状态</summary>
            <div id="aiStatusGrid" class="aiStatusGrid"></div>
          </details>
          <details id="accountModelDrawer" class="aiConfigBox accountModelDrawer">
            <summary>账户与模型</summary>
            <div class="panelBody">
              <div class="aiConfigGrid">
                <div class="field">
                  <label for="aiConfigMode">兼容模式</label>
                  <select id="aiConfigMode">
                    <option value="openai-compatible">OpenAI 兼容</option>
                    <option value="openai">OpenAI 官方</option>
                    <option value="anthropic-native">Anthropic Native</option>
                  </select>
                </div>
                <div id="aiOpenAiAuthModeField" class="field" hidden>
                  <label for="aiOpenAiAuthMode">OpenAI 认证</label>
                  <select id="aiOpenAiAuthMode">
                    <option value="api-key">API Key</option>
                    <option value="codex-oauth">Codex OAuth</option>
                  </select>
                </div>
                <div id="codexOAuthPanel" class="codexOAuthPanel" hidden>
                  <div class="codexOAuthHeading">
                    <strong>Codex OAuth</strong>
                    <span id="codexConnectionStamp" class="connectionStamp">AUTH / CHECKING</span>
                    <div id="codexAuthStatus" class="hint">正在读取 Codex 登录状态…</div>
                  </div>
                  <div class="codexOAuthActions">
                    <button id="codexBrowserLogin" class="secondary" type="button">浏览器登录</button>
                    <button id="codexDeviceLogin" class="secondary" type="button">设备码登录</button>
                    <button id="codexCancelLogin" class="secondary" type="button" hidden>取消登录</button>
                    <button id="codexLogout" class="secondary" type="button" hidden>退出登录</button>
                    <button id="codexRefreshModels" class="secondary" type="button" hidden>刷新模型</button>
                  </div>
                  <div id="codexDeviceCodeRow" class="field" hidden>
                    <label for="codexDeviceCode">设备码</label>
                    <div class="row">
                      <input id="codexDeviceCode" class="codexDeviceCode" readonly>
                      <button id="codexCopyDeviceCode" class="secondary" type="button">复制</button>
                    </div>
                    <a id="codexVerificationLink" href="#" target="_blank" rel="noreferrer">打开设备验证页</a>
                  </div>
                  <div class="aiConfigGrid">
                    <div class="field">
                      <label for="codexTeachingModel">提示/评分模型</label>
                      <select id="codexTeachingModel"></select>
                    </div>
                    <div class="field">
                      <label for="codexAutocompleteModel">补全模型</label>
                      <select id="codexAutocompleteModel"></select>
                    </div>
                  </div>
                  <p id="codexModelHint" class="mini">登录后从当前账号返回的模型中选择；不会猜测或伪造 Spark。</p>
                </div>
                <div class="field">
                  <label for="aiAutocompleteFormat">补全协议</label>
                  <select id="aiAutocompleteFormat">
                    <option value="openai-completions">Completions</option>
                    <option value="openai-chat">Chat Completions</option>
                    <option value="anthropic-messages">Messages</option>
                  </select>
                </div>
                <div class="field wide">
                  <label for="aiBaseUrl">分析接口 Base URL</label>
                  <input id="aiBaseUrl" placeholder="https://token-plan-cn.xiaomimimo.com/v1">
                </div>
                <div class="field wide">
                  <label for="aiAutocompleteBaseUrl">补全接口 Base URL</label>
                  <input id="aiAutocompleteBaseUrl" placeholder="留空则跟随分析接口；DeepSeek FIM 用 https://api.deepseek.com/beta">
                </div>
                <div class="field wide">
                  <label for="aiApiKey">API Key / 密钥</label>
                  <input id="aiApiKey" type="password" placeholder="留空则保留已保存 key">
                </div>
                <div class="field">
                  <label for="aiChatModel">提示/评分模型</label>
                  <input id="aiChatModel" placeholder="mimo-v2.5">
                </div>
                <div class="field">
                  <label for="aiAutocompleteModel">补全模型</label>
                  <input id="aiAutocompleteModel" placeholder="mimo-v2.5">
                </div>
              </div>
              <div class="row">
                <button id="saveAiConfig" class="secondary" type="button">保存 AI 配置</button>
                <button id="fetchAiModels" class="secondary" type="button">拉取模型</button>
                <button id="runAiHealthCheck" class="secondary" type="button">健康检查</button>
                <span id="aiConfigSavedKey" class="mini">未检测</span>
              </div>
              <div id="aiModelResults" class="modelResults" hidden></div>
            </div>
          </details>
          </div>
        </div>
      </section>
      <section id="internalTestPanel" class="panel" hidden>
        <div class="panelHeader">
          <div>
            <h2>内测记录版</h2>
            <span class="mini">本地记录已开启，不会自动上传</span>
          </div>
          <button id="copyInternalTestSummary" class="secondary" type="button">复制摘要</button>
        </div>
        <div class="panelBody">
          <p class="hint">这个面板只会出现在内测包或显式开启环境变量时。记录可能包含题号、模型、痛点、纠偏备注和工作区路径。</p>
          <div id="internalTestMetrics" class="aiStatusGrid"></div>
          <p id="internalTestEventsPath" class="mini"></p>
        </div>
      </section>
    </section>

    <section id="skillPage" class="page" role="tabpanel" aria-labelledby="tabSkill" hidden>
      <section id="learningDossier" class="panel learningDossier">
        <div class="panelHeader dossierHeading">
          <div>
            <span class="dossierEyebrow">LEARNING FILE / 学习档案</span>
            <h2>学习档案</h2>
            <span class="mini">可查看、可纠正</span>
          </div>
          <span id="studentSkillRevision" class="mini">未加载</span>
        </div>
        <div id="studentSkillPanel" class="skillPanelBody"></div>
      </section>

      <section class="panel">
        <div class="panelHeader">
          <h2>版本回滚</h2>
          <span class="mini">最近快照</span>
        </div>
        <div id="studentSkillVersions" class="versionList"></div>
      </section>
    </section>
  </main>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const starterPresets = ${starterPresetsJson};
    const practiceLanguageOptions = ${practiceLanguageOptionsJson};
    const state = {
      problems: [],
      completedProblems: [],
      selectedKey: "",
      filter: "",
      activeEditor: undefined,
      aiStatus: undefined,
      aiConfig: undefined,
      codexOAuth: undefined,
      internalTesting: undefined,
      ojProviders: [],
      studentSkill: undefined,
      studentSkillVersions: [],
      activePage: "ai",
      uiLanguage: "zh",
      practiceLanguage: "python",
      responseLanguage: "zh",
      ojVerdict: "UNKNOWN",
      coachThreads: {}
    };

    const status = document.getElementById("status");
    const uiLanguage = document.getElementById("uiLanguage");
    const tabProblem = document.getElementById("tabProblem");
    const tabAi = document.getElementById("tabAi");
    const tabSkill = document.getElementById("tabSkill");
    const problemPage = document.getElementById("problemPage");
    const aiPage = document.getElementById("aiPage");
    const skillPage = document.getElementById("skillPage");
    const problemCount = document.getElementById("problemCount");
    const problemList = document.getElementById("problemList");
    const completedCount = document.getElementById("completedCount");
    const completedList = document.getElementById("completedList");
    const problemDetail = document.getElementById("problemDetail");
    const ojSearchPlatform = document.getElementById("ojSearchPlatform");
    const ojSearchQuery = document.getElementById("ojSearchQuery");
    const ojProviderStatus = document.getElementById("ojProviderStatus");
    const ojSearchResults = document.getElementById("ojSearchResults");
    const problemSetSearchResults = document.getElementById("problemSetSearchResults");
    const studentSkillPanel = document.getElementById("studentSkillPanel");
    const studentSkillRevision = document.getElementById("studentSkillRevision");
    const studentSkillVersions = document.getElementById("studentSkillVersions");
    const aiProvider = document.getElementById("aiProvider");
    const coachSelection = document.getElementById("coachSelection");
    const aiStatusGrid = document.getElementById("aiStatusGrid");
    const aiResponse = document.getElementById("aiResponse");
    const coachQuestion = document.getElementById("coachQuestion");
    const practiceLanguage = document.getElementById("practiceLanguage");
    const coachResponseLanguage = document.getElementById("coachResponseLanguage");
    const coachOjVerdict = document.getElementById("coachOjVerdict");
    const ojPlatform = document.getElementById("ojPlatform");
    const ojProblemUrl = document.getElementById("ojProblemUrl");
    const ojCodeforcesHandleField = document.getElementById("ojCodeforcesHandleField");
    const ojCodeforcesHandle = document.getElementById("ojCodeforcesHandle");
    const ojLogin = document.getElementById("ojLogin");
    const ojPreviewSubmit = document.getElementById("ojPreviewSubmit");
    const ojSubmissionStatus = document.getElementById("ojSubmissionStatus");
    const ojPlatformProfiles = {
      codeforces: {
        label: "Codeforces",
        placeholder: "https://codeforces.com/contest/1234/problem/A"
      },
      atcoder: {
        label: "AtCoder",
        placeholder: "https://atcoder.jp/contests/abc350/tasks/abc350_a"
      }
    };
    const aiConfigMode = document.getElementById("aiConfigMode");
    const aiOpenAiAuthModeField = document.getElementById("aiOpenAiAuthModeField");
    const aiOpenAiAuthMode = document.getElementById("aiOpenAiAuthMode");
    const aiAutocompleteFormat = document.getElementById("aiAutocompleteFormat");
    const aiBaseUrl = document.getElementById("aiBaseUrl");
    const aiAutocompleteBaseUrl = document.getElementById("aiAutocompleteBaseUrl");
    const aiApiKey = document.getElementById("aiApiKey");
    const aiChatModel = document.getElementById("aiChatModel");
    const aiAutocompleteModel = document.getElementById("aiAutocompleteModel");
    const aiConfigSavedKey = document.getElementById("aiConfigSavedKey");
    const aiModelResults = document.getElementById("aiModelResults");
    const codexOAuthPanel = document.getElementById("codexOAuthPanel");
    const codexAuthStatus = document.getElementById("codexAuthStatus");
    const codexBrowserLogin = document.getElementById("codexBrowserLogin");
    const codexDeviceLogin = document.getElementById("codexDeviceLogin");
    const codexCancelLogin = document.getElementById("codexCancelLogin");
    const codexLogout = document.getElementById("codexLogout");
    const codexRefreshModels = document.getElementById("codexRefreshModels");
    const codexDeviceCodeRow = document.getElementById("codexDeviceCodeRow");
    const codexDeviceCode = document.getElementById("codexDeviceCode");
    const codexVerificationLink = document.getElementById("codexVerificationLink");
    const codexTeachingModel = document.getElementById("codexTeachingModel");
    const codexAutocompleteModel = document.getElementById("codexAutocompleteModel");
    const codexModelHint = document.getElementById("codexModelHint");
    const codexConnectionStamp = document.getElementById("codexConnectionStamp");
    const internalTestPanel = document.getElementById("internalTestPanel");
    const internalTestMetrics = document.getElementById("internalTestMetrics");
    const internalTestEventsPath = document.getElementById("internalTestEventsPath");
    const coachGiveUp = document.getElementById("coachGiveUp");
    const coachCompleted = document.getElementById("coachCompleted");
    const coachActionButtons = [
      "coachHint",
      "coachSpecific",
      "coachFollowUp",
      "coachSendCustom",
      "coachGiveUp",
      "coachCompleted"
    ].map((id) => document.getElementById(id)).filter(Boolean);

    tabProblem.addEventListener("click", () => switchPage("problem"));
    tabAi.addEventListener("click", () => switchPage("ai"));
    tabSkill.addEventListener("click", () => switchPage("skill"));
    uiLanguage.addEventListener("change", (event) => {
      state.uiLanguage = event.target.value === "en" ? "en" : "zh";
      applyUiLanguage();
      vscode.postMessage({ command: "saveUiLanguage", language: state.uiLanguage });
    });

    practiceLanguageOptions.forEach((option) => {
      const item = document.createElement("option");
      item.value = option.id;
      item.textContent = option.label;
      practiceLanguage.appendChild(item);
    });
    practiceLanguage.value = state.practiceLanguage;
    practiceLanguage.addEventListener("change", (event) => {
      state.practiceLanguage = event.target.value;
    });
    coachResponseLanguage.addEventListener("change", (event) => {
      state.responseLanguage = event.target.value;
    });
    coachOjVerdict.addEventListener("change", (event) => {
      state.ojVerdict = event.target.value;
    });
    aiConfigMode.addEventListener("change", () => updateAiConfigModeUi(true));
    aiOpenAiAuthMode.addEventListener("change", () => updateAiConfigModeUi(false));
    codexTeachingModel.addEventListener("change", () => {
      aiChatModel.value = codexTeachingModel.value;
    });
    codexAutocompleteModel.addEventListener("change", () => {
      aiAutocompleteModel.value = codexAutocompleteModel.value;
    });
    codexBrowserLogin.addEventListener("click", () => {
      setStatus("正在启动 Codex 浏览器登录...");
      vscode.postMessage({ command: "startCodexBrowserLogin" });
    });
    codexDeviceLogin.addEventListener("click", () => {
      setStatus("正在生成 Codex 设备码...");
      vscode.postMessage({ command: "startCodexDeviceLogin" });
    });
    codexCancelLogin.addEventListener("click", () => {
      vscode.postMessage({ command: "cancelCodexLogin" });
    });
    codexLogout.addEventListener("click", () => {
      vscode.postMessage({ command: "logoutCodex" });
    });
    codexRefreshModels.addEventListener("click", () => {
      setStatus("正在刷新 Codex 模型...");
      vscode.postMessage({ command: "refreshCodexModels" });
    });
    document.getElementById("codexCopyDeviceCode").addEventListener("click", () => {
      if (codexDeviceCode.value && navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(codexDeviceCode.value)
          .then(() => setStatus("设备码已复制。"))
          .catch(() => setStatus("无法自动复制，请手动选择设备码。", "error"));
      }
    });
    document.getElementById("saveAiConfig").addEventListener("click", () => saveAiConfig());
    document.getElementById("fetchAiModels").addEventListener("click", () => fetchAiModels());
    document.getElementById("runAiHealthCheck").addEventListener("click", () => runAiHealthCheck());

    document.getElementById("localFilter").addEventListener("input", (event) => {
      state.filter = event.target.value.trim().toLowerCase();
      renderProblemList();
    });

    document.getElementById("importPid").addEventListener("click", () => {
      const pid = document.getElementById("luoguPid").value.trim();
      if (!pid) {
        setStatus("先输入一个洛谷题号。", "error");
        return;
      }
      importLuogu(pid, true);
    });

    document.getElementById("importManualMarkdownFile").addEventListener("click", () => {
      vscode.postMessage({ command: "importManualMarkdownFile" });
      setStatus("正在选择并导入 Markdown 文件...");
    });

    document.getElementById("searchOjProblems").addEventListener("click", () => requestOjSearch());
    document.getElementById("refreshOjProviders").addEventListener("click", () => {
      setStatus("正在并行检查题库连接...");
      vscode.postMessage({ command: "refreshOjProviders" });
    });
    ojSearchQuery.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        requestOjSearch();
      }
    });
    ojSearchPlatform.addEventListener("change", () => {
      updateOjSearchPlaceholder();
      renderOjProviders();
    });
    document.getElementById("configureOjCredential").addEventListener("click", () => configureOjCredential());
    document.getElementById("clearOjCredential").addEventListener("click", () => clearOjCredential());
    document.getElementById("openOjSettings").addEventListener("click", () => {
      vscode.postMessage({ command: "openOjSettings" });
    });

    document.getElementById("searchProblemSets").addEventListener("click", () => {
      const keyword = document.getElementById("luoguProblemSetKeyword").value.trim();
      if (!keyword) {
        setStatus("先输入搜索关键词。", "error");
        return;
      }
      setStatus("正在搜索洛谷题单...");
      vscode.postMessage({ command: "searchLuoguProblemSets", keyword });
    });

    document.getElementById("importProblemSet").addEventListener("click", () => {
      const id = document.getElementById("luoguProblemSetId").value.trim();
      if (!id) {
        setStatus("先输入洛谷题单 ID。", "error");
        return;
      }
      setStatus("正在导入题单 " + id + "...");
      vscode.postMessage({ command: "importLuoguProblemSet", id });
    });

    coachQuestion.addEventListener("keydown", (event) => {
      if (event.ctrlKey && event.key === "Enter") {
        event.preventDefault();
        sendCustomFollowUp();
      }
    });
    document.getElementById("coachSendCustom").addEventListener("click", () => sendCustomFollowUp());
    document.getElementById("coachHint").addEventListener("click", () => requestAiCoach("hint"));
    document.getElementById("coachSpecific").addEventListener("click", () => requestAiCoach("specific"));
    document.getElementById("coachFollowUp").addEventListener("click", () => requestAiCoach("followUp"));
    document.getElementById("coachGiveUp").addEventListener("click", () => requestAiCoach("giveUp"));
    document.getElementById("coachCompleted").addEventListener("click", () => requestCompletionReview());
    document.getElementById("coachAutocomplete").addEventListener("click", () => requestAutocompletePreview());
    ojLogin.addEventListener("click", () => requestOjLogin());
    ojPreviewSubmit.addEventListener("click", () => previewOjSubmission());
    ojPlatform.addEventListener("change", () => setOjPlatform(ojPlatform.value));
    document.getElementById("copyInternalTestSummary").addEventListener("click", () => {
      vscode.postMessage({ command: "copyInternalTestSummary" });
    });

    window.addEventListener("message", (event) => {
      const data = event.data;
      setCoachBusy(false);
      if (data.type === "status") {
        setStatus(data.text, data.tone);
        if (data.tone === "error") {
          renderAiError(data.text);
        }
      }
      if (data.type === "problemBankState") {
        state.problems = data.problems ?? [];
        state.completedProblems = data.completedProblems ?? [];
        if ("selectedKey" in data) {
          state.selectedKey = data.selectedKey || "";
        }
        state.aiStatus = data.aiStatus;
        state.aiConfig = data.aiConfig;
        state.codexOAuth = data.codexOAuth;
        state.activeEditor = data.activeEditor || state.activeEditor;
        state.uiLanguage = data.uiLanguage === "en" ? "en" : "zh";
        state.internalTesting = data.internalTesting;
        state.ojProviders = data.ojProviders ?? state.ojProviders;
        state.studentSkill = data.studentSkill;
        state.studentSkillVersions = data.studentSkillVersions ?? [];
        renderAll();
        if (data.status) {
          setStatus(data.status);
        }
        if (data.createdFile) {
          switchPage("ai");
          renderCreatedFile(data.createdFile);
        }
        if (data.lessonReport) {
          switchPage("ai");
          renderLessonReport(data.lessonReport);
        } else if (data.solutionScore) {
          switchPage("ai");
          renderSolutionScore(data.solutionScore);
        } else if (data.archivedProblem) {
          switchPage("ai");
          renderArchivedProblem(data.archivedProblem);
        }
      }
      if (data.type === "problemSetSearchResults") {
        renderProblemSetResults(data);
      }
      if (data.type === "ojProblemSearchResults") {
        renderOjProblemResults(data);
      }
      if (data.type === "ojProviderStatus") {
        state.ojProviders = data.providers ?? [];
        renderOjProviders();
        setStatus(data.status || "题库连接状态已更新。");
      }
      if (data.type === "aiModelResults") {
        setStatus(data.status || "模型列表已拉取。");
        renderAiModelResults(data);
      }
      if (data.type === "aiHealthCheckResult") {
        setStatus(data.status || "连接检测完成。", healthCheckHasFailure(data.result) ? "error" : undefined);
        state.aiStatus = {
          ...(state.aiStatus || {}),
          healthCheck: data.result
        };
        renderAiStatus();
        renderAiHealthCheckResult(data);
      }
      if (data.type === "teachingDiagnosis") {
        setStatus(data.status || "AI 已返回分析。");
        state.studentSkill = data.studentSkill || state.studentSkill;
        state.studentSkillVersions = data.studentSkillVersions ?? state.studentSkillVersions;
        renderStudentSkill();
        switchPage("ai");
        renderAiDiagnosis(data);
      }
      if (data.type === "coachFollowUp") {
        setStatus(data.status || "AI 已回答追问。");
        switchPage("ai");
        renderCoachFollowUp(data);
      }
      if (data.type === "problemRecommendation") {
        setStatus(data.status || "规则推荐已生成。");
        state.studentSkill = data.studentSkill || state.studentSkill;
        state.studentSkillVersions = data.studentSkillVersions ?? state.studentSkillVersions;
        renderStudentSkill();
        switchPage("ai");
        renderProblemRecommendation(data);
      }
      if (data.type === "autocompletePreview") {
        setStatus(data.status || "AI 已返回补全预览。", data.suggestion ? undefined : "error");
        switchPage("ai");
        renderAutocompletePreview(data);
      }
      if (data.type === "submissionJudge") {
        setStatus(data.status || "AI 已完成交题前自检。");
        switchPage("ai");
        renderSubmissionJudge(data);
      }
      if (data.type === "ojSubmissionPreview") {
        setStatus(data.status || "提交预览已生成；尚未发送代码。");
        switchPage("ai");
        renderOjSubmissionPreview(data);
      }
      if (data.type === "ojSubmissionResult") {
        const failed = ["login_required", "unavailable", "failed"].includes(data.result?.status);
        setStatus(data.status || data.result?.message || "Codeforces 提交流程已结束。", failed ? "error" : undefined);
        switchPage("ai");
        renderOjSubmissionResult(data);
      }
      if (data.type === "optimizationReport") {
        setStatus(data.status || "AI 已完成优化复盘。");
        if (data.completedProblem) {
          upsertCompletedProblem(data.completedProblem);
          renderCompletedList();
          renderStats();
        }
        switchPage("ai");
        renderOptimizationReport(data.optimizationReport);
      }
      if (data.type === "internalTestSummary") {
        state.internalTesting = data.summary;
        renderInternalTesting();
        copyInternalTestSummary(data.summary);
      }
    });

    renderStarterPresets();
    switchPage("ai");
    setOjPlatform("codeforces");
    vscode.postMessage({ command: "loadProblems" });
    vscode.postMessage({ command: "readCodexAuth" });
    vscode.postMessage({ command: "refreshOjProviders" });

    const uiCopy = {
      zh: {
        appTitle: "做题陪练",
        appSubtitle: "待选题",
        uiLanguageLabel: "界面",
        tabAi: "作答现场",
        tabProblem: "题目张贴板",
        tabSkill: "学习档案",
        coachPanelTitle: "当前作答",
        coachQuestionLabel: "追问",
        coachQuestionPlaceholder: "输入问题，Ctrl+Enter 发送",
        send: "发送",
        practiceLanguageLabel: "文件语言",
        responseLanguageLabel: "回答语言",
        responseZh: "中文",
        responseEn: "English",
        responseRaw: "原文",
        ojVerdictLabel: "OJ 结果",
        hint: "给一个提示",
        specific: "提示更具体",
        followUp: "继续追问",
        giveUp: "我卡住了",
        completed: "完成复盘",
        autocompletePreview: "测试补全接口",
        waitingTitle: "准备好了",
        waitingHint: "写代码，需要时要一个提示。",
        problemTabGuide: "导入 Markdown",
        manualImportTitle: ".md 题目",
        manualImportButton: "选择文件",
        queueTitle: "练习队列",
        archiveTitle: "已归档",
        skillTitle: "学习档案",
        skillSubtitle: "可查看、可纠正"
      },
      en: {
        appTitle: "Student Autocomplete Lab",
        appSubtitle: "AI / Autocomplete / Pain Points",
        uiLanguageLabel: "UI",
        tabAi: "AI Coach",
        tabProblem: "Problems",
        tabSkill: "Learning Profile",
        coachPanelTitle: "Current Attempt",
        coachQuestionLabel: "Ask",
        coachQuestionPlaceholder: "Ask a question · Ctrl+Enter",
        send: "Send",
        practiceLanguageLabel: "File Language",
        responseLanguageLabel: "Reply Language",
        responseZh: "Chinese",
        responseEn: "English",
        responseRaw: "Raw",
        ojVerdictLabel: "OJ Result",
        hint: "Hint",
        specific: "More Specific",
        followUp: "Continue",
        giveUp: "I Give Up",
        completed: "I Finished",
        autocompletePreview: "Test Completion API",
        waitingTitle: "Ready",
        waitingHint: "Code first; ask for a hint when needed.",
        problemTabGuide: "Import Markdown",
        manualImportTitle: ".md Problem",
        manualImportButton: "Choose File",
        queueTitle: "Practice Queue",
        archiveTitle: "Archived",
        skillTitle: "Learning File",
        skillSubtitle: "Reviewable and correctable"
      }
    };

    function selectedOjPlatform() {
      const value = ojSearchPlatform.value;
      return ["luogu", "leetcode", "nowcoder", "codeforces", "atcoder"].includes(value) ? value : "luogu";
    }

    function requestOjSearch() {
      const query = ojSearchQuery.value.trim();
      const platform = selectedOjPlatform();
      if (!query) {
        setStatus("先输入题号、题名或标签。", "error");
        return;
      }
      setStatus("正在搜索 " + platformLabel(platform) + "...");
      ojSearchResults.innerHTML = "";
      vscode.postMessage({ command: "searchOjProblems", platform, query });
    }

    function configureOjCredential() {
      const platform = selectedOjPlatform();
      if (platform === "nowcoder") {
        vscode.postMessage({ command: "configureNowCoderSession" });
        return;
      }
      if (["luogu", "codeforces", "atcoder"].includes(platform)) {
        vscode.postMessage({ command: "configureOjRemoteKey", platform });
        return;
      }
      setStatus("LeetCode 适配器固定为匿名只读，无需登录凭据。请在连接设置中配置本机入口。");
    }

    function clearOjCredential() {
      const platform = selectedOjPlatform();
      if (platform === "nowcoder") {
        vscode.postMessage({ command: "clearNowCoderSession" });
        return;
      }
      if (["luogu", "codeforces", "atcoder"].includes(platform)) {
        vscode.postMessage({ command: "clearOjRemoteKey", platform });
        return;
      }
      setStatus("LeetCode 匿名只读适配器没有可清除的登录凭据。" );
    }

    function updateOjSearchPlaceholder() {
      const placeholders = {
        luogu: "二叉树 / P1305",
        leetcode: "two sum / binary tree",
        nowcoder: "二分图 / NC218144",
        codeforces: "1200A / dp / rating:1600",
        atcoder: "abc086/abc086_a 或完整题目 URL"
      };
      ojSearchQuery.placeholder = placeholders[selectedOjPlatform()] || "题号、题名或标签";
    }

    function switchPage(page) {
      state.activePage = page;
      const isProblem = page === "problem";
      const isAi = page === "ai";
      const isSkill = page === "skill";
      problemPage.hidden = !isProblem;
      aiPage.hidden = !isAi;
      skillPage.hidden = !isSkill;
      tabProblem.className = "tabButton" + (isProblem ? " active" : "");
      tabAi.className = "tabButton" + (isAi ? " active" : "");
      tabSkill.className = "tabButton" + (isSkill ? " active" : "");
      tabProblem.setAttribute("aria-selected", String(isProblem));
      tabAi.setAttribute("aria-selected", String(isAi));
      tabSkill.setAttribute("aria-selected", String(isSkill));
      tabProblem.tabIndex = isProblem ? 0 : -1;
      tabAi.tabIndex = isAi ? 0 : -1;
      tabSkill.tabIndex = isSkill ? 0 : -1;
    }

    function importLuogu(pid, createFile) {
      const normalizedPid = normalizePid(pid);
      setStatus("正在导入 " + normalizedPid + "...");
      vscode.postMessage({
        command: "importLuogu",
        pid: normalizedPid,
        createFile: Boolean(createFile),
        language: state.practiceLanguage
      });
    }

    function renderAll() {
      applyUiLanguage();
      renderSessionMasthead();
      renderStats();
      renderAiConfig();
      renderCoach();
      renderProblemList();
      renderCompletedList();
      renderDetail();
      renderStudentSkill();
      renderInternalTesting();
      renderOjProviders();
    }

    function applyUiLanguage() {
      const copy = uiCopy[state.uiLanguage] || uiCopy.zh;
      document.documentElement.lang = state.uiLanguage === "en" ? "en" : "zh-CN";
      uiLanguage.value = state.uiLanguage;
      setElementText("appTitle", copy.appTitle);
      setElementText("appSubtitle", copy.appSubtitle);
      setElementText("uiLanguageLabel", copy.uiLanguageLabel);
      tabAi.textContent = copy.tabAi;
      tabProblem.textContent = copy.tabProblem;
      tabSkill.textContent = copy.tabSkill;
      setElementText("coachHint", copy.hint);
      setElementText("coachSpecific", copy.specific);
      setElementText("coachFollowUp", copy.followUp);
      setElementText("coachGiveUp", copy.giveUp);
      setElementText("coachCompleted", copy.completed);
      setElementText("coachAutocomplete", copy.autocompletePreview);
      setElementText("coachSendCustom", copy.send);
      setLabelText("coachQuestion", copy.coachQuestionLabel);
      setLabelText("practiceLanguage", copy.practiceLanguageLabel);
      setLabelText("coachResponseLanguage", copy.responseLanguageLabel);
      setLabelText("coachOjVerdict", copy.ojVerdictLabel);
      coachQuestion.placeholder = copy.coachQuestionPlaceholder;
      setOptionText(coachResponseLanguage, "zh", copy.responseZh);
      setOptionText(coachResponseLanguage, "en", copy.responseEn);
      setOptionText(coachResponseLanguage, "raw", copy.responseRaw);
      const coachTitle = document.querySelector(".coachPanel .panelHeader h2");
      if (coachTitle) {
        coachTitle.textContent = copy.coachPanelTitle;
      }
      const waitingTitle = aiResponse.querySelector(".aiResponseTitle");
      const waitingHint = aiResponse.querySelector(".hint");
      if (waitingTitle?.textContent === uiCopy.zh.waitingTitle || waitingTitle?.textContent === uiCopy.en.waitingTitle) {
        waitingTitle.textContent = copy.waitingTitle;
      }
      if (waitingHint?.textContent === uiCopy.zh.waitingHint || waitingHint?.textContent === uiCopy.en.waitingHint) {
        waitingHint.textContent = copy.waitingHint;
      }
      const manualSummary = document.querySelector(".manualPastePanel > summary");
      if (manualSummary) {
        manualSummary.textContent = copy.problemTabGuide;
      }
      const manualTitle = document.querySelector(".manualImportHero .responseSectionTitle");
      if (manualTitle) {
        manualTitle.textContent = copy.manualImportTitle;
      }
      setElementText("importManualMarkdownFile", copy.manualImportButton);
      const problemHeaders = document.querySelectorAll("#problemPage .panelHeader h2");
      if (problemHeaders[0]) {
        problemHeaders[0].textContent = copy.queueTitle;
      }
      if (problemHeaders[1]) {
        problemHeaders[1].textContent = copy.archiveTitle;
      }
      const skillHeader = document.querySelector("#skillPage .panelHeader h2");
      const skillSubtitle = document.querySelector("#skillPage .panelHeader .mini");
      if (skillHeader) {
        skillHeader.textContent = copy.skillTitle;
      }
      if (skillSubtitle) {
        skillSubtitle.textContent = copy.skillSubtitle;
      }
    }

    function setElementText(id, text) {
      const element = document.getElementById(id);
      if (element) {
        element.textContent = text;
      }
    }

    function setLabelText(forId, text) {
      const label = document.querySelector('label[for="' + forId + '"]');
      if (label) {
        label.textContent = text;
      }
    }

    function setOptionText(select, value, text) {
      const option = select.querySelector('option[value="' + value + '"]');
      if (option) {
        option.textContent = text;
      }
    }

    function renderAiConfig() {
      const config = state.aiConfig;
      if (!config) {
        return;
      }

      aiConfigMode.value = config.mode || "openai-compatible";
      aiOpenAiAuthMode.value = config.authMode || "api-key";
      aiBaseUrl.value = config.baseUrl || "";
      aiAutocompleteBaseUrl.value = config.autocompleteBaseUrl || "";
      aiChatModel.value = config.chatModel || "";
      aiAutocompleteModel.value = config.autocompleteModel || "";
      aiAutocompleteFormat.value = config.autocompleteFormat || "openai-completions";
      aiApiKey.value = "";
      aiApiKey.placeholder = config.hasApiKey ? "已保存，留空不修改" : "输入 API Key";
      aiConfigSavedKey.textContent = config.hasApiKey ? "API Key：已保存" : "API Key：未保存";
      updateAiConfigModeUi(false);
      renderCodexOAuth();
    }

    function updateAiConfigModeUi(applyDefaults) {
      const mode = aiConfigMode.value;
      const usesCodexOAuth = mode === "openai" && aiOpenAiAuthMode.value === "codex-oauth";
      aiOpenAiAuthModeField.hidden = mode !== "openai";
      codexOAuthPanel.hidden = !usesCodexOAuth;
      [aiAutocompleteFormat, aiBaseUrl, aiAutocompleteBaseUrl, aiApiKey, aiChatModel, aiAutocompleteModel]
        .forEach((control) => {
          const field = control.closest(".field");
          if (field) {
            field.hidden = usesCodexOAuth;
          }
        });
      document.getElementById("fetchAiModels").hidden = usesCodexOAuth;
      aiConfigSavedKey.hidden = usesCodexOAuth;
      if (mode === "openai") {
        aiAutocompleteFormat.value = "openai-chat";
        aiAutocompleteFormat.disabled = true;
        aiBaseUrl.placeholder = "https://api.openai.com/v1";
        aiAutocompleteBaseUrl.placeholder = "OpenAI 官方模式下跟随分析接口";
        aiAutocompleteBaseUrl.disabled = true;
        aiAutocompleteBaseUrl.value = "";
        if (applyDefaults && !aiBaseUrl.value.trim()) {
          aiBaseUrl.value = "https://api.openai.com/v1";
        }
      } else if (mode === "anthropic-native") {
        aiAutocompleteFormat.value = "anthropic-messages";
        aiAutocompleteFormat.disabled = true;
        aiBaseUrl.placeholder = "https://api.anthropic.com/v1";
        aiAutocompleteBaseUrl.placeholder = "Anthropic Native 模式下跟随分析接口";
        aiAutocompleteBaseUrl.disabled = true;
        aiAutocompleteBaseUrl.value = "";
        if (applyDefaults && !aiBaseUrl.value.trim()) {
          aiBaseUrl.value = "https://api.anthropic.com/v1";
        }
      } else {
        aiAutocompleteFormat.disabled = false;
        aiAutocompleteBaseUrl.disabled = false;
        aiBaseUrl.placeholder = "https://token-plan-cn.xiaomimimo.com/v1";
        aiAutocompleteBaseUrl.placeholder = "留空则跟随分析接口；DeepSeek FIM 用 https://api.deepseek.com/beta";
      }
      if (usesCodexOAuth) {
        renderCodexOAuth();
      }
    }

    function renderCodexOAuth() {
      const view = state.codexOAuth || { auth: { status: "starting" }, models: [] };
      const auth = view.auth || { status: "starting" };
      const signedIn = auth.status === "signed-in";
      const pending = auth.status === "login-pending";
      codexOAuthPanel.dataset.authState = auth.status;
      codexOAuthPanel.classList.toggle("isConnected", signedIn);
      codexConnectionStamp.textContent = signedIn
        ? "AUTH / CONNECTED"
        : pending
          ? "AUTH / PENDING"
          : auth.status === "error" || auth.status === "unavailable"
            ? "AUTH / ERROR"
            : "AUTH / SIGNED OUT";
      codexBrowserLogin.hidden = signedIn || pending;
      codexDeviceLogin.hidden = signedIn || pending;
      codexCancelLogin.hidden = !pending;
      codexLogout.hidden = !signedIn;
      codexRefreshModels.hidden = !signedIn;
      codexDeviceCodeRow.hidden = !(pending && auth.userCode && auth.verificationUrl);
      codexDeviceCode.value = auth.userCode || "";
      if (pending && auth.verificationUrl) {
        codexVerificationLink.href = auth.verificationUrl;
      } else {
        codexVerificationLink.removeAttribute("href");
      }

      if (auth.status === "signed-in") {
        codexAuthStatus.textContent = [
          "已登录",
          auth.email || "账号邮箱未返回",
          auth.planType ? "套餐 " + auth.planType : ""
        ].filter(Boolean).join(" · ");
      } else if (auth.status === "login-pending") {
        codexAuthStatus.textContent = auth.userCode
          ? "等待设备码登录完成。"
          : "等待浏览器登录完成。";
      } else if (auth.status === "signed-out") {
        codexAuthStatus.textContent = "未登录。选择浏览器登录或设备码登录。";
      } else if (auth.status === "error" || auth.status === "unavailable") {
        codexAuthStatus.textContent = "Codex OAuth 不可用：" + (auth.error || "未知错误");
      } else {
        codexAuthStatus.textContent = "正在读取 Codex 登录状态…";
      }

      populateCodexModelSelect(
        codexTeachingModel,
        aiChatModel.value,
        view.models || [],
        view.recommendedTeachingModel,
        signedIn
      );
      populateCodexModelSelect(
        codexAutocompleteModel,
        aiAutocompleteModel.value,
        view.models || [],
        view.recommendedAutocompleteModel,
        signedIn
      );
      aiChatModel.value = codexTeachingModel.value || aiChatModel.value;
      aiAutocompleteModel.value = codexAutocompleteModel.value || aiAutocompleteModel.value;
      codexModelHint.textContent = view.error
        ? "模型刷新失败：" + view.error
        : signedIn
          ? "当前账号返回 " + (view.models || []).length + " 个可选模型。"
          : "登录后从当前账号返回的模型中选择；不会猜测或伪造 Spark。";
    }

    function populateCodexModelSelect(select, selected, models, recommended, enabled) {
      select.innerHTML = "";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "请选择模型";
      select.appendChild(placeholder);
      const available = models.some((model) => model.id === selected);
      if (selected && !available) {
        const unavailable = document.createElement("option");
        unavailable.value = selected;
        unavailable.textContent = selected + "（当前账号未返回）";
        select.appendChild(unavailable);
      }
      models.forEach((model) => {
        const option = document.createElement("option");
        option.value = model.id;
        option.textContent = model.displayName && model.displayName !== model.id
          ? model.displayName + " · " + model.id
          : model.id;
        select.appendChild(option);
      });
      const target = selected || recommended || "";
      if (target && Array.from(select.options).some((option) => option.value === target)) {
        select.value = target;
      } else {
        select.value = "";
      }
      select.disabled = !enabled || select.options.length <= 1;
    }

    function renderInternalTesting() {
      const summary = state.internalTesting;
      const enabled = Boolean(summary?.enabled);
      internalTestPanel.hidden = !enabled;
      internalTestMetrics.innerHTML = "";
      internalTestEventsPath.textContent = "";
      if (!enabled) {
        return;
      }

      [
        { label: "本地记录", value: summary.totalEvents + " 条事件" },
        { label: "损坏记录", value: (summary.invalidRecordCount || 0) + " 行" },
        { label: "覆盖题目", value: summary.problemCount + " 题" },
        { label: "提示/放弃", value: summary.hintCount + " / " + summary.giveUpCount },
        { label: "评分/纠偏", value: summary.solutionScoreCount + " / " + summary.skillFeedbackCount },
        { label: "推荐/补全", value: summary.recommendationCount + " / " + summary.autocompleteRequestCount },
        { label: "模型", value: (summary.models || []).join(", ") || "未记录" }
      ].forEach((item) => {
        const row = document.createElement("div");
        row.className = "aiStatusItem ready";
        row.appendChild(textSpan(item.label, "mini"));
        row.appendChild(textSpan(item.value, "hint"));
        internalTestMetrics.appendChild(row);
      });
      internalTestEventsPath.textContent = "记录文件：" + (summary.eventsPath || "VS Code 全局存储") + "；" + summary.privacyNotice;
    }

    function copyInternalTestSummary(summary) {
      const text = formatInternalTestSummary(summary);
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(text)
          .then(() => setStatus("已复制内测记录摘要。"))
          .catch(() => renderInternalTestSummaryText(text));
      } else {
        renderInternalTestSummaryText(text);
      }
    }

    function renderInternalTestSummaryText(text) {
      setStatus("内测摘要已生成，当前环境不能直接写剪贴板。");
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("内测记录摘要", "aiResponseTitle"));
      aiResponse.appendChild(codeBlock(text));
    }

    function formatInternalTestSummary(summary) {
      if (!summary?.enabled) {
        return "Student Autocomplete Lab 正式版：内测记录未开启。";
      }

      return [
        "Student Autocomplete Lab 内测记录版",
        "事件数：" + summary.totalEvents,
        "题目数：" + summary.problemCount,
        "提示次数：" + summary.hintCount,
        "放弃/讲解次数：" + summary.giveUpCount,
        "学习评分次数：" + summary.solutionScoreCount,
        "用户纠偏次数：" + summary.skillFeedbackCount,
        "推荐次数：" + summary.recommendationCount,
        "补全请求次数：" + summary.autocompleteRequestCount,
        "损坏记录数：" + (summary.invalidRecordCount || 0),
        "模型：" + ((summary.models || []).join(", ") || "未记录"),
        "记录文件：" + (summary.eventsPath || "VS Code 全局存储"),
        summary.privacyNotice
      ].join("\\n");
    }

    function saveAiConfig() {
      setStatus("正在保存 AI 配置...");
      vscode.postMessage({
        command: "saveAiConfig",
        config: currentAiConfigUpdate()
      });
    }

    function fetchAiModels() {
      aiModelResults.hidden = false;
      aiModelResults.innerHTML = "";
      aiModelResults.appendChild(textSpan("正在拉取模型列表...", "mini"));
      setStatus("正在拉取模型列表...");
      vscode.postMessage({
        command: "fetchAiModels",
        config: currentAiConfigUpdate()
      });
    }

    function runAiHealthCheck() {
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("连接检测", "aiResponseTitle"));
      aiResponse.appendChild(textSpan("正在检查模型、提示和补全。", "hint"));
      setStatus("正在检测连接...");
      vscode.postMessage({
        command: "runAiHealthCheck",
        config: currentAiConfigUpdate()
      });
    }

    function currentAiConfigUpdate() {
      const mode = aiConfigMode.value || "openai-compatible";
      const format = mode === "openai"
        ? "openai-chat"
        : mode === "anthropic-native"
          ? "anthropic-messages"
          : aiAutocompleteFormat.value || "openai-completions";
      return {
        mode,
        authMode: mode === "openai" ? aiOpenAiAuthMode.value || "api-key" : undefined,
        baseUrl: aiBaseUrl.value.trim(),
        autocompleteBaseUrl: mode === "openai-compatible" ? aiAutocompleteBaseUrl.value.trim() : "",
        apiKey: aiApiKey.value.trim(),
        chatModel: aiChatModel.value.trim(),
        autocompleteModel: aiAutocompleteModel.value.trim(),
        autocompleteFormat: format
      };
    }

    function renderAiModelResults(data) {
      aiModelResults.hidden = false;
      aiModelResults.innerHTML = "";
      const models = data.models || [];
      aiModelResults.appendChild(textSpan("模型列表 · " + models.length + " 个", "aiResponseTitle"));
      if (models.length === 0) {
        aiModelResults.appendChild(textSpan("没有返回可用模型；仍可手动填写模型名。", "hint"));
        return;
      }

      models.forEach((model) => {
        const row = document.createElement("div");
        row.className = "resultItem";
        const actions = document.createElement("div");
        actions.className = "row";
        const setChat = document.createElement("button");
        setChat.className = "secondary";
        setChat.type = "button";
        setChat.textContent = "设为分析";
        setChat.disabled = Boolean(model.isAudioModel);
        setChat.addEventListener("click", () => {
          aiChatModel.value = model.id;
          setStatus("已把 " + model.id + " 设为分析模型。");
        });
        const setAutocomplete = document.createElement("button");
        setAutocomplete.className = "secondary";
        setAutocomplete.type = "button";
        setAutocomplete.textContent = "设为补全";
        setAutocomplete.disabled = Boolean(model.isAudioModel);
        setAutocomplete.addEventListener("click", () => {
          aiAutocompleteModel.value = model.id;
          setStatus("已把 " + model.id + " 设为补全模型。");
        });
        actions.appendChild(setChat);
        actions.appendChild(setAutocomplete);

        const body = document.createElement("div");
        body.appendChild(textSpan(model.id, "problemTitle"));
        body.appendChild(textSpan(modelHint(model), "mini"));
        row.appendChild(actions);
        row.appendChild(body);
        aiModelResults.appendChild(row);
      });
    }

    function renderAiHealthCheckResult(data) {
      const result = data.result || {};
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("连接检测", "aiResponseTitle"));
      aiResponse.appendChild(textSpan(healthCheckHasFailure(result) ? "需要检查" : "全部通过", "mini"));
      const healthDetails = [
        responseBlock("模型列表", healthCheckStepText(result.models, "models")),
        responseBlock("提示与评分", healthCheckStepText(result.chatSmoke, "chat")),
        responseBlock("代码补全", healthCheckStepText(result.autocompleteSmoke, "autocomplete"))
      ];
      aiResponse.appendChild(resultDetailsGroup("检测详情", healthDetails));
    }

    function healthCheckStepText(step, kind) {
      const item = step || {};
      if (item.status === "pass") {
        return "通过";
      }
      if (item.validationStatus === "validator-rejected") {
        return "补全被安全检查拦截。";
      }
      if (item.validationStatus === "model-empty") {
        return "模型没有返回补全内容。";
      }
      return item.errorHint || item.error || healthCheckDefaultHint(kind, item) || "未通过";
    }

    function healthCheckDefaultHint(kind, step) {
      if (!step || step.status !== "pass") {
        return "修复建议：证据不足，请检查 endpoint、模型名和协议。";
      }
      if (kind === "models") {
        return "结论：/models 可达，可以从模型列表选择分析/补全模型。";
      }
      if (kind === "chat") {
        return "结论：AI 教练提示路由可达。";
      }
      return "结论：自动补全路由可达。";
    }

    function healthCheckHasFailure(result) {
      return [result?.models, result?.chatSmoke, result?.autocompleteSmoke].some((step) => step?.status === "fail");
    }

    function modelHint(model) {
      if (model.isAudioModel) {
        return "音频/TTS 模型，已标记为不适合分析或补全";
      }
      const uses = model.recommendedFor || [];
      if (uses.includes("chat") && uses.includes("autocomplete")) {
        return "推荐：分析 / 补全";
      }
      if (uses.includes("chat")) {
        return "推荐：分析";
      }
      if (uses.includes("autocomplete")) {
        return "推荐：补全";
      }
      return "可手动选择";
    }

    function renderCoach() {
      const problem = selectedCoachProblem();
      const isArchivedCoachProblem = Boolean(selectedArchivedProblem());
      renderSessionMasthead();
      renderAiStatus();
      coachSelection.innerHTML = "";
      const summary = document.createElement("div");
      summary.className = "coachSummary";

      if (!problem) {
        summary.appendChild(textSpan("还没选题", "aiResponseTitle"));
        summary.appendChild(textSpan("到题目张贴板选一道题。", "hint"));
        coachSelection.appendChild(summary);
        setCoachBusy(false);
        return;
      }

      const threadLength = coachThread(keyOf(problem)).length;
      const activeEditor = state.activeEditor || {};
      summary.appendChild(textSpan(problem.id + " · " + problem.title, "aiResponseTitle"));
      const tags = document.createElement("div");
      tags.className = "tagRow";
      tags.appendChild(textSpan(problem.statement ? "题面就绪" : "题面待下载", "tag"));
      tags.appendChild(textSpan(activeEditor.relativePath || activeEditor.fileName ? "文件已打开" : "未打开文件", "tag"));
      tags.appendChild(textSpan(threadLength + " 次提示", "tag"));
      if (isArchivedCoachProblem) {
        tags.appendChild(textSpan("已归档", "tag dossierTag amber"));
      }
      summary.appendChild(tags);
      coachSelection.appendChild(summary);
      setCoachBusy(false);
    }

    function renderAiStatus() {
      aiStatusGrid.innerHTML = "";
      const statusData = state.aiStatus;
      if (!statusData) {
        aiProvider.textContent = "正在连接";
        return;
      }

      const teaching = statusData.teaching || {};
      const autocomplete = statusData.autocomplete || {};
      if (teaching.configured || autocomplete.configured) {
        aiProvider.textContent = "AI 已就绪";
      } else {
        aiProvider.textContent = "需要配置";
      }
      [
        {
          label: "代码补全",
          data: statusData.autocomplete,
          readyText: "已连接"
        },
        {
          label: "提示与评分",
          data: statusData.teaching,
          readyText: "已连接"
        }
      ].forEach((item) => {
        const row = document.createElement("div");
        row.className = "aiStatusItem" + (item.data?.configured ? " ready" : "");
        row.appendChild(textSpan(item.label, "mini"));
        row.appendChild(textSpan(item.data?.configured ? item.readyText : "未连接", "hint"));
        aiStatusGrid.appendChild(row);
      });

      const health = statusData.healthCheck;
      if (health) {
        [
          { label: "模型列表", step: health.models },
          { label: "AI 提示", step: health.chatSmoke },
          { label: "自动补全", step: health.autocompleteSmoke }
        ].forEach((item) => {
          const row = document.createElement("div");
          row.className = "aiStatusItem" + (item.step?.status === "pass" ? " ready" : "");
          row.appendChild(textSpan(item.label, "mini"));
          row.appendChild(textSpan(item.step?.status === "pass" ? "检查通过" : "需要检查", "hint"));
          aiStatusGrid.appendChild(row);
        });
      }
    }

    function sendCustomFollowUp() {
      requestAiCoach("followUp", "custom");
    }

    function requestAiCoach(action, source) {
      const problem = selectedCoachProblem();
      if (!problem) {
        setStatus("先选择或导入一道题。", "error");
        return;
      }
      if ((action === "giveUp" || action === "completed") && selectedArchivedProblem()) {
        setStatus("这题已经归档；可以继续追问、找错复盘、优化复盘或推荐下一题。", "error");
        return;
      }

      const isRecommendation = action === "recommend";
      const rawStudentRequest = coachQuestion.value.trim();
      const studentRequest =
        action === "followUp" && !rawStudentRequest && source !== "custom"
          ? "请根据上一轮内容继续讲，讲得更容易懂一些。"
          : rawStudentRequest;
      if (action === "followUp" && !studentRequest) {
        setStatus("先写一句追问；只想要基础帮助请点“简单提示”。", "error");
        coachQuestion.focus();
        return;
      }
      setCoachBusy(true);
      setStatus(
        isRecommendation
          ? "正在用规则引擎推荐下一题..."
          : action === "followUp"
            ? "正在发送你的追问：" + shortenStatusText(studentRequest)
            : "正在调用 AI 分析当前代码..."
      );
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan(isRecommendation ? "规则推荐中" : "AI 正在分析", "aiResponseTitle"));
      aiResponse.appendChild(
        textSpan(
          isRecommendation
            ? "会读取本地痛点、Student Skill、迁移证据和当前题库，不需要调用大模型。"
            : action === "followUp"
              ? "会带上上一轮 AI 回复摘要、你的追问、当前代码和当前题面一起分析。"
              : "会读取当前 VS Code 活动编辑器的代码、当前题面和本地痛点记录。",
          "hint"
        )
      );
      vscode.postMessage({
        command: "requestAiCoach",
        action,
        problemKey: keyOf(problem),
        studentRequest,
        previousCoachTurn: summarizeCoachThreadForPrompt(keyOf(problem)),
        responseLanguage: state.responseLanguage,
        ojVerdict: {
          status: "UNKNOWN"
        }
      });
    }

    function shortenStatusText(text) {
      const trimmed = String(text || "").trim().replace(/\s+/g, " ");
      return trimmed.length > 32 ? trimmed.slice(0, 32) + "..." : trimmed;
    }

    function requestRuleRecommendation(problemKey) {
      const problem = state.problems.find((item) => keyOf(item) === problemKey) ||
        state.completedProblems.find((item) => keyOf(item) === problemKey);
      if (!problem) {
        setStatus("先选择一道题或归档题。", "error");
        return;
      }

      setStatus("正在用规则引擎推荐下一题...");
      setCoachBusy(true);
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("规则推荐中", "aiResponseTitle"));
      aiResponse.appendChild(textSpan("会读取本地痛点、Student Skill、迁移证据和当前题库，不需要调用大模型。", "hint"));
      vscode.postMessage({
        command: "requestAiCoach",
        action: "recommend",
        problemKey
      });
    }

    function requestSolutionScore(problemKey) {
      const problem = problemKey
        ? state.problems.find((item) => keyOf(item) === problemKey) ||
          state.completedProblems.find((item) => keyOf(item) === problemKey)
        : selectedCoachProblem();
      if (!problem) {
        setStatus("先选择或导入一道题，或在已归档里点学习评分。", "error");
        return;
      }

      setStatus("正在调用 AI 做学习评分...");
      setCoachBusy(true);
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("AI 正在评分", "aiResponseTitle"));
      aiResponse.appendChild(textSpan("OJ 结果来自你在下拉框里的选择；默认未提交/不确定，不会假装 AC。", "hint"));
      const completedOjStatus =
        problemKey && state.completedProblems.some((item) => keyOf(item) === problemKey && item.completionReason === "completed")
          ? "AC"
          : "UNKNOWN";
      vscode.postMessage({
        command: "requestSolutionScore",
        problemKey: keyOf(problem),
        studentRequest: coachQuestion.value.trim(),
        ojVerdict: {
          status: problemKey ? completedOjStatus : coachOjVerdict.value || "UNKNOWN"
        }
      });
    }

    function requestCompletionReview() {
      const problem = selectedActiveProblem();
      if (!problem) {
        setStatus("先选择或导入一道题。", "error");
        return;
      }

      setStatus("正在做完成后复盘...");
      setCoachBusy(true);
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("完成后复盘中", "aiResponseTitle"));
      aiResponse.appendChild(textSpan("正在复盘并更新学习档案。", "hint"));
      vscode.postMessage({
        command: "requestSolutionScore",
        problemKey: keyOf(problem),
        studentRequest: coachQuestion.value.trim(),
        archiveOnComplete: true,
        ojVerdict: {
          status: coachOjVerdict.value || "UNKNOWN"
        }
      });
    }

    function requestOptimizationReview(problemKey) {
      if (!problemKey) {
        setStatus("先在已归档里选择一道题。", "error");
        return;
      }

      const problem = state.completedProblems.find((item) => keyOf(item) === problemKey);
      setStatus("正在调用 AI 做优化复盘...");
      setCoachBusy(true);
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("优化复盘中", "aiResponseTitle"));
      aiResponse.appendChild(textSpan((problem ? problem.id + " · " : "") + "正在判断是否值得优化。", "hint"));
      vscode.postMessage({
        command: "requestOptimizationReview",
        problemKey,
        studentRequest: coachQuestion.value.trim()
      });
    }

    function requestAutocompletePreview() {
      setStatus("正在调用 AI 补全接口...");
      setCoachBusy(true);
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("补全接口检查中", "aiResponseTitle"));
      aiResponse.appendChild(textSpan("只检查光标附近代码。", "hint"));
      vscode.postMessage({ command: "requestAutocompletePreview" });
    }

    function requestSubmissionJudge(problemKey) {
      const problem = problemKey
        ? state.problems.find((item) => keyOf(item) === problemKey) ||
          state.completedProblems.find((item) => keyOf(item) === problemKey)
        : selectedCoachProblem();
      if (!problem) {
        setStatus("先选择或导入一道题，或在已归档里点找错复盘。", "error");
        return;
      }

      setStatus("正在做 AI 找错复盘...");
      setCoachBusy(true);
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("正在找错", "aiResponseTitle"));
      aiResponse.appendChild(textSpan("检查边界、格式与复杂度。", "hint"));
      vscode.postMessage({
        command: "requestSubmissionJudge",
        problemKey: keyOf(problem)
      });
    }

    function setOjPlatform(platform) {
      const profile = ojPlatformProfiles[platform] || ojPlatformProfiles.codeforces;
      ojPlatform.value = platform === "atcoder" ? "atcoder" : "codeforces";
      ojProblemUrl.placeholder = profile.placeholder;
      ojCodeforcesHandleField.classList.toggle("is-hidden", ojPlatform.value !== "codeforces");
      if (ojPlatform.value !== "codeforces") {
        ojCodeforcesHandle.value = "";
      }
      ojLogin.textContent = "登录 " + profile.label;
      ojSubmissionStatus.innerHTML = "";
      ojSubmissionStatus.dataset.submissionState = "idle";
      ojSubmissionStatus.appendChild(textSpan("确认后只会提交一次；网络超时或结果不明时不会自动重试提交。", "hint"));
    }

    function requestOjLogin() {
      const profile = ojPlatformProfiles[ojPlatform.value] || ojPlatformProfiles.codeforces;
      setStatus("正在打开 " + profile.label + " 登录终端...");
      vscode.postMessage({ command: "requestOjLogin", platform: ojPlatform.value });
    }

    function previewOjSubmission() {
      const problem = selectedCoachProblem();
      const problemUrl = ojProblemUrl.value.trim();
      if (!problem) {
        setStatus("先选择或导入一道题。", "error");
        return;
      }
      if (!problemUrl) {
        setStatus("请先粘贴所选平台的题目链接。", "error");
        ojProblemUrl.focus();
        return;
      }

      setCoachBusy(true);
      ojSubmissionStatus.innerHTML = "";
      ojSubmissionStatus.dataset.submissionState = "checking";
      ojSubmissionStatus.appendChild(textSpan("正在生成提交预览", "aiResponseTitle"));
      ojSubmissionStatus.appendChild(textSpan("此时只检查链接、当前文件和工具状态，不会发送代码。", "hint"));
      requestOjSubmissionPreview(keyOf(problem), problemUrl, ojPlatform.value, ojCodeforcesHandle.value.trim());
    }

    function requestOjSubmissionPreview(problemKey, problemUrl, platform, codeforcesHandle) {
      const profile = ojPlatformProfiles[platform] || ojPlatformProfiles.codeforces;
      setStatus("正在检查 " + profile.label + " 提交信息...");
      vscode.postMessage({
        command: "requestOjSubmissionPreview",
        problemKey,
        problemUrl,
        platform: ojPlatform.value,
        codeforcesHandle
      });
    }

    function confirmOjSubmission(confirmationId) {
      const profile = ojPlatformProfiles[ojPlatform.value] || ojPlatformProfiles.codeforces;
      setStatus("正在提交一次到 " + profile.label + "...");
      vscode.postMessage({
        command: "confirmOjSubmission",
        confirmationId
      });
    }

    function renderOjSubmissionPreview(data) {
      const preview = data.preview || {};
      const target = preview.target || {};
      const editor = preview.editor || {};
      coachOjVerdict.value = "UNKNOWN";
      state.ojVerdict = "UNKNOWN";
      ojSubmissionStatus.innerHTML = "";
      ojSubmissionStatus.dataset.submissionState = "preview";
      ojSubmissionStatus.appendChild(textSpan("SUBMIT PREVIEW / 尚未发送", "evidenceCode"));
      ojSubmissionStatus.appendChild(textSpan("提交前确认", "aiResponseTitle"));
      const platformName = target.platform === "atcoder" ? "AtCoder" : "Codeforces";
      const problemLabel = target.platform === "atcoder"
        ? (target.contestId || "?") + " / " + (target.taskId || "?")
        : (target.contestKind || "contest") + " " + (target.contestId || "?") + (target.problemIndex || "?");
      ojSubmissionStatus.appendChild(responseBlock("目标", [
        "平台：" + platformName,
        "题目：" + problemLabel,
        "链接：" + (target.canonicalUrl || "?")
      ].join("\\n")));
      ojSubmissionStatus.appendChild(responseBlock("当前文件", [
        "路径：" + (editor.filePath || "?"),
        "语言：" + (editor.languageId || "?"),
        "代码大小：" + (typeof editor.codeSize === "number" ? editor.codeSize + " 字节" : "?"),
        target.platform === "codeforces"
          ? preview.codeforcesHandle ? "Handle：" + preview.codeforcesHandle : "Handle：未填写（不会自动查询判题）"
          : "判题状态：通过 AtCoder 提交链接查看"
      ].join("\\n")));
      ojSubmissionStatus.appendChild(textSpan(
        "确认有效期至 " + formatDateTime(preview.expiresAt) + (data.toolVersion ? " · oj " + data.toolVersion : ""),
        "mini"
      ));
      ojSubmissionStatus.appendChild(textSpan("确认后只提交一次；网络结果不明时不会自动重试提交。", "hint"));
      const confirmButton = document.createElement("button");
      confirmButton.type = "button";
      confirmButton.textContent = "确认并提交一次";
      confirmButton.addEventListener("click", () => {
        confirmButton.disabled = true;
        confirmButton.remove();
        setCoachBusy(true);
        confirmOjSubmission(preview.confirmationId);
      });
      ojSubmissionStatus.appendChild(confirmButton);
    }

    function renderOjSubmissionResult(data) {
      const result = data.result || {};
      ojSubmissionStatus.innerHTML = "";
      ojSubmissionStatus.dataset.submissionState = result.verdict ? "official" : "transport";
      if (result.verdict) {
        ojSubmissionStatus.appendChild(textSpan("OFFICIAL VERDICT / 平台结果", "evidenceCode"));
      } else {
        ojSubmissionStatus.appendChild(textSpan("SUBMISSION TRANSPORT / 等待平台结果", "evidenceCode"));
      }
      ojSubmissionStatus.appendChild(textSpan("真实 OJ 提交结果", "aiResponseTitle"));
      ojSubmissionStatus.appendChild(textSpan(result.message || "提交流程已结束。", "hint"));
      const details = [
        "状态：" + (result.status || "unknown"),
        result.verdict ? "判题：" + result.verdict : "",
        typeof result.submissionId === "number" ? "提交 ID：" + result.submissionId : "",
        typeof result.passedTestCount === "number" ? "通过测试：" + result.passedTestCount : "",
        result.submissionUrl ? "结果链接：" + result.submissionUrl : ""
      ].filter(Boolean);
      ojSubmissionStatus.appendChild(responseBlock("结果", details.join("\\n")));
      if (["AC", "WA", "RE", "TLE", "MLE"].includes(result.verdict)) {
        coachOjVerdict.value = result.verdict;
        state.ojVerdict = result.verdict;
      }
      ojSubmissionStatus.appendChild(textSpan("本次确认已失效；再次提交必须重新生成预览并确认。", "mini"));
    }

    function requestArchiveProblem(reason) {
      const problem = selectedActiveProblem();
      if (!problem) {
        setStatus("先选择或导入一道题。", "error");
        return;
      }

      setStatus("正在归档 " + problem.id + "...");
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan(reason === "completed" ? "正在归档已完成" : "正在移出队列", "aiResponseTitle"));
      aiResponse.appendChild(textSpan("这一步不调用 AI；只保存当前本地痛点画像快照。", "hint"));
      vscode.postMessage({
        command: "archiveProblem",
        problemKey: keyOf(problem),
        reason
      });
    }

    function requestDeleteProblem(problemKey, deleteScope) {
      const problem = problemKey
        ? state.problems.find((item) => keyOf(item) === problemKey) ||
          state.completedProblems.find((item) => keyOf(item) === problemKey || item.problemKey === problemKey)
        : selectedCoachProblem();
      if (!problem) {
        setStatus("先选择要删除的题目。", "error");
        return;
      }

      setStatus("正在直接删除 " + problem.id + "...");
      vscode.postMessage({
        command: "deleteProblem",
        problemKey: keyOf(problem),
        deleteScope
      });
    }

    function requestDisableStudentSkill(skillName) {
      const name = String(skillName || "").trim();
      if (!name) {
        setStatus("请选择要禁用的 Skill。", "error");
        return;
      }

      setStatus("正在禁用 Skill：" + name + "...");
      vscode.postMessage({
        command: "disableStudentSkill",
        skillName: name,
        reason: "用户在 Student Skill 页面禁用：认为该规则暂不适合当前学习。"
      });
    }

    function requestStudentSkillFeedback(skillName, feedbackType) {
      const name = String(skillName || "").trim();
      if (!name) {
        setStatus("请选择要纠偏的学习画像条目。", "error");
        return;
      }

      const isWrong = feedbackType === "diagnosis_wrong";
      const note = defaultSkillFeedbackNoteForWebview(feedbackType);

      setStatus(isWrong ? "正在记录误判纠偏..." : "正在记录有帮助反馈...");
      vscode.postMessage({
        command: "recordStudentSkillFeedback",
        skillName: name,
        feedbackType,
        note
      });
    }

    function requestRollbackStudentSkill(versionId) {
      const id = String(versionId || "").trim();
      if (!id) {
        setStatus("请选择要回滚的版本。", "error");
        return;
      }

      setStatus("正在回滚 Student Skill...");
      vscode.postMessage({
        command: "rollbackStudentSkill",
        versionId: id
      });
    }

    function renderStudentSkill() {
      const skill = state.studentSkill;
      studentSkillPanel.innerHTML = "";
      studentSkillVersions.innerHTML = "";

      if (!skill) {
        studentSkillRevision.textContent = "未加载";
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "还没有 Student Skill 数据。先进行一次 AI 提示或学习评分，系统会开始形成画像。";
        studentSkillPanel.appendChild(empty);
        renderStudentSkillVersions();
        return;
      }

      const entries = Object.values(skill.skills || {}).sort(
        (left, right) => skillStatusOrder(left.status) - skillStatusOrder(right.status) || left.name.localeCompare(right.name)
      );
      const evidenceSequence = new Map(entries.map((entry, index) => [entry.name, index]));
      const counts = countSkillEntries(entries);
      studentSkillRevision.textContent = "rev " + (skill.revision ?? 0) + " · " + formatDateTime(skill.updatedAt);

      const summary = document.createElement("div");
      summary.className = "skillSummary";
      [
        ["已启用", counts.active],
        ["候选", counts.candidate],
        ["已禁用", counts.disabled]
      ].forEach(([label, value]) => {
        const metric = document.createElement("div");
        metric.className = "skillMetric";
        const number = document.createElement("strong");
        number.textContent = String(value);
        metric.appendChild(number);
        metric.appendChild(textSpan(label, "mini"));
        summary.appendChild(metric);
      });
      studentSkillPanel.appendChild(summary);

      studentSkillPanel.appendChild(
        responseBlock(
          "硬规则",
          [
            "补全不读题面：" + booleanLabel(!skill.hardRules?.autocompleteMayReadProblemStatement),
            "补全不直接给完整答案：" + booleanLabel(!skill.hardRules?.allowFullSolutionAutocomplete),
            "已禁用：" + ((skill.hardRules?.disabledSkills || []).join(" · ") || "暂无")
          ].join("\\n")
        )
      );

      appendSkillGroup("已启用 Skill", entries.filter((entry) => entry.status === "active"), "active", evidenceSequence);
      appendSkillGroup("候选 Skill", entries.filter((entry) => entry.status === "candidate"), "candidate", evidenceSequence);
      appendSkillGroup("已禁用 Skill", entries.filter((entry) => entry.status === "disabled"), "disabled", evidenceSequence);
      renderStudentSkillVersions();
    }

    function appendSkillGroup(title, entries, status, evidenceSequence) {
      const group = document.createElement("details");
      group.className = "skillGroup";
      group.open = status !== "disabled";

      const summary = document.createElement("summary");
      summary.textContent = title + " · " + entries.length;
      group.appendChild(summary);

      const list = document.createElement("div");
      list.className = "skillList";
      if (entries.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "暂无记录。";
        list.appendChild(empty);
      } else {
        entries.forEach((entry, index) => {
          list.appendChild(renderSkillEntry(entry, evidenceSequence.get(entry.name) ?? index));
        });
      }
      group.appendChild(list);
      studentSkillPanel.appendChild(group);
    }

    function renderSkillEntry(entry, index) {
      const card = document.createElement("div");
      card.className = "skillCard " + (entry.status || "candidate");
      card.dataset.evidenceStatus = entry.status || "candidate";
      card.appendChild(textSpan("E-" + String(index + 1).padStart(2, "0"), "evidenceCode"));
      const latestExample = latestSkillExample(entry);

      const top = document.createElement("div");
      top.className = "skillTop";
      top.appendChild(textSpan(entry.name || "unnamed-skill", "problemTitle"));
      top.appendChild(textSpan(skillStatusLabel(entry.status), "tag"));
      card.appendChild(top);

      card.appendChild(textSpan(entry.reason || "暂无形成理由。", "hint"));
      card.appendChild(
        textSpan(
          "证据 " + (entry.evidenceCount || 0) + " · 分数 " + (entry.score ?? 0) + " · 最近 " + formatDateTime(entry.lastSeen),
          "mini"
        )
      );
      if (latestExample?.problemId) {
        card.appendChild(textSpan("最近题目 " + latestExample.problemId, "mini"));
      }

      if (entry.disabledReason) {
        card.appendChild(responseBlock("禁用原因", entry.disabledReason));
      }

      if (entry.sourcePainPoints?.length) {
        const painRow = document.createElement("div");
        painRow.className = "tagRow";
        entry.sourcePainPoints.slice(0, 6).forEach((painPoint) => painRow.appendChild(textSpan(painPoint, "tag")));
        card.appendChild(painRow);
      }

      if (entry.rules?.length) {
        const rules = document.createElement("div");
        rules.className = "skillRules";
        entry.rules.slice(0, 4).forEach((rule) => rules.appendChild(textSpan("· " + rule, "mini")));
        card.appendChild(rules);
      }

      if (latestExample) {
        card.appendChild(responseBlock("最近证据", latestExample.evidence || ""));
      }
      const evidenceDetails = latestExample ? renderEvidenceDetails(latestExample) : undefined;
      if (evidenceDetails) {
        evidenceDetails.hidden = true;
        card.appendChild(evidenceDetails);
      }

      if (entry.status !== "disabled") {
        const actions = document.createElement("div");
        actions.className = "skillActionRow";
        const wrongButton = document.createElement("button");
        wrongButton.className = "secondary";
        wrongButton.type = "button";
        wrongButton.textContent = "这条不准";
        wrongButton.addEventListener("click", () => requestStudentSkillFeedback(entry.name, "diagnosis_wrong"));
        actions.appendChild(wrongButton);

        const helpfulButton = document.createElement("button");
        helpfulButton.className = "secondary";
        helpfulButton.type = "button";
        helpfulButton.textContent = "有帮助";
        helpfulButton.addEventListener("click", () => requestStudentSkillFeedback(entry.name, "diagnosis_helpful"));
        actions.appendChild(helpfulButton);

        if (latestExample) {
          const evidenceButton = document.createElement("button");
          evidenceButton.className = "secondary";
          evidenceButton.type = "button";
          evidenceButton.textContent = "查看证据";
          evidenceButton.addEventListener("click", () => {
            if (!evidenceDetails) {
              return;
            }
            evidenceDetails.hidden = !evidenceDetails.hidden;
            evidenceButton.textContent = evidenceDetails.hidden ? "查看证据" : "收起证据";
            setStatus(evidenceDetails.hidden ? "已收起证据。" : "已展开证据。");
          });
          actions.appendChild(evidenceButton);
        }

        const disableButton = document.createElement("button");
        disableButton.className = "secondary";
        disableButton.type = "button";
        disableButton.textContent = "禁用";
        disableButton.addEventListener("click", () => requestDisableStudentSkill(entry.name));
        actions.appendChild(disableButton);
        card.appendChild(actions);
      }

      return card;
    }

    function renderEvidenceDetails(example) {
      const details = document.createElement("div");
      details.className = "resultBlock";
      details.appendChild(textSpan("证据详情", "responseSectionTitle"));
      details.appendChild(
        markdownBlock(
          [
            example.problemId ? "题目：" + example.problemId : "",
            example.topic ? "主题：" + example.topic : "",
            "来源：" + (example.source || "unknown"),
            "时间：" + formatDateTime(example.occurredAt),
            "",
            example.evidence || "暂无证据文本。"
          ]
            .filter(Boolean)
            .join("\\n"),
          "hint"
        )
      );
      return details;
    }

    function renderStudentSkillVersions() {
      const versions = state.studentSkillVersions || [];
      studentSkillVersions.innerHTML = "";
      if (versions.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "还没有版本快照。AI 产生画像、禁用或回滚后会自动生成快照。";
        studentSkillVersions.appendChild(empty);
        return;
      }

      versions.forEach((version) => {
        const item = document.createElement("div");
        item.className = "versionItem";
        item.appendChild(textSpan("rev " + version.revision + " · " + formatDateTime(version.archivedAt), "problemTitle"));
        item.appendChild(textSpan(version.reason || "未记录原因", "hint"));
        item.appendChild(
          textSpan(
            "启用 " + version.activeSkillCount + " · 候选 " + version.candidateSkillCount + " · 禁用 " + version.disabledSkillCount,
            "mini"
          )
        );
        const actions = document.createElement("div");
        actions.className = "row";
        const rollbackButton = document.createElement("button");
        rollbackButton.className = "secondary";
        rollbackButton.type = "button";
        rollbackButton.textContent = "回滚到此版本";
        rollbackButton.addEventListener("click", () => requestRollbackStudentSkill(version.versionId));
        actions.appendChild(rollbackButton);
        item.appendChild(actions);
        studentSkillVersions.appendChild(item);
      });
    }

    function countSkillEntries(entries) {
      return entries.reduce(
        (counts, entry) => {
          if (entry.status === "active" || entry.status === "mastered") {
            counts.active += 1;
          } else if (entry.status === "disabled") {
            counts.disabled += 1;
          } else {
            counts.candidate += 1;
          }
          return counts;
        },
        { active: 0, candidate: 0, disabled: 0 }
      );
    }

    function skillStatusOrder(status) {
      if (status === "active" || status === "mastered") {
        return 0;
      }
      if (status === "candidate") {
        return 1;
      }
      return 2;
    }

    function skillStatusLabel(status) {
      if (status === "active") {
        return "已启用";
      }
      if (status === "mastered") {
        return "已掌握";
      }
      if (status === "disabled") {
        return "已禁用";
      }
      return "候选";
    }

    function latestSkillExample(entry) {
      const examples = entry.examples || [];
      return examples.length > 0 ? examples[examples.length - 1] : undefined;
    }

    function booleanLabel(value) {
      return value ? "是" : "否";
    }

    function defaultSkillFeedbackNoteForWebview(feedbackType) {
      if (feedbackType === "diagnosis_wrong") {
        return "用户在学习画像页点击「这条不准」：该判断不符合当前真实卡点。";
      }
      if (feedbackType === "diagnosis_helpful") {
        return "用户在学习画像页点击「有帮助」：该判断对当前学习有帮助。";
      }
      return "用户在学习画像页记录了一条人工备注。";
    }

    function renderProblemRecommendation(data) {
      const recommendation = data.recommendation || {};
      const strategy = recommendation.strategy || {};
      const items = recommendation.recommendations || [];
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("推荐下一题", "aiResponseTitle"));
      aiResponse.appendChild(
        textSpan(
          "当前 " + (data.currentProblem?.id || "?") + " · 目标难度 " + (strategy.targetDifficulty ?? "?"),
          "mini"
        )
      );
      if (data.recommendationLimitations) {
        aiResponse.appendChild(textSpan(data.recommendationLimitations, "mini"));
      }

      if (strategy.topPainPoints?.length) {
        const row = document.createElement("div");
        row.className = "tagRow";
        strategy.topPainPoints.slice(0, 5).forEach((painPoint) => {
          row.appendChild(textSpan(painPoint.label + "×" + painPoint.count, "tag"));
        });
        aiResponse.appendChild(row);
      }

      if (items.length === 0) {
        aiResponse.appendChild(responseBlock("暂无候选", "当前题库和内置池里没有找到合适题目。可以先搜索/导入更多同类题。"));
        return;
      }

      items.forEach((item, index) => {
        const problem = item.problem || {};
        const stable = item.recommendation || {};
        const block = responseBlock(
          (index + 1) + ". " + (problem.id || "?") + " · " + (problem.title || "未命名题目"),
          (problem.difficulty !== undefined ? "难度 " + problem.difficulty : "难度未知") +
            (stable.targetSkill ? " · 练习 " + stable.targetSkill : "")
        );

        if (item.matchedPainPoints?.length) {
          const painRow = document.createElement("div");
          painRow.className = "tagRow";
          item.matchedPainPoints.forEach((painPoint) => painRow.appendChild(textSpan(painPoint, "tag")));
          block.appendChild(painRow);
        }

        block.appendChild(
          optionalDetailsBlock(
            "为什么推荐",
            [
              "为什么是这题：" + evidenceText(stable.reason || (item.reasons || []).join("；")),
              "为什么不是更难：" + evidenceText(stable.whyNotHarder),
              "为什么不重复：" + evidenceText(stable.whyNotRepeat)
            ].join("\\n")
          )
        );

        const actions = document.createElement("div");
        actions.className = "row";
        const actionButton = document.createElement("button");
        actionButton.className = "secondary";
        actionButton.type = "button";
        const existing = state.problems.find((candidate) => candidate.platform === problem.platform && candidate.id === problem.id);
        actionButton.textContent = existing ? "切到这题" : problem.platform === "luogu" ? "导入并建文件" : "打开来源";
        actionButton.addEventListener("click", () => {
          if (existing) {
            state.selectedKey = keyOf(existing);
            renderAll();
            switchPage("problem");
            setStatus("已切换到推荐题：" + existing.id);
            return;
          }
          if (problem.platform === "luogu" && problem.id) {
            importLuogu(problem.id, true);
            return;
          }
          if (problem.sourceUrl) {
            location.href = problem.sourceUrl;
          }
        });
        actions.appendChild(actionButton);
        block.appendChild(actions);
        aiResponse.appendChild(block);
      });
    }

    function evidenceText(value) {
      return value && String(value).trim() ? String(value).trim() : "证据不足";
    }

    function difficultyChangeLabel(value) {
      if (value === "up") {
        return "更难";
      }
      if (value === "down") {
        return "更低";
      }
      if (value === "same") {
        return "同难度";
      }
      return "证据不足";
    }

    function transferEvidenceLabel(value) {
      if (value === "passed") {
        return "迁移已通过";
      }
      if (value === "probe") {
        return "迁移待验证";
      }
      if (value === "failed") {
        return "迁移失败或已禁用";
      }
      if (value === "not_tested") {
        return "暂无迁移证据";
      }
      return "证据不足";
    }

    function renderCoachFollowUp(data) {
      const report = data.report || {};
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("继续追问", "aiResponseTitle"));
      aiResponse.appendChild(responseBlock("回答", report.answer || "这次 AI 没有返回可展示的追问回答。"));
      const followUpDetails = [];
      if (report.tinyExample) {
        followUpDetails.push(responseBlock("小例子", report.tinyExample));
      }
      if (report.nextAction) {
        followUpDetails.push(responseBlock("下一步", report.nextAction));
      }
      const followUpDetailsGroup = resultDetailsGroup("补充说明", followUpDetails);
      if (followUpDetailsGroup) {
        aiResponse.appendChild(followUpDetailsGroup);
      }
      const quickActions = document.createElement("div");
      quickActions.className = "row";
      const simplerButton = document.createElement("button");
      simplerButton.className = "secondary";
      simplerButton.type = "button";
      simplerButton.textContent = "再讲简单点";
      simplerButton.addEventListener("click", () =>
        requestFollowUpWithText("还是有点难，请用更简单的话解释，只讲一个关键点，并给一个非常小的例子。")
      );
      quickActions.appendChild(simplerButton);
      aiResponse.appendChild(quickActions);
      appendContextAudit(data.workflowAudit || coachContextAudit("follow_up"));
      appendContextAudit(data.skillAudit);
      appendCoachFollowUpTurn(data.problemKey || state.selectedKey, data, report);
      renderCoach();
    }

    function renderAiDiagnosis(data) {
      const report = data.report || {};
      const localized = data.localizedReport || {};
      const isSpecificAction = data.action === "specific";
      const isFollowUpAction = data.action === "followUp";
      const basicHint = localized.rawHint || report.hint;
      const specificHint = localized.rawSpecificHint || report.specificHint;
      const checkpoint = localized.rawCheckpoint || report.checkpoint;
      const microSteps = localized.microSteps || report.microSteps || [];
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("给你的提示", "aiResponseTitle"));
      if (isFollowUpAction) {
        aiResponse.appendChild(responseBlock("继续追问", specificHint || basicHint || "这次 AI 没有返回可展示的追问回答。"));
      } else if (isSpecificAction && specificHint) {
        aiResponse.appendChild(responseBlock(localized.specificHintTitle || "更具体的下一步", specificHint));
      } else if (basicHint) {
        aiResponse.appendChild(responseBlock("简单提示", basicHint));
      } else if (specificHint) {
        aiResponse.appendChild(responseBlock(localized.specificHintTitle || "更具体的下一步", specificHint));
      }
      const diagnosisDetails = [];
      const detailLines = [];
      if (checkpoint) {
        detailLines.push("【" + (localized.checkpointTitle || "自检点") + "】\\n" + checkpoint);
      }
      if (microSteps.length && data.action !== "hint") {
        detailLines.push(
          "【" + (localized.microStepsTitle || "微步骤") + "】\\n" + microSteps.map((step, index) => (index + 1) + ". " + step).join("\\n")
        );
      }
      if (detailLines.length) {
        diagnosisDetails.push(responseBlock(isFollowUpAction ? "可操作步骤" : "自检 / 微步骤", detailLines.join("\\n\\n")));
      }
      const painPoints = localized.painPoints || report.painPoints || [];
      if (painPoints.length) {
        const painBlock = responseBlock(localized.painTitle || "痛点判断", "");
        const row = document.createElement("div");
        row.className = "tagRow";
        painPoints.forEach((painPoint) => {
          row.appendChild(textSpan((painPoint.displayLabel || painPoint.label) + " " + Math.round((painPoint.confidence || 0) * 100) + "%", "tag"));
        });
        painBlock.appendChild(row);
        diagnosisDetails.push(painBlock);
      }
      const diagnosisDetailsGroup = resultDetailsGroup("诊断细节", diagnosisDetails);
      if (diagnosisDetailsGroup) {
        aiResponse.appendChild(diagnosisDetailsGroup);
      }
      const quickActions = document.createElement("div");
      quickActions.className = "row";
      const simplerButton = document.createElement("button");
      simplerButton.className = "secondary";
      simplerButton.type = "button";
      simplerButton.textContent = "讲简单点";
      simplerButton.addEventListener("click", () =>
        requestFollowUpWithText("讲得太难了，请用更简单的话解释，少用术语，最好给一个小例子。")
      );
      quickActions.appendChild(simplerButton);
      aiResponse.appendChild(quickActions);
      appendCoachTurn(data.problemKey || state.selectedKey, data, report, localized);
      renderCoach();
      appendContextAudit(data.workflowAudit);
      appendContextAudit(data.skillAudit);
    }

    function renderAutocompletePreview(data) {
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("补全预览", "aiResponseTitle"));
      aiResponse.appendChild(
        textSpan(data.line ? "第 " + data.line + " 行 · " + (data.language || "代码") : (data.language || "代码"), "mini")
      );
      if (data.validationStatus === "validator-rejected") {
        aiResponse.appendChild(
          responseBlock("已被安全检查拦截", data.rejectionReason || "这段补全不符合当前安全规则。")
        );
      } else if (data.validationStatus === "model-empty") {
        aiResponse.appendChild(
          responseBlock("没有生成内容", "模型返回为空。把光标放在函数体、循环体或半行代码后再试。")
        );
      } else if (data.suggestion) {
        const block = responseBlock("将会补上的代码", "");
        const pre = codeBlock(data.suggestion);
        pre.className = "codePreview";
        block.appendChild(pre);
        aiResponse.appendChild(block);
      } else {
        aiResponse.appendChild(responseBlock("没有生成内容", "没有可展示的补全结果。"));
      }
      appendContextAudit(data.contextAudit);
    }

    function coachContextAudit(action) {
      return {
        action,
        included: ["problem_statement", "student_code", "recent_hints", "student_profile", "teacher_pack_reference"],
        excluded: ["standard_answer", "autocomplete_prompt", "raw_internal_test_records"]
      };
    }

    function lessonReportContextAudit(report) {
      return {
        action: "lesson_report",
        included: ["problem_statement", "student_code", "student_profile", "teacher_pack_reference"],
        excluded: [
          report?.referenceSolution?.code ? "standard_answer_auto_reveal" : "standard_answer",
          "autocomplete_prompt",
          "raw_internal_test_records"
        ]
      };
    }

    function appendContextAudit() {}

    function renderSubmissionJudge(data) {
      const report = data.report || {};
      aiResponse.innerHTML = "";
      aiResponse.appendChild(
        textSpan(
          (data.reviewStage === "archived" ? "找错复盘" : "交题前自检") + " · AI 估计",
          "aiResponseTitle"
        )
      );
      aiResponse.appendChild(responseBlock(verdictLabel(report.verdict), report.summary || "没有摘要。"));
      aiResponse.appendChild(textSpan("AI 估计，不代表官方 OJ；置信度：" + Math.round((report.confidence || 0) * 100) + "%", "mini"));
      const reviewDetails = [];

      if (report.issues?.length) {
        reviewDetails.push(textSpan("主要风险", "responseSectionTitle"));
        report.issues.forEach((issue) => {
          reviewDetails.push(
            responseBlock(
              severityLabel(issue.severity) + " · " + (issue.label || "unknown"),
              (issue.evidence || "") + (issue.fixHint ? "\\n提示：" + issue.fixHint : "")
            )
          );
        });
      }

      if (report.testSuggestions?.length) {
        reviewDetails.push(textSpan("建议先跑的小测试", "responseSectionTitle"));
        report.testSuggestions.forEach((item) => {
          const block = responseBlock(item.reason || "测试建议", "");
          block.appendChild(codeBlock(item.input || ""));
          block.appendChild(textSpan(item.expectedBehavior || "", "hint"));
          reviewDetails.push(block);
        });
      }
      const reviewDetailsGroup = resultDetailsGroup("风险与测试", reviewDetails);
      if (reviewDetailsGroup) {
        aiResponse.appendChild(reviewDetailsGroup);
      }

      if (report.nextAction) {
        aiResponse.appendChild(responseBlock("下一步", report.nextAction));
      }
      appendContextAudit(data.workflowAudit || coachContextAudit("submission_judge"));
    }

    function renderLessonReport(data) {
      const report = data.report || {};
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("讲解与补救", "aiResponseTitle"));
      aiResponse.appendChild(textSpan((data.problem?.id || "") + " · " + (data.problem?.title || ""), "mini"));
      aiResponse.appendChild(responseBlock("标准思路", report.standardApproach || "暂无标准思路。"));
      const lessonDetails = [];

      if (report.painPoints?.length) {
        lessonDetails.push(textSpan("你的卡点", "responseSectionTitle"));
        report.painPoints.slice(0, 2).forEach((painPoint) => {
          lessonDetails.push(
            responseBlock(
              painPoint.label + " " + Math.round((painPoint.confidence || 0) * 100) + "%",
              painPoint.evidence || ""
            )
          );
        });
      }

      if (report.minimalFixPath?.length) {
        lessonDetails.push(responseBlock("最小修正路径", report.minimalFixPath.map((item, index) => (index + 1) + ". " + item).join("\\n")));
      }

      if (report.remedialExercise) {
        const exercise = report.remedialExercise;
        lessonDetails.push(
          responseBlock(
            "补救小练习" + (exercise.problemId ? " · " + exercise.problemId : ""),
            [exercise.title, exercise.prompt, exercise.reason].filter(Boolean).join("\\n")
          )
        );
      }

      if (report.referenceSolution?.code) {
        const referenceBlock = responseBlock("参考实现", "");
        referenceBlock.appendChild(codeBlock(report.referenceSolution.code));
        lessonDetails.push(referenceBlock);
      }
      const lessonDetailsGroup = resultDetailsGroup("完整复盘", lessonDetails);
      if (lessonDetailsGroup) {
        aiResponse.appendChild(lessonDetailsGroup);
      }
      appendContextAudit(data.workflowAudit || lessonReportContextAudit(report));
    }

    function renderSolutionScore(data) {
      const report = data.report || {};
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("学习评分", "aiResponseTitle"));
      aiResponse.appendChild(textSpan((data.problem?.id || "") + " · " + (data.problem?.title || ""), "mini"));
      aiResponse.appendChild(responseBlock("OJ 结果 / 学习分", (report.ojResult || "UNKNOWN") + " · " + (report.learningScore ?? "?") + " / 100"));
      aiResponse.appendChild(responseBlock("结论", report.summary || "暂无结论。"));
      const scoreDetails = [];

      if (report.rubric) {
        const rubric = report.rubric;
        scoreDetails.push(
          responseBlock(
            "评分细项",
            [
              "正确性 " + rubric.correctness,
              "复杂度匹配 " + rubric.complexityMatch,
              "思路成长 " + rubric.ideaGrowth,
              "代码质量 " + rubric.codeQuality,
              "独立性 " + rubric.independence
            ].join(" · ")
          )
        );
      }

      if (report.complexityAssessment) {
        const complexity = report.complexityAssessment;
        scoreDetails.push(
          responseBlock(
            "复杂度评价 · " + (complexity.verdict || "unknown"),
            ["你的解法：" + complexity.observed, "预期方向：" + complexity.expected, complexity.reason].filter(Boolean).join("\\n")
          )
        );
      }

      if (report.painPoints?.length) {
        scoreDetails.push(textSpan("仍需补的点", "responseSectionTitle"));
        report.painPoints.slice(0, 2).forEach((painPoint) => {
          scoreDetails.push(responseBlock(painPoint.label, painPoint.evidence || ""));
        });
      }

      if (report.recommendation?.problemId) {
        scoreDetails.push(responseBlock("推荐题目", report.recommendation.problemId + "\\n" + report.recommendation.reason));
      }
      const scoreDetailsGroup = resultDetailsGroup("评分详情", scoreDetails);
      if (scoreDetailsGroup) {
        aiResponse.appendChild(scoreDetailsGroup);
      }

      if (report.nextAction) {
        aiResponse.appendChild(responseBlock("下一步", report.nextAction));
      }
      appendContextAudit(data.workflowAudit || coachContextAudit("solution_score"));
    }

    function renderOptimizationReport(data) {
      const report = data?.report || {};
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("优化复盘", "aiResponseTitle"));
      aiResponse.appendChild(textSpan((data?.problem?.id || "") + " · " + (data?.problem?.title || ""), "mini"));
      aiResponse.appendChild(
        responseBlock("是否值得优化", report.optimizationNeeded ? "需要优化" : "无需优化")
      );
      aiResponse.appendChild(responseBlock("结论", report.summary || "暂无结论。"));
      const optimizationDetails = [];

      if (report.timeComplexity) {
        optimizationDetails.push(responseBlock("时间复杂度", optimizationDimensionText(report.timeComplexity)));
      }
      if (report.memory) {
        optimizationDetails.push(responseBlock("内存", optimizationDimensionText(report.memory)));
      }
      if (report.codeQuality) {
        optimizationDetails.push(
          responseBlock(
            "代码质量 · " + (report.codeQuality.verdict === "needs_cleanup" ? "需要整理" : "可以保持"),
            report.codeQuality.action || ""
          )
        );
      }
      const optimizationDetailsGroup = resultDetailsGroup("优化详情", optimizationDetails);
      if (optimizationDetailsGroup) {
        aiResponse.appendChild(optimizationDetailsGroup);
      }
      if (report.nextStep) {
        aiResponse.appendChild(responseBlock("下一步", report.nextStep));
      }
      appendContextAudit(data?.workflowAudit || coachContextAudit("optimization_review"));
    }

    function renderCreatedFile(file) {
      const title = file.created ? "练习文件已创建" : "练习文件已存在，已打开";
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan(title, "aiResponseTitle"));
      aiResponse.appendChild(responseBlock("文件位置", file.relativePath || file.absolutePath || ""));
      aiResponse.appendChild(textSpan("下一步：在新打开的代码文件里作答；自动补全只读取代码上下文。", "hint"));
    }

    function renderArchivedProblem(problem) {
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("已归档", "aiResponseTitle"));
      aiResponse.appendChild(responseBlock(problem.id + " · " + problem.title, "状态：" + completionReasonLabel(problem.completionReason)));
      aiResponse.appendChild(textSpan("跳过 AI 解析，已保存当前痛点快照：" + (problem.painSummary || "暂无痛点记录"), "hint"));
    }

    function renderAiError(message) {
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("AI 调用失败", "aiResponseTitle"));
      aiResponse.appendChild(responseBlock("错误信息", message || "未知错误"));
    }

    function responseBlock(titleText, bodyText) {
      const block = document.createElement("div");
      block.className = "resultBlock";
      block.appendChild(textSpan(titleText, "responseSectionTitle"));
      if (bodyText) {
        block.appendChild(markdownBlock(bodyText, "hint"));
      }
      return block;
    }

    function optionalDetailsBlock(titleText, bodyText) {
      const details = document.createElement("details");
      details.className = "resultBlock";
      const summary = document.createElement("summary");
      summary.className = "responseSectionTitle";
      summary.textContent = titleText;
      details.appendChild(summary);
      if (bodyText) {
        details.appendChild(markdownBlock(bodyText, "hint"));
      }
      return details;
    }

    function resultDetailsGroup(titleText, blocks) {
      const visibleBlocks = blocks.filter(Boolean);
      if (!visibleBlocks.length) {
        return undefined;
      }
      const details = document.createElement("details");
      details.className = "resultDetailsDrawer";
      const summary = document.createElement("summary");
      summary.textContent = titleText;
      details.appendChild(summary);
      const body = document.createElement("div");
      body.className = "resultDetailsBody";
      visibleBlocks.forEach((block) => body.appendChild(block));
      details.appendChild(body);
      return details;
    }

    function requestFollowUpWithText(text) {
      coachQuestion.value = text;
      requestAiCoach("followUp", "quick");
    }

    function coachThread(problemKey) {
      if (!problemKey) {
        return [];
      }
      if (!state.coachThreads[problemKey]) {
        state.coachThreads[problemKey] = [];
      }
      return state.coachThreads[problemKey];
    }

    function appendCoachTurn(problemKey, data, report, localized) {
      const thread = coachThread(problemKey);
      thread.push({
        action: data.action || "hint",
        hint: localized.rawHint || report.hint || "",
        specificHint: localized.rawSpecificHint || report.specificHint || "",
        checkpoint: localized.rawCheckpoint || report.checkpoint || ""
      });
      if (thread.length > 6) {
        thread.splice(0, thread.length - 6);
      }
    }

    function appendCoachFollowUpTurn(problemKey, data, report) {
      const thread = coachThread(problemKey);
      thread.push({
        action: data.action || "followUp",
        hint: "",
        specificHint: [report.answer || "", report.tinyExample ? "小例子：" + report.tinyExample : ""]
          .filter(Boolean)
          .join("\\n"),
        checkpoint: report.nextAction || ""
      });
      if (thread.length > 6) {
        thread.splice(0, thread.length - 6);
      }
    }

    function summarizeCoachThreadForPrompt(problemKey) {
      const thread = coachThread(problemKey);
      if (!thread.length) {
        return undefined;
      }
      return thread
        .slice(-4)
        .map((turn, index) =>
          [
            "第 " + (index + 1) + " 轮：" + (turn.action || "hint"),
            turn.hint ? "简单提示：" + turn.hint : "",
            turn.specificHint ? "具体提示：" + turn.specificHint : "",
            turn.checkpoint ? "自检点：" + turn.checkpoint : ""
          ]
            .filter(Boolean)
            .join("\\n")
        )
        .join("\\n\\n");
    }

    function summarizeCoachTurnForFollowUp(data, report, localized) {
      return [
        "动作：" + (data.action || "hint"),
        "简单提示：" + (localized.rawHint || report.hint || ""),
        "具体提示：" + (localized.rawSpecificHint || report.specificHint || ""),
        "自检点：" + (localized.rawCheckpoint || report.checkpoint || "")
      ]
        .filter((line) => !line.endsWith("："))
        .join("\\n");
    }

    function optimizationDimensionText(dimension) {
      return [
        "当前：" + (dimension.current || "未知"),
        "目标：" + (dimension.target || "未知"),
        dimension.action || ""
      ]
        .filter(Boolean)
        .join("\\n");
    }

    function verdictLabel(verdict) {
      if (verdict === "likely_ac") {
        return "可能 AC";
      }
      if (verdict === "likely_wa") {
        return "可能 WA";
      }
      if (verdict === "likely_re") {
        return "可能 RE";
      }
      if (verdict === "likely_tle") {
        return "可能 TLE";
      }
      return "建议先本地运行";
    }

    function severityLabel(severity) {
      if (severity === "high") {
        return "高风险";
      }
      if (severity === "medium") {
        return "中风险";
      }
      return "低风险";
    }

    function completionReasonLabel(reason) {
      if (reason === "removed") {
        return "已移出";
      }
      if (reason === "abandoned") {
        return "已放弃";
      }
      if (reason === "revealed") {
        return "已看答案";
      }
      return "已完成";
    }

    function renderSessionMasthead() {
      const problem = selectedCoachProblem();
      const editor = state.activeEditor || {};
      const turnCount = problem ? coachThread(keyOf(problem)).length : 0;
      const archived = Boolean(selectedArchivedProblem());
      setElementText("sessionProblemTitle", problem ? problem.id + " · " + problem.title : "未选择题目");
      setElementText("sessionEditorState", editor.fileName || editor.relativePath || "未打开文件");
      setElementText("sessionAttemptState", turnCount + " 次提示" + (archived ? " · 已归档" : ""));
      setElementText("appSubtitle", archived ? "复盘" : problem ? "作答中" : "待选题");
      const hasProblem = Boolean(problem);
      const hasEditor = Boolean(editor.relativePath || editor.fileName);
      sessionMasthead.dataset.sessionState = archived ? "review" : hasEditor ? "coding" : hasProblem ? "briefing" : "empty";
    }

    function renderStats() {
      problemCount.textContent = state.problems.length + " 题";
      completedCount.textContent = state.completedProblems.length + " 题";
    }

    function renderProblemList() {
      const problems = filteredProblems();
      problemList.innerHTML = "";

      if (problems.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = state.problems.length === 0
          ? "还没有导入题目。输入题号或点推荐题的“导入”。"
          : "没有匹配的题目。";
        problemList.appendChild(empty);
        return;
      }

      const activeProblemSelected = state.problems.some((problem) => keyOf(problem) === state.selectedKey);
      const archivedProblemSelected = state.completedProblems.some((problem) => keyOf(problem) === state.selectedKey);
      if (!state.selectedKey || (!activeProblemSelected && !archivedProblemSelected)) {
        state.selectedKey = keyOf(problems[0]);
      }

      problems.forEach((problem) => {
        const button = document.createElement("button");
        button.className = "problemItem" + (keyOf(problem) === state.selectedKey ? " active" : "");
        button.type = "button";
        button.addEventListener("click", () => {
          state.selectedKey = keyOf(problem);
          renderCoach();
          renderProblemList();
          renderDetail();
        });

        const meta = document.createElement("div");
        meta.className = "problemMeta";
        meta.appendChild(textSpan(problem.id, "problemId"));
        meta.appendChild(textSpan(platformLabel(problem.platform), "tag"));
        if (problem.difficulty !== undefined) {
          meta.appendChild(textSpan("难度 " + problem.difficulty, "tag"));
        }

        const title = document.createElement("div");
        title.className = "problemTitle";
        title.textContent = problem.title;

        button.appendChild(meta);
        button.appendChild(title);

        if (problem.tags?.length) {
          const tags = document.createElement("div");
          tags.className = "tagRow";
          problem.tags.slice(0, 4).forEach((tag) => tags.appendChild(textSpan(String(tag), "mini")));
          button.appendChild(tags);
        }

        problemList.appendChild(button);
      });
    }

    function renderCompletedList() {
      completedList.innerHTML = "";

      if (state.completedProblems.length === 0) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "完成或移出队列的题目会放在这里。";
        completedList.appendChild(empty);
        return;
      }

      state.completedProblems.slice(0, 20).forEach((problem) => {
        const item = document.createElement("div");
        item.className = "problemItem" + (keyOf(problem) === state.selectedKey ? " active" : "");
        item.addEventListener("click", (event) => {
          if (event.target?.closest?.("button, summary, details")) {
            return;
          }
          selectArchivedProblem(problem);
        });

        const meta = document.createElement("div");
        meta.className = "problemMeta";
        meta.appendChild(textSpan(problem.id, "problemId"));
        meta.appendChild(textSpan(completionReasonLabel(problem.completionReason), "tag"));
        meta.appendChild(textSpan(formatDateTime(problem.completedAt), "mini"));

        const title = document.createElement("div");
        title.className = "problemTitle";
        title.textContent = problem.title;

        item.appendChild(meta);
        item.appendChild(title);
        const details = document.createElement("details");
        details.className = "archiveDetails";
        const detailsSummary = document.createElement("summary");
        detailsSummary.textContent = "学习记录";
        details.appendChild(detailsSummary);
        const detailsBody = document.createElement("div");
        detailsBody.className = "archiveDetailsBody";
        detailsBody.appendChild(textSpan(problem.painSummary || summarizePainSnapshot(problem.painSnapshot), "mini"));
        if (problem.optimizationReport) {
          detailsBody.appendChild(
            textSpan(
              problem.optimizationReport.optimizationNeeded ? "建议继续优化" : "当前无需优化",
              "mini"
            )
          );
        }
        details.appendChild(detailsBody);
        item.appendChild(details);

        const chatButton = document.createElement("button");
        chatButton.className = "secondary archivePrimaryAction";
        chatButton.type = "button";
        chatButton.textContent = "继续复盘";
        chatButton.addEventListener("click", () => selectArchivedProblem(problem));
        item.appendChild(chatButton);

        const actionsDrawer = document.createElement("details");
        actionsDrawer.className = "archiveActionsDrawer compactDrawer";
        const actionsSummary = document.createElement("summary");
        actionsSummary.textContent = "更多操作";
        actionsDrawer.appendChild(actionsSummary);
        const actions = document.createElement("div");
        actions.className = "row archiveActionGrid";

        const errorButton = document.createElement("button");
        errorButton.className = "secondary";
        errorButton.type = "button";
        errorButton.textContent = "找错复盘";
        errorButton.addEventListener("click", () => requestSubmissionJudge(keyOf(problem)));
        actions.appendChild(errorButton);

        const scoreButton = document.createElement("button");
        scoreButton.className = "secondary";
        scoreButton.type = "button";
        scoreButton.textContent = "学习评分";
        scoreButton.addEventListener("click", () => requestSolutionScore(keyOf(problem)));
        actions.appendChild(scoreButton);

        const optimizeButton = document.createElement("button");
        optimizeButton.className = "secondary";
        optimizeButton.type = "button";
        optimizeButton.textContent = "优化复盘";
        optimizeButton.addEventListener("click", () => requestOptimizationReview(keyOf(problem)));
        actions.appendChild(optimizeButton);

        const recommendButton = document.createElement("button");
        recommendButton.className = "secondary";
        recommendButton.type = "button";
        recommendButton.textContent = "推荐下一题";
        recommendButton.addEventListener("click", () => requestRuleRecommendation(keyOf(problem)));
        actions.appendChild(recommendButton);

        const deleteButton = document.createElement("button");
        deleteButton.className = "secondary danger";
        deleteButton.type = "button";
        deleteButton.textContent = "直接删除";
        deleteButton.title = "只从列表删除，不写入已归档。";
        deleteButton.addEventListener("click", () => requestDeleteProblem(keyOf(problem), "completed"));
        actions.appendChild(deleteButton);

        actionsDrawer.appendChild(actions);
        item.appendChild(actionsDrawer);
        completedList.appendChild(item);
      });
    }

    function renderDetail() {
      const problem = selectedActiveProblem();
      problemDetail.innerHTML = "";

      if (!problem) {
        problemDetail.appendChild(textSpan("POSTER / EMPTY", "evidenceCode"));
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "还没有张贴当前题目。选择一份 Markdown 题面，或者从洛谷取回题目后再进入作答现场。";
        problemDetail.appendChild(empty);
        const emptyActions = document.createElement("div");
        emptyActions.className = "emptyPosterActions";
        const markdownButton = document.createElement("button");
        markdownButton.className = "posterPrimaryAction";
        markdownButton.type = "button";
        markdownButton.textContent = "选择 Markdown 题目";
        markdownButton.addEventListener("click", () => document.getElementById("importManualMarkdownFile").click());
        const luoguButton = document.createElement("button");
        luoguButton.className = "secondary";
        luoguButton.type = "button";
        luoguButton.textContent = "从洛谷获取";
        luoguButton.addEventListener("click", () => {
          luoguPid.focus();
          setStatus("输入洛谷题号，或展开搜索按标题查找。");
        });
        emptyActions.appendChild(markdownButton);
        emptyActions.appendChild(luoguButton);
        problemDetail.appendChild(emptyActions);
        return;
      }

      const header = document.createElement("div");
      header.className = "detailTitle";
      header.appendChild(textSpan("BRIEF / ACTIVE", "evidenceCode"));
      header.appendChild(textSpan(problem.id + " · " + problem.title, "problemTitle"));

      const meta = document.createElement("div");
      meta.className = "tagRow";
      meta.appendChild(textSpan(platformLabel(problem.platform), "tag"));
      if (problem.difficulty !== undefined) {
        meta.appendChild(textSpan("难度 " + problem.difficulty, "tag dossierTag amber"));
      }
      (problem.tags || []).slice(0, 5).forEach((tag) => meta.appendChild(textSpan(String(tag), "tag")));
      if (problem.sourceSetId) {
        meta.appendChild(textSpan("来自题单 " + problem.sourceSetId, "tag"));
      }
      if (problem.sourceUrl) {
        const link = document.createElement("a");
        link.href = problem.sourceUrl;
        link.textContent = "打开原题";
        meta.appendChild(link);
      }
      header.appendChild(meta);
      problemDetail.appendChild(header);

      if (!problem.statement && problem.platform === "luogu") {
        const empty = document.createElement("p");
        empty.className = "hint";
        empty.textContent = "这是题单导入的题目摘要，尚未下载完整题面。";
        problemDetail.appendChild(empty);
        const button = document.createElement("button");
        button.textContent = "下载完整题面";
        button.addEventListener("click", () => importLuogu(problem.id, true));
        problemDetail.appendChild(button);
      } else {
        appendBriefSection("BRIEF / 01", "题面", problem.statement || "暂无题面。");
      }

      if (problem.inputFormat) {
        appendBriefSection("BRIEF / 02", "输入格式", problem.inputFormat);
      }
      if (problem.outputFormat) {
        appendBriefSection("BRIEF / 03", "输出格式", problem.outputFormat);
      }
      if (problem.samples?.length) {
        const title = document.createElement("h2");
        title.appendChild(textSpan("BRIEF / 04", "evidenceCode"));
        title.appendChild(document.createTextNode("样例"));
        problemDetail.appendChild(title);

        const grid = document.createElement("div");
        grid.className = "sampleGrid";
        problem.samples.forEach((sample, index) => {
          const sampleNode = document.createElement("div");
          sampleNode.className = "sample";
          sampleNode.appendChild(textSpan("样例 " + (index + 1) + " 输入", "mini"));
          sampleNode.appendChild(codeBlock(sample.input));
          sampleNode.appendChild(textSpan("样例 " + (index + 1) + " 输出", "mini"));
          sampleNode.appendChild(codeBlock(sample.output));
          grid.appendChild(sampleNode);
        });
        problemDetail.appendChild(grid);
      }
      if (problem.hint) {
        appendBriefSection("BRIEF / 05", "提示", problem.hint);
      }

      const actions = document.createElement("div");
      actions.className = "detailActions";

      const goCoachButton = document.createElement("button");
      goCoachButton.className = "posterPrimaryAction";
      goCoachButton.type = "button";
      goCoachButton.textContent = "进入作答现场";
      goCoachButton.addEventListener("click", () => {
        switchPage("ai");
        renderCoach();
        coachQuestion.focus();
        setStatus("已进入作答现场。可以先自己写，也可以请求一个方向。");
      });
      actions.appendChild(goCoachButton);

      const deleteButton = document.createElement("button");
      deleteButton.className = "secondary danger";
      deleteButton.type = "button";
      deleteButton.textContent = "直接删除";
      deleteButton.title = "只从题库删除，不归档，不写入已归档。";
      deleteButton.addEventListener("click", () => requestDeleteProblem(keyOf(problem), "active"));
      actions.appendChild(deleteButton);
      problemDetail.appendChild(actions);
    }

    function appendBriefSection(code, titleText, bodyText) {
      const title = document.createElement("h2");
      title.appendChild(textSpan(code, "evidenceCode"));
      title.appendChild(document.createTextNode(titleText));
      const block = markdownBlock(bodyText, "textBlock markdownBody");
      problemDetail.appendChild(title);
      problemDetail.appendChild(block);
    }

    function renderOjProviders() {
      ojProviderStatus.innerHTML = "";
      const selected = selectedOjPlatform();
      const providers = state.ojProviders || [];
      providers.forEach((provider) => {
        const item = document.createElement("div");
        item.className = "ojProviderItem " + (provider.overall || "unknown") + (provider.platform === selected ? " selected" : "");
        item.appendChild(textSpan(provider.label || platformLabel(provider.platform), "problemTitle"));
        item.appendChild(textSpan(providerStatusLabel(provider), "mini"));
        item.title = provider.message || "";
        item.addEventListener("click", () => {
          ojSearchPlatform.value = provider.platform;
          updateOjSearchPlaceholder();
          renderOjProviders();
          ojSearchQuery.focus();
        });
        ojProviderStatus.appendChild(item);
      });
      const current = providers.find((provider) => provider.platform === selected);
      document.getElementById("searchOjProblems").disabled = Boolean(current && !current.configured);
    }

    function providerStatusLabel(provider) {
      if (!provider.configured) {
        return "未配置";
      }
      if (provider.overall === "healthy") {
        return provider.fetchStatus === "available" ? "可搜索 · 可导入" : "可搜索 · 仅元数据";
      }
      if (provider.overall === "auth_required") {
        return "需要登录";
      }
      if (provider.overall === "unavailable") {
        return "连接失败";
      }
      if (provider.overall === "degraded") {
        return "部分可用";
      }
      return "待检查";
    }

    function renderOjProblemResults(data) {
      setStatus(platformLabel(data.platform) + " 返回 " + data.items.length + " 道题。" );
      renderSearchItems(ojSearchResults, data.items, (item) => ({
        id: item.nativeId,
        title: item.title,
        detail: [item.difficulty ? "难度 " + item.difficulty : "", ...(item.tags || []).slice(0, 4)].filter(Boolean).join(" · ") || platformLabel(item.platform),
        button: item.canImport ? "导入并建文件" : "打开原题",
        onClick: () => {
          if (item.canImport) {
            setStatus("正在从 " + platformLabel(item.platform) + " 导入 " + item.nativeId + "...");
            vscode.postMessage({
              command: "importOjProblem",
              platform: item.platform,
              nativeId: item.nativeId,
              createFile: true,
              language: state.practiceLanguage
            });
          } else {
            vscode.postMessage({ command: "openOjProblem", platform: item.platform, nativeId: item.nativeId });
          }
        }
      }));
    }

    function renderProblemSetResults(data) {
      setStatus("找到 " + data.total + " 个题单，显示前 " + data.items.length + " 条。");
      renderSearchItems(problemSetSearchResults, data.items, (item) => ({
        id: item.id,
        title: item.title,
        detail: item.problemCount + " 题",
        button: "导入题单",
        onClick: () => {
          setStatus("正在导入题单 " + item.id + "...");
          vscode.postMessage({ command: "importLuoguProblemSet", id: item.id });
        }
      }));
    }

    function renderSearchItems(root, items, toViewModel) {
      root.innerHTML = "";
      items.forEach((item) => {
        const viewModel = toViewModel(item);
        const row = document.createElement("div");
        row.className = "resultItem";

        const button = document.createElement("button");
        button.textContent = viewModel.button;
        button.addEventListener("click", viewModel.onClick);

        const body = document.createElement("div");
        body.appendChild(textSpan(viewModel.id + " · " + viewModel.title, "problemTitle"));
        body.appendChild(textSpan(viewModel.detail, "mini"));

        row.appendChild(button);
        row.appendChild(body);
        root.appendChild(row);
      });
    }

    function renderStarterPresets() {
      const root = document.getElementById("starterPresets");
      starterPresets.forEach((preset) => {
        const item = document.createElement("div");
        item.className = "presetItem";

        const title = document.createElement("div");
        title.className = "presetTitle";
        title.textContent = preset.title;

        const subtitle = document.createElement("p");
        subtitle.className = "hint";
        subtitle.textContent = preset.subtitle;

        const painPoints = document.createElement("div");
        painPoints.className = "tagRow";
        preset.painPoints.forEach((painPoint) => painPoints.appendChild(textSpan(painPoint, "tag")));

        const problems = document.createElement("div");
        problems.className = "presetProblems";
        problems.textContent = preset.problemIds.join("  ");

        const button = document.createElement("button");
        button.textContent = "导入这套路线上手";
        button.addEventListener("click", () => {
          setStatus("正在导入「" + preset.title + "」...");
          vscode.postMessage({ command: "importPreset", presetId: preset.id });
        });

        item.appendChild(title);
        item.appendChild(subtitle);
        item.appendChild(painPoints);
        item.appendChild(problems);
        item.appendChild(button);
        root.appendChild(item);
      });
    }

    function filteredProblems() {
      if (!state.filter) {
        return state.problems;
      }
      return state.problems.filter((problem) => {
        const text = [problem.id, problem.title, problem.platform, ...(problem.tags ?? [])]
          .join(" ")
          .toLowerCase();
        return text.includes(state.filter);
      });
    }

    function selectedActiveProblem() {
      return state.problems.find((item) => keyOf(item) === state.selectedKey);
    }

    function selectedArchivedProblem() {
      return state.completedProblems.find((item) => keyOf(item) === state.selectedKey || item.problemKey === state.selectedKey);
    }

    function selectedCoachProblem() {
      return selectedActiveProblem() || selectedArchivedProblem();
    }

    function selectedProblem() {
      return selectedActiveProblem();
    }

    function selectArchivedProblem(problem) {
      state.selectedKey = keyOf(problem);
      renderCoach();
      renderProblemList();
      renderCompletedList();
      renderDetail();
      switchPage("ai");
      coachQuestion.focus();
      setStatus("已切到归档题复盘：" + problem.id + "。可以继续追问、找错复盘、优化复盘或推荐下一题。");
    }

    function upsertCompletedProblem(problem) {
      const index = state.completedProblems.findIndex((item) => keyOf(item) === keyOf(problem));
      if (index >= 0) {
        state.completedProblems[index] = problem;
      } else {
        state.completedProblems.unshift(problem);
      }
    }

    function summarizePainSnapshot(snapshot) {
      const counts = snapshot?.painPointCounts || {};
      return Object.entries(counts)
        .sort((left, right) => right[1] - left[1] || String(left[0]).localeCompare(String(right[0])))
        .slice(0, 3)
        .map(([label, count]) => label + "x" + count)
        .join(" · ") || "暂无痛点记录";
    }

    function formatDateTime(value) {
      if (!value) {
        return "";
      }
      const date = new Date(value);
      if (Number.isNaN(date.getTime())) {
        return String(value);
      }
      return date.toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
    }

    function setStatus(text, tone) {
      status.textContent = text;
      status.className = "status" + (tone === "error" ? " error" : "");
    }

    function setCoachBusy(isBusy) {
      coachActionButtons.forEach((button) => {
        button.disabled = Boolean(isBusy);
      });
      const isArchivedCoachProblem = Boolean(selectedArchivedProblem());
      coachGiveUp.disabled = Boolean(isBusy || isArchivedCoachProblem);
      coachCompleted.disabled = Boolean(isBusy || isArchivedCoachProblem);
      ojLogin.disabled = Boolean(isBusy);
      ojPreviewSubmit.disabled = Boolean(isBusy);
    }

    function markdownBlock(text, className) {
      const root = document.createElement("div");
      const classes = String(className || "").trim();
      root.className = classes.includes("markdownBody")
        ? classes
        : (classes ? classes + " " : "") + "markdownBody";
      parseMarkdownBlocks(text).forEach((block) => appendMarkdownBlock(root, block));

      if (!root.firstChild) {
        root.appendChild(document.createTextNode(""));
      }

      return root;
    }

    function parseMarkdownBlocks(text) {
      const lines = String(text || "").replace(/\\r\\n/g, "\\n").split("\\n");
      const fenceMarker = String.fromCharCode(96, 96, 96);
      const blocks = [];
      let index = 0;

      while (index < lines.length) {
        const line = lines[index];
        const trimmed = line.trim();
        if (trimmed.startsWith(fenceMarker)) {
          const language = trimmed.slice(fenceMarker.length).trim();
          const codeLines = [];
          index += 1;
          while (index < lines.length && !lines[index].trim().startsWith(fenceMarker)) {
            codeLines.push(lines[index]);
            index += 1;
          }
          if (index < lines.length) {
            index += 1;
          }
          blocks.push({
            type: "code",
            language,
            text: codeLines.join("\\n")
          });
          continue;
        }

        if (!trimmed) {
          index += 1;
          continue;
        }

        if (/^(?:-{3,}|\\*{3,}|_{3,})$/.test(trimmed)) {
          blocks.push({ type: "rule" });
          index += 1;
          continue;
        }

        const heading = trimmed.match(/^(#{1,3})\\s+(.+)$/);
        if (heading) {
          blocks.push({
            type: "heading",
            level: heading[1].length,
            text: heading[2]
          });
          index += 1;
          continue;
        }

        if (trimmed.startsWith(">")) {
          const quoteLines = [];
          while (index < lines.length && lines[index].trim().startsWith(">")) {
            quoteLines.push(lines[index].trim().replace(/^>\\s?/, ""));
            index += 1;
          }
          blocks.push({
            type: "quote",
            text: quoteLines.join("\\n").trim()
          });
          continue;
        }

        const bullet = trimmed.match(/^[-*+]\\s+(.+)$/);
        const ordered = trimmed.match(/^\\d+[.)]\\s+(.+)$/);
        if (bullet || ordered) {
          const isOrdered = Boolean(ordered);
          const items = [];
          while (index < lines.length) {
            const row = lines[index].trim();
            const item = isOrdered ? row.match(/^\\d+[.)]\\s+(.+)$/) : row.match(/^[-*+]\\s+(.+)$/);
            if (!item) {
              break;
            }
            items.push(item[1]);
            index += 1;
          }
          blocks.push({
            type: "list",
            ordered: isOrdered,
            items
          });
          continue;
        }

        const paragraph = [];
        while (index < lines.length) {
          const row = lines[index].trim();
          if (
            !row ||
            row.startsWith(fenceMarker) ||
            row.startsWith(">") ||
            /^(#{1,3})\\s+/.test(row) ||
            /^[-*+]\\s+/.test(row) ||
            /^\\d+[.)]\\s+/.test(row) ||
            /^(?:-{3,}|\\*{3,}|_{3,})$/.test(row)
          ) {
            break;
          }
          paragraph.push(row);
          index += 1;
        }

        if (paragraph.length > 0) {
          blocks.push({
            type: "paragraph",
            text: paragraph.join(" ")
          });
          continue;
        }

        index += 1;
      }

      return blocks;
    }

    function appendMarkdownBlock(root, block) {
      if (block.type === "paragraph") {
        const node = document.createElement("p");
        node.className = "markdownParagraph";
        appendInlineMarkdown(node, block.text);
        root.appendChild(node);
        return;
      }

      if (block.type === "heading") {
        const node = document.createElement("p");
        node.className = "responseSectionTitle markdownHeading markdownHeading" + block.level;
        appendInlineMarkdown(node, block.text);
        root.appendChild(node);
        return;
      }

      if (block.type === "quote") {
        const quote = document.createElement("blockquote");
        quote.className = "markdownQuote";
        parseMarkdownBlocks(block.text).forEach((nestedBlock) => appendMarkdownBlock(quote, nestedBlock));
        if (!quote.firstChild) {
          appendInlineMarkdown(quote, block.text);
        }
        root.appendChild(quote);
        return;
      }

      if (block.type === "list") {
        const list = document.createElement(block.ordered ? "ol" : "ul");
        list.className = "markdownList";
        block.items.forEach((content) => {
          const item = document.createElement("li");
          appendInlineMarkdown(item, content);
          list.appendChild(item);
        });
        root.appendChild(list);
        return;
      }

      if (block.type === "code") {
        const code = codeBlock(block.text);
        if (block.language) {
          code.dataset.language = block.language;
        }
        root.appendChild(code);
        return;
      }

      if (block.type === "rule") {
        const rule = document.createElement("div");
        rule.className = "markdownRule";
        root.appendChild(rule);
      }
    }

    function appendInlineMarkdown(parent, text) {
      const value = String(text || "");
      const tick = String.fromCharCode(96);
      let index = 0;

      function appendText(content) {
        if (content) {
          parent.appendChild(document.createTextNode(content));
        }
      }

      while (index < value.length) {
        const strongStart = value.indexOf("**", index);
        const codeStart = value.indexOf(tick, index);
        const linkStart = value.indexOf("[", index);
        const mathStart = value.indexOf("$", index);
        const candidates = [
          { type: "strong", start: strongStart },
          { type: "code", start: codeStart },
          { type: "link", start: linkStart },
          { type: "math", start: mathStart }
        ]
          .filter((item) => item.start >= 0)
          .sort((left, right) => left.start - right.start);
        const next = candidates[0];
        if (!next) {
          appendText(value.slice(index));
          break;
        }

        appendText(value.slice(index, next.start));
        if (next.type === "strong") {
          const end = value.indexOf("**", next.start + 2);
          if (end < 0) {
            appendText(value.slice(next.start));
            break;
          }
          const strong = document.createElement("strong");
          appendInlineMarkdown(strong, value.slice(next.start + 2, end));
          parent.appendChild(strong);
          index = end + 2;
          continue;
        }

        if (next.type === "code") {
          const end = value.indexOf(tick, next.start + 1);
          if (end < 0) {
            appendText(value.slice(next.start));
            break;
          }
          const code = document.createElement("code");
          code.textContent = value.slice(next.start + 1, end);
          parent.appendChild(code);
          index = end + 1;
          continue;
        }

        if (next.type === "link") {
          const labelEnd = value.indexOf("]", next.start + 1);
          const hrefStart = labelEnd >= 0 ? labelEnd + 1 : -1;
          if (labelEnd >= 0 && value[hrefStart] === "(") {
            const hrefEnd = value.indexOf(")", hrefStart + 1);
            if (hrefEnd >= 0) {
              appendMarkdownLink(parent, value.slice(next.start + 1, labelEnd), value.slice(hrefStart + 1, hrefEnd));
              index = hrefEnd + 1;
              continue;
            }
          }
          appendText(value.charAt(next.start));
          index = next.start + 1;
          continue;
        }

        const end = value.indexOf("$", next.start + 1);
        if (end < 0) {
          appendText(value.slice(next.start));
          break;
        }
        appendMathInline(parent, value.slice(next.start + 1, end));
        index = end + 1;
      }
    }

    function appendMathInline(parent, source) {
      const math = document.createElement("span");
      math.className = "mathInline";
      appendMathTextWithScripts(math, normalizeInlineMathText(source));
      parent.appendChild(math);
    }

    function normalizeInlineMathText(source) {
      const slash = String.fromCharCode(92);
      let value = String(source || "").trim();
      [
        ["boldsymbol", ""],
        ["mathbf", ""],
        ["mathrm", ""],
        ["text", ""],
        ["bm", ""],
        ["leq", "≤"],
        ["le", "≤"],
        ["geq", "≥"],
        ["ge", "≥"],
        ["neq", "≠"],
        ["ne", "≠"],
        ["times", "×"],
        ["cdot", "·"],
        ["div", "÷"],
        ["pm", "±"],
        ["infty", "∞"],
        ["ldots", "…"],
        ["cdots", "…"],
        ["to", "→"],
        ["rightarrow", "→"],
        ["leftarrow", "←"],
        ["in", "∈"],
        ["notin", "∉"]
      ].forEach(([command, replacement]) => {
        value = value.split(slash + command).join(replacement);
      });
      value = value.replace(/\\{([^{}]*)\\}/g, "$1");
      return value.replace(/\\s+/g, " ").trim();
    }

    function appendMathTextWithScripts(parent, text) {
      const value = String(text || "");
      let index = 0;

      while (index < value.length) {
        const nextSup = value.indexOf("^", index);
        const nextSub = value.indexOf("_", index);
        const candidates = [nextSup, nextSub].filter((item) => item >= 0).sort((left, right) => left - right);
        const next = candidates.length ? candidates[0] : -1;
        if (next < 0) {
          parent.appendChild(document.createTextNode(value.slice(index)));
          break;
        }

        if (next > index) {
          parent.appendChild(document.createTextNode(value.slice(index, next)));
        }

        const script = readMathScript(value, next + 1);
        if (!script.text) {
          parent.appendChild(document.createTextNode(value.charAt(next)));
          index = next + 1;
          continue;
        }

        const node = document.createElement(value.charAt(next) === "^" ? "sup" : "sub");
        node.className = value.charAt(next) === "^" ? "mathSup" : "mathSub";
        node.textContent = script.text;
        parent.appendChild(node);
        index = script.nextIndex;
      }
    }

    function readMathScript(value, start) {
      if (start >= value.length) {
        return { text: "", nextIndex: start };
      }

      if (value.charAt(start) === "{") {
        const end = value.indexOf("}", start + 1);
        if (end >= 0) {
          return {
            text: value.slice(start + 1, end),
            nextIndex: end + 1
          };
        }
      }

      const match = value.slice(start).match(/^[A-Za-z0-9+-]+/);
      if (match) {
        return {
          text: match[0],
          nextIndex: start + match[0].length
        };
      }

      return {
        text: value.charAt(start),
        nextIndex: start + 1
      };
    }

    function appendMarkdownLink(parent, label, href) {
      const safeHref = String(href || "").trim();
      if (!/^(https?:|mailto:)/i.test(safeHref)) {
        parent.appendChild(document.createTextNode("[" + label + "](" + href + ")"));
        return;
      }

      const link = document.createElement("a");
      link.href = safeHref;
      link.rel = "noreferrer noopener";
      link.target = "_blank";
      link.textContent = label || safeHref;
      parent.appendChild(link);
    }

    function textSpan(text, className) {
      const span = document.createElement("span");
      span.className = className;
      span.textContent = text;
      return span;
    }

    function codeBlock(text) {
      const pre = document.createElement("pre");
      pre.className = "codeBlock";
      pre.textContent = text;
      return pre;
    }

    function keyOf(problem) {
      return problem.platform + ":" + problem.id;
    }

    function normalizePid(pid) {
      const trimmed = String(pid).trim();
      if (/^\\d+$/.test(trimmed)) {
        return "P" + trimmed;
      }
      const match = trimmed.match(/^p(\\d+)$/i);
      if (match) {
        return "P" + match[1];
      }
      return trimmed;
    }

    function platformLabel(platform) {
      if (platform === "luogu") {
        return "洛谷";
      }
      if (platform === "leetcode") {
        return "LeetCode";
      }
      if (platform === "nowcoder") {
        return "牛客";
      }
      if (platform === "codeforces") {
        return "Codeforces";
      }
      if (platform === "atcoder") {
        return "AtCoder";
      }
      return "手动";
    }
  </script>
</body>
</html>`;
  }
}

function toStudentSkillVersionView(record: {
  versionId: string;
  archivedAt: string;
  reason: string;
  revision: number;
  skill: StudentSkill;
}): StudentSkillVersionView {
  const counts = studentSkillStatusCounts(record.skill);
  return {
    versionId: record.versionId,
    archivedAt: record.archivedAt,
    reason: record.reason,
    revision: record.revision,
    activeSkillCount: counts.active,
    candidateSkillCount: counts.candidate,
    disabledSkillCount: counts.disabled
  };
}

function studentSkillStatusCounts(skill: StudentSkill): {
  active: number;
  candidate: number;
  disabled: number;
} {
  return Object.values(skill.skills).reduce(
    (counts, entry) => {
      if (entry.status === "disabled") {
        counts.disabled += 1;
      } else if (entry.status === "candidate") {
        counts.candidate += 1;
      } else {
        counts.active += 1;
      }
      return counts;
    },
    { active: 0, candidate: 0, disabled: 0 }
  );
}

function formatDateTimeForStatus(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function compactMultiline(values: Array<string | undefined>): string {
  return values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function makeProblemKey(problem: Pick<ProblemRecord, "platform" | "id">): string {
  return `${problem.platform}:${problem.id}`;
}

function ojSearchKey(platform: OjPlatformId, nativeId: string): string {
  return `${platform}:${nativeId.trim().toLocaleLowerCase()}`;
}

function normalizeOjPlatform(value: string): OjPlatformId {
  if (!(ojPlatformIds as readonly string[]).includes(value)) {
    throw new Error(`未知题库平台：${value}`);
  }
  return value as OjPlatformId;
}

function normalizeRemoteOjPlatform(value: OjPlatformId): "luogu" | "codeforces" | "atcoder" {
  if (!isRemoteOjPlatform(value)) {
    throw new Error(`${value} 使用本地 MCP，不接受托管访问密钥。`);
  }
  return value;
}

function mergeSavedProblemRecord(
  existing: SavedProblemRecord | undefined,
  incoming: SavedProblemRecord
): SavedProblemRecord {
  if (!existing) {
    return incoming;
  }

  return {
    ...existing,
    ...incoming,
    statement: incoming.statement.trim() ? incoming.statement : existing.statement,
    inputFormat: incoming.inputFormat.trim() ? incoming.inputFormat : existing.inputFormat,
    outputFormat: incoming.outputFormat.trim() ? incoming.outputFormat : existing.outputFormat,
    samples: incoming.samples.length > 0 ? incoming.samples : existing.samples,
    hint: incoming.hint?.trim() ? incoming.hint : existing.hint,
    savedAt: incoming.savedAt
  };
}

function hasProblemDetailsForTeacherPack(problem: ProblemRecord): boolean {
  return Boolean(
    problem.statement.trim() ||
      problem.inputFormat.trim() ||
      problem.outputFormat.trim() ||
      problem.samples.some((sample) => sample.input.trim() || sample.output.trim())
  );
}

function describeAiCoachAction(action: AiCoachAction, responseLanguage: CoachResponseLanguage): string {
  const languageInstruction =
    responseLanguage === "zh"
      ? "输出语言：简体中文。"
      : responseLanguage === "en"
        ? "Output language: English."
        : "输出语言：保留模型原文。";

  if (action === "specific") {
    return [
      "学生点击「再具体点」：上一条提示不够具体，但不要变成完整讲解。",
      "请沿同一个主痛点继续收窄，优先填写 specific_hint。",
      "指出当前代码里的具体变量、循环、条件、return 或输出表达式；回答控制在 2-3 个短句。",
      "不要切换到完整解法，不要粘完整 AC 代码。",
      languageInstruction
    ].join("");
  }

  if (action === "followUp") {
    return [
      "学生点击「追问 AI」：这是基于上一轮 AI 回复的继续追问。",
      "追问可以详细回答，但必须讲给新手听：先回答学生额外输入里的具体问题，再用小例子或小步骤解释。",
      "如果学生觉得太难，要少用术语；必须使用术语时，立刻用白话解释。",
      "仍然不要粘完整 AC 代码。",
      languageInstruction
    ].join("");
  }

  if (action === "giveUp") {
    return `学生点击「我放弃了」：先给标准思路轮廓，再指出学生代码痛点和下一次要练的技能，不要生成完整可提交代码。${languageInstruction}`;
  }

  if (action === "recommend") {
    return `学生点击「推荐下一题」：重点根据历史痛点和当前代码推荐下一道题。${languageInstruction}`;
  }

  return [
    "学生点击「简单提示」：给一个很短、可执行但不泄题的基础提示。",
    "只写 1-2 个短句，包含观察到的症状、当前代码锚点、下一步要改的小范围。",
    "不要只说“检查边界/注意输入输出/再读题”。",
    languageInstruction
  ].join("");
}

function normalizePracticeLanguage(value: string | undefined): PracticeLanguage {
  return practiceLanguageOptions.some((option) => option.id === value) ? (value as PracticeLanguage) : "python";
}

function normalizeCoachResponseLanguage(value: string | undefined): CoachResponseLanguage {
  if (value === "raw" || value === "en") {
    return value;
  }

  return "zh";
}

function normalizeUiLanguage(value: string | undefined): UiLanguage {
  return value === "en" ? "en" : "zh";
}

function normalizeAiProviderMode(value: string | undefined): AiProviderConfigUpdate["mode"] {
  if (value === "openai" || value === "anthropic-native") {
    return value;
  }

  return "openai-compatible";
}

function savedBaseUrlForMode(env: ModelEnv, mode: AiProviderMode): string {
  if (mode === "openai") {
    return env.AI_OPENAI_BASE_URL || "https://api.openai.com/v1";
  }
  if (mode === "anthropic-native") {
    return env.AI_ANTHROPIC_BASE_URL || "https://api.anthropic.com/v1";
  }

  return env.AI_OPENAI_COMPAT_BASE_URL || env.MIMO_OPENAI_BASE_URL || env.DEEPSEEK_BASE_URL || "";
}

function savedApiKeyForMode(env: ModelEnv, mode: AiProviderMode): string {
  if (mode === "openai") {
    return env.AI_OPENAI_API_KEY || "";
  }
  if (mode === "anthropic-native") {
    return env.AI_ANTHROPIC_API_KEY || "";
  }

  return env.AI_OPENAI_COMPAT_API_KEY || env.MIMO_API_KEY || env.DEEPSEEK_API_KEY || "";
}

function normalizeAutocompleteFormat(value: string | undefined): AiProviderConfigUpdate["autocompleteFormat"] {
  if (value === "openai-chat" || value === "anthropic-messages" || value === "openai-completions") {
    return value;
  }

  return "openai-completions";
}

function applyAiConfigUpdateForHealthCheck(env: ModelEnv, update: AiProviderConfigUpdate): ModelEnv {
  const next: ModelEnv = { ...env };
  const mode = normalizeAiProviderMode(update.mode);
  next.AI_PROVIDER_MODE = mode;

  if (mode === "openai") {
    next.AI_OPENAI_AUTH_MODE = update.authMode ?? next.AI_OPENAI_AUTH_MODE ?? "api-key";
    if (update.baseUrl?.trim()) {
      next.AI_OPENAI_BASE_URL = update.baseUrl.trim();
    }
    if (update.apiKey?.trim()) {
      next.AI_OPENAI_API_KEY = update.apiKey.trim();
    }
    next.AI_OPENAI_CHAT_MODEL = update.chatModel?.trim() ?? "";
    next.AI_OPENAI_AUTOCOMPLETE_MODEL = update.autocompleteModel?.trim() ?? "";
    return next;
  }

  if (mode === "anthropic-native") {
    if (update.baseUrl?.trim()) {
      next.AI_ANTHROPIC_BASE_URL = update.baseUrl.trim();
    }
    if (update.apiKey?.trim()) {
      next.AI_ANTHROPIC_API_KEY = update.apiKey.trim();
    }
    next.AI_ANTHROPIC_CHAT_MODEL = update.chatModel?.trim() ?? "";
    next.AI_ANTHROPIC_AUTOCOMPLETE_MODEL = update.autocompleteModel?.trim() ?? "";
    return next;
  }

  if (update.baseUrl?.trim()) {
    next.AI_OPENAI_COMPAT_BASE_URL = update.baseUrl.trim();
  }
  if (update.autocompleteBaseUrl?.trim()) {
    next.AI_OPENAI_COMPAT_AUTOCOMPLETE_BASE_URL = update.autocompleteBaseUrl.trim();
  } else {
    delete next.AI_OPENAI_COMPAT_AUTOCOMPLETE_BASE_URL;
  }
  if (update.apiKey?.trim()) {
    next.AI_OPENAI_COMPAT_API_KEY = update.apiKey.trim();
  }
  next.AI_OPENAI_COMPAT_CHAT_MODEL = update.chatModel?.trim() ?? "";
  next.AI_OPENAI_COMPAT_AUTOCOMPLETE_MODEL = update.autocompleteModel?.trim() ?? "";
  next.AI_OPENAI_COMPAT_AUTOCOMPLETE_FORMAT = normalizeAutocompleteFormat(update.autocompleteFormat);
  return next;
}

async function runModelListHealthCheck(
  env: ModelEnv,
  mode: AiProviderMode,
  config: AiProviderConfigUpdate,
  knownSecrets: string[],
  codexModels: CodexModelService
): Promise<AiHealthCheckStep> {
  const startedAt = Date.now();
  if (mode === "openai" && env.AI_OPENAI_AUTH_MODE === "codex-oauth") {
    try {
      const result = await codexModels.listModels();
      return {
        status: "pass",
        endpoint: "codex://app-server/model/list",
        count: result.models.length,
        latencyMs: elapsedSince(startedAt)
      };
    } catch (error) {
      const message = redactKnownSecrets(errorMessage(error), knownSecrets);
      return failHealthCheckStep({
        endpoint: "codex://app-server/model/list",
        latencyMs: elapsedSince(startedAt),
        error: message,
        errorHint: healthCheckErrorHint(message, "models")
      });
    }
  }
  const endpointBase = savedBaseUrlForMode(env, mode);
  const apiKey = savedApiKeyForMode(env, mode);
  const keyState = keyStateForApiKey(apiKey, config.apiKey);

  if (!endpointBase) {
    return failHealthCheckStep({
      keyState,
      latencyMs: elapsedSince(startedAt),
      error: "模型列表缺少 Base URL。",
      errorHint: "先填写分析接口 Base URL；补全专用 Base URL 不用于 /models。"
    });
  }
  if (!apiKey) {
    return failHealthCheckStep({
      endpoint: `${endpointBase.replace(/\/+$/, "")}/models`,
      keyState,
      latencyMs: elapsedSince(startedAt),
      error: "模型列表缺少 API Key。",
      errorHint: "填写 API Key 后点保存，或在本次检查里临时输入 key；界面不会显示明文。"
    });
  }

  try {
    const result = await listProviderModels({
      mode,
      baseUrl: endpointBase,
      apiKey,
      anthropicVersion: "2023-06-01"
    });
    return {
      status: "pass",
      endpoint: result.endpoint,
      keyState,
      count: result.models.length,
      latencyMs: elapsedSince(startedAt)
    };
  } catch (error) {
    const message = redactKnownSecrets(errorMessage(error), knownSecrets);
    return failHealthCheckStep({
      endpoint: `${endpointBase.replace(/\/+$/, "")}/models`,
      keyState,
      latencyMs: elapsedSince(startedAt),
      error: message,
      errorHint: healthCheckErrorHint(message, "models")
    });
  }
}

async function runChatSmokeHealthCheck(
  env: ModelEnv,
  config: AiProviderConfigUpdate,
  knownSecrets: string[],
  oauthTransport: ModelTextTransport
): Promise<AiHealthCheckStep> {
  const startedAt = Date.now();
  try {
    const route = routeTeachingModel(env, oauthTransport);
    const text = await requestChatCompletionText(
      route.config,
      {
        messages: [
          {
            role: "system",
            content: "Return OK only. Do not include explanations."
          },
          {
            role: "user",
            content: "health check"
          }
        ],
        maxTokens: 16,
        temperature: 0,
        usageLogPath: false
      }
    );
    if (!text.trim()) {
      throw new Error("Chat smoke 返回为空。");
    }
    return {
      status: "pass",
      endpoint: route.endpoint,
      model: route.model,
      format: route.format,
      keyState: providerKeyState(route.config, config.apiKey),
      latencyMs: elapsedSince(startedAt)
    };
  } catch (error) {
    const message = redactKnownSecrets(errorMessage(error), knownSecrets);
    const routeInfo = safeTeachingRouteInfo(env, oauthTransport, config.apiKey);
    return failHealthCheckStep({
      ...routeInfo,
      latencyMs: elapsedSince(startedAt),
      error: message,
      errorHint: healthCheckErrorHint(message, "chat")
    });
  }
}

async function runAutocompleteSmokeHealthCheck(
  env: ModelEnv,
  config: AiProviderConfigUpdate,
  knownSecrets: string[],
  oauthTransport: ModelTextTransport
): Promise<AiHealthCheckStep> {
  const startedAt = Date.now();
  try {
    const route = routeAutocompleteModel(env, oauthTransport);
    if (route.capabilities.configurationIssue === "deepseek-fim-beta-required") {
      return failHealthCheckStep({
        endpoint: route.endpoint,
        model: route.model,
        format: route.format,
        renderer: route.capabilities.renderer,
        keyState: providerKeyState(route.config, config.apiKey),
        latencyMs: elapsedSince(startedAt),
        error: "DeepSeek FIM 补全端点不是 /beta。",
        errorHint: "DeepSeek FIM 补全需要把补全接口 Base URL 设置为 https://api.deepseek.com/beta；分析接口仍可保留 /v1。"
      });
    }
    const result = await requestMimoAutocompleteDetailed(route.config, {
      prefix: "def add(a, b):\n    ",
      suffix: "\nprint(add(1, 2))",
      language: "python",
      filePath: "health-check.py",
      capabilities: route.capabilities
    });
    const resultInfo = {
      endpoint: route.endpoint,
      model: route.model,
      format: route.format,
      renderer: result.audit.renderer,
      validationStatus: result.status,
      keyState: providerKeyState(route.config, config.apiKey),
      latencyMs: elapsedSince(startedAt)
    };
    if (result.status === "model-empty") {
      return failHealthCheckStep({
        ...resultInfo,
        error: "Autocomplete smoke model returned empty."
      });
    }
    if (result.status === "validator-rejected") {
      return failHealthCheckStep({
        ...resultInfo,
        error: "Autocomplete smoke rejected by policy: " +
          (result.rejectionReason ?? "unknown")
      });
    }
    return {
      status: "pass",
      ...resultInfo
    };
  } catch (error) {
    const message = redactKnownSecrets(errorMessage(error), knownSecrets);
    const routeInfo = safeAutocompleteRouteInfo(env, oauthTransport, config.apiKey);
    return failHealthCheckStep({
      ...routeInfo,
      latencyMs: elapsedSince(startedAt),
      error: message,
      errorHint: healthCheckErrorHint(message, "autocomplete")
    });
  }
}

function failHealthCheckStep(step: Omit<AiHealthCheckStep, "status">): AiHealthCheckStep {
  return {
    status: "fail",
    ...step
  };
}

function safeTeachingRouteInfo(
  env: ModelEnv,
  oauthTransport: ModelTextTransport,
  providedApiKey?: string
): {
  endpoint?: string;
  model?: string;
  format?: string;
  keyState?: AiHealthCheckStep["keyState"];
} {
  try {
    const route = routeTeachingModel(env, oauthTransport);
    return {
      endpoint: route.endpoint,
      model: route.model,
      format: route.format,
      keyState: providerKeyState(route.config, providedApiKey)
    };
  } catch {
    return {};
  }
}

function safeAutocompleteRouteInfo(
  env: ModelEnv,
  oauthTransport: ModelTextTransport,
  providedApiKey?: string
): {
  endpoint?: string;
  model?: string;
  format?: string;
  renderer?: SkillPlanAudit["renderer"];
  keyState?: AiHealthCheckStep["keyState"];
} {
  try {
    const route = routeAutocompleteModel(env, oauthTransport);
    return {
      endpoint: route.endpoint,
      model: route.model,
      format: route.format,
      renderer: route.capabilities.renderer,
      keyState: providerKeyState(route.config, providedApiKey)
    };
  } catch {
    return {};
  }
}

function healthCheckErrorHint(message: string, scope: "models" | "chat" | "autocomplete"): string {
  if (/api key|key|401|403/i.test(message)) {
    return "API Key 缺失、无效或没有该模型权限；请重新保存 key，并确认当前角色使用的是同一个 endpoint。";
  }
  if (/base url/i.test(message)) {
    return "Base URL 缺失或不完整；OpenAI 兼容服务通常形如 https://example.com/v1。";
  }
  if (/chat model|autocomplete model|model/i.test(message) && /missing|缺少/i.test(message)) {
    return scope === "autocomplete" ? "请填写补全模型名。" : "请填写提示/评分模型名。";
  }
  if (/DeepSeek FIM|\/beta|deepseek/i.test(message)) {
    return "DeepSeek FIM 补全需要把补全接口 Base URL 设置为 https://api.deepseek.com/beta。";
  }
  if (/\/models|模型列表|404/i.test(message) && scope === "models") {
    return "当前服务可能不支持 /models；这不一定影响 chat/补全，请继续看另外两张卡。";
  }
  if (/fetch failed|network|ENOTFOUND|ECONNRESET|before HTTP response/i.test(message)) {
    return "检查网络、代理或 Base URL；如果在国内网络，优先用当前可访问的兼容端点。";
  }
  if (/timed out|timeout|超时/i.test(message)) {
    return "模型未在当前等待窗口内返回；先重试一次排除冷启动，仍失败则换更快的补全模型或检查 app-server 状态。";
  }
  if (/response did not include|响应缺少|返回为空|empty/i.test(message)) {
    return "接口已连通，但返回格式不符合当前协议；请确认补全协议和模型类型是否匹配。";
  }

  return "请核对 endpoint、模型名和协议是否属于同一家 provider。";
}

function keyStateForApiKey(apiKey: string | undefined, providedApiKey: string | undefined): AiHealthCheckStep["keyState"] {
  if (providedApiKey?.trim()) {
    return "provided";
  }
  if (apiKey?.trim()) {
    return "saved";
  }
  return "missing";
}

function providerApiKey(
  config: ChatCompletionProviderConfig | CompletionProviderConfig
): string | undefined {
  return config.format === "codex-app-server" ? undefined : config.apiKey;
}

function providerKeyState(
  config: ChatCompletionProviderConfig | CompletionProviderConfig,
  providedApiKey?: string
): AiHealthCheckStep["keyState"] {
  return config.format === "codex-app-server"
    ? undefined
    : keyStateForApiKey(config.apiKey, providedApiKey);
}

function collectKnownSecrets(...sources: Array<ModelEnv | AiProviderConfigUpdate>): string[] {
  const values: string[] = [];
  for (const source of sources) {
    const record = source as Record<string, string | undefined>;
    values.push(
      record.AI_OPENAI_API_KEY ?? "",
      record.AI_OPENAI_COMPAT_API_KEY ?? "",
      record.AI_ANTHROPIC_API_KEY ?? "",
      record.MIMO_API_KEY ?? "",
      record.DEEPSEEK_API_KEY ?? "",
      record.apiKey ?? ""
    );
  }

  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.length >= 4)));
}

function redactKnownSecrets(message: string, secrets: string[]): string {
  let redacted = message;
  for (const secret of secrets) {
    redacted = redacted.split(secret).join("[redacted]");
  }
  return redacted
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [redacted]")
    .replace(/x-api-key[=:]\s*[A-Za-z0-9._~+/=-]+/gi, "x-api-key=[redacted]");
}

function elapsedSince(startedAt: number): number {
  return Date.now() - startedAt;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeBaseUrlForDisplay(baseUrl: string): string {
  try {
    const parsed = new URL(baseUrl);
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return baseUrl.replace(/[?&]key=[^&]+/gi, "");
  }
}

function normalizeCompletionReason(value: string | undefined): CompletionReason {
  if (value === "removed" || value === "abandoned" || value === "revealed") {
    return value;
  }

  return "completed";
}

function normalizeOptionalCodeforcesHandle(value: string | undefined): string | undefined {
  const handle = value?.trim();
  if (!handle) {
    return undefined;
  }
  if (!/^[A-Za-z0-9_.-]+$/.test(handle)) {
    throw new Error("Codeforces handle 格式不正确。");
  }
  return handle;
}

function normalizeSubmissionPlatform(value: string): SubmissionPlatform {
  if (value !== "codeforces" && value !== "atcoder") {
    throw new Error("OJ 平台必须是 Codeforces 或 AtCoder。");
  }
  return value;
}

function actionToAttemptEventKind(
  action: AiCoachAction
): "hint_requested" | "specific_hint_requested" | "follow_up_requested" | "recommendation_requested" {
  if (action === "specific") {
    return "specific_hint_requested";
  }

  if (action === "followUp") {
    return "follow_up_requested";
  }

  if (action === "recommend") {
    return "recommendation_requested";
  }

  return "hint_requested";
}

function mergeRequestPurpose(basePurpose: string, studentRequest: string | undefined, previousCoachTurn?: string): string {
  const trimmedRequest = studentRequest?.trim();
  const trimmedPrevious = previousCoachTurn?.trim();
  const parts = [basePurpose];

  if (trimmedPrevious) {
    parts.push(`上一轮 AI 回复摘要：\n${trimmedPrevious}`);
  }
  if (trimmedRequest) {
    parts.push(`学生额外输入：${trimmedRequest}`);
  }

  return parts.join("\n");
}

function defaultSkillFeedbackNote(feedbackType: StudentSkillCorrectionType): string {
  if (feedbackType === "diagnosis_wrong") {
    return "用户认为这条学习画像判断不符合当前真实卡点。";
  }

  if (feedbackType === "diagnosis_helpful") {
    return "用户认为这条学习画像判断对当前学习有帮助。";
  }

  return "用户手动记录了一条学习画像备注。";
}

function studentSkillFeedbackStatus(feedbackType: StudentSkillCorrectionType, name: string): string {
  if (feedbackType === "diagnosis_wrong") {
    return `已记录「${name}」为误判，并把它作为后续 AI 的人工纠偏。`;
  }

  if (feedbackType === "diagnosis_helpful") {
    return `已记录「${name}」有帮助，后续 AI 会更信任这条画像证据。`;
  }

  return `已记录「${name}」的学习画像备注。`;
}

function summarizePreviousLearning(problem: CompletedProblemRecord): string {
  if (problem.solutionScore) {
    return [
      `${problem.solutionScore.ojResult} · ${problem.solutionScore.learningScore}/100`,
      problem.solutionScore.complexityAssessment.verdict,
      problem.solutionScore.complexityAssessment.reason
    ]
      .filter(Boolean)
      .join(" · ");
  }

  if (problem.lessonReport) {
    return `讲解/补救阶段 · ${problem.lessonReport.archiveReason} · ${problem.lessonReport.standardApproach}`;
  }

  return completionReasonLabel(problem.completionReason);
}

function optimizationPainPoints(report: OptimizationReport): TeachingPainPoint[] {
  if (!report.optimizationNeeded) {
    return [];
  }

  const label = isBruteforceOptimization(report) ? "bruteforce_no_growth" : "time_complexity_mismatch";

  return [
    {
      label,
      confidence: 0.72,
      evidence: report.timeComplexity.action
    }
  ];
}

function optimizationSkillUpdate(report: OptimizationReport):
  | {
      candidate: string;
      reason: string;
      rules: string[];
    }
  | undefined {
  if (!report.optimizationNeeded) {
    return undefined;
  }

  const bruteForceRelated = isBruteforceOptimization(report);
  return {
    candidate: bruteForceRelated ? "complexity-upgrade-from-bruteforce" : "post-ac-optimization-review",
    reason: bruteForceRelated
      ? "已归档题目的优化复盘显示：学生需要把通过样例或 AC 的暴力写法继续抽象成可迁移的复杂度模型。"
      : "已归档题目的优化复盘显示：学生需要在 AC 后判断复杂度、内存和代码质量是否真的值得继续投入。",
    rules: [
      "先写出当前时间复杂度和目标时间复杂度。",
      "只改一个核心循环或数据结构，不整题重写。",
      "简单题若已匹配训练目标，应明确跳过优化，进入下一题。"
    ]
  };
}

function isBruteforceOptimization(report: OptimizationReport): boolean {
  return /暴力|枚举|brute|bruteforce|双重|三重/i.test(
    [report.summary, report.timeComplexity.current, report.timeComplexity.target, report.timeComplexity.action].join(" ")
  );
}

function completionReasonLabel(reason: CompletionReason): string {
  if (reason === "removed") {
    return "已移出队列";
  }

  if (reason === "abandoned") {
    return "已放弃并归档错题";
  }

  if (reason === "revealed") {
    return "已看答案并归档错题";
  }

  return "已完成";
}

function readAutocompleteStatus(
  env: ModelEnv,
  oauthTransport: ModelTextTransport
): AiRuntimeStatus["autocomplete"] {
  try {
    const route = routeAutocompleteModel(env, oauthTransport);
    return {
      configured: true,
      model: route.model,
      format: route.format,
      endpoint: route.endpoint
    };
  } catch (error) {
    return {
      configured: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function readTeachingStatus(env: ModelEnv, oauthTransport: ModelTextTransport): AiRuntimeStatus["teaching"] {
  try {
    const route = routeTeachingModel(env, oauthTransport);
    return {
      configured: true,
      model: route.model,
      format: route.format,
      endpoint: route.endpoint
    };
  } catch (error) {
    return {
      configured: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function readTextIfExists(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }

    throw error;
  }
}

function safeJson(value: unknown): string {
  return JSON.stringify(value)
    .replaceAll("<", "\\u003c")
    .replaceAll(">", "\\u003e")
    .replaceAll("&", "\\u0026");
}
