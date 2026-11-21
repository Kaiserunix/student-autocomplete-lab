# Documentation Index

Map of all documentation files in `student-autocomplete-lab`, verified against `src/`, `package.json`, `scripts/`, and `test/`.

## Root Documents

| Document | Purpose | Status |
| --- | --- | --- |
| [README.md](../README.md) | User-facing overview, quick start, features, and developer commands | Active |
| [README.release.md](../README.release.md) | Clean beta-release VSIX README copied into packaged releases by `scripts/packageBetaReleaseVsix.js` | Active |
| [MANUAL-ACCEPTANCE.md](../MANUAL-ACCEPTANCE.md) | Live VS Code manual acceptance checklist (provider health, Ghost Text, coaching session, OJ Console) | Active |
| [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) | Bundled dependency licenses and `online-judge-tools/oj` attribution | Reference |

## Core Documentation (`docs/`)

| Document | Purpose | Status |
| --- | --- | --- |
| [INDEX.md](INDEX.md) | Canonical documentation map and lifecycle status index | Active |
| [PRODUCT_STRATEGY.md](PRODUCT_STRATEGY.md) | Product strategy, anti-spoiler positioning, honest 5-OJ capability boundaries, and roadmap | Active |
| [UX_EXPERIENCE_AND_DESIGN_SPEC.md](UX_EXPERIENCE_AND_DESIGN_SPEC.md) | Code-verified UX experience & product design specification, persona friction audit, and interaction blueprints | Active |
| [USER_JOURNEY_COPY.md](USER_JOURNEY_COPY.md) | Bilingual (`zh-CN` / `en-US`) user journey & microcopy deck, hero positioning, and error-recovery dictionary | Active |
| [architecture.md](architecture.md) | Code-truthful system architecture, `src/` module map, context gatekeeper, schemas, and governance | Active |
| [current-gaps-and-next-steps.md](current-gaps-and-next-steps.md) | Maintained backlog of verified gaps, educational hard gates, and prioritized next slices | Active |
| [release-lanes.md](release-lanes.md) | Three VSIX lanes (`beta`, `beta-release`, `internal`), CI hygiene gates, and friend-test build guide | Active |
| [ai-problem-writing-standard.md](ai-problem-writing-standard.md) | Chinese/English Markdown problem authoring format accepted by `manualProblemParser.ts` | Reference |
| [problem-search-mcp.md](problem-search-mcp.md) | Standalone stdio MCP server (`src/mcp/problemSearchServer.ts`) tools and client setup | Reference |
| [research-notes.md](research-notes.md) | Consolidated design rationale and provenance citations across agent, education, and skill research | Reference |
| [internal-testing.md](internal-testing.md) | Longitudinal evaluation CLI guide and April–May 2026 live `mimo-v2.5` calibration evidence | Reference |
| [education-scenario-evaluation-2026-07-22.md](education-scenario-evaluation-2026-07-22.md) | July 2026 Codex OAuth sidebar evaluation and 7 reproduced cross-module educational hard-gate bugs | Reference |
| [integration-2026-07-22.md](integration-2026-07-22.md) | Milestone snapshot recording how feature branches consolidated into the public beta baseline | Historical |
| [CLEANUP_CHANGELOG.md](CLEANUP_CHANGELOG.md) | Record of documentation deduplication, pruning, and code-alignment fixes | Reference |

## Subsystem Design Specs (`docs/superpowers/specs/`)

| Document | Purpose | Status |
| --- | --- | --- |
| [2026-07-21-multi-platform-oj-submission-design.md](superpowers/specs/2026-07-21-multi-platform-oj-submission-design.md) | Authoritative contract for experimental Codeforces & AtCoder delegated-CLI submission (`src/submission/`) | Active |
| [2026-07-12-codex-oauth-design.md](superpowers/specs/2026-07-12-codex-oauth-design.md) | Experimental Codex OAuth `app-server` transport, isolation, auth state machine, and model discovery (`src/codex/`) | Reference |
| [2026-07-14-language-skill-composition-design.md](superpowers/specs/2026-07-14-language-skill-composition-design.md) | 4-layer typed `SkillPlan` composition, language registry, habit selection, and DeepSeek FIM rendering (`src/skills/`) | Reference |
| [2026-07-14-formal-frontend-redesign.md](superpowers/specs/2026-07-14-formal-frontend-redesign.md) | Competition-dossier sidebar design, landmarks, accessibility, and comment-free frontend rule (`src/sidebar/`) | Reference |
| [2026-07-14-oj-console-prototype-design.md](superpowers/specs/2026-07-14-oj-console-prototype-design.md) | OJ Console API/bridge contract covering standalone `prototypes/oj-console/` and integrated `src/ojConsole/OjConsolePanel.ts` | Reference |

## Architecture Diagrams (`docs/assets/architecture/`)

- [super-architecture-layered-system.svg](assets/architecture/super-architecture-layered-system.svg) — Layered system overview
- [teaching-workflow-sequence.svg](assets/architecture/teaching-workflow-sequence.svg) — Teaching workflow sequence
- [context-safety-gate.svg](assets/architecture/context-safety-gate.svg) — Autocomplete vs coach context isolation gate
- [eval-release-lanes.svg](assets/architecture/eval-release-lanes.svg) — Evaluation tiers and VSIX release lanes
