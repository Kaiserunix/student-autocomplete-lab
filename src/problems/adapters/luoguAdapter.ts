import {
  ProblemAdapterError,
  type AdapterCapabilities,
  type ProblemDocument,
  type ProblemSample,
  type ProblemSearchQuery,
  type ProblemSourceAdapter
} from "../../core/contracts";
import { decodeHtmlEntities, normalizeRefInput } from "./htmlUtils";
import {
  DEFAULT_HTTP_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  fetchWithTimeout,
  isAntiBotChallenge,
  mapHttpStatusError
} from "./httpClient";

export interface LuoguAdapterOptions {
  fetchImpl?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
  tagsTtlMs?: number;
}

export interface FetchLuoguRemoteProblemOptions {
  fetchImpl?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Preferred translation locale when Luogu RemoteJudge `translations` is present. Defaults to "en". */
  preferLocale?: "en" | "zh-CN";
}

export interface LuoguRemoteProblemData {
  pid: string;
  title: string;
  locale: "zh-CN" | "en-US";
  statementMarkdown: string;
  samples: ProblemSample[];
  constraints?: {
    timeLimitMs?: number;
    memoryLimitMb?: number;
  };
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
  translations?: Record<string, LuoguContentBlock | undefined>;
  limits?: {
    time?: unknown;
    memory?: unknown;
  };
}

interface LuoguEnvelope {
  code?: unknown;
  status?: unknown;
  data?: {
    errorCode?: unknown;
    errorMessage?: unknown;
    problem?: LuoguRawProblem;
    problems?: {
      result?: unknown;
      count?: unknown;
    };
    training?: {
      id?: unknown;
      name?: unknown;
      title?: unknown;
      problems?: unknown;
    };
  };
  currentData?: {
    errorCode?: unknown;
    errorMessage?: unknown;
    problem?: LuoguRawProblem;
    problems?: {
      result?: unknown;
      count?: unknown;
    };
    training?: {
      id?: unknown;
      name?: unknown;
      title?: unknown;
      problems?: unknown;
    };
  };
}

const LUOGU_TAGS_URL = "https://www.luogu.com.cn/_lfe/tags";
const DEFAULT_TAGS_TTL_MS = 30 * 60 * 1000;
const LUOGU_GUIDANCE =
  "Please use Luogu Copy Markdown or Competitive Companion (Localhost Bridge).";

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

function decodeText(value: unknown): string {
  const raw = asString(value);
  return raw ? decodeHtmlEntities(raw) : "";
}

function hasContentBlockBody(block?: LuoguContentBlock): boolean {
  if (!block || typeof block !== "object") {
    return false;
  }
  return Boolean(
    asString(block.description).trim() ||
      asString(block.background).trim() ||
      asString(block.formatI).trim() ||
      asString(block.formatO).trim()
  );
}

function isEnglishLocale(locale: unknown): boolean {
  return typeof locale === "string" && /^en(?:[-_]|$)/i.test(locale.trim());
}

function hasNumericTags(raw: unknown): boolean {
  return Array.isArray(raw) && raw.some((tag) => typeof tag === "number");
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

function normalizeTags(raw: unknown, tagMap?: ReadonlyMap<number, string>): string[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw
    .map((tag) => {
      if (typeof tag === "string") return decodeHtmlEntities(tag).trim();
      if (typeof tag === "number") {
        return tagMap?.get(tag) ?? `tag-${tag}`;
      }
      if (tag && typeof tag === "object") {
        const rec = tag as Record<string, unknown>;
        const named = decodeText(rec.name).trim();
        if (named) return named;
        if (typeof rec.id === "number") {
          return tagMap?.get(rec.id) ?? `tag-${rec.id}`;
        }
        return rec.id !== undefined ? `tag-${String(rec.id)}` : "";
      }
      return "";
    })
    .filter(Boolean);
}

function selectContentBlocks(
  problem: LuoguRawProblem,
  preferLocale: "en" | "zh-CN" = "zh-CN"
): {
  primary?: LuoguContentBlock;
  fallback?: LuoguContentBlock;
  locale: "zh-CN" | "en-US";
} {
  const translations =
    problem.translations && typeof problem.translations === "object"
      ? problem.translations
      : undefined;
  const enTranslation = translations?.en ?? translations?.["en-US"];
  const zhTranslation = translations?.["zh-CN"] ?? translations?.zh;

  if (preferLocale === "en") {
    const enCandidate = hasContentBlockBody(enTranslation)
      ? enTranslation
      : isEnglishLocale(problem.content?.locale) && hasContentBlockBody(problem.content)
        ? problem.content
        : undefined;
    if (enCandidate) {
      return {
        primary: enCandidate,
        fallback: problem.content ?? problem.contenu ?? zhTranslation,
        locale: "en-US"
      };
    }
    const primary = problem.content ?? problem.contenu ?? zhTranslation;
    const fallback = primary === problem.content ? problem.contenu ?? zhTranslation : problem.content;
    const sampleText = `${asString(primary?.description)} ${asString(primary?.name)}`;
    const inferredLocale: "zh-CN" | "en-US" =
      isEnglishLocale(primary?.locale) || (!/[\u4e00-\u9fff]/.test(sampleText) && sampleText.trim().length > 0)
        ? "en-US"
        : "zh-CN";
    return { primary, fallback, locale: inferredLocale };
  }

  const primary = hasContentBlockBody(problem.contenu)
    ? problem.contenu
    : hasContentBlockBody(zhTranslation)
      ? zhTranslation
      : problem.contenu ?? problem.content ?? enTranslation;
  const fallback =
    primary === problem.content
      ? problem.contenu ?? enTranslation ?? zhTranslation
      : problem.content ?? enTranslation ?? zhTranslation;

  const sampleText = [
    asString(primary?.name),
    asString(primary?.background),
    asString(primary?.description),
    asString(primary?.formatI),
    asString(primary?.formatO),
    asString(primary?.hint),
    asString(problem.title),
    asString(problem.name),
    asString(problem.description)
  ]
    .join(" ")
    .trim();
  const hasCjk = /[\u4e00-\u9fff]/.test(sampleText);
  const inferredLocale: "zh-CN" | "en-US" =
    primary === enTranslation ||
    isEnglishLocale(primary?.locale) ||
    (!hasCjk && /[A-Za-z]{3,}/.test(sampleText))
      ? "en-US"
      : "zh-CN";

  return {
    primary,
    fallback,
    locale: inferredLocale
  };
}

function buildLuoguStatementMarkdown(
  problem: LuoguRawProblem,
  preferLocale: "en" | "zh-CN" = "zh-CN"
): { markdown: string; locale: "zh-CN" | "en-US" } {
  const { primary, fallback, locale } = selectContentBlocks(problem, preferLocale);

  const background =
    decodeText(primary?.background).trim() ||
    decodeText(fallback?.background).trim() ||
    decodeText(problem.background).trim();
  const description =
    decodeText(primary?.description).trim() ||
    decodeText(fallback?.description).trim() ||
    decodeText(problem.description).trim();
  const formatI =
    decodeText(primary?.formatI).trim() ||
    decodeText(fallback?.formatI).trim() ||
    decodeText(problem.inputFormat).trim();
  const formatO =
    decodeText(primary?.formatO).trim() ||
    decodeText(fallback?.formatO).trim() ||
    decodeText(problem.outputFormat).trim();
  const hint =
    decodeText(primary?.hint).trim() ||
    decodeText(fallback?.hint).trim() ||
    decodeText(problem.content?.hint).trim() ||
    decodeText(problem.contenu?.hint).trim() ||
    decodeText(problem.hint).trim();

  const headings =
    locale === "en-US"
      ? {
          background: "## Problem Background",
          description: "## Problem Statement",
          formatI: "## Input Format",
          formatO: "## Output Format",
          hint: "## Note"
        }
      : {
          background: "## 题目背景",
          description: "## 题目描述",
          formatI: "## 输入格式",
          formatO: "## 输出格式",
          hint: "## 说明/提示"
        };

  const sections: string[] = [];
  if (background) {
    sections.push(`${headings.background}\n\n${background}`);
  }
  if (description) {
    sections.push(`${headings.description}\n\n${description}`);
  }
  if (formatI) {
    sections.push(`${headings.formatI}\n\n${formatI}`);
  }
  if (formatO) {
    sections.push(`${headings.formatO}\n\n${formatO}`);
  }
  if (hint) {
    sections.push(`${headings.hint}\n\n${hint}`);
  }

  return {
    markdown: sections.join("\n\n").trim(),
    locale
  };
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

/**
 * Extracts Luogu's embedded JSON envelope from HTML responses:
 * - Modern `<script id="lentille-context" type="application/json">{...}</script>`
 * - Legacy `window._feInjection = JSON.parse(decodeURIComponent("..."))`
 */
export function extractLuoguEnvelopeFromHtml(html: string): LuoguEnvelope | null {
  if (!html) {
    return null;
  }

  const lentilleMatch = html.match(
    /<script\b[^>]*\bid=["']lentille-context["'][^>]*>([\s\S]*?)<\/script>/i
  );
  if (lentilleMatch?.[1]) {
    try {
      const parsed = JSON.parse(lentilleMatch[1].trim()) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as LuoguEnvelope;
      }
    } catch {
      // Fall through to legacy extraction
    }
  }

  const feInjectionMatch = html.match(
    /window\._feInjection\s*=\s*JSON\.parse\(\s*decodeURIComponent\(\s*(["'])([\s\S]*?)\1\s*\)\s*\)/i
  );
  if (feInjectionMatch?.[2]) {
    try {
      const decoded = decodeURIComponent(feInjectionMatch[2]);
      const parsed = JSON.parse(decoded) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as LuoguEnvelope;
      }
    } catch {
      return null;
    }
  }

  return null;
}

function assertLuoguEnvelopeOk(payload: LuoguEnvelope): void {
  const candidates = [
    payload.data?.errorCode,
    payload.currentData?.errorCode,
    payload.code,
    payload.status
  ].filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  const errMsg =
    decodeText(payload.data?.errorMessage).trim() ||
    decodeText(payload.currentData?.errorMessage).trim();
  const detail = errMsg ? ` (${errMsg})` : "";

  for (const code of candidates) {
    if (code === 404) {
      throw new ProblemAdapterError("NOT_FOUND", "luogu", `Luogu returned status 404${detail}.`);
    }
    if (code === 401 || code === 403) {
      throw new ProblemAdapterError(
        "AUTH_REQUIRED",
        "luogu",
        `Luogu returned status ${code}${detail}; authentication may be required. ${LUOGU_GUIDANCE}`
      );
    }
    if (code === 418 || code === 429) {
      throw new ProblemAdapterError(
        "RATE_LIMITED",
        "luogu",
        `Luogu returned status ${code}${detail}. ${LUOGU_GUIDANCE}`
      );
    }
    if (code >= 500) {
      throw new ProblemAdapterError(
        "NETWORK_ERROR",
        "luogu",
        `Luogu returned server error status ${code}${detail}.`
      );
    }
  }
}

async function requestLuoguEnvelope(
  url: string,
  options: {
    fetchImpl: typeof fetch;
    userAgent: string;
    timeoutMs: number;
    signal?: AbortSignal;
  }
): Promise<LuoguEnvelope> {
  let response: Response;
  try {
    response = await fetchWithTimeout(
      options.fetchImpl,
      url,
      {
        headers: {
          "user-agent": options.userAgent,
          "x-lentille-request": "content-only",
          accept: "application/json, text/html;q=0.9"
        },
        signal: options.signal
      },
      options.timeoutMs
    );
  } catch (error) {
    throw new ProblemAdapterError(
      "NETWORK_ERROR",
      "luogu",
      `Network error requesting Luogu: ${error instanceof Error ? error.message : String(error)}`
    );
  }

  if (!response.ok) {
    throw mapHttpStatusError("luogu", response.status, url, LUOGU_GUIDANCE);
  }

  const bodyText = await response.text();
  let payload: LuoguEnvelope | null = null;

  const trimmed = bodyText.trimStart();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(bodyText) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        payload = parsed as LuoguEnvelope;
      }
    } catch {
      payload = null;
    }
  }

  if (!payload) {
    payload = extractLuoguEnvelopeFromHtml(bodyText);
  }

  if (!payload) {
    if (isAntiBotChallenge(response, bodyText, ["lentille-context", "_feInjection"])) {
      throw new ProblemAdapterError(
        "ANTIBOT_BLOCKED",
        "luogu",
        `Luogu returned an anti-bot challenge page. ${LUOGU_GUIDANCE}`
      );
    }
    if (/\/auth\/login|请先登录|用户登录/i.test(bodyText)) {
      throw new ProblemAdapterError(
        "AUTH_REQUIRED",
        "luogu",
        `Luogu requires login for this resource. ${LUOGU_GUIDANCE}`
      );
    }
    throw new ProblemAdapterError(
      "SCHEMA_DRIFT",
      "luogu",
      `Luogu returned an unreadable payload (neither Lentille JSON nor embedded HTML context). ${LUOGU_GUIDANCE}`
    );
  }

  assertLuoguEnvelopeOk(payload);
  return payload;
}

export function normalizeLuoguPid(input: string): string {
  const trimmed = normalizeRefInput(input);
  if (/^\d+$/.test(trimmed)) {
    return `P${trimmed}`;
  }
  const prefixed = trimmed.match(/^(p|b|t|u)\s*(\d+)$/i);
  if (prefixed) {
    return `${prefixed[1]!.toUpperCase()}${prefixed[2]!}`;
  }
  const remoteMatch = trimmed.match(/^(cf|sp|uva|at)\s*([a-z0-9_ ]+)$/i);
  if (remoteMatch) {
    const prefix = remoteMatch[1]!.toUpperCase();
    const rest = remoteMatch[2]!.replace(/\s+/g, "");
    if (prefix === "AT") {
      return `AT${rest.toLowerCase()}`;
    }
    return `${prefix}${rest.toUpperCase()}`;
  }
  return trimmed;
}

/**
 * Reusable helper that fetches a Luogu problem (including RemoteJudge entries such as `CF1900A`)
 * via Luogu's public Lentille endpoint with HTML fallback and returns statement, samples, and limits.
 */
export async function fetchLuoguRemoteProblem(
  pid: string,
  opts: FetchLuoguRemoteProblemOptions = {}
): Promise<LuoguRemoteProblemData> {
  const normalizedPid = normalizeLuoguPid(pid);
  if (!/^[A-Za-z0-9_]+$/.test(normalizedPid)) {
    throw new ProblemAdapterError(
      "NOT_FOUND",
      "luogu",
      `Invalid Luogu problem ID: "${pid}".`
    );
  }

  const payload = await requestLuoguEnvelope(
    `https://www.luogu.com.cn/problem/${encodeURIComponent(normalizedPid)}`,
    {
      fetchImpl: opts.fetchImpl ?? fetch,
      userAgent: opts.userAgent ?? DEFAULT_USER_AGENT,
      timeoutMs: opts.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS,
      signal: opts.signal
    }
  );

  const problem = payload.data?.problem ?? payload.currentData?.problem;
  if (!problem || typeof problem !== "object") {
    throw new ProblemAdapterError(
      "SCHEMA_DRIFT",
      "luogu",
      "Luogu remote response did not include data.problem or currentData.problem."
    );
  }

  const preferLocale = opts.preferLocale ?? "en";
  const { markdown, locale } = buildLuoguStatementMarkdown(problem, preferLocale);
  const { primary, fallback } = selectContentBlocks(problem, preferLocale);
  const resolvedPid = asString(problem.pid).trim() || normalizedPid;
  const title =
    decodeText(primary?.name).trim() ||
    decodeText(problem.title).trim() ||
    decodeText(problem.name).trim() ||
    decodeText(fallback?.name).trim() ||
    resolvedPid;
  const samples = normalizeSamples(problem.samples);
  const constraints = extractConstraints(problem);

  return {
    pid: resolvedPid,
    title,
    locale,
    statementMarkdown: markdown,
    samples,
    ...(constraints ? { constraints } : {})
  };
}

/**
 * Lenient schema mapper supporting both legacy Luogu `DataResponse` (`currentData.problem`)
 * and modern `LentilleDataResponse` (`data.problem` with `contenu`/`content`/`translations`).
 */
export function normalizeLuoguProblemPayload(
  payload: LuoguEnvelope,
  options?: { tagMap?: ReadonlyMap<number, string> }
): ProblemDocument {
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
  const { primary, fallback } = selectContentBlocks(problem, "zh-CN");
  const title =
    decodeText(problem.title).trim() ||
    decodeText(problem.name).trim() ||
    decodeText(primary?.name).trim() ||
    decodeText(contenu?.name).trim() ||
    decodeText(problem.content?.name).trim() ||
    decodeText(fallback?.name).trim();

  if (!pid || !title) {
    throw new ProblemAdapterError(
      "SCHEMA_DRIFT",
      "luogu",
      "Luogu problem payload is missing required pid or title."
    );
  }

  const { markdown: statementMarkdown, locale } = buildLuoguStatementMarkdown(problem, "zh-CN");
  const samples = normalizeSamples(problem.samples);
  const constraints = extractConstraints(problem);
  const diffNum = typeof problem.difficulty === "number" ? problem.difficulty : undefined;
  const diffMeta = diffNum !== undefined ? LUOGU_DIFFICULTY_LABELS[diffNum] : undefined;

  const completeness =
    statementMarkdown.length > 0
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
    locale,
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
    rawTags: normalizeTags(problem.tags, options?.tagMap),
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
  private readonly timeoutMs: number;
  private readonly tagsTtlMs: number;
  private cachedTagMap: Map<number, string> | null = null;
  private tagMapCachedAt = 0;

  constructor(options: LuoguAdapterOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
    this.tagsTtlMs = options.tagsTtlMs ?? DEFAULT_TAGS_TTL_MS;
  }

  canHandleUrl(url: string): boolean {
    try {
      const parsed = new URL(normalizeRefInput(url));
      const host = parsed.hostname.toLowerCase();
      if (host !== "www.luogu.com.cn" && host !== "luogu.com.cn") {
        return false;
      }
      const match = parsed.pathname.match(/^\/problem\/([A-Za-z0-9_]+)(?:\/.*)?$/);
      if (!match?.[1] || match[1].toLowerCase() === "list") {
        return false;
      }
      return true;
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
      const match = parsed.pathname.match(/^\/problem\/([A-Za-z0-9_]+)/);
      const rawPid = match?.[1];
      if (!rawPid || rawPid.toLowerCase() === "list") {
        return null;
      }
      const pid = normalizeLuoguPid(rawPid);
      return {
        sourceId: pid,
        canonicalUrl: `https://www.luogu.com.cn/problem/${encodeURIComponent(pid)}`
      };
    }

    const prefixMatch = trimmed.match(/^(?:luogu|lg)\s*:\s*(.+)$/i);
    if (prefixMatch?.[1]) {
      const pid = normalizeLuoguPid(prefixMatch[1]);
      if (!/^[A-Za-z0-9_]+$/.test(pid)) {
        return null;
      }
      return {
        sourceId: pid,
        canonicalUrl: `https://www.luogu.com.cn/problem/${encodeURIComponent(pid)}`
      };
    }

    if (/^(?:[PBTU]\s*\d+|CF\s*\d+\s*[A-Z]\d?|SP\s*\d+|UVA\s*\d+|AT_[a-z0-9_]+)$/i.test(trimmed)) {
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
    const problem = payload.data?.problem ?? payload.currentData?.problem;
    const tagMap = hasNumericTags(problem?.tags) ? await this.loadTagMap(opts?.signal) : undefined;
    return normalizeLuoguProblemPayload(payload, { tagMap });
  }

  async search(
    query: ProblemSearchQuery,
    signal?: AbortSignal
  ): Promise<{ items: ProblemDocument[]; total?: number }> {
    const params = new URLSearchParams();
    if (query.keyword?.trim()) {
      params.set("keyword", query.keyword.trim());
    }
    if (query.maxTier === 1 && (query.minTier === undefined || query.minTier <= 1)) {
      params.set("difficulty", "1");
    }
    if (query.page && query.page > 1) {
      params.set("page", String(query.page));
    }
    const url = `https://www.luogu.com.cn/problem/list?${params.toString()}`;
    const payload = await this.fetchLentilleJson(url, signal);
    const problemsBlock = payload.data?.problems ?? payload.currentData?.problems;
    const rawList = Array.isArray(problemsBlock?.result) ? problemsBlock.result : [];

    const needsTags = rawList.some(
      (item) => item && typeof item === "object" && hasNumericTags((item as LuoguRawProblem).tags)
    );
    const tagMap = needsTags ? await this.loadTagMap(signal) : undefined;

    const mappedItems: ProblemDocument[] = [];
    for (const item of rawList) {
      if (!item || typeof item !== "object") {
        continue;
      }
      const p = item as LuoguRawProblem;
      const pid = asString(p.pid).trim();
      const title = decodeText(p.title).trim() || decodeText(p.name).trim();
      if (!pid || !title) {
        continue;
      }
      const diffNum = typeof p.difficulty === "number" ? p.difficulty : undefined;
      const diffMeta = diffNum !== undefined ? LUOGU_DIFFICULTY_LABELS[diffNum] : undefined;
      mappedItems.push({
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
        rawTags: normalizeTags(p.tags, tagMap),
        provenance: {
          ingestChannel: "builtin-adapter",
          fetchedAt: new Date().toISOString()
        }
      });
    }

    const wantedTags = (query.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);
    const hasLocalFilters =
      query.minTier !== undefined || query.maxTier !== undefined || wantedTags.length > 0;

    const items = hasLocalFilters
      ? mappedItems.filter((doc) => {
          const tier = doc.difficulty?.normalizedTier;
          if (query.minTier !== undefined && (tier === undefined || tier < query.minTier)) {
            return false;
          }
          if (query.maxTier !== undefined && (tier === undefined || tier > query.maxTier)) {
            return false;
          }
          if (wantedTags.length > 0) {
            const docTags = doc.rawTags.map((t) => t.toLowerCase());
            if (!wantedTags.every((wanted) => docTags.some((t) => t === wanted || t.includes(wanted)))) {
              return false;
            }
          }
          return true;
        })
      : mappedItems;

    const serverTotal = typeof problemsBlock?.count === "number" ? problemsBlock.count : undefined;
    const total =
      hasLocalFilters && items.length < mappedItems.length ? items.length : serverTotal;
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

    const needsTags = training.problems.some((entry) => {
      if (!entry || typeof entry !== "object") return false;
      const wrapped = entry as { problem?: LuoguRawProblem } & LuoguRawProblem;
      const raw = wrapped.problem ?? wrapped;
      return hasNumericTags(raw.tags);
    });
    const tagMap = needsTags ? await this.loadTagMap(signal) : undefined;

    const items: ProblemDocument[] = [];
    for (const entry of training.problems) {
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const wrapped = entry as { problem?: LuoguRawProblem } & LuoguRawProblem;
      const raw = wrapped.problem ?? wrapped;
      const pid = asString(raw.pid).trim();
      const title = decodeText(raw.title).trim() || decodeText(raw.name).trim();
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
        rawTags: normalizeTags(raw.tags, tagMap),
        provenance: {
          ingestChannel: "builtin-adapter",
          fetchedAt: new Date().toISOString()
        }
      });
    }

    return {
      id: cleanId,
      title:
        decodeText(training.name).trim() ||
        decodeText(training.title).trim() ||
        `Luogu Training ${cleanId}`,
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
    return requestLuoguEnvelope(url, {
      fetchImpl: this.fetchImpl,
      userAgent: this.userAgent,
      timeoutMs: this.timeoutMs,
      signal
    });
  }

  private async loadTagMap(signal?: AbortSignal): Promise<ReadonlyMap<number, string> | undefined> {
    if (this.cachedTagMap && Date.now() - this.tagMapCachedAt < this.tagsTtlMs) {
      return this.cachedTagMap;
    }

    try {
      const response = await fetchWithTimeout(
        this.fetchImpl,
        LUOGU_TAGS_URL,
        {
          headers: {
            "user-agent": this.userAgent,
            accept: "application/json"
          },
          signal
        },
        this.timeoutMs
      );
      if (!response.ok) {
        return undefined;
      }
      const raw = (await response.json()) as unknown;
      const list = Array.isArray(raw)
        ? raw
        : raw && typeof raw === "object"
          ? Array.isArray((raw as { tags?: unknown }).tags)
            ? ((raw as { tags: unknown[] }).tags)
            : Array.isArray((raw as { data?: { tags?: unknown } }).data?.tags)
              ? ((raw as { data: { tags: unknown[] } }).data.tags)
              : []
          : [];

      const map = new Map<number, string>();
      for (const entry of list) {
        if (!entry || typeof entry !== "object") continue;
        const rec = entry as { id?: unknown; name?: unknown };
        if (typeof rec.id === "number" && typeof rec.name === "string" && rec.name.trim()) {
          map.set(rec.id, decodeHtmlEntities(rec.name).trim());
        }
      }
      if (map.size > 0) {
        this.cachedTagMap = map;
        this.tagMapCachedAt = Date.now();
        return map;
      }
    } catch {
      // Best-effort enrichment only; never fail main fetch when /_lfe/tags is unreachable
    }
    return undefined;
  }
}
