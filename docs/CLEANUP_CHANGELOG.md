# Documentation Cleanup Changelog

Branch: `swarm/doc-cleanup`
Scope: Audited all markdown files (`docs/**`, `MANUAL-ACCEPTANCE.md`, `README.release.md`) against actual `src/`, `package.json`, `scripts/`, `prototypes/`, and `test/` without modifying `README.md`, `THIRD_PARTY_NOTICES.md`, source code, tests, or CI.

## Summary Of Actions

### 1. Pruned Completed Step-By-Step Execution Plans (3 files, 5,880 lines)

Per the repository's own documentation policy (remove step-by-step agentic execution plans once their code lands and durable specs retain the architecture):

- Removed `docs/superpowers/plans/2026-07-12-codex-oauth.md` (1,114 lines) — landed in `src/codex/`; spec retained in `docs/superpowers/specs/2026-07-12-codex-oauth-design.md`.
- Removed `docs/superpowers/plans/2026-07-14-formal-frontend-redesign.md` (289 lines) — landed in `src/sidebar/webview/formalDesign.ts` & `ProblemBankViewProvider.ts`; spec retained in `docs/superpowers/specs/2026-07-14-formal-frontend-redesign.md`.
- Removed `docs/superpowers/plans/2026-07-14-language-skill-composition.md` (4,477 lines) — landed in `src/skills/`; spec retained in `docs/superpowers/specs/2026-07-14-language-skill-composition-design.md`.

### 2. Consolidated Overlapping Architecture & Superseded Planning Drafts (8 files -> `docs/architecture.md`)

- Replaced `docs/codex-start-prompt.md` (obsolete CLI-first day-0 prompt), `docs/requirements.md`, `docs/self-evolving-plugin-plan.md`, `docs/beta-v2-final-goals.md`, `docs/beta-0.2-requirements-design.md`, `docs/superpowers/specs/2026-04-29-student-autocomplete-vscode-design.md`, `docs/superpowers/specs/2026-05-10-refactor-architecture-design.md`, and `docs/superpowers/specs/2026-05-10-million-token-super-architecture-blueprint.md` (4,256 lines total) with one code-truthful [architecture.md](architecture.md).
- Eliminated invented folder names (`src/app/`, `src/workflow/`, `src/ai/`, `src/studentSkill/`), stale test/line metrics, and one-time workspace cleanup logs (`test/aaa.py`), while retaining all 4 SVG diagrams in `docs/assets/architecture/`, real schemas (`attempt-session/v1`, `student-skill/v1`, `oj.*/v1`), context gatekeeper rules, governance rules, and structural debt.

### 3. Consolidated 4-Batch Deep-Research Dumps (4 files -> `docs/research-notes.md`)

- Merged `docs/deep-research-agent-teaching-framework.md`, `docs/deep-research-teaching-eval-observability-batch-2.md`, `docs/deep-research-learning-records-eval-ui-batch-3.md`, and `docs/deep-research-skill-distillation-and-self-improvement.md` (1,730 lines total) into [research-notes.md](research-notes.md), preserving all external research provenance and adopted-vs-rejected architectural rationale while stripping repeated summaries and machine-local notes.

### 4. Consolidated Release, Packaging & Evaluation Docs (4 files merged/pruned)

- Merged `docs/open-source-release.md` and `docs/friend-internal-test-build.md` into [release-lanes.md](release-lanes.md), verified against `package.json`, `scripts/packageBetaReleaseVsix.js`, `scripts/packageInternalVsix.js`, and `scripts/checkProjectHygiene.js`.
- Removed `docs/large-scale-growth-simulation.md` (340 lines referencing nonexistent `src/growthSimulation/` files, `npm run trial:growth-sim`, and dated model price estimates) and moved the verified longitudinal CLI flags (`src/cli/longitudinalSelfEvolution.ts`) and hard evaluation gates into [internal-testing.md](internal-testing.md).
- Merged durable safety/non-goal policies from `docs/superpowers/specs/2026-07-12-oj-submission-design.md` (349 lines with unimplemented `SubmissionCoordinator`/`CredentialVault` classes) into [superpowers/specs/2026-07-21-multi-platform-oj-submission-design.md](superpowers/specs/2026-07-21-multi-platform-oj-submission-design.md).

### 5. Verified & Fixed Factual Drift Against `src/`

- **`README.release.md`**: replaced personal shorthand model aliases (`dsv4f`/`dsv4pro`, absent from `src/`) with accurate routing guidance; aligned tab/drawer names (`作答现场`/`题目张贴板`/`学习档案`, `账户与模型`, `OJ 提交控制台`); retained `online-judge-tools` attribution and hygiene compliance.
- **`MANUAL-ACCEPTANCE.md`**: removed ephemeral Computer-Use / old-extension session notes, stale `419` test counts, and nonexistent `.runtime/ui-audit/smoke/*` paths; aligned UI button labels to `src/sidebar/ProblemBankViewProvider.ts` and referenced real `prototypes/oj-console/examples/demo-source.cpp`.
- **`docs/current-gaps-and-next-steps.md`**: removed already-implemented items (`runAiHealthCheck`, `deleteProblem`, `--resume-from`/`--summary-out`) and surfaced the 7 reproduced educational hard-gate bugs from [education-scenario-evaluation-2026-07-22.md](education-scenario-evaluation-2026-07-22.md).
- **`docs/superpowers/specs/2026-07-14-language-skill-composition-design.md`**: aligned module filenames (`deepSeekFimRenderer.ts`, `genericCompletionRenderer.ts`, `messageAutocompleteRenderer.ts`, `renderRules.ts`, `skillRenderer.ts`, `auditView.ts`) and `SkillPlan` / `SkillPlanAudit` fields with `src/skills/types.ts`; stripped agent context-compaction and Computer-Use boilerplate.
- **`docs/superpowers/specs/2026-07-12-codex-oauth-design.md`**: added `codexServices.ts` and stripped worktree/compaction/Computer-Use boilerplate.
- **`docs/superpowers/specs/2026-07-14-formal-frontend-redesign.md`**: aligned primary/secondary button copy (`给一个提示`, `提示更具体`, `继续追问`, `我卡住了`, `完成复盘`) and multi-platform (`Codeforces` + `AtCoder`) submission docket details with `src/sidebar/ProblemBankViewProvider.ts`.
- **`docs/superpowers/specs/2026-07-14-oj-console-prototype-design.md` & `2026-07-21-multi-platform-oj-submission-design.md`**: corrected stale claims that OJ Console UI is excluded from the VSIX (clarified `src/ojConsole/OjConsolePanel.ts` + `prototypes/oj-console/frontend/` ship in VSIX while `prototypes/oj-console/backend/` stays repo-only) and updated `/api/login-terminal` and `SubmissionJobState` (`submitted`) for Codeforces + AtCoder.
- **`docs/problem-search-mcp.md`**: clarified relationship to the extension's 5-platform `src/oj/` MCP broker and neutralized legacy `MiMo` wording.
- **`docs/INDEX.md`**: added canonical documentation index.

## Before / After Stats

| Scope | Before | After | Reduction |
| --- | --- | --- | --- |
| All repository Markdown files | 35 files / 15,691 lines | 20 files / 1,633 lines | -15 files / -14,058 lines (-89.6%) |
| In-scope Markdown (`README.md` & `THIRD_PARTY_NOTICES.md` untouched) | 33 files / 15,402 lines | 18 files / 1,344 lines | -15 files / -14,058 lines (-91.3%) |
