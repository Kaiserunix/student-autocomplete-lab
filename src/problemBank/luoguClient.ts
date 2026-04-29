import type { ProblemRecord, ProblemSample } from "./types";

interface LuoguProblemPayload {
  data?: {
    problem?: {
      pid?: unknown;
      title?: unknown;
      difficulty?: unknown;
      tags?: unknown;
      description?: unknown;
      inputFormat?: unknown;
      outputFormat?: unknown;
      samples?: unknown;
      hint?: unknown;
    };
  };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function normalizeSamples(value: unknown): ProblemSample[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((sample) => {
      if (Array.isArray(sample)) {
        return {
          input: asString(sample[0]),
          output: asString(sample[1])
        };
      }

      if (sample && typeof sample === "object") {
        const record = sample as Record<string, unknown>;
        return {
          input: asString(record.input),
          output: asString(record.output)
        };
      }

      return undefined;
    })
    .filter((sample): sample is ProblemSample => Boolean(sample));
}

function normalizeTags(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((tag) => String(tag));
}

export function normalizeLuoguProblemResponse(payload: LuoguProblemPayload): ProblemRecord {
  const problem = payload.data?.problem;

  if (!problem || typeof problem.pid !== "string" || typeof problem.title !== "string") {
    throw new Error("Luogu response did not include a usable problem payload.");
  }

  return {
    platform: "luogu",
    id: problem.pid,
    title: problem.title,
    sourceUrl: `https://www.luogu.com.cn/problem/${problem.pid}`,
    difficulty: typeof problem.difficulty === "number" ? problem.difficulty : undefined,
    tags: normalizeTags(problem.tags),
    statement: asString(problem.description),
    inputFormat: asString(problem.inputFormat),
    outputFormat: asString(problem.outputFormat),
    samples: normalizeSamples(problem.samples),
    hint: asString(problem.hint)
  };
}

export async function fetchLuoguProblem(pid: string, fetchImpl: typeof fetch = fetch): Promise<ProblemRecord> {
  const response = await fetchImpl(`https://www.luogu.com.cn/problem/${encodeURIComponent(pid)}`, {
    headers: {
      "user-agent": "student-autocomplete-lab/0.1",
      "x-lentille-request": "content-only"
    }
  });

  if (!response.ok) {
    throw new Error(`Luogu problem fetch failed for ${pid}: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as LuoguProblemPayload;
  return normalizeLuoguProblemResponse(payload);
}
