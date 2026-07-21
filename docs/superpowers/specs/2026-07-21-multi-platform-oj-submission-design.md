# Multi-Platform OJ Submission Design

Date: 2026-07-21

Status: Codeforces and AtCoder delegated-CLI paths are implemented behind explicit confirmation. Authenticated live submissions remain manual release gates. Luogu, LeetCode, Kattis, and all unregistered judges are rejected.

## 1. Product Boundary

The extension and the standalone localhost console expose one submission workflow without copying an OJ website into a webview.

The product owns platform selection, target validation, source identity, preview, one-use confirmation, job state, safe result rendering, and the handoff to the existing teaching workflow. A user-installed `online-judge-tools/oj` process owns the authenticated platform session and the single network submission.

The implementation does not read browser cookies, store an OJ password, solve a graphical challenge, load an arbitrary OJ page inside the extension, or retry an ambiguous submission automatically.

## 2. Shipped Capability Matrix

| Platform | Target form | Login | Submit | Result after CLI success |
| --- | --- | --- | --- | --- |
| Codeforces | `https://codeforces.com/contest/{id}/problem/{index}` or supported Gym form | visible `oj login https://codeforces.com/` terminal | one `oj submit` process | safe submission URL plus optional bounded public-API verdict lookup when a public handle is provided |
| AtCoder | `https://atcoder.jp/contests/{contest}/tasks/{task}` | visible `oj login https://atcoder.jp/` terminal | one `oj submit` process | terminal `submitted` state and a same-contest AtCoder submission URL; no verdict is invented |
| Luogu | none | none | rejected | unsupported |
| LeetCode | none | none | rejected | unsupported |
| Kattis and other judges | none | none | rejected | unsupported |

Codeforces and AtCoder remain experimental until each path passes a dedicated-account login and one-submit smoke test. Automated tests never log in or submit remotely.

## 3. Registry And Target Model

`src/submission/submissionTarget.ts` is the production registry. It is the only route from user text to a supported platform target.

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

Target parsing requires HTTPS, matches an exact host allowlist, accepts only concrete problem/task paths, drops query and fragment data during canonicalization, and rejects all unregistered hosts before any process starts. The selected UI platform must equal the platform parsed from the URL; the backend revalidates this even if a client is modified.

Adding another platform requires a typed target parser, a fixed capability record, output-sanitization rules, unit and contract tests, a human-operated login story, a licensing review for any external tool, and a dedicated-account smoke gate. Merely appearing in upstream tool documentation is not enough to list a platform as supported.

## 4. Confirmation And Source Identity

The VS Code surface requires a trusted workspace and a saved active file. The localhost console accepts only bounded source bytes through its local authenticated API. Neither surface renders or logs source text during the submission flow.

Preview creates an opaque confirmation record bound to:

- normalized platform target;
- immutable editor version or console source digest;
- file path/name, language, and byte size;
- optional Codeforces public handle;
- mode and demo scenario in the standalone console;
- creation and expiry time.

The record expires after two minutes, can be consumed once, and cannot be replayed after any bound value changes. Real mode in the standalone console additionally requires the process-local phrase `我确认本次操作可能向在线评测平台真实提交代码`.

## 5. Process Boundary

The process host invokes a fixed executable and argument array without a shell:

```text
oj submit --yes --no-open --wait 0 <canonical HTTPS target> <saved source path>
```

The executable is not bundled in either VSIX. Users install and maintain it separately. The extension does not expose a setting that replaces the executable or injects extra arguments.

Execution is time- and output-bounded. A timeout or ambiguous response produces a failure message that explicitly says there is no automatic retry. Raw stdout/stderr, source previews, cookies, and credentials are not stored. The parser returns a submission URL only when its host, contest, and path match the already validated target.

## 6. Login And Human Verification

Login opens a visible PowerShell terminal with one fixed command chosen by the registry:

```text
oj login https://codeforces.com/
oj login https://atcoder.jp/
```

The user completes all browser interaction and graphical verification exposed by the upstream tool. The project does not automate Codeforces front-door challenges or AtCoder Turnstile. Current upstream reports show that AtCoder may block the Selenium login used by `online-judge-tools`; if that happens, login is unavailable until the user follows a compatible upstream/manual session route. The extension must report the failure rather than bypass it.

No browser profile or cookie database is scraped. No account password, one-time code, CAPTCHA answer, cookie, or authorization header enters project storage or logs.

## 7. Result Semantics

The shared result types distinguish transport success from judge completion.

- `submitted`: the CLI confirmed one submission and a trusted submission URL was captured, but no official final verdict is available.
- `judged`: a supported official/public lookup returned a normalized verdict.
- `login_required`, `unavailable`, and `failed`: no success is claimed.

For Codeforces, an optional public handle allows bounded `user.status` polling matched by contest, problem index, language timing, and submission time. A timeout becomes `UNKNOWN`, never WA.

For AtCoder, the current adapter stops at `submitted` and links to the official submissions page. It does not scrape authenticated result HTML and does not reuse an `AC`, `WA`, or other demo verdict. The user checks the official page until a policy-safe status adapter is designed and tested.

## 8. Surfaces

The VS Code `OJ 提交` panel and standalone console use the same registry and backend contracts.

- Platform selection changes the example URL, handle field, login label, and result copy.
- The Codeforces handle is hidden and rejected for AtCoder.
- The standalone `/api/status` response publishes sanitized capability records.
- `/api/preview` validates the selected platform against the parsed target.
- `/api/login-terminal` accepts only a registered platform enum.
- Terminal jobs include `submitted` alongside judged and failure states.

The console remains a repository evaluation harness and is excluded from VSIX packages. Its HTML, CSS, and browser JavaScript remain free of source comments, with a regression test enforcing that constraint.

## 9. Verification And Release Gates

Automated gates:

- parser tests for canonical Codeforces and AtCoder targets plus wrong-host/path rejection;
- command-array and process-injection tests;
- output tests that reject foreign or wrong-contest URLs and never return raw CLI output;
- confirmation expiry, mutation, and replay tests;
- Codeforces polling and AtCoder no-poll state tests;
- API and webview message-contract tests for platform mismatch and fixed login targets;
- rendered localhost-console browser flow in demo mode;
- full compile, test, audit, packaging, and VSIX hygiene checks.

Manual gates, run only with a dedicated account and explicit user intent:

1. install a compatible `online-judge-tools` environment;
2. complete visible login and any human verification;
3. reach a real preview without sending code;
4. submit one harmless solution once;
5. prove no duplicate submission occurred;
6. verify the returned link and platform-specific result semantics;
7. log out or remove the upstream session according to upstream instructions.

Until those manual gates pass, documentation must say “experimental” and must not claim authenticated end-to-end support.

## 10. Upstream And Compatibility Record

The implementation delegates to the MIT-licensed [`online-judge-tools/oj`](https://github.com/online-judge-tools/oj) and its [`online-judge-api-client`](https://github.com/online-judge-tools/api-client). Upstream documents `oj login URL`, `oj submit URL FILE`, and submission support for Codeforces and AtCoder. Luogu and LeetCode are not present in the current supported-services table used for this implementation.

On 2026-07-21, an ignored Python 3.14 virtual environment was used only for a no-login/no-submit compatibility check. PyPI exposed `online-judge-tools 11.5.1`; it required `setuptools` to supply the removed `distutils` compatibility module. After that isolated dependency was added, `oj --version` reported `online-judge-tools 11.5.1` with `online-judge-api-client 10.10.1`, and `oj submit --help` listed AtCoder and Codeforces. The environment is not committed or packaged.

The upstream AtCoder Turnstile limitation is tracked in [`online-judge-tools/oj#934`](https://github.com/online-judge-tools/oj/issues/934). It is treated as an availability limitation, not an invitation to build a challenge bypass.

## 11. Implementation Record

The multi-platform slice was developed on `codex/multi-platform-oj-submit` from the integrated beta branch.

Implementation commits:

- `b3f5c4e feat: register AtCoder submission targets`;
- `a7aa399 feat: submit AtCoder through OJ backend`;
- `f16f8ec feat: expose AtCoder submission controls`.

The first commit added the strict target registry. The second generalized confirmation, jobs, login, CLI submission, and safe result handling. The third exposed platform selection in both the standalone console and the VS Code sidebar while preserving the established frontend design and comment-free frontend-source rule.

No account credentials were entered, no graphical verification was automated, and no live OJ submission was made during implementation.
