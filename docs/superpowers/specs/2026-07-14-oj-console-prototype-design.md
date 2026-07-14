# Minimal OJ Console Prototype Design

Date: 2026-07-14

Status: standalone prototype implemented and verified; authenticated live Codeforces submission remains a separate manual gate.

## 1. Purpose

Build a standalone local experience for trying the Codeforces submission workflow without opening VS Code or visiting the Codeforces submission page manually.

The prototype answers two questions:

1. Does the submission state model feel understandable and safe when exposed outside the extension sidebar?
2. Is the tool-console layout a useful foundation for a later integrated OJ account and submission surface?

It is an experimental local harness, not a second production application. It reuses the production submission modules and must be deleted or absorbed after the workflow has been evaluated.

## 2. Confirmed Product Decisions

- Default to a deterministic safe demo mode.
- Offer a separately unlocked real mode that may invoke `online-judge-tools/oj`.
- Accept source through a local file chooser rather than a code textarea.
- Open a visible PowerShell window for delegated Codeforces login.
- Use the dense dark `工具控制台` visual direction.
- Implement and validate the backend before writing the browser interface.
- Provide a PowerShell client so the backend can be tried before the frontend exists.
- Keep browser HTML, CSS, and JavaScript free of source-code comments. Explanations belong in this design, backend names, and tests.
- Keep all state ephemeral and store no credentials.

## 3. Delivery Sequence

### Phase A: Backend-First Experience

The first runnable slice contains a localhost HTTP API, deterministic demo jobs, optional real `oj` integration, visible PowerShell login, a PowerShell experience client, and backend contract tests. It must be usable without a browser frontend.

### Phase B: Tool-Console Frontend

After the backend flow is verified, add the selected dark control-console UI. It consumes the same HTTP API and does not gain privileged behavior that the PowerShell client lacks.

## 4. Location And Commands

Prototype code lives under:

```text
prototypes/oj-console/
  backend/
  frontend/
  scripts/
```

Commands:

```powershell
npm run prototype:oj
npm run prototype:oj:backend
npm run prototype:oj:try
```

`prototype:oj:backend` starts the API without opening a browser. `prototype:oj:try` runs the PowerShell experience against that API. `prototype:oj` starts the completed backend and frontend experience.

## 5. Backend Architecture

The backend is a small Node HTTP server using project TypeScript and Node built-ins. It does not add Express, a database, or a frontend build tool.

It reuses:

- `src/submission/codeforcesTarget.ts` for strict target parsing;
- `src/submission/onlineJudgeTools.ts` for capability checks and one `oj` invocation;
- `src/submission/codeforcesVerdict.ts` for bounded public polling;
- `src/submission/confirmationStore.ts` or a compatible wrapper for short-lived one-time confirmation;
- `src/submission/processHost.ts` for no-shell child processes.

Prototype-only units have one responsibility each:

| Unit | Responsibility |
| --- | --- |
| `server.ts` | bind localhost, generate a session token, route requests, and handle shutdown |
| `api.ts` | validate method, content type, token, and request shape |
| `sourceStore.ts` | hold bounded source bytes in memory and expose metadata/digest only |
| `modeGate.ts` | keep demo as default and require an explicit real-mode phrase |
| `submissionJobs.ts` | expose ephemeral asynchronous job state |
| `demoSubmission.ts` | produce deterministic demo transitions |
| `realSubmission.ts` | create a temporary source, invoke `oj` once, poll, and clean up |
| `loginTerminal.ts` | start visible Windows PowerShell with the fixed login command |

## 6. HTTP Contract

Every `/api/` request requires the random startup token in `X-OJ-Console-Token`. The PowerShell client reads it from the server startup file; the later browser document receives it through server-side HTML injection, never through a URL. The server sends no CORS headers. A missing `Origin` is accepted for the token-authenticated PowerShell client, the exact local server origin is accepted for the browser, and every other origin is rejected.

The server also rejects non-local `Host` values before serving the token-bearing document, preventing a DNS-rebinding page from treating the service as its own origin. This token protects against drive-by web requests; it is not an operating-system identity boundary. Run the prototype only on a trusted, single-user device. Another process or user that can freely access this account's loopback traffic must be treated as trusted, especially while real mode is unlocked.

### `GET /api/status`

Returns server version, startup time, current mode, real-mode lock state, sanitized `oj` availability/version, active object counts, and the Codeforces-only scope.

### `POST /api/source`

Accepts source bytes with file metadata headers. Allowed suffixes are `.c`, `.cc`, `.cpp`, `.cxx`, `.py`, `.py3`, `.java`, `.kt`, `.rs`, `.go`, `.js`, `.ts`, `.cs`, and `.swift`. It rejects unsupported names, empty files, and files above 1 MiB. The store holds at most eight sources and 4 MiB total, evicting expired entries before rejecting new input. It returns only an opaque `sourceId`, sanitized file name, inferred language, byte size, and the first 12 hexadecimal SHA-256 characters. Responses and logs never contain source text.

### `POST /api/preview`

Accepts `sourceId`, Codeforces problem URL, optional public handle, requested mode, and optional demo scenario. It returns normalized target/source metadata, tool state, expiry, and one opaque confirmation id. It does not submit.

### `POST /api/real-mode/unlock`

Accepts the exact phrase `我确认本次操作可能向 Codeforces 真实提交代码` and unlocks real mode for the current process only. Restarting returns to demo mode.

### `POST /api/confirm`

Consumes a confirmation exactly once and starts an asynchronous job. The confirmation is bound to the immutable source id and digest, normalized target, handle, mode, and demo scenario. A consumed, missing, mismatched, or expired confirmation cannot be replayed. It returns an opaque job id immediately.

### `GET /api/submissions/:jobId`

Returns a safe state from:

```text
created
submitting
queued
judging
accepted
rejected
unknown
failed
```

It may include normalized verdict, public URL/id, passed-test count, and a sanitized message. It never includes process output, cookies, credentials, or source.

### `POST /api/login-terminal`

Available only after real-mode unlock and only on Windows. It opens visible PowerShell with the fixed command:

```powershell
oj login https://codeforces.com/
```

The endpoint accepts no executable, URL, command, or argument fields.

## 7. Demo Mode

Demo mode is the startup mode and never calls `oj`, opens a terminal, or accesses Codeforces.

Supported deterministic scenarios:

- `accepted`: queued, judging, AC;
- `wrong_answer`: queued, judging, WA;
- `compile_error`: queued, judging, CE;
- `unknown`: queued, judging, bounded timeout to UNKNOWN;
- `login_required`: safe simulated failure before submission.

Demo timing is short and injectable in tests. Demo and real jobs share one public state representation.

## 8. Real Mode

Real mode remains locked until the current process receives the exact unlock phrase. A real preview visibly names the mode and one-submit consequence.

On confirmation:

1. Consume the confirmation before external work.
2. Copy the in-memory source into a random `.runtime/oj-console/<job-id>/` directory.
3. Invoke the existing safe `oj submit` adapter once.
4. Delete the temporary source in a `finally` block.
5. If submission is recognized and a handle exists, use bounded public polling.
6. Map timeout or ambiguity to UNKNOWN and never resubmit automatically.

No endpoint imports browser cookies, accepts a password, or exposes CAPTCHA solving.

## 9. State And Cleanup

All sources, previews, unlock state, and jobs live in memory and disappear at process stop. The source store has bounded entry count and byte total. Expired objects are pruned. Completed jobs retain only safe metadata until their terminal TTL or process exit.

At most 16 pending previews and 32 submission jobs are retained. Consumed confirmation tombstones expire, terminal jobs expire after ten minutes, and new entries trigger pruning before an explicit capacity error. The status endpoint caches the `oj --version` capability result for five seconds so page refreshes cannot create an unbounded process burst.

Temporary real-mode files live only below `.runtime/oj-console/`. Startup removes stale prototype directories from interrupted runs, and graceful shutdown removes the current directory.

## 10. Error Handling

The API uses stable JSON errors such as:

```json
{
  "error": {
    "code": "confirmation_expired",
    "message": "这次确认已过期，请重新生成预览。"
  }
}
```

Expected codes:

```text
invalid_request
unauthorized
origin_rejected
source_missing
source_too_large
target_invalid
real_mode_locked
tool_unavailable
confirmation_missing
confirmation_expired
confirmation_consumed
job_missing
login_terminal_unavailable
submission_failed
```

Unknown errors return a generic message. Stack traces, child output, source, and request bodies are not returned.

## 11. Tool-Console Frontend

The browser page is a dense local operations console. It shows mode, toolchain and session status, source metadata, URL/handle/scenario inputs, immutable preview metadata, a distinct one-use confirmation control, a state timeline, normalized verdict, and the no-auto-retry warning.

The browser file picker sends bytes directly to `/api/source` and never displays source text. Frontend code contains no comments.

## 12. Testing Strategy

Backend-first tests prove:

- localhost binding and startup-token enforcement;
- rejected origins/content types;
- source size/name/count/byte bounds;
- responses and logs do not contain a known source marker;
- exact demo state sequences without external calls;
- locked real mode until explicit unlock;
- rejected expiry, source change, and confirmation replay;
- at most one process invocation per confirmation;
- temporary deletion on success, failure, and timeout;
- fixed login command with no request-controlled arguments;
- UNKNOWN without retry for ambiguity;
- shutdown cleanup.

The PowerShell client is checked against demo AC, demo WA, expiry, and replay rejection. Later browser tests cover file selection, preview, unlock, confirmation removal, job polling, result rendering, and console errors.

No authenticated live submission runs in automated tests.

## 13. Acceptance Gates

Backend-first is ready when one command starts the API, the PowerShell client completes demo AC/WA, the API exposes all preview/result facts, safety tests pass, no frontend is required, and logs expose no source/token/raw output/credential.

The complete prototype is ready when the B-layout browser console completes the same demo flow, real mode stays visibly locked, visible Windows login works when `oj` is installed, a no-submit real preview is reachable, and tests/compile/hygiene/browser checks pass. Any remote submission remains a separate dedicated-account manual gate.

## 14. Non-Goals

- Platforms other than Codeforces;
- credential or cookie storage/import;
- CAPTCHA automation;
- unattended or automatic submission;
- automatic resubmission;
- persistent history;
- multi-user/network deployment;
- frontend framework adoption;
- production packaging of the prototype.

## 15. Evaluation And Disposal

After the user tries it, record whether the state model, confirmation boundary, login terminal, and console layout feel correct. Then either absorb validated behavior into the extension and delete the prototype, or keep a narrowly documented diagnostic harness. Do not leave an unowned second product surface.

## 16. Implementation Record

On 2026-07-14, the backend-first slice was completed on `codex/oj-login-prototype`.

Implemented units:

- bounded in-memory source storage and safe metadata;
- exact real-mode unlock and one-use confirmation records;
- deterministic demo jobs for AC, WA, CE, UNKNOWN, and login-required;
- one-shot real `oj` runner with bounded verdict polling and temporary-file cleanup;
- fixed visible PowerShell login launcher;
- token-authenticated localhost API with strict origin, type, and size checks;
- localhost server lifecycle, random session descriptor, stale cleanup, and graceful cleanup;
- PowerShell trial client and a C++ demo source.

Verified outcomes:

- the isolated backend suite passed 26 tests;
- the prototype TypeScript build passed;
- `npm run prototype:oj:backend` started a real localhost process;
- `npm run prototype:oj:try -- -SourcePath prototypes/oj-console/examples/demo-source.cpp -Yes` completed a demo submission with `state=accepted`, `verdict=AC`, and a non-empty 12-character source digest;
- no authenticated remote submission was attempted.

The completed backend construction checklist was removed after these results were recorded. The persistent design and this implementation record are the source of truth.

The tool-console frontend was then completed with the selected dense dark B layout. It receives the session token through the initial local document, removes it from the DOM after bootstrap, sends source bytes without rendering their content, and uses the same preview/confirmation/job contract as the PowerShell client. HTML, CSS, and browser JavaScript contain no source comments, enforced by a regression test.

Final verification on 2026-07-14:

- 86 test files and 297 tests passed under Vitest 3.2.7;
- the main extension build and dedicated prototype build passed;
- the PowerShell client completed a fresh demo AC and rejected a non-local runtime descriptor;
- a headless Chromium flow selected the demo source, checked the real-mode lock, generated a preview, consumed one confirmation, rendered `ACCEPTED / AC`, and reported no browser-console errors;
- `npm audit` reported zero vulnerabilities after compatible dependency updates;
- the beta VSIX packaged successfully with project hygiene passing, and the package inspection contained no prototype, prototype build config, browser-check script, or local `.superpowers` artifact;
- the frontend blocks foreign Host values, bounds confirmations/jobs, expires terminal records, and caches status tool checks;
- no live Codeforces login, CAPTCHA interaction, or remote submission was run.

The complete prototype remains an experimental repository harness. Its browser UI is not included in the VSIX; validated behavior can later be absorbed into the extension surface.
