# Current Gaps And Next Steps

Date: 2026-07-12

Status: internal project note after the DeepSeek autocomplete and Luogu training import repair. This is not a public release note.

## What Is Working Well

- The extension now has a coherent beta core: AI coach, problem import, local learning profile, safe autocomplete, archive/recommendation flow, and internal testing hooks.
- Autocomplete and teaching context are separated by design. The autocomplete path only receives student code context and code habits, while problem statements and Teacher Pack-style context stay in explicit coaching flows.
- Luogu problem and training import have live endpoint coverage using `x-lentille-request: content-only`, including current `data.training` and `data.trainings` response shapes.
- OpenAI-compatible routing is now real enough for daily testing: analysis and autocomplete can use different models and different base URLs.
- DeepSeek v4 flash FIM autocomplete has a live proof path, and DeepSeek v4 pro teaching diagnosis can return valid JSON after raising JSON-response token budget.
- The project has meaningful regression coverage: unit tests, fixture-based longitudinal simulation, live model smoke tests, and VSIX install checks.

## Current Shortcomings

### Product And UI

- Real OJ submission is not implemented. The approved hybrid design uses explicit confirmation, delegated CLI adapters where practical, experimental native adapters for Luogu and LeetCode, and human-operated graphical verification. See [superpowers/specs/2026-07-12-oj-submission-design.md](superpowers/specs/2026-07-12-oj-submission-design.md).
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

### Problem Import And Problem Bank

- Luogu endpoints are unofficial and can drift again. The importer needs retries, response-shape telemetry, and a manual fallback that feels first-class rather than like an error path.
- LeetCode is still effectively manual paste/import for beta. GraphQL integration remains unstable and should not be promised.
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
- Beta package is installable, but beta release packaging hygiene is not done. Public release must exclude docs, scripts, source maps, internal testing modules, runtime data, and any AI/research-only notes.
- Internal telemetry is local-only, but friend testing needs explicit consent wording and a "what is recorded" page before wider distribution.

## Future Work

### Near-Term Stabilization

- Keep real OJ submission in Phase 0 design/probe until authenticated dedicated-account testing proves login continuity and one-submit safety; do not ship the Playwright probe as production code.
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
- Before any public release, run package inspection and prove no `secrets/`, `.runtime/`, `.student-autocomplete/`, internal records, source maps, or research-only docs are inside the release VSIX.
- Update README with a short promise: this is an algorithm learning coach, not an answer generator or official OJ.

## Next High-Value Slice

The highest-value next slice is AI configuration hardening:

1. Rename generic provider surfaces away from `mimo`.
2. Add per-role OpenAI-compatible API keys.
3. Add provider health checks.
4. Add a real inline autocomplete VS Code smoke test.
5. Repackage and install beta again for `C:\Users\qwerf\Desktop\Source\leetcodepy`.

This would directly reduce the two most painful beta risks: "autocomplete silently does nothing" and "the UI says a provider is configured when the live route is actually broken."
