# Student Autocomplete Lab

This folder is a small Codex-ready brief for building a student-friendly code completion tool.

The goal is not to build another full agent IDE. The goal is a narrow autocomplete layer that helps with typing and local style recall while preserving the student's own thinking.

This is now prepared as an MIT-licensed open-source alpha. The public repo should contain code, docs, tests, and summarized experiment evidence; local model keys, raw runtime traces, and personal learning ledgers stay ignored.

## Core Direction

- Build code completion only, not a full vibe-coding agent.
- Keep Xiaomi MiMo supported because the first real experiments used MiMo quota.
- Recommended public routing: `dsv4f` for high-frequency autocomplete, `dsv4pro` for teaching analysis and optimization review.
- Support OpenAI, OpenAI-compatible, and Anthropic-native provider modes.
- Keep completions small: usually 1 to 3 lines.
- Avoid generating full problem solutions by default.
- Learn user habits transparently and store them as editable local skills.

## Folder Contents

- `docs/requirements.md`: product requirements and guardrails.
- `docs/codex-start-prompt.md`: prompt to give Codex for the first build attempt.
- `docs/open-source-release.md`: release notes, open-source scope, model rationale, and package command.
- `docs/internal-testing.md`: summarized live MiMo journey-test evidence.
- `secrets/models.env`: local API credentials and model routing. This is ignored by git.

## Current Build Target

The first implementation is now a VS Code extension prototype.

It starts with:

1. A VS Code sidebar for a local problem bank.
2. Luogu starter problem metadata from the supplied problem list.
3. Public Luogu problem import through `GET /problem/:pid` with `x-lentille-request: content-only`.
4. Public Luogu problem-set import through `GET /training/:id` with `x-luogu-type: content-only`.
5. Luogu keyword search for problems and problem sets.
6. Manual paste fallback for problem statements.
7. A local JSONL store for imported/manual problems and imported problem sets.
8. Safe autocomplete prompt/filter modules that do not include problem statements.

LeetCode support is planned as an adapter. Until a stable GraphQL path is wired, LeetCode problems should be pasted manually.

## Development

Install dependencies:

```powershell
npm install
```

Run tests:

```powershell
npm test
```

Compile the extension:

```powershell
npm run compile
```

Run a live MiMo autocomplete trial:

```powershell
npm run trial:mimo
```

Compare a specific MiMo model:

```powershell
npm run trial:mimo -- --model mimo-v2.5
npm run trial:mimo -- --model mimo-v2-omni
```

The trial reads `secrets/models.env`, calls the MiMo OpenAI-compatible `/v1/completions` endpoint, and prints only the provider, model, and filtered completion. It does not print API keys.

Run the self-evolution teaching loop without spending model calls:

```powershell
npm run trial:self-evolution -- --provider fixture
npm run trial:self-evolution-eval -- --provider fixture
```

Run the same evaluation against live MiMo 2.5:

```powershell
npm run trial:self-evolution-eval -- --provider mimo
```

The eval prints pain-point, primary-pain-point, recommendation, skill-candidate, and perfect-step accuracy. It also writes prompt-patch candidates only for real pain-point drift.

Run the Luogu 100-116 journey trial with one carried student profile:

```powershell
npm run trial:mimo-journey -- --runs 3 --profile-mode carry
```

This calls the configured teaching model, imports Luogu training sets `100` through `116`, simulates staged wrong submissions, runs AC-after optimization review, and checks whether repeated pain points become ready skills.

Add transfer validation after skills become ready:

```powershell
npm run trial:mimo-journey -- --runs 3 --profile-mode carry --transfer-check
```

Transfer validation picks unseen same-skill cases from the expanded long set after a skill is marked ready. It records per-step token `usage`, transfer pass rate, and estimated hint reduction without pretending this is a real human-learning proof.

Run a GPT practice-generation dry run:

```powershell
npm run trial:gpt-practice
```

The GPT practice trial is for generating audited practice material: a reference solution, plausible wrong submissions, pain-point labels, and a conservative skill-update candidate. It defaults to `gpt-4.1-nano`, estimates cost before any request, and does not spend money by default.

To allow a real paid request, set `OPENAI_API_KEY` and pass an explicit spend flag:

```powershell
$env:OPENAI_API_KEY="..."
npm run trial:gpt-practice -- --spend --max-usd 0.02
```

Useful overrides:

```powershell
npm run trial:gpt-practice -- --model gpt-5-nano --max-usd 0.02
npm run trial:gpt-practice -- --problem-id P1427 --pain-points output_order,loop_boundary
```

Run a no-key Codex-subagent practice sample:

```powershell
npm run trial:codex-practice
```

This reads `fixtures/practice/P1427.codex.json`, validates it with the same practice report parser, and prints a pain-point summary. It is useful when no OpenAI API key is available and we want to test the learning loop with Codex-generated samples.

Run the first binary-tree practice pack:

```powershell
npm run trial:binary-tree
```

This verifies `P4913`, `P1030`, and `P1364` against small local teaching oracles. It runs the reference solution and wrong submissions, then emits verified pain-point events such as `depth_definition`, `subtree_boundary`, and `weighted_cost`.

Write verified events to a local JSONL ledger:

```powershell
npm run trial:binary-tree -- --write-events .student-autocomplete/learning_events.jsonl
```

Run a MiMo-powered teaching diagnosis trial:

```powershell
npm run trial:mimo-teacher
```

The teaching trial turns one verified wrong submission into a student attempt, sends the evidence to the teacher diagnosis layer, updates `.runtime/student_profile.json`, and returns a hint, pain-point diagnosis, skill candidate, and recommendation. It uses `mimo-v2.5` by default, including when `MIMO_CHAT_MODEL=mimo-v2.5-pro` is configured; otherwise it falls back to a deterministic local stub.

Useful overrides:

```powershell
npm run trial:mimo-teacher -- --provider stub
npm run trial:mimo-teacher -- --provider live --wrong-index 1
npm run trial:mimo-teacher -- --fixture fixtures/practice/P4913.codex.json --wrong-index 2
```

To try the extension in VS Code, open this folder, press `F5`, and choose `Run Student Autocomplete Extension`. The extension host opens `.student-autocomplete-smoke/main.py`. Put the cursor after the indentation in `def add(a, b):` and trigger inline completion. The activity bar also shows `Student Autocomplete`, with a `Problem Bank` sidebar.

Current inner-test boundary:

- Inline autocomplete is usable for local code-continuation smoke tests.
- Problem statements saved in the sidebar are not included in autocomplete prompts.
- The Chinese sidebar separates problem import/search, AI interaction, archived attempts, lesson reports, solution scoring, and optimization review.
- Imported/pasted full problems can generate a hidden Teacher Pack with standard approach, expected algorithm, complexity, invariants, pitfalls, counterexamples, and brute-force suitability. The pack is cached and used as diagnosis reference, not shown as the default student answer.
- Teaching diagnosis and self-evolution are usable enough for personal alpha testing; see `docs/internal-testing.md` for live MiMo evidence.

## Source Policy

Luogu problem import is best-effort from the public problem JSON endpoint. Luogu problem and problem-set search use the public list endpoints. Luogu problem-set import is best-effort from the public training JSON endpoint.

Problem-set import stores the set title, description, and problem metadata. It does not automatically fetch the full statement for every problem in the set; individual full statements can be imported through the problem endpoint when needed.

Search matters for the learning loop: future recommendation code can query nearby problems by keyword, concept, or pain-point label instead of relying only on the fixed seed list.

## MiMo Trial Notes

The first live trial showed that `mimo-v2.5-pro` responds well to prefix-only autocomplete prompts. XML/FIM-style prompts with both prefix and suffix returned an empty completion in testing, even though the request succeeded. The current MiMo path therefore uses a prefix-completion prompt and relies on the post-filter to stop after the first local continuation.

Model notes from local trials:

- `mimo-v2.5-pro`: keep available for richer comparison trials, not the default high-frequency path.
- `mimo-v2.5`: current default for inline autocomplete and teaching diagnosis. It works on the simple add-function case and gives the MiMo team useful high-frequency autocomplete traffic.
- `mimo-v2-omni`: can complete the simplest sample, but returned a cursor placeholder on a slightly more OJ-like loop sample. Keep it for multimodal/problem-understanding experiments, not default inline completion.
- TTS models are voice models and should not be used for code autocomplete.

The extension should not do login bypass, CAPTCHA bypass, or rate-limit evasion. It should cache local records and prefer user-initiated imports.

Longer MiMo journey-test summaries are in `docs/internal-testing.md`. They are published as sanitized aggregate evidence only; raw JSON traces, API credentials, local runtime files, and personal learning records remain excluded.

## Open Source Alpha

License: MIT.

Open-source degree in plain language: other people can use, fork, modify, redistribute, publish, sublicense, or use the project commercially, as long as they keep the copyright and MIT license notice. There is no warranty, and model keys/problem data are the user's responsibility.

Package a local VSIX:

```powershell
npm run compile
npx --yes @vscode/vsce package --no-dependencies --out .runtime\student-autocomplete-lab-0.0.1.vsix
```
