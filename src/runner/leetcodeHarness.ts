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

function buildPythonHarness(
  studentSource: string,
  entryName: string,
  params: Array<{ name: string; type: NormalizedLeetCodeType }>,
  returnType: NormalizedLeetCodeType
): string {
  const needsListNode =
    params.some((p) => p.type === "ListNode" || p.type === "ListNode[]") ||
    returnType === "ListNode" ||
    returnType === "ListNode[]";
  const needsTreeNode =
    params.some((p) => p.type === "TreeNode") || returnType === "TreeNode";

  const preludeParts: string[] = [
    "# Auto-generated Algo Coach local LeetCode Python harness (temporary file)",
    "from __future__ import annotations",
    "import json",
    "import sys",
    "from collections import deque",
    "from typing import Any, Dict, List, Optional, Set, Tuple",
    ""
  ];

  if (needsListNode && !hasUncommentedPythonClass(studentSource, "ListNode")) {
    preludeParts.push(
      "class ListNode:",
      "    def __init__(self, val: int = 0, next: Optional['ListNode'] = None):",
      "        self.val = val",
      "        self.next = next",
      ""
    );
  }

  if (needsTreeNode && !hasUncommentedPythonClass(studentSource, "TreeNode")) {
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

def _ac_parse_inputs(raw_text, param_names, param_types):
    lines = [ln.strip() for ln in raw_text.replace("\\r\\n", "\\n").split("\\n") if ln.strip()]
    if len(lines) == 1 and len(param_types) > 1 and "=" in lines[0]:
        # Fallback for inline format like: nums = [2,7,11,15], target = 9
        decoder = json.JSONDecoder()
        text = lines[0]
        parsed = []
        pos = 0
        for name in param_names:
            idx = text.find(name, pos)
            if idx != -1:
                eq = text.find("=", idx + len(name))
                if eq != -1:
                    pos = eq + 1
                    while pos < len(text) and text[pos] in " \\t":
                        pos += 1
                    obj, end = decoder.raw_decode(text, pos)
                    parsed.append(obj)
                    pos = end
        if len(parsed) == len(param_types):
            return [_ac_convert_in(v, t) for v, t in zip(parsed, param_types)]

    if len(lines) < len(param_types):
        raise ValueError(f"Expected {len(param_types)} JSON parameter lines, got {len(lines)}.")

    args = []
    for raw_line, t in zip(lines[:len(param_types)], param_types):
        val = json.loads(raw_line)
        args.append(_ac_convert_in(val, t))
    return args

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

  return `${preludeParts.join("\n")}\n${studentSource}\n${driverTail}`;
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
  const needsListNode =
    params.some((p) => p.type === "ListNode" || p.type === "ListNode[]") ||
    returnType === "ListNode" ||
    returnType === "ListNode[]";
  const needsTreeNode =
    params.some((p) => p.type === "TreeNode") || returnType === "TreeNode";

  const structs: string[] = [];
  if (needsListNode && !hasUncommentedCppStruct(studentSource, "ListNode")) {
    structs.push(`struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};`);
  }
  if (needsTreeNode && !hasUncommentedCppStruct(studentSource, "TreeNode")) {
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

  const parseDecls = params
    .map(
      (p, idx) =>
        `    auto arg_${idx} = ${cppParseExpr(p.type, `jargs[${idx}]`)}; // ${p.name}: ${cppTypeName(p.type)}`
    )
    .join("\n");
  const argList = params.map((_p, idx) => `arg_${idx}`).join(", ");

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
#include <unordered_map>
#include <unordered_set>
#include <utility>
#include <vector>

using namespace std;

${structs.join("\n\n")}

${studentSource}

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
                    else v.raw.push_back(e);
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
        v.raw = s.substr(start, p - start);
        return v;
    }
};

JVal parse_line(const string& line) { Parser p{line, 0}; return p.parse(); }
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
vector<vector<string>> as_vec2_string(const JVal& v) { vector<vector<string>> r; for (auto& x : v.arr) r.push_back(as_vec_string(x)); return r; }
vector<vector<char>> as_vec2_char(const JVal& v) { vector<vector<char>> r; for (auto& x : v.arr) r.push_back(as_vec_char(x)); return r; }

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
    vector<string> lines;
    string line;
    while (getline(cin, line)) {
        if (!line.empty() && line.back() == '\\r') line.pop_back();
        if (!line.empty()) lines.push_back(line);
    }
    if (lines.size() < ${params.length}) {
        cerr << "Expected ${params.length} JSON parameter line(s), got " << lines.size() << "\\n";
        return 1;
    }
    vector<ac::JVal> jargs;
    for (size_t i = 0; i < ${params.length}; ++i) {
        jargs.push_back(ac::parse_line(lines[i]));
    }
${parseDecls}
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
