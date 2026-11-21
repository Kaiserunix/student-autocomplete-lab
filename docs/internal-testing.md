# Internal Testing & Longitudinal Evaluation Evidence

Status: Reference / Historical — documents the longitudinal evaluation CLI (`src/cli/longitudinalSelfEvolution.ts`) and preserves April–May 2026 live `mimo-v2.5` calibration results. For the July 2026 Codex OAuth sidebar evaluation and cross-module educational hard-gate audit, see [education-scenario-evaluation-2026-07-22.md](education-scenario-evaluation-2026-07-22.md).

## 1. Longitudinal Evaluation Harness

Always run a zero-cost deterministic fixture dry run before spending live model tokens:

```powershell
# 1,000-sample deterministic dry run (no network calls, no files written)
npm run trial:longitudinal-self-evolution -- --provider fixture --limit 1000 --no-write

# 5-sample self-evolution fixture check
npm run trial:self-evolution-eval -- --provider fixture --no-write
```

Supported CLI flags (`src/cli/longitudinalSelfEvolution.ts`):
- `--provider fixture|mimo|auto` (default `fixture`)
- `--count <n>` (default `1000`), `--offset <n>` (default `0`), `--limit <n>` (default `25`)
- `--retries <n>` (default `1`), `--student-id <id>`
- `--resume-from <prior-run-json>` — resumes accumulated `StudentProfile` and `StudentSkill` state across batches
- `--out <path>`, `--summary-out <path>`, `--samples-out <path>`, `--no-write`

Hard gates for any beta evaluation run:
- zero autocomplete leakage of problem statements or Teacher Packs;
- zero parser crashes across the 1,000-sample fixture dry run;
- zero silent reactivation of user-disabled skills;
- provider token usage recorded to local `.runtime/` when returned (never hardcoded pricing estimates, never committed to git).

> Note: Raw JSON traces remain local under `.runtime/` and are gitignored. Fixture runs prove parser and state-machine consistency, not human learning outcomes.

---

## 2. Historical Live `mimo-v2.5` Calibration Runs (2026-04-30 to 2026-05-03)

### Beta 100-Call Longitudinal Calibration (2026-05-03)

Command:

```powershell
npm run trial:longitudinal-self-evolution -- --provider mimo --limit 100 --retries 1 --out .runtime\longitudinal-self-evolution\mimo-beta-calibration-100.json --samples-out .runtime\longitudinal-self-evolution\samples-1000-beta.json
```

| Metric | Before Skill Normalization | After Skill Normalization |
| --- | ---: | ---: |
| Diagnosis pain-point accuracy | 0.960 | 0.960 |
| Diagnosis primary pain-point accuracy | 0.960 | 0.950 |
| Diagnosis skill-candidate accuracy | 0.800 | **1.000** |
| Calls with usage | 101 | 101 |
| Prompt tokens | 159,641 | 160,457 |
| Completion tokens | 33,798 | 33,652 |
| Total tokens | 193,439 | 194,109 |

Findings:
- Before normalization, all misses mapped `binary-tree-depth-numbered-children` to the broader `recursion-base-case-pattern`. Updating taxonomy normalization to use problem context resolved all 20 skill mismatches (0.800 -> 1.000).
- In both slices, 1 response returned truncated JSON and recovered on 1 retry — confirming retry handling is required for live calibration.
- Remaining 5 primary pain-point misses were traversal cases labeled with immediate symptom `child_indexing`, though normalized skill still landed on `binary-tree-traversal-reconstruction`.

Active skills after normalization (100 steps): `binary-tree-depth-numbered-children`, `binary-tree-traversal-reconstruction`, `numeric-geometry-formatting`, `ordered-multiset-semantics`, `sentinel-input-output-order`.

### Long-Run Carried-Profile Stability (2026-04-30)

Command:

```powershell
npm run trial:mimo-journey -- --runs 5 --profile-mode carry --variant long --out .runtime\mimo-long-journey-20260430-224246\journey-runs.json
```

Scope: 17 Luogu training sets (`100`–`116`, 247 problem summaries), 35 diagnosis cases + 5 optimization reviews per run × 5 runs = 200 live MiMo calls.

| Metric | Score |
| --- | ---: |
| Diagnosis pain-point accuracy | 1.000 |
| Diagnosis primary pain-point accuracy | 1.000 |
| Diagnosis skill-candidate accuracy | 0.994 |
| AC-after optimization verdict accuracy | 1.000 |

Stage breakdown: Beginner (60 samples) 1.000 / 1.000 / 1.000; Algorithm (70 samples) 1.000 / 1.000 / 0.986; Data structure (45 samples) 1.000 / 1.000 / 1.000. Ready skills grew from 6 (run 1) -> 12 (run 2) -> 16 (runs 3–5).

Observed drift & parser fix:
- 1/175 skill miss: high-precision addition routed to `python-loop-boundary-check` instead of `high-precision-carry-order`.
- An earlier run exposed string-typed numeric confidence values; the parser was hardened to coerce numeric strings and completed cleanly.

### Usage Tracking Smoke (2026-05-01)

Command:

```powershell
npm run trial:mimo-journey -- --runs 1 --profile-mode carry --variant standard --out .runtime\mimo-usage-smoke-20260501-000238\journey-runs.json
```

Result: 22 calls with provider-reported usage — 25,120 prompt / 5,301 completion / 30,421 total tokens (replacing local token estimates; omitted when upstream omits `usage`).

### Transfer Validation Smoke (2026-05-01)

Command:

```powershell
npm run trial:mimo-journey -- --runs 3 --profile-mode carry --variant standard --transfer-check --out .runtime\mimo-transfer-check-20260501-0033\journey-runs.json
```

| Metric | Score |
| --- | ---: |
| Diagnosis pain-point accuracy | 0.961 |
| Diagnosis primary pain-point accuracy | 0.941 |
| Diagnosis skill-candidate accuracy | 0.882 |
| AC-after optimization verdict accuracy | 1.000 |
| Non-empty transfer probes / passed | 26 / 26 (1.000) |
| Average estimated hint reduction | 2 |
| Calls with usage / total tokens | 92 calls / 162,644 tokens (134,995 prompt + 27,649 completion) |

Fix surfaced by run: corrected mismatched synthetic samples T102 and T108 to align with bound Luogu problems, and weighted aggregate transfer pass rate by actual probe count rather than zero-ready-skill runs.

### Earlier 3-Run Journey & Independent Stability Baseline (2026-04-30)

- **Carry-profile (`--runs 3 --profile-mode carry`)**: pain-point `1.000`, primary `1.000`, skill-candidate `0.921`, optimization `1.000`; ready skills grew `0 -> 6 -> 11`.
- **Independent-student (`--runs 3`)**: pain-point `0.961`, primary `0.961`, skill-candidate `0.961`, optimization `1.000`.
