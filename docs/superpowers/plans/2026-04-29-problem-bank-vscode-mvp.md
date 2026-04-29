# Problem Bank VS Code MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first VS Code extension slice: Luogu/LeetCode-aware problem bank metadata, public Luogu import, manual statement fallback, local records, safe autocomplete filtering, and a sidebar shell.

**Architecture:** Keep provider-specific problem source policy separate from local problem storage. Core behavior is implemented in pure TypeScript modules with Vitest coverage; VS Code UI code calls those modules but stays thin.

**Tech Stack:** VS Code extension API, TypeScript, Vitest, local JSONL files, OpenAI-compatible model routing hooks prepared for later phases.

---

## File Structure

- `package.json`: VS Code extension manifest and scripts.
- `tsconfig.json`: TypeScript compile configuration.
- `vitest.config.ts`: Unit test configuration.
- `src/problemBank/types.ts`: Shared problem, source, and pain-point types.
- `src/problemBank/seedLuogu.ts`: Seed metadata for the Luogu problems supplied by the user.
- `src/problemBank/sourcePolicy.ts`: Default import policy for Luogu, LeetCode, and manual paste.
- `src/problemBank/luoguClient.ts`: Public Luogu problem fetcher using `GET /problem/:pid` with `x-lentille-request: content-only`.
- `src/problemBank/catalog.ts`: Catalog lookup and normalization helpers.
- `src/autocomplete/filter.ts`: 1-3 line autocomplete post-filter.
- `src/autocomplete/prompt.ts`: Autocomplete prompt builder that excludes problem statements.
- `src/storage/jsonlStore.ts`: Local JSONL append/read helpers.
- `src/sidebar/ProblemBankViewProvider.ts`: VS Code webview provider for problem note and actions.
- `src/extension.ts`: Extension activation and command registration.
- `test/*.test.ts`: Unit tests for policy, catalog, filter, prompt, and JSONL behavior.
- `resources/activity.svg`: Activity bar icon.
- `README.md`: Updated run instructions.

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`

- [ ] Create the TypeScript VS Code extension scaffold.
- [ ] Install dev dependencies with `npm install`.
- [ ] Run `npm test` and confirm the empty test suite passes or reports no tests.
- [ ] Commit scaffold.

## Task 2: Problem Source Policy, Luogu Client, And Seed Catalog

**Files:**
- Create: `src/problemBank/types.ts`
- Create: `src/problemBank/sourcePolicy.ts`
- Create: `src/problemBank/luoguClient.ts`
- Create: `src/problemBank/seedLuogu.ts`
- Create: `src/problemBank/catalog.ts`
- Create: `test/sourcePolicy.test.ts`
- Create: `test/luoguClient.test.ts`
- Create: `test/catalog.test.ts`

- [ ] Write tests that Luogu defaults to public import with manual paste fallback.
- [ ] Write tests that LeetCode is optional-interface plus manual fallback until GraphQL is wired.
- [ ] Write tests that all 20 supplied Luogu IDs are present.
- [ ] Write tests that Luogu JSON normalizes into a local problem record.
- [ ] Implement the policy, Luogu client, and seed catalog.
- [ ] Run `npm test`.
- [ ] Commit source policy and seed catalog.

## Task 3: Autocomplete Safety Core

**Files:**
- Create: `src/autocomplete/filter.ts`
- Create: `src/autocomplete/prompt.ts`
- Create: `test/autocomplete.test.ts`

- [ ] Write tests that long model output is trimmed to at most 3 non-empty lines.
- [ ] Write tests that full-problem fields are excluded from autocomplete prompt payloads.
- [ ] Implement filter and prompt builder.
- [ ] Run `npm test`.
- [ ] Commit autocomplete safety core.

## Task 4: Local JSONL Store

**Files:**
- Create: `src/storage/jsonlStore.ts`
- Create: `test/jsonlStore.test.ts`

- [ ] Write tests that JSONL append/read round-trips records.
- [ ] Write tests that missing files read as an empty list.
- [ ] Implement JSONL helpers.
- [ ] Run `npm test`.
- [ ] Commit local store.

## Task 5: VS Code Sidebar Shell

**Files:**
- Create: `src/sidebar/ProblemBankViewProvider.ts`
- Create: `src/extension.ts`
- Create: `resources/activity.svg`
- Modify: `package.json`

- [ ] Add activity bar and sidebar contributions.
- [ ] Render Luogu seed list, public import action, and a manual problem statement editor.
- [ ] Save pasted statement as a local problem record.
- [ ] Wire placeholder commands for hint, more-specific hint, reveal answer, and recommendation.
- [ ] Run `npm run compile`.
- [ ] Commit sidebar shell.

## Task 6: Documentation And Verification

**Files:**
- Modify: `README.md`

- [ ] Document how to install dependencies, compile, test, and launch the extension host.
- [ ] Document the source policy: Luogu public import is attempted first; manual paste is the fallback; LeetCode remains manual until a stable GraphQL adapter is wired.
- [ ] Run `npm test`.
- [ ] Run `npm run compile`.
- [ ] Commit docs and final verification.
