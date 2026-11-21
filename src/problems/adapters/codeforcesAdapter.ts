import {
  ProblemAdapterError,
  type AdapterCapabilities,
  type ProblemDocument,
  type ProblemSearchQuery,
  type ProblemSourceAdapter
} from "../../core/contracts";

export interface CodeforcesAdapterOptions {
  fetchImpl?: typeof fetch;
  indexTtlMs?: number;
}

interface CfApiProblem {
  contestId?: number;
  index?: string;
  name?: string;
  type?: string;
  rating?: number;
  tags?: string[];
}

interface CfProblemsetResponse {
  status?: unknown;
  comment?: unknown;
  result?: {
    problems?: CfApiProblem[];
  };
}

const CF_PROBLEMSET_API = "https://codeforces.com/api/problemset.problems";

export function codeforcesRatingToTier(rating?: number): 1 | 2 | 3 | 4 | 5 | undefined {
  if (rating === undefined || !Number.isFinite(rating)) {
    return undefined;
  }
  if (rating <= 1000) return 1;
  if (rating <= 1400) return 2;
  if (rating <= 1700) return 3;
  if (rating <= 2000) return 4;
  return 5;
}

export interface ParsedCfRef {
  contestId: number;
  index: string;
  isGym: boolean;
  sourceId: string;
  canonicalUrl: string;
}

export function parseCodeforcesRef(input: string): ParsedCfRef | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch {
      return null;
    }
    const host = parsed.hostname.toLowerCase();
    if (host !== "codeforces.com" && host !== "www.codeforces.com") {
      return null;
    }
    const contestMatch = parsed.pathname.match(/^\/contest\/(\d+)\/problem\/([A-Za-z0-9]+)\/?$/i);
    if (contestMatch?.[1] && contestMatch?.[2]) {
      const contestId = Number.parseInt(contestMatch[1], 10);
      const index = contestMatch[2].toUpperCase();
      return {
        contestId,
        index,
        isGym: false,
        sourceId: `${contestId}${index}`,
        canonicalUrl: `https://codeforces.com/contest/${contestId}/problem/${index}`
      };
    }
    const problemsetMatch = parsed.pathname.match(/^\/problemset\/problem\/(\d+)\/([A-Za-z0-9]+)\/?$/i);
    if (problemsetMatch?.[1] && problemsetMatch?.[2]) {
      const contestId = Number.parseInt(problemsetMatch[1], 10);
      const index = problemsetMatch[2].toUpperCase();
      return {
        contestId,
        index,
        isGym: false,
        sourceId: `${contestId}${index}`,
        canonicalUrl: `https://codeforces.com/contest/${contestId}/problem/${index}`
      };
    }
    const gymMatch = parsed.pathname.match(/^\/gym\/(\d+)\/problem\/([A-Za-z0-9]+)\/?$/i);
    if (gymMatch?.[1] && gymMatch?.[2]) {
      const contestId = Number.parseInt(gymMatch[1], 10);
      const index = gymMatch[2].toUpperCase();
      return {
        contestId,
        index,
        isGym: true,
        sourceId: `gym:${contestId}${index}`,
        canonicalUrl: `https://codeforces.com/gym/${contestId}/problem/${index}`
      };
    }
    return null;
  }

  const stripped = trimmed.replace(/^(?:codeforces|cf):/i, "");
  const gymDirect = stripped.match(/^gym:(\d+)[/-]?([A-Za-z][A-Za-z0-9]?)$/i);
  if (gymDirect?.[1] && gymDirect?.[2]) {
    const contestId = Number.parseInt(gymDirect[1], 10);
    const index = gymDirect[2].toUpperCase();
    return {
      contestId,
      index,
      isGym: true,
      sourceId: `gym:${contestId}${index}`,
      canonicalUrl: `https://codeforces.com/gym/${contestId}/problem/${index}`
    };
  }

  const direct = stripped.match(/^(\d{1,5})[/-]?([A-Za-z][A-Za-z0-9]?)$/);
  if (direct?.[1] && direct?.[2]) {
    const contestId = Number.parseInt(direct[1], 10);
    const index = direct[2].toUpperCase();
    return {
      contestId,
      index,
      isGym: false,
      sourceId: `${contestId}${index}`,
      canonicalUrl: `https://codeforces.com/contest/${contestId}/problem/${index}`
    };
  }

  return null;
}

/**
 * Codeforces adapter powered strictly by the official `problemset.problems` public REST API.
 * Explicitly returns `completeness: "metadata_only"` and NEVER attempts to scrape Cloudflare-protected HTML.
 */
export class CodeforcesAdapter implements ProblemSourceAdapter {
  readonly id = "codeforces" as const;
  readonly displayName = "Codeforces";
  readonly capabilities: AdapterCapabilities = {
    search: true,
    problemLists: false,
    directStatementFetch: false,
    directSamplesFetch: false,
    ioModes: ["stdio"],
    supportsOptionalUserSession: false
  };

  private readonly fetchImpl: typeof fetch;
  private readonly indexTtlMs: number;
  private cachedProblems: CfApiProblem[] | null = null;
  private cachedAt = 0;

  constructor(options: CodeforcesAdapterOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.indexTtlMs = options.indexTtlMs ?? 30 * 60 * 1000;
  }

  canHandleUrl(url: string): boolean {
    return parseCodeforcesRef(url) !== null && /^https?:\/\//i.test(url.trim());
  }

  resolveRef(input: string): { sourceId: string; canonicalUrl?: string } | null {
    const parsed = parseCodeforcesRef(input);
    if (!parsed) {
      return null;
    }
    return {
      sourceId: parsed.sourceId,
      canonicalUrl: parsed.canonicalUrl
    };
  }

  async fetchProblem(
    ref: string,
    opts?: { forceRefresh?: boolean; signal?: AbortSignal }
  ): Promise<ProblemDocument> {
    const parsed = parseCodeforcesRef(ref);
    if (!parsed) {
      throw new ProblemAdapterError(
        "NOT_FOUND",
        "codeforces",
        `Invalid Codeforces reference: "${ref}". Expected e.g. 1433G, cf:1433G, or a Codeforces problem URL.`
      );
    }

    if (parsed.isGym) {
      return {
        schemaVersion: "problem-doc/v2",
        problemKey: `cf:${parsed.sourceId}`,
        source: "codeforces",
        sourceId: parsed.sourceId,
        canonicalUrl: parsed.canonicalUrl,
        title: `Codeforces Gym ${parsed.contestId}${parsed.index}`,
        locale: "en-US",
        completeness: "metadata_only",
        ioMode: "stdio",
        samples: [],
        rawTags: ["gym"],
        provenance: {
          ingestChannel: "builtin-adapter",
          fetchedAt: new Date().toISOString()
        }
      };
    }

    const problems = await this.loadProblemset(opts?.forceRefresh ?? false, opts?.signal);
    const found = problems.find(
      (p) => p.contestId === parsed.contestId && p.index?.toUpperCase() === parsed.index
    );

    if (!found) {
      throw new ProblemAdapterError(
        "NOT_FOUND",
        "codeforces",
        `Codeforces problem ${parsed.sourceId} was not found in official problemset.problems API.`
      );
    }

    return this.toMetadataDocument(found);
  }

  async search(
    query: ProblemSearchQuery,
    signal?: AbortSignal
  ): Promise<{ items: ProblemDocument[]; total?: number }> {
    const problems = await this.loadProblemset(false, signal);
    const keyword = query.keyword?.trim().toLowerCase() ?? "";
    const tagFilters = (query.tags ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean);

    const filtered = problems.filter((p) => {
      if (typeof p.contestId !== "number" || typeof p.index !== "string" || typeof p.name !== "string") {
        return false;
      }
      const code = `${p.contestId}${p.index}`.toLowerCase();
      if (keyword && !p.name.toLowerCase().includes(keyword) && !code.includes(keyword)) {
        return false;
      }
      if (tagFilters.length > 0) {
        const lowerTags = (p.tags ?? []).map((t) => t.toLowerCase());
        if (!tagFilters.every((wanted) => lowerTags.includes(wanted))) {
          return false;
        }
      }
      const tier = codeforcesRatingToTier(p.rating);
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

    return {
      items: slice.map((p) => this.toMetadataDocument(p)),
      total: filtered.length
    };
  }

  async healthCheck(
    signal?: AbortSignal
  ): Promise<{ ok: boolean; code?: ProblemAdapterError["code"]; message?: string }> {
    try {
      const problems = await this.loadProblemset(false, signal);
      return {
        ok: problems.length > 0,
        message: `Codeforces official problemset API reachable (${problems.length} problems, metadata_only; use Localhost Bridge / Clipboard for statements & samples).`
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

  private toMetadataDocument(p: CfApiProblem): ProblemDocument {
    const contestId = p.contestId ?? 0;
    const index = (p.index ?? "").toUpperCase();
    const sourceId = `${contestId}${index}`;
    const rating = typeof p.rating === "number" ? p.rating : undefined;
    const tier = codeforcesRatingToTier(rating);
    const rawTags = Array.isArray(p.tags)
      ? p.tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0)
      : [];

    return {
      schemaVersion: "problem-doc/v2",
      problemKey: `cf:${sourceId}`,
      source: "codeforces",
      sourceId,
      canonicalUrl: `https://codeforces.com/contest/${contestId}/problem/${index}`,
      title: p.name ?? sourceId,
      locale: "en-US",
      completeness: "metadata_only",
      ioMode: "stdio",
      samples: [],
      ...(rating !== undefined
        ? {
            difficulty: {
              rawLabel: `CF ${rating}`,
              numericRating: rating,
              ...(tier !== undefined ? { normalizedTier: tier } : {})
            }
          }
        : {}),
      rawTags,
      provenance: {
        ingestChannel: "builtin-adapter",
        fetchedAt: new Date().toISOString()
      }
    };
  }

  private async loadProblemset(forceRefresh: boolean, signal?: AbortSignal): Promise<CfApiProblem[]> {
    if (!forceRefresh && this.cachedProblems && Date.now() - this.cachedAt < this.indexTtlMs) {
      return this.cachedProblems;
    }

    let response: Response;
    try {
      response = await this.fetchImpl(CF_PROBLEMSET_API, {
        headers: { accept: "application/json" },
        signal
      });
    } catch (error) {
      throw new ProblemAdapterError(
        "NETWORK_ERROR",
        "codeforces",
        `Network error fetching Codeforces problemset API: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    if (response.status === 429 || response.status === 503) {
      throw new ProblemAdapterError(
        "RATE_LIMITED",
        "codeforces",
        `Codeforces API temporarily unavailable or rate-limited (HTTP ${response.status}).`
      );
    }
    if (!response.ok) {
      throw new ProblemAdapterError(
        "NETWORK_ERROR",
        "codeforces",
        `Codeforces API failed with HTTP ${response.status}.`
      );
    }

    let payload: CfProblemsetResponse;
    try {
      payload = (await response.json()) as CfProblemsetResponse;
    } catch {
      throw new ProblemAdapterError(
        "SCHEMA_DRIFT",
        "codeforces",
        "Codeforces API returned non-JSON response."
      );
    }

    if (payload.status !== "OK" || !Array.isArray(payload.result?.problems)) {
      throw new ProblemAdapterError(
        "SCHEMA_DRIFT",
        "codeforces",
        `Codeforces API returned unexpected status: ${String(payload.comment ?? payload.status)}`
      );
    }

    this.cachedProblems = payload.result.problems;
    this.cachedAt = Date.now();
    return this.cachedProblems;
  }
}
