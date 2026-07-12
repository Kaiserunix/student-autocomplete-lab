# Friend Internal Test Build

Status: local-only private testing build.

Date: 2026-05-03

## Purpose

The internal build is for giving a few friends a simple beta to try while collecting enough local evidence to improve the teaching loop. It is intentionally separate from the clean beta release candidate.

Do not upload this VSIX to GitHub releases, package registries, or any public extension marketplace.

## Separation From Public Beta

| Item | Public beta | Internal friend test |
| --- | --- | --- |
| Package name | `student-autocomplete-lab` | `student-autocomplete-lab-internal` |
| Display name | `Student Autocomplete Lab` | `Student Autocomplete Lab 内测记录版` |
| View prefix | `studentAutocomplete` | `studentAutocompleteInternal` |
| VSIX path | `.runtime/student-autocomplete-lab-0.1.0-beta.1.vsix` | `.runtime/student-autocomplete-lab-0.1.0-beta.1-internal.1.vsix` |
| Extra records | off by default | on by package name |
| Release status | beta candidate | private local test only |

## What It Records

The internal build writes local JSONL events named `internalTestEvents.jsonl` under VS Code extension global storage. The sidebar shows the exact path in the `内测记录版` panel.

Events may include:

- extension activation and autocomplete request status;
- AI coach actions, hint type, model, pain points, and skill merge counts;
- lesson reports, AC-after learning scores, optimization reviews, and AI submission checks;
- recommendation counts and target difficulty;
- user correction notes from `学习画像`;
- workspace folder path.

It does not automatically upload records. The records can still contain personal or privacy-sensitive information, so do not publish raw JSONL files.

## Build

```powershell
npm run package:internal
```

This command compiles the extension, stages a rewritten package under `.runtime/internal-vsix/`, changes contribution ids to `studentAutocompleteInternal`, and writes the internal VSIX to `.runtime/`.

## Install For Friend Testing

```powershell
code --install-extension .runtime\student-autocomplete-lab-0.1.0-beta.1-internal.1.vsix --force
code -n "<your practice workspace>"
```

The friend-testing checklist should record:

- 20 real problems, including 10 input/output or array problems and 10 recursion or tree problems;
- at least 3 `我放弃了` lesson reports;
- at least 5 learning scores after AC or attempted completion;
- at least 5 user corrections in `学习画像`;
- whether the next-problem recommendation felt reasonable.

## Summarize Local Records

After a test session, either click `复制摘要` in the sidebar or run:

```powershell
npm run internal:test-report -- --events "<path shown in 内测记录版 panel>" --format markdown
```

Share summaries first. Keep raw JSONL private unless the tester has explicitly agreed to share it.
