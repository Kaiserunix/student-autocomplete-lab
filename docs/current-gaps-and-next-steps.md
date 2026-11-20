# Current Gaps And Next Steps

Status: Active — maintainer backlog grounded in current `src/` and evaluation evidence. Not a public release note.

## What Is Working Today

- **Core beta workflow**: competition-dossier sidebar (`作答现场` / `题目张贴板` / `学习档案`), progressive AI coaching, local `Student Skill` (`student-skill/v1`) with correction/disable/rollback, archiving, problem deletion (`deleteProblem`), and rule-based recommendations.
- **Hard context isolation**: inline Ghost Text (~350 ms pause trigger) reads local code context and bounded safe habits only; problem statements, Teacher Packs, reference solutions, and coach threads stay in explicit coaching flows.
- **Typed skill composition (`src/skills/`)**: 4-layer `SkillPlan` (`head > body > tail > footer`) across Python, C, C++, Rust, and `generic`, with provider-aware renderers including exact-suffix DeepSeek FIM (`https://api.deepseek.com/beta`).
- **Multi-provider AI & health checks**: OpenAI (API Key + experimental Codex OAuth via `src/codex/`), OpenAI-compatible (separate chat/autocomplete base URLs & formats), Anthropic Messages, model listing, and the 3-step `健康检查` (`runAiHealthCheck`: model list, chat smoke, autocomplete smoke with `deepseek-fim-beta-required` detection and secret redaction).
- **Five-platform read-only OJ broker (`src/oj/`)**: lazy-loaded MCP broker supporting Luogu, Codeforces, and AtCoder remote HTTP endpoints plus local stdio adapters for LeetCode and NowCoder, with Chinese/English Markdown import as offline fallback.
- **Experimental OJ submission (`src/submission/`, `src/ojConsole/`)**: user-confirmed single-shot `online-judge-tools/oj` submission for Codeforces and AtCoder in both the sidebar docket and the integrated `studentAutocomplete.openOjConsole` webview panel (plus standalone localhost harness `npm run prototype:oj`).
- **Verification & release pipeline**: Vitest unit/contract suites (114 test files), resumable longitudinal CLI (`--resume-from`, `--summary-out`), allowlist beta-release VSIX packaging (`scripts/packageBetaReleaseVsix.js`), and CI hygiene gates (`.github/workflows/ci.yml`).

## Current Gaps

### 1. Educational Hard Gates (Blocking Wider Human Learning Claims)

Reproduced during the [2026-07-22 education evaluation](education-scenario-evaluation-2026-07-22.md):

1. **Duplicate evidence promotion**: replaying identical/same-snapshot hints on the same problem can accumulate `evidenceCount >= 3` and promote a skill to `active` (`src/teaching/studentSkill.ts`).
2. **Disabled skill transfer leak**: legacy transfer records on a disabled skill can still enter transfer-ready calculations (`src/recommendation/transfer.ts`).
3. **Unrelated transfer lifting global difficulty**: transfer evidence on one skill can raise target difficulty for an unrelated target skill (`src/recommendation/rules.ts`).
4. **Incomplete correction propagation to legacy `StudentProfile`**: corrections suppress `StudentSkill`, but legacy `studentProfile.json` pain-point counters still influence recommendation ranking via max-merge.
5. **Prompt-only no-full-answer guardrail**: `teachingReport` parsing does not yet enforce an output-side semantic/code-length check against full solutions in `hint`/`specificHint`.
6. **Non-idempotent `AttemptSession` replay**: replaying the same event appends duplicate coach turns.
7. **Rollback reactivating disabled skills**: rolling back to an older `active` snapshot silently overrides a user's `disabled` state.

### 2. Sidebar Architecture & UI Polish

- `src/sidebar/ProblemBankViewProvider.ts` (~8.3k lines) still combines VS Code host dispatch with inline HTML, CSS, and webview JS; extracting command handlers and externalized webview modules remains high-leverage debt.
- Active-file display in the sidebar can drift behind the active editor tab, and `测试补全接口` should capture the exact cursor/prefix/suffix snapshot and display post-presentation text matching inline Ghost Text.
- Active-problem coaching actions like pre-submit check (`找错复盘`) and `推荐下一题` are less discoverable on active cards than on archived cards.
- English UI (`studentAutocomplete.ui.language = "en"`) covers primary labels, while secondary drawers and status copy remain partially Chinese.
- The integrated `studentAutocomplete.openOjConsole` panel still needs a real Extension Development Host walkthrough (demo proof currently covers the standalone Chromium harness).
- No automated VS Code Extension Host or Playwright screenshot regression gate runs in CI yet.

### 3. Autocomplete & Provider Configuration

- No automated VS Code inline-suggestion E2E test exists; latency and cache-hit metrics are not systematically recorded.
- C, C++, and Rust autocomplete heuristics and trigger patterns need deeper real-world tuning compared to Python.
- OpenAI-compatible mode supports separate chat and autocomplete base URLs/models, but shares a single saved API key slot (mixed providers need per-role keys).
- Settings are primarily global; deliberate workspace-level overrides with clear precedence copy are not built yet.
- Legacy `mimo` identifiers remain in internal source files and CLI scripts (`src/autocomplete/mimoAutocomplete.ts`, `src/teaching/mimoTeacher.ts`, `npm run trial:mimo*`).
- Codex OAuth remains experimental; keep the account-risk notice visible and API-key / OpenAI-compatible routes first-class.

### 4. Problem Intake & Experimental OJ Submission

- Codeforces and AtCoder delegated `oj` submission remain labeled experimental until dedicated-account one-submit smoke tests pass. AtCoder's upstream Turnstile incompatibility (`online-judge-tools/oj#934`) must remain an availability error, never bypassed.
- Luogu endpoints are unofficial and can drift; retries, drift telemetry, and seamless Markdown fallback matter.
- LeetCode and NowCoder online import require separately installed local adapters; Codeforces full statements require Competitive Companion or Markdown import.
- Luogu, LeetCode, NowCoder, and Kattis remain read-only for submission.

### 5. Evaluation & Friend Testing

- The 1,000-sample fixture run (`trial:longitudinal-self-evolution -- --provider fixture`) proves deterministic pipeline and parser stability, not real human learning improvement.
- Live calibration slices remain small due to model cost; future human pilots need matched crossover design and delayed transfer probes.
- Friend-test distribution (`npm run package:internal`) needs clearer upfront consent wording before expanding beyond trusted personal testers.

## Prioritized Next Slices

### Priority 1: Close The 7 Educational Hard Gates

1. Deduplicate evidence by stable identity (problem/code/diagnosis or event ID) before counting toward promotion.
2. Scope transfer checks to the target skill and strictly exclude disabled skills.
3. Unify recommendation inputs on `StudentSkill` (or propagate corrections into legacy `StudentProfile`).
4. Preserve user `disabled` state across version rollbacks unless explicitly re-enabled.
5. Add output-side full-solution / code-length checks to coach response parsing and local-continuity/duplication checks to autocomplete validation.
6. Make `AttemptSession` event replay idempotent and lock all 7 fixes with Vitest regression tests.

### Priority 2: Sidebar Decoupling & Configuration Hardening

1. Fix active-editor card synchronization and align `测试补全接口` with inline cursor/presentation snapshots.
2. Add per-role API keys for OpenAI-compatible chat vs autocomplete endpoints.
3. Neutralize legacy `mimo` runtime/CLI naming to generic `ai` / `openai-compatible` names.
4. Decompose `ProblemBankViewProvider.ts` handlers and add a Playwright webview smoke check.

### Priority 3: Dedicated-Account OJ Smoke & Human Pilot

1. Run the manual Extension Development Host walkthrough for `studentAutocomplete.openOjConsole` and `MANUAL-ACCEPTANCE.md`.
2. Execute dedicated-account single-submit smoke gates for Codeforces (and AtCoder when upstream login permits) before removing the experimental label.
3. Run a small formative usability pilot (3–5 learners, crossover with/without assistant, delayed transfer tasks) only after Priority 1 hard gates pass.
