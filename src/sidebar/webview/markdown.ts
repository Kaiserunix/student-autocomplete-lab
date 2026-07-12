export type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; language?: string; text: string }
  | { type: "quote"; text: string }
  | { type: "rule" };

export function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^```(.*)$/);
    if (fence) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: "code", language: fence[1].trim() || undefined, text: codeLines.join("\n") });
      index += index < lines.length ? 1 : 0;
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1\s*$/.test(line)) {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    if (line.trimStart().startsWith(">")) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].trimStart().startsWith(">")) {
        quoteLines.push(lines[index].trimStart().replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", text: quoteLines.join("\n").trim() });
      continue;
    }

    const listMatch = line.match(/^\s*(?:[-*+]|\d+\.)\s+(.+)$/);
    if (listMatch) {
      const ordered = /^\s*\d+\./.test(line);
      const items: string[] = [];
      while (index < lines.length) {
        const item = lines[index].match(/^\s*(?:[-*+]|\d+\.)\s+(.+)$/);
        if (!item) {
          break;
        }
        items.push(item[1].trim());
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim()) {
      if (/^(#{1,6})\s+/.test(lines[index]) || /^```/.test(lines[index]) || /^\s*(?:[-*+]|\d+\.)\s+/.test(lines[index])) {
        break;
      }
      paragraph.push(lines[index].trim());
      index += 1;
    }
    blocks.push({ type: "paragraph", text: paragraph.join(" ") });
  }

  return blocks;
}

export function renderMarkdownToHtml(text: string): string {
  return parseMarkdownBlocks(text)
    .map((block) => {
      if (block.type === "heading") {
        const level = Math.min(6, Math.max(1, block.level));
        return `<h${level}>${renderInlineMarkdown(block.text)}</h${level}>`;
      }
      if (block.type === "paragraph") {
        return `<p>${renderInlineMarkdown(block.text)}</p>`;
      }
      if (block.type === "quote") {
        return `<blockquote>${renderInlineMarkdown(block.text)}</blockquote>`;
      }
      if (block.type === "list") {
        const tag = block.ordered ? "ol" : "ul";
        return `<${tag}>${block.items.map((item) => `<li>${renderInlineMarkdown(item)}</li>`).join("")}</${tag}>`;
      }
      if (block.type === "code") {
        const language = block.language ? ` data-language="${escapeHtml(block.language)}"` : "";
        return `<pre><code${language}>${escapeHtml(block.text)}</code></pre>`;
      }
      return "<hr>";
    })
    .join("");
}

export function renderInlineMarkdown(text: string): string {
  let result = "";
  let index = 0;

  while (index < text.length) {
    const codeStart = text.indexOf("`", index);
    const mathStart = text.indexOf("$", index);
    const next = nearestPositive(codeStart, mathStart);
    if (next === -1) {
      result += renderPlainInline(text.slice(index));
      break;
    }

    result += renderPlainInline(text.slice(index, next));
    if (next === codeStart) {
      const end = text.indexOf("`", codeStart + 1);
      if (end === -1) {
        result += "&#96;";
        index = codeStart + 1;
      } else {
        result += `<code>${escapeHtml(text.slice(codeStart + 1, end))}</code>`;
        index = end + 1;
      }
      continue;
    }

    const end = text.indexOf("$", mathStart + 1);
    if (end === -1) {
      result += "$";
      index = mathStart + 1;
    } else {
      result += `<span class="mathInline">${renderMathInline(text.slice(mathStart + 1, end))}</span>`;
      index = end + 1;
    }
  }

  return result;
}

export function renderMathInline(source: string): string {
  return renderPlainInline(normalizeMathText(source)).replace(/\^(\{([^}]+)\}|([A-Za-z0-9+-]+))/g, (_match, _whole, braced, bare) => {
    return `<sup>${escapeHtml(braced ?? bare)}</sup>`;
  });
}

export function normalizeMathText(source: string): string {
  return source
    .replace(/\\bm\s*\{([^}]+)\}/g, "$1")
    .replace(/\\leq?/g, "≤")
    .replace(/\\geq?/g, "≥")
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\{([^{}]+)\}/g, "$1")
    .trim();
}

function renderPlainInline(text: string): string {
  const withLinks = escapeHtml(text).replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
  return withLinks.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}

function nearestPositive(left: number, right: number): number {
  if (left === -1) {
    return right;
  }
  if (right === -1) {
    return left;
  }
  return Math.min(left, right);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
