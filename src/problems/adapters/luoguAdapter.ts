import {
  ProblemAdapterError,
  type AdapterCapabilities,
  type ProblemDocument,
  type ProblemSample,
  type ProblemSearchQuery,
  type ProblemSourceAdapter
} from "../../core/contracts";

export interface LuoguAdapterOptions {
  fetchImpl?: typeof fetch;
  userAgent?: string;
}

interface LuoguContentBlock {
  name?: unknown;
  background?: unknown;
  description?: unknown;
  formatI?: unknown;
  formatO?: unknown;
  hint?: unknown;
  locale?: unknown;
}

interface LuoguRawProblem {
  pid?: unknown;
  title?: unknown;
  name?: unknown;
  difficulty?: unknown;
  tags?: unknown;
  description?: unknown;
  background?: unknown;
  inputFormat?: unknown;
  outputFormat?: unknown;
  samples?: unknown;
  hint?: unknown;
  contenu?: LuoguContentBlock;
  content?: LuoguContentBlock;
  limits?: {
    time?: unknown;
    memory?: unknown;
  };
}

interface LuoguEnvelope {
  code?: unknown;
  data?: {
    problem?: LuoguRawProblem;
    problems?: {
      result?: unknown;
      count?: unknown;
    };
    training?: {
      id?: unknown;
      title?: unknown;
      problems?: unknown;
    };
  };
  currentData?: {
    problem?: LuoguRawProblem;
    problems?: {
      result?: unknown;
      count?: unknown;
    };
    training?: {
      id?: unknown;
      title?: unknown;
      problems?: unknown;
    };
  };
}

const DEFAULT_LUOGU_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) AlgoCoach/0.2.0";

const LUOGU_DIFFICULTY_LABELS: Record<number, { label: string; tier: 1 | 2 | 3 | 4 | 5 }> = {
  1: { label: "入门", tier: 1 },
  2: { label: "普及-", tier: 2 },
  3: { label: "普及/提高-", tier: 2 },
  4: { label: "普及+/提高", tier: 3 },
  5: { label: "提高+/省选-", tier: 4 },
  6: { label: "省选/NOI-", tier: 5 },
  7: { label: "NOI/NOI+/CTSC", tier: 5 }
};

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeSamples(raw: unknown): ProblemSample[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  const result: ProblemSample[] = [];
  for (const item of raw) {
    if (Array.isArray(item)) {
      const input = asString(item[0]);
      const expectedOutput = asString(item[1]);
      result.push({
        id: `sample-${result.length + 1}`,
        input,
        expectedOutput,
        isOriginal: true
      });
    } else if (item && typeof item === "object") {
      const record = item as Record<string, unknown>;
      const input = asString(record.input);
      const expectedOutput = asString(record.output ?? record.expectedOutput);
      result.push({
        id: `sample-${result.length + 1}`,
        input,
        expectedOutput,
        isOriginal: true
      });
    }
  }
  return result;
}

function normalizeTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((tag) => {
      if (typeof tag === "string") return tag.trim();
      if (typeof tag === "number") return `tag-${tag}`;
      if (tag && typeof tag === "object") {
        const rec = tag as Record<string, unknown>;
        return asString(rec.name).trim() || (rec.id !== undefined ? `tag-${String(rec.id)}` : "");
      }
      return "";
    })
    .filter(Boolean);
}

function buildLuoguStatementMarkdown(problem: LuoguRawProblem): string {
  const contenu = problem.contenu ?? problem.content;
  const background = asString(contenu?.background) || asString(problem.background);
  const description = asString(contenu?.description) || asString(problem.description);
  const formatI = asString(contenu?.formatI) || asString(problem.inputFormat);
  const formatO = asString(contenu?.formatO) || asString(problem.outputFormat);
  const hint = asString(contenu?.hint) || asString(problem.hint);

  const sections: string[] = [];
  if (background.trim()) {
    sections.push(`## 题目背景\n\n${background.trim()}`);
  }
  if (description.trim()) {
    sections.push(`## 题目描述\n\n${description.trim()}`);
  }
  if (formatI.trim()) {
    sections.push(`## 输入格式\n\n${formatI.trim()}`);
  }
  if (formatO.trim()) {
    sections.push(`## 输出格式\n\n${formatO.trim()}`);
  }
  if (hint.trim()) {
    sections.push(`## 说明/提示\n\n${hint.trim()}`);
  }

  return sections.join("\n\n").trim();
}

function extractConstraints(
  problem: LuoguRawProblem
): { timeLimitMs?: number; memoryLimitMb?: number } | undefined {
  const times = Array.isArray(problem.limits?.time)
    ? (problem.limits.time as unknown[]).filter((v): v is number => typeof v === "number" && v > 0)
    : [];
  const memories = Array.isArray(problem.limits?.memory)
    ? (problem.limits.memory as unknown[]).filter((v): v is number => typeof v === "number" && v > 0)
    : [];

  const timeLimitMs = times.length > 0 ? Math.max(...times) : undefined;
  // Luogu limits.memory is typically in KiB (e.g. 128000 or 131072 or 524288)
  const rawMemory = memories.length > 0 ? Math.max(...memories) : undefined;
  const memoryLimitMb =
    rawMemory !== undefined
      ? rawMemory > 4096
        ? Math.round(rawMemory / 1024)
        : rawMemory
      : undefined;

  if (timeLimitMs === undefined && memoryLimitMb === undefined) {
    return undefined;
  }
  return {
    ...(timeLimitMs !== undefined ? { timeLimitMs } : {}),
    ...(memoryLimitMb !== undefined ? { memoryLimitMb } : {})
  };
}

export function normalizeLuoguPid(input: string): string {
  const trimmed = input.trim();
  if (/^\d+$/.test(trimmed)) {
    return `P${trimmed}`;
  }
  const prefixed = trimmed.match(/^(p|b|t|u)(\d+)$/i);
  if (prefixed) {
    return `${prefixed[1]!.toUpperCase()}${prefixed[2]!}`;
  }
  const remoteMatch = trimmed.match(/^(cf|sp|uva|at)([a-z0-9_]+)$/i);
  if (remoteMatch) {
    const prefix = remoteMatch[1]!.toUpperCase();
    return `${prefix}${remoteMatch[2]!}`;
  }
  return trimmed;
}

/**
 * Lenient schema mapper supporting both legacy Luogu `DataResponse` (`currentData.problem`)
 * and modern `LentilleDataResponse` (`data.problem` with `contenu`/`content`).
 */
export function normalizeLuoguProblemPayload(payload: LuoguEnvelope): ProblemDocument {
  const problem = payload.data?.problem ?? payload.currentData?.problem;
  if (!problem || typeof problem !== "object") {
    throw new ProblemAdapterError(
      "SCHEMA_DRIFT",
      "luogu",
      "Luogu response did not include data.problem or currentData.problem."
    );
  }

  const pid = asString(problem.pid).trim();
  const contenu = problem.contenu ?? problem.content;
  const title =
    asString(problem.title).trim() ||
    asString(problem.name).trim() ||
    asString(contenu?.name).trim();

  if (!pid || !title) {
    throw new ProblemAdapterError(
      "SCHEMA_DRIFT",
      "luogu",
      "Luogu problem payload is missing required pid or title."
    );
  }

  const statementMarkdown = buildLuoguStatementMarkdown(problem);
  const samples = normalizeSamples(problem.samples);
  const constraints = extractConstraints(problem);
  const diffNum = typeof problem.difficulty === "number" ? problem.difficulty : undefined;
  const diffMeta = diffNum !== undefined ? LUOGU_DIFFICULTY_LABELS[diffNum] : undefined;

  const completeness = statementMarkdown.length > 0
    ? "full"
    : samples.length > 0
      ? "samples_only"
      : "metadata_only";

  return {
    schemaVersion: "problem-doc/v2",
    problemKey: `luogu:${pid}`,
    source: "luogu",
    sourceId: pid,
    canonicalUrl: `https://www.luogu.com.cn/problem/${encodeURIComponent(pid)}`,
    title,
    locale: "zh-CN",
    completeness,
    ioMode: "stdio",
    ...(statementMarkdown ? { statementMarkdown } : {}),
    samples,
    ...(constraints ? { constraints } : {}),
    ...(diffNum !== undefined
      ? {
          difficulty: {
            rawLabel: diffMeta?.label ?? `L${diffNum}`,
            numericRating: diffNum,
            ...(diffMeta ? { normalizedTier: diffMeta.tier } : {})
          }
        }
      : {}),
    rawTags: normalizeTags(problem.tags),
    provenance: {
      ingestChannel: "builtin-adapter",
      fetchedAt: new Date().toISOString()
    }
  };
}

export class LuoguAdapter implements ProblemSourceAdapter {
  readonly id = "luogu" as const;
  readonly displayName = "洛谷 (Luogu)";
  readonly capabilities: AdapterCapabilities = {
    search: true,
    problemLists: true,
    directStatementFetch: true,
    directSamplesFetch: true,
    ioModes: ["stdio"],
    supportsOptionalUserSession: false
  };

  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;

  constructor(options: LuoguAdapterOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent = options.userAgent ?? DEFAULT_LUOGU_UA;
  }

  canHandleUrl(url: string): boolean {
    try {
      const parsed = new URL(url.trim());
      const host = parsed.hostname.toLowerCase();
      if (host !== "www.luogu.com.cn" && host !== "luogu.com.cn") {
        return false;
      }
      return /^\/problem\/[A-Za-z0-9_]+(?:\/.*)?$/.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  resolveRef(input: string): { sourceId: string; canonicalUrl?: string } | null {
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }

    if (/^https?:\/\//i.test(trimmed)) {
      if (!this.canHandleUrl(trimmed)) {
        return null;
      }
      const parsed = new URL(trimmed);
      const match = parsed.pathname.match(/^\/problem\/([A-Za-z0-9_]+)/);
      const rawPid = match?.[1];
      if (!rawPid) {
        return null;
      }
      const pid = normalizeLuoguPid(rawPid);
      return {
        sourceId: pid,
        canonicalUrl: `https://www.luogu.com.cn/problem/${encodeURIComponent(pid)}`
      };
    }

    const prefixMatch = trimmed.match(/^(?:luogu|lg):([A-Za-z0-9_]+)$/i);
    if (prefixMatch) {
      const pid = normalizeLuoguPid(prefixMatch[1]!);
      return {
        sourceId: pid,
        canonicalUrl: `https://www.luogu.com.cn/problem/${encodeURIComponent(pid)}`
      };
    }

    if (/^(?:[PBTU]\d+|CF\d+[A-Z]\d?|SP\d+|UVA\d+|AT_[a-z0-9_]+)$/i.test(trimmed)) {
      const pid = normalizeLuoguPid(trimmed);
      return {
        sourceId: pid,
        canonicalUrl: `https://www.luogu.com.cn/problem/${encodeURIComponent(pid)}`
      };
    }

    return null;
  }

  async fetchProblem(
    ref: string,
    opts?: { forceRefresh?: boolean; signal?: AbortSignal }
  ): Promise<ProblemDocument> {
    const resolved = this.resolveRef(ref);
    const pid = resolved ? resolved.sourceId : /^\d+$/.test(ref.trim()) ? normalizeLuoguPid(ref) : "";
    if (!pid) {
      throw new ProblemAdapterError(
        "NOT_FOUND",
        "luogu",
        `Invalid Luogu problem reference: "${ref}". Expected e.g. P1001, B2002, or a Luogu problem URL.`
      );
    }

    const payload = await this.fetchLentilleJson(
      `https://www.luogu.com.cn/problem/${encodeURIComponent(pid)}`,
      opts?.signal
    );
    return normalizeLuoguProblemPayload(payload);
  }

  async search(
    query: ProblemSearchQuery,
    signal?: AbortSignal
  ): Promise<{ items: ProblemDocument[]; total?: number }> {
    const params = new URLSearchParams();
    if (query.keyword?.trim()) {
      params.set("keyword", query.keyword.trim());
    }
    if (query.page && query.page > 1) {
      params.set("page", String(query.page));
    }
    const url = `https://www.luogu.com.cn/problem/list?${params.toString()}`;
    const payload = await this.fetchLentilleJson(url, signal);
    const problemsBlock = payload.data?.problems ?? payload.currentData?.problems;
    const rawList = Array.isArray(problemsBlock?.result) ? problemsBlock.result : [];

    const items: ProblemDocument[] = [];
    for (const item of rawList) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const p = item as LuoguRawProblem;
      const pid = asString(p.pid).trim();
      const title = asString(p.title).trim() || asString(p.name).trim();
      if (!pid || !title) {
        continue;
      }
      const diffNum = typeof p.difficulty === "number" ? p.difficulty : undefined;
      const diffMeta = diffNum !== undefined ? LUOGU_DIFFICULTY_LABELS[diffNum] : undefined;
      items.push({
        schemaVersion: "problem-doc/v2",
        problemKey: `luogu:${pid}`,
        source: "luogu",
        sourceId: pid,
        canonicalUrl: `https://www.luogu.com.cn/problem/${encodeURIComponent(pid)}`,
        title,
        locale: "zh-CN",
        completeness: "metadata_only",
        ioMode: "stdio",
        samples: [],
        ...(diffNum !== undefined
          ? {
              difficulty: {
                rawLabel: diffMeta?.label ?? `L${diffNum}`,
                numericRating: diffNum,
                ...(diffMeta ? { normalizedTier: diffMeta.tier } : {})
              }
            }
          : {}),
        rawTags: normalizeTags(p.tags),
        provenance: {
          ingestChannel: "builtin-adapter",
          fetchedAt: new Date().toISOString()
        }
      });
    }

    const total = typeof problemsBlock?.count === "number" ? problemsBlock.count : undefined;
    return { items, ...(total !== undefined ? { total } : {}) };
  }

  async fetchProblemList(
    listId: string,
    signal?: AbortSignal
  ): Promise<{ id: string; title: string; items: ProblemDocument[] }> {
    const cleanId = listId.trim().replace(/^training[:/]/i, "");
    if (!/^\d+$/.test(cleanId)) {
      throw new ProblemAdapterError(
        "NOT_FOUND",
        "luogu",
        `Invalid Luogu training list ID: "${listId}". Expected numeric ID.`
      );
    }

    const payload = await this.fetchLentilleJson(
      `https://www.luogu.com.cn/training/${encodeURIComponent(cleanId)}`,
      signal
    );
    const training = payload.data?.training ?? payload.currentData?.training;
    if (!training || !Array.isArray(training.problems)) {
      throw new ProblemAdapterError(
        "SCHEMA_DRIFT",
        "luogu",
        `Luogu training list "${cleanId}" did not contain a usable problem list.`
      );
    }

    const items: ProblemDocument[] = [];
    for (const entry of training.problems) {
      const wrapped = entry as { problem?: LuoguRawProblem } & LuoguRawProblem;
      const raw = wrapped.problem ?? wrapped;
      const pid = asString(raw.pid).trim();
      const title = asString(raw.title).trim() || asString(raw.name).trim();
      if (!pid || !title) {
        continue;
      }
      const diffNum = typeof raw.difficulty === "number" ? raw.difficulty : undefined;
      const diffMeta = diffNum !== undefined ? LUOGU_DIFFICULTY_LABELS[diffNum] : undefined;
      items.push({
        schemaVersion: "problem-doc/v2",
        problemKey: `luogu:${pid}`,
        source: "luogu",
        sourceId: pid,
        canonicalUrl: `https://www.luogu.com.cn/problem/${encodeURIComponent(pid)}`,
        title,
        locale: "zh-CN",
        completeness: "metadata_only",
        ioMode: "stdio",
        samples: [],
        ...(diffNum !== undefined
          ? {
              difficulty: {
                rawLabel: diffMeta?.label ?? `L${diffNum}`,
                numericRating: diffNum,
                ...(diffMeta ? { normalizedTier: diffMeta.tier } : {})
              }
            }
          : {}),
        rawTags: normalizeTags(raw.tags),
        provenance: {
          ingestChannel: "builtin-adapter",
          fetchedAt: new Date().toISOString()
        }
      });
    }

    return {
      id: cleanId,
      title: asString(training.title).trim() || `Luogu Training ${cleanId}`,
      items
    };
  }

  async healthCheck(
    signal?: AbortSignal
  ): Promise<{ ok: boolean; code?: ProblemAdapterError["code"]; message?: string }> {
    try {
      await this.fetchProblem("P1000", { signal });
      return { ok: true, message: "Luogu Lentille content-only endpoint reachable." };
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

  private async fetchLentilleJson(url: string, signal?: AbortSignal): Promise<LuoguEnvelope> {
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: {
          "user-agent": this.userAgent,
          "x-lentille-request": "content-only",
          accept: "application/json"
        },
        signal
      });
    } catch (error) {
      throw new ProblemAdapterError(
        "NETWORK_ERROR",
        "luogu",
        `Network error requesting Luogu: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (response.status === 404) {
      throw new ProblemAdapterError(
        "NOT_FOUND",
        "luogu",
        `Luogu resource not found (HTTP 404): ${url}`
      );
    }
    if (response.status === 401) {
      throw new ProblemAdapterError(
        "AUTH_REQUIRED",
        "luogu",
        "Luogu requires login for this resource (HTTP 401). Please use Luogu Copy Markdown or Localhost Bridge."
      );
    }
    if (response.status === 403) {
      throw new ProblemAdapterError(
        "ANTIBOT_BLOCKED",
        "luogu",
        "Luogu blocked the request (HTTP 403). Please copy the Markdown from your browser or use Localhost Bridge."
      );
    }
    if (response.status === 418 || response.status === 429) {
      throw new ProblemAdapterError(
        "RATE_LIMITED",
        "luogu",
        `Luogu rate-limited or rejected client request (HTTP ${response.status}). Please retry later or use Copy Markdown.`
      );
    }
    if (!response.ok) {
      throw new ProblemAdapterError(
        "NETWORK_ERROR",
        "luogu",
        `Luogu request failed with HTTP ${response.status}.`
      );
    }

    let payload: LuoguEnvelope;
    try {
      payload = (await response.json()) as LuoguEnvelope;
    } catch {
      throw new ProblemAdapterError(
        "SCHEMA_DRIFT",
        "luogu",
        "Luogu returned non-JSON content (possible login wall or WAF challenge). Please import via Copy Markdown."
      );
    }

    if (payload.code === 404) {
      throw new ProblemAdapterError("NOT_FOUND", "luogu", "Luogu returned code 404.");
    }
    if (payload.code === 401 || payload.code === 403) {
      throw new ProblemAdapterError(
        "AUTH_REQUIRED",
        "luogu",
        `Luogu returned code ${payload.code}; authentication may be required.`
      );
    }

    return payload;
  }
}
