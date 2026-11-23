import type { FunctionSignatureMeta, SupportedLanguage } from "../core/contracts";

export type NormalizedLeetCodeType =
  | "int"
  | "long"
  | "double"
  | "bool"
  | "string"
  | "char"
  | "void"
  | "int[]"
  | "long[]"
  | "double[]"
  | "bool[]"
  | "string[]"
  | "char[]"
  | "int[][]"
  | "string[][]"
  | "char[][]"
  | "ListNode"
  | "TreeNode"
  | "ListNode[]";

export type HarnessSupportResult =
  | { supported: true; normalizedParams: Array<{ name: string; type: NormalizedLeetCodeType }>; normalizedReturn: NormalizedLeetCodeType }
  | { supported: false; reason: string };

export interface GeneratedHarnessResult {
  supported: boolean;
  reason?: string;
  driverSource?: string;
  filename?: string;
}

export function normalizeLeetCodeType(rawType: string): NormalizedLeetCodeType | null {
  const cleaned = rawType.trim().replace(/\s+/g, "").toLowerCase();
  const mapping: Record<string, NormalizedLeetCodeType> = {
    integer: "int",
    int: "int",
    long: "long",
    double: "double",
    float: "double",
    boolean: "bool",
    bool: "bool",
    string: "string",
    character: "char",
    char: "char",
    void: "void",

    "integer[]": "int[]",
    "int[]": "int[]",
    "list<integer>": "int[]",
    "list<int>": "int[]",

    "long[]": "long[]",
    "list<long>": "long[]",

    "double[]": "double[]",
    "float[]": "double[]",
    "list<double>": "double[]",

    "boolean[]": "bool[]",
    "bool[]": "bool[]",
    "list<boolean>": "bool[]",

    "string[]": "string[]",
    "list<string>": "string[]",

    "character[]": "char[]",
    "char[]": "char[]",
    "list<character>": "char[]",

    "integer[][]": "int[][]",
    "int[][]": "int[][]",
    "list<list<integer>>": "int[][]",
    "list<integer[]>": "int[][]",

    "string[][]": "string[][]",
    "list<list<string>>": "string[][]",

    "character[][]": "char[][]",
    "char[][]": "char[][]",
    "list<list<character>>": "char[][]",

    listnode: "ListNode",
    "listnode*": "ListNode",
    treenode: "TreeNode",
    "treenode*": "TreeNode",
    "listnode[]": "ListNode[]",
    "list<listnode>": "ListNode[]"
  };

  return mapping[cleaned] ?? null;
}

export function checkLeetCodeHarnessSupport(
  meta: FunctionSignatureMeta | undefined,
  language: SupportedLanguage
): HarnessSupportResult {
  if (!meta) {
    return {
      supported: false,
      reason: "Missing LeetCode function signature metadata (metaData). Write a local main() or run on LeetCode directly."
    };
  }

  if (language !== "python" && language !== "cpp") {
    return {
      supported: false,
      reason: `Local LeetCode Function-Harness currently supports Python and C++ (got "${language}"). Please add a local stdio driver or run on LeetCode.`
    };
  }

  const entryName = meta.entryName.trim();
  if (!entryName || entryName.startsWith("class:") || /^[A-Z]/.test(entryName)) {
    return {
      supported: false,
      reason: `Class-design or stateful problem ("${entryName || "unknown"}") is not supported by automatic Function-Harness. Please write a custom local test driver or test directly on LeetCode.`
    };
  }

  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(entryName)) {
    return {
      supported: false,
      reason: `Unsupported method identifier "${entryName}" in LeetCode metaData.`
    };
  }

  const normalizedParams: Array<{ name: string; type: NormalizedLeetCodeType }> = [];
  for (const param of meta.params) {
    const norm = normalizeLeetCodeType(param.type);
    if (!norm || norm === "void") {
      return {
        supported: false,
        reason: `Unsupported LeetCode parameter type "${param.type}" for "${param.name}". Please write a custom test driver or run directly on LeetCode.`
      };
    }
    normalizedParams.push({ name: param.name, type: norm });
  }

  const normalizedReturn = normalizeLeetCodeType(meta.returnType || "void");
  if (!normalizedReturn) {
    return {
      supported: false,
      reason: `Unsupported LeetCode return type "${meta.returnType}". Please write a custom test driver or run directly on LeetCode.`
    };
  }

  return { supported: true, normalizedParams, normalizedReturn };
}

function hasUncommentedPythonClass(source: string, className: string): boolean {
  const re = new RegExp(`^\\s*class\\s+${className}\\b`, "m");
  return re.test(source);
}

function hasUncommentedCppStruct(source: string, structName: string): boolean {
  const stripped = source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/[^\n]*/g, "");
  const re = new RegExp(`\\b(?:struct|class)\\s+${structName}\\s*\\{`);
  return re.test(stripped);
}

function countTripleQuoteTransitions(
  line: string,
  initialQuote: '"""' | "'''" | null
): '"""' | "'''" | null {
  let active = initialQuote;
  let singleQuote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (active) {
      if (line.startsWith(active, i)) {
        active = null;
        i += 2;
      }
      continue;
    }
    if (singleQuote) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === singleQuote) {
        singleQuote = null;
      }
      continue;
    }
    if (ch === "#") {
      break;
    }
    if ((ch === '"' || ch === "'") && line.startsWith(ch.repeat(3), i)) {
      active = (ch.repeat(3) as '"""' | "'''");
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      singleQuote = ch;
    }
  }
  return active;
}

function stripInlinePythonComment(line: string): string {
  let quote: string | null = null;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i]!;
    if (quote) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === "#") {
      return line.slice(0, i);
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
    }
  }
  return line;
}

function preparePythonStudentSource(studentSource: string): {
  cleanedSource: string;
  extraFutureImports: string[];
} {
  const lines = studentSource.replace(/\r\n/g, "\n").split("\n");
  const outLines: string[] = [];
  const extraFutureImports: string[] = [];
  const seenFuture = new Set<string>(["annotations"]);

  let tripleQuote: '"""' | "'''" | null = null;
  let mainBlockIndent: number | null = null;
  let inFutureContinuation = false;

  const collectFutureFeatures = (spec: string): void => {
    const cleaned = stripInlinePythonComment(spec).replace(/[()\\]/g, " ");
    for (const part of cleaned.split(",")) {
      const feature = part.trim();
      if (feature && !seenFuture.has(feature)) {
        seenFuture.add(feature);
        extraFutureImports.push(`from __future__ import ${feature}`);
      }
    }
  };

  for (let idx = 0; idx < lines.length; idx += 1) {
    const line = lines[idx]!;
    const nextTriple = countTripleQuoteTransitions(line, tripleQuote);

    if (inFutureContinuation) {
      collectFutureFeatures(line);
      outLines.push("# [harness hoisted __future__ import]");
      const noComment = stripInlinePythonComment(line).trimEnd();
      if (noComment.endsWith("\\") || (noComment.includes("(") && !noComment.includes(")"))) {
        inFutureContinuation = true;
      } else {
        inFutureContinuation = false;
      }
      tripleQuote = nextTriple;
      continue;
    }

    if (mainBlockIndent !== null) {
      if (tripleQuote !== null) {
        outLines.push("# [harness stripped __main__]");
        tripleQuote = nextTriple;
        continue;
      }
      const trimmed = line.trim();
      const indent = line.length - line.trimStart().length;
      if (trimmed === "") {
        outLines.push("");
        tripleQuote = nextTriple;
        continue;
      }
      if (indent > mainBlockIndent) {
        outLines.push("# [harness stripped __main__]");
        tripleQuote = nextTriple;
        continue;
      }
      if (indent === mainBlockIndent && /^(?:elif\b|else\s*:)/.test(trimmed)) {
        outLines.push("# [harness stripped __main__]");
        tripleQuote = nextTriple;
        continue;
      }
      mainBlockIndent = null;
    }

    if (tripleQuote === null) {
      const indent = line.length - line.trimStart().length;
      const codeOnly = stripInlinePythonComment(line).trim();
      const futureMatch = codeOnly.match(/^from\s+__future__\s+import\s+(.+)$/);
      if (futureMatch?.[1] !== undefined) {
        collectFutureFeatures(futureMatch[1]);
        outLines.push("# [harness hoisted __future__ import]");
        if (codeOnly.endsWith("\\") || (codeOnly.includes("(") && !codeOnly.includes(")"))) {
          inFutureContinuation = true;
        }
        tripleQuote = nextTriple;
        continue;
      }

      if (indent === 0) {
        const mainMatch = codeOnly.match(
          /^if\s+(?:\(?\s*__name__\s*==\s*['"]__main__['"]\s*\)?|\(?\s*['"]__main__['"]\s*==\s*__name__\s*\)?)\s*:\s*(.*)$/
        );
        if (mainMatch) {
          outLines.push("# [harness stripped __main__]");
          const trailing = (mainMatch[1] ?? "").trim();
          if (!trailing || trailing.startsWith("#")) {
            mainBlockIndent = indent;
          }
          tripleQuote = nextTriple;
          continue;
        }
      }
    }

    outLines.push(line);
    tripleQuote = nextTriple;
  }

  return {
    cleanedSource: outLines.join("\n"),
    extraFutureImports
  };
}

function findCppRawStringEnd(src: string, openQuoteIdx: number): number {
  const delimStart = openQuoteIdx + 2;
  const openParen = src.indexOf("(", delimStart);
  if (openParen === -1) {
    return src.length - 1;
  }
  const delim = src.slice(delimStart, openParen);
  if (delim.length > 16 || /[\s()\\]/.test(delim)) {
    return -1;
  }
  const closeMarker = `)${delim}"`;
  const closeIdx = src.indexOf(closeMarker, openParen + 1);
  return closeIdx === -1 ? src.length - 1 : closeIdx + closeMarker.length - 1;
}

function skipCppWsAndComments(src: string, start: number): number {
  let i = start;
  while (i < src.length) {
    const ch = src[i]!;
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }
    if (ch === "/" && src[i + 1] === "/") {
      const nl = src.indexOf("\n", i + 2);
      i = nl === -1 ? src.length : nl + 1;
      continue;
    }
    if (ch === "/" && src[i + 1] === "*") {
      const end = src.indexOf("*/", i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    break;
  }
  return i;
}

function stripCppMainFunction(studentSource: string): string {
  const out: string[] = [];
  let lastCopied = 0;
  let braceDepth = 0;
  let i = 0;

  while (i < studentSource.length) {
    const ch = studentSource[i]!;
    const next = studentSource[i + 1];

    // Line comment
    if (ch === "/" && next === "/") {
      const nl = studentSource.indexOf("\n", i + 2);
      i = nl === -1 ? studentSource.length : nl + 1;
      continue;
    }
    // Block comment
    if (ch === "/" && next === "*") {
      const end = studentSource.indexOf("*/", i + 2);
      i = end === -1 ? studentSource.length : end + 2;
      continue;
    }
    // C++11 raw string literal R"delim(...)delim"
    if (ch === "R" && next === '"') {
      const prevCh = i > 0 ? studentSource[i - 1] : "";
      if (!/[A-Za-z0-9_]/.test(prevCh ?? "")) {
        const rawEnd = findCppRawStringEnd(studentSource, i);
        if (rawEnd !== -1) {
          i = rawEnd + 1;
          continue;
        }
      }
    }
    // String or char literal
    if (ch === '"' || ch === "'") {
      i += 1;
      while (i < studentSource.length) {
        if (studentSource[i] === "\\") {
          i += 2;
          continue;
        }
        if (studentSource[i] === ch) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    // Preprocessor directive
    if (ch === "#" && (i === 0 || studentSource[i - 1] === "\n" || /^[ \t]*$/.test(studentSource.slice(studentSource.lastIndexOf("\n", i) + 1, i)))) {
      while (i < studentSource.length) {
        if (studentSource[i] === "\\" && studentSource[i + 1] === "\n") {
          i += 2;
          continue;
        }
        if (studentSource[i] === "\\" && studentSource[i + 1] === "\r" && studentSource[i + 2] === "\n") {
          i += 3;
          continue;
        }
        if (studentSource[i] === "\n") {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }

    if (ch === "{") {
      braceDepth += 1;
      i += 1;
      continue;
    }
    if (ch === "}") {
      braceDepth = Math.max(0, braceDepth - 1);
      i += 1;
      continue;
    }

    if (braceDepth === 0 && (ch === "i" || ch === "s" || ch === "a")) {
      const prev = i > 0 ? studentSource[i - 1]! : "";
      if (!/[A-Za-z0-9_.:>]/.test(prev)) {
        const slice = studentSource.slice(i);
        const sig = slice.match(/^(?:int|signed|int32_t|auto)\s+main\s*\(/);
        if (sig) {
          // Scan balanced (...) parameter list
          let p = i + sig[0].length;
          let parenDepth = 1;
          while (p < studentSource.length && parenDepth > 0) {
            const pc = studentSource[p]!;
            if (pc === "(") parenDepth += 1;
            else if (pc === ")") parenDepth -= 1;
            else if (pc === '"' || pc === "'") {
              p += 1;
              while (p < studentSource.length) {
                if (studentSource[p] === "\\") {
                  p += 2;
                  continue;
                }
                if (studentSource[p] === pc) break;
                p += 1;
              }
            } else if (pc === "/" && studentSource[p + 1] === "/") {
              const nl = studentSource.indexOf("\n", p + 2);
              p = nl === -1 ? studentSource.length - 1 : nl;
            } else if (pc === "/" && studentSource[p + 1] === "*") {
              const ce = studentSource.indexOf("*/", p + 2);
              p = ce === -1 ? studentSource.length - 1 : ce + 1;
            }
            p += 1;
          }

          p = skipCppWsAndComments(studentSource, p);
          // Optional trailing return type `-> int`
          if (studentSource.startsWith("->", p)) {
            p = skipCppWsAndComments(studentSource, p + 2);
            const retMatch = studentSource.slice(p).match(/^[A-Za-z0-9_:]+/);
            if (retMatch) {
              p = skipCppWsAndComments(studentSource, p + retMatch[0].length);
            }
          }

          if (studentSource[p] === "{") {
            let b = p + 1;
            let bodyDepth = 1;
            while (b < studentSource.length && bodyDepth > 0) {
              const bc = studentSource[b]!;
              const bNext = studentSource[b + 1];
              if (bc === "/" && bNext === "/") {
                const nl = studentSource.indexOf("\n", b + 2);
                b = nl === -1 ? studentSource.length : nl + 1;
                continue;
              }
              if (bc === "/" && bNext === "*") {
                const ce = studentSource.indexOf("*/", b + 2);
                b = ce === -1 ? studentSource.length : ce + 2;
                continue;
              }
              if (bc === "R" && bNext === '"' && !/[A-Za-z0-9_]/.test(studentSource[b - 1] ?? "")) {
                const rawEnd = findCppRawStringEnd(studentSource, b);
                if (rawEnd !== -1) {
                  b = rawEnd + 1;
                  continue;
                }
              }
              if (bc === '"' || bc === "'") {
                b += 1;
                while (b < studentSource.length) {
                  if (studentSource[b] === "\\") {
                    b += 2;
                    continue;
                  }
                  if (studentSource[b] === bc) {
                    b += 1;
                    break;
                  }
                  b += 1;
                }
                continue;
              }
              if (bc === "{") bodyDepth += 1;
              else if (bc === "}") bodyDepth -= 1;
              b += 1;
            }

            out.push(studentSource.slice(lastCopied, i), "/* [harness stripped local main] */");
            lastCopied = b;
            i = b;
            continue;
          }
        }
      }
    }

    i += 1;
  }

  if (lastCopied === 0) {
    return studentSource;
  }
  out.push(studentSource.slice(lastCopied));
  return out.join("");
}

function buildPythonHarness(
  studentSource: string,
  entryName: string,
  params: Array<{ name: string; type: NormalizedLeetCodeType }>,
  returnType: NormalizedLeetCodeType
): string {
  const prepared = preparePythonStudentSource(studentSource);
  const needsListNode =
    params.some((p) => p.type === "ListNode" || p.type === "ListNode[]") ||
    returnType === "ListNode" ||
    returnType === "ListNode[]";
  const needsTreeNode =
    params.some((p) => p.type === "TreeNode") || returnType === "TreeNode";

  const preludeParts: string[] = [
    "# Auto-generated Algo Coach local LeetCode Python harness (temporary file)",
    "from __future__ import annotations",
    ...prepared.extraFutureImports,
    "import json",
    "import re",
    "import sys",
    "from collections import deque",
    "from typing import Any, Dict, List, Optional, Set, Tuple",
    ""
  ];

  if (needsListNode && !hasUncommentedPythonClass(prepared.cleanedSource, "ListNode")) {
    preludeParts.push(
      "class ListNode:",
      "    def __init__(self, val: int = 0, next: Optional['ListNode'] = None):",
      "        self.val = val",
      "        self.next = next",
      ""
    );
  }

  if (needsTreeNode && !hasUncommentedPythonClass(prepared.cleanedSource, "TreeNode")) {
    preludeParts.push(
      "class TreeNode:",
      "    def __init__(self, val: int = 0, left: Optional['TreeNode'] = None, right: Optional['TreeNode'] = None):",
      "        self.val = val",
      "        self.left = left",
      "        self.right = right",
      ""
    );
  }

  const paramTypesJson = JSON.stringify(params.map((p) => p.type));
  const paramNamesJson = JSON.stringify(params.map((p) => p.name));

  const driverTail = `

# --- Algo Coach Runtime Driver ---
def _ac_list_to_listnode(arr):
    if not arr:
        return None
    cls = globals().get("ListNode")
    dummy = cls(0)
    curr = dummy
    for v in arr:
        curr.next = cls(v)
        curr = curr.next
    return dummy.next

def _ac_listnode_to_list(node):
    out = []
    seen = set()
    while node is not None:
        oid = id(node)
        if oid in seen:
            break
        seen.add(oid)
        out.append(node.val)
        node = node.next
    return out

def _ac_list_to_treenode(arr):
    if not arr:
        return None
    if arr[0] is None:
        return None
    cls = globals().get("TreeNode")
    root = cls(arr[0])
    q = deque([root])
    i = 1
    while q and i < len(arr):
        node = q.popleft()
        if i < len(arr) and arr[i] is not None:
            node.left = cls(arr[i])
            q.append(node.left)
        i += 1
        if i < len(arr) and arr[i] is not None:
            node.right = cls(arr[i])
            q.append(node.right)
        i += 1
    return root

def _ac_treenode_to_list(root):
    if root is None:
        return []
    out = []
    q = deque([root])
    while q:
        node = q.popleft()
        if node is None:
            out.append(None)
        else:
            out.append(node.val)
            q.append(node.left)
            q.append(node.right)
    while out and out[-1] is None:
        out.pop()
    return out

def _ac_convert_in(val, t):
    if t == "ListNode":
        return _ac_list_to_listnode(val)
    if t == "ListNode[]":
        return [_ac_list_to_listnode(item) for item in (val or [])]
    if t == "TreeNode":
        return _ac_list_to_treenode(val)
    return val

def _ac_convert_out(val, t):
    if t == "ListNode":
        return _ac_listnode_to_list(val)
    if t == "ListNode[]":
        return [_ac_listnode_to_list(item) for item in (val or [])]
    if t == "TreeNode":
        return _ac_treenode_to_list(val)
    return val

def _ac_parse_var_assignments(text, param_names, expected_count):
    decoder = json.JSONDecoder()
    pos = 0
    n = len(text)
    items = []
    by_name = {}
    ident_eq = re.compile(r"([A-Za-z_][A-Za-z0-9_]*)\\s*=(?!=)")
    while pos < n:
        while pos < n and text[pos] in " \\t\\r\\n,":
            pos += 1
        if pos >= n:
            break
        m = ident_eq.match(text, pos)
        if not m:
            return None
        name = m.group(1)
        pos = m.end()
        while pos < n and text[pos] in " \\t\\r\\n":
            pos += 1
        try:
            obj, end_pos = decoder.raw_decode(text, pos)
        except Exception:
            return None
        items.append((name, obj))
        by_name[name] = obj
        pos = end_pos
    if len(items) < expected_count:
        return None
    if len(param_names) == expected_count and all(name in by_name for name in param_names):
        return [by_name[name] for name in param_names]
    return [val for _, val in items[:expected_count]]

def _ac_parse_sequential_json(text, expected_count):
    decoder = json.JSONDecoder()
    pos = 0
    n = len(text)
    vals = []
    while pos < n and len(vals) < expected_count:
        while pos < n and text[pos] in " \\t\\r\\n":
            pos += 1
        if pos >= n:
            break
        obj, end_pos = decoder.raw_decode(text, pos)
        vals.append(obj)
        pos = end_pos
    return vals

def _ac_parse_inputs(raw_text, param_names, param_types):
    if len(param_types) == 0:
        return []
    text = raw_text.replace("\\r\\n", "\\n").strip()
    if not text:
        raise ValueError(f"Expected {len(param_types)} JSON parameter lines, got 0.")

    assigned = _ac_parse_var_assignments(text, param_names, len(param_types))
    if assigned is not None:
        return [_ac_convert_in(v, t) for v, t in zip(assigned, param_types)]

    lines = [ln.strip() for ln in text.split("\\n") if ln.strip()]
    if len(lines) >= len(param_types):
        try:
            vals = [json.loads(raw_line) for raw_line in lines[:len(param_types)]]
            return [_ac_convert_in(v, t) for v, t in zip(vals, param_types)]
        except Exception:
            pass

    seq_vals = _ac_parse_sequential_json(text, len(param_types))
    if len(seq_vals) >= len(param_types):
        return [_ac_convert_in(v, t) for v, t in zip(seq_vals[:len(param_types)], param_types)]

    raise ValueError(f"Expected {len(param_types)} JSON parameter lines, got {len(lines)}.")

def _ac_main():
    raw = sys.stdin.read()
    param_names = ${paramNamesJson}
    param_types = ${paramTypesJson}
    return_type = ${JSON.stringify(returnType)}
    args = _ac_parse_inputs(raw, param_names, param_types)
    sol = Solution()
    fn = getattr(sol, ${JSON.stringify(entryName)})
    res = fn(*args)
    if return_type == "void":
        if len(args) > 0:
            out_val = _ac_convert_out(args[0], param_types[0])
            print(json.dumps(out_val, separators=(",", ":")))
    else:
        out_val = _ac_convert_out(res, return_type)
        print(json.dumps(out_val, separators=(",", ":")))

if __name__ == "__main__":
    _ac_main()
`;

  return `${preludeParts.join("\n")}\n${prepared.cleanedSource}\n${driverTail}`;
}

function cppTypeName(t: NormalizedLeetCodeType): string {
  switch (t) {
    case "int":
      return "int";
    case "long":
      return "long long";
    case "double":
      return "double";
    case "bool":
      return "bool";
    case "string":
      return "string";
    case "char":
      return "char";
    case "void":
      return "void";
    case "int[]":
      return "vector<int>";
    case "long[]":
      return "vector<long long>";
    case "double[]":
      return "vector<double>";
    case "bool[]":
      return "vector<bool>";
    case "string[]":
      return "vector<string>";
    case "char[]":
      return "vector<char>";
    case "int[][]":
      return "vector<vector<int>>";
    case "string[][]":
      return "vector<vector<string>>";
    case "char[][]":
      return "vector<vector<char>>";
    case "ListNode":
      return "ListNode*";
    case "ListNode[]":
      return "vector<ListNode*>";
    case "TreeNode":
      return "TreeNode*";
  }
}

function cppParseExpr(t: NormalizedLeetCodeType, varName: string): string {
  switch (t) {
    case "int":
      return `ac::as_int(${varName})`;
    case "long":
      return `ac::as_long(${varName})`;
    case "double":
      return `ac::as_double(${varName})`;
    case "bool":
      return `ac::as_bool(${varName})`;
    case "string":
      return `ac::as_string(${varName})`;
    case "char":
      return `ac::as_char(${varName})`;
    case "int[]":
      return `ac::as_vec_int(${varName})`;
    case "long[]":
      return `ac::as_vec_long(${varName})`;
    case "double[]":
      return `ac::as_vec_double(${varName})`;
    case "bool[]":
      return `ac::as_vec_bool(${varName})`;
    case "string[]":
      return `ac::as_vec_string(${varName})`;
    case "char[]":
      return `ac::as_vec_char(${varName})`;
    case "int[][]":
      return `ac::as_vec2_int(${varName})`;
    case "string[][]":
      return `ac::as_vec2_string(${varName})`;
    case "char[][]":
      return `ac::as_vec2_char(${varName})`;
    case "ListNode":
      return `ac::as_listnode(${varName})`;
    case "ListNode[]":
      return `ac::as_vec_listnode(${varName})`;
    case "TreeNode":
      return `ac::as_treenode(${varName})`;
    case "void":
      return "";
  }
}

function buildCppHarness(
  studentSource: string,
  entryName: string,
  params: Array<{ name: string; type: NormalizedLeetCodeType }>,
  returnType: NormalizedLeetCodeType
): string {
  const cleanedStudentSource = stripCppMainFunction(studentSource);
  const needsListNode =
    params.some((p) => p.type === "ListNode" || p.type === "ListNode[]") ||
    returnType === "ListNode" ||
    returnType === "ListNode[]";
  const needsTreeNode =
    params.some((p) => p.type === "TreeNode") || returnType === "TreeNode";

  const structs: string[] = [];
  if (needsListNode && !hasUncommentedCppStruct(cleanedStudentSource, "ListNode")) {
    structs.push(`struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};`);
  }
  if (needsTreeNode && !hasUncommentedCppStruct(cleanedStudentSource, "TreeNode")) {
    structs.push(`struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};`);
  }

  const listNodeHelpers = needsListNode
    ? `
ListNode* as_listnode(const JVal& v) {
    ListNode dummy(0);
    ListNode* cur = &dummy;
    for (const auto& item : v.arr) {
        cur->next = new ListNode(as_int(item));
        cur = cur->next;
    }
    return dummy.next;
}
vector<ListNode*> as_vec_listnode(const JVal& v) {
    vector<ListNode*> res;
    for (const auto& item : v.arr) res.push_back(as_listnode(item));
    return res;
}
template <> inline ListNode* from_jval<ListNode*>(const JVal& v) { return as_listnode(v); }
template <> inline vector<ListNode*> from_jval<vector<ListNode*>>(const JVal& v) { return as_vec_listnode(v); }
string to_json(ListNode* head) {
    string out = "[";
    unordered_set<ListNode*> seen;
    bool first = true;
    while (head && !seen.count(head)) {
        seen.insert(head);
        if (!first) out += ",";
        first = false;
        out += to_string(head->val);
        head = head->next;
    }
    out += "]";
    return out;
}
string to_json(const vector<ListNode*>& heads) {
    string out = "[";
    for (size_t i = 0; i < heads.size(); ++i) {
        if (i) out += ",";
        out += to_json(heads[i]);
    }
    out += "]";
    return out;
}
`
    : "";

  const treeNodeHelpers = needsTreeNode
    ? `
TreeNode* as_treenode(const JVal& v) {
    if (v.arr.empty() || v.arr[0].kind == JVal::Null) return nullptr;
    TreeNode* root = new TreeNode(as_int(v.arr[0]));
    queue<TreeNode*> q;
    q.push(root);
    size_t i = 1;
    while (!q.empty() && i < v.arr.size()) {
        TreeNode* cur = q.front(); q.pop();
        if (i < v.arr.size() && v.arr[i].kind != JVal::Null) {
            cur->left = new TreeNode(as_int(v.arr[i]));
            q.push(cur->left);
        }
        ++i;
        if (i < v.arr.size() && v.arr[i].kind != JVal::Null) {
            cur->right = new TreeNode(as_int(v.arr[i]));
            q.push(cur->right);
        }
        ++i;
    }
    return root;
}
template <> inline TreeNode* from_jval<TreeNode*>(const JVal& v) { return as_treenode(v); }
string to_json(TreeNode* root) {
    if (!root) return "[]";
    vector<string> vals;
    queue<TreeNode*> q;
    q.push(root);
    while (!q.empty()) {
        TreeNode* cur = q.front(); q.pop();
        if (!cur) {
            vals.push_back("null");
        } else {
            vals.push_back(to_string(cur->val));
            q.push(cur->left);
            q.push(cur->right);
        }
    }
    while (!vals.empty() && vals.back() == "null") vals.pop_back();
    string out = "[";
    for (size_t i = 0; i < vals.size(); ++i) {
        if (i) out += ",";
        out += vals[i];
    }
    out += "]";
    return out;
}
`
    : "";

  const parseDeclsNormal = params
    .map(
      (p, idx) =>
        `    auto arg_${idx} = ${cppParseExpr(p.type, `jargs[${idx}]`)}; // ${p.name}: ${cppTypeName(p.type)}`
    )
    .join("\n");
  const parseDeclsRedefined = params
    .map(
      (p, idx) =>
        `    auto arg_${idx} = ac::from_jval<ac::fn_param_t<${idx}, decltype(&Solution::${entryName})>>(jargs[${idx}]); // ${p.name}`
    )
    .join("\n");
  const parseDeclsBlock =
    params.length === 0
      ? ""
      : `#if AC_STUDENT_INT_REDEFINED\n${parseDeclsRedefined}\n#else\n${parseDeclsNormal}\n#endif`;

  const argList = params.map((_p, idx) => `arg_${idx}`).join(", ");
  const paramNamesCppLiteral =
    params.length === 0
      ? "{}"
      : `{${params.map((p) => JSON.stringify(p.name)).join(", ")}}`;

  const invokeAndPrint =
    returnType === "void"
      ? `    sol.${entryName}(${argList});\n${
          params.length > 0 ? "    cout << ac::to_json(arg_0) << \"\\n\";" : ""
        }`
      : `    auto res = sol.${entryName}(${argList});\n    cout << ac::to_json(res) << "\\n";`;

  return `// Auto-generated Algo Coach local LeetCode C++ harness (temporary file)
#include <algorithm>
#include <climits>
#include <cmath>
#include <cstdint>
#include <deque>
#include <iomanip>
#include <iostream>
#include <map>
#include <queue>
#include <set>
#include <sstream>
#include <stack>
#include <stdexcept>
#include <string>
#include <tuple>
#include <type_traits>
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

using namespace std;

${structs.join("\n\n")}

${cleanedStudentSource}

#ifdef int
#define AC_STUDENT_INT_REDEFINED 1
#undef int
#else
#define AC_STUDENT_INT_REDEFINED 0
#endif

namespace ac {
struct JVal {
    enum Kind { Null, Bool, Num, Str, Arr } kind = Null;
    bool b = false;
    string raw;
    vector<JVal> arr;
};

struct Parser {
    const string& s;
    size_t p = 0;
    void skipWs() { while (p < s.size() && isspace(static_cast<unsigned char>(s[p]))) ++p; }
    static bool parseHex4(const string& str, size_t idx, uint32_t& out) {
        if (idx + 4 > str.size()) return false;
        out = 0;
        for (size_t k = 0; k < 4; ++k) {
            char hc = str[idx + k];
            out <<= 4;
            if (hc >= '0' && hc <= '9') out |= static_cast<uint32_t>(hc - '0');
            else if (hc >= 'a' && hc <= 'f') out |= static_cast<uint32_t>(hc - 'a' + 10);
            else if (hc >= 'A' && hc <= 'F') out |= static_cast<uint32_t>(hc - 'A' + 10);
            else return false;
        }
        return true;
    }
    static void appendUtf8(string& dst, uint32_t cp) {
        if (cp <= 0x7F) {
            dst.push_back(static_cast<char>(cp));
        } else if (cp <= 0x7FF) {
            dst.push_back(static_cast<char>(0xC0 | (cp >> 6)));
            dst.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
        } else if (cp <= 0xFFFF) {
            dst.push_back(static_cast<char>(0xE0 | (cp >> 12)));
            dst.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
            dst.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
        } else {
            dst.push_back(static_cast<char>(0xF0 | (cp >> 18)));
            dst.push_back(static_cast<char>(0x80 | ((cp >> 12) & 0x3F)));
            dst.push_back(static_cast<char>(0x80 | ((cp >> 6) & 0x3F)));
            dst.push_back(static_cast<char>(0x80 | (cp & 0x3F)));
        }
    }
    JVal parse() {
        skipWs();
        if (p >= s.size()) throw runtime_error("Unexpected EOF in JSON input");
        char c = s[p];
        if (c == '[') {
            JVal v; v.kind = JVal::Arr; ++p; skipWs();
            if (p < s.size() && s[p] == ']') { ++p; return v; }
            while (p < s.size()) {
                v.arr.push_back(parse());
                skipWs();
                if (p < s.size() && s[p] == ',') { ++p; continue; }
                if (p < s.size() && s[p] == ']') { ++p; break; }
                throw runtime_error("Expected ',' or ']' in JSON array");
            }
            return v;
        }
        if (c == '"') {
            JVal v; v.kind = JVal::Str; ++p;
            while (p < s.size() && s[p] != '"') {
                if (s[p] == '\\\\' && p + 1 < s.size()) {
                    ++p;
                    char e = s[p++];
                    if (e == 'n') v.raw.push_back('\\n');
                    else if (e == 't') v.raw.push_back('\\t');
                    else if (e == 'r') v.raw.push_back('\\r');
                    else if (e == 'b') v.raw.push_back('\\b');
                    else if (e == 'f') v.raw.push_back('\\f');
                    else if (e == 'u') {
                        uint32_t cp = 0;
                        if (parseHex4(s, p, cp)) {
                            p += 4;
                            if (cp >= 0xD800 && cp <= 0xDBFF && p + 6 <= s.size() && s[p] == '\\\\' && s[p + 1] == 'u') {
                                uint32_t low = 0;
                                if (parseHex4(s, p + 2, low) && low >= 0xDC00 && low <= 0xDFFF) {
                                    cp = 0x10000 + (((cp - 0xD800) << 10) | (low - 0xDC00));
                                    p += 6;
                                }
                            }
                            appendUtf8(v.raw, cp);
                        } else {
                            v.raw.push_back('u');
                        }
                    } else {
                        v.raw.push_back(e);
                    }
                } else {
                    v.raw.push_back(s[p++]);
                }
            }
            if (p < s.size() && s[p] == '"') ++p;
            return v;
        }
        if (s.compare(p, 4, "null") == 0) { p += 4; return JVal{}; }
        if (s.compare(p, 4, "true") == 0) { p += 4; JVal v; v.kind = JVal::Bool; v.b = true; return v; }
        if (s.compare(p, 5, "false") == 0) { p += 5; JVal v; v.kind = JVal::Bool; v.b = false; return v; }
        JVal v; v.kind = JVal::Num;
        size_t start = p;
        while (p < s.size() && (isdigit(static_cast<unsigned char>(s[p])) || s[p] == '-' || s[p] == '+' || s[p] == '.' || s[p] == 'e' || s[p] == 'E')) ++p;
        if (p == start) throw runtime_error("Unexpected token in JSON input");
        v.raw = s.substr(start, p - start);
        return v;
    }
};

inline bool parse_var_assignments(const string& raw, const vector<string>& param_names, size_t expected_count, vector<JVal>& out) {
    size_t pos = 0;
    size_t n = raw.size();
    vector<pair<string, JVal>> items;
    map<string, size_t> name_to_idx;
    auto is_ident_start = [](char c) { return (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c == '_'; };
    auto is_ident_char = [&](char c) { return is_ident_start(c) || (c >= '0' && c <= '9'); };
    while (pos < n) {
        while (pos < n && (isspace(static_cast<unsigned char>(raw[pos])) || raw[pos] == ',')) ++pos;
        if (pos >= n) break;
        if (!is_ident_start(raw[pos])) return false;
        size_t id_start = pos;
        while (pos < n && is_ident_char(raw[pos])) ++pos;
        string name = raw.substr(id_start, pos - id_start);
        while (pos < n && isspace(static_cast<unsigned char>(raw[pos]))) ++pos;
        if (pos >= n || raw[pos] != '=' || (pos + 1 < n && raw[pos + 1] == '=')) return false;
        ++pos;
        Parser parser{raw, pos};
        JVal val;
        try {
            val = parser.parse();
        } catch (...) {
            return false;
        }
        pos = parser.p;
        name_to_idx[name] = items.size();
        items.push_back({name, std::move(val)});
    }
    if (items.size() < expected_count) return false;
    out.clear();
    if (param_names.size() == expected_count) {
        bool all_named = true;
        for (const auto& pn : param_names) {
            if (!name_to_idx.count(pn)) { all_named = false; break; }
        }
        if (all_named) {
            for (const auto& pn : param_names) out.push_back(items[name_to_idx[pn]].second);
            return true;
        }
    }
    for (size_t i = 0; i < expected_count; ++i) out.push_back(items[i].second);
    return true;
}

inline vector<JVal> parse_inputs(const string& raw, const vector<string>& param_names, size_t expected_count) {
    vector<JVal> jargs;
    if (expected_count == 0) return jargs;
    if (parse_var_assignments(raw, param_names, expected_count, jargs)) return jargs;

    vector<string> lines;
    istringstream iss(raw);
    string line;
    while (getline(iss, line)) {
        if (!line.empty() && line.back() == '\\r') line.pop_back();
        bool has_non_ws = false;
        for (char c : line) {
            if (!isspace(static_cast<unsigned char>(c))) { has_non_ws = true; break; }
        }
        if (has_non_ws) lines.push_back(line);
    }
    if (lines.size() >= expected_count) {
        bool all_ok = true;
        vector<JVal> line_vals;
        for (size_t i = 0; i < expected_count; ++i) {
            try {
                Parser p{lines[i], 0};
                line_vals.push_back(p.parse());
            } catch (...) {
                all_ok = false;
                break;
            }
        }
        if (all_ok) return line_vals;
    }

    // Sequential JSON values fallback (supports pretty-printed multi-line arrays)
    try {
        Parser seq{raw, 0};
        vector<JVal> seq_vals;
        for (size_t i = 0; i < expected_count; ++i) {
            seq_vals.push_back(seq.parse());
        }
        return seq_vals;
    } catch (...) {
        ostringstream err;
        err << "Expected " << expected_count << " JSON parameter line(s), got " << lines.size();
        throw runtime_error(err.str());
    }
}

int as_int(const JVal& v) { return stoi(v.raw); }
long long as_long(const JVal& v) { return stoll(v.raw); }
double as_double(const JVal& v) { return stod(v.raw); }
bool as_bool(const JVal& v) { return v.b; }
string as_string(const JVal& v) { return v.raw; }
char as_char(const JVal& v) { return v.raw.empty() ? '\\0' : v.raw[0]; }
vector<int> as_vec_int(const JVal& v) { vector<int> r; for (auto& x : v.arr) r.push_back(as_int(x)); return r; }
vector<long long> as_vec_long(const JVal& v) { vector<long long> r; for (auto& x : v.arr) r.push_back(as_long(x)); return r; }
vector<double> as_vec_double(const JVal& v) { vector<double> r; for (auto& x : v.arr) r.push_back(as_double(x)); return r; }
vector<bool> as_vec_bool(const JVal& v) { vector<bool> r; for (auto& x : v.arr) r.push_back(as_bool(x)); return r; }
vector<string> as_vec_string(const JVal& v) { vector<string> r; for (auto& x : v.arr) r.push_back(as_string(x)); return r; }
vector<char> as_vec_char(const JVal& v) { vector<char> r; for (auto& x : v.arr) r.push_back(as_char(x)); return r; }
vector<vector<int>> as_vec2_int(const JVal& v) { vector<vector<int>> r; for (auto& x : v.arr) r.push_back(as_vec_int(x)); return r; }
vector<vector<long long>> as_vec2_long(const JVal& v) { vector<vector<long long>> r; for (auto& x : v.arr) r.push_back(as_vec_long(x)); return r; }
vector<vector<string>> as_vec2_string(const JVal& v) { vector<vector<string>> r; for (auto& x : v.arr) r.push_back(as_vec_string(x)); return r; }
vector<vector<char>> as_vec2_char(const JVal& v) { vector<vector<char>> r; for (auto& x : v.arr) r.push_back(as_vec_char(x)); return r; }

template <typename Fn>
struct fn_traits;
template <typename R, typename C, typename... Args>
struct fn_traits<R (C::*)(Args...)> {
    using args_tuple = tuple<typename decay<Args>::type...>;
};
template <typename R, typename C, typename... Args>
struct fn_traits<R (C::*)(Args...) const> {
    using args_tuple = tuple<typename decay<Args>::type...>;
};
template <typename R, typename... Args>
struct fn_traits<R (*)(Args...)> {
    using args_tuple = tuple<typename decay<Args>::type...>;
};
template <size_t I, typename Fn>
using fn_param_t = typename tuple_element<I, typename fn_traits<Fn>::args_tuple>::type;

template <typename T>
inline T from_jval(const JVal& v);
template <> inline int from_jval<int>(const JVal& v) { return as_int(v); }
template <> inline long long from_jval<long long>(const JVal& v) { return as_long(v); }
template <> inline double from_jval<double>(const JVal& v) { return as_double(v); }
template <> inline bool from_jval<bool>(const JVal& v) { return as_bool(v); }
template <> inline string from_jval<string>(const JVal& v) { return as_string(v); }
template <> inline char from_jval<char>(const JVal& v) { return as_char(v); }
template <> inline vector<int> from_jval<vector<int>>(const JVal& v) { return as_vec_int(v); }
template <> inline vector<long long> from_jval<vector<long long>>(const JVal& v) { return as_vec_long(v); }
template <> inline vector<double> from_jval<vector<double>>(const JVal& v) { return as_vec_double(v); }
template <> inline vector<bool> from_jval<vector<bool>>(const JVal& v) { return as_vec_bool(v); }
template <> inline vector<string> from_jval<vector<string>>(const JVal& v) { return as_vec_string(v); }
template <> inline vector<char> from_jval<vector<char>>(const JVal& v) { return as_vec_char(v); }
template <> inline vector<vector<int>> from_jval<vector<vector<int>>>(const JVal& v) { return as_vec2_int(v); }
template <> inline vector<vector<long long>> from_jval<vector<vector<long long>>>(const JVal& v) { return as_vec2_long(v); }
template <> inline vector<vector<string>> from_jval<vector<vector<string>>>(const JVal& v) { return as_vec2_string(v); }
template <> inline vector<vector<char>> from_jval<vector<vector<char>>>(const JVal& v) { return as_vec2_char(v); }

string escape_str(const string& s) {
    string o = "\\"";
    for (char c : s) {
        if (c == '\\\\') o += "\\\\\\\\";
        else if (c == '"') o += "\\\\\\"";
        else if (c == '\\n') o += "\\\\n";
        else if (c == '\\r') o += "\\\\r";
        else if (c == '\\t') o += "\\\\t";
        else o.push_back(c);
    }
    o.push_back('"');
    return o;
}
string to_json(int v) { return to_string(v); }
string to_json(long long v) { return to_string(v); }
string to_json(double v) { ostringstream oss; oss << setprecision(10) << v; return oss.str(); }
string to_json(bool v) { return v ? "true" : "false"; }
string to_json(char c) { return escape_str(string(1, c)); }
string to_json(const string& s) { return escape_str(s); }
template <typename T>
string to_json(const vector<T>& vec) {
    string out = "[";
    for (size_t i = 0; i < vec.size(); ++i) {
        if (i) out += ",";
        out += to_json(vec[i]);
    }
    out += "]";
    return out;
}
string to_json(const vector<bool>& vec) {
    string out = "[";
    for (size_t i = 0; i < vec.size(); ++i) {
        if (i) out += ",";
        out += vec[i] ? "true" : "false";
    }
    out += "]";
    return out;
}
${listNodeHelpers}
${treeNodeHelpers}
} // namespace ac

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);
    ostringstream raw_buf;
    raw_buf << cin.rdbuf();
    vector<string> param_names = ${paramNamesCppLiteral};
    vector<ac::JVal> jargs;
    try {
        jargs = ac::parse_inputs(raw_buf.str(), param_names, ${params.length});
    } catch (const exception& ex) {
        cerr << ex.what() << "\\n";
        return 1;
    }
${parseDeclsBlock}
    Solution sol;
${invokeAndPrint}
    return 0;
}
`;
}

export function generateLeetCodeHarness(options: {
  meta: FunctionSignatureMeta | undefined;
  language: SupportedLanguage;
  studentSource: string;
}): GeneratedHarnessResult {
  const support = checkLeetCodeHarnessSupport(options.meta, options.language);
  if (!support.supported) {
    return { supported: false, reason: support.reason };
  }

  const entryName = options.meta!.entryName.trim();
  if (options.language === "python") {
    return {
      supported: true,
      filename: "harness_solution.py",
      driverSource: buildPythonHarness(
        options.studentSource,
        entryName,
        support.normalizedParams,
        support.normalizedReturn
      )
    };
  }

  return {
    supported: true,
    filename: "harness_solution.cpp",
    driverSource: buildCppHarness(
      options.studentSource,
      entryName,
      support.normalizedParams,
      support.normalizedReturn
    )
  };
}
