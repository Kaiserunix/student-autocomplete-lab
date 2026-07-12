import type { ProblemSample } from "./types";

export interface ManualProblemParseInput {
  fallbackTitle: string;
  markdown: string;
}

export interface ManualProblemParseResult {
  title: string;
  difficulty?: number;
  tags: string[];
  statement: string;
  inputFormat: string;
  outputFormat: string;
  samples: ProblemSample[];
  hint?: string;
}

interface MarkdownSection {
  level: number;
  title: string;
  content: string;
}

interface SampleDraft {
  input?: string;
  output?: string;
}

export function parseManualProblemMarkdown(input: ManualProblemParseInput): ManualProblemParseResult {
  const markdown = normalizeLineEndings(input.markdown);
  const lines = markdown.split("\n");
  const title = firstNonEmpty(input.fallbackTitle, extractH1Title(lines), "未命名题目");
  const sections = splitMarkdownSections(lines);
  const metadata = parseMetadata(lines);

  const statementParts: string[] = [];
  const inputParts: string[] = [];
  const outputParts: string[] = [];
  const hintParts: string[] = [];
  const sampleDrafts = new Map<string, SampleDraft>();

  for (const section of sections) {
    const kind = sectionKind(section.title);
    if (kind === "statement") {
      statementParts.push(cleanNarrativeSection(section.content));
      continue;
    }
    if (kind === "input") {
      inputParts.push(cleanNarrativeSection(section.content));
      continue;
    }
    if (kind === "output") {
      outputParts.push(cleanNarrativeSection(section.content));
      continue;
    }
    if (kind === "hint") {
      hintParts.push(cleanNarrativeSection(section.content));
      continue;
    }
    if (kind === "sampleInput" || kind === "sampleOutput") {
      const key = sampleKey(section.title);
      const draft = sampleDrafts.get(key) ?? {};
      if (kind === "sampleInput") {
        draft.input = cleanSampleContent(section.content);
      } else {
        draft.output = cleanSampleContent(section.content);
      }
      sampleDrafts.set(key, draft);
      continue;
    }
    if (kind === "sample") {
      const parsed = parseSampleBlock(section.content);
      if (parsed.input || parsed.output) {
        const key = sampleKey(section.title);
        const draft = sampleDrafts.get(key) ?? {};
        draft.input = parsed.input ?? draft.input;
        draft.output = parsed.output ?? draft.output;
        sampleDrafts.set(key, draft);
      }
    }
  }

  const statement = joinSections(statementParts) || fallbackStatement(markdown, sections);
  return {
    title,
    difficulty: metadata.difficulty,
    tags: metadata.tags,
    statement,
    inputFormat: joinSections(inputParts),
    outputFormat: joinSections(outputParts),
    samples: [...sampleDrafts.values()]
      .filter((sample): sample is Required<SampleDraft> => Boolean(sample.input !== undefined && sample.output !== undefined))
      .map((sample) => ({
        input: sample.input,
        output: sample.output
      })),
    hint: joinSections(hintParts) || undefined
  };
}

function normalizeLineEndings(value: string): string {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function extractH1Title(lines: string[]): string {
  const h1 = lines.find((line) => /^#\s+/.test(line.trim()));
  return h1 ? h1.trim().replace(/^#\s+/, "").trim() : "";
}

function firstNonEmpty(...values: string[]): string {
  return values.map((value) => String(value || "").trim()).find(Boolean) ?? "";
}

function splitMarkdownSections(lines: string[]): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  let current: { level: number; title: string; lines: string[] } | undefined;

  for (const line of lines) {
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    const headingLevel = heading ? heading[1].length : 0;
    if (heading && headingLevel <= 2) {
      if (current && current.level > 1) {
        sections.push({
          level: current.level,
          title: current.title,
          content: current.lines.join("\n")
        });
      }
      current = {
        level: heading[1].length,
        title: heading[2].trim(),
        lines: []
      };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current && current.level > 1) {
    sections.push({
      level: current.level,
      title: current.title,
      content: current.lines.join("\n")
    });
  }

  return sections;
}

function parseMetadata(lines: string[]): { difficulty?: number; tags: string[] } {
  let difficulty: number | undefined;
  let tags: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim().replace(/^[-*+]\s+/, "");
    const difficultyMatch = trimmed.match(/^(?:难度|difficulty)\s*[:：]\s*(\d+)/i);
    if (difficultyMatch) {
      difficulty = Number(difficultyMatch[1]);
    }

    const tagsMatch = trimmed.match(/^(?:标签|tags?)\s*[:：]\s*(.+)$/i);
    if (tagsMatch) {
      tags = tagsMatch[1]
        .split(/[，,、/]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
  }

  return {
    difficulty,
    tags
  };
}

function sectionKind(title: string):
  | "statement"
  | "input"
  | "output"
  | "sample"
  | "sampleInput"
  | "sampleOutput"
  | "hint"
  | "ignore" {
  const normalized = normalizeHeading(title);
  if (/^(样例|sample|example).*(输入|input)/i.test(normalized)) {
    return "sampleInput";
  }
  if (/^(样例|sample|example).*(输出|output)/i.test(normalized)) {
    return "sampleOutput";
  }
  if (/^(题面|题目描述|描述|statement|description|problemstatement)$/i.test(normalized)) {
    return "statement";
  }
  if (/^(输入格式|输入说明|inputformat|input)$/i.test(normalized)) {
    return "input";
  }
  if (/^(输出格式|输出说明|outputformat|output)$/i.test(normalized)) {
    return "output";
  }
  if (/^(样例|样例\d+|sample|sample\d+|example|example\d+)$/i.test(normalized)) {
    return "sample";
  }
  if (/^(提示|说明|hint|notes?|constraints?)$/i.test(normalized)) {
    return "hint";
  }

  return "ignore";
}

function normalizeHeading(title: string): string {
  return title
    .trim()
    .replace(/[：:]/g, "")
    .replace(/\s+/g, "")
    .replace(/[（）()]/g, "");
}

function sampleKey(title: string): string {
  const match = title.match(/(\d+)/);
  return match ? match[1] : "1";
}

function parseSampleBlock(content: string): SampleDraft {
  const lines = normalizeLineEndings(content).split("\n");
  const draft: SampleDraft = {};
  let current: "input" | "output" | undefined;
  let buffer: string[] = [];

  function flush(): void {
    if (!current) {
      return;
    }
    const value = cleanSampleContent(buffer.join("\n"));
    if (current === "input") {
      draft.input = value;
    } else {
      draft.output = value;
    }
    buffer = [];
  }

  for (const line of lines) {
    const heading = line.match(/^#{1,5}\s+(.+)$/);
    if (heading) {
      const normalized = normalizeHeading(heading[1]);
      if (/^(输入|input)$/i.test(normalized)) {
        flush();
        current = "input";
        continue;
      }
      if (/^(输出|output)$/i.test(normalized)) {
        flush();
        current = "output";
        continue;
      }
    }

    if (current) {
      buffer.push(line);
    }
  }

  flush();
  return draft;
}

function cleanNarrativeSection(content: string): string {
  return trimBlankLines(normalizeLineEndings(content).split("\n"))
    .filter((line) => !isMetadataLine(line))
    .join("\n")
    .trim();
}

function cleanSampleContent(content: string): string {
  let lines = trimBlankLines(normalizeLineEndings(content).split("\n"));
  if (lines[0]?.trim().startsWith("```")) {
    lines = lines.slice(1);
    const end = lines.findIndex((line) => line.trim().startsWith("```"));
    if (end >= 0) {
      lines = lines.slice(0, end);
    }
  }

  return trimBlankLines(lines).join("\n");
}

function trimBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start].trim() === "") {
    start += 1;
  }
  while (end > start && lines[end - 1].trim() === "") {
    end -= 1;
  }
  return lines.slice(start, end);
}

function joinSections(parts: string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join("\n\n");
}

function fallbackStatement(markdown: string, sections: MarkdownSection[]): string {
  if (sections.length > 0) {
    const ignored = sections.filter((section) => sectionKind(section.title) === "ignore").map((section) => section.content);
    return joinSections(ignored);
  }

  return trimBlankLines(
    markdown
      .split("\n")
      .filter((line) => !/^#\s+/.test(line.trim()))
      .filter((line) => !isMetadataLine(line))
  )
    .join("\n")
    .trim();
}

function isMetadataLine(line: string): boolean {
  const trimmed = line.trim().replace(/^[-*+]\s+/, "");
  return /^(?:难度|difficulty|标签|tags?)\s*[:：]/i.test(trimmed);
}
