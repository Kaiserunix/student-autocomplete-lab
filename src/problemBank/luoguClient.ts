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
      contenu?: {
        background?: unknown;
        description?: unknown;
        formatI?: unknown;
        formatO?: unknown;
        hint?: unknown;
      };
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

function joinProblemSections(...sections: string[]): string {
  return sections
    .map((section) => section.trim())
    .filter((section) => section.length > 0)
    .join("\n\n");
}

export function normalizeLuoguProblemResponse(payload: LuoguProblemPayload): ProblemRecord {
  const problem = payload.data?.problem;

  if (!problem || typeof problem.pid !== "string" || typeof problem.title !== "string") {
    throw new Error("Luogu response did not include a usable problem payload.");
  }

  const contenu = problem.contenu;

  return {
    platform: "luogu",
    id: problem.pid,
    title: problem.title,
    sourceUrl: `https://www.luogu.com.cn/problem/${problem.pid}`,
    difficulty: typeof problem.difficulty === "number" ? problem.difficulty : undefined,
    tags: normalizeTags(problem.tags),
    statement: joinProblemSections(asString(contenu?.background), asString(contenu?.description)) || asString(problem.description),
    inputFormat: asString(contenu?.formatI) || asString(problem.inputFormat),
    outputFormat: asString(contenu?.formatO) || asString(problem.outputFormat),
    samples: normalizeSamples(problem.samples),
    hint: asString(contenu?.hint) || asString(problem.hint)
  };
}

export function normalizeLuoguPid(pid: string): string {
  const trimmed = pid.trim();

  if (/^\d+$/.test(trimmed)) {
    return `P${trimmed}`;
  }

  const prefixed = trimmed.match(/^p(\d+)$/i);
  if (prefixed) {
    return `P${prefixed[1]}`;
  }

  return trimmed;
}

export async function fetchLuoguProblem(pid: string, fetchImpl: typeof fetch = fetch): Promise<ProblemRecord> {
  const normalizedPid = normalizeLuoguPid(pid);
  const response = await fetchImpl(`https://www.luogu.com.cn/problem/${encodeURIComponent(normalizedPid)}`, {
    headers: {
      "user-agent": "student-autocomplete-lab/0.1",
      "x-lentille-request": "content-only"
    }
  });

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `未找到洛谷题目 ${normalizedPid}。题目编号通常像 P5730 或 B2002；如果你输入的是题单 ID，请在“题单 ID”区域导入。`
      );
    }

    throw new Error(`Luogu problem fetch failed for ${normalizedPid}: HTTP ${response.status}`);
  }

  const payload = (await response.json()) as LuoguProblemPayload;
  return normalizeLuoguProblemResponse(payload);
}
