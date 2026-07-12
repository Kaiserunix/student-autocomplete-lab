# Student Autocomplete Lab

Student Autocomplete Lab is a Chinese-first VS Code algorithm coach for students practicing Luogu, LeetCode, and similar contest-style problems. Beta English support covers the main sidebar shell, explicit English AI-output mode, and English Markdown problem import.

It is not an automatic problem solver or OJ submitter. The beta goal is a restrained loop: safe short autocomplete for the student's own code, explicit AI coaching only after the student asks, and a local `学习画像` that records repeated pain points, useful skills, user corrections, and rollbackable versions.

This repository is prepared as an MIT-licensed open-source beta candidate. Public code, docs, tests, and summarized experiment evidence belong in git; API keys, raw runtime traces, full problem-statement caches, and personal learning ledgers stay ignored.

## Beta Shape

- `AI 教练`: the first screen, used for hints, deeper hints, giving up into a lesson report, AI-estimated submission checks, AC-after learning scores, optimization review, archiving, and next-problem recommendations.
- `题目`: import Markdown problem files, search/import Luogu problems and training sets, and create starter files for Python, C, C++, Rust, or other configured templates.
- `学习画像`: an inspectable Student Skill model showing active skills, candidate pain points, disabled judgments, user corrections, and recent rollback snapshots.
- `安全补全`: inline completion reads only local student-code context and safe code habits; it must not read the imported problem statement, Teacher Pack, or standard answer.
- `English beta`: switch the sidebar shell to English, choose `English` for AI output, and import English Markdown using headings such as `Problem Statement`, `Input`, `Output`, `Example`, `Constraints`, and `Notes`.

## Core Direction

- Build an algorithm-learning coach, not a full vibe-coding agent.
- Keep Xiaomi MiMo supported because the first real experiments used MiMo quota.
- Recommended public routing: `dsv4f` for high-frequency autocomplete, `dsv4pro` for teaching analysis and optimization review.
- Support OpenAI, OpenAI-compatible, and Anthropic-native provider modes.
- Keep Chinese as the most complete UI language while making the English path usable for beta testers.
- Keep completions small: usually 1 to 3 lines.
- Avoid generating full problem solutions by default.
- Learn user habits transparently and store them as editable local skills.

## Folder Contents

- `docs/requirements.md`: product requirements and guardrails.
- `docs/codex-start-prompt.md`: prompt to give Codex for the first build attempt.
- `docs/beta-v2-final-goals.md`: final beta target, including Student Skill distillation requirements.
- `docs/superpowers/specs/2026-07-12-oj-submission-design.md`: approved hybrid architecture for user-confirmed real OJ submission and interactive login.
- `docs/large-scale-growth-simulation.md`: costed plan for the 200-problem / 1000-code growth simulation.
- `docs/open-source-release.md`: release notes, open-source scope, model rationale, and package command.
- `docs/release-lanes.md`: three VSIX lanes: beta, clean beta release, and private internal test.
- `docs/internal-testing.md`: summarized live MiMo journey-test evidence.
- `docs/friend-internal-test-build.md`: local-only friend-testing build with extra recording, not for GitHub or public release.
- `secrets/models.env`: local API credentials and model routing. This is ignored by git.

## Current Build Target

The first implementation is now a VS Code extension prototype.

It starts with:

1. A VS Code sidebar for a local problem bank.
2. Luogu starter problem metadata from the supplied problem list.
3. Public Luogu problem import through `GET /problem/:pid` with `x-lentille-request: content-only`.
4. Public Luogu problem-set import through `GET /training/:id` with `x-luogu-type: content-only`.
5. Luogu keyword search for problems and problem sets.
6. Manual Markdown-file import fallback for custom problem statements.
7. A local JSONL store for imported/manual problems and imported problem sets.
8. Safe autocomplete prompt/filter modules that do not include problem statements.

LeetCode support is planned as an adapter. Until a stable GraphQL path is wired, LeetCode problems should use the manual Markdown-file import path.

Real OJ submission is designed but not implemented in the current beta. The approved design uses explicit confirmation, per-platform adapters, delegated CLI support where practical, and human-operated verification without browser-cookie scraping or CAPTCHA bypass.

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

Package the full local beta test build:

```powershell
npm run package:beta
```

Package the clean beta release candidate:

```powershell
npm run package:beta-release
```

Package the separate friend-testing build with local records enabled:

```powershell
npm run package:internal
```

The release lanes use different extension ids and view prefixes. `beta release` is the clean public candidate; `beta 内测版` is for local friend testing only, writes extra records to VS Code global storage, and must not be published or pushed as a release artifact.

Run the local hygiene gate before publishing the clean beta release or sharing a private test package:

```powershell
npm run check:hygiene
```

This checks that secrets, runtime traces, local practice files, and personal learning records stay ignored by git. If the clean beta-release staging tree exists, it also scans for blocked engineering, internal-test, source-map, secret, and local-path content.

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

Live chat-model calls also append provider-reported token usage to `.runtime/chat-completions-usage.jsonl`. The log records model name, provider format, sanitized base URL, and prompt/completion/total tokens; it does not record API keys.

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

The teaching trial turns one verified wrong submission into a student attempt, sends the evidence to the teacher diagnosis layer, updates `.runtime/student_profile.json`, and returns a hint, pain-point diagnosis, skill candidate, and recommendation. It respects the configured teaching model and falls back to a deterministic local stub when live MiMo is not requested.

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
- Imported full problems can generate a hidden Teacher Pack with standard approach, expected algorithm, complexity, invariants, pitfalls, counterexamples, and brute-force suitability. The pack is cached and used as diagnosis reference, not shown as the default student answer.
- Teaching diagnosis and self-evolution are usable enough for personal alpha testing; see `docs/internal-testing.md` for live MiMo evidence.
- The final beta target is now defined as a local, inspectable, rollbackable `Student Skill` loop; see `docs/beta-v2-final-goals.md`.
- The first beta v2 code slice persists AI-coach diagnosis into `studentSkill.json` and archives version snapshots beside the legacy `studentProfile.json`.

## Source Policy

Luogu problem import is best-effort from the public problem JSON endpoint. Luogu problem and problem-set search use the public list endpoints. Luogu problem-set import is best-effort from the public training JSON endpoint.

Problem-set import stores the set title, description, and problem metadata. It does not automatically fetch the full statement for every problem in the set; individual full statements can be imported through the problem endpoint when needed.

Search matters for the learning loop: future recommendation code can query nearby problems by keyword, concept, or pain-point label instead of relying only on the fixed seed list.

## MiMo Trial Notes

The first live trial showed that `mimo-v2.5-pro` responds well to prefix-only autocomplete prompts. XML/FIM-style prompts with both prefix and suffix returned an empty completion in testing, even though the request succeeded. The current MiMo path therefore uses a prefix-completion prompt and relies on the post-filter to stop after the first local continuation.

Model notes from local trials:

- `mimo-v2.5-pro`: currently the more reliable live teaching/comparison model in local tests.
- `mimo-v2.5`: useful as a cheaper high-frequency experiment path when the upstream endpoint is healthy.
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
npx --yes @vscode/vsce package --out .runtime\student-autocomplete-lab-0.1.0-beta.1.vsix
```
