# 事件与契约基座实施计划

> 本计划是其余 MCP、UI、Learner v2 三份实施计划的共同前置。实施时使用独立 worktree，不在用户当前 dirty 工作树上直接改。

## 目标

建立唯一 ID/时间/哈希规范、append-only 事件与 artifact store、Attempt 状态机、legacy 归档与迁移框架、不可回滚安全 overlay、autocomplete 完整请求体边界和可归因成本观测。完成后不切换主 UI/主画像，但新事件可 capture/shadow replay。

## 依赖与范围

- 起点：`098365f2f18a758692a493e9b7b31fe7fe71e163` 加用户选择保留的 dirty 改动。
- 新依赖仅 `uuid@11.1.0`（提供 v7）；不引入数据库。
- 不接五平台、不上线 React、不改变真实提交行为。
- 所有迁移先 dry-run；不原地覆盖 v1。

## FND-01：创建实施工作树并重放可信基线

**文件：** 无业务文件；生成 `.runtime/baseline/foundation-start.json`（忽略文件）

1. 从用户确认的实现起点创建 `codex/next-gen-foundation` worktree。
2. 记录 HEAD、branch、dirty diff hash、Node/npm/VS Code、已安装扩展版本。
3. 运行：

```powershell
npm ci
npm run compile
npm test
npm audit --json
```

4. 预期：compile 通过；完整测试至少保持基线数量；audit 告警原样记录，不在本提交混改。
5. 对照 [baseline-audit.md](../../next-gen/baseline-audit.md) 复现 release 激活缺模块并记录红灯；若尚未由已批准提交修复，立即转入 INT-02 最小 bundle/installed-VSIX 闭环，INT-02 通过前不开始 FND-02。

**提交：** 无代码提交；只产生忽略的运行证据。

## FND-02：统一 UUIDv7、Clock、canonical JSON 与 SHA-256

**新增：**

- `src/domain/shared/ids.ts`
- `src/domain/shared/clock.ts`
- `src/domain/shared/canonicalJson.ts`
- `src/domain/shared/hash.ts`
- `test/domain/sharedPrimitives.test.ts`

**修改：** `package.json`、`package-lock.json`

1. 先写失败测试：
   - 10,000 个 `newUuidV7()` 全唯一，解析为 UUID v7；
   - 同毫秒生成的 ID 保持可排序；
   - fake clock 可注入；
   - canonical JSON 不受 object key insertion order 影响；
   - `undefined` 被拒绝，不被静默丢弃；
   - 相同 canonical value 得到相同 SHA-256。
2. 运行：

```powershell
npx vitest run test/domain/sharedPrimitives.test.ts
```

预期首次失败：模块不存在。

3. 最小接口：

```ts
export interface Clock { now(): Date }
export const systemClock: Clock;
export function newUuidV7(): string;
export function canonicalJson(value: JsonValue): string;
export function sha256Text(value: string): string;
```

4. 禁止用 `JSON.stringify` key 顺序偶然性作 event hash；禁止 eventId 依赖 wall clock 单独唯一。
5. 重跑 targeted + compile。

**提交：** `feat(domain): add deterministic ids clock and hashing`

## FND-03：定义版本化 LearnerEvidenceEvent envelope

**新增：**

- `src/domain/learner/evidence.ts`
- `src/domain/learner/evidenceSchemas.ts`
- `src/domain/learner/evidenceIntegrity.ts`
- `test/domain/learnerEvidenceSchema.test.ts`
- `fixtures/learner-events/v1/valid.jsonl`
- `fixtures/learner-events/v1/invalid.jsonl`

1. 依据 Learner v2 分册实现 discriminated union，覆盖 attempt/document/operation/submit authorization 生命周期，以及 code/static/dynamic/OJ/question/hint/checkpoint/explanation/completion/abandon/reveal/LLM candidate/action/transfer/correction/统一 governance/recommendation decision-presentation-disposition。
2. 先测试：
   - 每个 event type 一条 roundtrip fixture；
   - E0 LLM event 不允许伪装 `attribution: deterministic`；
   - E5 必须有 transfer metadata、unseen problem、delay/surface distance；
   - raw code 不能出现在 event payload，只能 artifactRef/hash；
   - lifecycle event 未成对时可投影 recovering；authorization event 不含 proof/nonce/secret；
   - disabled/re-enabled 只有 `skill_governance_changed` 一种规范表示；enabled 缺 clearsDisabledEventId/userIntentId 时 parse fail；
   - recommendation presentation 必须带唯一 presentation/impression、surface/visibility、slate/position/propensity；
   - `recordedAt/sequence/integrity` 缺失时 parse fail；
   - unknown schema version 返回 typed `unsupported_schema`。
3. 运行：

```powershell
npx vitest run test/domain/learnerEvidenceSchema.test.ts
```

预期首次失败：schema/module 不存在。

4. Zod schema 是 runtime boundary；TypeScript type 由 schema 推导或通过 `satisfies` 保持一致。
5. `sealEvent(previousHash, unsealedEvent)` 计算 canonical content hash；测试任何字段变化都会改变 hash。

**提交：** `feat(events): define learner evidence v1 contract`

## FND-04：实现单写者 EventStore、损坏恢复与 replay

**新增：**

- `src/infrastructure/storage/LearnerEventStore.ts`
- `src/infrastructure/storage/EventSequenceStore.ts`
- `src/infrastructure/storage/EventLogRecovery.ts`
- `test/infrastructure/learnerEventStore.test.ts`
- `test/infrastructure/learnerEventStoreMultiProcess.test.ts`

1. 失败测试覆盖：
   - 并发 100 append 最终 sequence 连续且 hash chain 有效；
   - duplicate eventId 幂等返回已有位置；
   - duplicate request correlation 不重复 append；
   - duplicate `uniquenessKey` 在不同 requestId/不同进程下只 append 一次；
   - 两个进程对同一 attemptRevision 做不同 request compare-and-append 时恰好一个成功，失败者得到 current revision 且无第二条事实；
   - 尾部半条 JSON 被隔离，有效前缀仍可 replay；
   - 中间记录损坏使 store 进入 read-only degraded，不越过损坏继续构造假链；
   - 系统时间倒退不改变 sequence；
   - replay 可从 sequence/checkpoint offset 开始；
   - AbortSignal 在 append 前取消不写半条；
   - 两个独立 Node 进程共享 globalStorage 时 sequence/hash chain 连续；持锁进程被强杀后 lease 到期可恢复，未到期不可抢锁。
2. 运行 targeted，确认失败。
3. 实现两层 single-writer：进程内 queue + 跨进程 lease lock。lock 用 `open(..., "wx")` 创建，记录随机 writer instance id、PID、acquiredAt/heartbeat/expiresAt；append 前后校验 owner token，原子更新 heartbeat。只有 lease 过期且连续两次观察无进展才可 quarantine 旧 lock 并接管，不能仅凭 PID 判断。
4. sequence 分配、hash-chain head、eventId/request correlation/`uniquenessKey` 索引、attempt-scoped revision CAS、JSONL append 和 sidecar replace 都在同一跨进程临界区；`appendIfAttemptRevision(attemptId, expectedRevision, events)` 在锁内从可重建 stream-revision sidecar/log 校验并只在成功 append 后递增。`recordedAt` 也在锁内封印为不小于前一记录的值。每行 canonical JSON + newline；sidecar 丢失时从 log 重建。进程崩溃测试覆盖 lock 前、CAS 后 append 前、append fsync 后、sidecar replace 前四个点。
5. recovery 输出结构化结果，不自动删除损坏内容：

```ts
interface EventLogReadResult {
  events: LearnerEvidenceEvent[];
  head?: { sequence: number; hash: string };
  invalidRecords: Array<{ line: number; reason: string }>;
  writable: boolean;
}
```

6. 不同时更新 LearnerState；投影失败不回滚事实 append。

```powershell
npx vitest run test/infrastructure/learnerEventStore.test.ts test/infrastructure/learnerEventStoreMultiProcess.test.ts
```

**提交：** `feat(storage): add recoverable learner event store`

## FND-05：实现本地 Content-Addressed ArtifactStore

**新增：**

- `src/infrastructure/storage/LearnerArtifactStore.ts`
- `src/domain/learner/artifacts.ts`
- `test/infrastructure/learnerArtifactStore.test.ts`

1. 测试：同内容去重、hash/path 校验、atomic temp+rename、并发 put、错误 hash 拒绝、delete、orphan sweep dry-run、最大 bytes、禁止路径穿越。
2. Artifact metadata 只保存：kind、hash、bytes、createdAt、localOnly；代码内容不进入 event/log/telemetry。
3. 目录：`learnerArtifacts/sha256/<first2>/<fullHash>`；文件权限使用平台可用的最小权限，失败时报告而不宣称已加密。
4. 删除事件/attempt 时先 tombstone projection，再删除 artifact；物理 log compaction 在单独显式流程。

```powershell
npx vitest run test/infrastructure/learnerArtifactStore.test.ts
```

**提交：** `feat(storage): add local content addressed artifacts`

## FND-06：建立 Attempt v2 ID 与纯状态机

**新增：**

- `src/domain/attempt/schemaV2.ts`
- `src/domain/attempt/stateMachine.ts`
- `src/domain/attempt/projectAttempt.ts`
- `src/application/legacy/LegacyAttemptReadAdapter.ts`
- `test/domain/attemptStateMachineV2.test.ts`
- `fixtures/attempt-v2/state-sequences.json`

1. 测试每个合法状态序列：empty/preparing/coding/coaching/checkpoint/running/submit confirming/judging/reviewing/recommending/recovering；输入来自 FND-03 的 attempt/document/operation/submit lifecycle events。
2. 测试非法转换、stale revision、同题三次独立 attempt、跨语言新 attempt、archive 后重做、cancel/recovery、connectivity overlay。
3. `attemptId` 每次开始用 UUIDv7；`problemKey` 只索引。
4. project 函数只消费 events/capabilities，输出 deterministic stable state + revision；不读系统时间、VS Code 或 filesystem。`operation_started` 缺 terminal event 时重启投影为 recovering，不恢复虚假的 running/judging。
5. `LegacyAttemptReadAdapter` 精确定义 `readLegacyAttempt(problemKey): LegacyAttemptSnapshot | undefined`，只供旧 UI compatibility projection；当前 v1 `AttemptSession` 不修改、不切主读、不接受 v2 写回。

```powershell
npx vitest run test/domain/attemptStateMachineV2.test.ts
```

**提交：** `feat(attempt): add replayable attempt v2 state machine`

## FND-07：定义 SafetyOverlay 与 feature flag policy

**新增：**

- `src/domain/learner/SafetyOverlay.ts`
- `src/application/config/WorkbenchFeatureFlags.ts`
- `src/infrastructure/vscode/VsCodeFeatureFlagStore.ts`
- `test/domain/safetyOverlay.test.ts`
- `test/application/workbenchFeatureFlags.test.ts`

1. SafetyOverlay 至少包含：disabled skills、autocomplete hard policy、submit confirmation required、blocked provider operations。
2. 测试任何普通 flag、legacy rollback 或 state snapshot 都不能：
   - 复活 disabled；
   - 允许 autocomplete 读题面/答案；
   - 关闭真实提交确认；
   - 启用 policy-blocked provider commit。
3. 只有显式用户产生的 `skill_governance_changed(state="enabled")` 能解除单个 disabled tombstone；旧 `skill_reenabled` 只允许作为 migration adapter 输入，不能写入 v2 log。
4. flags 使用白名单和安全默认值，未知 key/版本拒绝；不通过环境变量暗开真实提交。

**提交：** `feat(safety): add non-bypassable policy overlay`

## FND-08：归档 v1 并实现只读迁移 dry-run

**新增：**

- `src/infrastructure/storage/LegacyLearningArchive.ts`
- `src/infrastructure/storage/LegacyEvidenceMigrator.ts`
- `src/cli/learnerV2Migration.ts`
- `test/infrastructure/legacyLearningMigration.test.ts`
- `fixtures/migration/legacy-global-storage/`

**修改：** `package.json`（新增 `migrate:learner-v2:dry-run`）

1. fixture 包含 v1 Profile、Skill、versions、AttemptEvents、AttemptSessions、损坏尾记录、disabled/correction、UNKNOWN completed。
2. 先测 dry-run：不修改 source；生成 archive manifest（path/bytes/hash）；重复两次输出 byte-stable。
3. 映射：
   - correction -> correction evidence event；
   - disabled/re-enabled -> 唯一规范 `skill_governance_changed` event；
   - verified user/OJ evidence 有 provenance 才映相应级别；
   - legacy summary/skill -> E0；
   - legacy AttemptEvent -> E1；
   - UNKNOWN completed 不映 success；
   - 无法判断记录列入 `unmigrated`，不猜。
4. 输出差异报告：events by level/type、dropped/unmigrated reasons、禁用 tombstones、hashes、预计 replay state。
5. apply 模式必须另有 `--confirm-manifest-hash`；本任务只实现并验证 dry-run。

```powershell
npm run compile
node dist/src/cli/learnerV2Migration.js --source fixtures/migration/legacy-global-storage --dry-run
npx vitest run test/infrastructure/legacyLearningMigration.test.ts
```

**提交：** `feat(migration): add idempotent learner v2 dry run`

## FND-09：收紧 AutocompleteContextGatekeeper

**新增：**

- `src/autocomplete/ContextGatekeeper.ts`
- `src/autocomplete/safeRequest.ts`
- `src/autocomplete/requestAudit.ts`
- `test/autocompleteContextBoundaryV2.test.ts`
- `fixtures/autocomplete-leakage/`

**修改：**

- `src/autocomplete/context.ts`
- `src/autocomplete/inlineProvider.ts`
- `src/autocomplete/mimoAutocomplete.ts`
- `src/autocomplete/prompt.ts`
- `src/sidebar/ProblemBankViewProvider.ts`（仅把预览接到同一 Gatekeeper；若预览将删除则先禁用）
- 相关现有 autocomplete tests

1. 先写 canary fixture：题面、Teacher Pack、答案、coach history、LearnerState、marker 后文本、文件目录名各有唯一 secret token。
2. 拦截完整 provider request，断言 token 不出现在：prompt、suffix、URL、headers、metadata、cache key、log event、preview result。
3. 光标在 start marker 前/end marker 后：返回 `blocked_outside_student_region`，不请求。
4. 混合练习模板无 marker：默认 block；纯代码 document 可按 file kind policy 处理。
5. `AutocompleteSafeRequest` 类型只允许 prefix/suffix/language/file label/habits/audit；删除 `activeProblem` 等扩展入口。
6. Inline、manual trigger、preview 都调用 `ContextGatekeeper.buildRequest`；禁止各自 sanitize。
7. 运行：

```powershell
npx vitest run test/autocompleteContextBoundaryV2.test.ts test/autocomplete.test.ts test/mimoAutocomplete.test.ts test/context.test.ts
```

预期第一次至少暴露 cursor-after-end-marker 与 suffix payload 风险；实现后泄漏为 0。

**提交：** `fix(autocomplete): enforce one full-request context boundary`

## FND-10：按用途与 prompt section 记录成本

**新增：**

- `src/models/ModelUsageEvent.ts`
- `src/models/PromptSections.ts`
- `src/infrastructure/storage/ModelUsageStore.ts`
- `test/models/modelUsageTelemetry.test.ts`

**修改：**

- `src/models/chatCompletionsClient.ts`
- `src/models/completionsClient.ts`
- `src/models/responsesClient.ts`
- 各 teaching request wrapper（只传 metadata/sections，不记录原文）

1. 新 schema：usageId、attemptId hash、purpose、provider/model/format、section char/token estimates、input/output tokens、latency、retry、parser errors、result category、occurredAt。
2. section 固定：system/problem/code/teacherPack/localEvidence/learnerState/history/outputSchema。
3. 测试 telemetry 不含 section text、code、problem、secret、raw response；未知字段在 writer allowlist 被丢弃/拒绝。
4. provider 未返回 token 时记录 estimate + `source=estimate`，不伪装 actual。
5. 旧 usage file reader 保留；报告将 fixture/test endpoint 与 live endpoint 分组。

```powershell
npx vitest run test/models/modelUsageTelemetry.test.ts test/chatCompletionsClient.test.ts test/completionsClient.test.ts test/responsesClient.test.ts
```

**提交：** `feat(observability): attribute model cost by purpose and section`

## FND-11：加入架构依赖门

**新增：**

- `test/architecture/dependencyBoundaries.test.ts`
- `docs/architecture/dependency-boundaries.md`

1. 用 TypeScript compiler API 解析 import graph，禁止：
   - `src/domain` import VS Code/fs/fetch/MCP/model/UI；
   - `src/application` import `src/infrastructure` 的具体实现；Application 只能依赖自身 ports 与 Domain，composition root 负责注入；
   - `src/autocomplete` import problemBank/teaching/learner/oj/ui；
   - `src/ui` 直接 import model clients/platform clients/JSONL stores；
   - platform providers import learner/recommendation。
2. 为迁移期 legacy exceptions 建精确文件 allowlist，每个 exception 带删除任务 ID；禁止 glob 放宽。
3. 测试引入一个 fixture violation 能稳定失败，随后删 fixture。

```powershell
npx vitest run test/architecture/dependencyBoundaries.test.ts
```

**提交：** `test(architecture): enforce domain and autocomplete boundaries`

## FND-12：基座验收与 checkpoint commit

1. 运行：

```powershell
npm run compile
npm test
npm run package:beta-release
npm run test:release
npm run migrate:learner-v2:dry-run -- --source fixtures/migration/legacy-global-storage
npm audit --json
git diff --check
```

2. 使用隔离的 VS Code 1.125.x `--user-data-dir`/`--extensions-dir` 安装刚生成的 release VSIX，验证扩展激活、视图注册和命令注册；源码 Extension Host 冒烟不能替代此项。
3. 报告：新增事件/schema 数、replay hash、migration idempotency、autocomplete canary count、usage section sample、安装版激活结果、未解决 audit。
4. 在真实用户 globalStorage 上只运行 `--dry-run`，输出写 `.runtime/migration-audit/`；不含原始内容。
5. 检查原 dirty worktree 未被改动。
6. 产出 foundation tag/commit hash，其他三计划 pin 此 commit。

**提交：** `chore(foundation): record event contract readiness gate`

## 完成定义

- 事件、ID、hash、Attempt 状态机可重放且 deterministic。
- EventStore 尾损坏可恢复，中间损坏只读降级。
- v1 archive/migration dry-run 幂等，不改源文件。
- SafetyOverlay 无法由普通 rollback/flag 绕过。
- autocomplete 完整请求体 canary 泄漏为 0。
- 模型成本可按 purpose/section 归因且不记录原文。
- 完整 compile/tests 和隔离 profile 安装版激活通过；没有业务主读切换。
