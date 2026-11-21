import {
  ProblemAdapterError,
  type AdapterCapabilities,
  type FunctionSignatureMeta,
  type ProblemDocument,
  type ProblemSample,
  type ProblemSearchQuery,
  type ProblemSourceAdapter
} from "../../core/contracts";
import {
  curatedEntryToMetadataDocument,
  getCuratedSheet
} from "../sheets/curatedSheets";
import { htmlToMarkdown } from "./htmlUtils";

export type LeetCodeSite = "global" | "cn";

export interface LeetCodeAdapterOptions {
  site: LeetCodeSite;
  fetchImpl?: typeof fetch;
  /** Optional user-provided Cookie header (never stolen; only explicitly supplied by user). */
  cookieHeader?: string;
  userAgent?: string;
  minRequestIntervalMs?: number;
}

interface GraphQlCodeSnippet {
  lang?: unknown;
  langSlug?: unknown;
  code?: unknown;
}

interface GraphQlTopicTag {
  name?: unknown;
  slug?: unknown;
  translatedName?: unknown;
}

interface GraphQlQuestion {
  questionId?: unknown;
  questionFrontendId?: unknown;
  title?: unknown;
  translatedTitle?: unknown;
  titleSlug?: unknown;
  content?: unknown;
  translatedContent?: unknown;
  isPaidOnly?: unknown;
  difficulty?: unknown;
  topicTags?: unknown;
  codeSnippets?: unknown;
  metaData?: unknown;
  exampleTestcaseList?: unknown;
  sampleTestCase?: unknown;
}

interface ParsedMetaData {
  name?: unknown;
  classname?: unknown;
  systemdesign?: unknown;
  params?: Array<{ name?: unknown; type?: unknown }>;
  return?: { type?: unknown };
}

const QUESTION_QUERY_GLOBAL = `
query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionId
    questionFrontendId
    title
    titleSlug
    content
    isPaidOnly
    difficulty
    topicTags { name slug }
    codeSnippets { lang langSlug code }
    metaData
    exampleTestcaseList
    sampleTestCase
  }
}
`;

const QUESTION_QUERY_CN = `
query questionData($titleSlug: String!) {
  question(titleSlug: $titleSlug) {
    questionId
    questionFrontendId
    title
    translatedTitle
    titleSlug
    content
    translatedContent
    isPaidOnly
    difficulty
    topicTags { name slug translatedName }
    codeSnippets { lang langSlug code }
    metaData
    exampleTestcaseList
    sampleTestCase
  }
}
`;

const DAILY_QUERY_GLOBAL = `
query questionOfToday {
  activeDailyCodingChallengeQuestion {
    date
    link
    question {
      titleSlug
      title
      difficulty
      isPaidOnly
    }
  }
}
`;

const DAILY_QUERY_CN = `
query questionOfToday {
  todayRecord {
    date
    question {
      titleSlug
      title
      translatedTitle
      difficulty
      isPaidOnly
    }
  }
}
`;

const SEARCH_QUERY_GLOBAL = `
query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
  problemsetQuestionList: questionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
    total: totalNum
    questions: data {
      questionFrontendId
      title
      titleSlug
      difficulty
      isPaidOnly
      topicTags { name slug }
    }
  }
}
`;

const SEARCH_QUERY_CN = `
query problemsetQuestionList($categorySlug: String, $limit: Int, $skip: Int, $filters: QuestionListFilterInput) {
  problemsetQuestionList(categorySlug: $categorySlug, limit: $limit, skip: $skip, filters: $filters) {
    total
    questions {
      frontendQuestionId
      title
      titleCn
      titleSlug
      difficulty
      paidOnly
      topicTags { name slug nameTranslated }
    }
  }
}
`;

const DEFAULT_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) AlgoCoach/0.2.0";

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function difficultyToTier(raw: string): 1 | 2 | 3 | 4 | 5 | undefined {
  const lower = raw.trim().toLowerCase();
  if (lower === "easy") return 1;
  if (lower === "medium") return 3;
  if (lower === "hard") return 5;
  return undefined;
}

function normalizeDifficultyLabel(raw: string): string | undefined {
  const lower = raw.trim().toLowerCase();
  if (lower === "easy") return "Easy";
  if (lower === "medium") return "Medium";
  if (lower === "hard") return "Hard";
  return raw.trim() || undefined;
}

function tierToDifficultyFilter(minTier?: number, maxTier?: number): string | undefined {
  if (minTier === undefined && maxTier === undefined) {
    return undefined;
  }
  const lo = minTier ?? 1;
  const hi = maxTier ?? 5;
  if (hi <= 2) return "EASY";
  if (lo >= 4) return "HARD";
  if (lo >= 2 && hi <= 4) return "MEDIUM";
  return undefined;
}

/**
 * Extracts expected outputs from LeetCode Markdown/HTML example blocks:
 * e.g., **Output:** [0,1] or **输出：** [0,1]
 */
export function extractLeetCodeExampleOutputs(statementMarkdown: string): string[] {
  const outputs: string[] = [];
  const regex =
    /(?:\*\*|__)?(?:Output|输出)(?:\*\*|__)?\s*[:：]\s*(?:\*\*|__)?\s*([^\n]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(statementMarkdown)) !== null) {
    const raw = (match[1] ?? "").trim().replace(/^`+|`+$/g, "").trim();
    if (raw.length > 0) {
      outputs.push(raw);
    }
  }
  return outputs;
}

function buildFunctionMeta(
  metaDataRaw: unknown,
  codeSnippetsRaw: unknown
): FunctionSignatureMeta | undefined {
  const codeSnippets: Record<string, string> = {};
  if (Array.isArray(codeSnippetsRaw)) {
    for (const item of codeSnippetsRaw as GraphQlCodeSnippet[]) {
      const slug = asString(item?.langSlug).trim();
      const code = asString(item?.code);
      if (slug && code) {
        codeSnippets[slug] = code;
      }
    }
  }

  let parsed: ParsedMetaData | undefined;
  if (typeof metaDataRaw === "string" && metaDataRaw.trim().length > 0) {
    try {
      parsed = JSON.parse(metaDataRaw) as ParsedMetaData;
    } catch {
      parsed = undefined;
    }
  } else if (metaDataRaw && typeof metaDataRaw === "object") {
    parsed = metaDataRaw as ParsedMetaData;
  }

  const entryName =
    asString(parsed?.name).trim() ||
    (parsed?.systemdesign ? `class:${asString(parsed.classname).trim()}` : "");
  const params = Array.isArray(parsed?.params)
    ? parsed.params
        .map((p) => ({
          name: asString(p?.name).trim(),
          type: asString(p?.type).trim()
        }))
        .filter((p) => p.name.length > 0 && p.type.length > 0)
    : [];
  const returnType = asString(parsed?.return?.type).trim() || "void";

  if (!entryName && Object.keys(codeSnippets).length === 0) {
    return undefined;
  }

  return {
    entryName,
    params,
    returnType,
    codeSnippets
  };
}

function buildSamples(
  question: GraphQlQuestion,
  statementMarkdown: string
): ProblemSample[] {
  const inputs: string[] = [];
  if (Array.isArray(question.exampleTestcaseList)) {
    for (const item of question.exampleTestcaseList) {
      if (typeof item === "string" && item.trim().length > 0) {
        inputs.push(item.replace(/\r\n/g, "\n").trim());
      }
    }
  } else if (typeof question.sampleTestCase === "string" && question.sampleTestCase.trim().length > 0) {
    inputs.push(question.sampleTestCase.replace(/\r\n/g, "\n").trim());
  }

  const expectedOutputs = extractLeetCodeExampleOutputs(statementMarkdown);
  return inputs.map((input, idx) => {
    const expectedOutput = expectedOutputs[idx];
    return {
      id: `sample-${idx + 1}`,
      input,
      ...(expectedOutput !== undefined ? { expectedOutput } : {}),
      isOriginal: true
    };
  });
}

export class LeetCodeAdapter implements ProblemSourceAdapter {
  readonly id: "leetcode-global" | "leetcode-cn";
  readonly displayName: string;
  readonly capabilities: AdapterCapabilities = {
    search: true,
    problemLists: true,
    directStatementFetch: true,
    directSamplesFetch: true,
    ioModes: ["function"],
    supportsOptionalUserSession: true
  };

  private readonly site: LeetCodeSite;
  private readonly host: string;
  private readonly keyPrefix: string;
  private readonly fetchImpl: typeof fetch;
  private readonly cookieHeader?: string;
  private readonly userAgent: string;
  private readonly minRequestIntervalMs: number;
  private lastRequestAt = 0;

  constructor(options: LeetCodeAdapterOptions) {
    this.site = options.site;
    this.id = options.site === "cn" ? "leetcode-cn" : "leetcode-global";
    this.displayName = options.site === "cn" ? "LeetCode CN (力扣中国)" : "LeetCode Global";
    this.host = options.site === "cn" ? "leetcode.cn" : "leetcode.com";
    this.keyPrefix = options.site === "cn" ? "lc-cn" : "lc-global";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.cookieHeader = options.cookieHeader;
    this.userAgent = options.userAgent ?? DEFAULT_UA;
    this.minRequestIntervalMs = Math.max(0, options.minRequestIntervalMs ?? 0);
  }

  canHandleUrl(url: string): boolean {
    try {
      const parsed = new URL(url.trim());
      const hostname = parsed.hostname.toLowerCase();
      const expectedHost = this.host;
      if (hostname !== expectedHost && hostname !== `www.${expectedHost}`) {
        return false;
      }
      return /^\/problems\/[a-z0-9-]+(?:\/.*)?$/i.test(parsed.pathname);
    } catch {
      return false;
    }
  }

  resolveRef(input: string): { sourceId: string; canonicalUrl?: string } | null {
    const trimmed = input.trim();
    if (!trimmed) {
      return null;
    }

    // Special daily alias
    if (/^(?:(?:lc|lc-cn|lc-global|leetcode|leetcode-cn|leetcode-global):)?(?:daily|today)$/i.test(trimmed)) {
      return { sourceId: "daily", canonicalUrl: `https://${this.host}/problemset/` };
    }

    // Full URL
    if (/^https?:\/\//i.test(trimmed)) {
      if (!this.canHandleUrl(trimmed)) {
        return null;
      }
      const parsed = new URL(trimmed);
      const match = parsed.pathname.match(/^\/problems\/([a-z0-9-]+)/i);
      const slug = match?.[1]?.toLowerCase();
      if (!slug) {
        return null;
      }
      return {
        sourceId: slug,
        canonicalUrl: `https://${this.host}/problems/${slug}/`
      };
    }

    // Prefixed ref
    const prefixMatch = trimmed.match(/^(lc-cn|lc-global|leetcode-cn|leetcode-global|lc):([a-z0-9-]+)$/i);
    if (prefixMatch) {
      const prefix = prefixMatch[1]!.toLowerCase();
      const slug = prefixMatch[2]!.toLowerCase();
      if (this.site === "cn" && (prefix === "lc-global" || prefix === "leetcode-global")) {
        return null;
      }
      if (this.site === "global" && (prefix === "lc-cn" || prefix === "leetcode-cn")) {
        return null;
      }
      return {
        sourceId: slug,
        canonicalUrl: `https://${this.host}/problems/${slug}/`
      };
    }

    // Bare kebab-case slug (e.g. "two-sum", "3sum")
    if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(trimmed) && !/^(?:P|B|CF|AT)\d+/i.test(trimmed) && !/^\d+[A-Z]\d?$/i.test(trimmed)) {
      const slug = trimmed.toLowerCase();
      return {
        sourceId: slug,
        canonicalUrl: `https://${this.host}/problems/${slug}/`
      };
    }

    return null;
  }

  async fetchDailyProblem(signal?: AbortSignal): Promise<ProblemDocument> {
    const query = this.site === "cn" ? DAILY_QUERY_CN : DAILY_QUERY_GLOBAL;
    const payload = await this.graphqlRequest<Record<string, unknown>>(query, {}, signal);

    let slug = "";
    if (this.site === "cn") {
      const records = payload.todayRecord;
      if (Array.isArray(records) && records.length > 0) {
        const first = records[0] as { question?: { titleSlug?: unknown } } | undefined;
        slug = asString(first?.question?.titleSlug).trim();
      }
    } else {
      const active = payload.activeDailyCodingChallengeQuestion as
        | { question?: { titleSlug?: unknown } }
        | undefined;
      slug = asString(active?.question?.titleSlug).trim();
    }

    if (!slug) {
      throw new ProblemAdapterError(
        "SCHEMA_DRIFT",
        this.id,
        `Could not extract daily problem slug from ${this.displayName} GraphQL response.`
      );
    }

    return this.fetchProblem(slug, { signal });
  }

  async fetchProblem(
    ref: string,
    opts?: { forceRefresh?: boolean; signal?: AbortSignal }
  ): Promise<ProblemDocument> {
    const resolved = this.resolveRef(ref);
    if (!resolved) {
      throw new ProblemAdapterError(
        "NOT_FOUND",
        this.id,
        `Invalid ${this.displayName} problem reference: "${ref}".`
      );
    }

    if (resolved.sourceId === "daily") {
      return this.fetchDailyProblem(opts?.signal);
    }

    const query = this.site === "cn" ? QUESTION_QUERY_CN : QUESTION_QUERY_GLOBAL;
    const data = await this.graphqlRequest<{ question?: GraphQlQuestion | null }>(
      query,
      { titleSlug: resolved.sourceId },
      opts?.signal
    );

    const question = data.question;
    if (!question || typeof question !== "object") {
      throw new ProblemAdapterError(
        "NOT_FOUND",
        this.id,
        `Problem "${resolved.sourceId}" was not found on ${this.displayName}.`
      );
    }

    const isPaidOnly = Boolean(question.isPaidOnly);
    const rawHtml =
      this.site === "cn"
        ? asString(question.translatedContent) || asString(question.content)
        : asString(question.content);

    if (isPaidOnly && !rawHtml.trim()) {
      throw new ProblemAdapterError(
        "PAID_ONLY",
        this.id,
        `Problem "${resolved.sourceId}" is a paid/VIP-only problem on ${this.displayName}. Please paste the statement via Markdown/Clipboard import or configure your own optional session.`
      );
    }

    const slug = asString(question.titleSlug).trim() || resolved.sourceId;
    const title =
      this.site === "cn"
        ? asString(question.translatedTitle).trim() || asString(question.title).trim()
        : asString(question.title).trim();

    if (!title) {
      throw new ProblemAdapterError(
        "SCHEMA_DRIFT",
        this.id,
        `${this.displayName} response for "${slug}" is missing a valid title.`
      );
    }

    const statementMarkdown = htmlToMarkdown(rawHtml);
    const functionMeta = buildFunctionMeta(question.metaData, question.codeSnippets);
    const samples = buildSamples(question, statementMarkdown);
    const rawDiff = asString(question.difficulty);
    const normalizedTier = difficultyToTier(rawDiff);
    const rawTags = Array.isArray(question.topicTags)
      ? (question.topicTags as GraphQlTopicTag[])
          .map((tag) => asString(tag?.slug).trim() || asString(tag?.name).trim())
          .filter(Boolean)
      : [];

    const completeness = statementMarkdown.length > 0
      ? "full"
      : samples.length > 0
        ? "samples_only"
        : "metadata_only";

    return {
      schemaVersion: "problem-doc/v2",
      problemKey: `${this.keyPrefix}:${slug}`,
      source: this.id,
      sourceId: slug,
      canonicalUrl: `https://${this.host}/problems/${slug}/`,
      title,
      locale: this.site === "cn" ? "zh-CN" : "en-US",
      completeness,
      ioMode: "function",
      ...(statementMarkdown ? { statementMarkdown } : {}),
      samples,
      ...(functionMeta ? { functionMeta } : {}),
      ...(rawDiff
        ? {
            difficulty: {
              rawLabel: normalizeDifficultyLabel(rawDiff),
              ...(normalizedTier !== undefined ? { normalizedTier } : {})
            }
          }
        : {}),
      rawTags,
      provenance: {
        ingestChannel: "builtin-adapter",
        fetchedAt: new Date().toISOString(),
        isPaidOnly
      }
    };
  }

  async search(
    query: ProblemSearchQuery,
    signal?: AbortSignal
  ): Promise<{ items: ProblemDocument[]; total?: number }> {
    const limit = 20;
    const page = Math.max(1, query.page ?? 1);
    const skip = (page - 1) * limit;
    const filters: Record<string, unknown> = {};

    if (query.keyword?.trim()) {
      filters.searchKeywords = query.keyword.trim();
    }
    if (query.tags && query.tags.length > 0) {
      filters.tags = query.tags;
    }
    const diffFilter = tierToDifficultyFilter(query.minTier, query.maxTier);
    if (diffFilter) {
      filters.difficulty = diffFilter;
    }

    const gql = this.site === "cn" ? SEARCH_QUERY_CN : SEARCH_QUERY_GLOBAL;
    const data = await this.graphqlRequest<{
      problemsetQuestionList?: {
        total?: unknown;
        questions?: Array<Record<string, unknown>>;
      };
    }>(gql, { categorySlug: "", limit, skip, filters }, signal);

    const list = data.problemsetQuestionList;
    if (!list || !Array.isArray(list.questions)) {
      throw new ProblemAdapterError(
        "SCHEMA_DRIFT",
        this.id,
        `${this.displayName} search response did not include a question list.`
      );
    }

    const items: ProblemDocument[] = [];
    for (const q of list.questions) {
      const slug = asString(q.titleSlug).trim();
      const title =
        this.site === "cn"
          ? asString(q.titleCn).trim() || asString(q.title).trim()
          : asString(q.title).trim();
      if (!slug || !title) {
        continue;
      }
      const rawDiff = asString(q.difficulty);
      const tier = difficultyToTier(rawDiff);
      const tags = Array.isArray(q.topicTags)
        ? (q.topicTags as GraphQlTopicTag[])
            .map((t) => asString(t?.slug).trim() || asString(t?.name).trim())
            .filter(Boolean)
        : [];
      const isPaidOnly = Boolean(q.isPaidOnly ?? q.paidOnly);

      items.push({
        schemaVersion: "problem-doc/v2",
        problemKey: `${this.keyPrefix}:${slug}`,
        source: this.id,
        sourceId: slug,
        canonicalUrl: `https://${this.host}/problems/${slug}/`,
        title,
        locale: this.site === "cn" ? "zh-CN" : "en-US",
        completeness: "metadata_only",
        ioMode: "function",
        samples: [],
        ...(rawDiff
          ? {
              difficulty: {
                rawLabel: normalizeDifficultyLabel(rawDiff),
                ...(tier !== undefined ? { normalizedTier: tier } : {})
              }
            }
          : {}),
        rawTags: tags,
        provenance: {
          ingestChannel: "builtin-adapter",
          fetchedAt: new Date().toISOString(),
          isPaidOnly
        }
      });
    }

    const total = typeof list.total === "number" ? list.total : undefined;
    return { items, ...(total !== undefined ? { total } : {}) };
  }

  async fetchProblemList(
    listId: string,
    _signal?: AbortSignal
  ): Promise<{ id: string; title: string; items: ProblemDocument[] }> {
    const sheet = getCuratedSheet(listId);
    if (!sheet) {
      throw new ProblemAdapterError(
        "NOT_FOUND",
        this.id,
        `Unknown curated problem list "${listId}". Available lists: hot-100, blind-75, neetcode-150.`
      );
    }
    return {
      id: sheet.id,
      title: this.site === "cn" ? sheet.titleZh : sheet.title,
      items: sheet.items.map((item) => curatedEntryToMetadataDocument(item, this.id))
    };
  }

  async healthCheck(
    signal?: AbortSignal
  ): Promise<{ ok: boolean; code?: ProblemAdapterError["code"]; message?: string }> {
    try {
      const query = this.site === "cn" ? DAILY_QUERY_CN : DAILY_QUERY_GLOBAL;
      await this.graphqlRequest(query, {}, signal);
      return { ok: true, message: `${this.displayName} Guest GraphQL reachable.` };
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

  private async throttle(): Promise<void> {
    if (this.minRequestIntervalMs <= 0) {
      return;
    }
    const now = Date.now();
    const waitMs = this.minRequestIntervalMs - (now - this.lastRequestAt);
    if (waitMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
    this.lastRequestAt = Date.now();
  }

  private async graphqlRequest<T>(
    query: string,
    variables: Record<string, unknown>,
    signal?: AbortSignal
  ): Promise<T> {
    await this.throttle();

    const headers: Record<string, string> = {
      "content-type": "application/json",
      referer: `https://${this.host}/`,
      origin: `https://${this.host}`,
      "user-agent": this.userAgent
    };
    if (this.cookieHeader?.trim()) {
      headers.cookie = this.cookieHeader.trim();
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`https://${this.host}/graphql`, {
        method: "POST",
        headers,
        body: JSON.stringify({ query, variables }),
        signal
      });
    } catch (error) {
      throw new ProblemAdapterError(
        "NETWORK_ERROR",
        this.id,
        `Network error connecting to ${this.displayName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (response.status === 403) {
      throw new ProblemAdapterError(
        "ANTIBOT_BLOCKED",
        this.id,
        `${this.displayName} returned HTTP 403 (edge protection / anti-bot). Please downgrade to Markdown/Clipboard import or open the problem in your browser.`
      );
    }
    if (response.status === 401) {
      throw new ProblemAdapterError(
        "AUTH_REQUIRED",
        this.id,
        `${this.displayName} returned HTTP 401. Please import via Clipboard/Markdown or configure an optional user session.`
      );
    }
    if (response.status === 429) {
      throw new ProblemAdapterError(
        "RATE_LIMITED",
        this.id,
        `${this.displayName} rate limited the request (HTTP 429). Please retry shortly or use local cache.`
      );
    }
    if (!response.ok) {
      throw new ProblemAdapterError(
        "NETWORK_ERROR",
        this.id,
        `${this.displayName} GraphQL failed with HTTP ${response.status}.`
      );
    }

    let json: { data?: T; errors?: Array<{ message?: string }> };
    try {
      json = (await response.json()) as { data?: T; errors?: Array<{ message?: string }> };
    } catch {
      throw new ProblemAdapterError(
        "SCHEMA_DRIFT",
        this.id,
        `${this.displayName} returned non-JSON response (possible edge challenge or schema change).`
      );
    }

    if (!json || typeof json !== "object" || !json.data) {
      const errMsg = json?.errors?.[0]?.message;
      throw new ProblemAdapterError(
        "SCHEMA_DRIFT",
        this.id,
        errMsg
          ? `${this.displayName} GraphQL error: ${errMsg}`
          : `${this.displayName} GraphQL payload missing "data" field.`
      );
    }

    return json.data;
  }
}

export function createLeetCodeGlobalAdapter(
  options?: Omit<LeetCodeAdapterOptions, "site">
): LeetCodeAdapter {
  return new LeetCodeAdapter({ ...options, site: "global" });
}

export function createLeetCodeCnAdapter(
  options?: Omit<LeetCodeAdapterOptions, "site">
): LeetCodeAdapter {
  return new LeetCodeAdapter({ ...options, site: "cn" });
}
