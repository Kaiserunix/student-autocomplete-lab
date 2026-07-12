# OJ MCP 联邦实施计划

> 前置：事件与契约基座 FND-01～FND-12 已通过并固定 commit。该计划涉及扩展仓库、现有 `luogu-mcp-server`，以及一个新的外部 adapter monorepo；不同仓库分开提交，不做跨仓库半提交。

## 目标

- 外部洛谷 Server 成为唯一洛谷权威实现；扩展内路径安全退役。
- 扩展建立类型化 `OjBroker`、能力/风险 policy、分层 health、SecretStorage 与 VS Code MCP definitions。
- 五平台至少能诚实探测能力并完成代表性导题；支持的平台完成本地运行。
- 真实提交采用 prepare/preview/native confirm/commit/poll；默认全部 live commit 关闭。

## 仓库

```text
C:\Users\qwerf\Desktop\student-autocomplete-lab
C:\Users\qwerf\Desktop\luogu-mcp-server
C:\Users\qwerf\Desktop\oj-mcp-adapters        # 新外部 monorepo，实施时创建
```

`jinzcdev/leetcode-mcp-server` 以保留 upstream history 的 subtree/package 进入 `oj-mcp-adapters/packages/leetcode`，不再形成第四个发布仓库。任何新仓库先记录 upstream、license、commit、package lock 和 SBOM。不得 `npm install -g`，不得使用 `@latest`。

## MCP-01：冻结 OJ contract artifact 与 provider manifest schema

**扩展新增：**

- `src/domain/oj/contracts.ts`
- `src/domain/oj/schemas.ts`
- `src/domain/oj/providerManifest.ts`
- `scripts/exportOjSchemas.js`
- `resources/oj-contract/v1/*.schema.json`
- `test/domain/ojContracts.test.ts`

**修改：** `package.json`

1. 将 MCP 分册中的 `OjPlatformId`、`OjCapabilities`、`OjProblemRef/Summary/Document`、`OjSearchRequest/Result`、`OjImportWindowRequest/Window/Preview`、`OjRunRequest/Result`、`OjPrepareSubmissionRequest`、`OjSubmitPreview/CommitRequest/Result`、`OjSubmissionEvidence`、`OjProviderHealth`、`OjError` 落成 Zod + TypeScript。
2. 失败测试：每个 fixture roundtrip；unknown version、缺 provenance、WA 被当 error、R4 标 read-only、commit result 缺 hash 均失败。
3. `npm run generate:oj-contracts` 生成稳定排序 JSON Schema；第二次运行 `git diff --exit-code`。
4. provider manifest：

```ts
interface OjProviderArtifactDescriptorV1 {
  sourceUrl: string;
  repository: string;
  version: string;
  commit: string;
  os: string[];
  arch: string[];
  runtime: string;
  archiveSha256: string;
  filesSha256: string;
  signatureOrAttestation?: string;
  sbomSha256: string;
  license: string;
}

interface OjProviderEntrypointV1 {
  id: "agentReadOnly" | "productPrivate" | "remotePublic";
  transport: "local_stdio" | "remote_http";
  command?: string;
  args?: string[];
  url?: string;
  expectedTools: Array<{ canonical: OjCapabilityName; upstream: string; schemaSha256: string; risk: OjOperationRisk }>;
  allowedRisks: OjOperationRisk[];
  secretRefs?: Array<{ logicalName: string; secretStorageKey: string; envName: string; required: boolean }>;
}

interface OjProviderManifestV1 {
  schemaVersion: "oj-provider-manifest/v1";
  providerId: string;
  platform: OjPlatformId;
  minimumExtensionVersion: string;
  installDirectoryLayout: string;
  artifacts: {
    active: OjProviderArtifactDescriptorV1;
    rollback: OjProviderArtifactDescriptorV1;
  };
  entrypoints: OjProviderEntrypointV1[];
  expectedProtocol: "2025-11-25";
}
```

5. manifest 明文 args 禁止匹配 cookie/token/key/password；凭据只用每个 entrypoint 自己的 `secretRefs` logical mapping。Agent entrypoint 的 expected tools/allowed risks 只能 R0/R1；product private 与 remote public 分别固定自己的 tool/schema/risk 集，禁止用一份全局 allowlist 混淆。
6. active/rollback 两个 artifact 都有可下载 source URL、archive/files hash、runtime/SBOM/license；空 cache 回退必须只依赖 manifest，不读取开发机 npm cache/PATH。minimum extension 与 install layout 不匹配时安装前阻断。
7. JSON Schema 复算测试覆盖 `OjProblemSummary`、搜索/导入全部方法和 prepare 时预分配的 `submissionOperationId`；任何 Broker 方法引用未导出类型时 compile gate 失败。

```powershell
npx vitest run test/domain/ojContracts.test.ts
npm run generate:oj-contracts
git diff --check
```

**提交：** `feat(oj): publish neutral contract v1 schemas`

## MCP-02：实现 ProviderRegistry 与 MCP Client lifecycle

**新增：**

- `src/infrastructure/mcp/ProviderRegistry.ts`
- `src/infrastructure/mcp/McpPlatformClient.ts`
- `src/infrastructure/mcp/McpTransportFactory.ts`
- `src/infrastructure/mcp/McpToolCodec.ts`
- `src/infrastructure/mcp/errors.ts`
- `test/infrastructure/mcp/providerRegistry.test.ts`
- `test/infrastructure/mcp/mcpPlatformClient.test.ts`
- `test/fixtures/mcp/mockOjServer.ts`

1. Mock Server 覆盖 stdio 与 Streamable HTTP，支持 initialize、tools/list、callTool、list_changed、invalid schema、timeout、AbortSignal。
2. 先测：exact protocol、manifest hash、schema hash、structuredContent parse、`isError` mapping、进程退出、取消、重连、duplicate start、dispose。
3. 使用 `@modelcontextprotocol/sdk@1.29.0` 当前 client transports；不手写 JSON-RPC framing。
4. `McpPlatformClient` 不暴露 generic `callTool` 给 UI/application，只暴露 canonical provider operation adapter。
5. list_changed 新工具或 hash 变化将 provider 标 quarantine；不得自动更新 manifest。

**提交：** `feat(mcp): add pinned provider registry and client lifecycle`

## MCP-03：实现 CapabilityPolicy 与分层 Health

**新增：**

- `src/domain/oj/capabilityPolicy.ts`
- `src/infrastructure/mcp/OjHealthMonitor.ts`
- `src/infrastructure/mcp/CircuitBreaker.ts`
- `test/domain/ojCapabilityPolicy.test.ts`
- `test/infrastructure/mcp/ojHealthMonitor.test.ts`

1. Policy 输入：manifest allowlist、tool annotation/schema、auth state、platform compliance、SafetyOverlay、caller(`ui|agent|background`)、transport。
2. 测试 R4 永不对 ordinary Agent 可见；remote public provider 不接受 private-read/code；AtCoder submit policy blocked；unknown write tool quarantine。
3. Health 分别探测 transport/protocol/schema/auth/upstream；HTTP 200 + upstream timeout 必须 overall degraded。
4. Circuit breaker 只自动重试 safe public read；auth/challenge/schema/R4 不重试。
5. UI-facing health message 不暴露 raw upstream HTML/secret。

**提交：** `feat(oj): enforce capability risk and layered health`

## MCP-04：加固外部洛谷 Server 契约

**仓库：** `luogu-mcp-server`

**修改：**

- `src/types.ts`
- `src/tools.ts`
- `src/server.ts`
- `src/worker.ts`
- `src/normalizers.ts`
- `src/luoguClient.ts`
- `src/recommendations.ts`
- `test/server.test.ts`
- `test/tools.test.ts`
- `test/worker.test.ts`
- `test/workerOriginPolicy.test.ts`
- `package.json`

**新增：**

- `src/contracts/ojContractV1.ts`
- `src/errors.ts`
- `src/health.ts`
- `src/cache.ts`
- `server.json`
- `test/schemaDrift.test.ts`
- `test/fixtures/upstream/`

1. 从扩展生成 artifact 复制/校验 schema；不 import 扩展源码。
2. 为 11 个工具补 outputSchema/structuredContent；错误统一 `OjError` + `isError`。
3. 新增 canonical `oj_capabilities`、`oj_health`；旧工具名保留一个 minor version，并在 capabilities 映射。
4. 分离产品逻辑：`recommendations.ts` 不再根据 Student Skill/痛点做最终排序，只做 canonical topic -> Luogu query/tag；保留 compatibility tool 但标 deprecated。
5. 检测 login HTML、challenge、content-type、`content/contenu` drift；不得缓存为空/不存在。
6. public cache value 带 source/fetchedAt/etag/hash；429/Retry-After 与 timeout 映 typed error。
7. 当前 Worker 只注册 R0 public tools，并按 [MCP Streamable HTTP](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports) 校验 Origin/Host：Host 必须在部署 allowlist；Origin 存在且不合法时返回 403；无 Origin 的非浏览器 MCP 客户端走显式 allow 分支而不是被误判为跨站。删除临时 bearer private 路径。未来 remote-private 作为独立任务，只有 OAuth 2.1/RFC 9728/resource-audience/redirect-SSRF/token-passthrough conformance 通过才可注册。
8. `workerOriginPolicy.test.ts` 至少覆盖允许列表、无 Origin 的非浏览器请求、伪造 Host、跨站 Origin 的 403、预检请求和不可信反向代理转发头；不接受“只测合法请求”的安全证明。
9. 运行：

```powershell
npm run build
npm test
npm run smoke:cf
npm run smoke:cf -- https://luogu-mcp-server.lantangtang54.workers.dev
```

`npm run smoke:live` 只记录网络结果，不作为 deterministic CI；本轮基线可能超时。

**提交（外部仓库）：** `feat(contract): expose oj v1 schemas health and errors`

## MCP-05：接入 Broker 与洛谷 shadow compare

**扩展新增：**

- `src/infrastructure/mcp/OjBroker.ts`
- `src/infrastructure/mcp/providers/LuoguMcpProvider.ts`
- `src/infrastructure/mcp/providers/LegacyLuoguProvider.ts`
- `src/application/oj/LuoguShadowComparator.ts`
- `src/application/oj/OjProblemMapper.ts`
- `resources/oj-providers/luogu.json`
- `test/infrastructure/mcp/luoguMcpProvider.test.ts`
- `test/application/luoguShadowComparator.test.ts`
- `fixtures/oj/luogu/`

1. 先对固定 fixture/P1001 比较 title、content hash、samples、tags、difficulty、source；定义允许差异（字段增强、locale）和阻断差异（题号/样例/内容缺失）。
2. Shadow mode 同时调用旧 read 与新 MCP，但只返回旧结果；比较报告只记字段类别/hash，不记题面原文。
3. upstream timeout 时若新 cache 可用，报告 stale；不把 new error 变 old not-found。
4. feature flag：`workbench.v2.ojBroker.luogu.shadow`。
5. 运行旧 MCP tests + 新 targeted tests。

**提交：** `feat(luogu): shadow external mcp behind oj broker`

## MCP-06：按操作切洛谷主读并弃用双实现

**修改：**

- `src/problemBank/luoguClient.ts`
- `src/problemBank/luoguSearchClient.ts`
- `src/problemBank/luoguProblemSetClient.ts`
- `src/teaching/luoguMcpRecommendationCandidates.ts`
- `src/mcp/problemSearchServer.ts`
- `src/mcp/problemSearchTools.ts`
- `src/sidebar/ProblemBankViewProvider.ts`（通过 application port，不直接 Broker）
- `package.json`
- 相关 tests/docs/release allowlist

1. 切换顺序：search problems -> get problem -> search/get sets -> topic candidates。
2. 每个 operation 独立 flag：`primary=externalMcp|legacyRead`。
3. `luoguMcpRecommendationCandidates` 改为 Broker 获取候选，最终排序仍由 recommendation domain。
4. 内置 4-tool MCP 标 deprecated，Agent definition 指向外部 Server；保留一个发布周期 legacy read，不新增功能。
5. 每步跑 shadow diff；阻断字段差异为 0 后才切。
6. 删除发生在一个完整稳定发布周期后，本任务只建立 deprecation tests、调用者清单和 rollback-compatible 版本；不得在切换当天删除。

**提交序列：**

```text
feat(luogu): route search through external mcp
feat(luogu): route problem and set import through broker
refactor(luogu): keep recommendation ranking in product domain
deprecate(mcp): retire embedded luogu server surface
```

## MCP-07：创建外部 `oj-mcp-adapters` monorepo

**新仓库新增：**

```text
package.json
package-lock.json
tsconfig.base.json
LICENSE
README.md
packages/contracts/          generated oj-contract artifacts + codecs
packages/server-common/      MCP server bootstrap/errors/health/rate limit
packages/companion-ingress/
packages/codeforces/
packages/atcoder/
packages/nowcoder/
packages/leetcode/           jinzcdev upstream subtree + canonical wrapper
test/conformance/
```

1. 许可证选择 MIT，与复用依赖逐项记录；不复制未知许可证代码。
2. 每个 package 独立 executable、cache dir、credential dir、provider id；共享只限 contracts/server plumbing。
3. root tests 启动四个独立 process，确认一个崩溃不影响其他。
4. 所有 packages 固定 `@modelcontextprotocol/sdk@1.29.0` 与 Zod 版本；lockfile 提交。
5. 生成 SBOM 与 third-party notices。
6. 每个 package 发布带 OS/arch/runtime/entrypoint/content hashes/attestation/rollback version 的 artifact manifest；用本地 release server 验证空 PATH/空 cache 安装、启动、卸载、降级，不要求全局 npm/Python 包。

**提交（新仓库）：** `chore: scaffold isolated oj adapter servers`

## MCP-08：Competitive Companion 单次导入 Server

**外部 monorepo新增/修改：** `packages/companion-ingress/src/*`、tests/fixtures

**扩展新增：**

- `src/infrastructure/mcp/providers/CompanionImportProvider.ts`
- `src/application/oj/CompanionImportService.ts`
- `test/application/companionImportService.test.ts`

1. Server tool `open_import_window` 生成 nonce、loopback port、expiresAt（默认 60s）；只接受一次 POST。
2. 测试 forged nonce、expired/replay、non-loopback bind、oversize、wrong content-type、unsupported host、malformed samples、five platform URLs。
3. 接收后 normalize 为 `OjProblemDocument`，source=`browser_companion`，返回 preview；不自动保存。
4. 扩展显示平台/题号/标题/样例数/source 后，用户选择“导入”才创建 catalog/attempt。
5. Server 不接凭据、代码、profile/Teacher Pack。

**提交：**

- adapter repo：`feat(companion): add nonce bound one-shot import`
- extension：`feat(import): add reviewed companion ingestion`

## MCP-09：Codeforces 官方 API read Server

**外部：** `packages/codeforces/src/{server,client,normalizers,rateLimiter}.ts` + tests

**扩展：** `CodeforcesMcpProvider.ts`、manifest、fixtures/tests

1. 使用官方 API 做 problem metadata、contest/user/submission status；limiter 至少 2 秒/请求，尊重 Retry-After。
2. 明确 capabilities：`fetchProblem` 仅 metadata/degraded content；题面由 Companion；commit unsupported。
3. fixture：4/A、429、API status FAILED、schema extra/missing、contest unavailable。
4. 合并 API metadata + Companion document 时保留两个 source，不覆盖 provenance。
5. UI 能显示“官方元数据 / 浏览器导入题面 / 手工提交”。

**提交：** `feat(codeforces): add official api read provider`

## MCP-10：AtCoder `online-judge-tools` 本地 Server

**外部：** `packages/atcoder/src/{server,ojProcess,normalizers,policy}.ts` + tests

**扩展：** `AtCoderMcpProvider.ts`、manifest、fixtures/tests

1. 固定并记录 `online-judge-tools` 与 Python environment；不全局安装，使用项目 venv/lock。
2. Webview/Agent 不传 shell string；Server 从 typed `OjProblemRef` / code / sample 构造参数。
3. 支持 import/download，并输出结构化 test plan/sample artifacts；auth state 可探测；challenge/CAPTCHA -> `challenge.required`。AtCoder package 不直接运行学生代码，`oj test` 若被采用也只能作为 MCP-13 `RunGateway` 的受管 adapter，在同一 trusted/untrusted、cwd/env/network/process-tree gate 下执行。
4. `commitSubmission` capability 固定 `disabled_by_policy`，工具不注册。
5. fixture：abc086_a、missing Python/oj、compile fail、timeout、challenge HTML、unsupported language。

**提交：** `feat(atcoder): wrap oj download and local test safely`

## MCP-11：牛客最薄导入/运行 Server

**外部：** `packages/nowcoder/src/{server,normalizers,capabilities}.ts` + tests

**扩展：** `NowcoderMcpProvider.ts`、manifest、fixtures/tests

1. 只接 Companion normalized document 与通用 local runner；不把帖子/面经 MCP 当题库 API。
2. search/auth/platform run/commit 如实 unsupported。
3. URL/ID normalization 用 fixture 驱动；登录页/CAPTCHA 不当题面。
4. capability UI 说明“可导入/本地运行；搜索和提交不可用”。

**提交：** `feat(nowcoder): expose import and local-run capabilities only`

## MCP-12：固定 fork LeetCode Server package

**外部 monorepo：** `packages/leetcode` 保留 `jinzcdev/leetcode-mcp-server` 固定审计 commit/upstream history；分支 `codex/oj-contract-v1`

1. 保存 upstream commit、license、dependency audit、global/CN fixture。
2. 先加 contract tests，不改行为：search/get/profile/run/submit schemas、auth missing/expired、错误映射。
3. 凭据改为 local env/OS handle；禁止 CLI cookie/session；日志 scanner。
4. direct `submit_solution` 不注册；实现 canonical `prepare_submission` 与 mock-only `commit_submission`，prepare 预分配 `submissionOperationId`。
5. code artifact/hash、site/account/problem/language 绑定；本地 operation ledger 在外部写前 fsync `dispatch_claimed`，claim 后 response lost/进程重启只按 operation id poll，不再次调用 adapter。
6. Windows 无 sandbox 时 platform/local execution capability 按实际降级；不宣称安全。
7. extension `LeetCodeMcpProvider.ts` 分 global/CN manifest 和 SecretStorage key。
8. live read 仅个人显式启用；live submit 保持 false。

**提交（fork）：**

```text
test(contract): pin global and cn provider behavior
fix(auth): remove credentials from cli and logs
feat(submit): split prepare from guarded commit
```

**提交（扩展）：** `feat(leetcode): add pinned local mcp provider`

## MCP-13：实现通用 RunGateway

**扩展新增：**

- `src/application/attempts/RunApplicationService.ts`
- `src/infrastructure/runner/RunGateway.ts`
- `src/infrastructure/runner/ProcessSupervisor.ts`
- `src/infrastructure/runner/adapters/{Python,Cpp,Rust,JavaScript}Runner.ts`
- `test/infrastructure/runner/*.test.ts`
- `fixtures/runner/`

1. Webview 只传 sample ordinals；Host 根据 DocumentBinding 读取当前内容/hash。
2. adapters 使用 argv array，不经 shell；临时 cwd、最小 env/独立 HOME/TMP/cache、network deny capability、wall/output/process-tree limits。
3. 区分 `trusted_workspace_run`（只运行用户当前绑定/hash 确认文件，显式动作，允许标注 bounded-not-sandboxed）与 `untrusted_artifact_run`（下载/生成/参考 artifact，必须 AppContainer/WSL/container 等可验证 OS 隔离，否则 `runner.sandbox_required`）。
4. 测试 compile error、AC/WA/TLE/output limit/cancel/missing toolchain/path spaces/unicode/child process，以及 untrusted artifact 在无 sandbox 时绝对阻断。
5. 未审 community Server 即使 stdio 也不能继承 secret/home/network；private/write 只允许 hash/signature 固定 artifact 通过 `OjProviderLauncher`。
6. `RunApplicationService` 把 typed result 交给 `EvidenceCaptureService.captureDynamicRun`，由确定性 producer 写 `dynamic_test_observed` E3；本任务不直接 import EventStore。代码只存 artifact；stdout/stderr 原文不进普通 telemetry。

**提交：** `feat(runner): add bounded language run gateway`

## MCP-14：实现 SubmissionApplicationService 与原生确认

**新增：**

- `src/application/submissions/SubmissionApplicationService.ts`
- `src/application/submissions/SubmissionIntentStore.ts`
- `src/application/submissions/ConfirmationProof.ts`
- `src/infrastructure/submissions/SubmissionCodeVault.ts`
- `src/infrastructure/vscode/SubmissionConfirmationUi.ts`
- `test/application/submissionApplicationService.test.ts`
- `test/application/submissionLostResponse.test.ts`
- `test/infrastructure/vscode/submissionConfirmationUi.test.ts`

**外部 Server 公共实现：** `SubmissionOperationLedger` + `SubmissionCodeVault` + crash/conformance fixtures

1. 先用 mock provider 测 prepare/preview/cancel/confirm/commit/poll。
2. prepare 从 Host 当前 TextDocument 抓取内存 `OjCodeArtifact`，local Server 校验 source/hash/bytes 后写严格 ACL/TTL `SubmissionCodeVault`，ledger 写 `prepared` + opaque codeArtifactId/hash/bytes 并预分配 `submissionOperationId`；preview 只包含 operation、平台/site/account/problem/language/file label/hash/bytes/dirty/recent run/warnings。
3. `SubmissionConfirmationUi` 使用 VS Code modal；Webview command 只触发 review，不传 commit/proof。
4. local Server 启动时注入随机 `OJ_CONFIRMATION_HMAC_KEY` env；proof 绑定 canonical preview + operation + expiry + nonce；proof/key 不持久化。
5. Server commit 重新读取 vault 中被确认 artifact 并复算 hash；禁止按 fileUri/工作区磁盘重读。调用上游前原子消费 nonce/requestId 并 fsync `dispatch_claimed`；从该点起任何重启都不再次调用 adapter。ledger 不存 proof、secret 或代码，vault 在 expiry/cancel/claim 后按策略清除。
6. 测试 unsaved/Remote URI、prepare 后磁盘文件改变、vault hash mismatch、no proof、expiry、hash/account/site/artifact mismatch、double click、不同 requestId replay、provider restart，以及“claim fsync 前崩溃 / claim 后 socket 前崩溃 / 上游收到后崩溃 / MCP response lost”四个注入点。只有 claim 前崩溃可安全重试；其余一律 outcome_unknown/query-only。
7. commit 不接通通用 retry；Host 在 prepare 后已知 operation id，outcome unknown 只按该 id poll并可跨 Server 重启恢复。
8. terminal official result 只能经 `EvidenceCaptureService.captureOjResult` 写 E4 `oj_result_observed`；SubmissionApplicationService 不直接 import EventStore。用户声明和 AI estimate 使用不同 event/provenance。
9. 所有 platform commit flags 默认 false；CI 无 live submit command。live 证明是逐 provider 条件门，没有 provider 获批时保持全关。

**提交：** `feat(submit): require native per-submit confirmation`

## MCP-15：SecretStorage 与 MCP Server Definition Provider

**修改：**

- `package.json`（`engines.vscode` -> `^1.125.0`，`@types/vscode` -> `1.125.0`）
- `src/extension.ts`

**新增：**

- `src/infrastructure/vscode/OjSecretStore.ts`
- `src/infrastructure/vscode/OjAgentMcpServerDefinitionProvider.ts`
- `src/infrastructure/mcp/OjProviderInstaller.ts`
- `src/infrastructure/mcp/OjProviderLauncher.ts`
- `test/infrastructure/vscode/ojSecretStore.test.ts`
- `test/infrastructure/vscode/ojMcpDefinitions.test.ts`
- `test/infrastructure/mcp/ojProviderInstaller.test.ts`
- `test/infrastructure/mcp/ojProviderLauncher.test.ts`

1. Secret key 维度：provider/platform/site/account/kind；migration 从现有设置只在用户操作时发生，不把明文打印。
2. `package.json` 同时声明 `contributes.mcpServerDefinitionProviders`；使用 `vscode.lm.registerMcpServerDefinitionProvider` 注册批准的 **Agent read-only entrypoint**。
3. VS Code definition 粒度是整台 Server：Agent entrypoint 实际 `tools/list` 只能 R0/R1，不注入 SecretStorage、代码权限或 HMAC key。Broker 私有 entrypoint 不注册给 Agent，R2-R4 只能由 application service 调用。
4. `OjProviderInstaller` 从批准 manifest 下载到 globalStorage provider 目录，验证 OS/arch/runtime、全部文件 hash、签名/attestation、SBOM/许可证后原子切换 active pointer；禁止 PATH 猜测、global install、postinstall 和 `@latest`。
5. `OjProviderLauncher` 使用已校验绝对入口、argv array、无 shell、最小 env、独立 HOME/TMP/cache、进程树限制；private secret 仅在产品 entrypoint 启动时解析。remote URL 固定 allowlist。
6. tests 从空 PATH/空 cache 安装、启动、卸载、回退；篡改 artifact/manifest、错误 OS/arch/runtime、入口越界全部阻断。
7. `onDidChangeMcpServerDefinitions` 只在配置/provider approval/verified artifact 变化时触发；安装态读取 VS Code 实际发现的 `tools/list`，断言 run/prepare/commit 为零。
8. 在 VS Code 1.125.x/current stable Extension Host compile/smoke。

**提交：** `feat(vscode): expose audited oj mcp server definitions`

## MCP-16：五平台 conformance 与隔离 PoC

**扩展新增：**

- `test/contract/ojProviderConformance.test.ts`
- `src/cli/ojProviderPoc.ts`
- `fixtures/oj/{luogu,leetcode,nowcoder,codeforces,atcoder}/`
- `docs/next-gen/generated/oj-poc-report.md`（命令生成，报告可提交但无私密内容）

**外部 monorepo：** `test/conformance/*`

1. 每平台运行规格中的 21 类测试；unsupported capability 也必须有预期断言。
2. CLI 默认 fixture/mock；`--live-read` 明确无凭据；`--live-private`/`--live-submit` 不提供默认实现。
3. 每个 Server 独立 temp home/cache/credential/log；并发启动验证无串扰。
4. submit conformance 注入 claim fsync 前、claim 后 socket 前、上游收到后、response lost 与 Server restart；按 prepare operation id 查询且 upstream adapter invocation count ≤1。
5. Agent-facing 实际 tools/list 只含批准 R0/R1；private entrypoint、secret/HMAC 和 R2-R4 均不可发现。
6. 生成 matrix：operation/status/source/risk/auth/transport/health/error fixtures/version/hash。
7. 真实远端只读 smoke 失败可标 degraded，不覆盖 fixture conformance；live submit 仅对通过审批的平台单独人工启用。

```powershell
npx vitest run test/contract/ojProviderConformance.test.ts
node dist/src/cli/ojProviderPoc.js --provider all --fixture
```

**提交：** `test(oj): add five-provider isolated conformance gate`

## MCP-17：MCP 迁移验收与清理门

1. 扩展：compile、full tests、audit、package release、fresh-profile install。
2. Luogu Server：build/tests/local/remote smoke。
3. Adapter repo：all package tests、SBOM、license scan。
4. LeetCode fork：contract/auth/submit mock tests。
5. 验收报告列出每平台不支持能力，不用统一 UI 掩盖。
6. 验证旧洛谷路径 feature flag 可回滚，且不会用于 private/write fallback。
7. 验证 no-confirm commit = 0、response-lost duplicate = 0、secret canary = 0。
8. 一个发布周期后单独 PR 删除：`src/mcp/problemSearch*`、legacy Luogu clients/scripts；删除前必须无 runtime import 和 usage telemetry。

**提交：** `chore(oj): record federation readiness and rollback evidence`

## 完成定义

- 外部洛谷 Server 为主读且 shadow diff 通过；legacy read 可按 operation 回滚。
- 五平台 provider capability/health 与事实一致。
- Competitive Companion ingress 防伪造/replay。
- 支持的语言 local run 有限制/取消/错误证据。
- commit 只有 Host 原生每次确认后可达；默认 live commit 全关。
- Agent 不见 R4 tool；Secret 不进 args/log/Webview/model。
- contract/conformance/fresh VSIX 安装态通过。
