# Formal Frontend Redesign

Date: 2026-07-14

Status: approved through the preceding visual exploration and the user's instruction to implement the formal frontend.

## Product decision

The extension keeps the native VS Code shell but replaces the generic card dashboard with a compact competition dossier. The interface should feel like a serious working surface assembled from a problem notice, an attempt record, a submission docket, and a learner evidence file. It must be information-rich without becoming a diagnostics console.

The three top-level destinations are:

1. `作答现场`: the current attempt, AI response, next action, custom question, completion review, and official submission entry.
2. `题目张贴板`: the selected problem as a pinned competition brief, followed by the practice queue, imports, search, and archived problems.
3. `学习档案`: the learner model as inspectable evidence, including what the AI will change next time, corrections, and rollback history.

Provider diagnostics, internal-test data, and account configuration remain available but are visually subordinate to the learning workflow.

## Visual language

The base stays compatible with VS Code dark and light themes. The formal dark presentation uses graphite surfaces, cool cyan structure lines, amber problem and caution accents, and mint verified or connected states. Text uses the VS Code UI font while identifiers, evidence numbers, routes, timestamps, and state labels use the editor monospace font.

The distinctive motifs are:

- clipped dossier corners rather than a field of rounded SaaS cards;
- fine ruled lines and short bracket marks that suggest evidence links;
- numbered evidence labels such as `E-01`, `TRACE 03`, and `SUBMIT / 01`;
- small uppercase state stamps and paper-like section dividers;
- a single saturated primary action per state;
- dense secondary facts presented as quiet rows instead of equally loud buttons.

The interface must remain usable from 260 px to 600 px sidebar width. At narrow widths, metadata collapses to one column, but actions keep a minimum 36 px target and no horizontal scroll appears.

## 作答现场

The page begins with a session masthead containing the selected problem, current editor, attempt count, and a three-step trace: understand, implement, verify. The masthead is not a KPI dashboard; it establishes what is currently in scope.

The response surface appears before the composer and action shelf. Empty state copy describes the first concrete action. During work, AI feedback is rendered as a briefing with a visible evidence boundary. The coach action shelf is an attempt sequence, not a flat grid:

- primary: `给一个方向`;
- progressive secondary actions: `再具体一点`, `我卡住了`, `完成并复盘`;
- review actions: score, AI pre-submit estimate, optimization, and next-problem recommendation.

The custom question composer remains available with Ctrl/Cmd+Enter. It is visually quieter than the current primary action but never hidden.

The real OJ submission entry is a separate `提交公文夹`, labeled experimental for Codeforces. It must keep the existing trusted-workspace check, visible login terminal, no-submit preview, immutable confirmation summary, one-time confirmation id, and never-resubmit-on-ambiguity behavior. Official verdicts and AI estimates must remain visually and semantically distinct.

## 题目张贴板

The selected problem is shown first as a competition notice:

- problem id, title, source, difficulty, tags, and current attempt state;
- statement, input, output, samples, and hint as labeled brief sections;
- current editor and a single `进入作答现场` action;
- source and destructive maintenance actions remain secondary.

When no problem is selected, the empty poster teaches the two supported entry routes: import a Markdown problem or retrieve/search Luogu. Imports, the queue, archives, starter routes, and problem sets follow the poster and use compact ledger rows.

## 学习档案

The first block answers `AI 下次会这样教你`. Active learner rules are rendered as evidence records with status, reason, evidence count, last problem, and bounded examples. Every inferred rule exposes correction actions. Disabled rules, feedback history, code habits, and version rollback stay inspectable without taking over the first screen.

The page must never suggest certainty that the stored evidence does not support. Counts are supporting metadata; the explanation and correction path are the main content.

## Codex OAuth and model account

`账户与模型` is a visible drawer on the work page. Codex OAuth remains a first-class authentication route with browser login, device-code login, cancel, logout, model refresh, and separate teaching/autocomplete model selections. Signed-in state receives a mint connection stamp. API-key provider configuration and health checks remain available in the same drawer but do not appear in the main attempt path.

## Interaction and accessibility

- Navigation uses tab semantics and exposes the selected tab.
- Every dynamic status is readable by assistive technology.
- Focus rings are explicit and keyboard order follows the visual order.
- No browser `alert`, `confirm`, or `prompt` is used.
- Destructive actions are visually separated from progression actions.
- Motion is limited to short state transitions and respects reduced-motion preferences.
- All existing host commands and host events for coach, import, learning evidence, OJ submission, and Codex OAuth remain reachable.

## Frontend source rule

No comments may appear in frontend HTML, CSS, or webview JavaScript. This includes HTML comments, CSS block comments, JavaScript line comments, and JavaScript block comments. Intent must be expressed by names, structure, and tests. A source-contract test enforces the rule for every file in `src/sidebar/webview` and for the embedded document returned by `ProblemBankViewProvider`.

## Acceptance evidence

The redesign is complete only when:

- all three formal destinations and their required landmarks exist in the rendered document;
- the OJ submission and Codex OAuth controls still dispatch their existing typed commands;
- the embedded webview script parses successfully;
- the no-comment contract passes;
- TypeScript compilation, focused sidebar tests, full tests, release compilation, hygiene, and VSIX packaging pass, with any unrelated baseline failure explicitly rechecked;
- a browser render at narrow and wide widths is visually inspected for hierarchy, overflow, focus, empty state, and populated-state fixtures;
- the implementation branch is committed and merged into `codex/beta-0.2-one-shot-refactor` without taking the concurrent language-skill work.
