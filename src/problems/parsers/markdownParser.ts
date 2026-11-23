import { createHash } from "node:crypto";
import type {
  DocumentCompleteness,
  ProblemDocument,
  ProblemIoMode,
  ProblemSample,
  ProblemSourceId
} from "../../core/contracts";

export interface MarkdownProblemParseOptions {
  fallbackTitle?: string;
  source?: ProblemSourceId;
  sourceId?: string;
  canonicalUrl?: string;
  ioMode?: ProblemIoMode;
  ingestChannel?: "clipboard" | "markdown-file";
}

interface MarkdownSection {
  level: number;
  title: string;
  content: string;
}

interface SampleDraft {
  input?: string;
  output?: string;
  explanation?: string;
}

function normalizeLineEndings(value: string): string {
  return String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function trimBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && (lines[start]?.trim() ?? "") === "") {
    start += 1;
  }
  while (end > start && (lines[end - 1]?.trim() ?? "") === "") {
    end -= 1;
  }
  return lines.slice(start, end);
}

function normalizeHeading(title: string): string {
  return title
    .trim()
    .replace(/[：:]/g, "")
    .replace(/\s+/g, "")
    .replace(/[（）()[\]【】]/g, "");
}

function sampleKey(title: string): string {
  const match = title.match(/(\d+)/);
  return match?.[1] ?? "1";
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

function isMetadataLine(line: string): boolean {
  const trimmed = line.trim().replace(/^[-*+]\s+/, "");
  return /^(?:难度|difficulty|标签|tags?|来源|source|链接|url|时间限制|time\s*limit(?:\s*per\s*test)?|内存限制|空间限制|memory\s*limit(?:\s*per\s*test)?)\s*[:：]?/i.test(
    trimmed
  ) && /[:：]|\d+\s*(?:ms|s|sec|seconds?|mb|mib|kb|megabytes?)/i.test(trimmed);
}

function cleanNarrativeSection(content: string): string {
  return trimBlankLines(normalizeLineEndings(content).split("\n"))
    .filter((line) => !isMetadataLine(line))
    .join("\n")
    .trim();
}

function extractH1Title(lines: string[]): string {
  const h1 = lines.find((line) => /^#\s+/.test(line.trim()));
  return h1 ? h1.trim().replace(/^#\s+/, "").trim() : "";
}

function detectLocale(text: string): "zh-CN" | "en-US" | "ja-JP" | "mixed" {
  const hasCjk = /[\u4e00-\u9fff]/.test(text);
  const hasJa = /[\u3040-\u30ff]/.test(text);
  const hasLatin = /[A-Za-z]{4,}/.test(text);
  if (hasJa) return "ja-JP";
  if (hasCjk && hasLatin) return "zh-CN";
  if (hasCjk) return "zh-CN";
  return "en-US";
}

function splitMarkdownSections(lines: string[]): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  let current: { level: number; title: string; lines: string[] } | undefined;

  for (const line of lines) {
    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    const headingLevel = heading?.[1]?.length ?? 0;
    if (heading && headingLevel <= 2) {
      if (current && current.level > 1) {
        sections.push({
          level: current.level,
          title: current.title,
          content: current.lines.join("\n")
        });
      }
      current = {
        level: headingLevel,
        title: (heading[2] ?? "").trim(),
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

type SectionKind =
  | "background"
  | "statement"
  | "input"
  | "output"
  | "sample"
  | "sampleInput"
  | "sampleOutput"
  | "hint"
  | "ignore";

function sectionKind(title: string): SectionKind {
  const normalized = normalizeHeading(title);
  if (/^(?:样例|示例|sample|example).*(?:输入|input)/i.test(normalized)) {
    return "sampleInput";
  }
  if (/^(?:样例|示例|sample|example).*(?:输出|output)/i.test(normalized)) {
    return "sampleOutput";
  }
  if (/^(?:题目背景|背景|background)$/i.test(normalized)) {
    return "background";
  }
  if (/^(?:题面|题目描述|描述|statement|description|problemstatement)$/i.test(normalized)) {
    return "statement";
  }
  if (/^(?:输入格式|输入说明|inputformat|input|inputspecification)$/i.test(normalized)) {
    return "input";
  }
  if (/^(?:输出格式|输出说明|outputformat|output|outputspecification)$/i.test(normalized)) {
    return "output";
  }
  if (/^(?:样例|样例\d+|示例|示例\d+|samples?|sample\d+|examples?|example\d+|输入输出样例)$/i.test(normalized)) {
    return "sample";
  }
  if (/^(?:提示|说明|说明\/提示|数据范围|hint|notes?|constraints?)$/i.test(normalized)) {
    return "hint";
  }
  return "ignore";
}

function parseSampleBlock(content: string): SampleDraft[] {
  const lines = normalizeLineEndings(content).split("\n");
  const drafts: SampleDraft[] = [];
  let draft: SampleDraft = {};
  let current: "input" | "output" | "explanation" | undefined;
  let buffer: string[] = [];

  const flushField = () => {
    if (!current) {
      return;
    }
    const value = cleanSampleContent(buffer.join("\n"));
    if (current === "input") {
      if (draft.input !== undefined && draft.output !== undefined) {
        drafts.push(draft);
        draft = {};
      }
      draft.input = value;
    } else if (current === "output") {
      draft.output = value;
    } else {
      draft.explanation = value;
    }
    buffer = [];
  };

  for (const line of lines) {
    const heading = line.match(/^#{1,5}\s+(.+)$/);
    if (heading?.[1]) {
      const normalized = normalizeHeading(heading[1]);
      if (/^(?:样例|示例|sample|example)?\d*(?:输入|input)\d*$/i.test(normalized)) {
        flushField();
        current = "input";
        continue;
      }
      if (/^(?:样例|示例|sample|example)?\d*(?:输出|output)\d*$/i.test(normalized)) {
        flushField();
        current = "output";
        continue;
      }
      if (/^(?:解释|说明|explanation)$/i.test(normalized)) {
        flushField();
        current = "explanation";
        continue;
      }
    }

    // Inline clipboard labels like "Input:" / "输入：" / "Output:" / "输出："
    const inlineMatch = line.match(/^(?:\*\*)?(输入|输出|解释|Input|Output|Explanation)(?:\*\*)?\s*[:：]\s*(.*)$/i);
    if (inlineMatch?.[1]) {
      const label = inlineMatch[1].toLowerCase();
      const rest = (inlineMatch[2] ?? "").trim();
      flushField();
      if (label === "输入" || label === "input") {
        current = "input";
      } else if (label === "输出" || label === "output") {
        current = "output";
      } else {
        current = "explanation";
      }
      if (rest) {
        buffer.push(rest);
      }
      continue;
    }

    if (current) {
      buffer.push(line);
    }
  }

  flushField();
  if (draft.input !== undefined || draft.output !== undefined) {
    drafts.push(draft);
  }
  return drafts;
}

/**
 * Smart plain-text clipboard fallback for samples copied directly from CF / Luogu / NowCoder / LeetCode pages.
 */
function parseClipboardHeuristicSamples(markdown: string): SampleDraft[] {
  const lines = normalizeLineEndings(markdown).split("\n");
  const drafts: SampleDraft[] = [];
  let draft: SampleDraft = {};
  let mode: "input" | "output" | undefined;
  let buffer: string[] = [];

  const flush = () => {
    if (!mode) return;
    const cleaned = cleanSampleContent(buffer.join("\n"));
    if (cleaned.length > 0) {
      if (mode === "input") {
        if (draft.input !== undefined && draft.output !== undefined) {
          drafts.push(draft);
          draft = {};
        }
        draft.input = cleaned;
      } else {
        draft.output = cleaned;
      }
    }
    buffer = [];
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (/^(?:Copy|复制)$/i.test(trimmed)) {
      continue;
    }
    if (/^(?:Sample\s*Input|Input|样例输入|输入)\s*\d*\s*[:：]?$/i.test(trimmed)) {
      flush();
      mode = "input";
      continue;
    }
    if (/^(?:Sample\s*Output|Output|样例输出|输出)\s*\d*\s*[:：]?$/i.test(trimmed)) {
      flush();
      mode = "output";
      continue;
    }
    if (/^(?:Note|Notes|Hint|提示|说明|Constraints|数据范围)\s*[:：]?$/i.test(trimmed)) {
      flush();
      mode = undefined;
      continue;
    }
    // Inline LeetCode / OJ style: "Input: nums = [2,7,11,15], target = 9"
    const inlineIn = trimmed.match(/^(?:\*\*)?(?:Input|输入)(?:\*\*)?\s*[:：]\s*(.+)$/i);
    if (inlineIn?.[1]) {
      flush();
      if (draft.input !== undefined && draft.output !== undefined) {
        drafts.push(draft);
        draft = {};
      }
      draft.input = inlineIn[1].trim();
      mode = undefined;
      continue;
    }
    const inlineOut = trimmed.match(/^(?:\*\*)?(?:Output|输出)(?:\*\*)?\s*[:：]\s*(.+)$/i);
    if (inlineOut?.[1]) {
      flush();
      draft.output = inlineOut[1].trim();
      mode = undefined;
      continue;
    }

    if (mode) {
      buffer.push(line);
    }
  }

  flush();
  if (draft.input !== undefined || draft.output !== undefined) {
    drafts.push(draft);
  }
  return drafts.filter((d) => d.input !== undefined && d.input.length > 0);
}

interface ParsedMetadata {
  difficultyLabel?: string;
  normalizedTier?: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  timeLimitMs?: number;
  memoryLimitMb?: number;
  url?: string;
}

function parseMetadata(lines: string[]): ParsedMetadata {
  let difficultyLabel: string | undefined;
  let normalizedTier: 1 | 2 | 3 | 4 | 5 | undefined;
  let tags: string[] = [];
  let timeLimitMs: number | undefined;
  let memoryLimitMb: number | undefined;
  let url: string | undefined;

  for (const line of lines) {
    const trimmed = line.trim().replace(/^[-*+]\s+/, "");

    const diffMatch = trimmed.match(/^(?:难度|difficulty)\s*[:：]\s*(.+)$/i);
    if (diffMatch?.[1]) {
      const val = diffMatch[1].trim();
      difficultyLabel = val;
      if (/^(?:1|easy|入门|简单)$/i.test(val)) normalizedTier = 1;
      else if (/^(?:2|普及-?)$/i.test(val)) normalizedTier = 2;
      else if (/^(?:3|medium|中等|普及\+)$/i.test(val)) normalizedTier = 3;
      else if (/^(?:4|提高)$/i.test(val)) normalizedTier = 4;
      else if (/^(?:5|hard|困难|省选|noi)$/i.test(val)) normalizedTier = 5;
    }

    const tagsMatch = trimmed.match(/^(?:标签|tags?)\s*[:：]\s*(.+)$/i);
    if (tagsMatch?.[1]) {
      tags = tagsMatch[1]
        .split(/[，,、/]/)
        .map((t) => t.trim())
        .filter(Boolean);
    }

    const urlMatch = trimmed.match(/^(?:链接|来源|url|source)\s*[:：]\s*(https?:\/\/\S+)$/i);
    if (urlMatch?.[1]) {
      url = urlMatch[1].trim();
    }

    const timeMatch = trimmed.match(
      /(?:时间限制|time\s*limit(?:\s*per\s*test)?)\s*[:：]?\s*([\d.]+)\s*(ms|s|sec|seconds?)/i
    );
    if (timeMatch?.[1] && timeMatch?.[2]) {
      const num = Number.parseFloat(timeMatch[1]);
      if (Number.isFinite(num) && num > 0) {
        timeLimitMs = timeMatch[2].toLowerCase() === "ms" ? Math.round(num) : Math.round(num * 1000);
      }
    }

    const memMatch = trimmed.match(
      /(?:内存限制|空间限制|memory\s*limit(?:\s*per\s*test)?)\s*[:：]?\s*(\d+)\s*(mb|mib|megabytes?|kb)/i
    );
    if (memMatch?.[1] && memMatch?.[2]) {
      const num = Number.parseInt(memMatch[1], 10);
      if (Number.isFinite(num) && num > 0) {
        memoryLimitMb = memMatch[2].toLowerCase() === "kb" ? Math.round(num / 1024) : num;
      }
    }
  }

  return { difficultyLabel, normalizedTier, tags, timeLimitMs, memoryLimitMb, url };
}

function slugifyTitle(title: string): string {
  const ascii = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (ascii.length >= 3) {
    return ascii.slice(0, 48);
  }
  const hash = createHash("sha256").update(title).digest("hex").slice(0, 10);
  return `problem-${hash}`;
}

export function parseMarkdownProblem(
  rawMarkdown: string,
  options: MarkdownProblemParseOptions = {}
): ProblemDocument {
  const markdown = normalizeLineEndings(rawMarkdown).trim();
  const lines = markdown.split("\n");
  const metadata = parseMetadata(lines);
  const h1Title = extractH1Title(lines);
  const firstPlainLine =
    lines.find((line) => line.trim().length > 0 && !isMetadataLine(line))?.trim() ?? "";

  const title =
    options.fallbackTitle?.trim() ||
    h1Title ||
    (firstPlainLine.length > 0 && firstPlainLine.length <= 80 ? firstPlainLine : "") ||
    "Untitled Problem";

  const sections = splitMarkdownSections(lines);
  const narrativeParts: string[] = [];
  const sampleMap = new Map<string, SampleDraft>();
  const extraDrafts: SampleDraft[] = [];

  for (const section of sections) {
    const kind = sectionKind(section.title);
    if (kind === "background" || kind === "statement" || kind === "input" || kind === "output" || kind === "hint") {
      const cleaned = cleanNarrativeSection(section.content);
      if (cleaned) {
        narrativeParts.push(`## ${section.title}\n\n${cleaned}`);
      }
      continue;
    }
    if (kind === "sampleInput" || kind === "sampleOutput") {
      const key = sampleKey(section.title);
      const draft = sampleMap.get(key) ?? {};
      const val = cleanSampleContent(section.content);
      if (kind === "sampleInput") {
        draft.input = val;
      } else {
        draft.output = val;
      }
      sampleMap.set(key, draft);
      continue;
    }
    if (kind === "sample") {
      const parsedBlocks = parseSampleBlock(section.content);
      if (parsedBlocks.length === 1) {
        const key = sampleKey(section.title);
        const draft = sampleMap.get(key) ?? {};
        const block = parsedBlocks[0]!;
        draft.input = block.input ?? draft.input;
        draft.output = block.output ?? draft.output;
        draft.explanation = block.explanation ?? draft.explanation;
        sampleMap.set(key, draft);
      } else if (parsedBlocks.length > 1) {
        extraDrafts.push(...parsedBlocks);
      }
      continue;
    }
    const cleaned = cleanNarrativeSection(section.content);
    if (cleaned) {
      narrativeParts.push(`## ${section.title}\n\n${cleaned}`);
    }
  }

  let sampleDrafts: SampleDraft[] = [...sampleMap.values(), ...extraDrafts].filter(
    (d) => d.input !== undefined && d.input.length > 0
  );

  if (sampleDrafts.length === 0) {
    sampleDrafts = parseClipboardHeuristicSamples(markdown);
  }

  const samples: ProblemSample[] = sampleDrafts.map((draft, idx) => ({
    id: `sample-${idx + 1}`,
    input: draft.input ?? "",
    ...(draft.output !== undefined ? { expectedOutput: draft.output } : {}),
    ...(draft.explanation ? { explanation: draft.explanation } : {}),
    isOriginal: true
  }));

  const statementMarkdown =
    narrativeParts.join("\n\n").trim() ||
    trimBlankLines(
      lines
        .filter((line) => !/^#\s+/.test(line.trim()))
        .filter((line) => !isMetadataLine(line))
    )
      .join("\n")
      .trim();

  const source: ProblemSourceId = options.source ?? "local-markdown";
  const sourceId = options.sourceId?.trim() || slugifyTitle(title);
  const problemKey = source === "local-markdown" ? `local:${sourceId}` : `${source}:${sourceId}`;
  const canonicalUrl = options.canonicalUrl ?? metadata.url;

  const completeness: DocumentCompleteness =
    statementMarkdown.length > 0
      ? "full"
      : samples.length > 0
        ? "samples_only"
        : "metadata_only";

  const hasConstraints = metadata.timeLimitMs !== undefined || metadata.memoryLimitMb !== undefined;

  return {
    schemaVersion: "problem-doc/v2",
    problemKey,
    source,
    sourceId,
    ...(canonicalUrl ? { canonicalUrl } : {}),
    title,
    locale: detectLocale(statementMarkdown || title),
    completeness,
    ioMode: options.ioMode ?? "stdio",
    ...(statementMarkdown ? { statementMarkdown } : {}),
    samples,
    ...(hasConstraints
      ? {
          constraints: {
            ...(metadata.timeLimitMs !== undefined ? { timeLimitMs: metadata.timeLimitMs } : {}),
            ...(metadata.memoryLimitMb !== undefined ? { memoryLimitMb: metadata.memoryLimitMb } : {})
          }
        }
      : {}),
    ...(metadata.difficultyLabel || metadata.normalizedTier !== undefined
      ? {
          difficulty: {
            ...(metadata.difficultyLabel ? { rawLabel: metadata.difficultyLabel } : {}),
            ...(metadata.normalizedTier !== undefined ? { normalizedTier: metadata.normalizedTier } : {})
          }
        }
      : {}),
    rawTags: metadata.tags,
    provenance: {
      ingestChannel: options.ingestChannel ?? "markdown-file",
      fetchedAt: new Date().toISOString()
    }
  };
}

export function mergeRichSamples(
  primary: ProblemSample[],
  secondary: ProblemSample[]
): ProblemSample[] {
  if (secondary.length === 0) {
    return primary;
  }
  if (primary.length === 0) {
    return secondary;
  }

  const byInput = new Map<string, string>();
  for (const sample of secondary) {
    if (sample.expectedOutput !== undefined) {
      const key = sample.input.replace(/\r\n/g, "\n").trim();
      if (!byInput.has(key)) {
        byInput.set(key, sample.expectedOutput);
      }
    }
  }

  const enriched = primary.map((sample, idx) => {
    if (sample.expectedOutput !== undefined) {
      return sample;
    }
    const key = sample.input.replace(/\r\n/g, "\n").trim();
    const matched = byInput.get(key);
    if (matched !== undefined) {
      return { ...sample, expectedOutput: matched };
    }
    if (primary.length === secondary.length && secondary[idx]?.expectedOutput !== undefined) {
      return { ...sample, expectedOutput: secondary[idx]!.expectedOutput };
    }
    return sample;
  });

  const countOutputs = (list: ProblemSample[]): number =>
    list.filter((s) => s.expectedOutput !== undefined && s.expectedOutput.length > 0).length;

  const enrichedCount = countOutputs(enriched);
  const secondaryCount = countOutputs(secondary);
  if (secondaryCount > enrichedCount) {
    return secondary;
  }
  if (secondaryCount === enrichedCount && secondaryCount > 0 && secondary.length > enriched.length) {
    return secondary;
  }
  return enriched;
}

/**
 * Merges a clipboard/Markdown statement into an existing problem document
 * (typically an L2 Competitive Companion `samples_only` document or CF `metadata_only` document),
 * upgrading `completeness` to `"full"` when statement content is present.
 */
export function mergeProblemDocuments(
  base: ProblemDocument,
  supplementInput: ProblemDocument | string
): ProblemDocument {
  const supplement =
    typeof supplementInput === "string"
      ? parseMarkdownProblem(supplementInput, {
          fallbackTitle: base.title,
          source: base.source,
          sourceId: base.sourceId,
          canonicalUrl: base.canonicalUrl,
          ioMode: base.ioMode,
          ingestChannel: "clipboard"
        })
      : supplementInput;

  const baseStmt = base.statementMarkdown?.trim() ?? "";
  const suppStmt = supplement.statementMarkdown?.trim() ?? "";
  const statementMarkdown = suppStmt.length > baseStmt.length ? suppStmt : baseStmt || undefined;

  const samples = mergeRichSamples(base.samples, supplement.samples);

  const mergedTags = [...new Set([...base.rawTags, ...supplement.rawTags])];
  const mergedConstraints =
    base.constraints || supplement.constraints
      ? {
          ...(supplement.constraints ?? {}),
          ...(base.constraints ?? {})
        }
      : undefined;

  const title =
    base.title && base.title !== "Untitled Problem" ? base.title : supplement.title;

  const completeness: DocumentCompleteness =
    statementMarkdown && statementMarkdown.length > 0
      ? "full"
      : samples.length > 0
        ? "samples_only"
        : "metadata_only";

  const functionMeta = base.functionMeta ?? supplement.functionMeta;

  return {
    ...base,
    title,
    locale: statementMarkdown ? detectLocale(statementMarkdown) : base.locale,
    completeness,
    ...(statementMarkdown ? { statementMarkdown } : {}),
    samples,
    ...(functionMeta ? { functionMeta } : {}),
    ...(mergedConstraints ? { constraints: mergedConstraints } : {}),
    difficulty: base.difficulty ?? supplement.difficulty,
    rawTags: mergedTags,
    provenance: {
      ...base.provenance,
      fetchedAt: new Date().toISOString()
    }
  };
}
