import { randomBytes } from "node:crypto";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import * as vscode from "vscode";
import type { ProblemDocument, ProblemSample, SupportedLanguage } from "../core/contracts";
import { getWarmupStarterCode, isWarmupProblemKey, type MementoPort } from "../experience";
import { generateStarterTemplate } from "../problems";
import { mapVscodeLanguageId } from "./vscodeAdapters";

const FILE_BINDINGS_MEMENTO_KEY = "algoCoach.fileProblemBindings.v2";
const CUSTOM_SAMPLES_FILENAME = "custom-samples.json";

const EXT_BY_LANGUAGE: Record<SupportedLanguage, string> = {
  python: "py",
  cpp: "cpp",
  c: "c",
  rust: "rs",
  java: "java",
  generic: "txt"
};

export interface ActiveEditorContext {
  problemKey?: string;
  filePath?: string;
  documentUri?: string;
  language: SupportedLanguage;
}

export interface ActiveCodeSnapshot {
  filePath: string;
  documentUri: string;
  language: SupportedLanguage;
  code: string;
  problemKey?: string;
}

export interface WorkspaceFileControllerOptions {
  storageDir: string;
  memento: MementoPort;
  defaultLanguage?: SupportedLanguage;
  resolveProblemKeyByStem?: (stem: string) => string | undefined;
  onActiveContextChanged?: (context: ActiveEditorContext) => void;
}

interface PersistedFileBindings {
  uriToProblemKey: Record<string, string>;
  problemKeyToFilePath: Record<string, string>;
  problemLangToFilePath?: Record<string, string>;
}

export function sanitizeProblemKeyForFile(problemKey: string): string {
  const sanitized = problemKey
    .replace(/:/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized || "solution";
}

function normalizeUriKey(uriOrPath: string): string {
  const trimmed = uriOrPath.trim();
  return process.platform === "win32" ? trimmed.toLowerCase() : trimmed;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function isTrackableCodeDocument(doc: vscode.TextDocument): boolean {
  return doc.uri.scheme === "file" || doc.uri.scheme === "untitled";
}

/**
 * Manages practice starter file creation, `documentUri <-> problemKey` bindings,
 * active editor tracking (fixing v1 active-file drift), and custom sample persistence.
 */
export class WorkspaceFileController implements vscode.Disposable {
  private readonly storageDir: string;
  private readonly customSamplesPath: string;
  private readonly memento: MementoPort;
  private readonly resolveProblemKeyByStem?: (stem: string) => string | undefined;
  private readonly onActiveContextChanged?: (context: ActiveEditorContext) => void;

  private readonly uriToProblemKey = new Map<string, string>();
  private readonly problemKeyToFilePath = new Map<string, string>();
  private readonly problemLangToFilePath = new Map<string, string>();
  private customSamplesByProblem: Record<string, ProblemSample[]> = {};
  private lastCodeEditor: vscode.TextEditor | undefined;
  private lastPreferredLanguage: SupportedLanguage;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(options: WorkspaceFileControllerOptions) {
    this.storageDir = options.storageDir;
    this.customSamplesPath = join(options.storageDir, CUSTOM_SAMPLES_FILENAME);
    this.memento = options.memento;
    this.lastPreferredLanguage = options.defaultLanguage ?? "python";
    this.resolveProblemKeyByStem = options.resolveProblemKeyByStem;
    this.onActiveContextChanged = options.onActiveContextChanged;

    this.restorePersistedBindings();

    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor && isTrackableCodeDocument(activeEditor.document)) {
      const detectedLang = mapVscodeLanguageId(
        activeEditor.document.languageId,
        activeEditor.document.uri.fsPath
      );
      if (detectedLang !== "generic") {
        this.lastCodeEditor = activeEditor;
        this.lastPreferredLanguage = detectedLang;
      }
    }

    this.disposables.push(
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        this.handleActiveEditorChanged(editor);
      }),
      vscode.workspace.onDidCloseTextDocument((doc) => {
        if (this.lastCodeEditor && this.lastCodeEditor.document.uri.toString() === doc.uri.toString()) {
          this.lastCodeEditor = undefined;
        }
      })
    );
  }

  async init(): Promise<void> {
    await this.loadCustomSamples();
  }

  getPracticeBaseDir(): string {
    const firstFolder = vscode.workspace.workspaceFolders?.[0];
    if (firstFolder) {
      return join(firstFolder.uri.fsPath, "practice");
    }
    return join(this.storageDir, "practice");
  }

  getPreferredLanguage(): SupportedLanguage {
    const active = this.getActiveCodeEditor();
    if (active) {
      const lang = mapVscodeLanguageId(active.document.languageId, active.document.uri.fsPath);
      if (lang !== "generic") {
        this.lastPreferredLanguage = lang;
        return lang;
      }
    }
    return this.lastPreferredLanguage;
  }

  bindDocumentToProblem(
    uri: vscode.Uri,
    problemKey: string,
    language?: SupportedLanguage
  ): void {
    const uriKey = normalizeUriKey(uri.toString());
    const pathKey = normalizeUriKey(uri.fsPath);
    this.uriToProblemKey.set(uriKey, problemKey);
    this.uriToProblemKey.set(pathKey, problemKey);
    this.problemKeyToFilePath.set(problemKey, uri.fsPath);
    const resolvedLang =
      language && language !== "generic" ? language : mapVscodeLanguageId("", uri.fsPath);
    if (resolvedLang !== "generic") {
      this.problemLangToFilePath.set(`${problemKey}::${resolvedLang}`, uri.fsPath);
    }
    this.persistBindings();
  }

  getProblemKeyForDocument(doc: Pick<vscode.TextDocument, "uri">): string | undefined {
    const byUri = this.uriToProblemKey.get(normalizeUriKey(doc.uri.toString()));
    if (byUri) {
      return byUri;
    }
    const byPath = this.uriToProblemKey.get(normalizeUriKey(doc.uri.fsPath));
    if (byPath) {
      return byPath;
    }

    // Fallback: infer from practice/<safeKey>.<ext> filename stem
    const stem = basename(doc.uri.fsPath, extname(doc.uri.fsPath));
    if (stem && this.resolveProblemKeyByStem) {
      const matched = this.resolveProblemKeyByStem(stem);
      if (matched) {
        this.bindDocumentToProblem(doc.uri, matched);
        return matched;
      }
    }
    return undefined;
  }

  getFilePathForProblem(problemKey: string, language?: SupportedLanguage): string | undefined {
    if (language && language !== "generic") {
      return this.problemLangToFilePath.get(`${problemKey}::${language}`);
    }
    return this.problemKeyToFilePath.get(problemKey);
  }

  /**
   * Ensures a starter code file exists at `practice/<safeKey>.<ext>` (never overwriting existing code),
   * binds `documentUri <-> problemKey`, and opens it in the editor.
   */
  async openOrCreatePracticeFile(
    problem: ProblemDocument,
    requestedLanguage?: SupportedLanguage
  ): Promise<{ filePath: string; language: SupportedLanguage; created: boolean }> {
    const explicitLang =
      requestedLanguage && requestedLanguage !== "generic" ? requestedLanguage : undefined;
    const existingMapped = this.problemKeyToFilePath.get(problem.problemKey);
    let language: SupportedLanguage;
    let targetPath: string;

    if (!explicitLang && !this.getActiveCodeEditor() && existingMapped && (await fileExists(existingMapped))) {
      const existingLang = mapVscodeLanguageId("", existingMapped);
      language = existingLang !== "generic" ? existingLang : this.getPreferredLanguage();
      targetPath = existingMapped;
    } else {
      language = explicitLang ?? this.getPreferredLanguage();
      const langMapped = this.problemLangToFilePath.get(`${problem.problemKey}::${language}`);
      const ext = EXT_BY_LANGUAGE[language];
      const safeKey = sanitizeProblemKeyForFile(problem.problemKey);
      const defaultPath = join(this.getPracticeBaseDir(), `${safeKey}.${ext}`);

      if (langMapped && (await fileExists(langMapped))) {
        targetPath = langMapped;
      } else if (
        existingMapped &&
        mapVscodeLanguageId("", existingMapped) === language &&
        (await fileExists(existingMapped))
      ) {
        targetPath = existingMapped;
      } else {
        targetPath = defaultPath;
      }
    }

    this.lastPreferredLanguage = language;

    let created = false;
    if (!(await fileExists(targetPath))) {
      const starterContent = this.buildStarterContent(problem, language);
      await mkdir(dirname(targetPath), { recursive: true });
      await writeFile(targetPath, starterContent, "utf8");
      created = true;
    }

    const fileUri = vscode.Uri.file(targetPath);
    this.bindDocumentToProblem(fileUri, problem.problemKey, language);

    const doc = await vscode.workspace.openTextDocument(fileUri);
    const editor = await vscode.window.showTextDocument(doc, {
      preview: false,
      preserveFocus: false
    });
    this.lastCodeEditor = editor;

    const effectiveLanguage = mapVscodeLanguageId(doc.languageId, targetPath);
    if (effectiveLanguage !== "generic") {
      this.lastPreferredLanguage = effectiveLanguage;
    }

    return {
      filePath: targetPath,
      language: effectiveLanguage !== "generic" ? effectiveLanguage : language,
      created
    };
  }

  getActiveCodeEditor(): vscode.TextEditor | undefined {
    const current = vscode.window.activeTextEditor;
    if (
      current &&
      !current.document.isClosed &&
      isTrackableCodeDocument(current.document) &&
      mapVscodeLanguageId(current.document.languageId, current.document.uri.fsPath) !== "generic"
    ) {
      this.lastCodeEditor = current;
      return current;
    }
    if (this.lastCodeEditor && !this.lastCodeEditor.document.isClosed) {
      return this.lastCodeEditor;
    }
    return undefined;
  }

  getActiveCodeSnapshot(): ActiveCodeSnapshot | undefined {
    const editor = this.getActiveCodeEditor();
    if (!editor) {
      return undefined;
    }
    const doc = editor.document;
    const language = mapVscodeLanguageId(doc.languageId, doc.uri.fsPath);
    return {
      filePath: doc.uri.fsPath,
      documentUri: doc.uri.toString(),
      language,
      code: doc.getText(),
      problemKey: this.getProblemKeyForDocument(doc)
    };
  }

  // -------------------------------------------------------------------------
  // Custom Sample Persistence (`<storage>/custom-samples.json`)
  // -------------------------------------------------------------------------

  async loadCustomSamples(): Promise<Record<string, ProblemSample[]>> {
    try {
      const raw = await readFile(this.customSamplesPath, "utf8");
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        this.customSamplesByProblem = {};
        return {};
      }
      const cleaned: Record<string, ProblemSample[]> = {};
      for (const [key, list] of Object.entries(parsed as Record<string, unknown>)) {
        if (!Array.isArray(list)) continue;
        cleaned[key] = list
          .filter(
            (item): item is ProblemSample =>
              Boolean(item) &&
              typeof item === "object" &&
              typeof (item as ProblemSample).id === "string" &&
              typeof (item as ProblemSample).input === "string"
          )
          .map((item) => ({
            id: item.id,
            input: item.input,
            ...(typeof item.expectedOutput === "string"
              ? { expectedOutput: item.expectedOutput }
              : {}),
            ...(typeof item.explanation === "string" ? { explanation: item.explanation } : {}),
            isOriginal: false
          }));
      }
      this.customSamplesByProblem = cleaned;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code !== "ENOENT") {
        this.customSamplesByProblem = {};
      }
    }
    return structuredClone(this.customSamplesByProblem);
  }

  getCustomSamples(problemKey: string): ProblemSample[] {
    const list = this.customSamplesByProblem[problemKey] ?? [];
    return structuredClone(list);
  }

  async addCustomSample(
    problemKey: string,
    input: string,
    expectedOutput: string
  ): Promise<ProblemSample> {
    const normalizedInput = input.replace(/\r\n/g, "\n");
    const normalizedExpected = expectedOutput.replace(/\r\n/g, "\n");
    const sample: ProblemSample = {
      id: `custom-${Date.now()}-${randomBytes(3).toString("hex")}`,
      input: normalizedInput,
      ...(normalizedExpected.trim().length > 0 ? { expectedOutput: normalizedExpected } : {}),
      isOriginal: false
    };

    const current = this.customSamplesByProblem[problemKey] ?? [];
    this.customSamplesByProblem[problemKey] = [...current, sample];
    await this.saveCustomSamples();
    return structuredClone(sample);
  }

  async deleteCustomSample(problemKey: string, sampleId: string): Promise<boolean> {
    const current = this.customSamplesByProblem[problemKey];
    if (!current || current.length === 0) {
      return false;
    }
    const next = current.filter((s) => s.id !== sampleId);
    if (next.length === current.length) {
      return false;
    }
    if (next.length === 0) {
      delete this.customSamplesByProblem[problemKey];
    } else {
      this.customSamplesByProblem[problemKey] = next;
    }
    await this.saveCustomSamples();
    return true;
  }

  /**
   * Returns canonical read-only original samples followed by persisted custom samples,
   * preserving Original Sample Integrity for StylishRankEngine.
   */
  mergeSamplesForProblem(problem: ProblemDocument): ProblemSample[] {
    const originals = problem.samples.filter((s) => s.isOriginal);
    const custom = this.getCustomSamples(problem.problemKey);
    const existingNonOriginals = problem.samples.filter(
      (s) => !s.isOriginal && !custom.some((c) => c.id === s.id)
    );
    return [...originals, ...existingNonOriginals, ...custom];
  }

  private buildStarterContent(problem: ProblemDocument, language: SupportedLanguage): string {
    if (isWarmupProblemKey(problem.problemKey) && language !== "generic") {
      const warmupCode = getWarmupStarterCode(problem.problemKey, language);
      if (warmupCode) {
        return warmupCode;
      }
    }
    return generateStarterTemplate(problem, language).content;
  }

  private handleActiveEditorChanged(editor: vscode.TextEditor | undefined): void {
    if (!editor || !isTrackableCodeDocument(editor.document)) {
      return;
    }
    const language = mapVscodeLanguageId(editor.document.languageId, editor.document.uri.fsPath);
    if (language === "generic") {
      return;
    }
    this.lastCodeEditor = editor;
    this.lastPreferredLanguage = language;
    const problemKey = this.getProblemKeyForDocument(editor.document);
    this.onActiveContextChanged?.({
      problemKey,
      filePath: editor.document.uri.fsPath,
      documentUri: editor.document.uri.toString(),
      language
    });
  }

  private restorePersistedBindings(): void {
    const raw = this.memento.get<PersistedFileBindings>(FILE_BINDINGS_MEMENTO_KEY);
    if (!raw || typeof raw !== "object") {
      return;
    }
    if (raw.uriToProblemKey && typeof raw.uriToProblemKey === "object") {
      for (const [k, v] of Object.entries(raw.uriToProblemKey)) {
        if (typeof v === "string" && v.trim()) {
          this.uriToProblemKey.set(normalizeUriKey(k), v);
        }
      }
    }
    if (raw.problemKeyToFilePath && typeof raw.problemKeyToFilePath === "object") {
      for (const [k, v] of Object.entries(raw.problemKeyToFilePath)) {
        if (typeof v === "string" && v.trim()) {
          this.problemKeyToFilePath.set(k, v);
          const inferredLang = mapVscodeLanguageId("", v);
          if (inferredLang !== "generic") {
            this.problemLangToFilePath.set(`${k}::${inferredLang}`, v);
          }
        }
      }
    }
    if (raw.problemLangToFilePath && typeof raw.problemLangToFilePath === "object") {
      for (const [k, v] of Object.entries(raw.problemLangToFilePath)) {
        if (typeof v === "string" && v.trim()) {
          this.problemLangToFilePath.set(k, v);
        }
      }
    }
  }

  private persistBindings(): void {
    const payload: PersistedFileBindings = {
      uriToProblemKey: Object.fromEntries(this.uriToProblemKey.entries()),
      problemKeyToFilePath: Object.fromEntries(this.problemKeyToFilePath.entries()),
      problemLangToFilePath: Object.fromEntries(this.problemLangToFilePath.entries())
    };
    void this.memento.update(FILE_BINDINGS_MEMENTO_KEY, payload);
  }

  private async saveCustomSamples(): Promise<void> {
    await mkdir(dirname(this.customSamplesPath), { recursive: true });
    const tmpPath = `${this.customSamplesPath}.${process.pid}.${Date.now()}.${randomBytes(4).toString("hex")}.tmp`;
    await writeFile(tmpPath, `${JSON.stringify(this.customSamplesByProblem, null, 2)}\n`, "utf8");
    await rename(tmpPath, this.customSamplesPath);
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }
}
