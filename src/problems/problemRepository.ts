import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  ProblemAdapterError,
  type ProblemDocument,
  type ProblemSearchQuery,
  type ProblemSourceAdapter,
  type ProblemSourceId
} from "../core/contracts";
import { AtCoderAdapter } from "./adapters/atcoderAdapter";
import { CodeforcesAdapter, type CodeforcesStatementMirror } from "./adapters/codeforcesAdapter";
import { createLeetCodeCnAdapter, createLeetCodeGlobalAdapter } from "./adapters/leetcodeAdapter";
import { LuoguAdapter } from "./adapters/luoguAdapter";
import { NowCoderAdapter } from "./adapters/nowcoderAdapter";
import {
  mergeProblemDocuments,
  parseMarkdownProblem,
  type MarkdownProblemParseOptions
} from "./parsers/markdownParser";

export interface ProblemRepositoryOptions {
  /** Directory for persistent local JSON problem cache. If omitted, operates with in-memory cache only. */
  cacheDir?: string;
  /** Custom adapter list; defaults to all 6 built-in OJ adapters. */
  adapters?: ProblemSourceAdapter[];
  /** Custom fetch implementation passed to default built-in adapters. */
  fetchImpl?: typeof fetch;
  /** Per-request HTTP timeout in milliseconds passed to built-in adapters. */
  timeoutMs?: number;
  /** Preferred LeetCode site when resolving ambiguous bare slugs like "two-sum". Defaults to "leetcode-cn". */
  defaultLeetCodeSource?: "leetcode-cn" | "leetcode-global";
  /** Public statement mirror strategy for Codeforces. Defaults to "luogu-public". */
  codeforcesStatementMirror?: CodeforcesStatementMirror;
  /** Optional user-supplied LeetCode CN Cookie header (never stolen). */
  leetCodeCnCookie?: string;
  /** Optional user-supplied LeetCode Global Cookie header (never stolen). */
  leetCodeGlobalCookie?: string;
}

function sanitizeKeyForFile(problemKey: string): string {
  return problemKey.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export class ProblemRepository {
  private readonly adapters = new Map<ProblemSourceId, ProblemSourceAdapter>();
  private readonly memoryCache = new Map<string, ProblemDocument>();
  private readonly cacheDir?: string;
  private readonly defaultLeetCodeSource: "leetcode-cn" | "leetcode-global";

  constructor(options: ProblemRepositoryOptions = {}) {
    this.cacheDir = options.cacheDir;
    this.defaultLeetCodeSource = options.defaultLeetCodeSource ?? "leetcode-cn";

    const initialAdapters = options.adapters ?? [
      createLeetCodeCnAdapter({
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
        cookieHeader: options.leetCodeCnCookie
      }),
      createLeetCodeGlobalAdapter({
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
        cookieHeader: options.leetCodeGlobalCookie
      }),
      new LuoguAdapter({ fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs }),
      new AtCoderAdapter({ fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs }),
      new CodeforcesAdapter({
        fetchImpl: options.fetchImpl,
        timeoutMs: options.timeoutMs,
        statementMirror: options.codeforcesStatementMirror ?? "luogu-public"
      }),
      new NowCoderAdapter({ fetchImpl: options.fetchImpl, timeoutMs: options.timeoutMs })
    ];

    for (const adapter of initialAdapters) {
      this.registerAdapter(adapter);
    }
  }

  registerAdapter(adapter: ProblemSourceAdapter): void {
    this.adapters.set(adapter.id, adapter);
  }

  getAdapter(id: ProblemSourceId): ProblemSourceAdapter | undefined {
    return this.adapters.get(id);
  }

  listAdapters(): ProblemSourceAdapter[] {
    return [...this.adapters.values()];
  }

  resolveInput(
    input: string,
    preferredSource?: ProblemSourceId
  ): { adapter: ProblemSourceAdapter; sourceId: string; canonicalUrl?: string } | null {
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }

    if (preferredSource) {
      const preferred = this.adapters.get(preferredSource);
      if (preferred) {
        const resolved =
          preferred.resolveRef(trimmed) ??
          (preferred.id === "luogu" && /^\d+$/.test(trimmed)
            ? preferred.resolveRef(`luogu:${trimmed}`)
            : null);
        if (resolved) {
          return { adapter: preferred, ...resolved };
        }
      }
    }

    // 1. Exact URL match first (preserves Luogu URLs like `luogu.com.cn/problem/CF1900A`)
    if (/^https?:\/\//i.test(trimmed)) {
      for (const adapter of this.adapters.values()) {
        if (adapter.canHandleUrl(trimmed)) {
          const resolved = adapter.resolveRef(trimmed);
          if (resolved) {
            return { adapter, ...resolved };
          }
        }
      }
      return null;
    }

    // 2. Native OJ patterns before Luogu RemoteJudge aliases (`CF1900A` -> codeforces,
    //    `AT_abc350_c` -> atcoder; explicit `luogu:CF1900A` still falls through to `luogu`)
    const orderedIds: ProblemSourceId[] = [
      "codeforces",
      "atcoder",
      "nowcoder",
      "luogu",
      this.defaultLeetCodeSource,
      this.defaultLeetCodeSource === "leetcode-cn" ? "leetcode-global" : "leetcode-cn"
    ];

    const visited = new Set<ProblemSourceId>();
    for (const id of orderedIds) {
      visited.add(id);
      const adapter = this.adapters.get(id);
      if (!adapter) continue;
      const resolved = adapter.resolveRef(trimmed);
      if (resolved) {
        return { adapter, ...resolved };
      }
    }

    // 3. Any external/custom registered adapters (L4 extension slot)
    for (const adapter of this.adapters.values()) {
      if (visited.has(adapter.id)) continue;
      const resolved = adapter.resolveRef(trimmed);
      if (resolved) {
        return { adapter, ...resolved };
      }
    }

    return null;
  }

  async importProblem(
    input: string,
    opts?: {
      preferredSource?: ProblemSourceId;
      forceRefresh?: boolean;
      signal?: AbortSignal;
    }
  ): Promise<ProblemDocument> {
    const resolved = this.resolveInput(input, opts?.preferredSource);
    if (!resolved) {
      throw new ProblemAdapterError(
        "NOT_FOUND",
        opts?.preferredSource ?? "local-markdown",
        `Could not recognize problem URL or identifier: "${input}". Try a full OJ URL, Luogu PID (P1001), Codeforces ID (CF1900A / 1433G), AtCoder task (abc350c / abc350_c), NowCoder ID (NC14362), LeetCode ID/slug (1 / two-sum), or Markdown import.`
      );
    }

    const expectedKey = this.computeExpectedKey(resolved.adapter.id, resolved.sourceId);
    if (!opts?.forceRefresh && expectedKey) {
      const cached = await this.getCachedProblem(expectedKey);
      if (cached && cached.completeness === "full") {
        return cached;
      }
    }

    const fetched = await resolved.adapter.fetchProblem(input, {
      forceRefresh: opts?.forceRefresh,
      signal: opts?.signal
    });

    // If we already had richer local content (e.g., merged clipboard statement on top of CF metadata), preserve it!
    const existing = await this.getCachedProblem(fetched.problemKey);
    const finalDoc =
      existing && fetched.completeness !== "full" && existing.completeness === "full"
        ? mergeProblemDocuments(fetched, existing)
        : fetched;

    await this.saveProblem(finalDoc);
    return finalDoc;
  }

  async importFromMarkdown(
    markdown: string,
    options?: MarkdownProblemParseOptions
  ): Promise<ProblemDocument> {
    const doc = parseMarkdownProblem(markdown, options);
    await this.saveProblem(doc);
    return doc;
  }

  async ingestFromBridge(bridgeDoc: ProblemDocument): Promise<ProblemDocument> {
    const existing = await this.getCachedProblem(bridgeDoc.problemKey);
    const merged = existing ? mergeProblemDocuments(bridgeDoc, existing) : bridgeDoc;
    await this.saveProblem(merged);
    return merged;
  }

  async mergeClipboardStatement(
    problemKey: string,
    clipboardText: string
  ): Promise<ProblemDocument> {
    const existing = await this.getCachedProblem(problemKey);
    if (!existing) {
      throw new ProblemAdapterError(
        "NOT_FOUND",
        "local-markdown",
        `Cannot merge statement: cached problem "${problemKey}" not found.`
      );
    }
    const merged = mergeProblemDocuments(existing, clipboardText);
    await this.saveProblem(merged);
    return merged;
  }

  async search(
    source: ProblemSourceId,
    query: ProblemSearchQuery,
    signal?: AbortSignal
  ): Promise<{ items: ProblemDocument[]; total?: number }> {
    const adapter = this.adapters.get(source);
    if (!adapter || !adapter.search) {
      throw new ProblemAdapterError(
        "NOT_FOUND",
        source,
        `Problem source "${source}" does not support direct search.`
      );
    }
    return adapter.search(query, signal);
  }

  async fetchProblemList(
    source: ProblemSourceId,
    listId: string,
    signal?: AbortSignal
  ): Promise<{ id: string; title: string; items: ProblemDocument[] }> {
    const adapter = this.adapters.get(source);
    if (!adapter || !adapter.fetchProblemList) {
      throw new ProblemAdapterError(
        "NOT_FOUND",
        source,
        `Problem source "${source}" does not support problem lists.`
      );
    }
    return adapter.fetchProblemList(listId, signal);
  }

  async healthCheckAll(
    signal?: AbortSignal
  ): Promise<
    Array<{
      source: ProblemSourceId;
      displayName: string;
      ok: boolean;
      code?: string;
      message?: string;
    }>
  > {
    const results = await Promise.all(
      this.listAdapters().map(async (adapter) => {
        if (!adapter.healthCheck) {
          return {
            source: adapter.id,
            displayName: adapter.displayName,
            ok: true,
            message: "No active health check implemented."
          };
        }
        const check = await adapter.healthCheck(signal);
        return {
          source: adapter.id,
          displayName: adapter.displayName,
          ...check
        };
      })
    );
    return results;
  }

  async saveProblem(doc: ProblemDocument): Promise<void> {
    this.memoryCache.set(doc.problemKey, doc);
    if (!this.cacheDir) {
      return;
    }
    const problemsDir = join(this.cacheDir, "problems");
    await mkdir(problemsDir, { recursive: true });
    const filePath = join(problemsDir, `${sanitizeKeyForFile(doc.problemKey)}.json`);
    await writeFile(filePath, JSON.stringify(doc, null, 2), "utf8");
  }

  async getCachedProblem(problemKey: string): Promise<ProblemDocument | undefined> {
    const inMem = this.memoryCache.get(problemKey);
    if (inMem) {
      return inMem;
    }
    if (!this.cacheDir) {
      return undefined;
    }
    const filePath = join(this.cacheDir, "problems", `${sanitizeKeyForFile(problemKey)}.json`);
    try {
      const raw = await readFile(filePath, "utf8");
      const parsed = JSON.parse(raw) as ProblemDocument;
      if (parsed && parsed.schemaVersion === "problem-doc/v2" && parsed.problemKey) {
        this.memoryCache.set(parsed.problemKey, parsed);
        return parsed;
      }
    } catch {
      return undefined;
    }
    return undefined;
  }

  async listCachedProblems(): Promise<ProblemDocument[]> {
    if (this.cacheDir) {
      const problemsDir = join(this.cacheDir, "problems");
      try {
        const files = await readdir(problemsDir);
        for (const file of files) {
          if (!file.endsWith(".json")) continue;
          try {
            const raw = await readFile(join(problemsDir, file), "utf8");
            const parsed = JSON.parse(raw) as ProblemDocument;
            if (parsed && parsed.schemaVersion === "problem-doc/v2" && parsed.problemKey) {
              this.memoryCache.set(parsed.problemKey, parsed);
            }
          } catch {
            // Skip corrupted cache entries
          }
        }
      } catch {
        // Directory may not exist yet
      }
    }
    return [...this.memoryCache.values()].sort((a, b) =>
      b.provenance.fetchedAt.localeCompare(a.provenance.fetchedAt)
    );
  }

  async deleteCachedProblem(problemKey: string): Promise<void> {
    this.memoryCache.delete(problemKey);
    if (!this.cacheDir) {
      return;
    }
    const filePath = join(this.cacheDir, "problems", `${sanitizeKeyForFile(problemKey)}.json`);
    try {
      await rm(filePath, { force: true });
    } catch {
      // Ignore if absent
    }
  }

  private computeExpectedKey(source: ProblemSourceId, sourceId: string): string | undefined {
    switch (source) {
      case "leetcode-cn":
        return sourceId === "daily" || sourceId.startsWith("#") ? undefined : `lc-cn:${sourceId}`;
      case "leetcode-global":
        return sourceId === "daily" || sourceId.startsWith("#")
          ? undefined
          : `lc-global:${sourceId}`;
      case "luogu":
        return `luogu:${sourceId}`;
      case "codeforces":
        return `cf:${sourceId}`;
      case "atcoder": {
        const parts = sourceId.split("/");
        const taskId = parts[1] ?? parts[0];
        return taskId ? `atcoder:${taskId}` : undefined;
      }
      case "nowcoder":
        return `nowcoder:${sourceId}`;
      default:
        return `${source}:${sourceId}`;
    }
  }
}
