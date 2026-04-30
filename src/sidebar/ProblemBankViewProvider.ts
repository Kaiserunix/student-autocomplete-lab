import { mkdir, readFile, writeFile } from "node:fs/promises";
import * as path from "node:path";
import * as vscode from "vscode";
import { buildAutocompleteInputFromText, extractStudentCodeFromText } from "../autocomplete/context";
import { requestMimoAutocomplete } from "../autocomplete/mimoAutocomplete";
import {
  applyAiConfigUpdateToEnvText,
  buildAiConfigView,
  loadModelEnv,
  requireMimoAutocompleteConfig,
  requireMimoTeachingConfig,
  type AiConfigView,
  type AiProviderConfigUpdate
} from "../config/modelEnv";
import { fetchLuoguProblem } from "../problemBank/luoguClient";
import { fetchLuoguProblemSet } from "../problemBank/luoguProblemSetClient";
import { searchLuoguProblems, searchLuoguProblemSets } from "../problemBank/luoguSearchClient";
import type { ProblemRecord, ProblemSetRecord } from "../problemBank/types";
import { appendJsonlRecord, readJsonlRecords, writeJsonlRecords } from "../storage/jsonlStore";
import { buildAttemptEvent, summarizeAttemptEvents, type AttemptEvent } from "../teaching/attemptEvent";
import { requestMimoLessonReport } from "../teaching/lessonReport";
import { requestMimoTeachingDiagnosis } from "../teaching/mimoTeacher";
import { requestMimoOptimizationReport, type OptimizationReport } from "../teaching/optimizationReport";
import { requestMimoSolutionScore } from "../teaching/solutionScore";
import { hasSubstantiveStudentCode, normalizeScoreOjVerdict } from "../teaching/solutionScoreGate";
import { applyTeachingDiagnosis, profileSummary, type StudentProfile } from "../teaching/studentProfile";
import { loadStudentProfile, saveStudentProfile } from "../teaching/studentProfileStore";
import { studentSkillFromProfile, studentSkillSummaryForTeaching, type StudentSkill } from "../teaching/studentSkill";
import {
  archiveStudentSkillVersion,
  loadStudentSkill,
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
import { runTeachingCycle, runTeachingCycleWithStudentSkill } from "../teaching/teachingCycle";
import type { OjVerdict } from "../teaching/types";
import { localizeTeachingDiagnosisReport } from "./localizeTeachingReport";
import {
  buildCompletedProblemRecord,
  type CompletedProblemRecord,
  type CompletionReason,
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

type WebviewMessage =
  | { command: "loadProblems" }
  | { command: "importLuogu"; pid: string; language?: string; createFile?: boolean }
  | { command: "importPreset"; presetId: string }
  | { command: "importLuoguProblemSet"; id: string }
  | { command: "searchLuoguProblems"; keyword: string }
  | { command: "searchLuoguProblemSets"; keyword: string }
  | { command: "saveAiConfig"; config: AiProviderConfigUpdate }
  | { command: "saveManual"; title: string; statement: string }
  | {
      command: "requestAiCoach";
      action: AiCoachAction;
      problemKey: string;
      ojVerdict?: OjVerdict;
      responseLanguage?: CoachResponseLanguage;
      studentRequest?: string;
    }
  | { command: "requestSolutionScore"; problemKey: string; ojVerdict?: OjVerdict; studentRequest?: string }
  | { command: "requestOptimizationReview"; problemKey: string; studentRequest?: string }
  | { command: "requestSubmissionJudge"; problemKey: string }
  | { command: "requestAutocompletePreview" }
  | { command: "archiveProblem"; problemKey: string; reason?: CompletionReason }
  | { command: "placeholder"; action: string };

type AiCoachAction = "hint" | "specific" | "giveUp" | "recommend";
type CoachResponseLanguage = "zh" | "raw";

interface SavedProblemRecord extends ProblemRecord {
  savedAt: string;
  sourceSetId?: string;
}

interface StarterPreset {
  id: string;
  title: string;
  subtitle: string;
  problemIds: string[];
  painPoints: string[];
}

interface AiRuntimeStatus {
  envPath: string;
  providerMode?: string;
  autocomplete: {
    configured: boolean;
    model?: string;
    endpoint?: string;
    format?: string;
    error?: string;
  };
  teaching: {
    configured: boolean;
    model?: string;
    endpoint?: string;
    format?: string;
    error?: string;
  };
}

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

  public constructor(private readonly context: vscode.ExtensionContext) {}

  public resolveWebviewView(webviewView: vscode.WebviewView): void {
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

  private async handleMessage(message: WebviewMessage): Promise<Record<string, unknown> | void> {
    if (message.command === "loadProblems") {
      return this.problemBankState();
    }

    if (message.command === "importLuogu") {
      const problem = await fetchLuoguProblem(message.pid.trim());
      await this.saveProblem(problem);
      const teacherPack = await this.tryPrepareTeacherPack(problem);
      const practiceFile = message.createFile
        ? await this.createPracticeFile(problem, normalizePracticeLanguage(message.language))
        : undefined;
      const fileSuffix = practiceFile ? ` 已创建练习文件：${practiceFile.relativePath}` : "";
      const packSuffix = teacherPack ? " 已生成隐藏 Teacher Pack。" : " Teacher Pack 将在首次 AI 分析时尝试生成。";
      return this.problemBankState(makeProblemKey(problem), `已导入 ${problem.id}。${fileSuffix}${packSuffix}`, {
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

    if (message.command === "searchLuoguProblems") {
      const results = await searchLuoguProblems(message.keyword);
      return {
        type: "problemSearchResults",
        keyword: message.keyword,
        total: results.total,
        items: results.items.slice(0, 20)
      };
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

    if (message.command === "saveManual") {
      const problem: ProblemRecord = {
        platform: "manual",
        id: `manual-${Date.now()}`,
        title: message.title.trim() || "未命名题目",
        tags: [],
        statement: message.statement,
        inputFormat: "",
        outputFormat: "",
        samples: []
      };
      await this.saveProblem(problem);
      const teacherPack = await this.tryPrepareTeacherPack(problem);
      const packSuffix = teacherPack ? " 已生成隐藏 Teacher Pack。" : " Teacher Pack 将在首次 AI 分析时尝试生成。";
      return this.problemBankState(makeProblemKey(problem), `已保存粘贴题目。${packSuffix}`, {
        teacherPackReady: Boolean(teacherPack)
      });
    }

    if (message.command === "requestAiCoach") {
      if (message.action === "giveUp") {
        return this.handleLessonReportRequest(message.problemKey, message.studentRequest);
      }

      return this.handleAiCoachRequest(
        message.action,
        message.problemKey,
        message.ojVerdict,
        normalizeCoachResponseLanguage(message.responseLanguage),
        message.studentRequest
      );
    }

    if (message.command === "requestSolutionScore") {
      return this.handleSolutionScoreRequest(message.problemKey, message.ojVerdict, message.studentRequest);
    }

    if (message.command === "requestOptimizationReview") {
      return this.handleOptimizationReviewRequest(message.problemKey, message.studentRequest);
    }

    if (message.command === "requestAutocompletePreview") {
      return this.handleAutocompletePreview();
    }

    if (message.command === "requestSubmissionJudge") {
      return this.handleSubmissionJudgeRequest(message.problemKey);
    }

    if (message.command === "archiveProblem") {
      return this.handleArchiveProblemRequest(message.problemKey, normalizeCompletionReason(message.reason));
    }

    vscode.window.showInformationMessage(`Student Autocomplete: ${message.action} is planned for the next slice.`);
  }

  private problemsPath(): string {
    return path.join(this.context.globalStorageUri.fsPath, "problems.jsonl");
  }

  private profilePath(): string {
    return path.join(this.context.globalStorageUri.fsPath, "studentProfile.json");
  }

  private studentSkillPath(): string {
    return path.join(this.context.globalStorageUri.fsPath, "studentSkill.json");
  }

  private studentSkillVersionsDir(): string {
    return path.join(this.context.globalStorageUri.fsPath, "studentSkillVersions");
  }

  private completedProblemsPath(): string {
    return path.join(this.context.globalStorageUri.fsPath, "completedProblems.jsonl");
  }

  private attemptEventsPath(): string {
    return path.join(this.context.globalStorageUri.fsPath, "attemptEvents.jsonl");
  }

  private teacherPacksPath(): string {
    return path.join(this.context.globalStorageUri.fsPath, "teacherPacks.jsonl");
  }

  private modelEnvPath(): string {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    if (!workspaceFolder) {
      throw new Error("先在 VS Code 打开一个工作区，再使用 AI API。");
    }

    return path.join(workspaceFolder.uri.fsPath, "secrets", "models.env");
  }

  private async problemBankState(
    selectedKey?: string,
    status?: string,
    extra: Record<string, unknown> = {}
  ): Promise<Record<string, unknown>> {
    const problems = await this.loadSavedProblems();
    const completedProblems = await this.loadCompletedProblems();
    return {
      type: "problemBankState",
      problems,
      completedProblems: completedProblems.map((record) => ({
        ...record,
        painSummary: summarizePainSnapshot(record.painSnapshot)
      })),
      aiStatus: await this.aiRuntimeStatus(),
      aiConfig: await this.aiConfigView(),
      selectedKey: selectedKey ?? (problems[0] ? makeProblemKey(problems[0]) : ""),
      status,
      ...extra
    };
  }

  private async handleSaveAiConfigRequest(config: AiProviderConfigUpdate): Promise<Record<string, unknown>> {
    const envPath = this.modelEnvPath();
    const existingText = await readTextIfExists(envPath);
    const nextText = applyAiConfigUpdateToEnvText(existingText, {
      mode: normalizeAiProviderMode(config.mode),
      baseUrl: config.baseUrl?.trim() ?? "",
      apiKey: config.apiKey,
      chatModel: config.chatModel?.trim() ?? "",
      autocompleteModel: config.autocompleteModel?.trim() ?? "",
      autocompleteFormat: normalizeAutocompleteFormat(config.autocompleteFormat)
    });
    await mkdir(path.dirname(envPath), { recursive: true });
    await writeFile(envPath, nextText, "utf8");

    return this.problemBankState(undefined, "AI 配置已保存。API key 留空时已保留旧值。");
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
    await appendJsonlRecord(
      this.attemptEventsPath(),
      buildAttemptEvent({
        problemKey,
        problemId: problem.id,
        platform: problem.platform,
        kind: "archived",
        outcome: reason,
        occurredAt: archivedProblem.completedAt
      })
    );

    const remainingProblems = await this.loadSavedProblems();
    const selectedKey = remainingProblems[0] ? makeProblemKey(remainingProblems[0]) : "";
    const actionText = completionReasonLabel(reason);
    return this.problemBankState(selectedKey, `${actionText} ${problem.id}，已跳过解析并归档当前痛点快照。`, {
      archivedProblem: {
        ...archivedProblem,
        painSummary: summarizePainSnapshot(archivedProblem.painSnapshot)
      }
    });
  }

  private async handleAiCoachRequest(
    action: AiCoachAction,
    problemKey: string,
    ojVerdict?: OjVerdict,
    responseLanguage: CoachResponseLanguage = "zh",
    studentRequest?: string
  ): Promise<Record<string, unknown>> {
    const problem = (await this.loadSavedProblems()).find((item) => makeProblemKey(item) === problemKey);
    if (!problem) {
      throw new Error("先在左侧选择一道题。");
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error("先打开你的代码文件，AI 才能分析当前卡点。");
    }

    const config = requireMimoTeachingConfig(await loadModelEnv(this.modelEnvPath()));
    const profile = await loadStudentProfile(this.profilePath());
    const studentSkill = await this.loadStudentSkillForProfile(profile);
    const teacherPack = await this.ensureTeacherPack(problem, config);
    const occurredAt = new Date().toISOString();
    const context = buildSidebarTeachingContext({
      problem,
      teacherPack: teacherPack ? toTeacherPackReference(teacherPack) : undefined,
      language: editor.document.languageId,
      studentCode: extractStudentCodeFromText(editor.document.getText()),
      profileSummary: profileSummary(profile),
      ojVerdict,
      requestPurpose: mergeRequestPurpose(describeAiCoachAction(action, responseLanguage), studentRequest),
      responseLanguage: responseLanguage === "zh" ? "zh-CN" : "raw"
    });
    const result = await runTeachingCycleWithStudentSkill(
      context,
      profile,
      studentSkill,
      (diagnosisContext) => requestMimoTeachingDiagnosis(config, diagnosisContext),
      {
        occurredAt,
        patchSource: config.model
      }
    );
    await saveStudentProfile(this.profilePath(), result.updatedProfile);
    await saveStudentSkill(this.studentSkillPath(), result.updatedStudentSkill);
    await archiveStudentSkillVersion(
      this.studentSkillVersionsDir(),
      result.updatedStudentSkill,
      `${action} ${problem.id} via ${config.model}`,
      occurredAt
    );
    await appendJsonlRecord(
      this.attemptEventsPath(),
      buildAttemptEvent({
        problemKey,
        problemId: problem.id,
        platform: problem.platform,
        kind: actionToAttemptEventKind(action),
        occurredAt,
        action,
        painPoints: result.report.painPoints.map((painPoint) => painPoint.label),
        model: config.model
      })
    );

    return {
      type: "teachingDiagnosis",
      action,
      problemKey,
      model: config.model,
      report: result.report,
      localizedReport: localizeTeachingDiagnosisReport(result.report),
      profileSummary: profileSummary(result.updatedProfile),
      studentSkillSummary: studentSkillSummaryForTeaching(result.updatedStudentSkill),
      studentSkillMerge: result.studentSkillMerge,
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
    const config = requireMimoTeachingConfig(await loadModelEnv(this.modelEnvPath()));
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
    await appendJsonlRecord(
      this.attemptEventsPath(),
      buildAttemptEvent({
        problemKey,
        problemId: problem.id,
        platform: problem.platform,
        kind: "lesson_reported",
        outcome: report.archiveReason,
        occurredAt,
        painPoints: report.painPoints.map((painPoint) => painPoint.label),
        model: config.model
      })
    );

    const remainingProblems = await this.loadSavedProblems();
    const selectedKey = remainingProblems[0] ? makeProblemKey(remainingProblems[0]) : "";
    return this.problemBankState(selectedKey, `AI 已生成 ${problem.id} 的讲解/补救报告，并归档为错题。`, {
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
    studentRequest?: string
  ): Promise<Record<string, unknown>> {
    const problem = (await this.loadSavedProblems()).find((item) => makeProblemKey(item) === problemKey);
    if (!problem) {
      throw new Error("先在左侧选择一道题。");
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error("先打开你的代码文件，AI 才能做 AC 后学习评分。");
    }

    const occurredAt = new Date().toISOString();
    const config = requireMimoTeachingConfig(await loadModelEnv(this.modelEnvPath()));
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
      requestPurpose: mergeRequestPurpose("学生点击「我 AC 了 / 评分」：请区分 OJ AC 与学习评分。", studentRequest),
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

    const shouldArchive = safeOjVerdict.status === "AC";
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
    }

    await appendJsonlRecord(
      this.attemptEventsPath(),
      buildAttemptEvent({
        problemKey,
        problemId: problem.id,
        platform: problem.platform,
        kind: "solution_scored",
        outcome: report.ojResult === "AC" ? "ac" : "active",
        ojStatus: report.ojResult,
        learningScore: report.learningScore,
        occurredAt,
        painPoints: report.painPoints.map((painPoint) => painPoint.label),
        model: config.model
      })
    );

    const remainingProblems = await this.loadSavedProblems();
    const selectedKey = shouldArchive && remainingProblems[0] ? makeProblemKey(remainingProblems[0]) : problemKey;
    return this.problemBankState(selectedKey, `AI 已完成 ${problem.id} 的学习评分。`, {
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
    });
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
    const config = requireMimoTeachingConfig(await loadModelEnv(this.modelEnvPath()));
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
    await appendJsonlRecord(
      this.attemptEventsPath(),
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
      })
    );

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

    const config = requireMimoAutocompleteConfig(await loadModelEnv(this.modelEnvPath()));
    const position = editor.selection.active;
    const input = buildAutocompleteInputFromText({
      text: editor.document.getText(),
      offset: editor.document.offsetAt(position),
      language: editor.document.languageId,
      filePath: editor.document.uri.fsPath
    });
    const suggestion = await requestMimoAutocomplete(config, {
      ...input,
      habits: ["Prefer direct student code.", "Return only the immediate local continuation."]
    });

    return {
      type: "autocompletePreview",
      model: config.model,
      suggestion,
      language: editor.document.languageId,
      filePath: editor.document.uri.fsPath,
      line: position.line + 1,
      status: suggestion.trim()
        ? "AI 已生成一次补全预览。"
        : "AI 补全接口已调用，但这次返回为空。换到有上下文的代码行再试。"
    };
  }

  private async handleSubmissionJudgeRequest(problemKey: string): Promise<Record<string, unknown>> {
    const problem = (await this.loadSavedProblems()).find((item) => makeProblemKey(item) === problemKey);
    if (!problem) {
      throw new Error("先选择一道题，再做交题自检。");
    }

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      throw new Error("先打开你的代码文件，再做交题自检。");
    }

    const config = requireMimoTeachingConfig(await loadModelEnv(this.modelEnvPath()));
    const profile = await loadStudentProfile(this.profilePath());
    const teachingContext = buildSidebarTeachingContext({
      problem,
      language: editor.document.languageId,
      studentCode: extractStudentCodeFromText(editor.document.getText()),
      profileSummary: profileSummary(profile),
      requestPurpose: "交题前 AI 自检：保守判断当前代码可能 AC、WA、RE、TLE，或者需要先运行样例。",
      responseLanguage: "zh-CN"
    });
    const report = await requestMimoSubmissionJudge(config, {
      problem: teachingContext.problem,
      language: teachingContext.language,
      studentCode: teachingContext.studentCode,
      studentProfile: teachingContext.studentProfile
    });

    return {
      type: "submissionJudge",
      model: config.model,
      problemKey,
      report,
      status: `AI 已完成 ${problem.id} 的交题前自检。`
    };
  }

  private async aiRuntimeStatus(): Promise<AiRuntimeStatus> {
    let envPath: string;
    try {
      envPath = this.modelEnvPath();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        envPath: "",
        autocomplete: { configured: false, error: message },
        teaching: { configured: false, error: message }
      };
    }

    try {
      const env = await loadModelEnv(envPath);
      return {
        envPath,
        providerMode: buildAiConfigView(env).mode,
        autocomplete: readAutocompleteStatus(env),
        teaching: readTeachingStatus(env)
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        envPath,
        providerMode: "openai-compatible",
        autocomplete: { configured: false, error: message },
        teaching: { configured: false, error: message }
      };
    }
  }

  private async aiConfigView(): Promise<AiConfigView> {
    try {
      return buildAiConfigView(await loadModelEnv(this.modelEnvPath()));
    } catch {
      return buildAiConfigView({});
    }
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

  private async tryPrepareTeacherPack(problem: ProblemRecord): Promise<TeacherPackRecord | undefined> {
    try {
      const config = requireMimoTeachingConfig(await loadModelEnv(this.modelEnvPath()));
      return this.ensureTeacherPack(problem, config);
    } catch {
      return undefined;
    }
  }

  private async ensureTeacherPack(
    problem: ProblemRecord,
    config: ReturnType<typeof requireMimoTeachingConfig>
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
      nextByKey.set(makeProblemKey(problem), problem);
    }

    await writeJsonlRecords(this.problemsPath(), [...nextByKey.values()]);
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
    const storagePath = path.join(this.context.globalStorageUri.fsPath, "problemSets.jsonl");
    await appendJsonlRecord(storagePath, {
      ...problemSet,
      savedAt: new Date().toISOString()
    });
  }

  private renderHtml(webview: vscode.Webview): string {
    const nonce = String(Date.now());
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
      --accent: var(--vscode-textLink-foreground);
      --good: var(--vscode-testing-iconPassed, #4aa564);
      --warn: var(--vscode-editorWarning-foreground, #d7a542);
    }

    * {
      box-sizing: border-box;
    }

    body {
      color: var(--vscode-foreground);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      margin: 0;
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
      min-height: 28px;
      padding: 4px 9px;
    }

    button:hover {
      background: var(--vscode-button-hoverBackground);
    }

    button.secondary {
      background: var(--vscode-button-secondaryBackground);
      color: var(--vscode-button-secondaryForeground);
    }

    button.secondary:hover {
      background: var(--vscode-button-secondaryHoverBackground);
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
      gap: 10px;
      padding: 10px;
    }

    .pageTabs {
      background: color-mix(in srgb, var(--vscode-sideBar-background) 86%, var(--vscode-editor-foreground) 14%);
      border: 1px solid var(--line);
      border-radius: 8px;
      display: grid;
      gap: 4px;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      padding: 4px;
    }

    .tabButton {
      background: transparent;
      border-color: transparent;
      color: var(--vscode-descriptionForeground);
      min-height: 30px;
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
      justify-content: space-between;
      padding: 8px 9px;
    }

    summary {
      cursor: pointer;
      font-weight: 700;
    }

    .panelBody {
      display: grid;
      gap: 8px;
      padding: 9px;
    }

    .coachPanel {
      border-color: color-mix(in srgb, var(--accent) 46%, var(--line));
    }

    .coachProblem {
      background: color-mix(in srgb, var(--vscode-editor-background) 82%, transparent);
      border: 1px solid var(--line);
      border-radius: 8px;
      display: grid;
      gap: 5px;
      line-height: 1.45;
      padding: 9px;
    }

    .coachActions {
      display: grid;
      gap: 7px;
      grid-template-columns: 1fr 1fr;
    }

    .coachActions button:first-child {
      grid-column: 1 / -1;
    }

    .coachOptions {
      display: grid;
      gap: 7px;
      grid-template-columns: 1fr 1fr;
    }

    .coachQuestion {
      min-height: 76px;
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
    }

    .aiStatusItem {
      border-left: 3px solid var(--line);
      display: grid;
      gap: 2px;
      line-height: 1.35;
      padding-left: 7px;
    }

    .aiStatusItem.ready {
      border-left-color: var(--good);
    }

    .aiResponse {
      background: color-mix(in srgb, var(--vscode-editor-background) 84%, transparent);
      border: 1px solid color-mix(in srgb, var(--accent) 46%, var(--line));
      border-radius: 8px;
      display: grid;
      gap: 10px;
      line-height: 1.5;
      min-height: 86px;
      padding: 10px;
    }

    .aiResponseTitle {
      color: var(--accent);
      font-size: 13px;
      font-weight: 700;
    }

    .responseSectionTitle {
      color: var(--vscode-foreground);
      font-weight: 700;
    }

    .resultBlock {
      background: color-mix(in srgb, var(--accent) 10%, var(--vscode-editor-background));
      border: 1px solid color-mix(in srgb, var(--accent) 42%, var(--line));
      border-radius: 7px;
      display: grid;
      gap: 5px;
      padding: 8px;
    }

    .problemList {
      display: grid;
      gap: 6px;
      max-height: 260px;
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

    .textBlock {
      background: color-mix(in srgb, var(--vscode-editor-background) 80%, transparent);
      border: 1px solid var(--line);
      border-radius: 8px;
      line-height: 1.55;
      max-height: 280px;
      overflow: auto;
      padding: 9px;
      white-space: pre-wrap;
      word-break: break-word;
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
  </style>
</head>
<body>
  <main class="app">
    <header class="topbar">
      <div class="title">
        <h1>AI 做题陪练</h1>
        <span class="mini">AI / 补全 / 痛点</span>
      </div>
      <p id="status" class="status">正在加载已导入题目...</p>
      <div id="stats" class="stats"></div>
    </header>

    <nav class="pageTabs" aria-label="主界面">
      <button id="tabProblem" class="tabButton active" type="button">题目张贴</button>
      <button id="tabAi" class="tabButton" type="button">AI 交互</button>
      <button id="tabSearch" class="tabButton" type="button">题目寻找</button>
    </nav>

    <section id="problemPage" class="page">
      <section id="problemDetail" class="panel detail">
        <p class="empty">导入或粘贴一道题后，这里显示题面、样例和题目来源。</p>
      </section>

      <section class="panel">
        <div class="panelHeader">
          <h2>练习队列</h2>
          <span id="problemCount" class="mini">0 题</span>
        </div>
        <div class="panelBody">
          <input id="localFilter" placeholder="筛选题号、标题、标签">
        </div>
        <div id="problemList" class="problemList"></div>
      </section>

      <section class="panel">
        <div class="panelHeader">
          <h2>已归档</h2>
          <span id="completedCount" class="mini">0 题</span>
        </div>
        <div id="completedList" class="problemList"></div>
      </section>

      <details class="panel" open>
        <summary>粘贴题目</summary>
        <div class="panelBody">
          <div class="field">
            <label for="manualTitle">题目标题</label>
            <input id="manualTitle" placeholder="题目标题">
          </div>
          <div class="field">
            <label for="manualStatement">题面</label>
            <textarea id="manualStatement" placeholder="把题面粘贴到这里"></textarea>
          </div>
          <button id="saveManual">保存粘贴题目</button>
        </div>
      </details>
    </section>

    <section id="aiPage" class="page" hidden>
      <section class="panel coachPanel">
        <div class="panelHeader">
          <h2>核心交互</h2>
          <span id="aiProvider" class="mini">正在检测 API</span>
        </div>
        <div class="panelBody">
          <div id="coachSelection" class="coachProblem"></div>
          <details class="aiConfigBox">
            <summary>AI 配置</summary>
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
                <div class="field">
                  <label for="aiAutocompleteFormat">补全协议</label>
                  <select id="aiAutocompleteFormat">
                    <option value="openai-completions">Completions</option>
                    <option value="openai-chat">Chat Completions</option>
                    <option value="anthropic-messages">Messages</option>
                  </select>
                </div>
                <div class="field wide">
                  <label for="aiBaseUrl">Base URL</label>
                  <input id="aiBaseUrl" placeholder="https://token-plan-cn.xiaomimimo.com/v1">
                </div>
                <div class="field wide">
                  <label for="aiApiKey">API Key</label>
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
                <button id="saveAiConfig" class="secondary">保存 AI 配置</button>
                <span id="aiConfigSavedKey" class="mini">未检测</span>
              </div>
            </div>
          </details>
          <div class="field">
            <label for="coachQuestion">问 AI</label>
            <textarea id="coachQuestion" class="coachQuestion" placeholder="可选：描述你卡在哪里、OJ 返回了什么、想让它重点看哪里。"></textarea>
          </div>
          <div class="coachOptions">
            <div class="field">
              <label for="practiceLanguage">建文件语言</label>
              <select id="practiceLanguage"></select>
            </div>
          <div class="field">
            <label for="coachResponseLanguage">AI 输出</label>
            <select id="coachResponseLanguage">
              <option value="zh" selected>中文优先</option>
              <option value="raw">保留原文</option>
            </select>
          </div>
          <div class="field">
            <label for="coachOjVerdict">OJ 结果</label>
            <select id="coachOjVerdict">
              <option value="UNKNOWN" selected>未提交 / 不确定</option>
              <option value="AC">确实 AC</option>
              <option value="WA">WA</option>
              <option value="RE">RE</option>
              <option value="TLE">TLE</option>
              <option value="MLE">MLE</option>
            </select>
          </div>
        </div>
        <div class="coachActions">
            <button id="coachHint">给点提示</button>
            <button id="coachSpecific" class="secondary">再具体点</button>
            <button id="coachGiveUp" class="secondary">我放弃了</button>
            <button id="coachRecommend" class="secondary">推荐下一题</button>
            <button id="coachSolved" class="secondary">学习评分</button>
            <button id="coachCompleted" class="secondary">我已完成</button>
            <button id="coachSubmitCheck" class="secondary">交题自检</button>
            <button id="coachAutocomplete" class="secondary">测试补全</button>
          </div>
          <div id="aiStatusGrid" class="aiStatusGrid"></div>
          <div id="aiResponse" class="aiResponse">
            <span class="aiResponseTitle">等待 AI 交互</span>
            <span class="hint">选择题目，打开你的代码文件，然后点“给点提示”。题面只会进入提示分析，不会塞进自动补全提示词。</span>
          </div>
        </div>
      </section>
    </section>

    <section id="searchPage" class="page" hidden>
      <details class="panel" open>
        <summary>题号导入 / 搜索</summary>
        <div class="panelBody">
          <div class="field">
            <label for="luoguPid">洛谷题号</label>
            <div class="row">
              <input id="luoguPid" placeholder="例如 P5730 / 5730 / B2002，不是题单 ID">
              <button id="importPid">下载并建文件</button>
            </div>
          </div>
          <div class="field">
            <label for="luoguSearchKeyword">搜索洛谷</label>
            <input id="luoguSearchKeyword" placeholder="压缩技术 / 二叉树 / 动态规划">
          </div>
          <div class="actions">
            <button id="searchProblems" class="secondary">搜题目</button>
            <button id="searchProblemSets" class="secondary">搜题单</button>
          </div>
          <div id="searchResults" class="searchResults"></div>
        </div>
      </details>

      <details class="panel">
        <summary>辅助：初始路线</summary>
        <div class="panelBody">
          <p class="hint">新学生建议先导入诊断题；已经确定要从基础题单开始，可以直接跳过诊断。</p>
          <div id="starterPresets" class="presetGrid"></div>
        </div>
      </details>

      <details class="panel">
        <summary>导入题单</summary>
        <div class="panelBody">
          <div class="field">
            <label for="luoguProblemSetId">洛谷题单 ID</label>
            <div class="row">
              <input id="luoguProblemSetId" placeholder="例如 100">
              <button id="importProblemSet">导入题单</button>
            </div>
          </div>
        </div>
      </details>
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
      aiStatus: undefined,
      aiConfig: undefined,
      activePage: "problem",
      practiceLanguage: "python",
      responseLanguage: "zh",
      ojVerdict: "UNKNOWN"
    };

    const status = document.getElementById("status");
    const stats = document.getElementById("stats");
    const tabProblem = document.getElementById("tabProblem");
    const tabAi = document.getElementById("tabAi");
    const tabSearch = document.getElementById("tabSearch");
    const problemPage = document.getElementById("problemPage");
    const aiPage = document.getElementById("aiPage");
    const searchPage = document.getElementById("searchPage");
    const problemCount = document.getElementById("problemCount");
    const problemList = document.getElementById("problemList");
    const completedCount = document.getElementById("completedCount");
    const completedList = document.getElementById("completedList");
    const problemDetail = document.getElementById("problemDetail");
    const searchResults = document.getElementById("searchResults");
    const aiProvider = document.getElementById("aiProvider");
    const coachSelection = document.getElementById("coachSelection");
    const aiStatusGrid = document.getElementById("aiStatusGrid");
    const aiResponse = document.getElementById("aiResponse");
    const coachQuestion = document.getElementById("coachQuestion");
    const practiceLanguage = document.getElementById("practiceLanguage");
    const coachResponseLanguage = document.getElementById("coachResponseLanguage");
    const coachOjVerdict = document.getElementById("coachOjVerdict");
    const aiConfigMode = document.getElementById("aiConfigMode");
    const aiAutocompleteFormat = document.getElementById("aiAutocompleteFormat");
    const aiBaseUrl = document.getElementById("aiBaseUrl");
    const aiApiKey = document.getElementById("aiApiKey");
    const aiChatModel = document.getElementById("aiChatModel");
    const aiAutocompleteModel = document.getElementById("aiAutocompleteModel");
    const aiConfigSavedKey = document.getElementById("aiConfigSavedKey");

    tabProblem.addEventListener("click", () => switchPage("problem"));
    tabAi.addEventListener("click", () => switchPage("ai"));
    tabSearch.addEventListener("click", () => switchPage("search"));

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
    document.getElementById("saveAiConfig").addEventListener("click", () => saveAiConfig());

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

    document.getElementById("saveManual").addEventListener("click", () => {
      vscode.postMessage({
        command: "saveManual",
        title: document.getElementById("manualTitle").value,
        statement: document.getElementById("manualStatement").value
      });
      setStatus("正在保存粘贴题目...");
    });

    document.getElementById("searchProblems").addEventListener("click", () => {
      const keyword = getKeyword();
      if (!keyword) {
        setStatus("先输入搜索关键词。", "error");
        return;
      }
      setStatus("正在搜索洛谷题目...");
      vscode.postMessage({ command: "searchLuoguProblems", keyword });
    });

    document.getElementById("searchProblemSets").addEventListener("click", () => {
      const keyword = getKeyword();
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

    document.getElementById("coachHint").addEventListener("click", () => requestAiCoach("hint"));
    document.getElementById("coachSpecific").addEventListener("click", () => requestAiCoach("specific"));
    document.getElementById("coachGiveUp").addEventListener("click", () => requestAiCoach("giveUp"));
    document.getElementById("coachRecommend").addEventListener("click", () => requestAiCoach("recommend"));
    document.getElementById("coachSolved").addEventListener("click", () => requestSolutionScore());
    document.getElementById("coachCompleted").addEventListener("click", () => requestArchiveProblem("completed"));
    document.getElementById("coachSubmitCheck").addEventListener("click", () => requestSubmissionJudge());
    document.getElementById("coachAutocomplete").addEventListener("click", () => requestAutocompletePreview());

    window.addEventListener("message", (event) => {
      const data = event.data;
      if (data.type === "status") {
        setStatus(data.text, data.tone);
        if (data.tone === "error") {
          renderAiError(data.text);
        }
      }
      if (data.type === "problemBankState") {
        state.problems = data.problems ?? [];
        state.completedProblems = data.completedProblems ?? [];
        state.selectedKey = data.selectedKey || state.selectedKey;
        state.aiStatus = data.aiStatus;
        state.aiConfig = data.aiConfig;
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
      if (data.type === "problemSearchResults") {
        renderProblemResults(data);
      }
      if (data.type === "problemSetSearchResults") {
        renderProblemSetResults(data);
      }
      if (data.type === "teachingDiagnosis") {
        setStatus(data.status || "AI 已返回分析。");
        switchPage("ai");
        renderAiDiagnosis(data);
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
    });

    renderStarterPresets();
    switchPage("problem");
    vscode.postMessage({ command: "loadProblems" });

    function getKeyword() {
      return document.getElementById("luoguSearchKeyword").value.trim();
    }

    function switchPage(page) {
      state.activePage = page;
      const isProblem = page === "problem";
      const isAi = page === "ai";
      const isSearch = page === "search";
      problemPage.hidden = !isProblem;
      aiPage.hidden = !isAi;
      searchPage.hidden = !isSearch;
      tabProblem.className = "tabButton" + (isProblem ? " active" : "");
      tabAi.className = "tabButton" + (isAi ? " active" : "");
      tabSearch.className = "tabButton" + (isSearch ? " active" : "");
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
      renderStats();
      renderAiConfig();
      renderCoach();
      renderProblemList();
      renderCompletedList();
      renderDetail();
    }

    function renderAiConfig() {
      const config = state.aiConfig;
      if (!config) {
        return;
      }

      aiConfigMode.value = config.mode || "openai-compatible";
      aiBaseUrl.value = config.baseUrl || "";
      aiChatModel.value = config.chatModel || "";
      aiAutocompleteModel.value = config.autocompleteModel || "";
      aiAutocompleteFormat.value = config.autocompleteFormat || "openai-completions";
      aiApiKey.value = "";
      aiApiKey.placeholder = config.hasApiKey ? "已保存，留空不修改" : "输入 API Key";
      aiConfigSavedKey.textContent = config.hasApiKey ? "API Key：已保存" : "API Key：未保存";
      updateAiConfigModeUi(false);
    }

    function updateAiConfigModeUi(applyDefaults) {
      const mode = aiConfigMode.value;
      if (mode === "openai") {
        aiAutocompleteFormat.value = "openai-chat";
        aiAutocompleteFormat.disabled = true;
        aiBaseUrl.placeholder = "https://api.openai.com/v1";
        if (applyDefaults && !aiBaseUrl.value.trim()) {
          aiBaseUrl.value = "https://api.openai.com/v1";
        }
      } else if (mode === "anthropic-native") {
        aiAutocompleteFormat.value = "anthropic-messages";
        aiAutocompleteFormat.disabled = true;
        aiBaseUrl.placeholder = "https://api.anthropic.com/v1";
        if (applyDefaults && !aiBaseUrl.value.trim()) {
          aiBaseUrl.value = "https://api.anthropic.com/v1";
        }
      } else {
        aiAutocompleteFormat.disabled = false;
        aiBaseUrl.placeholder = "https://token-plan-cn.xiaomimimo.com/v1";
      }
    }

    function saveAiConfig() {
      const mode = aiConfigMode.value || "openai-compatible";
      const format = mode === "openai"
        ? "openai-chat"
        : mode === "anthropic-native"
          ? "anthropic-messages"
          : aiAutocompleteFormat.value || "openai-completions";
      setStatus("正在保存 AI 配置...");
      vscode.postMessage({
        command: "saveAiConfig",
        config: {
          mode,
          baseUrl: aiBaseUrl.value.trim(),
          apiKey: aiApiKey.value.trim(),
          chatModel: aiChatModel.value.trim(),
          autocompleteModel: aiAutocompleteModel.value.trim(),
          autocompleteFormat: format
        }
      });
    }

    function renderCoach() {
      const problem = selectedProblem();
      renderAiStatus();
      coachSelection.innerHTML = "";

      if (!problem) {
        coachSelection.appendChild(textSpan("还没有选择题目", "aiResponseTitle"));
        coachSelection.appendChild(textSpan("先导入初始诊断或输入洛谷题号；AI 提示会读取当前编辑器代码和当前选中题面。", "hint"));
        return;
      }

      coachSelection.appendChild(textSpan(problem.id + " · " + problem.title, "aiResponseTitle"));
      const line = [
        problem.statement ? "完整题面已就绪" : "题单摘要，点“下载完整题面”后提示更准",
        "补全不读题面",
        "提示才读题面和代码"
      ].join(" · ");
      coachSelection.appendChild(textSpan(line, "mini"));
    }

    function renderAiStatus() {
      aiStatusGrid.innerHTML = "";
      const statusData = state.aiStatus;
      if (!statusData) {
        aiProvider.textContent = "正在检测 API";
        return;
      }

      const teaching = statusData.teaching || {};
      aiProvider.textContent = teaching.configured
        ? providerModeLabel(statusData.providerMode) + " " + teaching.model
        : "AI 未配置";
      [
        {
          label: "自动补全",
          data: statusData.autocomplete,
          readyText: "编辑器 Ghost Text，触发 " + endpointText(statusData.autocomplete)
        },
        {
          label: "AI 提示",
          data: statusData.teaching,
          readyText: "侧栏按钮，触发 " + endpointText(statusData.teaching)
        },
        {
          label: "配置文件",
          data: { configured: Boolean(statusData.envPath) },
          readyText: statusData.envPath || "未找到工作区"
        }
      ].forEach((item) => {
        const row = document.createElement("div");
        row.className = "aiStatusItem" + (item.data?.configured ? " ready" : "");
        row.appendChild(textSpan(item.label + (item.data?.configured ? "：可用" : "：不可用"), "mini"));
        row.appendChild(textSpan(item.data?.configured ? item.readyText : item.data?.error || "未配置", "hint"));
        aiStatusGrid.appendChild(row);
      });
    }

    function requestAiCoach(action) {
      const problem = selectedProblem();
      if (!problem) {
        setStatus("先选择或导入一道题。", "error");
        return;
      }

      setStatus("正在调用 AI 分析当前代码...");
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("AI 正在分析", "aiResponseTitle"));
      aiResponse.appendChild(textSpan("会读取当前 VS Code 活动编辑器的代码、当前题面和本地痛点记录。", "hint"));
      vscode.postMessage({
        command: "requestAiCoach",
        action,
        problemKey: keyOf(problem),
        studentRequest: coachQuestion.value.trim(),
        responseLanguage: state.responseLanguage,
        ojVerdict: {
          status: "UNKNOWN"
        }
      });
    }

    function requestSolutionScore() {
      const problem = selectedProblem();
      if (!problem) {
        setStatus("先选择或导入一道题。", "error");
        return;
      }

      setStatus("正在调用 AI 做学习评分...");
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("AI 正在评分", "aiResponseTitle"));
      aiResponse.appendChild(textSpan("OJ 结果来自你在下拉框里的选择；默认未提交/不确定，不会假装 AC。", "hint"));
      vscode.postMessage({
        command: "requestSolutionScore",
        problemKey: keyOf(problem),
        studentRequest: coachQuestion.value.trim(),
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
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("优化复盘中", "aiResponseTitle"));
      aiResponse.appendChild(
        textSpan(
          (problem ? problem.id + " · " + problem.title + " · " : "") +
            "会读取当前编辑器代码，并允许结论是“无需优化”。",
          "hint"
        )
      );
      vscode.postMessage({
        command: "requestOptimizationReview",
        problemKey,
        studentRequest: coachQuestion.value.trim()
      });
    }

    function requestAutocompletePreview() {
      setStatus("正在调用 AI 补全接口...");
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("AI 补全测试中", "aiResponseTitle"));
      aiResponse.appendChild(textSpan("这会读取当前编辑器光标之前的代码，并把结果直接显示在这里。", "hint"));
      vscode.postMessage({ command: "requestAutocompletePreview" });
    }

    function requestSubmissionJudge() {
      const problem = selectedProblem();
      if (!problem) {
        setStatus("先选择或导入一道题。", "error");
        return;
      }

      setStatus("正在做交题前 AI 自检...");
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("AI 正在自检", "aiResponseTitle"));
      aiResponse.appendChild(textSpan("这不是真正提交到 OJ；它会保守检查当前代码的输入、边界、格式和复杂度风险。", "hint"));
      vscode.postMessage({
        command: "requestSubmissionJudge",
        problemKey: keyOf(problem)
      });
    }

    function requestArchiveProblem(reason) {
      const problem = selectedProblem();
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

    function renderAiDiagnosis(data) {
      const report = data.report || {};
      const localized = data.localizedReport || {};
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("AI 分析 · " + (data.model || "unknown model"), "aiResponseTitle"));
      if (localized.rawHint || report.hint) {
        aiResponse.appendChild(responseBlock(localized.hintTitle || "下一步提示", localized.rawHint || report.hint));
      }
      const painPoints = localized.painPoints || report.painPoints || [];
      if (painPoints.length) {
        aiResponse.appendChild(textSpan(localized.painTitle || "痛点判断", "responseSectionTitle"));
        const row = document.createElement("div");
        row.className = "tagRow";
        painPoints.forEach((painPoint) => {
          row.appendChild(textSpan((painPoint.displayLabel || painPoint.label) + " " + Math.round((painPoint.confidence || 0) * 100) + "%", "tag"));
        });
        aiResponse.appendChild(row);
        painPoints.slice(0, 2).forEach((painPoint) => {
          aiResponse.appendChild(textSpan((localized.evidenceTitle || "证据") + "：" + painPoint.evidence, "mini"));
        });
      }
      if (report.skillUpdate) {
        aiResponse.appendChild(textSpan((localized.skillTitle || "Skill 候选") + "：" + report.skillUpdate.candidate + "；" + report.skillUpdate.reason, "mini"));
      }
      if (report.recommendation?.problemId) {
        aiResponse.appendChild(textSpan((localized.recommendationTitle || "推荐下一题") + "：" + report.recommendation.problemId + "；" + report.recommendation.reason, "mini"));
      }
      if (data.profileSummary?.painPointCounts) {
        const counts = Object.entries(data.profileSummary.painPointCounts)
          .slice(0, 4)
          .map(([label, count]) => label + "×" + count)
          .join(" · ");
        if (counts) {
          aiResponse.appendChild(textSpan("本地痛点记录：" + counts, "mini"));
        }
      }
    }

    function renderAutocompletePreview(data) {
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("AI 补全预览 · " + (data.model || "unknown model"), "aiResponseTitle"));
      aiResponse.appendChild(
        textSpan((data.filePath || "当前文件") + ":" + (data.line || "?") + " · " + (data.language || "code"), "mini")
      );
      if (data.suggestion) {
        const block = responseBlock("将会补上的代码", "");
        const pre = codeBlock(data.suggestion);
        pre.className = "codePreview";
        block.appendChild(pre);
        aiResponse.appendChild(block);
      } else {
        aiResponse.appendChild(responseBlock("没有生成内容", "接口被调用了，但模型返回空。把光标放在函数体、循环体或半行代码后再试。"));
      }
    }

    function renderSubmissionJudge(data) {
      const report = data.report || {};
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("交题前自检 · " + (data.model || "unknown model"), "aiResponseTitle"));
      aiResponse.appendChild(responseBlock(verdictLabel(report.verdict), report.summary || "没有摘要。"));
      aiResponse.appendChild(textSpan("置信度：" + Math.round((report.confidence || 0) * 100) + "%", "mini"));

      if (report.issues?.length) {
        aiResponse.appendChild(textSpan("主要风险", "responseSectionTitle"));
        report.issues.forEach((issue) => {
          aiResponse.appendChild(
            responseBlock(
              severityLabel(issue.severity) + " · " + (issue.label || "unknown"),
              (issue.evidence || "") + (issue.fixHint ? "\\n提示：" + issue.fixHint : "")
            )
          );
        });
      }

      if (report.testSuggestions?.length) {
        aiResponse.appendChild(textSpan("建议先跑的小测试", "responseSectionTitle"));
        report.testSuggestions.forEach((item) => {
          const block = responseBlock(item.reason || "测试建议", "");
          block.appendChild(codeBlock(item.input || ""));
          block.appendChild(textSpan(item.expectedBehavior || "", "hint"));
          aiResponse.appendChild(block);
        });
      }

      if (report.nextAction) {
        aiResponse.appendChild(responseBlock("下一步", report.nextAction));
      }
    }

    function renderLessonReport(data) {
      const report = data.report || {};
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("讲解/补救报告 · " + (data.model || "unknown model"), "aiResponseTitle"));
      aiResponse.appendChild(textSpan((data.problem?.id || "") + " · " + (data.problem?.title || ""), "mini"));
      aiResponse.appendChild(responseBlock("标准思路", report.standardApproach || "暂无标准思路。"));

      if (report.painPoints?.length) {
        aiResponse.appendChild(textSpan("你的卡点", "responseSectionTitle"));
        report.painPoints.slice(0, 2).forEach((painPoint) => {
          aiResponse.appendChild(
            responseBlock(
              painPoint.label + " " + Math.round((painPoint.confidence || 0) * 100) + "%",
              painPoint.evidence || ""
            )
          );
        });
      }

      if (report.minimalFixPath?.length) {
        aiResponse.appendChild(responseBlock("最小修正路径", report.minimalFixPath.map((item, index) => (index + 1) + ". " + item).join("\\n")));
      }

      if (report.remedialExercise) {
        const exercise = report.remedialExercise;
        aiResponse.appendChild(
          responseBlock(
            "补救小练习" + (exercise.problemId ? " · " + exercise.problemId : ""),
            [exercise.title, exercise.prompt, exercise.reason].filter(Boolean).join("\\n")
          )
        );
      }

      if (report.referenceSolution?.code) {
        const details = document.createElement("details");
        details.className = "resultBlock";
        const summary = document.createElement("summary");
        summary.textContent = "展开参考实现";
        details.appendChild(summary);
        details.appendChild(codeBlock(report.referenceSolution.code));
        aiResponse.appendChild(details);
      }
    }

    function renderSolutionScore(data) {
      const report = data.report || {};
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("学习评分 · " + (data.model || "unknown model"), "aiResponseTitle"));
      aiResponse.appendChild(textSpan((data.problem?.id || "") + " · " + (data.problem?.title || ""), "mini"));
      aiResponse.appendChild(responseBlock("OJ 结果 / 学习分", (report.ojResult || "UNKNOWN") + " · " + (report.learningScore ?? "?") + " / 100"));
      aiResponse.appendChild(responseBlock("结论", report.summary || "暂无结论。"));

      if (report.rubric) {
        const rubric = report.rubric;
        aiResponse.appendChild(
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
        aiResponse.appendChild(
          responseBlock(
            "复杂度评价 · " + (complexity.verdict || "unknown"),
            ["你的解法：" + complexity.observed, "预期方向：" + complexity.expected, complexity.reason].filter(Boolean).join("\\n")
          )
        );
      }

      if (report.painPoints?.length) {
        aiResponse.appendChild(textSpan("仍需补的点", "responseSectionTitle"));
        report.painPoints.slice(0, 2).forEach((painPoint) => {
          aiResponse.appendChild(responseBlock(painPoint.label, painPoint.evidence || ""));
        });
      }

      if (report.nextAction) {
        aiResponse.appendChild(responseBlock("下一步", report.nextAction));
      }
      if (report.recommendation?.problemId) {
        aiResponse.appendChild(responseBlock("推荐题目", report.recommendation.problemId + "\\n" + report.recommendation.reason));
      }
    }

    function renderOptimizationReport(data) {
      const report = data?.report || {};
      aiResponse.innerHTML = "";
      aiResponse.appendChild(textSpan("优化复盘 · " + (data?.model || "unknown model"), "aiResponseTitle"));
      aiResponse.appendChild(textSpan((data?.problem?.id || "") + " · " + (data?.problem?.title || ""), "mini"));
      aiResponse.appendChild(
        responseBlock("是否值得优化", report.optimizationNeeded ? "需要优化" : "无需优化")
      );
      aiResponse.appendChild(responseBlock("结论", report.summary || "暂无结论。"));

      if (report.timeComplexity) {
        aiResponse.appendChild(responseBlock("时间复杂度", optimizationDimensionText(report.timeComplexity)));
      }
      if (report.memory) {
        aiResponse.appendChild(responseBlock("内存", optimizationDimensionText(report.memory)));
      }
      if (report.codeQuality) {
        aiResponse.appendChild(
          responseBlock(
            "代码质量 · " + (report.codeQuality.verdict === "needs_cleanup" ? "需要整理" : "可以保持"),
            report.codeQuality.action || ""
          )
        );
      }
      if (report.nextStep) {
        aiResponse.appendChild(responseBlock("下一步", report.nextStep));
      }
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
        block.appendChild(textSpan(bodyText, "hint"));
      }
      return block;
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

    function endpointText(item) {
      if (!item?.configured) {
        return "未配置";
      }
      return item.model + " · " + (item.format || "unknown") + " · " + item.endpoint;
    }

    function providerModeLabel(mode) {
      if (mode === "openai") {
        return "OpenAI";
      }
      if (mode === "anthropic-native") {
        return "Anthropic";
      }
      return "OpenAI兼容";
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

    function renderStats() {
      const luoguCount = state.problems.filter((problem) => problem.platform === "luogu").length;
      const manualCount = state.problems.filter((problem) => problem.platform === "manual").length;
      problemCount.textContent = state.problems.length + " 题";
      completedCount.textContent = state.completedProblems.length + " 题";
      stats.innerHTML = "";
      [
        "已导入 " + state.problems.length,
        "完成 " + state.completedProblems.length,
        "洛谷 " + luoguCount,
        "手动 " + manualCount
      ].forEach((label) => {
        const pill = document.createElement("span");
        pill.className = "pill";
        pill.textContent = label;
        stats.appendChild(pill);
      });
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

      if (!state.selectedKey || !state.problems.some((problem) => keyOf(problem) === state.selectedKey)) {
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
        item.className = "problemItem";

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
        item.appendChild(textSpan("痛点快照：" + (problem.painSummary || summarizePainSnapshot(problem.painSnapshot)), "mini"));
        if (problem.optimizationReport) {
          item.appendChild(
            textSpan(
              "最近优化复盘：" + (problem.optimizationReport.optimizationNeeded ? "需要优化" : "无需优化"),
              "mini"
            )
          );
        }
        const actions = document.createElement("div");
        actions.className = "row";
        const optimizeButton = document.createElement("button");
        optimizeButton.className = "secondary";
        optimizeButton.type = "button";
        optimizeButton.textContent = "优化复盘";
        optimizeButton.addEventListener("click", () => requestOptimizationReview(keyOf(problem)));
        actions.appendChild(optimizeButton);
        item.appendChild(actions);
        completedList.appendChild(item);
      });
    }

    function renderDetail() {
      const problem = state.problems.find((item) => keyOf(item) === state.selectedKey);
      problemDetail.innerHTML = "";

      if (!problem) {
        const empty = document.createElement("p");
        empty.className = "empty";
        empty.textContent = "导入一道题后，这里显示题面、样例和题目来源。";
        problemDetail.appendChild(empty);
        return;
      }

      const header = document.createElement("div");
      header.className = "detailTitle";
      header.appendChild(textSpan(problem.id + " · " + problem.title, "problemTitle"));

      const meta = document.createElement("div");
      meta.className = "tagRow";
      meta.appendChild(textSpan(platformLabel(problem.platform), "tag"));
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
        appendSection("题面", problem.statement || "暂无题面。");
      }

      if (problem.inputFormat) {
        appendSection("输入格式", problem.inputFormat);
      }
      if (problem.outputFormat) {
        appendSection("输出格式", problem.outputFormat);
      }
      if (problem.samples?.length) {
        const title = document.createElement("h2");
        title.textContent = "样例";
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

      const actions = document.createElement("div");
      actions.className = "actions";
      [
        ["给点提示", "hint"],
        ["再具体点", "specific"],
        ["我放弃了", "giveUp"],
        ["推荐下一题", "recommend"]
      ].forEach(([label, action]) => {
        const button = document.createElement("button");
        button.className = "secondary";
        button.textContent = label;
        button.addEventListener("click", () => {
          requestAiCoach(action);
        });
        actions.appendChild(button);
      });
      const scoreButton = document.createElement("button");
      scoreButton.className = "secondary";
      scoreButton.textContent = "学习评分";
      scoreButton.addEventListener("click", () => {
        requestSolutionScore();
      });
      actions.appendChild(scoreButton);
      [
        ["我已完成", "completed"],
        ["移出队列", "removed"]
      ].forEach(([label, reason]) => {
        const button = document.createElement("button");
        button.className = "secondary";
        button.textContent = label;
        button.addEventListener("click", () => {
          requestArchiveProblem(reason);
        });
        actions.appendChild(button);
      });
      problemDetail.appendChild(actions);
    }

    function appendSection(titleText, bodyText) {
      const title = document.createElement("h2");
      title.textContent = titleText;
      const block = document.createElement("div");
      block.className = "textBlock";
      block.textContent = bodyText;
      problemDetail.appendChild(title);
      problemDetail.appendChild(block);
    }

    function renderProblemResults(data) {
      setStatus("找到 " + data.total + " 道题目，显示前 " + data.items.length + " 条。");
      renderSearchItems(data.items, (item) => ({
        id: item.id,
        title: item.title,
        detail: item.tags?.slice(0, 4).join(" · ") || "洛谷题目",
        button: "下载并建文件",
        onClick: () => importLuogu(item.id, true)
      }));
    }

    function renderProblemSetResults(data) {
      setStatus("找到 " + data.total + " 个题单，显示前 " + data.items.length + " 条。");
      renderSearchItems(data.items, (item) => ({
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

    function renderSearchItems(items, toViewModel) {
      searchResults.innerHTML = "";
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
        searchResults.appendChild(row);
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

    function selectedProblem() {
      return state.problems.find((item) => keyOf(item) === state.selectedKey);
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

    function textSpan(text, className) {
      const span = document.createElement("span");
      span.className = className;
      span.textContent = text;
      return span;
    }

    function codeBlock(text) {
      const pre = document.createElement("pre");
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
      return "手动";
    }
  </script>
</body>
</html>`;
  }
}

function makeProblemKey(problem: Pick<ProblemRecord, "platform" | "id">): string {
  return `${problem.platform}:${problem.id}`;
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
  const languageInstruction = responseLanguage === "zh" ? "输出语言：简体中文。" : "输出语言：保留模型原文。";

  if (action === "specific") {
    return `学生点击「再具体点」：请更直接地指出当前代码最可能的卡点，但仍不要粘完整 AC 代码。${languageInstruction}`;
  }

  if (action === "giveUp") {
    return `学生点击「我放弃了」：先给标准思路轮廓，再指出学生代码痛点和下一次要练的技能，不要生成完整可提交代码。${languageInstruction}`;
  }

  if (action === "recommend") {
    return `学生点击「推荐下一题」：重点根据历史痛点和当前代码推荐下一道题。${languageInstruction}`;
  }

  return `学生点击「给点提示」：只给一个能推动当前卡点的短提示。${languageInstruction}`;
}

function normalizePracticeLanguage(value: string | undefined): PracticeLanguage {
  return practiceLanguageOptions.some((option) => option.id === value) ? (value as PracticeLanguage) : "python";
}

function normalizeCoachResponseLanguage(value: string | undefined): CoachResponseLanguage {
  return value === "raw" ? "raw" : "zh";
}

function normalizeAiProviderMode(value: string | undefined): AiProviderConfigUpdate["mode"] {
  if (value === "openai" || value === "anthropic-native") {
    return value;
  }

  return "openai-compatible";
}

function normalizeAutocompleteFormat(value: string | undefined): AiProviderConfigUpdate["autocompleteFormat"] {
  if (value === "openai-chat" || value === "anthropic-messages" || value === "openai-completions") {
    return value;
  }

  return "openai-completions";
}

function normalizeCompletionReason(value: string | undefined): CompletionReason {
  if (value === "removed" || value === "abandoned" || value === "revealed") {
    return value;
  }

  return "completed";
}

function actionToAttemptEventKind(action: AiCoachAction): "hint_requested" | "specific_hint_requested" | "recommendation_requested" {
  if (action === "specific") {
    return "specific_hint_requested";
  }

  if (action === "recommend") {
    return "recommendation_requested";
  }

  return "hint_requested";
}

function mergeRequestPurpose(basePurpose: string, studentRequest: string | undefined): string {
  const trimmedRequest = studentRequest?.trim();
  if (!trimmedRequest) {
    return basePurpose;
  }

  return `${basePurpose}\n学生额外输入：${trimmedRequest}`;
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

function readAutocompleteStatus(env: Awaited<ReturnType<typeof loadModelEnv>>): AiRuntimeStatus["autocomplete"] {
  try {
    const config = requireMimoAutocompleteConfig(env);
    return {
      configured: true,
      model: config.model,
      format: config.format,
      endpoint: providerEndpoint(config.baseUrl, config.format === "anthropic-messages" ? "messages" : config.format === "openai-chat" ? "chat" : "completions")
    };
  } catch (error) {
    return {
      configured: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function readTeachingStatus(env: Awaited<ReturnType<typeof loadModelEnv>>): AiRuntimeStatus["teaching"] {
  try {
    const config = requireMimoTeachingConfig(env);
    return {
      configured: true,
      model: config.model,
      format: config.format,
      endpoint: providerEndpoint(config.baseUrl, config.format === "anthropic-messages" ? "messages" : "chat")
    };
  } catch (error) {
    return {
      configured: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function providerEndpoint(baseUrl: string, kind: "completions" | "chat" | "messages"): string {
  const root = baseUrl.replace(/\/+$/, "");
  if (kind === "messages") {
    return `${root}/messages`;
  }
  if (kind === "chat") {
    return `${root}/chat/completions`;
  }
  return `${root}/completions`;
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
