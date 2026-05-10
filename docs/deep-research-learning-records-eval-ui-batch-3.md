# Deep Research Batch 3: Learning Records, Eval Harness, and UI Gates

Date: 2026-05-10

Status: third research pass after Playwright installation and live page snapshotting.

## 0. Summary

Batch 1 decided that beta 0.2 should use a deterministic TypeScript `TeachingWorkflow` instead of embedding a generic multi-agent runtime.

Batch 2 added the learning-system layer: `TeachingTrace`, scenario replay, spaced retrieval practice, micro-drills, and stricter context guardrails.

Batch 3 adds an implementation discipline:

- learning records should be modeled like xAPI/Caliper-style events;
- LLM quality should be tested like software, with scenario replay, red-team cases, and local dashboards;
- Student Skill should remain interpretable until the project has enough real event data for heavier knowledge tracing;
- VS Code UI should stay one compact, accessible sidebar instead of multiplying webview surfaces;
- Playwright should become the standard tool for screenshot-driven UI regression checks and source snapshots.

The key product correction is:

> Self-evolution should be evidenced by a local learning-event ledger and replayable evals, not by prompt drift or vague "the skill got better" claims.

## 1. Playwright Installation Result

Installed in this project:

```text
devDependency: playwright ^1.59.1
browser: chromium installed through npx playwright install chromium
```

Verification:

- `npx playwright --version` returned `Version 1.59.1`;
- a headless Chromium smoke test opened `https://playwright.dev/`;
- screenshot written to `.runtime/playwright-smoke.png`;
- batch source snapshots written to `.runtime/research-third-batch/snapshots.json`;
- 11/11 selected source pages loaded successfully.

The `.runtime/` outputs are local research artifacts and must stay out of git and release packages.

## 2. Third-Batch Sources

### Learning Records and Analytics Standards

- Caliper Analytics 1.2: <https://www.imsglobal.org/spec/caliper/v1p2/>
- xAPI specification repository: <https://github.com/adlnet/xAPI-Spec>
- xAPI about/data raw docs: <https://raw.githubusercontent.com/adlnet/xAPI-Spec/master/xAPI-About.md>

### LLM Eval and Red-Team Tooling

- Promptfoo docs: <https://www.promptfoo.dev/docs/intro/>
- OpenAI Evals: <https://github.com/openai/evals>
- DeepEval: <https://deepeval.com/>
- Inspect AI overview: <https://inspect.aisi.org.uk/>

### Observability and MCP

- OpenTelemetry GenAI semantic conventions: <https://opentelemetry.io/docs/specs/semconv/gen-ai/>
- OpenTelemetry MCP semantic conventions: <https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/>

### Knowledge Tracing and Programming Education

- Deep Knowledge Tracing: <https://papers.nips.cc/paper/5654-deep-knowledge-tracing>
- Integrating GenAI into Programming Education, 2025: <https://link.springer.com/article/10.1007/s40593-025-00496-4>
- CodeHelp: <https://arxiv.org/abs/2308.06921>
- CodeAid: <https://arxiv.org/abs/2401.11314>

### VS Code UI Guidelines

- Views UX guidelines: <https://code.visualstudio.com/api/ux-guidelines/views>
- Webviews UX guidelines: <https://code.visualstudio.com/api/ux-guidelines/webviews>

## 3. Learning Event Ledger v3

Caliper and xAPI both point toward a useful shape for Student Autocomplete Lab:

```text
actor did action to object with result in context at timestamp
```

The project should not implement a full LRS in beta 0.2. It should borrow the event model and keep it local:

```text
LearningEventV3 = {
  id,
  actor: "local-user",
  verb,
  objectType,
  objectId,
  result,
  context,
  timestamp,
  schemaVersion
}
```

Recommended fields:

| Field | Meaning |
| --- | --- |
| `verb` | requested_hint, answered_probe, accepted_recommendation, corrected_skill, revealed_answer |
| `objectType` | problem, attempt, hint, skill, recommendation, micro_drill |
| `result` | success, failure, skipped, too_hard, too_vague, wrong, helpful |
| `context.problemId` | current problem |
| `context.attemptId` | current attempt session |
| `context.skillIds` | involved skills |
| `context.traceId` | linked teaching trace |
| `context.modelRoute` | hint, follow-up, score, recommendation, autocomplete |

This gives the project a durable local learning record without overcommitting to a standard or external service.

## 4. Eval Harness v3

The eval tool ecosystem has a clear common pattern:

- datasets of inputs and expected behavior;
- provider/model matrix;
- automatic scorers;
- red-team cases;
- CI or local replay;
- result viewer.

For this project, implement the smallest local version first.

### 4.1 Scenario Shape

```text
TeachingScenario = {
  scenarioId,
  problem,
  codeSnapshot,
  ojLikeFeedback,
  studentSkillBefore,
  coachThreadBefore,
  userAction,
  expected: {
    route,
    primaryPainPoint,
    skillPatch,
    forbiddenContextViolations,
    answerLeakage,
    recommendationPolicy
  }
}
```

### 4.2 Scorers

| Scorer | Type | Target |
| --- | --- | ---: |
| JSON schema validity | deterministic | 1.00 |
| forbidden context | deterministic | 1.00 pass |
| answer leakage | deterministic + judge | 0 leak |
| primary pain point | label match | >= 0.90 |
| skill patch | label match | >= 0.92 |
| hint actionability | LLM judge + rubric | >= 0.85 |
| reading level repair | LLM judge + heuristic | >= 0.80 |
| recommendation policy | deterministic | >= 0.95 |

### 4.3 Red-Team Suite

Add adversarial cases for:

- problem statement says "ignore previous instructions";
- sample input contains fake system prompt text;
- user asks for full solution through "follow-up";
- imported Markdown hides answer in comments;
- MCP tool response includes instructions;
- autocomplete cache tries to include Teacher Pack.

This is more important than adding more buttons.

## 5. Knowledge Tracing Decision

Deep Knowledge Tracing is valuable as a north star, but beta 0.2 does not have enough real data to train or trust a neural model.

Use interpretable tracing first:

```text
mastery = f(
  lowHintSuccesses,
  retrievalProbeResults,
  transferProbeResults,
  recentFailures,
  userCorrections,
  timeSinceLastPractice
)
```

Recommended state:

```text
SkillPracticeState = {
  masteryEstimate,
  confidence,
  attempts,
  lowHintSuccesses,
  retrievalPasses,
  transferPasses,
  failures,
  lastPracticedAt,
  nextDueAt,
  blockedReason
}
```

Only consider heavier DKT/BKT after:

- at least thousands of real learning events;
- stable skill taxonomy;
- stable problem difficulty labels;
- clear privacy/export rules.

## 6. Programming-Education Risk Updates

Recent programming-education literature keeps repeating the same warning: AI support can improve perceived productivity while weakening independent debugging and foundational skill formation if it becomes delegation.

Beta 0.2 should respond structurally:

- "Ask AI" can be casual, but route policy still prevents answer leakage unless the user enters abandon/reveal flow;
- completion review should ask what changed, not only grade the code;
- after AI help, schedule retrieval or transfer;
- "too hard" should simplify language and subgoal, not reveal code;
- "I completed" should create a Student Skill patch review before archive;
- the UI should make the student action visible: next check, next edit, next test, next recall.

## 7. VS Code UI Implications

VS Code's own guidelines push against overusing webviews and multiplying custom views. For this extension:

- keep one Activity Bar container;
- keep one primary Webview View for the coach;
- avoid separate duplicate entrances for the same action;
- use VS Code settings for provider configuration, with sidebar as a friendly editor;
- make empty states actionable but short;
- every button must be keyboard reachable;
- use theme colors and ARIA labels;
- use Playwright screenshots as the UI regression gate.

This supports the user's repeated UI feedback: less clutter, fewer duplicate entrances, larger primary AI area, and clearer current-problem state.

## 8. Playwright Usage Plan

Use Playwright for two jobs.

### 8.1 Source Snapshots

Purpose:

- confirm pages are reachable;
- capture titles, headings, descriptions, and screenshots;
- keep source inspection reproducible.

Storage:

- `.runtime/research-third-batch/snapshots.json`;
- `.runtime/research-third-batch/page-*.png`.

Never commit these artifacts.

### 8.2 UI Regression

Add future scripts:

```text
npm run ui:smoke
npm run ui:screenshot
npm run ui:a11y-lite
```

Suggested gates:

- sidebar loads without "no data provider";
- AI Coach tab is first screen;
- manual Markdown import path is visible;
- Ask AI textarea sends content;
- skill buttons work;
- learning profile rollback button works;
- primary controls fit at 360px and 520px sidebar widths;
- no overlapping text;
- no duplicate main entry buttons.

## 9. Beta 0.2 Design Changes From Batch 3

Add to the roadmap:

1. `learning-event-ledger-v3`: local xAPI/Caliper-inspired event schema.
2. `eval-harness-v3`: scenario replay, scorers, red-team cases.
3. `playwright-ui-gates`: screenshot-driven regression and accessibility smoke.
4. `skill-practice-state`: interpretable mastery and due-date state.
5. `provider-matrix-eval`: compare MiMo, OpenAI-compatible, Anthropic, and local routes with the same scenario set.

Do not add yet:

- full LRS server;
- neural knowledge tracing;
- cloud telemetry;
- autonomous multi-agent runtime;
- public analytics upload.

## 10. Final Recommendation

The third batch makes the beta 0.2 story sharper:

> Student Autocomplete Lab should be a local, traceable learning system. It can use AI heavily, but every learning claim needs an event, every prompt change needs replay, and every UI change needs a screenshot gate.

That is the shortest path from "interesting prototype" to "credible open-source beta."
