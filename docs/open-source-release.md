# Open Source Release Notes

Status: beta-candidate for personal inner testing and open-source feedback.

Date: 2026-05-03

## 1. What Is Being Released

This project is a VS Code extension beta candidate for algorithm-study coaching:

- small inline autocomplete that avoids reading the imported problem statement;
- Chinese-first sidebar with `AI 教练` as the first screen, plus `题目` and `学习画像`;
- Luogu problem/training import and search adapters;
- OpenAI, OpenAI-compatible, and Anthropic Messages style model configuration;
- MiMo-powered diagnosis, lesson, solution-score, optimization, and self-evolution trials.
- hidden Teacher Pack generation/cache for full problem imports;
- inspectable Student Skill / 学习画像 with user correction, disable, and rollback controls;
- transfer-validation and longitudinal trials that test ready skills against unseen same-family cases.

## 2. Open Source Degree

The project is released under the MIT License.

That means other people can use, fork, modify, redistribute, publish, sublicense, and use it commercially, as long as they keep the copyright and license notice. It also means there is no warranty: users are responsible for their own model keys, data, platform usage, and learning outcomes.

The repository should not include:

- API keys or local `secrets/models.env`;
- local runtime records under `.runtime/`;
- user-specific `.student-autocomplete/` learning ledgers;
- bulk-downloaded full problem statements as bundled data.

## 3. Model Rationale

The current implementation was tested with MiMo because I received MiMo quota and wanted to use real model calls rather than only fixtures. MiMo remains supported as an OpenAI-compatible provider.

Recommended routing for a public beta:

- autocomplete: `dsv4f`, because high-frequency completion should be fast and cheap;
- analysis/teaching: `dsv4pro`, because diagnosis, scoring, and optimization need stronger reasoning;
- MiMo: useful for ongoing experiments and for giving the MiMo team high-frequency coding/coaching traffic.

The extension UI and `secrets/models.env` support three compatibility lanes: OpenAI, OpenAI-compatible, and Anthropic-native Messages format.

## 4. Included Documentation

- [README.md](../README.md): quick start, development commands, and current limitations.
- [self-evolving-plugin-plan.md](self-evolving-plugin-plan.md): long-form design for pain-point driven skill evolution.
- [beta-v2-final-goals.md](beta-v2-final-goals.md): final beta target and Student Skill distillation gates.
- [problem-search-mcp.md](problem-search-mcp.md): problem-search MCP direction.
- [internal-testing.md](internal-testing.md): live MiMo internal test evidence.

## 5. Internal Test Evidence

The release evidence is summarized in [internal-testing.md](internal-testing.md).

Raw JSON traces stay local under `.runtime/` and are intentionally ignored by git. The docs record commands, model, scores, and interpretation so the public repository gets reproducible evidence without leaking local data.

Live chat-model calls write provider-reported token usage to `.runtime/chat-completions-usage.jsonl`. This keeps cost accounting grounded in returned `prompt_tokens`, `completion_tokens`, and `total_tokens` instead of estimates.

Long-run MiMo experiments are published as sanitized aggregate evidence. They are useful alpha signals for the diagnosis and skill-evolution loop, but they are not a broad benchmark or a guarantee of student learning outcomes.

Teacher Packs are internal references. They may contain standard-solution reasoning, expected complexity, invariants, pitfalls, counterexamples, and brute-force suitability, but they are cached for diagnosis and not displayed to students as the default answer.

## 6. Packaging

Full local beta test package command:

```powershell
npm run package:beta
```

This package keeps full project features and engineering material for trusted local testing. It is intentionally written to `.runtime/` and ignored by git; it is not the clean public release artifact.

Clean beta release package command:

```powershell
npm run package:beta-release
```

The clean package is staged separately, uses `student-autocomplete-lab-beta-release`, and excludes engineering docs, internal-test code, trial CLIs, source maps, secrets, runtime traces, and local records.

There is also a private local friend-testing build:

```powershell
npm run package:internal
```

That build has a different package name and contribution prefix, enables local JSONL recording, and is not part of the open-source release artifact.

## 7. Beta Gate Summary

The beta should be presented as an algorithm coach, not an automatic solver:

- autocomplete is intentionally narrow and excludes problem statements, Teacher Packs, and standard answers;
- AI submission checks are labeled as AI estimates, not official OJ results;
- `学习画像` is local, inspectable, correctable, and rollbackable;
- large-scale growth simulation uses 200 synthetic problem slots and 1000 preset code samples before any full live-model spend;
- raw personal traces, model keys, and downloaded full statements remain outside the repository.
