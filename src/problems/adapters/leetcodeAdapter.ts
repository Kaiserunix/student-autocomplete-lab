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
import {
  DEFAULT_HTTP_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  fetchWithTimeout,
  isAntiBotChallenge,
  mapHttpStatusError
} from "./httpClient";

export type LeetCodeSite = "global" | "cn";

export interface LeetCodeAdapterOptions {
  site: LeetCodeSite;
  fetchImpl?: typeof fetch;
  /** Optional user-provided Cookie header (never stolen; only explicitly supplied by user). */
  cookieHeader?: string;
  userAgent?: string;
  minRequestIntervalMs?: number;
  timeoutMs?: number;
  indexTtlMs?: number;
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

interface LeetCodeRestProblemsResponse {
  stat_status_pairs?: Array<{
    stat?: {
      question_id?: unknown;
      frontend_question_id?: unknown;
      question__title_slug?: unknown;
    };
  }>;
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

const DEFAULT_INDEX_TTL_MS = 30 * 60 * 1000;

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

function normalizeFrontendIdKey(raw: string): string {
  const compact = raw.trim().replace(/\s+/g, " ").toUpperCase();
  if (/^\d+$/.test(compact)) {
    return String(Number.parseInt(compact, 10));
  }
  const series = compact.match(/^(LCR|LCP)[-\s]?(\d+)$/);
  if (series?.[1] && series?.[2]) {
    return `${series[1]} ${series[2]}`;
  }
  return compact;
}

function frontendIdAliases(raw: string): string[] {
  const exact = normalizeFrontendIdKey(raw);
  const aliases = [exact];
  const series = exact.match(/^(LCR|LCP)\s+0*(\d+)$/);
  if (series?.[1] && series?.[2]) {
    const unpadded = `${series[1]} ${series[2]}`;
    if (unpadded !== exact) {
      aliases.push(unpadded);
    }
  }
  return aliases;
}

function stripOuterFormatting(raw: string): string {
  let text = raw.trim();
  // Strip symmetric bold/italic wrappers around the value itself
  while (
    (text.startsWith("**") && text.endsWith("**") && text.length > 4) ||
    (text.startsWith("__") && text.endsWith("__") && text.length > 4)
  ) {
    text = text.slice(2, -2).trim();
  }
  // Strip symmetric backtick code wrappers (single or double)
  if (text.startsWith("``") && text.endsWith("``") && text.length > 4) {
    text = text.slice(2, -2).trim();
  } else if (text.startsWith("`") && text.endsWith("`") && text.length > 2) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

/**
 * Extracts expected outputs from LeetCode Markdown/HTML example blocks:
 * supports inline `**Output:** [0,1]`, inline code ``**Output:** `[0,1]` ``,
 * Chinese `**输出：** 2` / `输出：`, and newline-after-`Output:` (plain or fenced code block).
 */
export function extractLeetCodeExampleOutputs(statementMarkdown: string): string[] {
  const outputs: string[] = [];
  const lines = statementMarkdown.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

  const lineLabelRe =
    /^(?:[-*+>]+\s*)?(?:[*_`]{1,3})?(?:Output|输出)(?:\*\*|__|`)?\s*[:：](?:`(?=\s|$|\*\*|__)|(?:\*\*|__))*(.*)$/i;
  const inlineBoldLabelRe =
    /(?:\*\*|__)(?:Output|输出)(?:\*\*|__)?\s*[:：](?:\*\*|__)?\s*([^\n]+)/gi;
  const stopLineRe =
    /^(?:(?:[-*+>]+\s*)?(?:[*_`]{1,3})?(?:(?:Input|Output|Explanation|Example|Constraints|Follow[- ]?up)\b|(?:输入|输出|解释|说明|示例|提示))|#{1,6}\s|```)/i;

  for (let i = 0; i < lines.length; i += 1) {
    const trimmedLine = lines[i]!.trim();
    const match = trimmedLine.match(lineLabelRe);
    if (!match) {
      // Fallback for rare single-line `**Input:** ... **Output:** ...` format
      let inlineMatch: RegExpExecArray | null;
      inlineBoldLabelRe.lastIndex = 0;
      while ((inlineMatch = inlineBoldLabelRe.exec(trimmedLine)) !== null) {
        const cleaned = stripOuterFormatting(inlineMatch[1] ?? "");
        if (cleaned.length > 0) {
          outputs.push(cleaned);
        }
      }
      continue;
    }

    const sameLine = stripOuterFormatting(match[1] ?? "");
    if (sameLine.length > 0) {
      outputs.push(sameLine);
      continue;
    }

    // Nothing on the same line -> inspect subsequent line(s)
    let j = i + 1;
    while (j < lines.length && lines[j]!.trim() === "") {
      j += 1;
    }
    if (j >= lines.length) {
      break;
    }

    if (lines[j]!.trim().startsWith("```")) {
      j += 1;
      const blockLines: string[] = [];
      while (j < lines.length && !lines[j]!.trim().startsWith("```")) {
        blockLines.push(lines[j]!.trimEnd());
        j += 1;
      }
      const blockVal = blockLines.join("\n").trim();
      if (blockVal.length > 0) {
        outputs.push(blockVal);
      }
      i = j;
      continue;
    }

    const collected: string[] = [];
    while (j < lines.length) {
      const nextTrimmed = lines[j]!.trim();
      if (!nextTrimmed || stopLineRe.test(nextTrimmed)) {
        break;
      }
      collected.push(stripOuterFormatting(nextTrimmed));
      j += 1;
    }
    const value = collected.join("\n").trim();
    if (value.length > 0) {
      outputs.push(value);
    }
    i = j - 1;
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
  private readonly timeoutMs: number;
  private readonly indexTtlMs: number;
  private lastRequestAt = 0;
  private cachedCnFrontendIndex: Map<string, string> | null = null;
  private cnIndexCachedAt = 0;
  private readonly resolvedFrontendCache = new Map<string, string>();

  constructor(options: LeetCodeAdapterOptions) {
    this.site = options.site;
    this.id = options.site === "cn" ? "leetcode-cn" : "leetcode-global";
    this.displayName = options.site === "cn" ? "LeetCode CN (力扣中国)" : "LeetCode Global";
    this.host = options.site === "cn" ? "leetcode.cn" : "leetcode.com";
    this.keyPrefix = options.site === "cn" ? "lc-cn" : "lc-global";
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.cookieHeader = options.cookieHeader;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.minRequestIntervalMs = Math.max(0, options.minRequestIntervalMs ?? 0);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
    this.indexTtlMs = options.indexTtlMs ?? DEFAULT_INDEX_TTL_MS;
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

    // Special daily alias (respecting site-specific prefix when provided)
    const dailyMatch = trimmed.match(
      /^(?:(lc-cn|lc-global|leetcode-cn|leetcode-global|lc|leetcode):)?(?:daily|today)$/i
    );
    if (dailyMatch) {
      const prefix = dailyMatch[1]?.toLowerCase();
      if (prefix && !this.matchesSitePrefix(prefix)) {
        return null;
      }
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

    // Colon-prefixed ref (supports slugs, numeric IDs, and LCR/LCP series IDs)
    const prefixMatch = trimmed.match(
      /^(lc-cn|lc-global|leetcode-cn|leetcode-global|lc|leetcode):(.+)$/i
    );
    if (prefixMatch?.[1] && prefixMatch?.[2]) {
      const prefix = prefixMatch[1].toLowerCase();
      if (!this.matchesSitePrefix(prefix)) {
        return null;
      }
      const body = prefixMatch[2].trim();
      const frontendId = this.parseFrontendIdToken(body);
      if (frontendId) {
        return { sourceId: `#${frontendId}` };
      }
      if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(body)) {
        const slug = body.toLowerCase();
        return {
          sourceId: slug,
          canonicalUrl: `https://${this.host}/problems/${slug}/`
        };
      }
      return null;
    }

    // Compact LC numeric prefix (e.g. "LC1", "LC-146", "lc 146", "lc#1", "力扣1")
    const compactLcNum = trimmed.match(/^(?:lc|leetcode|力扣)[-\s#]?(\d{1,5})$/i);
    if (compactLcNum?.[1]) {
      return { sourceId: `#${normalizeFrontendIdKey(compactLcNum[1])}` };
    }

    // Bare LCR / LCP frontend ID (e.g. "LCR 007", "LCR-007", "LCR007", "LCP 01")
    const seriesMatch = trimmed.match(/^(LCR|LCP)[-\s]?(\d{1,4})$/i);
    if (seriesMatch?.[1] && seriesMatch?.[2]) {
      return { sourceId: `#${seriesMatch[1].toUpperCase()} ${seriesMatch[2]}` };
    }

    // Bare numeric or #-prefixed frontend ID (e.g. "1", "#1", "146", "#146")
    const bareNum = trimmed.match(/^#?(\d{1,5})$/);
    if (bareNum?.[1]) {
      return { sourceId: `#${normalizeFrontendIdKey(bareNum[1])}` };
    }

    // Bare kebab-case slug (e.g. "two-sum", "3sum")
    if (
      /[a-z]/i.test(trimmed) &&
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/i.test(trimmed) &&
      !/^(?:[PBTU]\d+|CF-?\d+[A-Z]\d?|SP\d+|UVA\d+|AT_[a-z0-9_]+|NC-?\d+|(?:abc|arc|agc|ahc)\d+[a-z]\d?)$/i.test(
        trimmed
      ) &&
      !/^\d+-?[A-Z]\d?$/i.test(trimmed)
    ) {
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

    const titleSlug = resolved.sourceId.startsWith("#")
      ? await this.resolveFrontendIdToSlug(resolved.sourceId.slice(1), opts?.forceRefresh ?? false, opts?.signal)
      : resolved.sourceId;

    const query = this.site === "cn" ? QUESTION_QUERY_CN : QUESTION_QUERY_GLOBAL;
    const data = await this.graphqlRequest<{ question?: GraphQlQuestion | null }>(
      query,
      { titleSlug },
      opts?.signal
    );

    const question = data.question;
    if (!question || typeof question !== "object") {
      throw new ProblemAdapterError(
        "NOT_FOUND",
        this.id,
        `Problem "${titleSlug}" was not found on ${this.displayName}.`
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
        `Problem "${titleSlug}" is a paid/VIP-only problem on ${this.displayName}. Please paste the statement via Markdown/Clipboard import or configure your own optional session.`
      );
    }

    const slug = asString(question.titleSlug).trim() || titleSlug;
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

    const completeness =
      statementMarkdown.length > 0
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

  private matchesSitePrefix(prefix: string): boolean {
    if (this.site === "cn" && (prefix === "lc-global" || prefix === "leetcode-global")) {
      return false;
    }
    if (this.site === "global" && (prefix === "lc-cn" || prefix === "leetcode-cn")) {
      return false;
    }
    return true;
  }

  private parseFrontendIdToken(body: string): string | null {
    const trimmed = body.trim();
    if (/^\d{1,5}$/.test(trimmed)) {
      return normalizeFrontendIdKey(trimmed);
    }
    const series = trimmed.match(/^(LCR|LCP)[-\s]?(\d{1,4})$/i);
    if (series?.[1] && series?.[2]) {
      return `${series[1].toUpperCase()} ${series[2]}`;
    }
    return null;
  }

  private async resolveFrontendIdToSlug(
    frontendId: string,
    forceRefresh: boolean,
    signal?: AbortSignal
  ): Promise<string> {
    const wantedAliases = frontendIdAliases(frontendId);
    if (!forceRefresh) {
      for (const alias of wantedAliases) {
        const hit = this.resolvedFrontendCache.get(alias);
        if (hit) {
          return hit;
        }
      }
    }

    // On LeetCode CN, try cached REST `/api/problems/all/` first for exact O(1) lookup
    if (this.site === "cn") {
      const index = await this.loadCnFrontendIndex(forceRefresh, signal);
      if (index) {
        for (const alias of wantedAliases) {
          const slug = index.get(alias);
          if (slug) {
            this.resolvedFrontendCache.set(alias, slug);
            return slug;
          }
        }
      }
    }

    // GraphQL exact match (primary on Global since `/api/problems/all/` is 403 Cloudflare; fallback on CN)
    const gql = this.site === "cn" ? SEARCH_QUERY_CN : SEARCH_QUERY_GLOBAL;
    const data = await this.graphqlRequest<{
      problemsetQuestionList?: {
        questions?: Array<Record<string, unknown>>;
      };
    }>(
      gql,
      {
        categorySlug: "",
        limit: 50,
        skip: 0,
        filters: { searchKeywords: frontendId.trim() }
      },
      signal
    );

    const questions = data.problemsetQuestionList?.questions;
    if (Array.isArray(questions)) {
      const wantedSet = new Set(wantedAliases);
      for (const q of questions) {
        const rawFid = q.questionFrontendId ?? q.frontendQuestionId;
        const fidStr =
          typeof rawFid === "number" || typeof rawFid === "string" ? String(rawFid) : "";
        const slug = asString(q.titleSlug).trim();
        if (!fidStr || !slug) {
          continue;
        }
        const candidateAliases = frontendIdAliases(fidStr);
        if (candidateAliases.some((a) => wantedSet.has(a))) {
          for (const alias of wantedAliases) {
            this.resolvedFrontendCache.set(alias, slug);
          }
          return slug;
        }
      }
    }

    throw new ProblemAdapterError(
      "NOT_FOUND",
      this.id,
      `Could not resolve ${this.displayName} problem #${frontendId} to a titleSlug.`
    );
  }

  private async loadCnFrontendIndex(
    forceRefresh: boolean,
    signal?: AbortSignal
  ): Promise<Map<string, string> | null> {
    if (
      !forceRefresh &&
      this.cachedCnFrontendIndex &&
      Date.now() - this.cnIndexCachedAt < this.indexTtlMs
    ) {
      return this.cachedCnFrontendIndex;
    }

    try {
      await this.throttle();
      const headers: Record<string, string> = {
        accept: "application/json",
        referer: "https://leetcode.cn/problemset/",
        "user-agent": this.userAgent
      };
      if (this.cookieHeader?.trim()) {
        headers.cookie = this.cookieHeader.trim();
      }
      const response = await fetchWithTimeout(
        this.fetchImpl,
        "https://leetcode.cn/api/problems/all/",
        { headers, signal },
        this.timeoutMs
      );
      if (!response.ok) {
        return null;
      }
      const payload = (await response.json()) as LeetCodeRestProblemsResponse;
      if (!Array.isArray(payload?.stat_status_pairs)) {
        return null;
      }

      const map = new Map<string, string>();
      for (const pair of payload.stat_status_pairs) {
        const stat = pair?.stat;
        if (!stat) continue;
        const rawFid = stat.frontend_question_id;
        const fidStr =
          typeof rawFid === "number" || typeof rawFid === "string" ? String(rawFid).trim() : "";
        const slug = asString(stat.question__title_slug).trim();
        if (!fidStr || !slug) continue;
        for (const alias of frontendIdAliases(fidStr)) {
          if (!map.has(alias)) {
            map.set(alias, slug);
          }
        }
      }
      if (map.size > 0) {
        this.cachedCnFrontendIndex = map;
        this.cnIndexCachedAt = Date.now();
        return map;
      }
    } catch {
      // Non-fatal: caller falls back to GraphQL search
    }
    return null;
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

    const endpoint = `https://${this.host}/graphql`;
    let response: Response;
    try {
      response = await fetchWithTimeout(
        this.fetchImpl,
        endpoint,
        {
          method: "POST",
          headers,
          body: JSON.stringify({ query, variables }),
          signal
        },
        this.timeoutMs
      );
    } catch (error) {
      throw new ProblemAdapterError(
        "NETWORK_ERROR",
        this.id,
        `Network error connecting to ${this.displayName}: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (!response.ok) {
      throw mapHttpStatusError(
        this.id,
        response.status,
        endpoint,
        "Please downgrade to Markdown/Clipboard import or configure an optional user session."
      );
    }

    const bodyText = await response.text();
    let json: { data?: T; errors?: Array<{ message?: string }> };
    try {
      json = JSON.parse(bodyText) as { data?: T; errors?: Array<{ message?: string }> };
    } catch {
      if (isAntiBotChallenge(response, bodyText)) {
        throw new ProblemAdapterError(
          "ANTIBOT_BLOCKED",
          this.id,
          `${this.displayName} returned an anti-bot challenge page. Please downgrade to Markdown/Clipboard import.`
        );
      }
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
