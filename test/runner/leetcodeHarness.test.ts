import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FunctionSignatureMeta } from "../../src/core/contracts";
import {
  checkLeetCodeHarnessSupport,
  generateLeetCodeHarness,
  probeSingleToolchain,
  runSandboxedProcess,
  splitCommandSpec
} from "../../src/runner";

const tempDirs: string[] = [];

afterEach(async () => {
  while (tempDirs.length > 0) {
    await rm(tempDirs.pop()!, { recursive: true, force: true });
  }
});

async function runPythonDriver(driverSource: string, stdin: string): Promise<string> {
  const probe = await probeSingleToolchain("python");
  expect(probe.available).toBe(true);
  const spec = splitCommandSpec(probe.command!);
  const dir = await mkdtemp(join(tmpdir(), "algo-coach-lc-harness-"));
  tempDirs.push(dir);
  const file = join(dir, "driver.py");
  await writeFile(file, driverSource, "utf8");
  const res = await runSandboxedProcess({
    command: spec.bin,
    args: [...spec.prefixArgs, file],
    stdin,
    injectPythonUtf8: true,
    timeoutMs: 5000
  });
  expect(res.exitCode).toBe(0);
  expect(res.stderr).toBe("");
  return res.stdout.trim();
}

describe("leetcodeHarness", () => {
  it("honestly degrades on class-design problems, unsupported types, and unsupported languages", () => {
    const designMeta: FunctionSignatureMeta = {
      entryName: "class:LRUCache",
      params: [],
      returnType: "void",
      codeSnippets: {}
    };
    const designCheck = checkLeetCodeHarnessSupport(designMeta, "python");
    expect(designCheck.supported).toBe(false);
    if (!designCheck.supported) {
      expect(designCheck.reason).toContain("Class-design");
    }

    const customTypeMeta: FunctionSignatureMeta = {
      entryName: "copyRandomList",
      params: [{ name: "head", type: "Node" }],
      returnType: "Node",
      codeSnippets: {}
    };
    expect(checkLeetCodeHarnessSupport(customTypeMeta, "python").supported).toBe(false);

    const normalMeta: FunctionSignatureMeta = {
      entryName: "twoSum",
      params: [
        { name: "nums", type: "integer[]" },
        { name: "target", type: "integer" }
      ],
      returnType: "integer[]",
      codeSnippets: {}
    };
    expect(checkLeetCodeHarnessSupport(normalMeta, "rust").supported).toBe(false);
  });

  it("executes generated Python harness for arrays, ListNode, TreeNode, and void in-place methods", async () => {
    // 1. twoSum (array + int -> array, including inline format fallback)
    const twoSumHarness = generateLeetCodeHarness({
      meta: {
        entryName: "twoSum",
        params: [
          { name: "nums", type: "integer[]" },
          { name: "target", type: "integer" }
        ],
        returnType: "integer[]",
        codeSnippets: {}
      },
      language: "python",
      studentSource: `
class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, v in enumerate(nums):
            if target - v in seen:
                return [seen[target - v], i]
            seen[v] = i
        return []
`
    });
    expect(twoSumHarness.supported).toBe(true);
    expect(await runPythonDriver(twoSumHarness.driverSource!, "[2,7,11,15]\n9\n")).toBe("[0,1]");
    expect(
      await runPythonDriver(twoSumHarness.driverSource!, "nums = [3,2,4], target = 6\n")
    ).toBe("[1,2]");

    // 2. reverseList (ListNode serialization)
    const listHarness = generateLeetCodeHarness({
      meta: {
        entryName: "reverseList",
        params: [{ name: "head", type: "ListNode" }],
        returnType: "ListNode",
        codeSnippets: {}
      },
      language: "python",
      studentSource: `
class Solution:
    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        prev = None
        curr = head
        while curr:
            nxt = curr.next
            curr.next = prev
            prev = curr
            curr = nxt
        return prev
`
    });
    expect(listHarness.supported).toBe(true);
    expect(await runPythonDriver(listHarness.driverSource!, "[1,2,3,4,5]\n")).toBe("[5,4,3,2,1]");

    // 3. invertTree (TreeNode BFS serialization with nulls)
    const treeHarness = generateLeetCodeHarness({
      meta: {
        entryName: "invertTree",
        params: [{ name: "root", type: "TreeNode" }],
        returnType: "TreeNode",
        codeSnippets: {}
      },
      language: "python",
      studentSource: `
class Solution:
    def invertTree(self, root: Optional[TreeNode]) -> Optional[TreeNode]:
        if not root:
            return None
        root.left, root.right = self.invertTree(root.right), self.invertTree(root.left)
        return root
`
    });
    expect(treeHarness.supported).toBe(true);
    expect(await runPythonDriver(treeHarness.driverSource!, "[4,2,7,1,3,6,9]\n")).toBe(
      "[4,7,2,9,6,3,1]"
    );

    // 4. void in-place return (reverseString)
    const voidHarness = generateLeetCodeHarness({
      meta: {
        entryName: "reverseString",
        params: [{ name: "s", type: "character[]" }],
        returnType: "void",
        codeSnippets: {}
      },
      language: "python",
      studentSource: `
class Solution:
    def reverseString(self, s: List[str]) -> None:
        s.reverse()
`
    });
    expect(voidHarness.supported).toBe(true);
    expect(await runPythonDriver(voidHarness.driverSource!, '["h","e","l","l","o"]\n')).toBe(
      '["o","l","l","e","h"]'
    );
  });

  it("generates clean C++ driver with ListNode/TreeNode serializers when needed", () => {
    const cpp = generateLeetCodeHarness({
      meta: {
        entryName: "invertTree",
        params: [{ name: "root", type: "TreeNode" }],
        returnType: "TreeNode",
        codeSnippets: {}
      },
      language: "cpp",
      studentSource: `class Solution {\npublic:\n    TreeNode* invertTree(TreeNode* root) { return root; }\n};`
    });
    expect(cpp.supported).toBe(true);
    expect(cpp.filename).toBe("harness_solution.cpp");
    expect(cpp.driverSource).toContain("struct TreeNode");
    expect(cpp.driverSource).toContain("as_treenode");
    expect(cpp.driverSource).toContain("sol.invertTree(arg_0)");
  });

  it("strips __main__, hoists from __future__, and parses var=val inputs in Python", async () => {
    const h = generateLeetCodeHarness({
      meta: {
        entryName: "twoSum",
        params: [
          { name: "nums", type: "integer[]" },
          { name: "target", type: "integer" }
        ],
        returnType: "integer[]",
        codeSnippets: {}
      },
      language: "python",
      studentSource: [
        "from __future__ import annotations",
        "class Solution:",
        "    def twoSum(self, nums: List[int], target: int) -> List[int]:",
        "        seen: dict[int, int] = {}",
        "        for i, v in enumerate(nums):",
        "            if target - v in seen:",
        "                return [seen[target - v], i]",
        "            seen[v] = i",
        "        return []",
        "",
        'if __name__ == "__main__":',
        "    raise RuntimeError('student main must be stripped')"
      ].join("\n")
    });

    expect(h.supported).toBe(true);
    expect(h.driverSource!.indexOf("from __future__ import annotations")).toBeLessThan(
      h.driverSource!.indexOf("import json")
    );
    expect(h.driverSource).not.toContain("student main must be stripped");

    expect(await runPythonDriver(h.driverSource!, "nums = [2, 7, 11, 15]\ntarget = 9\n")).toBe(
      "[0,1]"
    );
    expect(await runPythonDriver(h.driverSource!, "nums = [3, 2, 4], target = 6\n")).toBe(
      "[1,2]"
    );
  });

  it("hardens C++ harness against student main(), #define int long long, \\uXXXX, and var=val inputs", () => {
    const cpp = generateLeetCodeHarness({
      meta: {
        entryName: "twoSum",
        params: [
          { name: "nums", type: "integer[]" },
          { name: "target", type: "integer" }
        ],
        returnType: "integer[]",
        codeSnippets: {}
      },
      language: "cpp",
      studentSource: [
        "#include <vector>",
        "#define int long long",
        "using namespace std;",
        "class Solution {",
        "public:",
        "    vector<int> twoSum(vector<int>& nums, int target) { return {0, 1}; }",
        "};",
        "int main() {",
        "    return 99;",
        "}"
      ].join("\n")
    });
    expect(cpp.supported).toBe(true);
    expect(cpp.driverSource).not.toContain("return 99;");
    expect(cpp.driverSource).toContain("#ifdef int");
    expect(cpp.driverSource).toContain("#define AC_STUDENT_INT_REDEFINED 1");
    expect(cpp.driverSource).toContain("parseHex4");
    expect(cpp.driverSource).toContain("appendUtf8");
    expect(cpp.driverSource).toContain("parse_var_assignments");
  });
});
