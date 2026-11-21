# Release Lanes, Packaging & Internal Testing

Status: Active — authoritative packaging, open-source boundary, and friend-test build guide verified against `package.json`, `scripts/packageBetaReleaseVsix.js`, `scripts/packageInternalVsix.js`, `scripts/checkProjectHygiene.js`, and `.github/workflows/ci.yml`.

## 1. Three VSIX Lanes

Student Autocomplete Lab maintains three distinct VSIX lanes with separate package IDs and contribution prefixes so they never collide:

| Lane | Package Name | View / Settings Prefix | Output Artifact (`.runtime/`) | Publish Rule |
| --- | --- | --- | --- | --- |
| **Beta (Dev)** | `student-autocomplete-lab` | `studentAutocomplete` | `student-autocomplete-lab-0.1.0-beta.1.vsix` | Local / trusted testing only; not a clean public release |
| **Beta Release** | `student-autocomplete-lab-beta-release` | `studentAutocompleteBetaRelease` | `student-autocomplete-lab-0.1.0-beta.1-release.vsix` | Clean allowlist-staged public candidate; publish only after hygiene & CI gates pass |
| **Beta Internal** | `student-autocomplete-lab-internal` | `studentAutocompleteInternal` | `student-autocomplete-lab-0.1.0-beta.1-internal.1.vsix` | Private friend testing with local JSONL recording; **NEVER publish** |

## 2. Build & Verification Commands

```powershell
# Standard verification (matches .github/workflows/ci.yml)
npm ci
npm test
npm run compile
npx tsc -p tsconfig.oj-console.json --noEmit
npx tsc -p tsconfig.release.json --noEmit

# Build packages (all outputs go to gitignored .runtime/)
npm run package:beta
npm run package:beta-release
npm run package:internal

# Hygiene & dependency audit (requires package:beta-release first)
npm run check:hygiene
npm audit --omit=dev
```

## 3. Clean Beta Release Rules

`scripts/packageBetaReleaseVsix.js` builds from an explicit allowlist:

- **Included**: compiled runtime modules (`attempt`, `autocomplete`, `codex`, `config`, `extension.js`, `mcp` minus `problemSearchServer.js`, `models`, `oj`, `ojConsole`, `problemBank`, `recommendation`, `release`, `sidebar`, `skills`, `storage`, `submission`, and allowlisted `teaching/` runtime files), `resources/`, `prototypes/oj-console/frontend/` (required by `OjConsolePanel`), `README.release.md` (copied as `README.md`), `LICENSE`, and `THIRD_PARTY_NOTICES.md`.
- **Excluded / Stripped**: `docs/`, `scripts/`, `test/`, `fixtures/`, `src/`, `dist/src/cli/`, `dist/src/internalTesting/`, trial modules (`fixtureTeachingContext.js`, `journeyTrial.js`, `longitudinalSelfEvolution.js`, `selfEvolutionEval.js`, `selfEvolutionTrial.js`, `stubTeacher.js`, `transferValidation.js`), `problemSearchServer.js`, source maps (`*.js.map`), `secrets/`, `.runtime/`, `.student-autocomplete/`, and internal-test UI strings (`internalTestPanel`, `internalTestEvents`, `STUDENT_AUTOCOMPLETE_INTERNAL_TEST`, `内测记录版`).
- `scripts/checkProjectHygiene.js` verifies both `.gitignore` coverage for local/secret paths and that the staged beta-release tree contains zero blocked files, secrets (`sk-...`, `ghp_...`), or host paths (`C:\Users\`).

## 4. Open-Source Repository Hygiene (MIT License)

The repository is published under the [MIT License](../LICENSE) with third-party attributions in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).

Never commit or package:

- API keys, OAuth credentials, or `secrets/models.env`;
- `.runtime/` build/eval/usage logs (e.g., `.runtime/chat-completions-usage.jsonl`);
- `.student-autocomplete/` personal learning ledgers or raw user attempts;
- `practice/` scratch solutions or bulk-downloaded full problem statements;
- generated `*.vsix` binaries.

## 5. Friend Internal Test Build (`package:internal`)

The internal lane (`Student Autocomplete Lab 内测记录版`, version `0.1.0-beta.1-internal.1`) enables local-only JSONL recording in `internalTestEvents.jsonl` under VS Code extension global storage. The exact path is shown in the sidebar's `内测记录版` panel.

**Recorded locally (never uploaded automatically):**
- extension activation and autocomplete request status;
- AI coach actions, hint type, model, pain points, and skill merge counts;
- lesson reports, learning scores, optimization reviews, AI submission checks, and recommendations;
- `学习档案` user correction notes and workspace folder path.

**Install & summarize locally:**

```powershell
code --install-extension .runtime\student-autocomplete-lab-0.1.0-beta.1-internal.1.vsix --force
code -n "<your-practice-workspace>"

# Summarize recorded events without sharing raw JSONL
npm run internal:test-report -- --events "<path shown in 内测记录版 panel>" --format markdown
```

You can also click `复制摘要` inside the `内测记录版` panel. Share sanitized summaries first; keep raw JSONL files private unless the tester explicitly consents.

Suggested friend-test session coverage:
- ~20 real problems across beginner I/O/array and recursion/tree topics;
- at least 3 `我卡住了` lesson reports, 5 post-completion learning scores, and 5 `学习档案` corrections (`有帮助` / `这条不准` / `禁用`).
