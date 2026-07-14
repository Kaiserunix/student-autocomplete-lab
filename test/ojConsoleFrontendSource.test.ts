import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, test } from "vitest";

describe("OJ console frontend source", () => {
  test("keeps browser source free of comments and preserves one token placeholder", async () => {
    const root = path.resolve("prototypes/oj-console/frontend");
    const [html, css, javascript] = await Promise.all([
      readFile(path.join(root, "index.html"), "utf8"),
      readFile(path.join(root, "styles.css"), "utf8"),
      readFile(path.join(root, "app.js"), "utf8")
    ]);

    expect(html).not.toContain("<!--");
    expect(css).not.toContain("/*");
    expect(javascript).not.toMatch(/(^|\n)\s*\/\//);
    expect(javascript).not.toContain("/*");
    expect(html.match(/__OJ_CONSOLE_TOKEN__/g)).toHaveLength(1);
  });
});
