/**
 * Lightweight zero-dependency HTML entity decoding and HTML-to-Markdown conversion
 * for OJ problem statements (LeetCode / AtCoder / NowCoder / Luogu).
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

/**
 * Extracts TeX source from a NowCoder `<img src=".../equation?tex=...">` tag.
 */
export function extractTexFromEquationImgTag(imgTag: string): string | undefined {
  const srcMatch = imgTag.match(/\bsrc\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  const rawSrc = srcMatch
    ? decodeHtmlEntities(srcMatch[1] ?? srcMatch[2] ?? srcMatch[3] ?? "")
    : "";
  if (!rawSrc || !/\/equation\?/i.test(rawSrc)) {
    return undefined;
  }

  const texMatch = rawSrc.match(/[?&]tex=([^&#]*)/i);
  if (!texMatch?.[1]) {
    return undefined;
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(texMatch[1]);
  } catch {
    decoded = texMatch[1];
  }
  const cleaned = decoded.trim();
  return cleaned || undefined;
}

const PLACEHOLDER_PREFIX = "\uE000PH";
const PLACEHOLDER_SUFFIX = "\uE001";
const PLACEHOLDER_RE = /\uE000PH(\d+)\uE001/g;

function wrapInlineCode(val: string): string {
  if (!val) {
    return "";
  }
  if (val.includes("`")) {
    const pad = val.startsWith("`") || val.endsWith("`") ? " " : "";
    return `\`\`${pad}${val}${pad}\`\``;
  }
  return `\`${val}\``;
}

export function htmlToMarkdown(html: string): string {
  if (!html) {
    return "";
  }

  let text = html.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const placeholders: Array<{ value: string; isBlock: boolean }> = [];
  const stash = (value: string, isBlock = false): string => {
    const idx = placeholders.length;
    placeholders.push({ value, isBlock });
    return `${PLACEHOLDER_PREFIX}${idx}${PLACEHOLDER_SUFFIX}`;
  };
  const containsBlockPlaceholder = (fragment: string): boolean => {
    let m: RegExpExecArray | null;
    const re = new RegExp(PLACEHOLDER_RE.source, "g");
    while ((m = re.exec(fragment)) !== null) {
      const entry = placeholders[Number(m[1])];
      if (entry?.isBlock) {
        return true;
      }
    }
    return false;
  };

  // Preserve <pre> blocks as fenced code blocks before stripping inner tags
  text = text.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, (_m, inner: string) => {
    const cleaned = decodeHtmlEntities(
      inner
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
    ).trim();
    return stash(`\n\n\`\`\`\n${cleaned}\n\`\`\`\n\n`, true);
  });

  // Convert NowCoder equation images `<img src=".../equation?tex=...">` into inline LaTeX
  text = text.replace(/<img\b[^>]*>/gi, (tag) => {
    const tex = extractTexFromEquationImgTag(tag);
    if (!tex) {
      return "";
    }
    const rendered = tex.startsWith("$") && tex.endsWith("$") ? tex : `$${tex}$`;
    return stash(rendered, false);
  });

  // Superscript & subscript (before <var> and <code> so `10<sup>9</sup>` & `<var>C<sub>i</sub></var>` render cleanly)
  text = text.replace(/<sup[^>]*>([\s\S]*?)<\/sup>/gi, (_m, inner: string) => {
    const val = stripHtmlTags(inner);
    return val ? `^${val}` : "";
  });
  text = text.replace(/<sub[^>]*>([\s\S]*?)<\/sub>/gi, (_m, inner: string) => {
    const val = stripHtmlTags(inner);
    return val ? `_${val}` : "";
  });

  // AtCoder math variables
  text = text.replace(/<var[^>]*>([\s\S]*?)<\/var>/gi, (_m, inner: string) => {
    const val = stripHtmlTags(inner).trim();
    return val ? stash(`$${val}$`, false) : "";
  });

  // Inline / multiline <code> (handles nested `<strong>` inside `<code>` cleanly)
  text = text.replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, (_m, inner: string) => {
    const val = stripHtmlTags(inner);
    if (!val.trim()) {
      return "";
    }
    if (val.includes("\n")) {
      return stash(`\n\`\`\`\n${val.trim()}\n\`\`\`\n`, true);
    }
    return stash(wrapInlineCode(val), false);
  });

  // Headings
  text = text.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, levelStr: string, inner: string) => {
    const level = Math.min(6, Math.max(1, Number.parseInt(levelStr, 10)));
    const hashes = "#".repeat(level);
    const cleaned = stripHtmlTags(inner).trim();
    return cleaned ? `\n\n${hashes} ${cleaned}\n\n` : "";
  });

  // Bold / emphasis (handles nested `<strong><code>...</code></strong>`, empty tags, and boundary spaces)
  text = text.replace(/<(strong|b)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag: string, inner: string) => {
    if (containsBlockPlaceholder(inner)) {
      return stripHtmlTags(inner);
    }
    const stripped = stripHtmlTags(inner);
    const trimmed = stripped.trim();
    if (!trimmed) {
      return "";
    }
    const lead = /^[ \t]/.test(stripped) ? " " : "";
    const trail = /[ \t]$/.test(stripped) ? " " : "";
    return `${lead}**${trimmed}**${trail}`;
  });
  text = text.replace(/<(em|i)\b[^>]*>([\s\S]*?)<\/\1>/gi, (_m, _tag: string, inner: string) => {
    if (containsBlockPlaceholder(inner)) {
      return stripHtmlTags(inner);
    }
    const stripped = stripHtmlTags(inner);
    const trimmed = stripped.trim();
    if (!trimmed) {
      return "";
    }
    const lead = /^[ \t]/.test(stripped) ? " " : "";
    const trail = /[ \t]$/.test(stripped) ? " " : "";
    return `${lead}*${trimmed}*${trail}`;
  });

  // Lists & line breaks & paragraphs
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, (_m, inner: string) => {
    const cleaned = stripHtmlTags(inner).trim();
    return cleaned ? `\n- ${cleaned}` : "";
  });
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(?:p|div|section|ul|ol|blockquote|tr)>/gi, "\n\n");
  text = text.replace(/<hr\s*\/?>/gi, "\n\n---\n\n");

  // Drop remaining tags & decode entities
  text = decodeHtmlEntities(text.replace(/<[^>]+>/g, ""));

  // Restore protected code / LaTeX / pre placeholders (iteratively for nested cases)
  for (let pass = 0; pass < 3 && text.includes(PLACEHOLDER_PREFIX); pass += 1) {
    text = text.replace(PLACEHOLDER_RE, (_m, idxStr: string) => {
      const entry = placeholders[Number(idxStr)];
      return entry ? entry.value : "";
    });
  }

  // Collapse excessive blank lines while trimming trailing whitespace per line
  return text
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
