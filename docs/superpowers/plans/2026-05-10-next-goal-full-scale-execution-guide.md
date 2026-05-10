# Full-Scale Next Goal Execution Guide

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guide the next `/goal` so it starts the beta 0.2 refactor safely: extract typed webview protocol and state snapshot seams before moving AttemptSession, TeachingWorkflow, ModelRouter, or UI assets.

**Architecture:** This is the execution bridge from the super architecture blueprint to code. The next goal should implement Epic 1 from the blueprint: typed protocol, host event contracts, command coverage tests, and an initial UI state view seam. It must avoid visible UI redesign and avoid changing AI prompt behavior.

**Tech Stack:** VS Code extension API, TypeScript, Vitest, existing `ProblemBankViewProvider.ts`, current webview source tests, existing `npm run compile`, `npm test`, and longitudinal fixture CLI.

---

## 1. Recommended Next Goal Prompt

Use this as the next `/goal`:

```text
/goal 执行超级架构蓝图 Epic 1：Typed Protocol + State Snapshot。

目标：
1. 从 ProblemBankViewProvider.ts 中抽出 webview command / host event 类型契约；
2. 新增协议覆盖测试，证明每个 webview postMessage command 都在类型表中，每个类型表 command 都有 host handler；
3. 新增 stateView 类型/最小快照 seam，为后续 AttemptSession 和 TeachingWorkflow 抽取做准备；
4. 保持 UI 行为不变，不改 AI prompt，不改存储 schema；
5. compile/test/1000 fixture 全绿后提交。

强约束：
- 不做 React/Vite 重写；
- 不移动 hint/score/lesson 业务逻辑；
- 不重命名公开 command id，除非同时有兼容层和测试；
- 不触碰 secrets、.runtime、个人记录；
- 不发布 VSIX。
```

This goal is large enough to matter and small enough to finish safely. It creates the seam that every later refactor depends on.

## 2. Why This Is The Next Goal

The architecture documents point to the same first move:

- the super blueprint Section 22 says the first move is the protocol seam;
- the refactor architecture spec Section 12 says the first implementation slice is deliberately boring;
- the current `ProblemBankViewProvider.ts` mixes message protocol, host handlers, state construction, HTML, CSS, browser JS, and teaching actions in one file;
- UI bugs reported earlier were command/listener/state drift symptoms;
- AttemptSession cannot be safely introduced until the host/webview command boundary is observable.

So the next goal should not start with `TeachingWorkflow` extraction. It should first make the sidebar boundary typed and testable.

## 3. Definition Of Done

The next goal is complete only when all of these are true:

- `src/sidebar/messageProtocol.ts` exists and exports current command names and `WebviewCommand`.
- `src/sidebar/hostEvents.ts` or equivalent exists and exports current host event shapes.
- `src/sidebar/stateView.ts` exists and defines the UI snapshot/view model seam.
- `ProblemBankViewProvider.ts` imports protocol types instead of owning the full message union inline.
- Protocol coverage test proves browser-side `vscode.postMessage({ command })` calls match the exported command list.
- Handler coverage test proves exported command names are handled in the host provider or router.
- No visible UI text or button behavior changes.
- No model prompt changes.
- No storage schema changes.
- `npm run compile` passes.
- `npm test` passes.
- `npm run trial:longitudinal-self-evolution -- --provider fixture --limit 1000 --no-write` passes.
- `git status --short` is clean after commit.

## 4. File Ownership

### Create

- `src/sidebar/messageProtocol.ts`: shared command union and command-name inventory.
- `src/sidebar/hostEvents.ts`: host-to-webview event union.
- `src/sidebar/stateView.ts`: serializable sidebar state/view model contracts.
- `test/sidebarMessageProtocol.test.ts`: protocol and handler coverage tests.

### Modify

- `src/sidebar/ProblemBankViewProvider.ts`: import the extracted types and, if safe, use helper command-name constants.
- `test/problemBankWebviewScript.test.ts`: keep existing regression assertions, but avoid adding more brittle substring assertions when the new protocol test can cover behavior.
- `docs/superpowers/specs/2026-05-10-million-token-super-architecture-blueprint.md`: add a short implementation progress note only after code lands.

### Do Not Modify In This Goal

- `src/teaching/*` prompt semantics.
- `src/models/*` provider call behavior.
- `src/autocomplete/*` prompt boundaries, except if a compile-only import path requires a type-only fix.
- package names or release scripts.
- `.runtime/`, `secrets/`, `.student-autocomplete/`, practice files, or internal user records.

## 5. Execution Strategy

Use one orchestrator and up to three workers if subagents are available.

| Lane | Owner | Responsibility | Write Scope |
| --- | --- | --- | --- |
| Orchestrator | main agent | baseline, final integration, verification, commit | all, but only after reviewing worker output |
| Worker A | protocol | `messageProtocol.ts`, command inventory, protocol tests | `src/sidebar/messageProtocol.ts`, `test/sidebarMessageProtocol.test.ts` |
| Worker B | state view | `stateView.ts`, view-model contracts | `src/sidebar/stateView.ts`, relevant tests only if needed |
| Worker C | provider integration | imports and type movement in provider | `src/sidebar/ProblemBankViewProvider.ts` |

Workers must know they are not alone in the codebase and must not revert unrelated edits.

If subagents are not used, execute the same lanes sequentially.

## 6. Task Plan

### Task 0: Baseline And Safety Check

**Files:**
- Read: `src/sidebar/ProblemBankViewProvider.ts`
- Read: `test/problemBankWebviewScript.test.ts`
- Read: `docs/superpowers/specs/2026-05-10-million-token-super-architecture-blueprint.md`

- [ ] **Step 0.1: Confirm clean workspace**

Run:

```powershell
git status --short
```

Expected: no output, or only intentional files from the current goal.

- [ ] **Step 0.2: Confirm baseline tests before edits**

Run:

```powershell
npm run compile
npm test
```

Expected: TypeScript compile succeeds, Vitest reports all current tests pass.

- [ ] **Step 0.3: Inventory current commands**

Run:

```powershell
rg -n "command: `"|message.command ===|vscode.postMessage" src\sidebar\ProblemBankViewProvider.ts
```

Expected: output shows current webview commands and host handlers. Use this to avoid inventing a new protocol that misses existing commands.

### Task 1: Create Message Protocol Contract

**Files:**
- Create: `src/sidebar/messageProtocol.ts`
- Test: `test/sidebarMessageProtocol.test.ts`
- Modify: `src/sidebar/ProblemBankViewProvider.ts`

- [ ] **Step 1.1: Write the failing protocol inventory test**

Create `test/sidebarMessageProtocol.test.ts` with this starting test:

```ts
import { readFile } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { webviewCommandNames } from "../src/sidebar/messageProtocol";

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

describe("sidebar message protocol", () => {
  test("exports every command dispatched by the webview script", async () => {
    const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");
    const dispatched = unique(
      Array.from(source.matchAll(/command:\s*"([^"]+)"/g))
        .map((match) => match[1])
        .filter((name) => name !== "placeholder")
    );

    expect(unique([...webviewCommandNames])).toEqual(dispatched);
  });
});
```

Run:

```powershell
npm test -- test/sidebarMessageProtocol.test.ts
```

Expected: FAIL because `src/sidebar/messageProtocol.ts` does not exist.

- [ ] **Step 1.2: Add `messageProtocol.ts` with current command names**

Create `src/sidebar/messageProtocol.ts`:

```ts
import type { UiLanguage } from "./stateView";
import type { PracticeLanguage } from "./practiceFile";
import type { OjVerdict } from "../teaching/types";
import type { AiProviderConfigUpdate } from "../config/modelEnv";
import type { StudentSkillCorrectionType } from "../teaching/studentSkill";

export type AiCoachAction = "hint" | "specific" | "followUp" | "giveUp" | "recommend";
export type CoachResponseLanguage = "zh" | "en" | "raw";

export const webviewCommandNames = [
  "archiveProblem",
  "copyInternalTestSummary",
  "deleteProblem",
  "disableStudentSkill",
  "fetchAiModels",
  "importLuogu",
  "importLuoguProblemSet",
  "importManualMarkdownFile",
  "importPreset",
  "loadProblems",
  "recordStudentSkillFeedback",
  "requestAiCoach",
  "requestAutocompletePreview",
  "requestOptimizationReview",
  "requestSolutionScore",
  "requestSubmissionJudge",
  "rollbackStudentSkill",
  "saveAiConfig",
  "saveUiLanguage",
  "searchLuoguProblems",
  "searchLuoguProblemSets"
] as const;

export type WebviewCommandName = (typeof webviewCommandNames)[number];

export type WebviewMessage =
  | { command: "loadProblems" }
  | { command: "importLuogu"; pid: string; language?: string; createFile?: boolean }
  | { command: "importPreset"; presetId: string }
  | { command: "importLuoguProblemSet"; id: string }
  | { command: "searchLuoguProblems"; keyword: string }
  | { command: "searchLuoguProblemSets"; keyword: string }
  | { command: "saveAiConfig"; config: AiProviderConfigUpdate }
  | { command: "fetchAiModels"; config: AiProviderConfigUpdate }
  | { command: "saveUiLanguage"; language: UiLanguage }
  | { command: "importManualMarkdownFile" }
  | {
      command: "requestAiCoach";
      action: AiCoachAction;
      problemKey: string;
      ojVerdict?: OjVerdict;
      responseLanguage?: CoachResponseLanguage;
      studentRequest?: string;
      previousCoachTurn?: string;
    }
  | {
      command: "requestSolutionScore";
      problemKey: string;
      ojVerdict?: OjVerdict;
      studentRequest?: string;
      archiveOnComplete?: boolean;
    }
  | { command: "requestOptimizationReview"; problemKey: string; studentRequest?: string }
  | { command: "requestSubmissionJudge"; problemKey: string }
  | { command: "requestAutocompletePreview" }
  | { command: "copyInternalTestSummary" }
  | { command: "archiveProblem"; problemKey: string; reason?: string }
  | { command: "deleteProblem"; problemKey: string; deleteScope: "active" | "completed" }
  | { command: "disableStudentSkill"; skillName: string; reason?: string }
  | {
      command: "recordStudentSkillFeedback";
      skillName: string;
      feedbackType: StudentSkillCorrectionType;
      note?: string;
    }
  | { command: "rollbackStudentSkill"; versionId: string };
```

Note: if compile reveals import cycles or private type conflicts, move only the harmless primitive aliases first and keep `WebviewMessage` extraction as the next step. Do not force a risky extraction.

- [ ] **Step 1.3: Import the extracted type in the provider**

In `src/sidebar/ProblemBankViewProvider.ts`, replace the local `type WebviewMessage = ...` block with:

```ts
import type { AiCoachAction, CoachResponseLanguage, WebviewMessage } from "./messageProtocol";
```

Keep runtime behavior unchanged.

- [ ] **Step 1.4: Verify protocol test passes**

Run:

```powershell
npm test -- test/sidebarMessageProtocol.test.ts
```

Expected: PASS. If it fails because `placeholder` or a dynamic command is detected, update the test filter with a comment explaining why that command is intentionally excluded.

### Task 2: Add Host Event Contract

**Files:**
- Create: `src/sidebar/hostEvents.ts`
- Test: `test/sidebarMessageProtocol.test.ts`
- Modify: `src/sidebar/ProblemBankViewProvider.ts` only if type-only import is safe

- [ ] **Step 2.1: Add host event type file**

Create `src/sidebar/hostEvents.ts`:

```ts
import type { ProviderModelInfo } from "../models/providerModelsClient";
import type { AiConfigView } from "../config/modelEnv";
import type { ProblemRecord, ProblemSearchResult, ProblemSetRecord, ProblemSetSearchResult } from "../problemBank/types";
import type { CompletedProblemRecord } from "./problemArchive";

export type HostEventTone = "info" | "success" | "warning" | "error";

export interface HostStatusEvent {
  type: "status";
  text: string;
  tone?: HostEventTone;
}

export interface HostProblemBankStateEvent {
  type: "problemBankState";
  selectedKey?: string;
  problems: ProblemRecord[];
  completedProblems: CompletedProblemRecord[];
  problemSets: ProblemSetRecord[];
  aiConfig?: AiConfigView;
  [key: string]: unknown;
}

export type HostEvent =
  | HostStatusEvent
  | HostProblemBankStateEvent
  | { type: "problemSearchResults"; results: ProblemSearchResult[] }
  | { type: "problemSetSearchResults"; results: ProblemSetSearchResult[] }
  | { type: "aiModels"; models: ProviderModelInfo[]; warnings?: string[] }
  | { type: string; [key: string]: unknown };
```

The permissive fallback keeps this step non-breaking. Later epics can tighten it.

- [ ] **Step 2.2: Add a host event smoke test**

Extend `test/sidebarMessageProtocol.test.ts`:

```ts
import type { HostEvent } from "../src/sidebar/hostEvents";

test("host event contract keeps status event typed", () => {
  const event: HostEvent = { type: "status", text: "ok", tone: "success" };
  expect(event.type).toBe("status");
});
```

Run:

```powershell
npm test -- test/sidebarMessageProtocol.test.ts
```

Expected: PASS.

### Task 3: Add State View Seam

**Files:**
- Create: `src/sidebar/stateView.ts`
- Test: `test/sidebarStateView.test.ts`

- [ ] **Step 3.1: Write failing state-view test**

Create `test/sidebarStateView.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { createEmptySidebarStateView } from "../src/sidebar/stateView";

describe("sidebar state view", () => {
  test("creates a serializable empty state view", () => {
    const state = createEmptySidebarStateView();

    expect(state.activePage).toBe("ai");
    expect(state.uiLanguage).toBe("zh");
    expect(state.problems).toEqual([]);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
```

Run:

```powershell
npm test -- test/sidebarStateView.test.ts
```

Expected: FAIL because `stateView.ts` does not exist.

- [ ] **Step 3.2: Create state view contract**

Create `src/sidebar/stateView.ts`:

```ts
import type { AiConfigView } from "../config/modelEnv";
import type { ProviderModelInfo } from "../models/providerModelsClient";
import type { ProblemRecord, ProblemSearchResult, ProblemSetRecord, ProblemSetSearchResult } from "../problemBank/types";
import type { CompletedProblemRecord } from "./problemArchive";

export type UiLanguage = "zh" | "en";
export type SidebarPage = "ai" | "problem" | "skill";

export interface SidebarAiModelResultsView {
  models: ProviderModelInfo[];
  warnings: string[];
  fetchedAt?: string;
}

export interface SidebarStateView {
  activePage: SidebarPage;
  uiLanguage: UiLanguage;
  selectedKey?: string;
  problems: ProblemRecord[];
  completedProblems: CompletedProblemRecord[];
  problemSets: ProblemSetRecord[];
  problemSearchResults: ProblemSearchResult[];
  problemSetSearchResults: ProblemSetSearchResult[];
  aiConfig?: AiConfigView;
  aiModelResults?: SidebarAiModelResultsView;
}

export function createEmptySidebarStateView(): SidebarStateView {
  return {
    activePage: "ai",
    uiLanguage: "zh",
    problems: [],
    completedProblems: [],
    problemSets: [],
    problemSearchResults: [],
    problemSetSearchResults: []
  };
}
```

- [ ] **Step 3.3: Verify state-view test passes**

Run:

```powershell
npm test -- test/sidebarStateView.test.ts
```

Expected: PASS.

- [ ] **Step 3.4: Optional provider type import**

If `ProblemBankViewProvider.ts` currently owns a local `type UiLanguage = "zh" | "en";`, replace it with:

```ts
import type { UiLanguage } from "./stateView";
```

Do not move `problemBankState()` in this goal unless it is trivial and fully tested.

### Task 4: Add Handler Coverage Test

**Files:**
- Modify: `test/sidebarMessageProtocol.test.ts`

- [ ] **Step 4.1: Add handler coverage test**

Append:

```ts
test("host provider has a handler branch for every exported command", async () => {
  const source = await readFile("src/sidebar/ProblemBankViewProvider.ts", "utf8");

  for (const command of webviewCommandNames) {
    expect(source, `missing handler for ${command}`).toContain(`message.command === "${command}"`);
  }
});
```

Run:

```powershell
npm test -- test/sidebarMessageProtocol.test.ts
```

Expected: PASS. If it fails for commands handled indirectly, either make the handler explicit or add a local `handledWebviewCommandNames` export and test that instead. Prefer explicit host handling for now.

### Task 5: Add Architecture Progress Note

**Files:**
- Modify: `docs/superpowers/specs/2026-05-10-million-token-super-architecture-blueprint.md`

- [ ] **Step 5.1: Add a short progress note after Epic 1 lands**

Add a small note under `Epic 1: Typed Protocol And State Snapshot`:

```markdown
Implementation note: the first code slice extracts `messageProtocol.ts`, `hostEvents.ts`, and `stateView.ts` without changing visible UI behavior. This establishes the seam required by Epic 2 (`AttemptSession`) and Epic 3 (`TeachingWorkflow`).
```

Only add this note after the code and tests pass.

### Task 6: Full Verification

**Files:**
- No new files.

- [ ] **Step 6.1: Compile**

Run:

```powershell
npm run compile
```

Expected: `tsc -p .` succeeds.

- [ ] **Step 6.2: Run all tests**

Run:

```powershell
npm test
```

Expected: all Vitest files pass.

- [ ] **Step 6.3: Run fixture self-evolution gate**

Run:

```powershell
npm run trial:longitudinal-self-evolution -- --provider fixture --limit 1000 --no-write
```

Expected:

```json
{
  "count": 1000,
  "scores": {
    "painPointAccuracy": 1,
    "primaryPainPointAccuracy": 1,
    "skillCandidateAccuracy": 1
  },
  "errorCount": 0
}
```

- [ ] **Step 6.4: Check diff hygiene**

Run:

```powershell
git diff --check
git status --short
```

Expected: no whitespace errors; only intended files are modified.

- [ ] **Step 6.5: Commit**

Run:

```powershell
git add src\sidebar\messageProtocol.ts src\sidebar\hostEvents.ts src\sidebar\stateView.ts test\sidebarMessageProtocol.test.ts test\sidebarStateView.test.ts src\sidebar\ProblemBankViewProvider.ts docs\superpowers\specs\2026-05-10-million-token-super-architecture-blueprint.md
git commit -m "refactor: extract sidebar protocol contracts"
```

Expected: commit succeeds.

## 7. Subagent Instructions For The Next Goal

If the next goal uses subagents, dispatch them like this.

### Worker A: Protocol Contract

Prompt:

```text
You are Worker A for Student Autocomplete Lab. You are not alone in the codebase. Do not revert edits by others.

Ownership:
- src/sidebar/messageProtocol.ts
- test/sidebarMessageProtocol.test.ts protocol inventory test

Task:
Extract the current webview command contract from src/sidebar/ProblemBankViewProvider.ts into messageProtocol.ts. Preserve current command names and the existing { command: ... } shape. Add a test that every browser-side vscode.postMessage({ command }) command is listed in webviewCommandNames.

Do not:
- change UI behavior;
- rename commands;
- edit teaching/model/autocomplete logic.

Final response:
- list changed files;
- state test command run and result.
```

### Worker B: State View Contract

Prompt:

```text
You are Worker B for Student Autocomplete Lab. You are not alone in the codebase. Do not revert edits by others.

Ownership:
- src/sidebar/stateView.ts
- test/sidebarStateView.test.ts

Task:
Create a serializable SidebarStateView contract and createEmptySidebarStateView() helper. Keep it as a seam only; do not move ProblemBankViewProvider.problemBankState() yet unless explicitly asked.

Do not:
- edit ProblemBankViewProvider except for type-only import suggestions;
- change runtime behavior;
- add UI framework dependencies.

Final response:
- list changed files;
- state test command run and result.
```

### Worker C: Provider Integration

Prompt:

```text
You are Worker C for Student Autocomplete Lab. You are not alone in the codebase. Do not revert edits by others.

Ownership:
- src/sidebar/ProblemBankViewProvider.ts
- src/sidebar/hostEvents.ts if Worker A/B are not touching it

Task:
Integrate extracted protocol/state types into ProblemBankViewProvider with minimal behavior change. Prefer type-only imports. If a type extraction risks behavior changes, leave a small compatibility alias and report it.

Do not:
- move AI coach logic;
- move storage paths;
- alter webview HTML/CSS/JS behavior;
- change command IDs.

Final response:
- list changed files;
- compile/test command run and result if run.
```

## 8. Stop Conditions

Stop and report instead of pushing through if any of these happen:

- command coverage test finds browser-dispatched commands that are not host-handled;
- extracting `WebviewMessage` creates circular imports that require moving runtime logic;
- TypeScript compile requires changing public behavior;
- existing UI source tests fail in ways unrelated to type extraction;
- fixture self-evolution accuracy drops;
- any change touches secrets, runtime records, or package lane scripts unexpectedly.

## 9. What Comes After This Goal

If Epic 1 succeeds, the next execution goal should be:

```text
/goal 执行超级架构蓝图 Epic 2：Storage Gateway + AttemptSession。
```

Epic 2 should introduce:

- `src/storage/StoragePaths.ts`;
- `src/attempt/AttemptSession.ts`;
- `src/attempt/AttemptStore.ts`;
- session-aware follow-up storage;
- migration tests for current attempt events.

Do not start Epic 3 `TeachingWorkflow` until Epic 2 proves follow-up can persist in one session.

