import { COPY_PATH, svgIc } from "./icons";
import { escapeHtml, sanitizeExternalUrl } from "./state";

const COPY_ICO = svgIc(COPY_PATH, 11);

const SYM: Record<string, string> = {};
for (const k of "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi pi rho sigma tau upsilon phi chi psi omega Gamma Delta Theta Lambda Xi Pi Sigma Phi Psi Omega le ge ne equiv sim cong times div oplus otimes notin ni cup cap forall perp sum prod int nabla prime lfloor rfloor lceil rceil".split(" ")) {
  SYM[k] = `&${k};`;
}
for (const p of (
  "leq:&le; leqslant:&le; geq:&ge; geqslant:&ge; neq:&ne; approx:&asymp; simeq:&#8771; propto:&prop; ll:&#8810; gg:&#8811; prec:&#8826; succ:&#8827; " +
  "cdot:&middot; cdotp:&middot; ast:&lowast; pm:&plusmn; mp:&#8723; circ:&#8728; land:&and; wedge:&and; lor:&or; vee:&or; lnot:&not; neg:&not; " +
  "in:&isin; subset:&sub; subseteq:&sube; supset:&sup; supseteq:&supe; setminus:&#8726; emptyset:&empty; varnothing:&empty; exists:&exist; nexists:&#8708; " +
  "mid:| vert:| Vert:&#8741; parallel:&#8741; coprod:&#8720; bigcup:&#8899; bigcap:&#8898; bigoplus:&#10753; infty:&infin; partial:&part; angle:&ang; " +
  "dots:&hellip; ldots:&hellip; cdots:&#8943; vdots:&#8942; ddots:&#8945; to:&rarr; rightarrow:&rarr; longrightarrow:&rarr; leftarrow:&larr; longleftarrow:&larr; " +
  "leftrightarrow:&harr; longleftrightarrow:&harr; Rightarrow:&rArr; implies:&rArr; Leftarrow:&lArr; Leftrightarrow:&hArr; iff:&hArr; mapsto:&#8614; uparrow:&uarr; downarrow:&darr; " +
  "langle:&#10216; rangle:&#10217; varepsilon:&#949; varphi:&#966; vartheta:&thetasym;"
).split(" ")) {
  const j = p.indexOf(":");
  if (j > 0) SYM[p.slice(0, j)] = p.slice(j + 1);
}

const BIG = new Set("sum prod coprod int bigcup bigcap bigoplus".split(" "));
const FNS = new Set("log ln lg exp sin cos tan cot sec csc gcd lcm max min sup inf lim arg deg det dim Pr mod mex xor".split(" "));
const SIZ = new Set("left right big Big bigg Bigg bigl bigr Bigl Bigr limits nolimits displaystyle textstyle scriptstyle".split(" "));
const BB: Record<string, string> = { N: "&#8469;", Z: "&#8484;", Q: "&#8474;", R: "&#8477;", C: "&#8450;", P: "&#8473;" };

export const escapeAttr = (v: string): string => escapeHtml(v).replace(/\r?\n/g, "&#10;");
const spn = (c: string, b: string): string => `<span class="${c}">${b}</span>`;
const ws = (s: string, p: number): number => { while (p < s.length && (s[p] === " " || s[p] === "\t")) p++; return p; };

function grp(s: string, p: number): [string, number] {
  p = ws(s, p);
  if (s[p] !== "{") return ["", p];
  for (let i = p, d = 0; i < s.length; i++) {
    if (s[i] === "\\" && i + 1 < s.length) i++;
    else if (s[i] === "{") d++;
    else if (s[i] === "}" && --d === 0) return [s.slice(p + 1, i), i + 1];
  }
  return [s.slice(p + 1), s.length];
}

function arg(s: string, p: number): [string, number] {
  p = ws(s, p);
  if (p >= s.length) return ["", p];
  if (s[p] === "{") { const [g, n] = grp(s, p); return [renderLatex(g), n]; }
  if (s[p] === "\\") { const m = s.slice(p).match(/^\\([a-zA-Z]+|[^a-zA-Z])/); if (m) return [renderLatex(m[0]), p + m[0].length]; }
  const c = s[p]!;
  return [/[a-zA-Z]/.test(c) ? `<var class="mv">${c}</var>` : escapeHtml(c), p + 1];
}

export function renderLatex(raw: string): string {
  const s = raw.trim();
  let o = "", i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === " " || c === "\t" || c === "\n" || c === "}") { i++; continue; }
    if (c === "{") { const [g, n] = grp(s, i); o += renderLatex(g); i = n; continue; }
    if (c === "^" || c === "_") {
      let sup: string | null = null, sub: string | null = null;
      while (i < s.length && (s[i] === "^" || s[i] === "_")) {
        const up = s[i] === "^", [a, n] = arg(s, i + 1);
        if (up) sup = a; else sub = a;
        i = ws(s, n);
      }
      o += sup !== null && sub !== null ? spn("m-scr", `<sup>${sup}</sup><sub>${sub}</sub>`) : sup !== null ? `<sup>${sup}</sup>` : `<sub>${sub}</sub>`;
      continue;
    }
    if (c === "\\") {
      const nx = s[i + 1];
      if (!nx) { i++; continue; }
      if (nx === "\\") { o += "<br>"; i += 2; continue; }
      if (",;: ".includes(nx)) { o += "&thinsp;"; i += 2; continue; }
      if (nx === "!") { i += 2; continue; }
      const m = s.slice(i + 1).match(/^[a-zA-Z]+/);
      if (!m) { o += escapeHtml(nx); i += 2; continue; }
      const cmd = m[0];
      i += 1 + cmd.length;
      if (cmd === "quad" || cmd === "qquad") { o += cmd === "quad" ? "&emsp;" : "&emsp;&emsp;"; continue; }
      if (cmd === "bmod") { o += spn("m-op", " mod "); continue; }
      if (cmd === "pmod") { const [a, n] = grp(s, i); o += spn("m-op", ` (mod ${renderLatex(a)})`); i = n; continue; }
      if (SIZ.has(cmd)) { if ((cmd === "left" || cmd === "right") && s[ws(s, i)] === ".") i = ws(s, i) + 1; continue; }
      if (cmd === "begin") {
        const [env, p1] = grp(s, i), end = `\\end{${env}}`, ei = s.indexOf(end, p1);
        if (ei !== -1) {
          const b = s.slice(p1, ei);
          o += env === "cases"
            ? spn("m-cases", spn("m-brace", "{") + spn("m-crows", b.split("\\\\").map((r) => r.trim()).filter(Boolean).map((r) => spn("m-crow", r.split("&").map(renderLatex).join(spn("m-csep", "&emsp;")))).join("")))
            : renderLatex(b.replace(/&/g, " "));
          i = ei + end.length; continue;
        }
      }
      if (/^[cdt]?frac$/.test(cmd) || /^[dt]?binom$/.test(cmd)) {
        const [a, p1] = grp(s, i), [b, p2] = grp(s, p1), bn = cmd.endsWith("binom");
        const f = spn(bn ? "mf mf-nb" : "mf", spn("mf-n", renderLatex(a)) + spn("mf-d", renderLatex(b)));
        o += bn ? spn("m-par", "(") + f + spn("m-par", ")") : f;
        i = p2; continue;
      }
      if (cmd === "sqrt") {
        let p1 = ws(s, i), r = "";
        if (s[p1] === "[") { const rb = s.indexOf("]", p1 + 1); if (rb !== -1) { r = s.slice(p1 + 1, rb); p1 = rb + 1; } }
        const [a, p2] = grp(s, p1);
        o += `${r ? `<sup class="msq-r">${renderLatex(r)}</sup>` : ""}${spn("msq", spn("msq-s", "&radic;") + spn("msq-b", renderLatex(a)))}`;
        i = p2; continue;
      }
      if (/^(?:overline|bar|underline|wide?hat|wide?tilde|vec)$/.test(cmd)) {
        const [a, n] = grp(s, i);
        o += spn(cmd === "underline" ? "mun" : cmd === "overline" || cmd === "bar" ? "mov" : "macc", renderLatex(a) + (cmd.includes("hat") ? "&#770;" : cmd.includes("tilde") ? "&#771;" : cmd === "vec" ? "&#8407;" : ""));
        i = n; continue;
      }
      if (/^(?:text|textrm|mathrm|operatorname|mathsf|texttt)$/.test(cmd)) { const [a, n] = grp(s, i); o += spn("mrm", escapeHtml(a)); i = n; continue; }
      if (/^(?:mathbf|textbf|boldsymbol|bm|mathcal)$/.test(cmd)) { const [a, n] = grp(s, i); o += spn(cmd === "mathcal" ? "mcal" : "mbf", renderLatex(a)); i = n; continue; }
      if (cmd === "mathbb") { const [a, n] = grp(s, i); o += spn("mbf", a.trim().split("").map((x) => BB[x] ?? escapeHtml(x)).join("")); i = n; continue; }
      o += FNS.has(cmd) ? spn("mfn", cmd) : SYM[cmd] ? spn(BIG.has(cmd) ? "m-big" : "m-sym", SYM[cmd]!) : spn("mrm", escapeHtml(cmd));
      continue;
    }
    o += /[a-zA-Z]/.test(c) ? `<var class="mv">${c}</var>` : "=<>+-".includes(c) ? spn("m-op", c === "-" ? "&minus;" : escapeHtml(c)) : c === "," ? ",&thinsp;" : escapeHtml(c);
    i++;
  }
  return o;
}

const KW = new Set("auto bool break char class const continue def double elif else enum false False float fn for if impl import in int let long match mut new None not nullptr or public return static struct true True using void while".split(" "));
const TP = new Set("vector string map set pair queue stack deque list dict tuple size_t i32 i64 usize Vec HashMap HashSet String Option Result std cin cout".split(" "));
const TOK = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b0x[0-9a-fA-F]+\b|\b\d+(?:\.\d+)?(?:e[+-]?\d+)?\b|\b[A-Za-z_]\w*\b)/g;

export function highlightCode(code: string, lang: string): string {
  const l = lang.trim().toLowerCase();
  if (!/^(?:c|cpp|c\+\+|cc|py|python|python3|java|rs|rust|js|ts|go)$/.test(l)) return escapeHtml(code);
  const py = l.startsWith("py");
  let o = "", p = 0;
  for (const m of code.matchAll(TOK)) {
    const idx = m.index ?? 0, tk = m[0], e = escapeHtml(tk);
    if (idx > p) o += escapeHtml(code.slice(p, idx));
    const cls = tk.startsWith("//") || tk.startsWith("/*") || (py && tk.startsWith("#")) ? "tk-cm"
      : tk.startsWith("#") ? "tk-tp" : tk[0] === '"' || tk[0] === "'" ? "tk-str"
      : /^\d/.test(tk) ? "tk-num" : KW.has(tk) ? "tk-kw" : TP.has(tk) ? "tk-tp" : "";
    o += cls ? spn(cls, e) : e;
    p = idx + tk.length;
  }
  return p < code.length ? o + escapeHtml(code.slice(p)) : o;
}

const okMath = (s: string): boolean => {
  const t = s.trim();
  return Boolean(t && !t.includes("\n") && !/[。！？；，]/.test(t) && (!(s.startsWith(" ") || s.endsWith(" ")) || /[\\^_=<>+\-*/|{}]/.test(t) || /^[a-zA-Z0-9]$/.test(t)));
};

function renderInline(raw: string): string {
  const sl: string[] = [];
  const put = (x: string): string => `\u0000S${sl.push(x) - 1}\u0000`;
  const res = (x: string): string => x.replace(/\u0000S(\d+)\u0000/g, (_m, k: string) => sl[Number(k)] ?? "");

  const s = escapeHtml(
    raw.replace(/\u0000/g, "")
      .replace(/``([\s\S]+?)``|`([^`\n]+?)`/g, (_m, a: string | undefined, b: string | undefined) => put(`<code class="md-ic">${escapeHtml((a ?? b ?? "").trim())}</code>`))
      .replace(/\\\((.+?)\\\)/g, (_m, e: string) => put(spn("md-math", renderLatex(e))))
      .replace(/(?<!\\)\$([^$\n]+?)(?<!\\)\$/g, (f, e: string) => (okMath(e) ? put(spn("md-math", renderLatex(e))) : f))
      .replace(/\\([\\`*_{}[\]()#+\-.!$~|])/g, (_m, c: string) => put(escapeHtml(c)))
      .replace(/(!?)\[([^\]]*)\]\(((?:[^()\n]|\([^()\n]*\))*)\)/g, (_m, img: string, lbl: string, url: string) => {
        const safe = sanitizeExternalUrl(url), txt = res(escapeHtml(lbl.trim() || (img ? "Image" : "")));
        const body = img ? `[${txt}]` : txt;
        return put(safe ? `<a class="lk" href="${escapeHtml(safe)}" rel="noopener noreferrer">${body}</a>` : body);
      })
  )
    .replace(/\*\*([^*\n]+?)\*\*|__([^_\n]+?)__/g, (_m, a: string | undefined, b: string | undefined) => `<strong>${a ?? b ?? ""}</strong>`)
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, "$1<em>$2</em>")
    .replace(/(^|[\s(])_([^_\n]+?)_(?=$|[\s).,!?:;])/g, "$1<em>$2</em>")
    .replace(/~~([^~\n]+?)~~/g, "<del>$1</del>");

  return res(s);
}

const TSEP = /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/;
const cells = (ln: string): string[] => ln.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim());
const starts = (ls: readonly string[], i: number): boolean => {
  const ln = ls[i] ?? "";
  return !ln.trim() || /^\s*(?:```|~~~|\$\$|\\\[|#{1,6}\s|>\s?|(?:[-*_]\s*){3,}$|(?:[-*+]|\d+[.)])\s+)/.test(ln) || (ln.includes("|") && i + 1 < ls.length && TSEP.test(ls[i + 1] ?? ""));
};

function renderBlocks(ls: readonly string[], cp: string): string {
  const out: string[] = [];
  for (let i = 0; i < ls.length;) {
    const ln = ls[i]!, tr = ln.trim();
    if (!tr) { i++; continue; }
    const fm = ln.match(/^\s*(```|~~~)\s*([^\s`~]*)/);
    if (fm) {
      const mk = fm[1]!, lang = fm[2] ?? "", b: string[] = [];
      for (i++; i < ls.length && !ls[i]!.trim().startsWith(mk); i++) b.push(ls[i]!);
      if (i < ls.length) i++;
      const code = b.join("\n");
      out.push(`<div class="md-code-wrap well"><div class="md-code-hdr"><span class="mo mu">${escapeHtml(lang || "text")}</span><button class="b b-g b-xs" type="button" data-action="copy-text" data-copy="${escapeAttr(code)}" data-copy-label="${escapeAttr(lang)}">${COPY_ICO} ${escapeHtml(cp)}</button></div><pre class="md-code mo"><code>${highlightCode(code, lang)}</code></pre></div>`);
      continue;
    }
    if (tr.startsWith("$$") || tr.startsWith("\\[")) {
      const end = tr.startsWith("$$") ? "$$" : "\\]", rest = tr.slice(2), ei = rest.indexOf(end);
      let ex = "";
      if (ei !== -1) { ex = rest.slice(0, ei); i++; }
      else {
        const ps = rest ? [rest] : [];
        for (i++; i < ls.length; i++) {
          const p = ls[i]!.indexOf(end);
          if (p !== -1) { if (p > 0) ps.push(ls[i]!.slice(0, p)); i++; break; }
          ps.push(ls[i]!);
        }
        ex = ps.join("\n");
      }
      out.push(`<div class="md-math-block well">${renderLatex(ex)}</div>`);
      continue;
    }
    const hm = ln.match(/^(#{1,6})\s+(.+?)\s*#*$/);
    if (hm) { const lv = hm[1]!.length; out.push(`<h${lv} class="md-h md-h${lv}">${renderInline(hm[2]!)}</h${lv}>`); i++; continue; }
    if (/^\s*(?:[-*_]\s*){3,}$/.test(ln)) { out.push('<hr class="md-hr">'); i++; continue; }
    if (/^\s*>\s?/.test(ln)) {
      const bq: string[] = [];
      for (; i < ls.length && /^\s*>\s?/.test(ls[i]!); i++) bq.push(ls[i]!.replace(/^\s*>\s?/, ""));
      out.push(`<blockquote class="md-bq">${renderBlocks(bq, cp)}</blockquote>`);
      continue;
    }
    if (ln.includes("|") && i + 1 < ls.length && TSEP.test(ls[i + 1]!)) {
      const hd = cells(ln), al = cells(ls[i + 1]!).map((c) => (c.startsWith(":") && c.endsWith(":") ? "ta-c" : c.endsWith(":") ? "ta-r" : "ta-l"));
      const rows: string[][] = [];
      for (i += 2; i < ls.length && ls[i]!.trim() && ls[i]!.includes("|"); i++) rows.push(cells(ls[i]!));
      out.push(`<div class="md-tbl-wrap"><table class="md-tbl"><thead><tr>${hd.map((c, j) => `<th class="${al[j] ?? "ta-l"}">${renderInline(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${hd.map((_, j) => `<td class="${al[j] ?? "ta-l"}">${renderInline(r[j] ?? "")}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`);
      continue;
    }
    const lm = ln.match(/^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/);
    if (lm) {
      const ord = Boolean(lm[1]), tag = ord ? "ol" : "ul", items: string[] = [];
      while (i < ls.length) {
        const im = ls[i]!.match(/^\s*(?:[-*+]|(\d+)[.)])\s+(.*)$/);
        if (!im || Boolean(im[1]) !== ord) break;
        const ps = [renderInline(im[2]!)];
        for (i++; i < ls.length && ls[i]!.trim() && !starts(ls, i) && /^\s{2,}/.test(ls[i]!); i++) ps.push(renderInline(ls[i]!.trim()));
        items.push(`<li>${ps.join("<br>")}</li>`);
      }
      out.push(`<${tag} class="md-list md-${tag}">${items.join("")}</${tag}>`);
      continue;
    }
    const ps = [ln];
    for (i++; i < ls.length && !starts(ls, i); i++) ps.push(ls[i]!);
    out.push(`<p class="md-p">${ps.map(renderInline).join("<br>")}</p>`);
  }
  return out.join("");
}

export function renderMarkdownMath(md: string | undefined | null, uiLanguage: "zh-CN" | "en-US" = "zh-CN"): string {
  if (!md || !md.trim()) return "";
  return `<div class="md">${renderBlocks(md.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n"), uiLanguage === "en-US" ? "Copy" : "复制")}</div>`;
}
