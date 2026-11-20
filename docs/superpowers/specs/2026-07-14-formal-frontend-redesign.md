# Formal Frontend Redesign

Date: 2026-07-14
Status: Reference (Implemented — `src/sidebar/webview/formalDesign.ts`, `src/sidebar/ProblemBankViewProvider.ts`, `test/formalFrontendContract.test.ts`)

## 1. Product Decision

Replace the generic card dashboard with a compact competition-dossier surface (`data-design="competition-dossier"`) inside the native VS Code sidebar WebviewView.

Three top-level destinations (`formalSidebarDestinations`):

1. **`作答现场` (`#aiPage` / EN: `AI Coach`)**: current attempt masthead, AI briefing response, follow-up composer, primary hint action + progressive drawer, official OJ submission docket, and collapsible account/model drawer.
2. **`题目张贴板` (`#problemPage` / EN: `Problems`)**: active problem pinned as a competition notice (`#problemPoster`), followed by Markdown/online OJ imports, practice queue, and archived problems.
3. **`学习档案` (`#skillPage` / EN: `Learning Profile`)**: inspectable `Student Skill` evidence dossier (`#learningDossier`) answering what the AI will adjust next time, with correction controls (`有帮助` / `这条不准` / `禁用`) and version rollback.

Required landmark IDs (`formalSidebarLandmarkIds`): `sessionMasthead`, `problemPoster`, `learningDossier`, `submissionDocket`, `accountModelDrawer`.

## 2. Visual Language & Responsive Layout

- Compatible with VS Code dark and light themes; dark presentation uses graphite surfaces, cool cyan structure rules, amber caution/problem accents, and mint verified/connected stamps.
- VS Code UI font for prose; editor monospace font for IDs, evidence labels (`E-01`), routes, timestamps, and state stamps.
- Clipped dossier corners, ruled evidence dividers, one saturated primary action per state, and quiet secondary utility rows.
- Usable from 260 px to 600 px sidebar width without horizontal scroll; metadata collapses cleanly at narrow widths (`<= 360 px`) while keeping actionable touch/click targets.

## 3. Page Structure (Verified Against `ProblemBankViewProvider.ts`)

### `作答现场`
- **Masthead (`#sessionMasthead`)**: current problem, editor, attempt state, and compact trace header.
- **Response surface before controls**: `#aiResponse` renders above the `#coachQuestion` composer (`追问` + `发送` / `Ctrl+Enter`) and action controls.
- **Action hierarchy**:
  - Primary CTA: `给一个提示` (`#coachHint`).
  - Progressive secondary actions under `更多操作` (`#coachMoreDrawer`): `提示更具体`, `继续追问`, `我卡住了`, `完成复盘`, `测试补全接口`.
  - Attempt options under `作答选项` (`#attemptOptionsDrawer`): file language, reply language (`zh` / `en` / `raw`), OJ verdict.
- **Submission docket (`#submissionDocket` / `提交到 OJ`)**: experimental Codeforces and AtCoder submission via user-installed `online-judge-tools/oj`, preserving trusted-workspace checks, visible login terminal, preview, two-minute single-use confirmation, and clear separation between official verdicts and `AI 估计`.
- **Utility drawers**: `连接状态` (`#connectionStatusDrawer`) and `账户与模型` (`#accountModelDrawer`) hosting Codex OAuth, API-key/OpenAI-compatible/Anthropic config, model refresh, and `健康检查`.

### `题目张贴板`
- Pinned `#problemPoster` displays problem metadata, statement/I/O/samples/hint brief sections, and a single `进入作答现场` primary button.
- Empty state teaches the primary import paths (Markdown file import or online OJ search/fetch); queues, archives, and problem sets appear below as compact ledger rows.

### `学习档案`
- Opens with inspectable active/candidate skill evidence records, reason, count, last-seen problem, and inline correction actions; disabled rules, correction log, code habits, and version rollback live in quiet disclosures beneath.

## 4. Accessibility & Comment-Free Frontend Rule

- Tabs expose `role="tablist"`, `role="tab"`, `aria-selected`, and roving `tabindex`; status messages use `role="status" aria-live="polite"`.
- Explicit focus rings, visual-order keyboard traversal, `prefers-reduced-motion` respect, and zero browser `alert`/`confirm`/`prompt` dialogs.
- **Comment-free frontend contract**: no HTML (`<!--`), CSS/JS block (`/*`), or JS line (`//`) comments may appear in `src/sidebar/webview/*` or the embedded document returned by `ProblemBankViewProvider`. Enforced automatically by `frontendCommentViolations` in `src/sidebar/webview/formalDesign.ts` and `test/formalFrontendContract.test.ts`.
