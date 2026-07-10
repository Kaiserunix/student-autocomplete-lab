# 集成、朋友内测与发布实施计划

> 通常前置：Foundation、MCP、UI、Learner 四计划各自完成 targeted/full gate。唯一例外是 INT-02 的最小 bundle/installed-VSIX 回归：它在 FND-01 重放出已知激活 P0 后立即执行并合入 Foundation，后续每个里程碑都复用；INT 阶段只做最终加固。

## 目标

- 将四条实现线按固定依赖顺序集成，证明迁移、回滚、隐私、补全、五平台能力和 UI 黄金路径。
- 修复当前“release VSIX 能打包安装但激活缺模块”的 P0。
- 用全新 VS Code profile 和真实 Extension Host 验证发行物。
- 运行至少 30 个朋友内测代表任务；不夸大学习结论。

## INT-01：建立集成分支、版本 pin 与契约冻结

**新增：**

- `docs/release/next-gen-rc-manifest.md`
- `scripts/checkRequirementsTraceability.mjs`
- `test/release/requirementsTraceability.test.ts`
- `.runtime/integration/contract-hashes.json`（忽略）

1. 从 Foundation checkpoint 建 `codex/next-gen-integration`。
2. 目标扩展版本固定为 `0.2.0-beta.1`，RC/发布 tag 为 `v0.2.0-beta.1`；版本变化必须更新 manifest、VSIX 名、SBOM 和安装态断言。
3. 依次合入：Foundation -> MCP core/Luogu -> UI Coordinator/Host -> Learner shadow -> platform adapters -> runner/submit -> recommendation -> UI cutover。
4. 每次合入前检查：OJ JSON Schema hash、Learner event schema、protocol v2、feature flag schema、SafetyOverlay version。
5. 契约变化必须先回对应计划修订和生成迁移，不在 integration 临时兼容两个不一致 schema。
6. 记录三个仓库（扩展、Luogu、adapter monorepo，LeetCode 是其 package）的 commit/hash/SBOM。
7. 把 task -> requirement 映射作为单一结构化源生成两个方向；测试要求 32 requirements、78 tasks、当前 227 条边集合完全相等，任何未知/孤立 ID 阻断。

**提交：** `chore(release): freeze next generation rc contracts`

## INT-02：统一 bundle 与 release pipeline

**执行时点：** 分两个 checkpoint。Phase A 在 FND-01 后、FND-02 前完成 extension bundle + 当前静态资源 + installed activation，产出早期发布门 G0R；Phase B 在 UI-03 生成 Vite entries 后接入 Webview manifest。INT-02 只有 Phase B 完成后才整体 complete，INT-14 再收紧最终供应链断言。

**修改/替换：**

- `package.json`
- `package-lock.json`
- `.vscodeignore`
- `scripts/packageBetaReleaseVsix.js`
- `scripts/packageInternalVsix.js`
- `scripts/checkProjectHygiene.js`
- `tsconfig.release.json`

**新增：**

- `esbuild.extension.mjs`
- `scripts/buildRelease.mjs`
- `scripts/verifyVsixContents.mjs`
- `scripts/smokeInstalledVsix.mjs`
- `release/allowed-files.json`
- `test/release/releaseBundle.test.ts`
- `test/release/installedVsix.test.ts`

1. 固定 direct dev deps：`esbuild@0.28.1`、`@vscode/vsce@3.9.2`、`@cyclonedx/cyclonedx-npm@6.0.0`。
2. esbuild 从 `src/extension.ts` 生成一个 Node CJS bundle，`vscode` external；source map/源码不进 release。
3. Phase A 不假设 Vite manifest 已存在：从当前 extension import graph 和现有 media/resource 声明生成 bundle/allowlist；若 Vite entries 尚不存在，明确记录 `webviewAssets: legacy-current` 并仍要求安装激活、旧 View 可打开。不得等待 UI-03 才修 missing workflow module。
4. Phase B 在 UI-03 后要求 Vite manifest 存在并复制 Current Session/Review 两个 entry 及依赖；缺 manifest 必须失败。package `files` 只列 bundle/webview/resources/README/LICENSE/third-party notices/SBOM。
5. 不再靠手工列 22 个 teaching 文件或修改编译后 JS contribution id。Contribution ids 由一个 typed build config/manifest 生成并由 runtime 使用。
6. 先写回归：模拟 `teaching/workflow/actions` import，构建后安装态能 require/activate；缺依赖时 package test 必须失败。
7. `verifyVsixContents` 解包 VSIX，检查 required entry、blocked path/content、asset references、package main、version、hash，并生成带 artifact path/hash/commit/version/createdAt/profile 的 `release-artifact.json`；安装/视觉脚本只接受该 manifest，不能猜“最新 VSIX”。
8. 从本任务起，每个改变 import graph、contribution、Webview asset 或 provider artifact 的里程碑出口都运行 `package:beta-release + installedVsix`，不能把安装态失败积到 M7。

```powershell
npm run build:release
npm run package:beta-release
npm run check:hygiene
npm run test:release
```

Phase A 提交：`build(release): bundle complete extension runtime`。Phase B 提交：`build(release): package versioned webview assets`。两者 commit body 都使用 `Task-ID: INT-02`。

## INT-03：依赖、安全与许可证门

**新增：**

- `scripts/checkDependencyPolicy.mjs`
- `release/dependency-policy.json`
- `THIRD_PARTY_NOTICES.md`
- `test/release/dependencyPolicy.test.ts`

1. 对扩展、Luogu Server、adapter monorepo（含 LeetCode package）分别 `npm audit --json`/语言依赖扫描。
2. 当前已知 critical Vitest、高 Vite/Hono 必须升级到已修复 lock；若只影响 dev 也记录范围，release runtime 不得有 high/critical。
3. 直接/传递依赖许可证生成 notices；未知/不兼容许可证阻断。
4. SBOM 使用 CycloneDX；artifact manifest 记录 lock hash。
5. 不自动 `npm audit fix --force`；每次升级单独 commit，跑对应 full tests/PoC。

**提交序列：** 按依赖分小提交，例如 `chore(deps): upgrade vitest to patched release`，最后 `chore(release): enforce dependency and license policy`。

## INT-04：真实数据副本迁移演练

**新增：**

- `scripts/rehearseMigration.mjs`
- `test/migration/fullStorageMigration.test.ts`
- `docs/release/migration-runbook.md`

1. 从用户 globalStorage 复制到 `.runtime/migration-rehearsal/<timestamp>/source`；不在原目录 apply。
2. 记录源文件 hash/bytes/count，不把原始内容提交/打印。
3. dry-run -> apply copy -> replay -> state hash -> 第二次 apply no-op -> rollback read pointer -> re-enable v2。
4. 故障注入：尾部损坏、中间损坏、磁盘满模拟、进程终止、BOM、duplicate event、时钟倒退、17 Skill versions。
5. 验证旧文件 byte-identical；v1 archive manifest 完整；disabled tombstone/纠偏保留；UNKNOWN completion 不升级。
6. 记录耗时、峰值内存、events/s；朋友内测启动预算建议迁移 <10s，超过则显示进度/取消并延迟后台 replay。
7. 本任务只证明脱敏副本；不得把 pointer 往返写成真实用户已迁移。真实 source hash 校验、apply、冻结 v1 writer 和主读切换归 INT-15。

```powershell
npm run migrate:learner-v2:dry-run -- --source <copy>
node scripts/rehearseMigration.mjs --source <copy>
npx vitest run test/migration/fullStorageMigration.test.ts
```

**提交：** `test(migration): rehearse idempotent real-data copy migration`

## INT-05：跨域完成语义与事件一致性

**新增：**

- `test/integration/completionSemantics.test.ts`
- `test/integration/eventProjectionConsistency.test.ts`

1. 场景逐一断言：user completed、AI estimate、local sample pass、manual verdict、official run、official submit AC、abandon/reveal、E5 transfer。
2. 确认归档不等于 AC；UNKNOWN completion 不加 mastery/up；AI estimate 不显示官方 badge。
3. 每个 UI terminal action 对应事件/projection/review/recommendation 一致；无 Profile/Skill/AttemptSession 旁路写。
4. crash after event append/before projection：重启 replay 恢复相同 state/UI。
5. 选题与活动文件 hash 不匹配：teaching/run/submit 均阻断并要求重新绑定。

**提交：** `test(integration): distinguish completion run submit and mastery facts`

## INT-06：Autocomplete 全链路泄漏门

**新增：**

- `test/integration/autocompleteLeakageGoldenPath.test.ts`
- `test/extension/suite/autocompleteLeakage.test.ts`
- `fixtures/autocomplete-leakage/integration/`

1. canary 放入题面、Teacher Pack、reference answer、coach turn、LearnerState、recommendation、OJ credential、marker 前后、路径目录。
2. Inline automatic/manual、侧栏预览（若保留）、缓存命中、错误日志、telemetry 全路径拦截完整 request。
3. 断言 prefix、suffix、headers、URL、metadata、cache key、logs、preview 均零 canary。
4. cursor outside marker、混合 Markdown 无 marker、文件切换、Webview attempt 切换、answer reveal 后仍阻断。
5. 安装态 Extension Host 使用 fake local provider 接收并记录 payload schema，不向网络发送。

```powershell
npx vitest run test/integration/autocompleteLeakageGoldenPath.test.ts
npm run test:extension -- --grep autocomplete-leakage
```

**提交：** `test(autocomplete): gate complete request leakage in installed host`

## INT-07：五平台代表性黄金路径

**新增：**

- `test/integration/ojGoldenPaths.test.ts`
- `fixtures/golden-paths/{luogu,leetcode,nowcoder,codeforces,atcoder}.json`
- `src/cli/ojGoldenPathReport.ts`

固定代表题：Luogu P1001、LeetCode two-sum、Nowcoder 固定公开 fixture、Codeforces 4/A、AtCoder abc086_a。

1. 每平台：health/capability -> search（若支持）-> import -> create/bind file -> local sample run -> teaching/checkpoint -> terminal evidence -> review -> LearnerState -> recommendation。
2. 提交阶段按真实能力：
   - 已审计 automated provider：prepare -> mock/native confirm ceremony -> commit mock/poll；live commit 另行人工。
   - manual/policy-blocked：打开官方页面/记录用户回填，UI 明确 manual；仍验证 review/evidence 路径。
3. 不把 unsupported 当失败，也不伪装 available；matrix 预期写 fixture。
4. 断网/429/auth expired/challenge/schema drift 每平台至少一条恢复路径。
5. 报告每阶段 source/provenance/risk；无代码/secret/Teacher Pack 出现在不相关 provider trace。

**提交：** `test(oj): prove truthful five-platform representative paths`

## INT-08：运行与提交安全/故障注入

**新增：**

- `test/integration/runSandboxAndSubmitSafety.test.ts`
- `fixtures/security/runner-escape/`
- `fixtures/security/submit-response-lost/`

1. runner：timeout、fork child、巨大输出、path traversal、env secret、network attempt、missing compiler；按平台实际能力阻断/降级。
2. submit：无 proof、expired、hash/account/site mismatch、double click、duplicate IPC、Server restart、上游成功后响应丢失。
3. 断言 response lost 只有 poll，没有第二次 commit。
4. Agent definitions 中无 R4；尝试 generic callTool/command palette 绕过失败。
5. 所有 safety tests 使用 mock endpoint；没有 live submit。

**提交：** `test(security): inject runner escape and submit ambiguity failures`

## INT-09：真实 UI/主题/恢复矩阵

1. 运行 UI-14 standalone visual matrix与 UI-15 Extension Host matrix。
2. 在临时 profile 验证 Light Modern、Dark Modern、Default High Contrast、reduced motion、200% zoom。
3. 260/320/360/600 调整真实 Sidebar 内容宽度；每个宽度捕获 empty/coding/stream/checkpoint/run/confirm/error。
4. 请求中输入草稿 -> hide view -> reopen -> late delta -> switch attempt；断言草稿/焦点/scroll anchor。
5. Panel restore、Tree selection、Remote URI/multi-root、Workspace Trust restricted path。
6. blank frame、exthost error、horizontal overflow、overlap、关键 action 截断均阻断。

**提交：** `test(ui): certify installed workbench matrix and recovery`

## INT-10：隐私、发行内容与日志扫描

**新增：**

- `scripts/scanPrivacyCanaries.mjs`
- `test/release/privacyScanner.test.ts`
- `docs/release/privacy-data-map.md`

1. 构建前在 fixture 数据中植入 canary；构建后扫描 VSIX、staging、SBOM、logs、reports、screenshots metadata。
2. 阻断：credentials、原始代码、Teacher Pack、答案、个人事件、绝对用户路径、confirmation proof、`.runtime`、source maps。
3. 扫描 MCP request/response logs 仅用 fixture traces；报告只保留字段/hash/count。
4. 验证导出、删除单 Attempt、清空学习数据、清平台凭据；log compaction 后被删 canary 不存在。
5. 朋友内测默认本地记录、不上传；README/隐私说明一致。

**提交：** `test(privacy): scan package logs and deletion flows`

## INT-11：性能与成本门

**新增：**

- `src/cli/workbenchPerformanceReport.ts`
- `test/performance/replayAndUiPerformance.test.ts`

1. fixtures：1k/10k/100k events、100/1k problems、长 timeline、17 legacy versions。
2. 测 replay time/memory、checkpoint speedup、UI projection size、postMessage size、React render/stream update、startup/activation。
3. 目标建议：普通朋友数据 activation p95 <2s；current snapshot <200 KB；stream update 不整页 render；100k replay 在可取消进度下完成。
4. 成本报告按 teaching action/prompt section；profile median ≤54 token，较基线下降 ≥60%。
5. 任何 live cost run 需显式 maxTokens/maxUsd；默认 fixture。

**提交：** `perf(workbench): gate replay activation ui and token budgets`

## INT-12：30 个朋友内测任务 Gate A

- **输入：** `fixtures/friend-beta/task-catalog.json`
- **输出：** `.runtime/friend-beta/<run>/` 本地原始；提交版只有脱敏 aggregate

1. 至少 30 task completions，覆盖五平台、四语言、完成/放弃、离线/错误、confirm cancel、review/correction/recommendation。
2. 每个任务记录版本/flags/provider capabilities、事件完整率、恢复、token/latency/error、用户可选反馈。
3. 每个真实提交仍单独确认；内测可全部使用 manual/mock，不以 live submit 数作成功指标。
4. 用户可删除/导出；报告不含身份、路径、代码、题面、答案、凭据。
5. Gate：crash=0 blocking、wrong/duplicate submit=0、leak=0、disabled reactivation=0、replay mismatch=0、unrecoverable task=0。
6. 学习只报告迁移观察；Gate B 协议虽已在策略分册定义，但首发未执行，不声称效果。

**提交：** `docs(beta): add anonymized thirty-task system report`

## INT-13：全量回滚演练

**新增：**

- `docs/release/rollback-runbook.md`
- `release/rollback-compatible-profile.json`
- `scripts/packageRollbackCompatibleVsix.mjs`
- `test/integration/rollbackMatrix.test.ts`
- `test/release/rollbackCompatibleVsix.test.ts`

1. UI v2 -> legacy read-only -> UI v2。
2. Luogu external MCP -> legacy public read -> external；private/write 不 fallback。
3. Learner v2 read -> v1 read-only -> v2；disabled、安全边界保持。
4. Recommendation v2 -> deterministic v1 -> v2。
5. provider operation off、单平台卸载、MCP schema quarantine。
6. 从与 RC 相同 commit 构建 `package:beta-rollback`：同 extension ID/version、artifact role=rollback-compatible、独立文件名/hash/manifest，默认旧 UI + v1 read-only pointer，但保留 v2 event capture/outbox/SafetyOverlay，且 v1 writer 在 import graph 和运行时都不可达。failed migration/release 只安装该包。
7. 普通历史版 VSIX 只作离线取证资产，不能作为可写回滚方案；若曾产生 v1 delta，必须先 journal/hash 并经 migration adapter 导入。
8. 在 fresh profile 安装 rollback VSIX，执行提示/纠偏/放弃/本地运行等动作，验证 v2 log/outbox 增长、v1 files byte-identical；再回装 RC 并 replay hash 一致。回滚 artifact manifest/hash/SBOM 与 RC 一起归档。

**提交：** `test(release): rehearse ui provider learner and package rollback`

## INT-14：Release Candidate 构建与全新安装

1. 工作树必须干净；package/version/VSIX/SBOM 一致为 `0.2.0-beta.1`，tag `v0.2.0-beta.1`。
2. 运行最终命令：

```powershell
npm ci
npm run build:release
npm run compile
npm test
npm run test:ui
npx playwright test test/visual
npm run test:extension -- --version 1.125.0
npm run test:extension -- --version stable
npm run test:extension-visual
npm run test:contract
npm run package:beta-release
npm run package:beta-rollback
npm run check:hygiene
npm audit --json
npm run test:installed-extension -- --artifact-manifest .runtime/release/release-artifact.json --version 1.125.0
npm run test:installed-extension -- --artifact-manifest .runtime/release/release-artifact.json --version stable
npm run test:installed-extension-visual -- --artifact-manifest .runtime/release/release-artifact.json --version 1.125.0
npm run test:installed-extension-visual -- --artifact-manifest .runtime/release/release-artifact.json --version stable
npm run test:rollback-compatible-vsix -- --artifact-manifest .runtime/release/rollback-artifact.json
```

3. 外部两个仓库（Luogu、adapter monorepo）各跑 build/test/conformance/audit；扩展仓库自身同样运行。
4. 创建空 PATH/空 provider cache 的全新 user-data-dir/extensions-dir，安装 VSIX，确认 `code --list-extensions --show-versions`；对五个平台每个最终 pin manifest 的 active 与 rollback artifact 都执行安装、hash/entrypoint/tools-list 校验、启动、卸载、回退。矩阵必须覆盖 Node-only、Python/venv、remote public、local private 和 Companion ingress，不用“代表 provider”替代异构运行时。
5. 扫描 exthost/renderer logs，必须无本扩展 error；当前 missing workflow module regression 必须通过。
6. 解包 VSIX，生成 content tree、SHA-256、SBOM、license、commit/dirty/environment manifest。
7. 只有第 2 步 package 命令生成并校验本轮 artifact manifest 后，才对**该 hash 的最终已安装 VSIX**重跑 260/320/360/600、Light/Dark/High Contrast、normal/reduced-motion、键盘、Panel serializer、CSP、设置不裸露与视觉层级矩阵；脚本发现旧 hash/mtime 或 development-host fallback 必须失败。
8. 执行五平台 fixture golden path 和一个人工代表路径；通用提交 ceremony 用 mock。live submit 只在某 provider 单独通过条款/安全审批时作为条件证据，不能为满足总门临时开启。

**提交：** `chore(release): build verified next generation rc`

## INT-15：发布、观察与回退触发

1. 项目所有者安装后先核对真实 source hashes，执行 INT-04 同版 dry-run；显式确认后进入 MigrationCutoverBarrier，暂停学习事实命令、获取 writer lease、drain capture outbox、固定 shadow head/input digest，在空 staging namespace materialize/replay 校验后冻结 v1 writer并原子切 `readState` pointer。失败不改 pointer并立即安装已验证 rollback-compatible VSIX/v1 read-only，不覆盖源文件。
2. 完成真实迁移后进行 24h local soak；再小批朋友，最后完整朋友组。
3. 默认 flags：new event capture/UI on；`readState` 仅在该用户迁移成功后 on；bandit off；platform commit 全 off，按审计逐平台开。
4. 观察指标：activation/crash、event/replay、provider health、operation failure、token/latency、confirm cancel/outcome unknown、privacy scanner。
5. 自动回退触发：event corruption、disabled reactivation、leak、duplicate/wrong submit、migration hash mismatch、release activation failure。
6. 体验问题可只回 UI surface；平台问题按 operation 回 provider；学习策略问题回 reducer/controller/read pointer。
7. 一个发布周期后审阅 legacy reader/old UI removal，不在 RC 当天删除回滚路径。

**提交：** `docs(release): record rollout evidence and rollback triggers`

## 完成定义

- release bundle 不漏运行依赖，fresh install/activation/golden path 通过。
- 迁移在真实数据副本上幂等，旧文件 byte-identical，回滚可用。
- 五平台能力诚实，代表导题/运行/提交或 manual terminal path 通过。
- 真实提交无确认不可达，response lost 不重复提交。
- autocomplete/隐私/发行物 canary 泄漏为 0。
- UI 真实 Extension Host 矩阵通过。
- 至少 30 个朋友任务达到系统安全门；结论措辞不越过证据。
