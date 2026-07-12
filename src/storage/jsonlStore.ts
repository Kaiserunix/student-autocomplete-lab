import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export interface InvalidJsonlRecord {
  lineNumber: number;
  error: string;
  preview: string;
}

export interface LenientJsonlReadResult<T> {
  records: T[];
  invalidRecords: InvalidJsonlRecord[];
}

const appendQueues = new Map<string, Promise<void>>();

export async function readJsonlRecords<T>(path: string): Promise<T[]> {
  let content: string;

  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }

    throw error;
  }

  const records: T[] = [];
  content.split(/\r?\n/).forEach((rawLine, index) => {
    const line = normalizeJsonlLine(rawLine, index);
    if (line.length > 0) {
      records.push(JSON.parse(line) as T);
    }
  });
  return records;
}

export async function readJsonlRecordsLenient<T>(path: string): Promise<LenientJsonlReadResult<T>> {
  let content: string;

  try {
    content = await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { records: [], invalidRecords: [] };
    }

    throw error;
  }

  const records: T[] = [];
  const invalidRecords: InvalidJsonlRecord[] = [];
  const lines = content.split(/\r?\n/);

  lines.forEach((rawLine, index) => {
    const line = normalizeJsonlLine(rawLine, index);
    if (!line) {
      return;
    }

    try {
      records.push(JSON.parse(line) as T);
    } catch (error) {
      invalidRecords.push({
        lineNumber: index + 1,
        error: error instanceof Error ? error.message : String(error),
        preview: line.slice(0, 160)
      });
    }
  });

  return { records, invalidRecords };
}

export async function appendJsonlRecord<T>(path: string, record: T): Promise<void> {
  const previous = appendQueues.get(path) ?? Promise.resolve();
  const next = previous.then(async () => {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, `${JSON.stringify(record)}\n`, "utf8");
  });
  appendQueues.set(
    path,
    next.catch(() => {
      return;
    })
  );
  await next;
}

export async function writeJsonlRecords<T>(path: string, records: T[]): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const next = records.map((item) => JSON.stringify(item)).join("\n");
  await writeFile(path, `${next}\n`, "utf8");
}

function normalizeJsonlLine(rawLine: string, index: number): string {
  const line = index === 0 ? rawLine.replace(/^\uFEFF/, "") : rawLine;
  return line.trim();
}
