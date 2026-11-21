# OJ Console Harness & Integrated Panel Design

Date: 2026-07-14 (extended 2026-07-21 for AtCoder; integrated into extension panel in `src/ojConsole/`)
Status: Reference (Implemented — standalone localhost harness in `prototypes/oj-console/` + VSIX-integrated VS Code panel `studentAutocomplete.openOjConsole` in `src/ojConsole/OjConsolePanel.ts`)

## 1. Purpose & Dual Delivery Surface

Provide a focused dark operations console for the safe OJ submission state machine (`DEMO` by default; separately unlocked `REAL` mode invoking `online-judge-tools/oj` for Codeforces and AtCoder).

It runs on two surfaces sharing the same frontend assets (`prototypes/oj-console/frontend/{index.html,app.js,styles.css}`) and core contract:

1. **Integrated VS Code WebviewPanel (`src/ojConsole/OjConsolePanel.ts`)**: opened via Command Palette (`AI 做题陪练：打开 OJ 提交控制台`), backed by `src/ojConsole/consoleService.ts` over VS Code webview message bridging (`ojConsoleRequest` / `ojConsoleResponse` / `ojConsoleJob`). **Bundled in the beta-release VSIX** (`prototypes/oj-console/frontend/**` + compiled `dist/src/ojConsole/`).
2. **Standalone Localhost Harness (`prototypes/oj-console/backend/` & `scripts/`)**: Node HTTP server bound to `127.0.0.1` plus PowerShell trial client for browser/CLI verification outside VS Code. **Repository-only and excluded from VSIX packages.**

Multi-platform submission rules and release gates are defined in [2026-07-21-multi-platform-oj-submission-design.md](2026-07-21-multi-platform-oj-submission-design.md).

## 2. Commands (Standalone Harness)

```powershell
npm run prototype:oj          # compile and start localhost server + open browser
npm run prototype:oj:backend  # compile and start API only
npm run prototype:oj:try      # run PowerShell client against running API
```

## 3. Core Architecture

Shared production submission modules reused by both surfaces:
- `src/submission/submissionTarget.ts` & `codeforcesTarget.ts` — strict HTTPS allowlist parsing for Codeforces and AtCoder.
- `src/submission/onlineJudgeTools.ts` — `oj` version check and single no-shell `oj submit` invocation.
- `src/submission/codeforcesVerdict.ts` — bounded Codeforces public `user.status` polling.
- `src/submission/processHost.ts` — no-shell child process runner.

Console service units (mirrored in `src/ojConsole/` and `prototypes/oj-console/backend/`):
- `sourceStore.ts` — bounded in-memory source storage exposing metadata & 12-char SHA-256 digest only (never source text).
- `modeGate.ts` — defaults to `demo`; unlocks `real` mode in-process only on exact phrase match.
- `confirmationStore.ts` — two-minute, single-use confirmation bound to immutable source digest, target, handle, mode, and demo scenario.
- `submissionJobs.ts` — ephemeral async job store with terminal TTL pruning.
- `demoSubmission.ts` / `realSubmission.ts` — deterministic demo transitions vs single-shot temp-file `oj` execution with `finally` cleanup.
- `loginTerminal.ts` (standalone) / `consoleService.ts` — launches visible Windows PowerShell for fixed registered platform login (`oj login https://codeforces.com/` or `oj login https://atcoder.jp/`).

## 4. API & Message-Bridge Contract

Both the localhost HTTP server and `OjConsolePanel.dispatch()` expose identical logical endpoints:

- **Localhost HTTP security**: every `/api/` request requires the random startup token in `X-OJ-Console-Token` (injected server-side into HTML, never in URLs), sends no CORS headers, accepts only missing `Origin` (PowerShell client) or exact local origin, and rejects foreign `Host` headers to prevent DNS rebinding. Single-user trusted device only.
- **WebviewPanel CSP**: strict `default-src 'none'`, webview `cspSource` scripts/styles, no network token needed.

| Endpoint | Behavior |
| --- | --- |
| `GET /api/status` | Server/panel version, startup time, mode (`demo` / `real_unlocked`), sanitized `oj` availability/version (cached 5 s), active object counts, and fixed Codeforces/AtCoder capability records. |
| `POST /api/source` | Accepts source bytes (`application/octet-stream` + `x-source-name` over HTTP; base64 over webview bridge). Allowed extensions: `.c`, `.cc`, `.cpp`, `.cxx`, `.py`, `.py3`, `.java`, `.kt`, `.rs`, `.go`, `.js`, `.ts`, `.cs`, `.swift`. Rejects empty files or files > 1 MiB. Store cap: 8 sources / 4 MiB total. Returns opaque `sourceId`, filename, language, byte size, and 12-char SHA-256 digest only. |
| `POST /api/preview` | Validates `sourceId`, `platform`, HTTPS `problemUrl` (must match selected platform), optional Codeforces handle (rejected for AtCoder), `mode`, and demo `scenario`. Returns immutable preview metadata and one opaque `confirmationId`. Never submits. |
| `POST /api/real-mode/unlock` | Requires exact phrase `我确认本次操作可能向在线评测平台真实提交代码`; unlocks real mode for the current process/panel session only. |
| `POST /api/confirm` | Atomically consumes a valid, unexpired, matching confirmation once and starts an async job; returns opaque `jobId`. |
| `GET /api/submissions/:jobId` | Returns safe job view with state in `created \| submitting \| queued \| judging \| submitted \| accepted \| rejected \| unknown \| failed`, optional normalized verdict, trusted submission URL, and sanitized message. Never exposes raw CLI output, cookies, credentials, or source code. |
| `POST /api/login-terminal` | Available only after real-mode unlock on Windows. Accepts only registered `platform` (`"codeforces" \| "atcoder"`) and opens visible PowerShell with the registry's fixed `oj login` URL. |

Error responses use stable JSON `{ "error": { "code", "message" } }` with codes: `invalid_request`, `unauthorized`, `origin_rejected`, `source_missing`, `source_too_large`, `target_invalid`, `real_mode_locked`, `tool_unavailable`, `confirmation_missing`, `confirmation_expired`, `confirmation_consumed`, `job_missing`, `login_terminal_unavailable`, `submission_failed`, `not_found`.

## 5. Demo vs Real Mode & Bounds

- **Demo scenarios** (no external calls): `accepted` (AC), `wrong_answer` (WA), `compile_error` (CE), `unknown` (timeout -> UNKNOWN), `login_required` (simulated pre-submit failure).
- **Real mode**: consumes confirmation before external work, writes in-memory source to an isolated temp dir (`.runtime/oj-console/<job-id>/` standalone or `<globalStorage>/oj-console/` in VS Code), invokes `oj submit` once, deletes the temp dir in `finally`, polls Codeforces public API only when a handle is given, stops AtCoder at `submitted` with an official URL, and maps ambiguity/timeout to `unknown` without auto-retry.
- **Bounds**: max 8 sources (4 MiB total), max 16 pending previews, max 32 submission jobs, 10-minute terminal job TTL, all state ephemeral in memory.

## 6. Frontend Constraints & Verification

- Dark dense console with 4 selectable themes (`acid`, `violet`, `amber`, `cyan`), `Ctrl+K` command palette, `Ctrl+Enter` preview/confirm shortcuts, and file drop/picker that never renders source text.
- **Comment-free source rule**: `prototypes/oj-console/frontend/{index.html,styles.css,app.js}` must contain zero source comments (enforced by `test/ojConsoleFrontendSource.test.ts`).
- Automated verification covers localhost API security, bounds, confirmation replay/expiry, single-invocation guarantees, temp cleanup, PowerShell demo client, and headless Chromium demo AC flows (`scripts/ojConsoleBrowserCheck.py`). Real remote submission remains a dedicated-account manual release gate; the integrated `OjConsolePanel` still requires a live Extension Development Host walkthrough.
