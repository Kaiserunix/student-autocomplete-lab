# Multi-Platform OJ Submission Design

Date: 2026-07-21
Status: Active / Reference — authoritative contract for experimental Codeforces and AtCoder submission (`src/submission/` and `src/ojConsole/`). Authenticated live submissions remain manual release gates. Luogu, LeetCode, NowCoder, Kattis, and all unregistered judges are rejected for submission.

## 1. Product Boundary & Non-Goals

Both the VS Code sidebar submission docket (`#submissionDocket`) and the OJ Submission Console (`studentAutocomplete.openOjConsole` / standalone `prototypes/oj-console/`) expose one explicit submission workflow without embedding external OJ websites in a webview.

- The extension owns platform selection, strict target validation, source identity, preview, one-use confirmation, job state, sanitized result rendering, and handoff to the teaching workflow.
- A separately installed [`online-judge-tools/oj`](https://github.com/online-judge-tools/oj) process owns the authenticated platform session and the single network submission.
- **Hard prohibitions**: no browser cookie scraping, no stored OJ passwords, no CAPTCHA/Turnstile automation or bypass, no loading arbitrary external OJ scripts into webviews, no submission in untrusted workspaces, no automatic resubmission after ambiguous failures, and no conflating `AI 估计` with official OJ verdicts.

## 2. Shipped Capability Matrix

| Platform | Target Form | Delegated Login | Submit | Result After CLI Success |
| --- | --- | --- | --- | --- |
| **Codeforces** | `https://codeforces.com/contest/{id}/problem/{index}` or supported Gym form | Visible `oj login https://codeforces.com/` terminal | One `oj submit` process | Trusted submission URL + optional bounded public `user.status` verdict lookup when public handle is supplied |
| **AtCoder** | `https://atcoder.jp/contests/{contest}/tasks/{task}` | Visible `oj login https://atcoder.jp/` terminal | One `oj submit` process | Terminal `submitted` state + same-contest AtCoder submission URL; no verdict is scraped or invented |
| **Luogu / LeetCode / NowCoder / Kattis / other** | Rejected | None | Rejected | Unsupported (read-only intake where available) |

Codeforces and AtCoder remain labeled **experimental** until each passes dedicated-account login and single-submit manual smoke tests.

## 3. Target Registry (`src/submission/submissionTarget.ts`)

`src/submission/submissionTarget.ts` is the sole entry point from user text to a supported `SubmissionTarget`:

```ts
type SubmissionPlatform = "codeforces" | "atcoder";
type SubmissionTarget = CodeforcesTarget | AtCoderTarget;

interface SubmissionPlatformCapability {
  platform: SubmissionPlatform;
  displayName: string;
  loginUrl: string;
  verdictPolling: "public_api" | "submission_url";
}
```

Target parsing requires HTTPS, exact host allowlist matching (`codeforces.com` / `atcoder.jp`), concrete problem/task paths, strips query/fragment strings during canonicalization, and validates that the parsed platform matches the selected UI platform on the backend.

**Adding any future platform requires**: a typed target parser, fixed capability record, output-sanitization rules, unit/contract tests, human-operated login story, third-party license review (documented in `THIRD_PARTY_NOTICES.md`), and a dedicated-account smoke gate.

## 4. Confirmation, Process Boundary & Login

- **VS Code sidebar**: requires a trusted workspace and a saved active editor file; confirmation binds to normalized target, immutable editor version, file path/language/byte size, optional Codeforces handle, and a 2-minute TTL.
- **OJ Console**: accepts bounded in-memory source bytes (<= 1 MiB); real mode additionally requires process-local unlock phrase `我确认本次操作可能向在线评测平台真实提交代码`.
- **Single-use enforcement**: every confirmation is consumed atomically before external execution and cannot be replayed after expiry or source/target change.
- **No-shell process execution** (`src/submission/processHost.ts`, `src/submission/onlineJudgeTools.ts`):
  ```text
  oj submit --yes --no-open --wait 0 <canonical HTTPS target> <saved source path>
  ```
  `oj` is user-installed, never bundled in any VSIX, and its executable/arguments cannot be overridden via workspace settings.
- **Sanitization**: execution is time- and output-bounded; returned URLs must match the validated host and contest; raw stdout/stderr, source code, cookies, and credentials are never stored or returned.
- **Login**: visible Windows PowerShell terminal runs only the registry's fixed `oj login` URL. Users complete all browser/graphical challenges manually. Upstream AtCoder Turnstile incompatibility ([`online-judge-tools/oj#934`](https://github.com/online-judge-tools/oj/issues/934)) is reported as an availability limitation, never bypassed.

## 5. Result Semantics & Teaching Integration

Normalized outcomes distinguish transport success from official verdicts:
- `submitted`: CLI confirmed submission and returned a trusted submission URL, but no official final verdict was polled (standard for AtCoder and Codeforces without handle).
- `judged`: bounded public-API lookup returned an official normalized verdict (`AC`, `WA`, `CE`, `RE`, `TLE`, `MLE`, `OLE`, `PE`, `PARTIAL`, `SKIPPED`, `UNKNOWN`). Timeouts become `UNKNOWN`, never `WA`, and never trigger automatic retry.
- `login_required`, `unavailable`, `failed`: no submission success claimed.

Official verdicts stay stored and rendered separately from `AI 估计`. No teaching action ever edits files or resubmits automatically.

## 6. Packaging & Third-Party Attribution

- `src/submission/` and the integrated `src/ojConsole/OjConsolePanel.ts` (+ `prototypes/oj-console/frontend/`) ship in the clean beta-release VSIX.
- The standalone localhost HTTP server (`prototypes/oj-console/backend/` & `scripts/`) stays repository-only and excluded from VSIX packages.
- [`online-judge-tools/oj`](https://github.com/online-judge-tools/oj) (MIT) is credited in `README.md`, `README.release.md`, and `THIRD_PARTY_NOTICES.md`, with explicit non-affiliation disclaimers for Codeforces, AtCoder, and `online-judge-tools`.

## 7. Upstream Compatibility & Manual Release Gate

- Isolated no-login compatibility check (2026-07-21, gitignored Python 3.14 venv): PyPI `online-judge-tools 11.5.1` + `online-judge-api-client 10.10.1` required `setuptools` for removed `distutils`; `oj submit --help` listed Codeforces and AtCoder.
- Automated suites cover target parsing, process-injection protection, URL sanitization, confirmation expiry/replay, Codeforces polling, AtCoder `submitted`-only semantics, and console/webview contracts. Never run live authenticated submissions in CI.
- **Manual release gate** (dedicated test account required before removing "experimental"): install `oj` -> complete visible login/challenge -> verify no-submit preview -> submit one harmless solution once -> confirm zero duplicate submissions -> verify trusted link & platform result semantics -> sign out.
