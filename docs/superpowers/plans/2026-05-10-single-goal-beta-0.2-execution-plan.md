# Single-Goal Beta 0.2 Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for the whole run. Use superpowers:subagent-driven-development when 2+ independent lanes can progress without sharing write scopes. This document is the controlling plan: do not ask the human to issue another `/goal` after each phase.

**Goal:** Execute the beta 0.2 architecture refactor in one continuous goal run: stabilize protocol boundaries, add session continuity, separate teaching workflow, harden model routing, upgrade Student Skill and recommendation logic, split the webview enough to make UI testable, add replayable evaluation, and produce clean beta/beta-release/internal packages.

**Architecture:** This plan implements the super architecture blueprint through staged epics. Each epic is small enough to verify and commit, but the executor must continue automatically from one epic to the next after its gates pass.

**Tech Stack:** VS Code extension API, TypeScript, Vitest, existing sidebar webview, existing JSON/JSONL storage, current MiMo/OpenAI-compatible provider path, existing package scripts, optional Playwright-style screenshot checks if the local browser tooling is already available.

---

## 1. One Prompt To Execute The Whole Plan

Use this exact prompt for the next execution goal:

```text
/goal 执行 docs/superpowers/plans/2026-05-10-single-goal-beta-0.2-execution-plan.md。

强制要求：
1. 这是单次连续执行 goal。每个 epic 完成、测试、提交后自动进入下一个 epic，不要要求我再次发 /goal。
2. 只有遇到 stop conditions 才暂停：会破坏用户数据、需要真实密钥/付费 live 大批量调用、需要发布到公网、测试连续修复 3 轮仍无法收敛、或产品取舍无法从文档中合理推断。
3. 可以使用 subagents 加速，但每个 worker 必须声明 disjoint write scope，不准互相覆盖。
4. 每个 epic 必须有测试门禁和 commit。commit 后继续执行，不要把“下一步”交还给我。
5. 不上传 GitHub，不发布 VSIX，不提交 secrets/.runtime/.student-autocomplete/个人记录。
6. 最终输出 beta 0.2 completion report、测试结果、包卫生结果、剩余风险和可安装 VSIX 路径。
```

This prompt gives future Codex enough authority to keep going. The human should not need to repeatedly say "continue" or issue fresh `/goal` commands.

## 2. Stop Conditions

Pause and report only when one of these happens:

- destructive migration would modify or delete existing user learning data without a backup;
- a required API key, paid live model run, or authenticated provider call is unavailable;
- a command would publish, push, upload, or expose private/internal packages;
- the same test class fails after 3 focused repair cycles and the root cause is still unclear;
- an architectural decision conflicts with two written requirements and cannot be resolved locally;
- VS Code extension install requires user interaction that cannot be automated from the current environment.

Do not pause for routine compile errors, type drift, fixture mismatches, UI CSS issues, parser bugs, or package hygiene scanner failures. Fix those inside the same goal.

## 3. Continuous Execution Rules

- Start with a clean working tree check. If dirty files exist, classify them before editing and do not revert user work.
- Create or switch to a branch named `codex/beta-0.2-one-shot-refactor` unless the active branch is already a Codex work branch with current beta work.
- Keep a local progress ledger at `.runtime/beta-0.2-one-shot/progress.json`; do not commit it.
- Commit after every completed epic. A commit is the checkpoint that permits moving to the next epic.
- After an epic commit, immediately continue to the next epic without asking the user.
- Do not push to GitHub in this plan.
- Keep autocomplete safety invariant: autocomplete may read only student code and safe coding habits, never problem statement, Teacher Pack, standard answer, or teaching transcript.
- Keep Teacher Pack hidden by default. It is a diagnostic reference, not student-facing content.
- Keep internal testing records local-only and excluded from beta release.

## 4. Subagent Strategy

Use workers only when write scopes are cleanly separated. Every worker must be told: "you are not alone in this codebase; do not revert unrelated edits; adapt to existing changes."

Recommended parallel lanes:

| Lane | Use When | Write Scope |
| --- | --- | --- |
| Protocol worker | Epic 1 | `src/sidebar/messageProtocol.ts`, `src/sidebar/hostEvents.ts`, protocol tests |
| Storage worker | Epic 2 | `src/storage/**`, `src/attempt/**`, storage tests |
| Teaching worker | Epic 3 | `src/teaching/workflow/**`, teaching workflow tests |
| Model worker | Epic 4 | `src/models/**`, config/model tests |
| Skill worker | Epic 5 | `src/teaching/studentSkill/**`, skill tests |
| Recommendation worker | Epic 6 | `src/recommendation/**`, recommendation tests |
| UI worker | Epic 7 | `src/sidebar/webview/**`, `src/sidebar/html.ts`, UI tests |
| Eval worker | Epic 8 | `scripts/**`, `test/**`, eval harness docs |
| Release worker | Epic 9 | package scripts, `.vscodeignore`, release hygiene tests |

The orchestrator owns final integration, conflict resolution, full test gates, commits, and the final completion report.

## 5. Baseline Gate

Before edits:

```powershell
git status --short
npm run compile
npm test
npm run trial:longitudinal-self-evolution -- --provider fixture --limit 1000 --no-write
```

Record results in the progress ledger. If fixture is slow but starts normally, let it finish. If baseline already fails, fix or document the pre-existing failure before starting refactors.

## 6. Epic 1: Typed Protocol And State Snapshot

**Purpose:** Stop sidebar command drift before larger refactors.

Create or finalize:

- `src/sidebar/messageProtocol.ts`
- `src/sidebar/hostEvents.ts`
- `src/sidebar/stateView.ts`
- `test/sidebarMessageProtocol.test.ts`

Modify:

- `src/sidebar/ProblemBankViewProvider.ts`
- existing webview source tests only as needed

Required behavior:

- every browser-side command has a typed host contract;
- every typed command has a host handler or explicit compatibility adapter;
- host-to-webview messages use a typed event union;
- state snapshot is serializable and contains only UI-safe data;
- no visible UI behavior changes.

Tests:

```powershell
npm run compile
npm test -- test/sidebarMessageProtocol.test.ts
npm test
```

Commit:

```text
refactor: add typed sidebar protocol seam
```

## 7. Epic 2: Storage Gateway And AttemptSession

**Purpose:** Give every problem attempt one durable context, so follow-up, scoring, abandonment, and completion can reason over one session instead of isolated button clicks.

Create:

- `src/storage/StoragePaths.ts`
- `src/storage/JsonStore.ts`
- `src/storage/JsonlStore.ts`
- `src/storage/SecretStore.ts`
- `src/storage/Migration.ts`
- `src/attempt/schema.ts`
- `src/attempt/store.ts`
- `src/attempt/session.ts`

Modify:

- current problem import/archive paths to create or load an `AttemptSession`;
- internal testing JSONL code to use `JsonlStore`;
- tests that hand-roll runtime paths.

Required behavior:

- importing a problem creates a session;
- reopening the sidebar restores active session state;
- "give hint", "more specific", "ask AI", "give up", "complete", "score", "optimize", and "recommend" append events to the same session;
- corrupted internal JSONL lines are skipped and counted;
- no domain module computes ad hoc storage paths.

Tests:

```powershell
npm run compile
npm test -- test/*storage* test/*attempt*
npm test
```

Commit:

```text
feat: add attempt session storage gateway
```

## 8. Epic 3: TeachingWorkflow

**Purpose:** Move AI teaching orchestration out of the sidebar provider and make it replayable.

Create:

- `src/teaching/workflow/schema.ts`
- `src/teaching/workflow/contextBundle.ts`
- `src/teaching/workflow/actions.ts`
- `src/teaching/workflow/reducer.ts`
- `src/teaching/workflow/audit.ts`

Modify:

- `src/sidebar/ProblemBankViewProvider.ts` to call workflow commands;
- current hint/lesson/score/optimization logic to use shared workflow actions.

Required behavior:

- `hint` outputs one key pain point and one next step;
- `followUp` stays in the same session and respects prior context;
- casual/manual user questions can be answered in the same attempt thread;
- `giveUp` produces a lesson report with standard answer folded behind an explicit action;
- `complete` reviews the session and updates Student Skill from context, not just one response;
- workflow audit records what context was included and excluded;
- autocomplete context remains separate.

Tests:

```powershell
npm run compile
npm test -- test/*teaching* test/*workflow*
npm test
npm run trial:longitudinal-self-evolution -- --provider fixture --limit 1000 --no-write
```

Commit:

```text
refactor: introduce teaching workflow session actions
```

## 9. Epic 4: ModelRouter And Provider Contracts

**Purpose:** Make OpenAI, OpenAI-compatible, and Anthropic-native configuration real, visible, and testable.

Create or finalize:

- `src/models/modelRouter.ts`
- `src/models/providerContracts.ts`
- `src/models/listProviderModels.ts`
- provider-specific request/response tests

Modify:

- existing chat/completions clients to route through `ModelRouter`;
- VS Code settings + SecretStorage + `secrets/models.env` fallback order;
- sidebar AI configuration UI to read/write the same configuration source.

Required behavior:

- analysis and autocomplete models can differ;
- user-selected model names are never silently downgraded;
- `/models` fetching supports OpenAI-compatible and Anthropic native headers;
- failed model fetch reports provider, endpoint, status, and model without leaking keys;
- transient 500/502/503 errors are retried with backoff where appropriate;
- UI shows Provider / completion model / analysis model / protocol format clearly.

Tests:

```powershell
npm run compile
npm test -- test/*model* test/*config*
npm test
```

Optional live smoke only when key/config already exists:

```powershell
npm run trial:mimo -- --model=mimo-v2.5-pro
npm run trial:mimo-teacher -- --provider live --no-write-profile --model=mimo-v2.5-pro
```

Commit:

```text
refactor: route ai calls through model router
```

## 10. Epic 5: Student Skill v2 Lifecycle

**Purpose:** Make self-evolution user-visible, correctable, and harder to fool.

Create or finalize:

- `src/teaching/studentSkill/schema.ts`
- `src/teaching/studentSkill/patch.ts`
- `src/teaching/studentSkill/merge.ts`
- `src/teaching/studentSkill/lifecycle.ts`
- `src/teaching/studentSkill/evidence.ts`
- `src/teaching/studentSkill/summary.ts`
- `src/teaching/studentSkill/store.ts`

Required behavior:

- lifecycle supports `observation -> candidate -> active -> mastered`, with `disabled` as a hard stop;
- `diagnosis_wrong` adds counterevidence and can downgrade;
- `diagnosis_helpful` strengthens evidence but does not auto-master;
- disabled skills cannot be silently reactivated by model patches;
- mastered requires transfer evidence;
- UI shows enabled skills, observed pain points, disabled judgments, evidence, and rollback;
- autocomplete receives only safe code habits, not pain points or problem statements.

Tests:

```powershell
npm run compile
npm test -- test/*studentSkill*
npm test
npm run trial:longitudinal-self-evolution -- --provider fixture --limit 1000 --no-write
```

Commit:

```text
feat: add student skill lifecycle controls
```

## 11. Epic 6: Recommendation Engine v2

**Purpose:** Replace vague "AI says next" recommendations with explainable rules plus AI wording.

Create:

- `src/recommendation/schema.ts`
- `src/recommendation/rules.ts`
- `src/recommendation/candidatePool.ts`
- `src/recommendation/transfer.ts`
- `src/recommendation/explain.ts`

Required output shape:

```ts
interface RecommendationResult {
  problemId: string;
  title: string;
  source: "luogu" | "leetcode" | "manual" | "synthetic";
  reason: string;
  targetSkill: string;
  difficultyChange: "down" | "same" | "up";
  transferEvidenceStatus: "not_tested" | "probe" | "passed" | "failed";
}
```

Required behavior:

- recently archived, completed, deleted, or duplicate imported problems are excluded;
- difficulty increases only after transfer pass or multiple low-hint successes;
- repeated failure recommends narrower or easier same-skill practice;
- generated problems are marked `synthetic` and used only as short micro-drills;
- if Luogu MCP/search is unavailable, fall back to cached/local candidates and explain the limitation.

Tests:

```powershell
npm run compile
npm test -- test/*recommend*
npm test
npm run trial:longitudinal-self-evolution -- --provider fixture --limit 1000 --no-write
```

Commit:

```text
feat: add transfer-aware recommendation engine
```

## 12. Epic 7: Sidebar Webview Split And UI Gates

**Purpose:** Stop UI regressions by making the sidebar script, markdown renderer, i18n, and styles testable.

Create or split:

- `src/sidebar/html.ts`
- `src/sidebar/webview/main.ts`
- `src/sidebar/webview/markdown.ts`
- `src/sidebar/webview/i18n.ts`
- `src/sidebar/webview/styles.css`

Required behavior:

- first screen is `AI 教练` / `AI Coach`;
- top navigation remains `AI 教练`, `题目`, `学习画像`;
- manual import accepts Markdown file import and validates problem authoring structure;
- markdown renders headings, lists, code blocks, inline code, tables if present, and common math text safely enough for contest statements;
- "问 AI" sends custom text;
- "更具体" is a follow-up in the same session, not a reset;
- buttons with disabled state explain why they are disabled;
- delete removes a problem without archiving;
- archive/completed path remains distinct;
- English UI is selectable and covers all primary labels.

UI verification:

- run existing webview tests;
- if Playwright/browser tooling is available, install the internal VSIX into a throwaway VS Code extension-development host or render the webview HTML in a local harness and take screenshots;
- inspect screenshots for clipped buttons, repeated entries, invisible send actions, broken Markdown, and mixed-language labels.

Tests:

```powershell
npm run compile
npm test -- test/*webview* test/*sidebar*
npm test
```

Commit:

```text
refactor: split sidebar webview assets
```

## 13. Epic 8: Evaluation Harness v2

**Purpose:** Prove self-evolution with replayable evidence instead of vibes.

Create or extend:

- scenario replay fixtures;
- mismatch summary writer;
- resume support for live calibration;
- cost/usage recorder if provider usage is returned;
- beta score report generator.

Required behavior:

- fixture dry run supports 200 problem families / 1000 code samples;
- each sample records problem id, stage, code, expected OJ-like result, primary pain point, secondary pain point, expected skill, minimum counterexample, brute-force allowance, and recommendation range;
- CLI supports `--resume-from` or equivalent batch continuation;
- mismatch summary includes skill mismatch, primary pain-point mismatch, recommendation mismatch, JSON retry/error, and provider failure;
- live model calls are optional and never required for local package build.

Tests:

```powershell
npm run compile
npm test -- test/*longitudinal* test/*eval*
npm run trial:longitudinal-self-evolution -- --provider fixture --limit 1000 --no-write
```

Optional live calibration only with explicit existing key and budget:

```powershell
npm run trial:longitudinal-self-evolution -- --provider mimo --limit 100 --retries 1 --out .runtime\longitudinal-self-evolution\mimo-beta-0.2-calibration.json
```

Commit:

```text
feat: add replayable beta evaluation harness
```

## 14. Epic 9: Release Lane Hardening

**Purpose:** Keep beta, beta release, and internal builds separate enough that public packages cannot leak internal material.

Required lanes:

| Lane | Package | Purpose |
| --- | --- | --- |
| beta | `student-autocomplete-lab` | ordinary beta testing, no internal recorder |
| beta release | `student-autocomplete-lab-beta-release` | clean public candidate |
| beta internal | `student-autocomplete-lab-internal` | friend testing with local internal records, do not publish |

Required behavior:

- `npm run package:beta` outputs a normal beta VSIX;
- `npm run package:beta-release` outputs a clean public candidate;
- `npm run package:internal` outputs an internal-only VSIX;
- package ids/contribution prefixes differ so VS Code can distinguish lanes;
- beta release excludes docs, scripts, fixtures, tests, source maps, secrets, `.runtime`, `.student-autocomplete`, internal testing code, and AI-only research notes;
- internal package has visible "DO NOT PUBLISH" naming or docs;
- README/release docs explain that this is an algorithm coach, not an automatic solving tool.

Tests:

```powershell
npm run compile
npm test
npm run package:beta
npm run package:beta-release
npm run package:internal
```

Then inspect package contents with `vsce ls --tree` or existing package hygiene script. The beta release package must not contain:

- `docs/`
- `scripts/`
- `fixtures/`
- `test/`
- `secrets/`
- `.runtime/`
- `.student-autocomplete/`
- `*.map`
- internal testing recorder modules

Commit:

```text
chore: harden beta release packaging lanes
```

## 15. Final Full Gate

After all epics:

```powershell
npm run compile
npm test
npm run trial:longitudinal-self-evolution -- --provider fixture --limit 1000 --no-write
npm run package:beta
npm run package:beta-release
npm run package:internal
git status --short
```

If packages exist, record their absolute paths in the final report. Do not publish or push.

## 16. Final Report Required Shape

The final answer after executing this one-shot goal must include:

- branch name;
- commit list created during the run;
- exact test commands and pass/fail results;
- fixture and optional live calibration summary;
- beta/beta-release/internal VSIX paths;
- package hygiene result;
- UI screenshot/manual inspection result if available;
- remaining risks ordered by severity;
- whether beta release is ready, internal-only, or blocked.

Do not end with "next goal should..." unless something hit a stop condition. If all planned epics are complete, say the beta 0.2 execution plan is complete.

## 17. Acceptance Criteria

This single-goal plan is successful when:

- all nine epics are either implemented and committed, or explicitly skipped because a documented stop condition applied;
- the final full gate passes;
- autocomplete safety boundary is tested;
- teaching follow-up uses one attempt session;
- Student Skill correction and disable behavior are visible and tested;
- recommendation output is rule-grounded and explainable;
- beta release package is clean by scanner/manual inspection;
- internal package remains clearly separate and not publishable;
- the human did not need to issue repeated `/goal` commands to move from epic to epic.
