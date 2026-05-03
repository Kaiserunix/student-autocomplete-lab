# Internal Testing Evidence

Date: 2026-04-30

Model: `mimo-v2.5`

## Local Friend-Test Recorder

Date: 2026-05-03

The project now has a separate internal VSIX route for private friend testing. This is not the public beta artifact.

- Public package: `student-autocomplete-lab`
- Internal package: `student-autocomplete-lab-internal`
- Internal contribution prefix: `studentAutocompleteInternal`
- Internal VSIX: `.runtime\student-autocomplete-lab-0.1.0-beta.1-internal.1.vsix`

The internal build enables a local JSONL recorder by package name. It records AI coach actions, lesson reports, solution scores, optimization reviews, recommendations, autocomplete request status, and user corrections from `学习画像`. The sidebar exposes a clearly labeled `内测记录版` panel with a `复制摘要` button and the local record path.

Raw internal records stay local and must not be published. For feedback, prefer the copied summary or `npm run internal:test-report -- --events "<path>" --format markdown`.

## Beta 100-Call Longitudinal Calibration

Date: 2026-05-03

Goal: after the beta UI and Student Skill correction pass, run a live 100-sample slice of the 1000-code / 200-problem longitudinal harness. This checks whether the new fixture structure survives real model output and whether the skill-evolution scores still expose useful product gaps.

Command:

```powershell
npm run trial:longitudinal-self-evolution -- --provider mimo --limit 100 --retries 1 --out .runtime\longitudinal-self-evolution\mimo-beta-calibration-100.json --samples-out .runtime\longitudinal-self-evolution\samples-1000-beta.json
```

Result:

| Metric | Score |
| --- | ---: |
| Diagnosis pain-point accuracy | 0.960 |
| Diagnosis primary pain-point accuracy | 0.960 |
| Diagnosis skill-candidate accuracy | 0.800 |
| Calls with usage | 101 |
| Prompt tokens | 159,641 |
| Completion tokens | 33,798 |
| Total tokens | 193,439 |

Active skills after 100 steps:

`binary-tree-traversal-reconstruction`, `numeric-geometry-formatting`, `ordered-multiset-semantics`, `recursion-base-case-pattern`, `sentinel-input-output-order`.

Observed issue:

- One response returned truncated JSON and passed after a single retry. This confirms retries are still needed for live calibration runs.
- Skill-candidate accuracy is below the beta target of 0.85. Pain-point diagnosis is strong, but skill naming/merging still needs a normalization layer before claiming the skill engine is fully beta-stable.

Interpretation:

- This is good enough for personal beta inner testing and open-source feedback.
- It is not yet enough to claim the 1000-sample live gate. The next run should either add secondary-skill normalization or compare candidate skills by taxonomy alias instead of exact string equality.

## Beta 100-Call Skill Normalization Follow-Up

Date: 2026-05-03

Goal: fix the observed Student Skill granularity gap without accepting broad skills as correct. The before-run misses were all `binary-tree-depth-numbered-children -> recursion-base-case-pattern`, so the taxonomy now uses problem context to prefer the concrete binary-tree-depth skill when a tree-depth/numbered-children problem is diagnosed as a broad recursion-base-case issue.

Command:

```powershell
npm run trial:longitudinal-self-evolution -- --provider mimo --limit 100 --retries 1 --out .runtime\longitudinal-self-evolution\mimo-beta-calibration-100-after-skill-normalization.json --samples-out .runtime\longitudinal-self-evolution\samples-1000-beta.json
```

Result:

| Metric | Score |
| --- | ---: |
| Diagnosis pain-point accuracy | 0.960 |
| Diagnosis primary pain-point accuracy | 0.950 |
| Diagnosis skill-candidate accuracy | 1.000 |
| Calls with usage | 101 |
| Prompt tokens | 160,457 |
| Completion tokens | 33,652 |
| Total tokens | 194,109 |

Active skills after 100 steps:

`binary-tree-depth-numbered-children`, `binary-tree-traversal-reconstruction`, `numeric-geometry-formatting`, `ordered-multiset-semantics`, `sentinel-input-output-order`.

Observed issue:

- One response again returned truncated JSON and passed after a single retry. Live MiMo calibration still needs retry handling.
- Skill mismatch pairs dropped to zero in the 100-call slice.
- Five primary pain-point misses remain. Most were traversal cases where MiMo labeled the immediate slice/indexing symptom as `child_indexing`; the normalized skill still landed on `binary-tree-traversal-reconstruction`.

Interpretation:

- The beta skill-candidate gate is now satisfied for this 100-call calibration slice.
- The next useful improvement is not another broad skill alias; it is better primary pain-point ordering for traversal reconstruction cases.

## Long-Run MiMo Stability

Goal: run a longer carried-profile simulation across Luogu training `100` to `116`, with extra repeated and advanced error samples for each stage. This checks whether the diagnosis loop survives more calls, whether ready skills keep accumulating, and whether formatter drift breaks the run.

Command:

```powershell
npm run trial:mimo-journey -- --runs 5 --profile-mode carry --variant long --out .runtime\mimo-long-journey-20260430-224246\journey-runs.json
```

Scope:

| Item | Count |
| --- | ---: |
| Luogu training sets | 17 |
| Problem summaries available in the range | 247 |
| Diagnosis cases per run | 35 |
| Optimization reviews per run | 5 |
| Runs | 5 |
| Live MiMo calls | 200 |

Result:

| Metric | Score |
| --- | ---: |
| Diagnosis pain-point accuracy | 1.000 |
| Diagnosis primary pain-point accuracy | 1.000 |
| Diagnosis skill-candidate accuracy | 0.994 |
| AC-after optimization verdict accuracy | 1.000 |

Stage breakdown:

| Stage | Diagnosis samples | Pain-point | Primary pain-point | Skill candidate |
| --- | ---: | ---: | ---: | ---: |
| Beginner | 60 | 1.000 | 1.000 | 1.000 |
| Algorithm | 70 | 1.000 | 1.000 | 0.986 |
| Data structure | 45 | 1.000 | 1.000 | 1.000 |

Ready-skill growth:

| Run | Ready skills |
| --- | ---: |
| 1 | 6 |
| 2 | 12 |
| 3 | 16 |
| 4 | 16 |
| 5 | 16 |

Final ready skills:

`numeric-geometry-formatting`, `branch-boundary-check`, `python-loop-boundary-check`, `array-indexing-checklist`, `format-output-checklist`, `high-precision-carry-order`, `ordered-multiset-semantics`, `complexity-upgrade-from-bruteforce`, `recursion-base-case-pattern`, `greedy-choice-proof-check`, `binary-tree-depth-numbered-children`, `graph-adjacency-model`, `binary-tree-traversal-reconstruction`, `tree-weighted-distance`, `disjoint-set-union-model`, `search-state-boundary-check`.

Observed drift:

- One skill-candidate miss out of 175 diagnosis steps: high-precision addition was diagnosed with the right pain points, but the reusable skill was routed to `python-loop-boundary-check` instead of `high-precision-carry-order`.
- No pain-point misses in the final long run.
- No optimization verdict misses in the final long run.

Engineering note:

An earlier long-run attempt surfaced a real model-output robustness issue: MiMo returned a numeric-looking confidence value in a format the parser rejected. The parser was hardened to accept numeric confidence strings, and the final long run completed with empty stderr.

Interpretation:

- The profile memory loop works: the same carried learner moves from 6 ready skills after run 1 to 16 ready skills by run 3.
- The current evidence proves a strong diagnosis/profile/self-evolution loop, not a guaranteed human learning outcome. The next stronger metric should test transfer: after a skill becomes ready, give a new unseen same-family problem and measure whether hints become fewer or more precise.
- The most useful future improvement is a secondary-skill field. Some wrong submissions legitimately expose both a concept-specific skill and a generic loop-boundary or output-format skill.

## Usage Tracking Smoke

After the long-run discussion, the chat-completions client was updated to capture provider-reported token usage when the upstream response includes it. The journey CLI now writes both per-step `usage` and top-level `aggregateUsage`.

Command:

```powershell
npm run trial:mimo-journey -- --runs 1 --profile-mode carry --variant standard --out .runtime\mimo-usage-smoke-20260501-000238\journey-runs.json
```

Result:

| Item | Value |
| --- | ---: |
| Calls with usage | 22 |
| Prompt tokens | 25,120 |
| Completion tokens | 5,301 |
| Total tokens | 30,421 |

This replaces earlier local token estimates for future runs. If a provider omits usage, the field remains absent or zero instead of inventing a number.

## Transfer Validation Smoke

Goal: stop treating `skill ready` as proof of learning. After a skill becomes ready, run unseen same-family cases from the expanded journey set and measure whether diagnosis still hits the transferable pain point with fewer estimated hints.

Command:

```powershell
npm run trial:mimo-journey -- --runs 3 --profile-mode carry --variant standard --transfer-check --out .runtime\mimo-transfer-check-20260501-0033\journey-runs.json
```

Result:

| Metric | Score |
| --- | ---: |
| Diagnosis pain-point accuracy | 0.961 |
| Diagnosis primary pain-point accuracy | 0.941 |
| Diagnosis skill-candidate accuracy | 0.882 |
| AC-after optimization verdict accuracy | 1.000 |
| Non-empty transfer probes | 26 |
| Transfer probes passed | 26 |
| Transfer pass rate on probed cases | 1.000 |
| Average estimated hint reduction | 2 |
| Calls with usage | 92 |
| Prompt tokens | 134,995 |
| Completion tokens | 27,649 |
| Total tokens | 162,644 |

Observed issue and fix:

- The first transfer-check run exposed polluted synthetic cases: some wrong-code samples did not match the actual Luogu problem selected from the training set.
- T102 and T108 were corrected to match the bound Luogu problems, and the prompt now distinguishes loop boundaries from branch coverage, high-precision carry order from generic loop issues, and binary-tree depth modeling from generic recursion.
- The CLI now aggregates transfer pass rate by actual probe count, so a run with zero ready skills does not drag the aggregate down.

Interpretation:

- This is stronger than profile-memory testing because it asks ready skills to generalize to unseen same-family cases.
- It is still a model-simulation metric, not a guarantee that a real student learned the skill. Real learning needs human attempts, OJ outcomes, and hint-count change over time.

## Journey Test

Goal: simulate one learner moving from Luogu training `100` to `116`, then repeat the journey three times with the same accumulated student profile to check whether pain points become reusable skills.

Command:

```powershell
npm run trial:mimo-journey -- --runs 3 --profile-mode carry --out .runtime\mimo-journey-carry-release-20260430-214855\journey-runs.json
```

Result:

| Metric | Score |
| --- | ---: |
| Diagnosis pain-point accuracy | 1.000 |
| Diagnosis primary pain-point accuracy | 1.000 |
| Diagnosis skill-candidate accuracy | 0.921 |
| AC-after optimization verdict accuracy | 1.000 |

Ready skills by run:

| Run | Ready skills |
| --- | --- |
| 1 | none |
| 2 | `numeric-geometry-formatting`, `python-loop-boundary-check`, `array-indexing-checklist`, `ordered-multiset-semantics`, `recursion-base-case-pattern`, `complexity-upgrade-from-bruteforce` |
| 3 | `numeric-geometry-formatting`, `branch-boundary-check`, `python-loop-boundary-check`, `array-indexing-checklist`, `format-output-checklist`, `ordered-multiset-semantics`, `recursion-base-case-pattern`, `greedy-choice-proof-check`, `complexity-upgrade-from-bruteforce`, `binary-tree-depth-numbered-children`, `graph-adjacency-model` |

Interpretation:

- The pain-point diagnosis loop is strong enough for alpha use.
- The self-evolution mechanism does activate: the same learner begins with no active skills, then reaches 6 ready skills in run 2 and 11 ready skills in run 3.
- Remaining misses were mostly skill granularity disagreements, such as high-precision arithmetic being routed to loop-boundary checking because the broken code also stopped early. This is acceptable for alpha, but the next product step should add a secondary-skill field instead of forcing one candidate.

## Independent Stability Check

Command:

```powershell
npm run trial:mimo-journey -- --runs 3 --out .runtime\mimo-journey-release-20260430-213829\journey-runs.json
```

Result:

| Metric | Score |
| --- | ---: |
| Diagnosis pain-point accuracy | 0.961 |
| Diagnosis primary pain-point accuracy | 0.961 |
| Diagnosis skill-candidate accuracy | 0.961 |
| AC-after optimization verdict accuracy | 1.000 |

This independent-student mode is useful for prompt stability. The carry-profile mode is better for testing self-evolution.
