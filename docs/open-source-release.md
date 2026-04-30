# Open Source Release Notes

Status: alpha-ready for personal inner testing and open-source feedback.

Date: 2026-04-30

## 1. What Is Being Released

This project is a VS Code extension prototype for algorithm-study coaching:

- small inline autocomplete that avoids reading the pasted problem statement;
- Chinese-first sidebar for problem import, problem search, AI interaction, and attempt archiving;
- Luogu problem/training import and search adapters;
- OpenAI, OpenAI-compatible, and Anthropic Messages style model configuration;
- MiMo-powered diagnosis, lesson, solution-score, optimization, and self-evolution trials.

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

Recommended routing for a public alpha:

- autocomplete: `dsv4f`, because high-frequency completion should be fast and cheap;
- analysis/teaching: `dsv4pro`, because diagnosis, scoring, and optimization need stronger reasoning;
- MiMo: useful for ongoing experiments and for giving the MiMo team high-frequency coding/coaching traffic.

The extension UI and `secrets/models.env` support three compatibility lanes: OpenAI, OpenAI-compatible, and Anthropic-native Messages format.

## 4. Included Documentation

- [README.md](../README.md): quick start, development commands, and current limitations.
- [self-evolving-plugin-plan.md](self-evolving-plugin-plan.md): long-form design for pain-point driven skill evolution.
- [problem-search-mcp.md](problem-search-mcp.md): problem-search MCP direction.
- [internal-testing.md](internal-testing.md): live MiMo internal test evidence.

## 5. Internal Test Evidence

The release evidence is summarized in [internal-testing.md](internal-testing.md).

Raw JSON traces stay local under `.runtime/` and are intentionally ignored by git. The docs record commands, model, scores, and interpretation so the public repository gets reproducible evidence without leaking local data.

Long-run MiMo experiments are published as sanitized aggregate evidence. They are useful alpha signals for the diagnosis and skill-evolution loop, but they are not a broad benchmark or a guarantee of student learning outcomes.

## 6. Packaging

Package command:

```powershell
npm run compile
npx --yes @vscode/vsce package --no-dependencies --out .runtime\student-autocomplete-lab-0.0.1.vsix
```

The VSIX artifact is intentionally written to `.runtime/` and ignored by git.
