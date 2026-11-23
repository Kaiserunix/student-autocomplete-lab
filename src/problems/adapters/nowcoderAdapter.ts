import {
  ProblemAdapterError,
  type AdapterCapabilities,
  type ProblemDocument,
  type ProblemSample,
  type ProblemSourceAdapter
} from "../../core/contracts";
import { decodeHtmlEntities, htmlToMarkdown, stripHtmlTags } from "./htmlUtils";
import {
  DEFAULT_HTTP_TIMEOUT_MS,
  DEFAULT_USER_AGENT,
  fetchWithTimeout,
  isAntiBotChallenge,
  mapHttpStatusError
} from "./httpClient";

export interface NowCoderAdapterOptions {
  fetchImpl?: typeof fetch;
  userAgent?: string;
  timeoutMs?: number;
}

export interface ParsedNowCoderHtml {
  title: string;
  locale: "zh-CN" | "en-US";
  statementMarkdown: string;
  samples: ProblemSample[];
  constraints?: {
    timeLimitMs?: number;
    memoryLimitMb?: number;
  };
  difficulty?: {
    rawLabel: string;
    normalizedTier?: 1 | 2 | 3 | 4 | 5;
  };
  rawTags: string[];
}

interface NowCoderPageInfo {
  title?: string;
  difficultyLabel?: string;
  timeLimitMs?: number;
  memoryLimitMb?: number;
  tags?: string[];
}

const NOWCODER_GUIDANCE =
  "Use Competitive Companion (Localhost Bridge) from your browser or paste the statement via Markdown/Clipboard import.";

const NOWCODER_DIFFICULTY_TIERS: Record<string, 1 | 2 | 3 | 4 | 5> = {
  入门: 1,
  简单: 2,
  中等: 3,
  较难: 4,
  困难: 5,
  easy: 2,
  medium: 3,
  hard: 5
};

function extractBalancedDivsByClass(html: string, className: string): string[] {
  const results: string[] = [];
  const openRe = new RegExp(
    `<div\\b[^>]*\\bclass=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`,
    "gi"
  );
  const tagRe = /<\/?div\b[^>]*>/gi;

  let openMatch: RegExpExecArray | null;
  while ((openMatch = openRe.exec(html)) !== null) {
    const start = openMatch.index + openMatch[0].length;
    tagRe.lastIndex = start;
    let depth = 1;
    let match: RegExpExecArray | null;
    let endIndex = html.length;
    while ((match = tagRe.exec(html)) !== null) {
      if (match[0].startsWith("</")) {
        depth -= 1;
        if (depth === 0) {
          endIndex = match.index;
          break;
        }
      } else {
        depth += 1;
      }
    }
    results.push(html.slice(start, endIndex));
    openRe.lastIndex = Math.max(openRe.lastIndex, endIndex);
  }
  return results;
}

function extractBalancedHiddenSsrDiv(html: string): string | undefined {
  const openRe = /<div\b[^>]*\bstyle=["'][^"']*display\s*:\s*none[^"']*["'][^>]*>/gi;
  const tagRe = /<\/?div\b[^>]*>/gi;

  let openMatch: RegExpExecArray | null;
  while ((openMatch = openRe.exec(html)) !== null) {
    const start = openMatch.index + openMatch[0].length;
    tagRe.lastIndex = start;
    let depth = 1;
    let match: RegExpExecArray | null;
    let endIndex = html.length;
    while ((match = tagRe.exec(html)) !== null) {
      if (match[0].startsWith("</")) {
        depth -= 1;
        if (depth === 0) {
          endIndex = match.index;
          break;
        }
      } else {
        depth += 1;
      }
    }
    const inner = html.slice(start, endIndex);
    if (/(?:题目描述|输入描述|输出描述|示例|subject-describe|question-oi)/i.test(inner)) {
      return inner;
    }
    openRe.lastIndex = Math.max(openRe.lastIndex, endIndex);
  }
  return undefined;
}

function extractBalancedJsObject(html: string, anchorRe: RegExp): string | undefined {
  const anchor = anchorRe.exec(html);
  if (!anchor) {
    return undefined;
  }
  const braceStart = html.indexOf("{", anchor.index + anchor[0].length - 1);
  if (braceStart < 0) {
    return undefined;
  }
  let depth = 0;
  let inString: "'" | '"' | null = null;
  let escaped = false;
  for (let i = braceStart; i < html.length; i += 1) {
    const ch = html[i]!;
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === inString) {
        inString = null;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      inString = ch;
    } else if (ch === "{") {
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        return html.slice(braceStart, i + 1);
      }
    }
  }
  return undefined;
}

function extractJsStringField(objText: string, fieldName: string): string | undefined {
  const re = new RegExp(
    `(?:["']${fieldName}["']|\\b${fieldName})\\s*:\\s*(?:"((?:\\\\.|[^"\\\\])*)"|'((?:\\\\.|[^'\\\\])*)')`
  );
  const match = objText.match(re);
  const raw = match?.[1] ?? match?.[2];
  if (!raw) {
    return undefined;
  }
  return decodeHtmlEntities(
    raw
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .replace(/\\n/g, "\n")
      .replace(/\\\\/g, "\\")
  ).trim();
}

function extractJsNumberField(objText: string, fieldName: string): number | undefined {
  const re = new RegExp(`(?:["']${fieldName}["']|\\b${fieldName})\\s*:\\s*([\\d.]+)`);
  const match = objText.match(re);
  if (!match?.[1]) {
    return undefined;
  }
  const val = Number.parseFloat(match[1]);
  return Number.isFinite(val) ? val : undefined;
}

function parsePageInfo(html: string): NowCoderPageInfo {
  const objText = extractBalancedJsObject(html, /window\.pageInfo\s*=\s*\{/);
  if (!objText) {
    return {};
  }

  // Try strict JSON first
  try {
    const parsed = JSON.parse(objText) as Record<string, unknown>;
    const title =
      (typeof parsed.questionTitle === "string" && parsed.questionTitle.trim()) ||
      (typeof parsed.title === "string" && parsed.title.trim()) ||
      undefined;
    const difficultyLabel =
      (typeof parsed.difficulty_var === "string" && parsed.difficulty_var.trim()) ||
      (typeof parsed.difficulty === "string" && parsed.difficulty.trim()) ||
      undefined;
    const rawTime = typeof parsed.timeLimit === "number" ? parsed.timeLimit : undefined;
    const rawMem = typeof parsed.memoryLimit === "number" ? parsed.memoryLimit : undefined;
    const timeLimitMs =
      rawTime !== undefined && rawTime > 0
        ? rawTime <= 30
          ? Math.round(rawTime * 1000)
          : Math.round(rawTime)
        : undefined;
    const memoryLimitMb =
      rawMem !== undefined && rawMem > 0
        ? rawMem > 4096
          ? Math.round(rawMem / 1024)
          : Math.round(rawMem)
        : undefined;
    const tags = Array.isArray(parsed.tagNames)
      ? parsed.tagNames.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      : undefined;
    return {
      ...(title ? { title: decodeHtmlEntities(title) } : {}),
      ...(difficultyLabel ? { difficultyLabel } : {}),
      ...(timeLimitMs !== undefined ? { timeLimitMs } : {}),
      ...(memoryLimitMb !== undefined ? { memoryLimitMb } : {}),
      ...(tags && tags.length > 0 ? { tags } : {})
    };
  } catch {
    // JS object literal with unquoted keys / single quotes
  }

  const title =
    extractJsStringField(objText, "questionTitle") ?? extractJsStringField(objText, "title");
  const difficultyLabel =
    extractJsStringField(objText, "difficulty_var") ?? extractJsStringField(objText, "difficulty");
  const rawTime = extractJsNumberField(objText, "timeLimit");
  const rawMem = extractJsNumberField(objText, "memoryLimit");
  const timeLimitMs =
    rawTime !== undefined && rawTime > 0
      ? rawTime <= 30
        ? Math.round(rawTime * 1000)
        : Math.round(rawTime)
      : undefined;
  const memoryLimitMb =
    rawMem !== undefined && rawMem > 0
      ? rawMem > 4096
        ? Math.round(rawMem / 1024)
        : Math.round(rawMem)
      : undefined;

  return {
    ...(title ? { title } : {}),
    ...(difficultyLabel ? { difficultyLabel } : {}),
    ...(timeLimitMs !== undefined ? { timeLimitMs } : {}),
    ...(memoryLimitMb !== undefined ? { memoryLimitMb } : {})
  };
}

function cleanNowCoderTitle(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(
      /\s*[-_]\s*(?:牛客竞赛(?:OJ)?|牛客题霸|牛客网|NowCoder|ACM\/NOI.*).*$/i,
      ""
    )
    .trim();
}

function parseConstraintsFromText(
  text: string
): { timeLimitMs?: number; memoryLimitMb?: number } | undefined {
  let timeLimitMs: number | undefined;
  let memoryLimitMb: number | undefined;

  const timeMatch =
    text.match(/时间限制[^。\n]*?C\/C\+\+\s*([\d.]+)\s*(秒|s|ms|毫秒)/i) ??
    text.match(/(?:时间限制|Time\s*Limit)\s*[:：]?\s*(?:C\/C\+\+\s*)?([\d.]+)\s*(秒|s|ms|毫秒)/i);
  if (timeMatch?.[1] && timeMatch?.[2]) {
    const val = Number.parseFloat(timeMatch[1]);
    const unit = timeMatch[2].toLowerCase();
    if (Number.isFinite(val) && val > 0) {
      timeLimitMs = unit === "ms" || unit === "毫秒" ? Math.round(val) : Math.round(val * 1000);
    }
  }

  const memMatch =
    text.match(/(?:空间限制|内存限制)[^。\n]*?C\/C\+\+\s*([\d.]+)\s*(MiB|MB|KiB|KB|M|K)\b/i) ??
    text.match(
      /(?:空间限制|内存限制|Memory\s*Limit)\s*[:：]?\s*(?:C\/C\+\+\s*)?([\d.]+)\s*(MiB|MB|KiB|KB|M|K)\b/i
    );
  if (memMatch?.[1] && memMatch?.[2]) {
    const val = Number.parseFloat(memMatch[1]);
    const unit = memMatch[2].toLowerCase();
    if (Number.isFinite(val) && val > 0) {
      memoryLimitMb =
        unit === "k" || unit === "kb" || unit === "kib"
          ? Math.round(val / 1024)
          : Math.round(val);
    }
  }

  if (timeLimitMs === undefined && memoryLimitMb === undefined) {
    return undefined;
  }
  return {
    ...(timeLimitMs !== undefined ? { timeLimitMs } : {}),
    ...(memoryLimitMb !== undefined ? { memoryLimitMb } : {})
  };
}

function cleanSampleBlock(raw: string): string {
  return decodeHtmlEntities(raw.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, ""))
    .replace(/\r\n/g, "\n")
    .replace(/^\n+|\n+$/g, "");
}

function extractNowCoderSamples(html: string): ProblemSample[] {
  const sampleInputs = new Map<number, string>();
  const sampleOutputs = new Map<number, string>();

  // 1. Primary: hidden clipboard `<textarea data-clipboard-text-id="input1/output1">...</textarea>`
  const textareaRe =
    /<textarea\b[^>]*\bdata-clipboard-text-id=["'](input|output)(\d+)["'][^>]*>([\s\S]*?)<\/textarea>/gi;
  let taMatch: RegExpExecArray | null;
  while ((taMatch = textareaRe.exec(html)) !== null) {
    const kind = taMatch[1]!.toLowerCase();
    const idx = Number.parseInt(taMatch[2]!, 10);
    const val = cleanSampleBlock(taMatch[3] ?? "");
    if (kind === "input") {
      sampleInputs.set(idx, val);
    } else {
      sampleOutputs.set(idx, val);
    }
  }

  // 2. Fallback: `.question-oi` / `.question-oi-cont pre` pairs
  if (sampleInputs.size === 0) {
    const oiBlocks = extractBalancedDivsByClass(html, "question-oi");
    if (oiBlocks.length > 0) {
      let nextIdx = 1;
      for (const block of oiBlocks) {
        const conts = extractBalancedDivsByClass(block, "question-oi-cont");
        const preSources = conts.length > 0 ? conts : [block];
        const pres: string[] = [];
        for (const src of preSources) {
          const preRe = /<pre\b[^>]*>([\s\S]*?)<\/pre>/gi;
          let preMatch: RegExpExecArray | null;
          while ((preMatch = preRe.exec(src)) !== null) {
            pres.push(cleanSampleBlock(preMatch[1] ?? ""));
          }
        }
        for (let i = 0; i + 1 < pres.length; i += 2) {
          sampleInputs.set(nextIdx, pres[i]!);
          sampleOutputs.set(nextIdx, pres[i + 1]!);
          nextIdx += 1;
        }
        if (pres.length === 1 && pres[0] !== undefined) {
          sampleInputs.set(nextIdx, pres[0]);
          nextIdx += 1;
        }
      }
    } else {
      const conts = extractBalancedDivsByClass(html, "question-oi-cont");
      const pres: string[] = [];
      for (const cont of conts) {
        const preMatch = cont.match(/<pre\b[^>]*>([\s\S]*?)<\/pre>/i);
        if (preMatch?.[1] !== undefined) {
          pres.push(cleanSampleBlock(preMatch[1]));
        }
      }
      for (let i = 0; i < pres.length; i += 2) {
        const sampleNum = Math.floor(i / 2) + 1;
        sampleInputs.set(sampleNum, pres[i]!);
        if (pres[i + 1] !== undefined) {
          sampleOutputs.set(sampleNum, pres[i + 1]!);
        }
      }
    }
  }

  const indices = [...new Set([...sampleInputs.keys(), ...sampleOutputs.keys()])].sort(
    (a, b) => a - b
  );
  const samples: ProblemSample[] = [];
  for (const idx of indices) {
    const input = sampleInputs.get(idx);
    if (input === undefined) {
      continue;
    }
    const expectedOutput = sampleOutputs.get(idx);
    samples.push({
      id: `sample-${idx}`,
      input,
      ...(expectedOutput !== undefined ? { expectedOutput } : {}),
      isOriginal: true
    });
  }
  return samples;
}

function stripNonStatementWidgets(fragment: string): string {
  return fragment
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<textarea\b[^>]*>[\s\S]*?<\/textarea>/gi, "")
    .replace(/<a\b[^>]*\bclass=["'][^"']*copy[^"']*["'][^>]*>[\s\S]*?<\/a>/gi, "")
    .replace(/<button\b[^>]*>\s*(?:复制|Copy)\s*<\/button>/gi, "");
}

/**
 * Parses NowCoder ACM (`/acm/problem/:id`), Contest (`/acm/contest/:cid/:idx`),
 * and Practice (`/practice/:uuid`, `/questionTerminal/:uuid`) SSR HTML pages.
 */
export function parseNowCoderHtml(html: string, fallbackTitle: string): ParsedNowCoderHtml {
  const pageInfo = parsePageInfo(html);

  const headingTitleMatch =
    html.match(/<div\b[^>]*\bclass=["'][^"']*\bterminal-topic-title\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i) ??
    html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i) ??
    html.match(/<span\b[^>]*\bclass=["'][^"']*\bquestion-title\b[^"']*["'][^>]*>([\s\S]*?)<\/span>/i) ??
    html.match(/<title>([\s\S]*?)<\/title>/i);

  const extractedTitle = headingTitleMatch?.[1]
    ? cleanNowCoderTitle(stripHtmlTags(headingTitleMatch[1]))
    : "";
  const title = pageInfo.title || extractedTitle || fallbackTitle;

  const intrBlocks = extractBalancedDivsByClass(html, "question-intr");
  const intrText = intrBlocks.map((b) => stripHtmlTags(b)).join("\n");
  const parsedConstraints =
    parseConstraintsFromText(intrText) ??
    parseConstraintsFromText(stripHtmlTags(html.slice(0, 12_000)));
  const timeLimitMs = parsedConstraints?.timeLimitMs ?? pageInfo.timeLimitMs;
  const memoryLimitMb = parsedConstraints?.memoryLimitMb ?? pageInfo.memoryLimitMb;
  const constraints =
    timeLimitMs !== undefined || memoryLimitMb !== undefined
      ? {
          ...(timeLimitMs !== undefined ? { timeLimitMs } : {}),
          ...(memoryLimitMb !== undefined ? { memoryLimitMb } : {})
        }
      : undefined;

  const samples = extractNowCoderSamples(html);

  // Locate primary SSR statement containers (ACM/Contest `.subject-describe` or Practice SSR container)
  const describeBlocks = extractBalancedDivsByClass(html, "subject-describe");
  let statementFragments: string[] = [];
  if (describeBlocks.length > 0) {
    statementFragments = describeBlocks;
  } else {
    const questionBlocks = [
      ...extractBalancedDivsByClass(html, "subject-question"),
      ...extractBalancedDivsByClass(html, "subject-item-wrap")
    ];
    if (questionBlocks.length > 0) {
      statementFragments = questionBlocks;
    } else {
      const hiddenSsr = extractBalancedHiddenSsrDiv(html);
      if (hiddenSsr) {
        statementFragments = [hiddenSsr];
      }
    }
  }

  const statementMarkdown = statementFragments
    .map((frag) => htmlToMarkdown(stripNonStatementWidgets(frag)))
    .filter((chunk) => chunk.length > 0)
    .join("\n\n")
    .trim();

  const rawDiffLabel =
    pageInfo.difficultyLabel ||
    intrText.match(/(?:难度|Difficulty)\s*[:：]\s*(入门|简单|中等|较难|困难|Easy|Medium|Hard)/i)?.[1];
  const normalizedTier = rawDiffLabel
    ? NOWCODER_DIFFICULTY_TIERS[rawDiffLabel] ??
      NOWCODER_DIFFICULTY_TIERS[rawDiffLabel.toLowerCase()]
    : undefined;

  const locale: "zh-CN" | "en-US" =
    /[\u4e00-\u9fff]/.test(statementMarkdown || title) ? "zh-CN" : "en-US";

  return {
    title,
    locale,
    statementMarkdown,
    samples,
    ...(constraints ? { constraints } : {}),
    ...(rawDiffLabel
      ? {
          difficulty: {
            rawLabel: rawDiffLabel,
            ...(normalizedTier !== undefined ? { normalizedTier } : {})
          }
        }
      : {}),
    rawTags: pageInfo.tags ?? []
  };
}

/**
 * Native SSR HTML adapter for NowCoder (牛客).
 * Fetches and parses public ACM, Contest, and Practice SSR pages (including `equation?tex=` LaTeX
 * and `<textarea>` / `.question-oi` samples). When a page is login-gated, WAF-blocked, or empty,
 * honestly returns `AUTH_REQUIRED` or `ANTIBOT_BLOCKED` with Competitive Companion / Clipboard guidance.
 */
export class NowCoderAdapter implements ProblemSourceAdapter {
  readonly id = "nowcoder" as const;
  readonly displayName = "牛客 (NowCoder)";
  readonly capabilities: AdapterCapabilities = {
    search: false,
    problemLists: false,
    directStatementFetch: true,
    directSamplesFetch: true,
    ioModes: ["stdio"],
    supportsOptionalUserSession: false
  };

  private readonly fetchImpl: typeof fetch;
  private readonly userAgent: string;
  private readonly timeoutMs: number;

  constructor(options: NowCoderAdapterOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.userAgent = options.userAgent ?? DEFAULT_USER_AGENT;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_HTTP_TIMEOUT_MS;
  }

  canHandleUrl(url: string): boolean {
    try {
      const parsed = new URL(url.trim());
      const host = parsed.hostname.toLowerCase();
      if (host !== "ac.nowcoder.com" && host !== "www.nowcoder.com" && host !== "nowcoder.com") {
        return false;
      }
      return (
        /^\/acm\/problem\/\d+/i.test(parsed.pathname) ||
        /^\/acm\/contest\/\d+\/[A-Za-z0-9]+/i.test(parsed.pathname) ||
        /^\/practice\/[a-f0-9]+/i.test(parsed.pathname) ||
        /^\/questionTerminal\/[a-f0-9]+/i.test(parsed.pathname)
      );
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

      const acmProb = parsed.pathname.match(/^\/acm\/problem\/(\d+)/i);
      if (acmProb?.[1]) {
        return {
          sourceId: `acm-${acmProb[1]}`,
          canonicalUrl: `https://ac.nowcoder.com/acm/problem/${acmProb[1]}`
        };
      }

      const acmContest = parsed.pathname.match(/^\/acm\/contest\/(\d+)\/([A-Za-z0-9]+)/i);
      if (acmContest?.[1] && acmContest?.[2]) {
        const letter = acmContest[2].toUpperCase();
        return {
          sourceId: `contest-${acmContest[1]}-${letter}`,
          canonicalUrl: `https://ac.nowcoder.com/acm/contest/${acmContest[1]}/${letter}`
        };
      }

      const practice = parsed.pathname.match(/^\/(?:practice|questionTerminal)\/([a-f0-9]+)/i);
      if (practice?.[1]) {
        const id = practice[1].toLowerCase();
        return {
          sourceId: `practice-${id}`,
          canonicalUrl: `https://www.nowcoder.com/practice/${id}`
        };
      }
      return null;
    }

    // Bare `NC14362`, `nc14362`, `NC-14362`
    const bareNc = trimmed.match(/^nc-?(\d+)$/i);
    if (bareNc?.[1]) {
      return {
        sourceId: `acm-${bareNc[1]}`,
        canonicalUrl: `https://ac.nowcoder.com/acm/problem/${bareNc[1]}`
      };
    }

    const prefix = trimmed.match(/^(?:nowcoder|nc):(.+)$/i);
    if (prefix?.[1]) {
      const body = prefix[1].trim();
      const acmNum = body.match(/^(?:acm-?)?(\d+)$/i);
      if (acmNum?.[1]) {
        return {
          sourceId: `acm-${acmNum[1]}`,
          canonicalUrl: `https://ac.nowcoder.com/acm/problem/${acmNum[1]}`
        };
      }
      const contest = body.match(/^(?:contest-?)?(\d+)[/-]([A-Za-z0-9]+)$/i);
      if (contest?.[1] && contest?.[2]) {
        const letter = contest[2].toUpperCase();
        return {
          sourceId: `contest-${contest[1]}-${letter}`,
          canonicalUrl: `https://ac.nowcoder.com/acm/contest/${contest[1]}/${letter}`
        };
      }
      const practice = body.match(/^(?:practice-?)?([a-f0-9]{12,64})$/i);
      if (practice?.[1]) {
        const id = practice[1].toLowerCase();
        return {
          sourceId: `practice-${id}`,
          canonicalUrl: `https://www.nowcoder.com/practice/${id}`
        };
      }
    }

    return null;
  }

  async fetchProblem(
    ref: string,
    opts?: { forceRefresh?: boolean; signal?: AbortSignal }
  ): Promise<ProblemDocument> {
    const resolved = this.resolveRef(ref);
    if (!resolved || !resolved.canonicalUrl) {
      throw new ProblemAdapterError(
        "NOT_FOUND",
        "nowcoder",
        `Unrecognized NowCoder reference: "${ref}". Expected e.g. NC14362, nowcoder:14362, or a NowCoder problem URL.`
      );
    }

    const url = resolved.canonicalUrl;
    let response: Response;
    try {
      response = await fetchWithTimeout(
        this.fetchImpl,
        url,
        {
          headers: {
            "user-agent": this.userAgent,
            accept: "text/html,application/xhtml+xml"
          },
          signal: opts?.signal
        },
        this.timeoutMs
      );
    } catch (error) {
      throw new ProblemAdapterError(
        "NETWORK_ERROR",
        "nowcoder",
        `Network error fetching NowCoder page (${url}): ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (!response.ok) {
      throw mapHttpStatusError("nowcoder", response.status, url, NOWCODER_GUIDANCE);
    }

    const html = await response.text();
    if (
      isAntiBotChallenge(response, html, [
        "subject-describe",
        "subject-question",
        "question-oi",
        "window.pageInfo"
      ])
    ) {
      throw new ProblemAdapterError(
        "ANTIBOT_BLOCKED",
        "nowcoder",
        `NowCoder (${url}) returned an anti-bot or WAF challenge page. Algo Coach will not bypass challenges. ${NOWCODER_GUIDANCE}`
      );
    }

    const parsed = parseNowCoderHtml(html, resolved.sourceId);
    if (!parsed.statementMarkdown && parsed.samples.length === 0) {
      if (
        /passport\.nowcoder|\/login\b|请先登录|用户登录|立即登录|比赛尚未开始|无权访问|需要密码|nc-login/i.test(
          html
        ) ||
        (response.url && /\/login\b/i.test(response.url))
      ) {
        throw new ProblemAdapterError(
          "AUTH_REQUIRED",
          "nowcoder",
          `NowCoder (${url}) requires login or contest access. ${NOWCODER_GUIDANCE}`
        );
      }
      if (isAntiBotChallenge(response, html)) {
        throw new ProblemAdapterError(
          "ANTIBOT_BLOCKED",
          "nowcoder",
          `NowCoder (${url}) blocked anonymous access with a verification check. ${NOWCODER_GUIDANCE}`
        );
      }
      throw new ProblemAdapterError(
        "AUTH_REQUIRED",
        "nowcoder",
        `NowCoder (${url}) did not expose a public SSR problem statement (login or client-side rendering may be required). ${NOWCODER_GUIDANCE}`
      );
    }

    const completeness = parsed.statementMarkdown
      ? "full"
      : parsed.samples.length > 0
        ? "samples_only"
        : "metadata_only";

    return {
      schemaVersion: "problem-doc/v2",
      problemKey: `nowcoder:${resolved.sourceId}`,
      source: "nowcoder",
      sourceId: resolved.sourceId,
      canonicalUrl: url,
      title: parsed.title,
      locale: parsed.locale,
      completeness,
      ioMode: "stdio",
      ...(parsed.statementMarkdown ? { statementMarkdown: parsed.statementMarkdown } : {}),
      samples: parsed.samples,
      ...(parsed.constraints ? { constraints: parsed.constraints } : {}),
      ...(parsed.difficulty ? { difficulty: parsed.difficulty } : {}),
      rawTags: parsed.rawTags,
      provenance: {
        ingestChannel: "builtin-adapter",
        fetchedAt: new Date().toISOString()
      }
    };
  }

  async healthCheck(
    signal?: AbortSignal
  ): Promise<{ ok: boolean; code?: ProblemAdapterError["code"]; message?: string }> {
    try {
      await this.fetchProblem("NC14362", { signal });
      return {
        ok: true,
        message:
          "NowCoder SSR HTML endpoint reachable (Competitive Companion & Clipboard fallback also supported)."
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
}
