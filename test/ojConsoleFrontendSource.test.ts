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

  test("renders registered platforms and sends the selected login target", async () => {
    const root = path.resolve("prototypes/oj-console/frontend");
    const [html, javascript] = await Promise.all([
      readFile(path.join(root, "index.html"), "utf8"),
      readFile(path.join(root, "app.js"), "utf8")
    ]);

    expect(html).toContain('id="targetPlatform"');
    expect(html).toContain('<option value="atcoder">AtCoder</option>');
    expect(html).toContain('id="handleField"');
    expect(javascript).toContain('platform: elements.targetPlatform.value');
    expect(javascript).toContain('elements.handleField.classList.toggle("is-hidden", profile.platform !== "codeforces")');
    expect(javascript).toContain('body: JSON.stringify({ platform: elements.targetPlatform.value })');
  });
});
