# Integration Record — 2026-07-22

Status: Historical — consolidation milestone snapshot recording how the repository's feature branches were merged into the public beta baseline.

## Runtime Decisions

- The formal competition-dossier beta sidebar (`src/sidebar/`) remains the single UI and state owner. The earlier next-generation prototype workspace remains in Git history only and is not loaded alongside the beta sidebar.
- `src/oj/` is the single read-only OJ broker connecting Luogu, LeetCode, NowCoder, Codeforces, and AtCoder behind one `oj.*/v1` contract and provider-status model.
- `src/submission/` remains the only OJ write path, supporting experimental, explicitly confirmed Codeforces and AtCoder submissions through a separately installed `online-judge-tools/oj`.
- Codex OAuth (`src/codex/`), API-key/compatible providers, automatic Ghost Text, language-skill composition (`src/skills/`), the AI coach, `StudentSkill`, recommendation, and the OJ Console all live in the same codebase.
- MCP and HTML-parser (`parse5`) dependencies load lazily only when an OJ connection or statement import is requested, keeping extension startup lightweight.

## Verification Snapshot (2026-07-22)

- `npm ci`: clean lock-file install, 0 reported production vulnerabilities.
- `npm test`: 113 test files and 474 tests passed.
- Main extension, OJ Console, and release TypeScript checks passed.
- Five-provider live read smoke passed: Luogu, LeetCode, NowCoder, and AtCoder imported statements; Codeforces returned public metadata and required Companion/Markdown for complete statements.
- Clean beta-release VSIX contained 120 files, no source maps, and no secret-like or local-runtime paths.
- Fresh VS Code profile installed the VSIX, activated once via `onStartupFinished`, and logged no extension-host errors.

## Subsequent Baseline Updates

- Integrated the OJ Console UI into the extension as `studentAutocomplete.openOjConsole` (`src/ojConsole/OjConsolePanel.ts` + bundled `prototypes/oj-console/frontend/`).
- Raised the VS Code engine baseline to `^1.125.0` and upgraded CI to GitHub Actions v7 (`114` test files currently in repo).

## Experimental Boundaries Retained

- Codex OAuth may carry account risk; self-testing has not encountered suspension, which is not an official guarantee.
- Codeforces and AtCoder submission remain experimental and require a fresh single-use confirmation every time.
- LeetCode and NowCoder online import require separately installed local adapters; Markdown import remains the offline fallback.
