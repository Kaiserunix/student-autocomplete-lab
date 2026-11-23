import {
  ProblemAdapterError,
  type AdapterCapabilities,
  type ProblemDocument,
  type ProblemSample,
  type ProblemSearchQuery,
  type ProblemSourceAdapter
} from "../../core/contracts";
import { decodeHtmlEntities, htmlToMarkdown, normalizeRefInput, stripHtmlTags } from "./htmlUtils";
import {
  DEFAULT_HTTP_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  fetchWithTimeout,
  isAntiBotChallenge,
  mapHttpStatusError
} from "./httpClient";

export interface AtCoderAdapterOptions {
  fetchImpl?: typeof fetch;
  userAgent?: string;
  indexTtlMs?: number;
  timeoutMs?: number;
}

interface KenkooooProblem {
  id: string;
  contest_id: string;
  problem_index?: string;
  name?: string;
  title?: string;
}

interface KenkooooProblemModel {
  difficulty?: number;
  is_experimental?: boolean;
}

const KENKOOOO_PROBLEMS_URL = "https://kenkoooo.com/atcoder/resources/problems.json";
const KENKOOOO_MODELS_URL = "https://kenkoooo.com/atcoder/resources/problem-models.json";
const ATCODER_GUIDANCE =
  "Please use Competitive Companion (Localhost Bridge) or Markdown/Clipboard import.";

export function atcoderDifficultyToTier(rating?: number): 1 | 2 | 3 | 4 | 5 | undefined {
  if (rating === undefined || !Number.isFinite(rating)) {
    return undefined;
  }
  if (rating < 600) return 1;
  if (rating < 1100) return 2;
  if (rating < 1600) return 3;
  if (rating < 2100) return 4;
  return 5;
}

function extractBalancedElementById(html: string, id: string): string | undefined {
  const openRe = new RegExp(`<div\\b[^>]*\\bid=["']${id}["'][^>]*>`, "i");
  const openMatch = openRe.exec(html);
  if (!openMatch) {
    return undefined;
  }
  const start = openMatch.index + openMatch[0].length;
  const tagRe = /<\/?div\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html)) !== null) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        return html.slice(start, match.index);
      }
    } else {
      depth += 1;
    }
  }
  return html.slice(start);
}

function extractBalancedSpanByClass(html: string, className: string): string | undefined {
  const openRe = new RegExp(
    `<span\\b[^>]*\\bclass=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`,
    "i"
  );
  const openMatch = openRe.exec(html);
  if (!openMatch) {
    return undefined;
  }
  const start = openMatch.index + openMatch[0].length;
  const tagRe = /<\/?span\b[^>]*>/gi;
  tagRe.lastIndex = start;
  let depth = 1;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(html)) !== null) {
    if (match[0].startsWith("</")) {
      depth -= 1;
      if (depth === 0) {
        return html.slice(start, match.index);
      }
    } else {
      depth += 1;
    }
  }
  return html.slice(start);
}

export interface ParsedAtCoderTaskHtml {
  title: string;
  locale: "en-US" | "ja-JP";
  statementMarkdown: string;
  samples: ProblemSample[];
  constraints?: { timeLimitMs?: number; memoryLimitMb?: number };
}

export function parseAtCoderTaskHtml(
  html: string,
  fallbackTitle: string,
  options?: { preferLang?: "en" | "ja" }
): ParsedAtCoderTaskHtml {
  const hasJaChars = (txt: string): boolean => /[\u3040-\u30ff\u4e00-\u9fff]/.test(txt);

  const titleMatch =
    html.match(/<span\b[^>]*class=["'][^"']*\bh2\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) ??
    html.match(/<title>([\s\S]*?)<\/title>/i);
  const rawTitle = titleMatch?.[1] ? stripHtmlTags(titleMatch[1]).replace(/\s+/g, " ").trim() : "";
  const title = rawTitle.replace(/\s*Editorial\s*$/i, "").trim() || fallbackTitle;

  const timeMatch = html.match(/Time Limit:\s*([\d.]+)\s*(?:sec|s)/i);
  const memMatch = html.match(/Memory Limit:\s*(\d+)\s*(?:MB|MiB)/i);
  const timeLimitMs = timeMatch?.[1] ? Math.round(Number.parseFloat(timeMatch[1]) * 1000) : undefined;
  const memoryLimitMb = memMatch?.[1] ? Number.parseInt(memMatch[1], 10) : undefined;

  const statementContainer = extractBalancedElementById(html, "task-statement");
  if (!statementContainer) {
    return {
      title,
      locale: hasJaChars(title) ? "ja-JP" : "en-US",
      statementMarkdown: "",
      samples: [],
      ...(timeLimitMs !== undefined || memoryLimitMb !== undefined
        ? {
            constraints: {
              ...(timeLimitMs !== undefined ? { timeLimitMs } : {}),
              ...(memoryLimitMb !== undefined ? { memoryLimitMb } : {})
            }
          }
        : {})
    };
  }

  const enSection = extractBalancedSpanByClass(statementContainer, "lang-en");
  const jaSection = extractBalancedSpanByClass(statementContainer, "lang-ja");
  const chosenHtml =
    options?.preferLang === "ja"
      ? (jaSection ?? enSection ?? statementContainer)
      : (enSection ?? jaSection ?? statementContainer);

  let locale: "en-US" | "ja-JP";
  if (chosenHtml === jaSection) {
    locale = "ja-JP";
  } else if (chosenHtml === enSection) {
    locale = "en-US";
  } else {
    locale = hasJaChars(`${title}\n${stripHtmlTags(chosenHtml)}`) ? "ja-JP" : "en-US";
  }

  // Extract Sample Input N / Sample Output N pairs supporting both modern <section><h3><pre>
  // and legacy <div class="part"><h3></h3><section><pre></pre></section></div> layouts.
  const sampleInputs = new Map<string, string>();
  const sampleOutputs = new Map<string, string>();
  const headingMatches: Array<{ heading: string; start: number; end: number }> = [];
  const h3Re = /<h3[^>]*>([\s\S]*?)<\/h3>/gi;
  let h3Match: RegExpExecArray | null;
  while ((h3Match = h3Re.exec(chosenHtml)) !== null) {
    headingMatches.push({
      heading: stripHtmlTags(h3Match[1] ?? "").trim(),
      start: h3Match.index,
      end: h3Match.index + h3Match[0].length
    });
  }

  for (let i = 0; i < headingMatches.length; i += 1) {
    const current = headingMatches[i]!;
    const inMatch = current.heading.match(/^(?:Sample Input|入力例)\s*(\d+)/i);
    const outMatch = current.heading.match(/^(?:Sample Output|出力例)\s*(\d+)/i);
    if (!inMatch?.[1] && !outMatch?.[1]) {
      continue;
    }

    const sliceEnd = headingMatches[i + 1]?.start ?? chosenHtml.length;
    const slice = chosenHtml.slice(current.end, sliceEnd);
    const preMatch = slice.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i);
    if (!preMatch?.[1]) {
      continue;
    }

    const preValue = decodeHtmlEntities(
      preMatch[1].replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")
    )
      .replace(/\r\n/g, "\n")
      .replace(/^\n+|\n+$/g, "");

    if (inMatch?.[1]) {
      sampleInputs.set(inMatch[1], preValue);
    } else if (outMatch?.[1]) {
      sampleOutputs.set(outMatch[1], preValue);
    }
  }

  const sampleNums = [...new Set([...sampleInputs.keys(), ...sampleOutputs.keys()])].sort(
    (a, b) => Number(a) - Number(b)
  );
  const samples: ProblemSample[] = [];
  for (const num of sampleNums) {
    const input = sampleInputs.get(num);
    if (input === undefined) {
      continue;
    }
    const expectedOutput = sampleOutputs.get(num);
    samples.push({
      id: `sample-${num}`,
      input,
      ...(expectedOutput !== undefined ? { expectedOutput } : {}),
      isOriginal: true
    });
  }

  const statementMarkdown = htmlToMarkdown(chosenHtml);

  return {
    title,
    locale,
    statementMarkdown,
    samples,
    ...(timeLimitMs !== undefined || memoryLimitMb !== undefined
      ? {
          constraints: {
            ...(timeLimitMs !== undefined ? { timeLimitMs } : {}),
            ...(memoryLimitMb !== undefined ? { memoryLimitMb } : {})
          }
        }
      : {})
  };
}

export class AtCoderAdapter implements ProblemSourceAdapter {
  readonly id = "atcoder" as const;
  readonly displayName = "AtCoder";
  readonly capabilities: AdapterCapabilities = {
    search: true,
    problemLists: false,
    directStatementFetch: true,
    directSamplesFetch: true,
    ioModes: ["stdio"],
    supportsOptionalUserSession: false
  };

  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  private readonly indexTtlMs: number;
  private readonly timeoutMs: number;
  private cachedProblems: KenkooooProblem[] | null = null;
  private cachedModels: Record<string, KenkooooProblemModel> | null = null;
  private cachedProblemsAt = 0;
  private cachedModelsAt = 0;

  constructor(options: AtCoderAdapterOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.indexTtlMs = options.indexTtlMs ?? 30 * 60 * 1000;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
  }

  canHandleUrl(url: string): boolean {
    try {
      const parsed = new URL(normalizeRefInput(url));
      if (parsed.hostname.toLowerCase() !== "atcoder.jp") {
        return false;
      }
      return /^\/contests\/[a-z0-9_-]+\/tasks\/[a-z0-9_-]+(?:\/.*)?$/i.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  resolveRef(input: string): { sourceId: string; canonicalUrl?: string } | null {
    const trimmed = normalizeRefInput(input);
    if (!trimmed) {
      return null;
    }

    if (/^https?:\/\//i.test(trimmed)) {
      if (!this.canHandleUrl(trimmed)) {
        return null;
      }
      const parsed = new URL(trimmed);
      const match = parsed.pathname.match(/^\/contests\/([a-z0-9_-]+)\/tasks\/([a-z0-9_-]+)/i);
      if (!match?.[1] || !match?.[2]) {
        return null;
      }
      const contestId = match[1].toLowerCase();
      const taskId = match[2].toLowerCase();
      return {
        sourceId: `${contestId}/${taskId}`,
        canonicalUrl: `https://atcoder.jp/contests/${contestId}/tasks/${taskId}`
      };
    }

    const prefixed = trimmed.match(/^(?:atcoder|at)\s*:\s*(.+)$/i);
    if (prefixed?.[1]) {
      const body = prefixed[1].trim();
      const slashPair = body.match(/^([a-z0-9_-]+)\/([a-z0-9_-]+)$/i);
      if (slashPair?.[1] && slashPair?.[2]) {
        const contestId = slashPair[1].toLowerCase();
        const taskId = slashPair[2].toLowerCase();
        return {
          sourceId: `${contestId}/${taskId}`,
          canonicalUrl: `https://atcoder.jp/contests/${contestId}/tasks/${taskId}`
        };
      }
      return this.resolveTaskToken(body, true);
    }

    // Luogu-style AtCoder prefix, e.g. `AT_abc350_c`, `AT_practice2_a`
    const atUnderscore = trimmed.match(/^AT_([a-z0-9_ -]+)$/i);
    if (atUnderscore?.[1]) {
      return this.resolveTaskToken(atUnderscore[1], true);
    }

    return this.resolveTaskToken(trimmed, false);
  }

  private resolveTaskToken(
    token: string,
    explicitPrefix: boolean
  ): { sourceId: string; canonicalUrl?: string } | null {
    const inferred = this.inferContestAndTask(token);
    if (inferred) {
      return {
        sourceId: `${inferred.contestId}/${inferred.taskId}`,
        canonicalUrl: `https://atcoder.jp/contests/${inferred.contestId}/tasks/${inferred.taskId}`
      };
    }

    const lower = normalizeRefInput(token).toLowerCase();
    // If Kenkoooo index is already cached in memory, resolve exact contest_id immediately
    if (this.cachedProblems) {
      const hit = this.cachedProblems.find((p) => p.id.toLowerCase() === lower);
      if (hit) {
        return {
          sourceId: `${hit.contest_id}/${hit.id}`,
          canonicalUrl: `https://atcoder.jp/contests/${hit.contest_id}/tasks/${hit.id}`
        };
      }
    }

    // Non-standard task IDs like `practice2_a`, `tessoku_book_a`, `panasonic2020_a`, `joi2024yo1a_a`
    // -> defer exact `contest_id` lookup to lazy Kenkoooo `problems.json` in `fetchProblem()`
    if (
      /^[a-z][a-z0-9_-]*_[a-z0-9]{1,3}$/.test(lower) ||
      (explicitPrefix && /^[a-z0-9][a-z0-9_-]*$/.test(lower))
    ) {
      return { sourceId: lower };
    }

    return null;
  }

  private inferContestAndTask(token: string): { contestId: string; taskId: string } | null {
    const lower = normalizeRefInput(token).toLowerCase();

    // Standard task screen names like abc300_a, abc 350 a, ABC350 A, edpc_a -> dp/dp_a, abc233_ex -> abc233_h
    const withSep = lower.match(
      /^((?:abc|arc|agc|ahc)\s*\d{1,4}|typical90|dp|edpc|tdpc)(?:\s+|[_/-])(ex|[a-z0-9]+)$/
    );
    if (withSep?.[1] && withSep?.[2]) {
      const rawContest = withSep[1].replace(/\s+/g, "").replace(/_/g, "-");
      const contestId = rawContest === "edpc" ? "dp" : rawContest;
      const suffix =
        withSep[2] === "ex" && /^(?:abc|arc|agc|ahc)\d+$/.test(contestId) ? "h" : withSep[2];
      const taskId = `${contestId}_${suffix}`;
      return { contestId, taskId };
    }

    // No-underscore shorthand: `abc350c`, `ABC350C`, `abc 350c`, `abc233ex` -> `abc233_h`
    const compact = lower.match(/^((?:abc|arc|agc|ahc)\s*\d{1,4})\s*(ex|[a-h])$/);
    if (compact?.[1] && compact?.[2]) {
      const contestId = compact[1].replace(/\s+/g, "");
      const suffix = compact[2] === "ex" ? "h" : compact[2];
      const taskId = `${contestId}_${suffix}`;
      return { contestId, taskId };
    }

    return null;
  }

  private findKenkooooTaskEntry(
    problems: KenkooooProblem[],
    contestId: string,
    taskId: string
  ): KenkooooProblem | undefined {
    const lowerTask = taskId.toLowerCase();
    const exact = problems.find((p) => p.id.toLowerCase() === lowerTask);
    if (exact) {
      return exact;
    }

    const lowerContest = contestId.toLowerCase();
    const prefix = `${lowerContest}_`;
    const inferredSuffix = lowerTask.startsWith(prefix) ? lowerTask.slice(prefix.length) : "";
    if (!inferredSuffix) {
      return undefined;
    }

    return problems.find((p) => {
      if (p.contest_id.toLowerCase() !== lowerContest) {
        return false;
      }
      const pIdx = p.problem_index?.trim().toLowerCase();
      if (pIdx && (pIdx === inferredSuffix || (inferredSuffix === "h" && pIdx === "ex"))) {
        return true;
      }
      const pTitle = (p.title ?? p.name ?? "").trim().toLowerCase();
      return pTitle.startsWith(`${inferredSuffix} `) || pTitle.startsWith(`${inferredSuffix}.`);
    });
  }

  private extractPreferLang(ref: string): "en" | "ja" | undefined {
    const normalized = normalizeRefInput(ref);
    if (!/^https?:\/\//i.test(normalized)) {
      return undefined;
    }
    try {
      const lang = new URL(normalized).searchParams.get("lang")?.trim().toLowerCase();
      if (lang === "ja" || lang === "ja-jp") return "ja";
      if (lang === "en" || lang === "en-us") return "en";
    } catch {
      return undefined;
    }
    return undefined;
  }

  async fetchProblem(
    ref: string,
    opts?: { forceRefresh?: boolean; signal?: AbortSignal }
  ): Promise<ProblemDocument> {
    const resolved = this.resolveRef(ref);
    if (!resolved) {
      throw new ProblemAdapterError(
        "NOT_FOUND",
        "atcoder",
        `Invalid AtCoder reference: "${ref}". Expected e.g. abc350_c, abc350c, practice2_a, or https://atcoder.jp/contests/abc350/tasks/abc350_c.`
      );
    }

    let contestId: string;
    let taskId: string;
    if (resolved.sourceId.includes("/")) {
      const parts = resolved.sourceId.split("/");
      contestId = parts[0] ?? "";
      taskId = parts[1] ?? "";
      if (this.cachedProblems && contestId && taskId) {
        const hit = this.findKenkooooTaskEntry(this.cachedProblems, contestId, taskId);
        if (hit) {
          contestId = hit.contest_id;
          taskId = hit.id;
        }
      }
    } else {
      // Lazy Kenkoooo problems.json lookup for non-standard task IDs (e.g. practice2_a, tessoku_book_a)
      const problems = await this.loadProblems(opts?.signal);
      const entry = problems.find((p) => p.id.toLowerCase() === resolved.sourceId.toLowerCase());
      if (!entry) {
        throw new ProblemAdapterError(
          "NOT_FOUND",
          "atcoder",
          `AtCoder task "${resolved.sourceId}" was not found in the Kenkoooo problem index.`
        );
      }
      contestId = entry.contest_id;
      taskId = entry.id;
    }

    if (!contestId || !taskId) {
      throw new ProblemAdapterError("NOT_FOUND", "atcoder", `Malformed AtCoder task ref: "${ref}".`);
    }

    const fetchTaskHtml = async (cId: string, tId: string): Promise<{ url: string; response: Response }> => {
      const taskUrl = `https://atcoder.jp/contests/${encodeURIComponent(cId)}/tasks/${encodeURIComponent(tId)}`;
      try {
        const res = await fetchWithTimeout(
          this.fetchImpl,
          taskUrl,
          {
            headers: {
              "user-agent": this.userAgent,
              accept: "text/html,application/xhtml+xml"
            },
            signal: opts?.signal
          },
          this.timeoutMs
        );
        return { url: taskUrl, response: res };
      } catch (error) {
        throw new ProblemAdapterError(
          "NETWORK_ERROR",
          "atcoder",
          `Network error fetching AtCoder task ${tId}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    };

    let { url, response } = await fetchTaskHtml(contestId, taskId);

    // Legacy/shared tasks (e.g. abc042c -> arc058_a) return 404 for inferred ID; fall back to Kenkoooo problems.json
    if (response.status === 404) {
      try {
        const problems = await this.loadProblems(opts?.signal);
        const fallbackEntry = this.findKenkooooTaskEntry(problems, contestId, taskId);
        if (
          fallbackEntry &&
          (fallbackEntry.contest_id !== contestId || fallbackEntry.id !== taskId)
        ) {
          contestId = fallbackEntry.contest_id;
          taskId = fallbackEntry.id;
          ({ url, response } = await fetchTaskHtml(contestId, taskId));
        }
      } catch {
        // Keep original 404 response if Kenkoooo index is unavailable
      }
    }

    if (!response.ok) {
      throw mapHttpStatusError("atcoder", response.status, url, ATCODER_GUIDANCE);
    }

    const html = await response.text();
    if (isAntiBotChallenge(response, html, ["task-statement"])) {
      throw new ProblemAdapterError(
        "ANTIBOT_BLOCKED",
        "atcoder",
        `AtCoder returned a bot/Turnstile challenge page. Algo Coach will not bypass challenges; ${ATCODER_GUIDANCE}`
      );
    }
    if (/\/login\?continue=/i.test(html) && !html.includes("task-statement")) {
      throw new ProblemAdapterError(
        "AUTH_REQUIRED",
        "atcoder",
        "AtCoder task requires contest login (ongoing or private contest). Please use Competitive Companion in your browser."
      );
    }

    const preferLang = this.extractPreferLang(ref);
    const parsed = parseAtCoderTaskHtml(html, taskId, preferLang ? { preferLang } : undefined);
    if (!parsed.statementMarkdown) {
      throw new ProblemAdapterError(
        "SCHEMA_DRIFT",
        "atcoder",
        `Could not locate #task-statement in AtCoder HTML for ${taskId}.`
      );
    }

    // Best-effort difficulty lookup from kenkoooo models (never fail main fetch if index is unavailable)
    let numericRating: number | undefined;
    try {
      const models = await this.loadModels(opts?.signal);
      const rawDiff = models[taskId]?.difficulty;
      if (typeof rawDiff === "number" && Number.isFinite(rawDiff)) {
        numericRating = Math.round(rawDiff);
      }
    } catch {
      // Optional enrichment only
    }

    const tier = atcoderDifficultyToTier(numericRating);

    return {
      schemaVersion: "problem-doc/v2",
      problemKey: `atcoder:${taskId}`,
      source: "atcoder",
      sourceId: taskId,
      canonicalUrl: url,
      title: parsed.title,
      locale: parsed.locale,
      completeness: "full",
      ioMode: "stdio",
      statementMarkdown: parsed.statementMarkdown,
      samples: parsed.samples,
      ...(parsed.constraints ? { constraints: parsed.constraints } : {}),
      ...(numericRating !== undefined
        ? {
            difficulty: {
              rawLabel: `AtCoder ${numericRating}`,
              numericRating,
              ...(tier !== undefined ? { normalizedTier: tier } : {})
            }
          }
        : {}),
      rawTags: [contestId],
      provenance: {
        ingestChannel: "builtin-adapter",
        fetchedAt: new Date().toISOString()
      }
    };
  }

  async search(
    query: ProblemSearchQuery,
    signal?: AbortSignal
  ): Promise<{ items: ProblemDocument[]; total?: number }> {
    const [problems, models] = await Promise.all([
      this.loadProblems(signal),
      this.loadModels(signal).catch(() => ({} as Record<string, KenkooooProblemModel>))
    ]);

    const keyword = query.keyword?.trim().toLowerCase() ?? "";
    const tagFilters = (query.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);

    const filtered = problems.filter((p) => {
      const title = (p.title ?? p.name ?? p.id).toLowerCase();
      if (
        keyword &&
        !title.includes(keyword) &&
        !p.id.toLowerCase().includes(keyword) &&
        !p.contest_id.toLowerCase().includes(keyword)
      ) {
        return false;
      }
      if (tagFilters.length > 0 && !tagFilters.some((t) => p.contest_id.toLowerCase().includes(t))) {
        return false;
      }
      const rating = models[p.id]?.difficulty;
      const tier = atcoderDifficultyToTier(rating);
      if (query.minTier !== undefined && (tier === undefined || tier < query.minTier)) {
        return false;
      }
      if (query.maxTier !== undefined && (tier === undefined || tier > query.maxTier)) {
        return false;
      }
      return true;
    });

    const page = Math.max(1, query.page ?? 1);
    const pageSize = 20;
    const slice = filtered.slice((page - 1) * pageSize, page * pageSize);

    const items: ProblemDocument[] = slice.map((p) => {
      const rawDiff = models[p.id]?.difficulty;
      const rating =
        typeof rawDiff === "number" && Number.isFinite(rawDiff) ? Math.round(rawDiff) : undefined;
      const tier = atcoderDifficultyToTier(rating);
      return {
        schemaVersion: "problem-doc/v2",
        problemKey: `atcoder:${p.id}`,
        source: "atcoder",
        sourceId: p.id,
        canonicalUrl: `https://atcoder.jp/contests/${p.contest_id}/tasks/${p.id}`,
        title: p.title ?? p.name ?? p.id,
        locale: "en-US",
        completeness: "metadata_only",
        ioMode: "stdio",
        samples: [],
        ...(rating !== undefined
          ? {
              difficulty: {
                rawLabel: `AtCoder ${rating}`,
                numericRating: rating,
                ...(tier !== undefined ? { normalizedTier: tier } : {})
              }
            }
          : {}),
        rawTags: [p.contest_id],
        provenance: {
          ingestChannel: "builtin-adapter",
          fetchedAt: new Date().toISOString()
        }
      };
    });

    return { items, total: filtered.length };
  }

  async healthCheck(
    signal?: AbortSignal
  ): Promise<{ ok: boolean; code?: ProblemAdapterError["code"]; message?: string }> {
    try {
      const problems = await this.loadProblems(signal);
      return {
        ok: problems.length > 0,
        message: `AtCoder kenkoooo static index loaded (${problems.length} tasks).`
      };
    } catch (error) {
      if (error instanceof ProblemAdapterError) {
        return { ok: false, code: error.code, message: error.message };
      }
      return {
        ok: false,
        code: "NETWORK_ERROR",
        message: error instanceof Error ? error.message : String(error)
      };
    }
  }

  private async loadProblems(signal?: AbortSignal): Promise<KenkooooProblem[]> {
    if (this.cachedProblems && Date.now() - this.cachedProblemsAt < this.indexTtlMs) {
      return this.cachedProblems;
    }
    let response: Response;
    try {
      response = await fetchWithTimeout(
        this.fetchImpl,
        KENKOOOO_PROBLEMS_URL,
        {
          headers: { "user-agent": this.userAgent, accept: "application/json" },
          signal
        },
        this.timeoutMs
      );
    } catch (error) {
      throw new ProblemAdapterError(
        "NETWORK_ERROR",
        "atcoder",
        `Failed to fetch kenkoooo problems index: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    if (!response.ok) {
      throw mapHttpStatusError("atcoder", response.status, KENKOOOO_PROBLEMS_URL);
    }
    const data = (await response.json()) as unknown;
    if (!Array.isArray(data)) {
      throw new ProblemAdapterError(
        "SCHEMA_DRIFT",
        "atcoder",
        "kenkoooo problems.json did not return an array."
      );
    }
    this.cachedProblems = data as KenkooooProblem[];
    this.cachedProblemsAt = Date.now();
    return this.cachedProblems;
  }

  private async loadModels(signal?: AbortSignal): Promise<Record<string, KenkooooProblemModel>> {
    if (this.cachedModels && Date.now() - this.cachedModelsAt < this.indexTtlMs) {
      return this.cachedModels;
    }
    const response = await fetchWithTimeout(
      this.fetchImpl,
      KENKOOOO_MODELS_URL,
      {
        headers: { "user-agent": this.userAgent, accept: "application/json" },
        signal
      },
      this.timeoutMs
    );
    if (!response.ok) {
      throw mapHttpStatusError("atcoder", response.status, KENKOOOO_MODELS_URL);
    }
    const data = (await response.json()) as unknown;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new ProblemAdapterError(
        "SCHEMA_DRIFT",
        "atcoder",
        "kenkoooo problem-models.json did not return an object."
      );
    }
    this.cachedModels = data as Record<string, KenkooooProblemModel>;
    this.cachedModelsAt = Date.now();
    return this.cachedModels;
  }
}
