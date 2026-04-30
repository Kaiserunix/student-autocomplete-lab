# AI Coach UI And Practice File Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the VS Code extension feel like an AI-first coding coach by separating the AI answer surface from problem-bank input, creating a practice code file when a full statement is downloaded, and displaying MiMo output in Chinese-first form.

**Architecture:** Keep the current webview implementation, but split it into two visible pages with a small segmented tab switcher: `AI 回答` for coaching/results and `题库导入` for search/import/problem-set operations. Add small pure helper modules for practice-file naming and Chinese presentation so the risky behavior is testable outside VS Code. The extension host remains responsible for filesystem writes and opening the created practice file.

**Tech Stack:** VS Code extension API, TypeScript, Vitest, existing MiMo OpenAI-compatible `/completions` and `/chat/completions` clients.

---

### Task 1: Practice File Helper

**Files:**
- Create: `src/sidebar/practiceFile.ts`
- Test: `test/practiceFile.test.ts`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, test } from "vitest";
import { buildPracticeFileContent, buildPracticeFileRelativePath } from "../src/sidebar/practiceFile";

describe("practice file helper", () => {
  test("creates stable workspace-relative paths for supported languages", () => {
    expect(buildPracticeFileRelativePath({ platform: "luogu", id: "P5730", title: "显示屏" }, "python")).toBe(
      "practice/luogu/P5730.py"
    );
    expect(buildPracticeFileRelativePath({ platform: "luogu", id: "P5730", title: "显示屏" }, "c")).toBe(
      "practice/luogu/P5730.c"
    );
    expect(buildPracticeFileRelativePath({ platform: "luogu", id: "P5730", title: "显示屏" }, "cpp")).toBe(
      "practice/luogu/P5730.cpp"
    );
    expect(buildPracticeFileRelativePath({ platform: "luogu", id: "P5730", title: "显示屏" }, "rust")).toBe(
      "practice/luogu/P5730.rs"
    );
  });

  test("creates a Chinese header without leaking the full statement into starter code", () => {
    const content = buildPracticeFileContent(
      {
        platform: "luogu",
        id: "P5730",
        title: "显示屏",
        sourceUrl: "https://www.luogu.com.cn/problem/P5730"
      },
      "python"
    );

    expect(content).toContain("题目：P5730 显示屏");
    expect(content).toContain("链接：https://www.luogu.com.cn/problem/P5730");
    expect(content).toContain("import sys");
    expect(content).not.toContain("液晶屏上，每个阿拉伯数字");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- test/practiceFile.test.ts`

Expected: FAIL because `src/sidebar/practiceFile.ts` does not exist.

- [ ] **Step 3: Implement helper**

```ts
export type PracticeLanguage = "python" | "c" | "cpp" | "rust";
```

Implement stable extension mapping and starter templates.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- test/practiceFile.test.ts`

Expected: PASS.

### Task 2: Download Full Statement Creates File

**Files:**
- Modify: `src/sidebar/ProblemBankViewProvider.ts`
- Test: use `npm run compile` for VS Code API surface and `test/practiceFile.test.ts` for helper behavior.

- [ ] **Step 1: Extend webview message**

Add optional `language` and `createFile` fields to `importLuogu`.

- [ ] **Step 2: Create file only on single full import**

When `createFile` is true, write the template to `practice/<platform>/<problemId>.<ext>` and open it in the editor. Preset and whole题单 imports should not mass-create files.

- [ ] **Step 3: Return created file path to UI**

Return `createdFile` in `problemBankState` status payload so the AI page can show “已创建练习文件”.

### Task 3: Split UI Into Two Non-Interfering Pages

**Files:**
- Modify: `src/sidebar/ProblemBankViewProvider.ts`

- [ ] **Step 1: Add segmented navigation**

Add two buttons: `AI 回答` and `题库导入`.

- [ ] **Step 2: Move AI controls and result cards into AI page**

Keep current problem, language selector, hint buttons, autocomplete test, AI result, and full题面 preview here.

- [ ] **Step 3: Move queue/search/problem-set/manual paste into import page**

Problem list, search, presets,题单导入,粘贴题目 only appear here.

### Task 4: Chinese-First MiMo Output

**Files:**
- Create: `src/sidebar/localizeTeachingReport.ts`
- Test: `test/localizeTeachingReport.test.ts`
- Modify: `src/sidebar/ProblemBankViewProvider.ts`

- [ ] **Step 1: Write failing tests for label localization**

Map common pain labels such as `traversal_order_confusion` to Chinese names like `遍历顺序混淆`.

- [ ] **Step 2: Implement localization helper**

Keep raw English evidence, but present a Chinese label and Chinese section title. If MiMo returns English hint text, prefix the UI with `MiMo 原文提示` and still show Chinese explanation fields around it.

- [ ] **Step 3: Use localized fields in webview rendering**

Render `painPoint.displayLabel`, `hintTitle`, `skillTitle`, and `recommendationTitle` from the host response.

### Task 5: Verification

**Files:**
- No new files.

- [ ] **Step 1: Compile**

Run: `npm run compile`

Expected: `tsc -p .` succeeds.

- [ ] **Step 2: Run tests**

Run: `npm test`

Expected: all tests pass.

- [ ] **Step 3: Smoke test MiMo paths**

Run: `npm run trial:mimo` and `npm run trial:mimo-teacher -- --provider live --no-write-profile`

Expected: autocomplete returns a short code continuation, teaching diagnosis returns JSON parsed into the UI format.
