# Formal Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic sidebar dashboard with the approved competition-dossier frontend while preserving working OJ submission and Codex OAuth entry points.

**Architecture:** Keep `ProblemBankViewProvider` as the existing host and state coordinator, but move the formal visual contract into focused webview modules. Static design tokens and source invariants live under `src/sidebar/webview`; the existing command protocol, host events, and safe dynamic renderers remain authoritative. Contract tests drive each structural change before the production HTML, CSS, or webview behavior is altered.

**Tech Stack:** TypeScript 5.8, VS Code Webview API 1.95, HTML/CSS/vanilla webview JavaScript, Vitest 3, VSCE packaging.

---

## File map

- Create `src/sidebar/webview/formalDesign.ts`: formal navigation labels, landmark ids, CSS token names, and no-comment source validator.
- Create `test/formalFrontendContract.test.ts`: structural, accessibility, entry-point, responsive, and no-comment contracts.
- Modify `src/sidebar/webview/main.ts`: explicit inventories for formal navigation, account, submission, and primary workflow controls.
- Modify `src/sidebar/webview/styles.css`: extracted formal CSS mirror used by hygiene and contract tests.
- Modify `src/sidebar/ProblemBankViewProvider.ts`: rendered formal document, preserved dynamic renderers, submission docket, OAuth drawer, and page-state copy.
- Modify `test/problemBankWebviewScript.test.ts`: replace brittle old-layout expectations with formal workflow assertions while retaining behavior checks.
- Modify `test/sidebarWebviewModules.test.ts`: assert the formal inventories and design source contract.

### Task 1: Lock the formal source contract

**Files:**

- Create: `test/formalFrontendContract.test.ts`
- Create: `src/sidebar/webview/formalDesign.ts`
- Modify: `src/sidebar/webview/main.ts`
- Modify: `test/sidebarWebviewModules.test.ts`

- [ ] **Step 1: Write the failing contract test**

Create a Vitest suite that reads `ProblemBankViewProvider.ts` and the webview sources and asserts:

```ts
expect(source).toContain('data-design="competition-dossier"');
expect(source).toContain('id="sessionMasthead"');
expect(source).toContain('id="problemPoster"');
expect(source).toContain('id="learningDossier"');
expect(source).toContain('id="submissionDocket"');
expect(source).toContain('id="accountModelDrawer"');
expect(source).toContain('role="tablist"');
expect(source).toContain('aria-live="polite"');
expect(assertCommentFreeFrontend(frontendSources)).toEqual([]);
```

Also assert that `ojLogin`, `ojPreviewSubmit`, every Codex OAuth control id, and every typed command remains present.

- [ ] **Step 2: Run the test and prove it is red**

Run `npx vitest run test/formalFrontendContract.test.ts test/sidebarWebviewModules.test.ts`.

Expected: failure on missing formal landmarks and missing validator.

- [ ] **Step 3: Add the minimal typed contract**

Create `formalDesign.ts` with:

```ts
export const formalSidebarDestinations = [
  { pageId: "aiPage", tabId: "tabAi", label: "作答现场" },
  { pageId: "problemPage", tabId: "tabProblem", label: "题目张贴板" },
  { pageId: "skillPage", tabId: "tabSkill", label: "学习档案" }
] as const;

export const formalSidebarLandmarkIds = [
  "sessionMasthead",
  "problemPoster",
  "learningDossier",
  "submissionDocket",
  "accountModelDrawer"
] as const;

export function frontendCommentViolations(sources: readonly string[]): string[] {
  return sources.flatMap((source, index) => [
    /<!--/.test(source) ? `${index}:html` : "",
    /\/\*/.test(source) ? `${index}:block` : "",
    /^\s*\/\//m.test(source) ? `${index}:line` : ""
  ].filter(Boolean));
}
```

Export matching control inventories from `main.ts` and update module tests.

- [ ] **Step 4: Run the focused tests**

Run `npx vitest run test/formalFrontendContract.test.ts test/sidebarWebviewModules.test.ts`.

Expected: validator and inventories pass; rendered-landmark assertions remain red until Task 2.

- [ ] **Step 5: Commit**

Run `git add src/sidebar/webview/formalDesign.ts src/sidebar/webview/main.ts test/formalFrontendContract.test.ts test/sidebarWebviewModules.test.ts && git diff --cached --check && git commit -m "test: lock formal sidebar contract"`.

### Task 2: Build the formal shell and navigation

**Files:**

- Modify: `src/sidebar/ProblemBankViewProvider.ts`
- Modify: `src/sidebar/webview/styles.css`
- Modify: `test/formalFrontendContract.test.ts`
- Modify: `test/problemBankWebviewScript.test.ts`

- [ ] **Step 1: Add red assertions for shell hierarchy**

Assert the rendered source contains the dossier design attribute, session masthead, tab roles, selected-state updates, status live region, trace labels, and responsive/reduced-motion rules.

- [ ] **Step 2: Run the shell tests and prove they fail**

Run `npx vitest run test/formalFrontendContract.test.ts test/problemBankWebviewScript.test.ts`.

- [ ] **Step 3: Implement the shell**

Change the document root to:

```html
<main class="app dossierApp" data-design="competition-dossier">
  <header id="sessionMasthead" class="sessionMasthead">...</header>
  <nav class="pageTabs dossierTabs" role="tablist" aria-label="主工作区">...</nav>
  ...
</main>
```

Keep existing page and control ids. Update `switchPage` to set `role="tab"`, `aria-selected`, and `tabindex`. Make the global status `role="status" aria-live="polite"`. Add trace and clipped-corner CSS using theme variables, `clip-path`, visible focus, a 360 px breakpoint, and `prefers-reduced-motion`.

- [ ] **Step 4: Mirror formal selectors in `styles.css`**

Keep the extracted CSS mirror comment-free and include the formal landmark classes, state colors, accessibility behavior, and responsive rules used by contract tests.

- [ ] **Step 5: Verify and commit**

Run `npx vitest run test/formalFrontendContract.test.ts test/problemBankWebviewScript.test.ts test/sidebarWebviewModules.test.ts && npm run compile`.

Commit with `git commit -m "feat: build competition dossier shell"`.

### Task 3: Redesign the problem poster and import ledger

**Files:**

- Modify: `src/sidebar/ProblemBankViewProvider.ts`
- Modify: `test/formalFrontendContract.test.ts`
- Modify: `test/problemBankWebviewScript.test.ts`

- [ ] **Step 1: Add red poster assertions**

Assert `problemPoster` precedes imports and queues, contains `POSTED PROBLEM`, keeps `problemDetail`, exposes a single `进入作答现场` action, and preserves Markdown import, Luogu import/search, queue, archive, preset, and problem-set ids.

- [ ] **Step 2: Prove the tests fail**

Run the two focused suites.

- [ ] **Step 3: Reorder and restyle the problem page**

Place the active problem detail first inside `problemPoster`. Render id/title/source/difficulty/tags as a notice header; render statement/input/output/samples/hint as ruled brief sections; add the existing coach navigation as the only filled action. Present import routes and queues as dense ledgers below it.

- [ ] **Step 4: Implement the empty poster**

The empty state must show exactly two starting routes: `选择 Markdown 题目` and `从洛谷获取`, each dispatching an existing safe command or focusing the existing import field.

- [ ] **Step 5: Verify and commit**

Run focused tests and compile, then commit with `git commit -m "feat: turn problem page into posted brief"`.

### Task 4: Redesign the attempt workspace and completion review

**Files:**

- Modify: `src/sidebar/ProblemBankViewProvider.ts`
- Modify: `test/formalFrontendContract.test.ts`
- Modify: `test/problemBankWebviewScript.test.ts`

- [ ] **Step 1: Add red attempt-flow assertions**

Assert the AI response precedes the composer, the action shelf has one filled primary action, review actions are visually secondary, editor/attempt/statement boundary metadata is visible, and completion/recommendation renderers use trace and evidence labels.

- [ ] **Step 2: Prove the tests fail**

Run the focused suites.

- [ ] **Step 3: Implement the attempt hierarchy**

Render the current problem as an attempt brief, rename the primary CTA to `给一个方向`, turn progressive actions into a numbered attempt rail, preserve custom question and keyboard submission, and style AI responses as evidence briefings. Keep every existing coach command and archived-problem rule.

- [ ] **Step 4: Implement completion docket states**

Render score, AI estimate, official verdict, optimization, and next-problem recommendation with distinct labels. Never label an AI estimate as official OJ evidence.

- [ ] **Step 5: Verify and commit**

Run focused suites, protocol tests, and compile; commit with `git commit -m "feat: redesign attempt and review workflow"`.

### Task 5: Integrate the submission docket and Codex OAuth drawer

**Files:**

- Modify: `src/sidebar/ProblemBankViewProvider.ts`
- Modify: `test/formalFrontendContract.test.ts`
- Modify: `test/problemBankWebviewScript.test.ts`
- Modify: `test/sidebarMessageProtocol.test.ts`

- [ ] **Step 1: Add red entry-point assertions**

Assert the visible `submissionDocket` contains Codeforces URL, handle, login, preview, immutable confirmation, and official-verdict status surfaces. Assert `accountModelDrawer` contains auth mode, browser/device login, cancel/logout/refresh, and both Codex model selectors.

- [ ] **Step 2: Prove the tests fail**

Run the formal, webview-script, and protocol suites.

- [ ] **Step 3: Implement the submission docket**

Move the existing OJ controls into a dedicated dossier section. Preserve `requestOjLogin`, `requestOjSubmissionPreview`, and `confirmOjSubmission`, workspace trust, saved editor identity, two-minute one-use confirmation, one-submit wording, and UNKNOWN behavior.

- [ ] **Step 4: Implement the account drawer**

Move provider configuration into `accountModelDrawer`. Keep Codex OAuth visible when selected, render a connected stamp from auth state, and keep raw health diagnostics in a nested secondary disclosure.

- [ ] **Step 5: Verify and commit**

Run `npx vitest run test/formalFrontendContract.test.ts test/problemBankWebviewScript.test.ts test/sidebarMessageProtocol.test.ts test/codexAuthService.test.ts test/codexModelService.test.ts test/codexOAuthRouting.test.ts test/onlineJudgeTools.test.ts test/submissionConfirmationStore.test.ts && npm run compile`.

Commit with `git commit -m "feat: surface submission and Codex account dossiers"`.

### Task 6: Turn the learning profile into an evidence dossier

**Files:**

- Modify: `src/sidebar/ProblemBankViewProvider.ts`
- Modify: `test/formalFrontendContract.test.ts`
- Modify: `test/problemBankWebviewScript.test.ts`

- [ ] **Step 1: Add red dossier assertions**

Assert the page begins with `AI 下次会这样教你`, renders evidence ids, status/reason/evidence/last-seen fields, exposes helpful/wrong/disable controls, and retains version rollback.

- [ ] **Step 2: Prove the tests fail**

Run the formal and webview-script suites.

- [ ] **Step 3: Implement evidence records**

Restyle active and disabled skills as dossier records. Number records deterministically in render order, make reasons primary, show counts as support, and keep correction actions adjacent to their evidence.

- [ ] **Step 4: Implement history disclosures**

Keep corrections, global code habits, and versions in quiet ledger disclosures beneath the active teaching changes.

- [ ] **Step 5: Verify and commit**

Run focused suites plus `test/studentSkill.test.ts`, compile, and commit with `git commit -m "feat: present learning profile as evidence dossier"`.

### Task 7: Verification, visual QA, and integration

**Files:**

- Modify only if verification exposes a defect.

- [ ] **Step 1: Run source and behavior gates**

Run:

```powershell
npx vitest run test/formalFrontendContract.test.ts test/problemBankWebviewScript.test.ts test/sidebarWebviewModules.test.ts test/sidebarMessageProtocol.test.ts
npm run compile
npm run compile:release
npm run check:hygiene
```

Expected: every command exits 0 and the comment scan returns no frontend violation.

- [ ] **Step 2: Run the full suite**

Run `npm test`. If the known PowerShell newline assertion fails, rerun `test/ojConsolePowerShellClient.test.ts` alone and inspect the actual safety rejection before deciding whether it is still an unrelated baseline issue.

- [ ] **Step 3: Package the VSIX**

Run `npm run package:beta-release` and inspect the produced package list for required webview and OAuth/submission artifacts and for excluded runtime secrets or prototype state.

- [ ] **Step 4: Render and inspect**

Use the project browser harness or a fixture document to capture 300 px and 520 px states for empty, active problem, submission preview, OAuth signed-out/signed-in, and populated learning dossier. Inspect hierarchy, clipping, overflow, focus, touch targets, theme variables, and the single-primary-action rule.

- [ ] **Step 5: Commit final fixes**

Run `git diff --check`, inspect every changed frontend file for comments, and commit any verified fixes with `git commit -m "fix: complete formal frontend acceptance"`.

- [ ] **Step 6: Merge without concurrent work**

Merge `codex/formal-frontend-implementation` into `codex/beta-0.2-one-shot-refactor` from an isolated integration worktree. Do not include uncommitted or unrelated language-skill composition files from the desktop worktree. Re-run compile, focused contracts, full tests, hygiene, and packaging on the merged branch.
