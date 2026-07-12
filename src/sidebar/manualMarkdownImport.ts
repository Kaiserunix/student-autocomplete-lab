import * as path from "node:path";
import { parseManualProblemMarkdown } from "../problemBank/manualProblemParser";
import type { ProblemRecord } from "../problemBank/types";

export interface BuildManualProblemFromMarkdownInput {
  filePath: string;
  sourceUrl: string;
  markdown: string;
  now?: number;
}

export function buildManualProblemFromMarkdownFile(input: BuildManualProblemFromMarkdownInput): ProblemRecord {
  const parsed = parseManualProblemMarkdown({
    fallbackTitle: path.basename(input.filePath, path.extname(input.filePath)),
    markdown: input.markdown
  });

  return {
    platform: "manual",
    id: `manual-${input.now ?? Date.now()}`,
    title: parsed.title,
    sourceUrl: input.sourceUrl,
    difficulty: parsed.difficulty,
    tags: parsed.tags,
    statement: parsed.statement,
    inputFormat: parsed.inputFormat,
    outputFormat: parsed.outputFormat,
    samples: parsed.samples,
    hint: parsed.hint
  };
}
