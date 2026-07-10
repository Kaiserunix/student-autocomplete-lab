# 状态驱动 UI 重置实施计划

> 前置：FND-06 Attempt v2、FND-07 SafetyOverlay、FND-09 autocomplete boundary 已通过。UI 实施期间旧 Webview 保持 feature-flag 回滚，但不得同时写领域状态。

## 目标

- 原生 TreeView 管题库/历史；React WebviewView 管当前会话；React WebviewPanel 管复盘。
- Host `SessionCoordinator` 单一状态源，UI 只发送 intent/消费 projection。
- 260/320/360/600、Light/Dark/High Contrast、reduced-motion、键盘、焦点与重载恢复全部有行为证据。
- 最终删除 6685 行 Provider 的内嵌 HTML/CSS/JS 和 loose protocol；Provider 变薄壳。

## 固定前端依赖

```text
react@19.2.7
react-dom@19.2.7
vite@8.1.4
@vitejs/plugin-react@6.0.3
lucide-react@1.24.0
@types/react@19.2.17
@types/react-dom@19.2.3
@testing-library/react@16.3.2
@testing-library/user-event@14.6.1
jsdom@29.1.1
axe-core@4.12.1
@axe-core/playwright@4.12.1
@vscode/test-electron@3.0.0
@vscode/test-cli@0.0.15
```

使用 lockfile 精确固定。领域/UI state 使用 React `useReducer`，不引入 Zustand/Redux。

## UI-01：定义 protocol v2 与运行时 schema

**新增：**

- `src/ui/protocol/v2.ts`
- `src/ui/protocol/schemas.ts`
- `src/ui/protocol/errors.ts`
- `test/ui/protocolV2.test.ts`

1. 按 UI 规格实现 `WebviewCommandEnvelopeV2`、`WorkbenchCommandV2`、`HostEventEnvelopeV2`、`HostEventV2`、`UiStateV2`。
2. 先测每个 command/event roundtrip；缺 requestId、未知版本、stale revision、payload 多余敏感字段均失败。
3. 只有 bootstrap/select/start 可省略 attempt/revision；其余 command 缺 `attemptId + expectedRevision` 必须在 handler 前拒绝。
4. 协议显式覆盖 declare-complete、abandon、answer-reveal request、recommendation visible/chosen/dismissed/deferred；visible 带稳定 presentationId/visibility proof，reveal 只能触发 Host 原生确认。
5. 每个 accepted command 映射恰好一个 terminal event；stream/progress correlation sequence 单调。
6. 测 projection JSON 不匹配 `apiKey|cookie|teacherPack|referenceSolution|rawCode|confirmationProof`。
7. 旧 `messageProtocol.ts/hostEvents.ts` 暂不修改；新增 `LegacyProtocolAdapter` 的接口但下一任务实现。

```powershell
npx vitest run test/ui/protocolV2.test.ts
```

**提交：** `feat(ui): define versioned workbench protocol v2`

## UI-02：实现 SessionCoordinator、UiProjector 与 MessageRouter

**新增：**

- `src/application/workbench/SessionCoordinator.ts`
- `src/application/workbench/UiProjectorV2.ts`
- `src/application/workbench/NowActionPolicy.ts`
- `src/ui/host/WorkbenchMessageRouter.ts`
- `src/ui/host/LegacyProtocolAdapter.ts`
- `test/application/sessionCoordinator.test.ts`
- `test/application/uiProjectorV2.test.ts`
- `test/ui/workbenchMessageRouter.test.ts`

1. Fake ports：EventStore、OjBroker、ModelGateway、RunGateway、DocumentGateway；不使用真实 VS Code。
2. 先测：每个非终态恰一个 NowAction；终态无动作；capability/offline 改变动作；stale revision 拒绝；duplicate requestId 幂等；operation terminal 才解除 busy；late delta 丢弃。
3. Coordinator 只操作 Attempt application ports；不 import DOM/Webview。
4. Router 为每 request 建 `AbortController` 和 operation registry；`operation.cancel` 精确取消。
5. Legacy adapter 只把 v2 snapshot 映成旧 UI 可读事件；旧 UI command 转 intent 时标 source，不允许旧/新双写。

**提交：** `feat(workbench): add authoritative session coordinator`

## UI-03：建立 React/Vite 双入口构建

**修改：**

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `tsconfig.release.json`
- `.vscodeignore`
- `scripts/packageBetaReleaseVsix.js`
- `scripts/checkProjectHygiene.js`

**新增：**

- `vite.webview.config.ts`
- `tsconfig.webview.json`
- `src/ui/webview/current-session/index.html`
- `src/ui/webview/current-session/index.tsx`
- `src/ui/webview/learning-review/index.html`
- `src/ui/webview/learning-review/index.tsx`
- `src/ui/webview/shared/vscodeApi.ts`
- `src/ui/webview/shared/reset.css`
- `test/ui/webviewBuild.test.ts`

1. 先写 build test：两个 entry manifest、hashed JS/CSS、无 inline eval、无 source map、无 Node builtin import。
2. scripts：

```json
{
  "build:webview": "vite build -c vite.webview.config.ts",
  "test:ui": "vitest run --environment jsdom test/ui",
  "compile": "npm run build:webview && tsc -p ."
}
```

3. 输出 `.runtime/webview-dist` 用于开发，release staging 只复制 manifest 指定资产到 `dist/webview`；不得把整个 source/docs/node_modules 入包。
4. CSP 不依赖 Vite dev server/HMR；生产 bundle 无 `eval`。
5. 先运行 `npm run build:webview`，检查 bundle；再更新 packaging allowlist，避免重现漏模块。

**提交：** `build(ui): add pinned react webview pipeline`

## UI-04：实现安全 WebviewHost 与资源清单

**新增：**

- `src/ui/host/WebviewAssetManifest.ts`
- `src/ui/host/WebviewDocument.ts`
- `src/ui/host/WebviewPeer.ts`
- `test/ui/webviewDocument.test.ts`

1. 随机 nonce 使用 `crypto.randomBytes`，替换时间戳 nonce。
2. `localResourceRoots` 只包含 `dist/webview`；CSP：default none、img webview/data、style webview、font webview、script nonce/webview；无 unsafe-eval。
3. test 解析 HTML，断言每 script/style 来自 manifest、nonce/CSP 完整、缺 asset 产生可诊断错误页。
4. `WebviewPeer` 维护 peerId、post queue、disposed state、last revision；不保存领域 state。

**提交：** `feat(ui): add manifest driven secure webview host`

## UI-05：上线原生 ProblemLibraryTreeProvider

**新增：**

- `src/ui/host/ProblemLibraryTreeProvider.ts`
- `src/application/workbench/ProblemLibraryProjection.ts`
- `test/ui/problemLibraryTreeProvider.test.ts`
- `test/ui/configurationSurfaces.test.ts`

**修改：**

- `package.json` views/commands/viewsWelcome/menus
- `src/extension.ts`

1. Manifest 新增一个 TreeView 与一个 current-session WebviewView，总 view 数保持克制。
2. 正常态 Tree groups 只有进行中、待练、推荐、历史；“服务异常”仅在至少一个用户可行动 capability degraded/auth-required 时临时出现，恢复后消失。常驻平台状态、provider ID 和健康 badge 墙禁止进入 Tree。
3. 先测 empty、loading、offline、error、long title、多平台、selected attempt，以及同题三个不同 attemptId。目录题目发送 `problem.select(problemKey)`，历史/进行中会话发送 `attempt.select(attemptId)`，不得用 problemKey 猜最近会话。
4. `viewsWelcome` 提供 Markdown import、搜索、Companion 一次导入、恢复。
5. Tree 不直接读 JSONL；只订阅 Coordinator projection。
6. 旧“题目”Tab 在 flag 开启时隐藏/只读，避免两套集合操作。
7. View title/menu 注册 `workbench.openSettings`、`workbench.managePlatformAccounts`、`workbench.manageOjProviders`、`workbench.openDiagnostics`：分别打开 `@ext:kaiserunix.student-autocomplete-lab`、QuickPick/native auth、provider Panel、Output；React root 不实现设置表单。
8. 测正常态不显示 provider/model/feature flag/telemetry；异常态只显示受影响能力和一个修复/诊断入口。

**提交：** `feat(ui): move problem navigation into native tree view`

## UI-06：实现 CurrentSessionViewProvider 与 React reducer

**新增：**

- `src/ui/host/CurrentSessionViewProvider.ts`
- `src/ui/webview/current-session/App.tsx`
- `src/ui/webview/current-session/reducer.ts`
- `src/ui/webview/current-session/types.ts`
- `test/ui/currentSessionReducer.test.ts`
- `test/ui/currentSessionViewProvider.test.ts`

1. reducer 只处理 typed HostEvent；state.snapshot 权威，delta provisional。
2. 测试 bootstrap、snapshot、append、stream delta ordered/duplicate/gap、operation complete/fail/cancel、attempt switch、capability change。
3. 任意 unrelated event 不解除 active operation。
4. Provider resolve 时创建 peer、发送 bootstrap、dispose 时 cancel peer subscription 但不取消领域 attempt。
5. feature flag `workbench.v2.ui.enabled` 切 View；同一窗口只激活旧或新 current-session peer。

**提交：** `feat(ui): render current session from host projection`

## UI-07：实现 ONE NOW / NEXT / BEFORE 组件

**新增：**

- `src/ui/webview/current-session/components/SessionHeader.tsx`
- `.../CapabilityBanner.tsx`
- `.../NowAction.tsx`
- `.../NextQueue.tsx`
- `.../AttemptTimeline.tsx`
- `.../TimelineItem.tsx`
- `.../StateInput.tsx`
- `.../SessionDetailsDrawer.tsx`
- `src/ui/webview/current-session/currentSession.css`
- `test/ui/currentSessionComponents.test.tsx`

1. 先以 fixtures 渲染 12 状态；每个非终态一个主 action，危险动作只显示“查看并确认”。
2. UI 使用 full-width bands/rows；禁止 card nesting。Timeline item 是 row + separator；modal/drawer/repeated recommendation 才可轻量容器。
3. 260px 长中英题名、长错误码、4 capability badges 不水平溢出。
4. action icon 使用 Codicon 优先、Lucide 补充；icon-only 必须 tooltip/accessible name。
5. Composer draft 不因 snapshot/delta rerender 丢失。
6. `SessionDetailsDrawer` 只承载题面摘要、当前步骤和证据详情，不承载设置、账号、provider 配置、模型参数或 feature flags。
7. 正常首屏只保留题目/阶段、NowAction、当前反馈和 timeline；技术 ID/hash 通过详情动作按需展示。

```powershell
npm run test:ui -- test/ui/currentSessionComponents.test.tsx
```

**提交：** `feat(ui): add one-now session timeline experience`

## UI-08：流式教练、取消与检查点

**新增：**

- `src/ui/webview/current-session/components/StreamingCoachTurn.tsx`
- `.../CheckpointInput.tsx`
- `src/ui/webview/shared/streamBlocks.ts`
- `test/ui/streamingCoachTurn.test.tsx`
- `test/ui/checkpointInput.test.tsx`

**修改：** UI protocol/client 只接受 `coach.block`/terminal event；本任务不接生产 teaching route

1. 先实现纯 renderer/protocol consumer，只接受带 validation receipt/contentSha256 的 `ValidatedLearnerFacingBlockView` fixture；裸 string、raw token event、receipt/hash mismatch 在 runtime schema 层失败。
2. 已验证 block 再以完整句/块节流；completed 后统一安全 Markdown render。生产 `ValidatedBlockPublisher` 和 TeachingApplicationService 由 LRN-06～LRN-08 实现并接线，本任务不能伪造安全门已完成。
3. 测试乱序、重复、gap、取消、切题后迟到、Webview reload 中断、raw delta 拒绝，以及正常 hint/answer-reveal 前后的答案 canary fixture。
4. `aria-busy` 与节流 `aria-live=polite`，不逐 token 朗读。
5. Checkpoint 支持 answered/still confused/skip；draft 与焦点保持；提交写事件而不是浏览器本地状态。
6. 每 turn 多 action 的 Host event 在 reducer/schema 层拒绝。

**提交：** `feat(ui): stream one teaching action with recoverable checkpoints`

## UI-09：本地运行与提交确认界面

**新增：**

- `src/ui/webview/current-session/components/RunProgress.tsx`
- `.../RunResult.tsx`
- `.../SubmissionPreview.tsx`
- `.../SubmissionProgress.tsx`
- `test/ui/runAndSubmissionViews.test.tsx`

1. Run UI 展示 compile/sample progress、verdict、耗时、摘要；stderr/raw output 按需展开且限长。
2. Submit Preview 显示平台/site/account/problem/language/file label/hash/bytes/未保存状态/recent run/warnings；不显示代码、artifact path 或完整 Remote URI。主 action 是“在 VS Code 中确认”。
3. Webview 不显示/持有 confirmation proof；点击只发送 `submission.reviewAndConfirm`。
4. outcome unknown 没有“重试提交”，只有“继续查询/打开平台/返回编码”。
5. 测试 code hash 改变时 preview 立即失效并回 coding。

**提交：** `feat(ui): distinguish run preview confirm and official evidence`

## UI-10：实现 LearningReviewPanel

**新增：**

- `src/ui/host/LearningReviewPanel.ts`
- `src/ui/host/LearningReviewPanelSerializer.ts`
- `src/ui/webview/learning-review/App.tsx`
- `src/ui/webview/learning-review/reducer.ts`
- `src/ui/webview/learning-review/components/{ReviewSummary,EvidenceTimeline,LearnerStateDiff,CorrectionControls,RecommendationExplanation,RollbackLauncher}.tsx`
- `src/ui/webview/learning-review/learningReview.css`
- `test/ui/learningReviewPanel.test.tsx`

**修改：** `package.json` command `studentAutocomplete.openLearningReview`

1. Panel tabs：摘要、证据、画像变化、推荐解释、数据/回滚。
2. 证据显示 level/source/outcome/hash short ref；不默认显示原始代码/Teacher Pack/答案。
3. correction 发送 targetEventId + decision；不发送完整 state patch。
4. Rollback 只启动 Host modal，显示 reducer/controller/recommender/read pointer；SafetyOverlay 不可回滚。
5. serializer restore 后 bootstrap 最新 revision；旧 panel state 不覆盖 Host。
6. 600px 深层内容在 Panel 验收，不要求永久扩大 Sidebar。

**提交：** `feat(ui): move review evidence and learner diff into panel`

## UI-11：主题、响应式、reduced motion 与 200% zoom

**修改/新增：**

- `src/ui/webview/shared/tokens.css`
- `src/ui/webview/shared/accessibility.css`
- current/review CSS
- `test/ui/themeAndMotion.test.tsx`

1. 所有颜色使用 VS Code token alias；测试禁止硬编码大面积 palette（允许 transparent/currentColor 和明确 fallback）。
2. `container-type: inline-size`；断点 ≤279/280–339/340–479/≥480。
3. High Contrast/forced-colors 关闭 color-mix，使用 contrastBorder；状态图标+文字双编码。
4. 同时支持 `prefers-reduced-motion` 和 VS Code reduced-motion body class；关闭 transition/smooth/pulse/spin/blink。
5. 200% zoom 下主 action、composer、timeline 不重叠；最长英文错误码可换行。
6. focus-visible 使用 VS Code focusBorder；hit target ≥40px，主 action ≥44px。
7. 视觉层级门：常驻主 action 恰好一个、直接可见次动作最多两个；设置表单/内部参数首屏命中为零；禁止 badge 墙和等权卡片阵列。

**提交：** `feat(ui): meet vscode theme motion and narrow-width gates`

## UI-12：草稿、焦点、滚动锚点与多 peer 恢复

**新增：**

- `src/ui/webview/shared/restoreState.ts`
- `src/ui/webview/shared/focusManager.ts`
- `test/ui/webviewRestoreState.test.tsx`

1. 保存 `WebviewRestoreStateV2`：attempt drafts、focusKey、scrollEventId、session details drawer、expanded IDs；不保存领域 state 或设置表单。
2. 测试 snapshot/reload/hide/reopen/attempt deleted/schema upgrade/corrupt state。
3. 新事件到来时：用户在底部才自动跟随；用户查看历史则保持 anchor 并显示“有新事件”。
4. drawer/modal close 恢复触发控件；返回代码恢复 editor selection（Host 负责）。
5. View/Panel 同开时只消费同一 revision；Panel correction 后 View 收到新 snapshot。
6. 不启用 `retainContextWhenHidden`。

**提交：** `feat(ui): restore drafts focus and timeline anchors`

## UI-13：替换源码字符串测试为行为/契约测试

**修改：**

- `test/problemBankWebviewScript.test.ts`
- `test/sidebarMessageProtocol.test.ts`
- `test/sidebarWebviewModules.test.ts`

**新增：**

- `test/ui/goldenSessionFlows.test.tsx`
- `test/ui/accessibility.test.tsx`

1. 保留少量 manifest/CSP/legacy adapter 字符串检查，但不再把按钮文本存在当主证据。
2. Golden flows：empty->prepare->code->coach->checkpoint->run->review->recommend；abandon/reveal；offline/recover；submit cancel/outcome unknown。
3. 用 user-event 全键盘完成；断言 focus return、aria roles/names/live。
4. 运行 `axe-core`，serious/critical violation 必须为零；对焦点顺序、状态文案和高对比保留人工清单。
5. 测试 renderer 不接受 raw HTML/script URL。
6. 测试正常首屏没有 settings/account/provider/model/feature-flag/telemetry 表单或技术表；异常状态两次操作内到达修复/Output。

**提交：** `test(ui): replace source assertions with behavior flows`

## UI-14：Playwright 视觉矩阵

**新增：**

- `test/visual/uiFixtures.ts`
- `test/visual/currentSession.spec.ts`
- `test/visual/learningReview.spec.ts`
- `scripts/runWebviewVisualTests.mjs`
- `test/visual/baselines/`

**修改：** `playwright.config.ts`（若当前不存在则新增）

1. 用生产 bundle + mocked typed Host bridge 渲染 12 状态，不复制组件。
2. 矩阵：260/320/360/600 × zh/en × Light/Dark/High Contrast × normal/reduced-motion；每个状态至少在关键组合覆盖。
3. 自动断言：

```js
scrollWidth <= clientWidth
all visible text/control boxes within viewport
no pair in protected control set overlaps
NowAction visible and enabled/disabled reason accessible
```

4. 截图差异必须人工审核；更新 baseline 用显式 `--update-snapshots`，CI 不自动接受。
5. canvas/pixel 非空检查、防止 blank Webview。
6. 每个关键页面运行 `@axe-core/playwright`；人工截图评审单独记录层级、密度、状态语法、主题一致性和配置裸露，不能只批准像素变化。

```powershell
npx playwright test test/visual
```

**提交：** `test(ui): add responsive theme and motion visual matrix`

## UI-15：真实 Extension Host 截图与交互门

**新增：**

- `test/extension/runTest.ts`
- `test/extension/suite/workbenchUi.test.ts`
- `scripts/runExtensionHostVisualTests.mjs`
- `scripts/runInstalledExtensionVisualTests.mjs`
- `test/extension/fixtures/workspace/`

**修改：** package scripts

1. `@vscode/test-electron` 分别下载/运行 VS Code `1.125.0` 与 current stable。
2. 使用临时 `--user-data-dir`/`--extensions-dir`，不改用户主题、信任或扩展；fixture workspace 明确信任只在临时 profile。
3. Host tests：Tree select、View hide/rebuild、Panel serialize/restore、editor drift、document hash、stream cancel/switch、offline/error、native submit cancel。
4. 视觉脚本以固定 remote-debugging port 启动 Extension Development Host，Playwright CDP 连接；拖动 Sidebar sash 到内容宽 260/320/360/600，切 temp profile themes/reduced motion，捕获真实 frame。
5. 断言 Webview frame 非空、标题/NowAction 可见、无 overlap；扫描 exthost/renderer logs 的 extension error。
6. 将当前 release `Cannot find module '../teaching/workflow/actions'` 固化为安装态回归 fixture。
7. 本任务证明开发宿主集成；INT-14 必须对最终打包并安装的 VSIX 重跑同一宽度/主题/reduced-motion/键盘/serializer/CSP 矩阵，不能以本任务替代。
8. `runInstalledExtensionVisualTests.mjs` 必须要求显式 `--artifact-manifest`，校验 VSIX hash/commit/version/生成时间后才安装；缺文件、陈旧 manifest 或回退到 extensionDevelopmentPath 都应失败。UI-15 用伪 VSIX fixture 测脚本契约，真实 RC 由 INT-14 在打包后执行。

```powershell
npm run test:extension -- --version 1.125.0
npm run test:extension -- --version stable
npm run test:extension-visual
```

**提交：** `test(extension): gate real vscode workbench interaction and screenshots`

## UI-16：绞杀旧 ProblemBankViewProvider

**修改/删除：**

- `src/sidebar/ProblemBankViewProvider.ts`
- `src/sidebar/messageProtocol.ts`
- `src/sidebar/hostEvents.ts`
- `src/sidebar/stateView.ts`
- `src/sidebar/webview/*`
- `src/extension.ts`
- legacy tests/package allowlists

1. 用 import/call inventory 确认每项能力已有 application service/新 surface。
2. 先让旧 Provider 只转发 protocol v2；删除 model/storage/platform/recommendation imports。
3. 删除嵌入 HTML/CSS/JS，最终旧文件要么删除，要么 ≤250 行薄兼容壳。
4. 删除 Webview local coachThreads、loose HostEvent、previousCoachTurn self-report。
5. architecture test 断言 UI host 不直接 import model/storage/MCP。
6. 旧 UI flag 保留一个发布周期只读回滚；第二周期单独提交删除。

**提交序列：**

```text
refactor(ui): route legacy view through coordinator
refactor(ui): remove embedded webview implementation
chore(ui): retire protocol v1 after rollback window
```

## UI-17：UI 验收

```powershell
npm run build:webview
npm run compile
npm run test:ui
npm test
npx playwright test test/visual
npm run test:extension -- --version 1.125.0
npm run test:extension -- --version stable
npm run test:extension-visual
npm run package:beta-release
npm run check:hygiene
git diff --check
```

报告必须包含：矩阵通过率、截图目录、焦点/键盘/axe 结果、视觉层级与密度评审、配置裸露扫描、reload recovery、late event、CSP、VSIX asset list、Extension Host logs。任何 blank Webview、260px 截断关键 action、设置/内部参数占据首屏、reduced-motion 失效或 release 激活错误都阻断合并。

**提交：** `chore(ui): record state-driven workbench acceptance`

## 完成定义

- 三表面共享 Host state，不共享浏览器领域状态。
- 12 状态 exactly-one NowAction 与恢复语义通过。
- 260/320/360/600 无横向溢出/遮挡；主题、reduced motion、200% zoom 通过。
- 正常首屏不裸露设置/内部参数；一个主行动和渐进披露层级通过人工截图评审。
- axe serious/critical violation 为零，异常态两次操作内到达修复/诊断。
- 草稿/焦点/滚动在请求与 reload 中不丢。
- 真实 VS Code 1.125/current stable 与 release VSIX 安装态通过。
- 旧 6685 行内嵌实现已移除，源码字符串断言不再是 UI 主证据。
