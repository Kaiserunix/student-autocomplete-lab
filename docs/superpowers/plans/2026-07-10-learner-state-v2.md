# Learner State v2、教学控制器与推荐策略实施计划

> 前置：FND 事件/Artifact/Attempt/SafetyOverlay 通过；UI-02 Coordinator/Projector 可消费 v2 投影。所有 live model/朋友内测运行默认关闭，需显式预算。

## 目标

- 从结构化事件重放出可解释、紧凑、带不确定度的 `LearnerStateV2`。
- LLM 只生成 E0 候选；掌握/加难由 E2–E5 规则决定。
- 每 turn 一个教学动作；答案揭示受明确动作门控制。
- 推荐硬过滤后多目标排序，理由完整；探索默认 off。
- 冻结 v1，shadow 比较、一次切主读、一键回滚。

## 新依赖

```text
@stdlib/stats-base-dists-beta-quantile@0.2.3
fast-check@4.9.0 (dev)
```

锁定版本并记录许可证；若包体显著增加 release，改为构建时 tree-shaken import，不能用未经验证的自写近似替代。

## LRN-01：建立 EvidenceCaptureService 与旧工作流映射

**新增：**

- `src/application/learner/EvidenceCaptureService.ts`
- `src/infrastructure/storage/EvidenceCaptureOutbox.ts`
- `src/application/learner/EvidenceLevelPolicy.ts`
- `src/application/learner/LegacyAttemptEventAdapter.ts`
- `test/application/evidenceCaptureService.test.ts`

**修改：** 当前提示、追问、评分、放弃、归档、推荐 handler 先旁路 capture

1. 先写 mapping tests：每个旧动作产生哪个 v2 event/level；attempt/document/operation start 与 terminal 生命周期完整；`UNKNOWN completed` 必须 E1 unknown；AI estimate E0/E1；verified OJ E4；answer reveal 记录 exposure。
2. capture 只 append，不改当前 v1 状态/推荐/UI；flag `workbench.v2.events.capture` 默认 internal on/public off。shadow namespace 与 canonical read pointer 分离。
3. 对同一 requestId/action 建幂等 correlation；teaching action 使用复合 `uniquenessKey`，重复按钮、不同 peer 或不同 requestId 也只能写一次。
4. 代码只通过 ArtifactStore；event 不含 source。
5. 每个会改变 v1 学习事实的产品动作执行前，必须先 append canonical shadow event，或至少 fsync 一个带稳定 captureId/requestId/occurredAt/payload hash 的 `EvidenceCaptureOutbox` write-ahead record；随后才能执行 v1 side effect。EventStore 恢复后按 captureId 幂等 drain。若 event 与 outbox 都无法持久化，则阻断该产品动作并给本地可重试错误，禁止制造只存在于 v1 的新事实；普通编辑器文本输入不属于 v1 side effect。
6. 测 event append 失败后 outbox backfill、进程在 v1 side effect 前后崩溃、重复 drain、磁盘满双失败阻断；发布门要求 outbox depth=0、oldest age=0，或有明确 quarantine 阻断切换。

```powershell
npx vitest run test/application/evidenceCaptureService.test.ts
```

**提交：** `feat(learner): capture v2 evidence beside legacy workflows`

## LRN-02：实现 v1 archive/apply migration 与差异输入

**修改/新增：**

- `src/cli/learnerV2Migration.ts`
- `src/infrastructure/storage/LegacyLearningArchive.ts`
- `src/infrastructure/storage/LegacyEvidenceMigrator.ts`
- `test/infrastructure/legacyLearningMigrationApply.test.ts`
- `docs/migrations/learner-v2.md`

1. 在 FND dry-run 上增加 materialize，需要 `--confirm-manifest-hash`；“空目标”只指新建 staging namespace，现有 shadow capture log/outbox 可以非空，source 与 active shadow 永不原地写。
2. archive manifest 包含 v1 Profile/Skill/versions/Attempts/Teacher Packs 的 path/bytes/hash/schema；Teacher Pack 只归档，不迁 learner evidence。
3. correction 与 disabled/re-enabled 分开迁移：纠偏只产生 correction，治理只产生唯一 `skill_governance_changed`；legacy summary -> E0；legacy attempts -> E1；可验证 OJ provenance 才 E4。
4. 输入是 frozen legacy archive + shadow event log watermark + 已 drain outbox。按稳定 captureId/requestId/sourceLegacyRecordId 去重：capture 期已有 v2 event 时不再从 legacy 造副本；保留原 eventId/occurredAt/provenance，重新分配 staging sequence/hash，并记录 source chain hash。
5. materialize 在 `MigrationCutoverBarrier` 下暂停会改变学习事实的产品命令、获取同一 EventStore lease、drain outbox、固定 source hashes/head watermark，构建并 replay 校验 staging 后原子切 pointer；超时/失败不切 pointer并恢复 shadow writer。用户编辑不暂停。
6. 重复 materialize 检测 migration input digest，输出 no-op；staging 部分存在且 hash 不符则停止。测试 capture/legacy 重叠、watermark 后请求、crash before/after pointer swap、17 versions、损坏 JSONL、BOM、时钟倒退、duplicate event IDs。
7. 输出 `legacy-v2-input-report.json`，不包含原文/代码/题面。

**提交：** `feat(migration): archive v1 and materialize evidence safely`

## LRN-03：实现加权 Beta-Bernoulli Reducer

**新增：**

- `src/domain/learner/stateV2.ts`
- `src/domain/learner/reducerV2.ts`
- `src/domain/learner/mastery.ts`
- `src/domain/learner/forgetting.ts`
- `src/domain/learner/evidenceWeight.ts`
- `test/domain/learnerReducerV2.test.ts`
- `test/domain/masteryMath.test.ts`

**修改：** package dependencies/lock

1. 先写数值测试：prior Beta(2,3)、E2/E3/E4/E5 pass/fail、hint discount、answer risk zero positive weight、24h retry 0.25、duplicate independence 0、E5 validation/downgrade、mastery 与 misconception 相反方向参考向量、half-life 30/60、time rollback/future timestamp clamp。
2. 用 stdlib beta quantile 计算 95% credible interval；测试固定参数的 reference values 与 monotonicity。
3. `reduceLearnerState(events, replayContext)` 是纯函数；`LearnerReplayContextV2` 显式包含 `evaluatedAsOf` 与 reducer/taxonomy/policy versions，不读 Date/global state；state/checkpoint hash 包含完整 context。
4. fast-check properties：
   - 相同 event stream + 相同 replay context 得到 deterministic state hash；不同 `evaluatedAsOf` 不误报 mismatch；
   - duplicate event 无效果；
   - 增加 independent pass 不降低 mean；
   - 增加 independent fail 不提高 mean；
   - E0/E1 不改变 alpha/beta；
   - decay 向 prior 收敛；
   - occurredAt 倒退或晚于 evaluatedAsOf 时 Δt 仍 ≥0、decay factor ≤1、posterior 不被放大，并记录 deterministic clock anomaly；
   - 重排同 sequence 被拒绝，不静默排序。
5. State 只保存 compact counts/posterior/due/action/recommendation refs；禁止全文。

```powershell
npx vitest run test/domain/masteryMath.test.ts test/domain/learnerReducerV2.test.ts
```

**提交：** `feat(learner): derive explainable mastery from evidence`

## LRN-04：状态门、冲突与不可绕过治理

**新增：**

- `src/domain/learner/skillLifecycleV2.ts`
- `src/domain/learner/conflicts.ts`
- `src/domain/learner/governance.ts`
- `test/domain/skillLifecycleV2.test.ts`
- `test/domain/learnerGovernance.test.ts`

1. 状态门精确实现：candidate、practicing、transfer_ready、mastered、conflicted、stale、disabled。
2. 测试 mastered 必须 CI low≥0.80 + 两题族 E5 + 一次 delay≥168h + 无 answer risk。
3. difficulty-up policy：CI low≥0.65 + recent E5 + prerequisite low≥0.70。
4. user correction 使 target attribution 在 replay 中失效，后继 state 重算；不是追加反向分数。
5. E3+ 正反冲突 -> conflicted；不得取平均后继续 mastered。
6. disabled tombstone 来自 SafetyOverlay；legacy rollback/reducer pointer 无法移除。`state="enabled"` 必须由 user_governance producer 生成，携带未使用 userIntentId，并让 `clearsDisabledEventId` 精确等于当前 tombstone；引用旧 tombstone 的迟到 re-enable 只产生 conflict。旧 `skill_disabled/skill_reenabled` 只在 migration adapter 输入存在，不能进入 v2 log。
7. 测试回滚到禁用前 snapshot、模型同名候选、stale transfer、relabel、correction target missing、disable A -> enable A 延迟 -> disable B 的乱序，以及重复 userIntentId。

**提交：** `feat(learner): enforce transfer and governance lifecycle gates`

## LRN-05：实现确定性代码/OJ 证据 producers

**新增：**

- `src/application/learner/evidence/CodeSnapshotProducer.ts`
- `.../CompilerEvidenceProducer.ts`
- `.../StaticRuleEvidenceProducer.ts`
- `.../DynamicRunEvidenceProducer.ts`
- `.../OjEvidenceProducer.ts`
- `.../TransferEvidenceProducer.ts`
- `test/application/evidenceProducers.test.ts`

1. Code snapshot 只记录 artifact/hash，不产生 pass/fail。
2. 编译错误可 E2 fail；“无编译错误”不能自动证明某技能 E2 pass，除非 skill-specific rule 明确。
3. Static rules 每条有 analyzer version、skill mapping、false-positive fixtures；不可达代码结果标 scope，不覆盖动态证据。
4. local samples/oracle -> E3；OJ terminal verified -> E4；手工 verdict 默认 E1，除非有可验证 provenance/人工确认。
5. Transfer producer 验证 unseen problem、family、surface distance、delay、hint units、answer/autocomplete exposure；不满足则降级。
6. fixture 覆盖 sample pass + OJ WA、答案揭示后 AC、两道变量改名题、同题重跑、跨语言。

**提交：** `feat(evidence): prefer compiler run and oj facts over model guesses`

## LRN-06：定义 LLM candidate contract 与教学安全 gate

**新增：**

- `src/domain/teaching/candidates.ts`
- `src/application/teaching/TeachingCandidateGateway.ts`
- `src/application/teaching/TeachingSafetyGate.ts`
- `src/application/teaching/LearnerFacingBlockValidator.ts`
- `src/application/teaching/ValidatedBlockPublisher.ts`
- `src/teaching/teachingPromptV2.ts`
- `test/teaching/teachingCandidatesV2.test.ts`
- `test/teaching/teachingSafetyGate.test.ts`
- `test/teaching/learnerFacingBlockValidator.test.ts`

1. 输出 schema 最多 3 candidates；字段仅 move、targetSkillIds、rationale、answerRisk、expectedEvidence；不允许直接 status/mastery/recommendation/submit。
2. Prompt 明确 LLM 是候选建议器；输入使用确定性 evidence + compact teaching summary，不发完整 Student Skill/timeline。
3. Safety gate 拒绝完整解、标准答案、跨越子目标、disabled skill、与 E3/E4 冲突却无说明的 attribution。
4. learner-facing 内容使用结构化 block；简单动作优先受控模板。所有 block 在第一个 UI block 前整体完成 schema、答案/参考解相似度、完整代码、跨子目标、敏感字段和 prompt-injection 检查。gate 用私有构造器/opaque brand 生成 receipt + contentSha256；只有 `ValidatedBlockPublisher` 能映射 `coach.block`，裸 string/raw delta 编译和 runtime 都失败。
5. parser failure 不重试无限；一次 repair 后 fallback deterministic action，记录 parser error/token。
6. 测试 `OjProblemDocument` / MCP output 中的 prompt injection 不能改变 output schema 或调用工具；正常 hint 使用答案/完整代码 canary，任何片段在验证前不得 postMessage。
7. E0 event 保存 labels/misconceptions/action refs/prompt hash，不保存 prompt/raw response 到长期 learner log。

**提交：** `feat(teaching): constrain llm to auditable action candidates`

## LRN-07：实现单动作 TeachingActionController

**新增：**

- `src/domain/teaching/moves.ts`
- `src/domain/teaching/TeachingActionController.ts`
- `src/domain/teaching/TeachingPolicy.ts`
- `test/domain/teachingActionController.test.ts`
- `fixtures/teaching-controller/scenarios.json`

1. 输入：attempt state、latest deterministic evidence、LearnerState summary、assistance load、candidate actions、SafetyOverlay。
2. 输出恰一个 move 或 explicit no-action/review；最终 append 使用 `attempt/{attemptId}/turn/{turnId}/teaching_action_issued` uniqueness key，在 EventStore 跨进程临界区原子去重。
3. 优先：未回答 checkpoint -> 证据诊断 -> nudge -> code_anchor/counterexample -> worked_substep -> self-explanation/hint fade -> transfer probe。
4. `lesson` 只在 explicit abandon/reveal；正常 hint 不得给完整代码。
5. 测试 30+ pressure scenarios：初次错误、重复失败、学生问闲聊、模型候选全不安全、disabled target、sample/OJ conflict、hint burden、answer exposure、offline/model unavailable。
6. fast-check：任意 candidate list 最多一个 issued；unsafe candidate 永不 issued。

**提交：** `feat(teaching): select exactly one safe pedagogical move`

## LRN-08：接入 SessionCoordinator 与事件化教学循环

**新增/修改：**

- `src/application/teaching/TeachingApplicationService.ts`
- `src/application/workbench/SessionCoordinator.ts`
- 旧 `src/teaching/workflow/*` 适配器
- `test/application/teachingApplicationService.test.ts`

1. flow：collect facts -> optional candidate call -> controller select -> atomic append `teaching_action_issued` -> generate and fully validate learner-facing blocks -> `ValidatedBlockPublisher` publish `coach.block` stream -> append completed/feedback/checkpoint。
2. block stream 不写 mastery；cancel/failed 不形成 completed action。接线测试证明 MessageRouter 无 model-stream import，raw string 无法满足 HostEvent schema。
3. 每 turn unique action；两个 peer 使用不同 requestId 并发请求仍只有一条 action event；duplicate request/late response 不重复写。
4. 当前代码与 selected problem 必须由 DocumentBinding hash 校验；漂移要求用户确认/重新绑定。
5. 完成/放弃/优化都走同一 EvidenceCapture/Review path，消除 v1 提示路线与完成路线旁路。
6. shadow 模式同时运行 v1 diagnosis 和 v2 controller，但只显示 v1；报告 action/target/cost 差异。

**提交：** `feat(teaching): run evidence-first session teaching loop`

## LRN-09：实现 RecommendationV2 硬过滤

**新增：**

- `src/domain/recommendation/hardFiltersV2.ts`
- `src/domain/recommendation/candidateV2.ts`
- `src/domain/recommendation/filterReasons.ts`
- `test/domain/recommendationHardFiltersV2.test.ts`

1. 迁移并强化 current/recent/completed/abandoned/revealed/deleted 排除。
2. 硬门：disabled、platform unavailable/compliance、prerequisite、repeated failure/no level jump、no E5 no harder、transfer unseen/distance/delay、answer exposure、generated oracle、autocomplete boundary。
3. 每个拒绝候选输出稳定 reason code；不得默默 drop。
4. 测试用户禁用技能仍有 stale transfer、UNKNOWN completed、同构题、平台 degraded、无题面/runner、多个主技能混杂 probe。
5. 旧 candidate pool 通过 adapter；OjBroker provider candidates 同一 contract。

**提交：** `feat(recommendation): filter unsafe and invalid candidates first`

## LRN-10：实现多目标排序与可见解释

**新增：**

- `src/domain/recommendation/rankerV2.ts`
- `src/domain/recommendation/RecommendationDecision.ts`
- `src/domain/recommendation/explainV2.ts`
- `test/domain/recommendationRankerV2.test.ts`

1. 实现固定权重公式；所有 factors 0..1，policy version 存入 decision。
2. 排序 deterministic tie-break：score desc -> source quality -> difficulty -> canonical problem key。
3. 每 eligible decision 至少一个 visible reason，必须解释 target skill、difficulty/transfer、why-not-harder/why-not-repeat。
4. disabled/risk 不能靠负分“沉底”，必须硬过滤。
5. snapshot tests 覆盖 top mismatch pairs，不只 aggregate score。
6. `recommendation_decided` 不等于曝光。Application 先为一次有意呈现 mint 稳定 presentationId；UI 在窗口可见且条目可见比例 ≥0.5 持续 ≥1000ms 后发送 `recommendation.visible`，Host 校验当前 projection 后用 `recommendation/{presentationId}` 原子去重并写 `recommendation_presented`，包含 impression/slate/surface/position/propensity/visibility。reload/重复 observer 不计新曝光；新的有意重呈现必须 mint 新 presentationId。chosen/dismissed/deferred 分别写事件且不加 mastery。

**提交：** `feat(recommendation): rank safe candidates with visible reasons`

## LRN-11：只实现 propensity 日志与 bandit shadow，不上线探索

**新增：**

- `src/domain/recommendation/BanditPolicy.ts`
- `src/domain/recommendation/LinUcbShadow.ts`
- `src/application/recommendation/RecommendationExperimentLog.ts`
- `test/domain/recommendationBanditSafety.test.ts`

1. 默认 `exploration.enabled=false`；不足 1,000 条带 slate/position/propensity 的安全真实 presentation 时 controller 返回 deterministic；仅计算未展示的 decision 不计数。
2. LinUCB 输入仅 hard-filtered candidates；exploration contribution cap 0.05。
3. 测试任何 bandit score 不能恢复 filtered candidate/加难/disabled。
4. deterministic historical events 无 propensity 标记 `not_replayable_for_bandit`。
5. shadow 只记录排序差异、propensity、features hash，不改变 UI；没有 presentation/reward window 的记录不进入离线效果估计。

**提交：** `feat(recommendation): add disabled-by-default safe bandit shadow`

## LRN-12：compact teaching summary 与 60% token 门

**新增：**

- `src/domain/learner/teachingSummaryV2.ts`
- `test/domain/teachingSummaryV2.test.ts`
- `fixtures/learner-state/token-baseline.json`

1. Summary 只含 top unresolved skills（id/status/mean/CI short）、disabled ids、最近纠偏 refs、assistance level、due probe；不含 rules/examples/narrative。
2. 基线固定当前 v1 summary serialization（约 474 chars/136 token 粗估）和 replay fixture distribution。
3. 使用项目 tokenizer 若 provider 提供；否则 char estimate 标明 estimate。目标 median ≤40% baseline，即 ≤54 tokens。
4. 测试减少 token 后 Controller 在 golden scenarios 的 action/target hard-gate 一致；不能只满足体积。
5. Prompt section telemetry 验证 learnerState 独立记录。

**提交：** `perf(learner): compress teaching state without losing hard rules`

## LRN-13：replay、校准与差异 CLI

**新增：**

- `src/application/learner/LearnerReplayService.ts`
- `src/application/learner/LearnerCalibration.ts`
- `src/cli/learnerV2Replay.ts`
- `src/cli/learnerV2Eval.ts`
- `test/application/learnerReplay.test.ts`
- `fixtures/learner-replay/`

**修改：** package scripts

```json
{
  "replay:learner-v2": "npm run compile && node dist/src/cli/learnerV2Replay.js",
  "eval:learner-v2": "npm run compile && node dist/src/cli/learnerV2Eval.js"
}
```

1. Replay compare 明确接收 `--as-of` 与 reducer/controller/recommender versions，输出 replay context、state hash、transitions、mismatch pairs、hard gates、token/cost。
2. 固定 fixtures：candidate/active/disabled/conflict/correction/rollback/transfer/answer exposure/UNKNOWN complete/duplicate/corrupt。
3. calibration：Brier、ECE、interval coverage；没有真实 label 时明确 simulated。
4. 报告区分 fixture、legacy replay、live user；不把 fixture E3 当真人学习。
5. 默认 `--no-write --provider fixture`；fixture 固定 `evaluatedAsOf`；live requires `--as-of --max-tokens --max-usd --confirm-live`。

```powershell
npm run replay:learner-v2 -- --fixture fixtures/learner-replay --no-write
npm run eval:learner-v2 -- --fixture fixtures/learner-replay
```

**提交：** `test(learner): add deterministic replay and calibration reports`

## LRN-14：shadow 报告与 v1/v2 差异审阅

**新增：**

- `src/application/learner/LearnerShadowComparator.ts`
- `src/cli/learnerV2ShadowReport.ts`
- `test/application/learnerShadowComparator.test.ts`

1. 对同一新事件 head 比较 v1 visible state（只读）与 v2：skill status、disabled、target action、recommendation、difficulty、token。
2. 差异分类：expected stricter、legacy unsupported、possible regression、safety improvement、unexplained。
3. 任何 disabled reactivation、无 E5 mastered/up、multi-action、answer leak 为 blocker，不可标 expected。
4. 使用真实 globalStorage 时只输出 ids hash/count/reasons，不复制原始内容。
5. 连续 30 个系统任务无 blocker 才允许进入 read cutover review。

**提交：** `feat(learner): explain legacy versus v2 shadow differences`

## LRN-15：实现切主读/回滚并在副本演练

**修改：**

- `src/application/config/WorkbenchFeatureFlags.ts`
- `src/application/workbench/UiProjectorV2.ts`
- `src/application/teaching/TeachingApplicationService.ts`
- `src/application/recommendation/*`
- `src/ui/webview/learning-review/*`
- `test/application/learnerV2Cutover.test.ts`

1. flag 顺序：capture -> shadowReduce -> shadowRecommend -> controllerPilot -> cutoverRehearsal -> readState。
2. cutover 前写 checkpoint：event head/reducer/taxonomy/policy/state hash + v1 archive manifest hash。
3. 本任务只在 fixture/脱敏副本切 main read pointer；不逐字段混读 v1/v2。真实用户数据的 apply/read cutover 由 INT-15 在 INT-04 与 INT-13 通过后执行。
4. rollback command 选择已验证 pointer set；SafetyOverlay 永远叠加。
5. 测试切 v2 -> v1 read-only -> v2：事件 head 不变、state hash 重现、disabled 不复活、UI 不丢 attempt。
6. rehearsal cutover 后 v1 写入 hard fail/告警；生产切换前所有新用户动作已经先写 v2 facts。保留 reader/renderer 和 rollback-compatible VSIX 一个发布周期。

**提交：** `feat(learner): cut over v2 state with pointer rollback`

## LRN-16：朋友内测任务与结论门

**新增：**

- `docs/internal-testing/learner-v2-protocol.md`
- `fixtures/friend-beta/task-catalog.json`
- `src/cli/friendBetaReport.ts`
- `test/cli/friendBetaReport.test.ts`

1. 系统 Gate A 至少 30 tasks，覆盖五平台代表导题、四语言、提示层级、检查点、运行、完成/放弃、离线、错误、提交确认取消、复盘、推荐。
2. task record 不保存用户名/原始代码；参与者使用本地随机 ID；同意和删除说明明确。
3. 输出安全/系统指标：crash、event completeness、replay、recovery、token、latency、parser errors、leak、confirmation。
4. 学习 Gate B 使用 `strategy-research.md` 已定义的 Day 0/1-7/8/22 未见与延迟迁移协议；它不属于首发 Gate A。样本不足只做 case series，不临时改设计宣称效果。
5. 报告模板强制选择 claim level：`system_metric | usability_observation | learning_correlation | learning_effect`；没有合格设计不能选择 effect。

**提交：** `test(beta): define learner v2 friend task and claim gates`

## LRN-17：Learner v2 验收

```powershell
npx vitest run test/domain/learnerReducerV2.test.ts test/domain/skillLifecycleV2.test.ts test/domain/learnerGovernance.test.ts
npx vitest run test/domain/teachingActionController.test.ts test/domain/recommendationHardFiltersV2.test.ts test/domain/recommendationRankerV2.test.ts
npm run replay:learner-v2 -- --fixture fixtures/learner-replay --no-write
npm run eval:learner-v2 -- --fixture fixtures/learner-replay
npm run compile
npm test
npm run package:beta-release
npm run check:hygiene
git diff --check
```

报告必须列：hard gates、top mismatches、token section median、usage/retries/errors、simulated vs human、rollback rehearsal、v1 archive hashes。任何 disabled reactivation、无 E5 mastered/up、多动作、无理由推荐、答案/补全泄漏均阻断。

**提交：** `chore(learner): record v2 evidence strategy acceptance`

## 完成定义

- State 可由事件 deterministic replay；v1 只读归档。
- LLM 只写 E0 candidate；E0/E1 不改 mastery。
- mastered/up 严格依赖 E5；disabled overlay 不可被 rollback 绕过。
- 每 turn 一个动作，取消/失败流不污染状态。
- 推荐 hard filter 后排序，理由完整，bandit 默认 off。
- learner prompt section 中位数较固定基线下降 ≥60%。
- 30-task 系统内测报告可生成；没有人类迁移证据不声称学习提升。
