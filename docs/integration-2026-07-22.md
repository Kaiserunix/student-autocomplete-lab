# Integration Record — 2026-07-22

This record explains which implementation became the public beta source of truth after the repository's feature branches were consolidated.

## Runtime Decisions

- The formal beta sidebar remains the single UI and state owner. The next-generation workspace stays in Git history as an alternative design, but its parallel state system is not loaded beside the beta sidebar.
- `src/oj/` is the single read-only OJ broker. It connects Luogu, LeetCode, NowCoder, Codeforces, and AtCoder behind one contract and one provider-status model.
- The existing `src/submission/` flow remains the only write path. It supports experimental, explicitly confirmed Codeforces and AtCoder submissions through a separately installed `online-judge-tools/oj`.
- Codex OAuth, API-key providers, automatic Ghost Text, language-skill composition, the AI coach, Student Skill, recommendation, and the standalone OJ Console all remain in the same build.
- MCP and HTML-parser dependencies load only when an OJ connection or statement import is requested, keeping ordinary extension activation independent of the large OJ runtime bundle.

## Verification Snapshot

- `npm ci`: clean lock-file install, 0 reported production vulnerabilities.
- `npm test`: 113 test files and 474 tests passed.
- Main extension, OJ Console, and release TypeScript checks passed.
- Five-provider live read smoke passed: Luogu, LeetCode, NowCoder, and AtCoder imported statements; Codeforces returned public metadata and correctly required Companion for a complete statement.
- The clean beta-release VSIX contained 120 files, no source maps, and no secret-like or local-runtime paths.
- A fresh VS Code profile installed the VSIX, activated the extension once through `onStartupFinished`, and recorded no extension-host errors.

## Remaining Experimental Boundaries

- Codex OAuth may carry account risk. The author's self-test has not encountered an account suspension, but that is not a zero-risk or official guarantee.
- Codeforces and AtCoder submission remain experimental and always require a new explicit confirmation.
- LeetCode and NowCoder online import require separately installed local adapters.
- Live provider availability can change independently of the extension; Markdown import remains the fallback.
