# Real OJ Submission And Interactive Login Design

Date: 2026-07-12

Status: approved overall design. Codeforces and AtCoder delegated-CLI slices are implemented; authenticated live submission remains an explicit manual gate. The concrete multi-platform contract is recorded in [2026-07-21-multi-platform-oj-submission-design.md](2026-07-21-multi-platform-oj-submission-design.md).

## 1. Decision

Student Autocomplete Lab will grow from AI-only pre-submit review into an opt-in real OJ submission workflow.

The product will use a hybrid adapter architecture:

- delegate to a mature external CLI when that platform is supported reliably;
- use a native session adapter only when login, submission, and verdict polling can be implemented without bypassing platform protections;
- keep every platform independently disableable so one broken adapter does not break the coach;
- require an explicit human confirmation for every real submission;
- feed normalized official verdicts into the existing teaching workflow without describing AI estimates as official results.

This design does not turn the extension into an autonomous contest agent. It adds a user-controlled transport from the current editor to the official judge.

## 2. Validated Feasibility

An isolated probe was run on 2026-07-12 in branch `codex/oj-login-prototype` using a fresh, visible Playwright browser session.

Observed behavior:

1. The first navigation to `https://codeforces.com/enter` returned HTTP 403 with the title `请稍候…`.
2. The same visible browser session completed the front-door verification and reached the Codeforces home page.
3. A second navigation in the same session reached the real `Login - Codeforces` page.
4. The login form exposed handle/email, password, remember-me, login, password recovery, and Gmail login controls.
5. No credentials were entered, no cookies were printed, and no submission was made.

This proves that a dedicated real-browser session can preserve the site state needed to move from a front-door graphical verification to the login page. It does not yet prove authenticated login, cookie reuse outside that browser, or real submission.

## 3. Product Experience

The sidebar gains an `OJ 提交` area for the active problem.

The user flow is:

1. Select or import a problem.
2. Open the source file that will be submitted.
3. Click `提交到 OJ`.
4. Review platform, problem id, language, file path, code size, and account.
5. Confirm the submission.
6. Complete login or human verification when required.
7. Watch queued and judging states in the sidebar.
8. Receive the official normalized verdict.
9. Ask the existing AI coach to explain the result or update the learning record.

The confirmation dialog is mandatory. There is no setting that silently removes it.

## 4. Architecture

The feature is split into small modules with a single responsibility.

| Component | Responsibility |
| --- | --- |
| `SubmissionCoordinator` | validates a request, selects an adapter, starts submission, polls, and emits state changes |
| `OjAdapterRegistry` | registers platform adapters and exposes their current capabilities |
| `OjSubmissionAdapter` | platform-specific login check, language mapping, submission, and status polling |
| `InteractiveLoginBroker` | coordinates native challenge, delegated CLI, OAuth/QR, or dedicated-browser login |
| `CredentialVault` | stores only opaque cookies/tokens in VS Code `SecretStorage` |
| `CliProcessHost` | invokes approved external CLIs with fixed arguments and sanitized output |
| `VerdictNormalizer` | converts platform-specific states into the shared verdict model |
| `SubmissionEventStore` | stores sanitized submission metadata and official verdict history locally |
| `TeachingWorkflowBridge` | converts a completed official verdict into the existing teaching context |

The core interface is shaped as follows:

```ts
export interface OjSubmissionAdapter {
  readonly platform: OjPlatform;
  capabilities(): Promise<OjAdapterCapabilities>;
  getAccountState(): Promise<OjAccountState>;
  beginLogin(request: OjLoginRequest): Promise<OjLoginChallenge>;
  completeLogin(response: OjLoginResponse): Promise<OjAccountState>;
  submit(request: OjSubmitRequest): Promise<OjRemoteSubmission>;
  poll(submission: OjRemoteSubmission): Promise<OjSubmissionStatus>;
  logout(): Promise<void>;
}
```

Platform code may not call the teaching model directly. The adapter returns facts; the existing teaching layer interprets those facts after submission has finished.

## 5. Shared State Model

Submission states are normalized to:

```text
draft
confirming
checking_account
awaiting_login
submitting
queued
judging
accepted
rejected
cancelled
failed
```

Official verdicts are normalized to:

```text
AC
WA
CE
RE
TLE
MLE
OLE
PE
PARTIAL
SKIPPED
UNKNOWN
```

The original platform status and submission URL are retained as sanitized metadata. The platform remains the source of truth.

## 6. Login Architecture

The extension presents one account surface, but each adapter declares one of four login modes.

### 6.1 Delegated CLI Login

Use this when a maintained CLI already owns the platform session.

- Codeforces and AtCoder prefer `online-judge-tools` when its current compatibility probe passes.
- Kattis prefers the official Kattis CLI and its user-managed configuration.
- The extension checks whether the executable exists and reports installation instructions when it does not.
- The extension does not read the CLI cookie jar.
- Submission continues through the same CLI so browser-bound cookies are not replayed through a different HTTP stack.

### 6.2 Native Challenge Login

Use this only for stable first-party login endpoints that return a challenge the extension can present safely.

Supported human interactions may include:

- image captcha displayed by the extension and typed by the user;
- email or SMS one-time code typed by the user;
- QR code displayed by the extension and scanned by the user;
- explicit token or application password supplied by the user.

The challenge response is held in memory, used once, and discarded. Passwords and one-time codes are never persisted.

### 6.3 Dedicated Visible Browser Login

Use this when the platform requires a real top-level browser for a front-door graphical verification.

- Open a visible, dedicated session rather than the user's normal browser profile.
- Let the user complete the verification and login manually.
- Keep login and submission in the same browser or delegated tool session when the platform binds cookies to browser state.
- Do not run hidden challenge solvers, fingerprint spoofing, CAPTCHA services, or repeated automated retries.
- Do not copy the website HTML into the webview or claim the webview is a full browser.

The feasibility probe confirms this route can reach the Codeforces login page after a 403 front-door verification. Production support still requires an authenticated probe and a platform-policy review.

### 6.4 Manual Credential Import

Manual token or cookie import is an advanced fallback, disabled by default.

- It must name the exact domain and expiry.
- The user must explicitly confirm that the credential belongs to their account.
- Browser database scraping is prohibited.
- Imported secrets are stored only in VS Code `SecretStorage` and can be deleted from the account UI.

## 7. Why The Whole Website Is Not Embedded

VS Code webviews are isolated application surfaces, not unrestricted browser tabs. External sites may block framing, require a top-level origin, or bind verification to a browser environment.

The design therefore moves the workflow into the extension, not the website itself:

- the extension owns account state, confirmation, progress, verdict history, and teaching integration;
- the real website appears only when a human verification requires a top-level browser;
- after verification, the adapter resumes the extension workflow;
- no arbitrary remote scripts are loaded into the main sidebar webview.

## 8. Platform Plan

| Platform | Initial route | Initial status | Notes |
| --- | --- | --- | --- |
| Codeforces | delegated `online-judge-tools`; dedicated-browser login probe | experimental | official API is used for public/status data where applicable, not for submission |
| AtCoder | delegated `online-judge-tools` | experimental | graphical verification must remain human-operated |
| Kattis | official Kattis CLI | preferred external adapter | token/config remains owned by Kattis CLI |
| Luogu | native session adapter with human challenge; external fallback | research required | no CAPTCHA bypass; adapter disables itself on response drift |
| LeetCode | region-specific native or delegated adapter | research required | international and China sites are separate capability records |
| Other judges | adapter contract | unsupported by default | added only after an explicit compatibility and policy review |

The UI never lists a platform as supported solely because an adapter file exists. Support requires a current capability probe.

## 9. Submission Flow

```text
active editor
  -> resolve problem and platform
  -> select account
  -> map editor language to judge language id
  -> show immutable confirmation summary
  -> verify workspace trust
  -> verify login/capability
  -> submit once
  -> receive remote submission identity
  -> poll with bounded backoff
  -> normalize final verdict
  -> store sanitized event
  -> offer AI explanation and learning update
```

The coordinator never resubmits automatically after an ambiguous network failure. It first checks whether the platform created a submission; if that cannot be proven, it reports `UNKNOWN` and asks the user to inspect before trying again.

## 10. Security And Privacy

- Real submission is disabled in untrusted workspaces.
- Every submission requires an explicit user confirmation.
- Adapter commands use fixed executable paths and argument arrays, never shell-concatenated source paths.
- Workspace settings cannot override executable paths in Restricted Mode.
- Cookies and tokens are stored in `ExtensionContext.secrets`, not settings, JSON, logs, or the repository.
- Secrets are scoped by platform, account, region, and adapter version.
- Passwords, captchas, and one-time codes are never persisted.
- Logs exclude source code, credentials, cookies, authorization headers, and raw response bodies.
- Browser profiles used for experimental login are dedicated to this extension and removable from the account UI.
- There is no access to the user's normal Chrome, Edge, or Firefox cookie databases.
- There is no CAPTCHA bypass, rate-limit evasion, mass submission, or hidden background submission.
- Contest mode disables AI completion and coaching by default and shows the relevant platform warning before submission.

## 11. Failure Handling

Adapters report stable error categories:

```text
adapter_unavailable
login_required
login_expired
human_verification_required
platform_changed
language_not_supported
problem_not_submittable
contest_not_joined
rate_limited
network_failed
submission_ambiguous
poll_timeout
permission_denied
```

`platform_changed`, repeated 403 responses, or unexpected login HTML opens a circuit breaker. The adapter becomes unavailable until a manual health check succeeds. Other adapters remain usable.

Polling uses bounded exponential backoff, supports cancellation, and stops after the configured judge window. A timeout is not converted to WA or failure.

## 12. Teaching Integration

The current AI pre-submit judgment remains available and clearly labeled `AI 估计`.

After a real submission:

- the official verdict is stored separately from the AI estimate;
- the teaching workflow receives platform, problem key, official verdict, passed-test count when public, and sanitized compiler/runtime feedback;
- hidden tests and unavailable source data are never fabricated;
- AC can trigger the existing learning score and optimization review;
- WA, CE, RE, TLE, or MLE can trigger a user-requested diagnosis;
- no teaching action automatically edits and resubmits the file.

## 13. Rollout

### Phase 0: Design And Probe

- maintain this architecture document;
- verify dedicated visible browser behavior without credentials or submissions;
- verify CLI availability and licensing;
- keep production code unchanged.

### Phase 1: Core Contracts And Dry-Run UI

- add typed adapter, account, submission, and verdict contracts;
- add a dry-run confirmation panel;
- add fake adapters and state-machine tests;
- add SecretStorage and Workspace Trust boundaries without real credentials.

Implementation note (2026-07-12): the Codeforces phase-1/2 slice now includes strict target parsing, a safe no-shell process host, user-installed `online-judge-tools` capability checks, a two-minute single-use confirmation tied to the saved editor version, delegated terminal login, and optional bounded public-verdict polling. It stores no credentials and does not include the earlier browser probe in production code.

### Phase 2: Delegated CLI Adapters

- support executable discovery and health checks;
- integrate Kattis CLI first because it has an official submission client;
- integrate Codeforces and AtCoder through a pinned, user-installed `online-judge-tools` contract;
- normalize verdicts and connect them to teaching records.

Codeforces and AtCoder are implemented in this phase and remain experimental until their manual dedicated-account smoke gates pass. Codeforces can optionally poll its public API. AtCoder ends at a confirmed `submitted` state and official submission link; it does not scrape or invent a verdict. Kattis remains a design target, not shipped support.

### Phase 3: Native Experimental Adapters

- research and implement Luogu login/submission behind an experimental flag;
- research LeetCode international and China adapters separately;
- ship an adapter only after authenticated manual testing and policy review.

### Phase 4: Reliability And Broader Support

- add multiple accounts with one active account per platform;
- add compatibility telemetry that remains local and contains no credentials;
- add adapter circuit breakers, migration, and expiry repair;
- add more platforms only through the same gate.

## 14. Verification Strategy

The production implementation requires:

- unit tests for every state transition and verdict mapping;
- contract tests using recorded, fully sanitized response shapes;
- process-injection tests proving executable arguments cannot be shell-expanded;
- SecretStorage tests proving no credential enters global state or workspace files;
- Workspace Trust tests proving submission is blocked in Restricted Mode;
- fake-clock tests for polling, cancellation, expiry, and retry bounds;
- manual authenticated smoke tests in a dedicated test account;
- a no-submit mode that reaches the final confirmation boundary without sending code;
- package-hygiene tests proving browser profiles, cookie jars, traces, and screenshots are excluded from VSIX and git.

No live authenticated test runs in CI.

## 15. Third-Party And GitHub Hygiene

External tools remain user-installed whenever practical.

- `online-judge-tools/oj` is MIT-licensed and credited in README and `THIRD_PARTY_NOTICES.md` when integration ships.
- Kattis CLI is credited with its source and license.
- If any third-party code is copied or bundled, its full copyright and license notice ship with the VSIX.
- Calling an external executable is documented separately from bundling its code.
- The project states that it is not affiliated with or endorsed by the supported OJ platforms.

## 16. Acceptance Gates

The feature is ready for a public beta only when all of these are true:

- a user can see exactly what file, problem, language, platform, and account will be used;
- a single confirmation causes at most one remote submission;
- official and AI-estimated verdicts cannot be confused in storage or UI;
- login secrets never appear in logs, settings, workspace files, packages, or git;
- a broken platform adapter disables itself without affecting autocomplete or coaching;
- every shipped platform has a documented login method, logout path, expiry behavior, and compatibility probe;
- contest warnings and AI restrictions are visible before a contest submission;
- the package passes compile, tests, hygiene, and manual dedicated-account smoke gates.

## 17. Documentation Maintenance Decision

Completed step-by-step execution plans are removed once their code has landed and the master architecture retains the durable decision. Requirements, architecture specifications, research evidence, internal-test evidence, security boundaries, and release documents remain in the repository.

This cleanup removes four completed plans from April and May 2026. Their implemented architecture remains documented in the master blueprint and current source tree.
