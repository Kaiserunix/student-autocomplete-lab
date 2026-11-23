import { describe, expect, it } from "vitest";
import { highlightCode, renderLatex, renderMarkdownMath } from "../../src/webview/markdownMath";

describe("Zero-dependency Markdown + LaTeX Math renderer (src/webview/markdownMath.ts)", () => {
  it("renders headings, emphasis, inline code, lists, blockquotes, tables, and highlighted fenced code blocks", () => {
    const md = [
      "### 题目描述",
      "给定一个**有序**数组 *nums* 与 `target`，满足 ~~旧条件~~。",
      "",
      "> 提示：请勿使用 $O(n^2)$ 暴力算法。",
      "",
      "- 第一行输入 `n`",
      "- 第二行输入 `a_1 .. a_n`",
      "",
      "| 变量 | 范围 | 说明 |",
      "| :--- | :---: | ---: |",
      "| $n$ | $1 \\le n \\le 10^5$ | 数组长度 |",
      "",
      "```cpp",
      "// binary search",
      "int mid = l + (r - l) / 2;",
      "```"
    ].join("\n");

    const html = renderMarkdownMath(md, "zh-CN");
    expect(html).toContain('<h3 class="md-h md-h3">题目描述</h3>');
    expect(html).toContain("<strong>有序</strong>");
    expect(html).toContain("<em>nums</em>");
    expect(html).toContain('<code class="md-ic">target</code>');
    expect(html).toContain("<del>旧条件</del>");
    expect(html).toContain('<blockquote class="md-bq">');
    expect(html).toContain('<ul class="md-list md-ul">');
    expect(html).toContain('<table class="md-tbl">');
    expect(html).toContain('class="ta-c"');
    expect(html).toContain('class="ta-r"');
    expect(html).toContain('<span class="tk-cm">// binary search</span>');
    expect(html).toContain('<span class="tk-kw">int</span>');
    expect(html).toContain('data-action="copy-text"');
    expect(html).toContain('data-copy-label="cpp"');
    expect(html).not.toContain('data-copy-label="复制"');

    const untagged = renderMarkdownMath("```\nplain\n```", "zh-CN");
    expect(untagged).toContain('data-copy-label=""');
  });

  it("typesets competitive programming LaTeX operators, scripts, fractions, floors, sums, and block math", () => {
    expect(renderLatex("1 \\le n \\le 10^5")).toContain("&le;");
    expect(renderLatex("1 \\le n \\le 10^5")).toContain("<sup>5</sup>");
    expect(renderLatex("a_i \\neq a_{i+1}")).toContain("<sub><var class=\"mv\">i</var></sub>");
    expect(renderLatex("a_i \\neq a_{i+1}")).toContain("&ne;");
    expect(renderLatex("\\frac{a + b}{2}")).toContain('class="mf"');
    expect(renderLatex("\\lfloor \\frac{n}{2} \\rfloor")).toContain("&lfloor;");
    expect(renderLatex("\\lfloor \\frac{n}{2} \\rfloor")).toContain("&rfloor;");
    expect(renderLatex("\\sum_{i=1}^{n} a_i \\times b_i")).toContain("&sum;");
    expect(renderLatex("\\sum_{i=1}^{n} a_i \\times b_i")).toContain("&times;");
    expect(renderLatex("\\prod_{k=1}^{\\infty} x_k \\to 0")).toContain("&prod;");
    expect(renderLatex("\\prod_{k=1}^{\\infty} x_k \\to 0")).toContain("&infin;");
    expect(renderLatex("\\prod_{k=1}^{\\infty} x_k \\to 0")).toContain("&rarr;");
    expect(renderLatex("\\sqrt{n}")).toContain("&radic;");
    expect(renderLatex("\\binom{n}{k}")).toContain('class="mf mf-nb"');
    expect(renderLatex("\\exists x")).toContain("&exist;");
    expect(renderLatex("\\exists x")).not.toContain("&exists;");
    expect(renderLatex("\\nexists x")).toContain("&#8708;");

    const blockHtml = renderMarkdownMath("$$\ndp[i] = \\min_{j < i} (dp[j] + w_j)\n$$", "zh-CN");
    expect(blockHtml).toContain('class="md-math-block well"');
    expect(blockHtml).toContain('<span class="mfn">min</span>');
  });

  it("never truncates long problem statements (> 4000 chars) and keeps snake_case intact", () => {
    const longMd = `${"# 长题面测试\n\n"}${"这是一段算法题目描述内容。".repeat(350)}\n\n## 数据范围\n- 结尾约束 $n \\le 10^{18}$ 与标识符 binary_search_first`;
    expect(longMd.length).toBeGreaterThan(4000);
    const html = renderMarkdownMath(longMd, "zh-CN");
    expect(html).toContain("结尾约束");
    expect(html).toContain("<sup>18</sup>");
    expect(html).toContain("binary_search_first");
    expect(html).not.toContain("<em>search</em>");
  });

  it("blocks all XSS payloads across Markdown, links, images, code blocks, and LaTeX math", () => {
    const evil = [
      '<script>alert("xss")</script>',
      '<img src=x onerror=alert(1)>',
      '[click](javascript:alert(1))',
      '![pic](data:text/html,<svg onload=alert(1)>)',
      '$\\text{<svg onload=alert(2)>}$',
      '```cpp\n<script>bad()</script>\n```'
    ].join("\n\n");

    const html = renderMarkdownMath(evil, "en-US");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img ");
    expect(html).not.toContain("<svg onload");
    expect(html).not.toContain("javascript:");
    expect(html).not.toContain("data:text/html");
    expect(html).toContain("&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;");
    expect(html).toContain("&lt;svg onload=alert(2)&gt;");
    expect(highlightCode("<script>x</script>", "cpp")).not.toContain("<script>");
  });
});
