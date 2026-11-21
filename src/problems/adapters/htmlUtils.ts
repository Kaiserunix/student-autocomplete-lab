/**
 * Lightweight zero-dependency HTML entity decoding and HTML-to-Markdown conversion
 * for OJ problem statements (LeetCode / AtCoder).
 */

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: "\"",
  apos: "'",
  nbsp: " ",
  le: "<=",
  ge: ">=",
  ne: "!=",
  times: "×",
  minus: "-",
  mdash: "—",
  ndash: "–",
  hellip: "...",
  lsquo: "'",
  rsquo: "'",
  ldquo: "\"",
  rdquo: "\""
};

export function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&#x([0-9a-fA-F]+);/g, (_match, hex: string) => {
      const code = Number.parseInt(hex, 16);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _match;
    })
    .replace(/&#(\d+);/g, (_match, dec: string) => {
      const code = Number.parseInt(dec, 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : _match;
    })
    .replace(/&([a-zA-Z]+);/g, (_match, name: string) => {
      const mapped = NAMED_ENTITIES[name.toLowerCase()];
      return mapped !== undefined ? mapped : _match;
    });
}

export function stripHtmlTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ""));
}

export function htmlToMarkdown(html: string): string {
  if (!html) {
    return "";
  }

  let text = html.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Preserve <pre> blocks as fenced code blocks before stripping inner tags
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, inner: string) => {
    const cleaned = decodeHtmlEntities(
      inner
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
    ).trim();
    return `\n\n\`\`\`\n${cleaned}\n\`\`\`\n\n`;
  });

  // Headings
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, levelStr: string, inner: string) => {
    const level = Math.min(6, Math.max(1, Number.parseInt(levelStr, 10)));
    const hashes = "#".repeat(level);
    return `\n\n${hashes} ${stripHtmlTags(inner).trim()}\n\n`;
  });

  // Inline code, var (math variables on AtCoder), sup/sub, emphasis
  text = text.replace(/<var[^>]*>([\s\S]*?)<\/var>/gi, (_m, inner: string) => {
    const val = stripHtmlTags(inner).trim();
    return val ? `$${val}$` : "";
  });
  text = text.replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, (_m, inner: string) => `^${stripHtmlTags(inner)}`);
  text = text.replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, (_m, inner: string) => `_${stripHtmlTags(inner)}`);
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_m, inner: string) => {
    const val = stripHtmlTags(inner);
    return val.includes("\n") ? `\n\`\`\`\n${val.trim()}\n\`\`\`\n` : `\`${val}\``;
  });
  text = text.replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, (_m, inner: string) => `**${stripHtmlTags(inner).trim()}**`);
  text = text.replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, (_m, inner: string) => `*${stripHtmlTags(inner).trim()}*`);

  // Lists & line breaks & paragraphs
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner: string) => `\n- ${stripHtmlTags(inner).trim()}`);
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(?:p|div|section|ul|ol|blockquote|tr)>/gi, "\n\n");
  text = text.replace(/<hr\s*\/?>/gi, "\n\n---\n\n");

  // Drop remaining tags & decode entities
  text = decodeHtmlEntities(text.replace(/<[^>]+>/g, ""));

  // Collapse excessive blank lines while trimming trailing whitespace per line
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
