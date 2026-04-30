# Internal Testing Evidence

Date: 2026-04-30

Model: `mimo-v2.5`

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
