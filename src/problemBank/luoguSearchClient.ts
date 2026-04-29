import type { ProblemSearchResult, ProblemSetSearchResult, SearchResults } from "./types";

interface LuoguProblemSearchPayload {
  data?: {
    problems?: {
      count?: unknown;
      result?: unknown;
    };
  };
}

interface LuoguProblemSetSearchPayload {
  currentData?: {
    trainings?: {
      count?: unknown;
      result?: unknown;
    };
  };
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((tag) => String(tag));
}

function asCount(value: unknown, fallback: number): number {
  return typeof value === "number" ? value : fallback;
}

export function normalizeLuoguProblemSearchResponse(
  payload: LuoguProblemSearchPayload
): SearchResults<ProblemSearchResult> {
  const rawItems = payload.data?.problems?.result;
  const items = Array.isArray(rawItems)
    ? rawItems
        .map((item): ProblemSearchResult | undefined => {
          if (!item || typeof item !== "object") {
            return undefined;
          }

          const record = item as Record<string, unknown>;
          if (typeof record.pid !== "string" || typeof record.title !== "string") {
            return undefined;
          }

          const result: ProblemSearchResult = {
            id: record.pid,
            title: record.title,
            tags: normalizeTags(record.tags),
            sourceUrl: `https://www.luogu.com.cn/problem/${record.pid}`
          };

          if (typeof record.difficulty === "number") {
            result.difficulty = record.difficulty;
          }

          return result;
        })
        .filter((item): item is ProblemSearchResult => Boolean(item))
    : [];

  return {
    total: asCount(payload.data?.problems?.count, items.length),
    items
  };
}

export function normalizeLuoguProblemSetSearchResponse(
  payload: LuoguProblemSetSearchPayload
): SearchResults<ProblemSetSearchResult> {
  const rawItems = payload.currentData?.trainings?.result;
  const items = Array.isArray(rawItems)
    ? rawItems
        .map((item): ProblemSetSearchResult | undefined => {
          if (!item || typeof item !== "object") {
            return undefined;
          }

          const record = item as Record<string, unknown>;
          const id = typeof record.id === "number" || typeof record.id === "string" ? String(record.id) : "";
          const title = typeof record.title === "string" ? record.title : typeof record.name === "string" ? record.name : "";

          if (!id || !title) {
            return undefined;
          }

          return {
            id,
            title,
            problemCount: typeof record.problemCount === "number" ? record.problemCount : 0,
            sourceUrl: `https://www.luogu.com.cn/training/${id}`
          };
        })
        .filter((item): item is ProblemSetSearchResult => Boolean(item))
    : [];

  return {
    total: asCount(payload.currentData?.trainings?.count, items.length),
    items
  };
}

export async function searchLuoguProblems(
  keyword: string,
  fetchImpl: typeof fetch = fetch
): Promise<SearchResults<ProblemSearchResult>> {
  const params = new URLSearchParams({
    type: "P",
    keyword
  });
  const response = await fetchImpl(`https://www.luogu.com.cn/problem/list?${params.toString()}`, {
    headers: {
      "user-agent": "student-autocomplete-lab/0.1",
      "x-lentille-request": "content-only"
    }
  });

  if (!response.ok) {
    throw new Error(`Luogu problem search failed for ${keyword}: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as LuoguProblemSearchPayload;
  return normalizeLuoguProblemSearchResponse(payload);
}

export async function searchLuoguProblemSets(
  keyword: string,
  fetchImpl: typeof fetch = fetch
): Promise<SearchResults<ProblemSetSearchResult>> {
  const params = new URLSearchParams({
    keyword,
    _contentOnly: "1"
  });
  const response = await fetchImpl(`https://www.luogu.com.cn/training/list?${params.toString()}`, {
    headers: {
      "user-agent": "student-autocomplete-lab/0.1",
      "x-luogu-type": "content-only"
    }
  });

  if (!response.ok) {
    throw new Error(`Luogu problem set search failed for ${keyword}: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as LuoguProblemSetSearchPayload;
  return normalizeLuoguProblemSetSearchResponse(payload);
}
