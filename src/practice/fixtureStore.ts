import { readFile } from "node:fs/promises";
import { parsePracticeGeneration, PracticeGenerationReport } from "./practiceReport";

export async function loadPracticeFixture(path: string): Promise<PracticeGenerationReport> {
  return parsePracticeGeneration(await readFile(path, "utf8"));
}
