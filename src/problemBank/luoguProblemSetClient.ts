import type { ProblemSetProblemSummary, ProblemSetRecord } from "./types";

interface LuoguProblemSetPayload {
  [key: string]: unknown;
  data?: {
    training?: {
      id?: unknown;
      title?: unknown;
      name?: unknown;
      description?: unknown;
      problemCount?: unknown;
      problems?: unknown;
    };
  };
  currentData?: {
    training?: {
      id?: unknown;
      title?: unknown;
      name?: unknown;
      description?: unknown;
      problemCount?: unknown;
      problems?: unknown;
    };
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((tag) => String(tag));
}

function normalizeProblemSummaries(value: unknown): ProblemSetProblemSummary[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): ProblemSetProblemSummary | undefined => {
      const problem =
        item && typeof item === "object" && "problem" in item
          ? (item as Record<string, unknown>).problem
          : item;
      if (!problem || typeof problem !== "object") {
        return undefined;
      }

      const record = problem as Record<string, unknown>;
      if (typeof record.pid !== "string" || typeof record.title !== "string") {
        return undefined;
      }

      const summary: ProblemSetProblemSummary = {
        id: record.pid,
        title: record.title,
        tags: normalizeTags(record.tags),
        sourceUrl: `https://www.luogu.com.cn/problem/${record.pid}`
      };

      if (typeof record.difficulty === "number") {
        summary.difficulty = record.difficulty;
      }

      return summary;
    })
    .filter((problem): problem is ProblemSetProblemSummary => Boolean(problem));
}

export function normalizeLuoguProblemSetResponse(payload: LuoguProblemSetPayload, idHint: string): ProblemSetRecord {
  const training = payload.data?.training ?? payload.currentData?.training;

  if (!training) {
    throw new Error("Luogu response did not include a usable problem set payload.");
  }

  const id = typeof training.id === "number" || typeof training.id === "string" ? String(training.id) : idHint;
  const title = asString(training.title) || asString(training.name) || `Luogu training ${id}`;
  const problems = normalizeProblemSummaries(training.problems);

  return {
    platform: "luogu",
    id,
    title,
    sourceUrl: `https://www.luogu.com.cn/training/${id}`,
    description: asString(training.description),
    problemCount: typeof training.problemCount === "number" ? training.problemCount : problems.length,
    problems
  };
}

export async function fetchLuoguProblemSet(
  id: string,
  fetchImpl: typeof fetch = fetch
): Promise<ProblemSetRecord> {
  const response = await fetchImpl(`https://www.luogu.com.cn/training/${encodeURIComponent(id)}?_contentOnly=1`, {
    headers: {
      "user-agent": "student-autocomplete-lab/0.1",
      "x-lentille-request": "content-only"
    }
  });

  if (!response.ok) {
    throw new Error(`Luogu problem set fetch failed for ${id}: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as LuoguProblemSetPayload;
  return normalizeLuoguProblemSetResponse(payload, id);
}
