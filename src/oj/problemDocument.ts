import { parseFragment } from "parse5";
import type { ProblemRecord } from "../problemBank/types";
import type { OjProblemDocument, OjTextBlock } from "./types";

interface HtmlNode {
  nodeName?: string;
  tagName?: string;
  value?: string;
  childNodes?: HtmlNode[];
}

const blockTags = new Set([
  "address",
  "article",
  "aside",
  "blockquote",
  "div",
  "dl",
  "fieldset",
  "figure",
  "footer",
  "form",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "header",
  "hr",
  "li",
  "main",
  "nav",
  "ol",
  "p",
  "pre",
  "section",
  "table",
  "tr",
  "ul"
]);

export function ojProblemDocumentToRecord(document: OjProblemDocument): ProblemRecord {
  const statement = joinStatementAndConstraints(
    textBlockToPlainText(document.content.statement),
    document.constraints
  );
  return {
    platform: document.ref.platform,
    id: document.ref.nativeId,
    title: document.title,
    sourceUrl: document.ref.url,
    difficulty: document.difficulty?.value,
    tags: unique(document.tags.map((tag) => tag.name || tag.slug)),
    statement,
    inputFormat: document.content.input ? textBlockToPlainText(document.content.input) : "",
    outputFormat: document.content.output ? textBlockToPlainText(document.content.output) : "",
    samples: document.samples.map((sample) => ({ input: sample.input, output: sample.output }))
  };
}

export function textBlockToPlainText(block: OjTextBlock): string {
  if (block.format !== "html") return normalizePlainText(block.text);
  const fragment = parseFragment(block.text) as unknown as HtmlNode;
  const pieces: string[] = [];
  appendNodeText(fragment, pieces);
  return normalizePlainText(pieces.join(""));
}

function appendNodeText(node: HtmlNode, output: string[]): void {
  const tag = node.tagName?.toLowerCase();
  if (tag === "script" || tag === "style" || tag === "noscript") return;
  if (node.nodeName === "#text") {
    output.push(node.value ?? "");
    return;
  }
  if (tag === "br") {
    output.push("\n");
    return;
  }
  if (tag === "li") output.push("\n- ");
  else if (tag && blockTags.has(tag)) output.push("\n");
  for (const child of node.childNodes ?? []) appendNodeText(child, output);
  if (tag && blockTags.has(tag)) output.push("\n");
}

function joinStatementAndConstraints(statement: string, constraints: string[]): string {
  const cleanConstraints = unique(constraints.map(normalizePlainText).filter(Boolean));
  if (cleanConstraints.length === 0) return statement;
  return `${statement}\n\n约束\n${cleanConstraints.map((constraint) => `- ${constraint}`).join("\n")}`.trim();
}

function normalizePlainText(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
