# Current Gaps And Next Steps

Date: 2026-07-22

Status: internal project note after the existing feature branches were consolidated into one public beta candidate. This is not a public release note.

## What Is Working Well

- The extension now has a coherent beta core: AI coach, problem import, local learning profile, safe autocomplete, archive/recommendation flow, and internal testing hooks.
- Autocomplete and teaching context are separated by design. The autocomplete path only receives student code context and code habits, while problem statements and Teacher Pack-style context stay in explicit coaching flows.
- Luogu problem and training import have live endpoint coverage using `x-lentille-request: content-only`, including current `data.training` and `data.trainings` response shapes.
- OpenAI-compatible routing is now real enough for daily testing: analysis and autocomplete can use different models and different base URLs.
- DeepSeek v4 flash FIM autocomplete has a live proof path, and DeepSeek v4 pro teaching diagnosis can return valid JSON after raising JSON-response token budget.
- The project has meaningful regression coverage: unit tests, fixture-based longitudinal simulation, live model smoke tests, and VSIX install checks.
- Codex OAuth is implemented alongside API-key and compatible-provider routes, including browser/device login, model discovery, logout, and release-package coverage.
- One OJ broker now powers read-only search/import across Luogu, LeetCode, NowCoder, Codeforces, and AtCoder. The current author environment has a five-provider live smoke path; Codeforces intentionally remains metadata-only unless a statement arrives through Competitive Companion or Markdown.

## Current Shortcomings

### Product And UI

- Real OJ submission is implemented for Codeforces and AtCoder through a user-installed `online-judge-tools/oj`: trusted workspace, saved active file, strict per-platform URL parsing, two-minute single-use confirmation, one no-shell CLI invocation, and sanitized platform-matched result links. Codeforces can optionally use bounded public-verdict polling; AtCoder intentionally stops at `submitted` and links to the official submissions page. Both still need dedicated-account one-submit smoke tests before broader support claims. Luogu, LeetCode, NowCoder, and Kattis remain read-only in this extension. See [superpowers/specs/2026-07-21-multi-platform-oj-submission-design.md](superpowers/specs/2026-07-21-multi-platform-oj-submission-design.md).
- A standalone localhost OJ Console now provides a verified dark browser console and PowerShell client for the same preview/one-confirmation/job-state contract. Its demo path has an automated Chromium AC proof. The same console UI is also integrated into the extension as the `studentAutocomplete.openOjConsole` webview panel (message-bridge backend in `src/ojConsole/`, frontend assets shipped in the VSIX), verified at compile level only and still pending a real Extension Development Host walkthrough. The standalone server remains a repository-only evaluation harness, trusts a single-user local device, and has not passed the dedicated-account live submission gate. See [superpowers/specs/2026-07-14-oj-console-prototype-design.md](superpowers/specs/2026-07-14-oj-console-prototype-design.md).
- UI quality still depends too much on manual screenshots. There is no automated screenshot comparison or real VS Code webview interaction gate.
- The AI coach page is usable, but the information hierarchy still needs polish: current problem, session state, model state, and next action should be impossible to miss.
- Some historical entry points and command-palette commands still carry old naming such as `mimo` even when the active provider is DeepSeek or another OpenAI-compatible provider.
- The extension needs a clearer "current problem session" model so follow-up questions, completion review, learning score, and optimization all feel like one conversation instead of separate requests.

### Autocomplete

- Inline completion still lacks an end-to-end VS Code automation test. Unit tests prove routing and prompt shape, but not the real inline suggestion UI.
- The context extractor is Python-improved, but C/C++/Rust contest patterns have not received the same focused treatment.
- Latency and cache-hit behavior are not measured. The current system proves correctness, not whether autocomplete feels fast enough for daily use.
- DeepSeek FIM requires the beta `/completions` endpoint. The UI warns by configuration, but provider health checks should detect the common `/v1/completions` mistake before the user hits it.

### AI Configuration

- OpenAI-compatible mode supports separate analysis/autocomplete models and base URLs, but it still has only one saved API key lane. Mixed providers with different keys need a per-role secret design.
- Settings are mostly global. Workspace/folder-specific model routing should be supported deliberately, with clear precedence and UI copy.
- Provider names should be neutralized across CLI and UI. Runtime code should stop saying `mimo` for generic OpenAI-compatible requests.
- Model fetching exists, but provider-specific filtering and "recommended for autocomplete / recommended for analysis" labels need more real-world tuning.
- Codex OAuth is implemented but remains experimental. The UI must keep the account-risk note visible, and API-key/OpenAI-compatible routes must remain first-class alternatives.

### Problem Import And Problem Bank

- Luogu endpoints are unofficial and can drift again. The importer needs retries, response-shape telemetry, and a manual fallback that feels first-class rather than like an error path.
- LeetCode and NowCoder can use separately installed local adapters; they must degrade cleanly to Markdown import when those adapters are absent. Codeforces full statements still require Competitive Companion or Markdown.
- Manual Markdown import works better, but the authoring standard needs in-UI examples and validation feedback.
- Duplicate problem handling is safer now, but the UI needs visible delete/merge/reimport flows for failed imports and accidental duplicates.

### Teaching And Student Skill

- AI judgment is still an estimate, not OJ truth. The UI must keep saying `AI 估计` with confidence and evidence.
- Learning score needs more calibration against real user submissions. Bruteforce-vs-growth scoring is designed, but not yet validated across enough real attempts.
- Student Skill has correction and visibility foundations, but transfer evidence is still thin. "Skill ready" should not be treated as "student has learned it."
- Follow-up after completion should use the whole problem session to update the learning profile, not only the latest button click.

### Recommendation System

- Recommendation reasons exist, but the engine is not yet a strict rule engine over pain point, topic, difficulty, archive status, and transfer evidence.
- Luogu MCP/problem search is not fully integrated into the recommendation loop. Public problems should be preferred; generated micro-practice should stay clearly marked as synthetic.
- Difficulty-up logic needs hard gates: transfer success or repeated low-hint success should be required before moving up.

### Testing And Release

- Fixture 1000 is valuable, but synthetic. It proves parser and pipeline stability, not real learner improvement.
- Live model tests are still small because they are expensive and slow. The next harness needs resume, mismatch summaries, and cost accounting as first-class outputs.
- Beta release packaging now excludes engineering docs, scripts, source maps, internal-test modules, and local runtime data. Keep the CI, package inspection, fresh-profile install, and extension-host activation checks as release gates.
- Internal telemetry is local-only, but friend testing needs explicit consent wording and a "what is recorded" page before wider distribution.

## Future Work

### Near-Term Stabilization

- Keep Codeforces and AtCoder labeled experimental until dedicated-account smoke tests prove delegated login and one-submit behavior. AtCoder's current upstream Turnstile incompatibility must be treated as an availability failure, never bypassed. The Playwright feasibility probe remains research-only and is not production code.
- Rename legacy `mimo` CLI/runtime labels to neutral `ai` or `openai-compatible` labels.
- Add a visible provider health check: model list, chat smoke test, FIM smoke test, and clear endpoint/key/model errors.
- Add per-role API key support for OpenAI-compatible analysis and autocomplete.
- Add a "delete problem without archive" UI flow and a "merge duplicate/reimport" flow.
- Add a small VS Code webview smoke harness or Playwright-like screenshot workflow for the side panel.

### Beta 0.2 Product Polish

- Make `AI 教练` the undeniable main surface: current session, current file, model status, question box, coach output, and next recommended action.
- Treat `我已完成` as a session review: summarize what happened, update Student Skill, score learning value, then archive.
- Keep `我放弃了` as a lesson report: standard idea, key pain point, minimal repair path, hidden reference answer, remediation practice.
- Improve Markdown problem import with validation warnings, examples, and generated code-file creation in one flow.

### Codex OAuth Stabilization

- Keep Codex OAuth optional alongside API-key configuration.
- Recheck browser and device-code login whenever the experimental Codex app-server protocol changes.
- Keep signed-in, signed-out, login-in-progress, expired-session, and login-failed states understandable in the configuration UI.
- Preserve explicit sign-in, retry, and logout actions.
- Preserve the existing API-key and OpenAI-compatible provider paths; OAuth must not become a required dependency.
- Treat API keys and completed OAuth sessions as user-provided credentials. Credential provenance is outside this project's scope.
- Keep authentication credentials out of source control, packaged VSIX contents, logs, and diagnostics.

OAuth regression criteria:

1. A user can complete OAuth sign-in from the extension and see the connected account state.
2. The authenticated session can be used for the supported Codex model route.
3. Logout clears the active session and the UI returns to the signed-out state.
4. Existing API-key configuration and model calls continue to work unchanged.

### Self-Evolution Evaluation

- Add `--resume-from` and `--summary-out` to longitudinal live runs.
- Output mismatch pairs for pain point, primary pain point, skill candidate, recommendation, JSON parse retry, and provider error.
- Run staged calibration: fixture dry run, 100-call live smoke, 200-call live calibration, then optional larger batch.
- Measure whether transfer tasks need fewer hints after a skill becomes active. Do not use profile mutation alone as proof of learning.

### Release Readiness

- Keep three lanes separate:
  - beta: installable local test package;
  - beta release: clean public VSIX;
  - beta internal: friend test package with local recording.
- Before every public release, rerun package inspection and prove no `secrets/`, `.runtime/`, `.student-autocomplete/`, internal records, source maps, or research-only docs are inside the release VSIX.
- Keep the README promise clear: this is an algorithm learning coach, not an answer generator or official OJ.

## Next High-Value Slice

The highest-value next slice is AI configuration hardening:

1. Rename generic provider surfaces away from `mimo`.
2. Add per-role OpenAI-compatible API keys.
3. Add provider health checks.
4. Add a real inline autocomplete VS Code smoke test.
5. Repackage and install beta again in a fresh VS Code profile.

This would directly reduce the two most painful beta risks: "autocomplete silently does nothing" and "the UI says a provider is configured when the live route is actually broken."
