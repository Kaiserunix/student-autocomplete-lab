import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

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

  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as T);
}

export async function appendJsonlRecord<T>(path: string, record: T): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const existing = await readJsonlRecords<T>(path);
  const next = [...existing, record].map((item) => JSON.stringify(item)).join("\n");
  await writeFile(path, `${next}\n`, "utf8");
}
