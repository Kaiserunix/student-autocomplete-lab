# 下一代算法学习工作台需求追踪表

- 日期：2026-07-10
- 基准：`098365f2f18a758692a493e9b7b31fe7fe71e163`
- 范围：32 条锁定需求、78 个实施任务

## 1. 使用规则

本表同时解决两个方向的问题：

- **需求到实现**：每条需求必须能定位到设计、任务和验收证据。
- **任务到需求**：每个 FND/MCP/UI/LRN/INT 任务必须说明服务的需求，不能出现孤立任务。

状态含义：

- `部分`：当前系统已有相关能力，但不满足完整契约或缺少证据。
- `缺失`：当前系统没有该能力或没有可用的产品路径。
- `冲突`：当前实现存在与锁定需求相反的所有权、行为或安全语义。
- `已验证`：只允许在后续实现任务和对应证据全部通过后标记；规划阶段没有需求处于该状态。

关闭需求的最低条件：

1. 所列任务全部完成或有用户批准的 Decision Amendment。
2. 所列自动化证据通过。
3. 涉及 VS Code UI、live provider、迁移或提交时，相应人工/安装态证据也通过。
4. 风险关闭账本中“关联需求”包含本需求且 Gate 为 release_blocker/claim_blocker 的条目均为 closed；accepted 只在有项目所有者批准、到期日和已演练回滚时等价。不得用未定义的 P0/P1 标签代替逐 ID 判断。
5. 追踪表回填 commit、测试报告和版本/hash；不能只把状态文字改成“已验证”。

## 2. 需求目录

### 2.1 基线、架构与数据

| ID | 锁定需求 | 当前 | 设计来源 | 实施任务 | 主要验收证据 |
| --- | --- | --- | --- | --- | --- |
| RQ-BASE-01 | 冻结两个仓库、VSIX、VS Code、本机 MCP 和脏工作树基准；用户资产不得覆盖 | 部分 | 总规 §2、§17；总控 §3、§7 | FND-01、FND-12、INT-01 | baseline manifest、原工作树 hash/status 前后相同、checkpoint commit |
| RQ-BASE-02 | compile、完整测试、MCP、打包、安装激活和视觉矩阵都有“通过/失败/未覆盖”证据 | 部分 | 总规 §20；总控 §3、§20 | FND-01、FND-12、INT-14 | `npm test`、MCP tests、fresh-profile VSIX、Extension Host 报告 |
| RQ-ARCH-01 | UI/Application/Domain/Infrastructure 单向依赖；平台、学习和补全安全域不得越层 | 冲突 | 总规 §5～§7、§12；三份设计分册所有权章节 | FND-11、FND-12、MCP-01、UI-02、INT-01 | `dependencyBoundaries.test.ts`、contract artifacts、integration pin manifest |
| RQ-EVT-01 | `LearnerEvidenceEvent` 是学习事实的唯一写入源；画像、UI 和推荐均为可重建投影 | 冲突 | 总规 §7、§11、§14；Learner §2～§4 | FND-03、FND-04、FND-06、LRN-01、LRN-08、INT-05 | schema、append/replay、evidence capture、projection consistency tests |
| RQ-EVT-02 | ID、时间、canonical JSON、hash、EventStore 和 ArtifactStore 必须确定、可校验、跨进程单写且可恢复 | 部分 | 总规 §14；Learner §3、§9 | FND-02～FND-05、FND-08、LRN-02、LRN-13、INT-04、INT-13 | property/multi-process tests、tail/crash recovery、replay context hash、rollback matrix |
| RQ-ATT-01 | Attempt 使用 UUIDv7；用户声明、AI 估计、OJ verdict、归档和复盘确认语义严格分离 | 冲突 | 总规 §8～§9 | FND-02、FND-06、INT-05 | shared primitives、`attemptStateMachineV2.test.ts`、`completionSemantics.test.ts` |
| RQ-MIG-01 | 旧 Student Skill 只读归档；v2 从可验证事件生成；迁移幂等且用 rollback-compatible VSIX 回滚，不覆盖旧文件 | 部分 | 总规 §18～§19；Learner §9～§11；ADR-0003 | FND-07、FND-08、MCP-06、MCP-17、UI-16、LRN-02、LRN-14、LRN-15、INT-04、INT-13、INT-15 | migration dry-run/apply、byte-identical source、cutover/rollback tests |

### 2.2 OJ、MCP、运行与提交

| ID | 锁定需求 | 当前 | 设计来源 | 实施任务 | 主要验收证据 |
| --- | --- | --- | --- | --- | --- |
| RQ-MCP-01 | 平台 I/O 由独立外部 Server 权威实现；扩展不与 Server 重复平台逻辑 | 冲突 | 总规 §10；MCP §1～§4、§9；ADR-0001 | MCP-01、MCP-04～MCP-07、MCP-17 | OJ contract、Luogu shadow diff、caller scan、legacy removal gate |
| RQ-MCP-02 | 洛谷、LeetCode、牛客、Codeforces、AtCoder 能力可探测且如实呈现不对称能力 | 缺失 | MCP §5、§6、§9、§13 | MCP-01、MCP-03、MCP-04、MCP-07～MCP-13、MCP-16、MCP-17、INT-07 | 五平台 manifest/conformance、isolated PoC、golden paths |
| RQ-MCP-03 | 扩展用 typed Broker 做确定性 UI 操作；VS Code Agent 只发现独立 R0/R1 entrypoint | 缺失 | MCP §4.1、§7 | MCP-01、MCP-02、MCP-15、MCP-16 | provider lifecycle、installed tools/list、`ojMcpDefinitions.test.ts` |
| RQ-MCP-04 | health、统一错误、缓存、限流、响应漂移和遥测可诊断且可恢复 | 部分 | MCP §5.3、§7、§10～§11 | MCP-01～MCP-05、MCP-09、MCP-13、MCP-16、INT-08、INT-15 | capability/health tests、schema drift fixtures、fault injection、soak metrics |
| RQ-RUN-01 | 五平台按真实能力提供运行且与 Submit 分离；当前绑定学生代码受限运行，任何下载/生成 artifact 无 OS 沙箱则阻断 | 部分 | MCP §5.1、§8.2、§9 | MCP-10～MCP-13、MCP-16、UI-09、INT-07、INT-08 | runner modes、provider conformance、run UI、sandbox fault injection |
| RQ-SUB-01 | 每次真实提交均显式确认；preview 绑定平台/题号/语言/精确内存代码 artifact/hash/operation；本地 ledger 保证 adapter invocation 最多一次 | 冲突 | 总规 §2、§8；MCP §5.2、§8.3；ADR-0004 | FND-07、MCP-10、MCP-12、MCP-14、MCP-16、UI-09、INT-07、INT-08、INT-14、INT-15 | mock ceremony、unsaved/Remote URI、expiry/mismatch、四个 claim/socket/crash/lost-response 点；live 仅逐 provider 条件证据 |
| RQ-SEC-01 | 公开只读可远程；登录态/提交只走已校验本地 private entrypoint；凭据只进 SecretStorage/最小 launcher env | 部分 | 总规 §13；MCP §6.2～§8 | MCP-03、MCP-12、MCP-14～MCP-16、UI-04、INT-03、INT-08、INT-10 | secret/launcher tests、CSP、installed tools/list、log/package scanners |

### 2.3 UI 与交互

| ID | 锁定需求 | 当前 | 设计来源 | 实施任务 | 主要验收证据 |
| --- | --- | --- | --- | --- | --- |
| RQ-UI-01 | 拆解 6685 行 Provider；TreeView 管列表，WebviewView 管当前会话，Panel 管深层复盘 | 缺失 | 总规 §16；UI §3～§4；ADR-0002 | UI-03～UI-05、UI-07、UI-10、UI-16、UI-17 | build/host tests、Tree/View/Panel interaction tests、legacy registration scan |
| RQ-UI-02 | `LearningSessionState`、`UiStateV2` 和 versioned protocol 由单一 Coordinator/Projector 驱动 | 冲突 | UI §4～§7 | UI-01、UI-02、UI-06、UI-12、UI-13、UI-17、LRN-08 | protocol/reducer/coordinator/router tests、stale/out-of-order cases |
| RQ-UI-03 | 流式、可取消、局部加载、状态转场、行动优先级和刷新恢复不丢草稿/焦点/滚动 | 部分 | UI §1、§5～§8、§12～§13 | UI-02、UI-06～UI-09、UI-12、UI-17、INT-09、INT-11 | component/session flow、restore tests、Extension Host interaction/performance |
| RQ-UI-04 | 260/320/360/600px、浅/深/高对比、键盘、ARIA、200% zoom 和 reduced motion 全通过 | 部分 | UI §9～§11、§15～§16 | UI-11、UI-14、UI-15、UI-17、INT-09 | Playwright baselines、axe/keyboard、真实 Extension Host screenshot matrix |
| RQ-UI-05 | UI 以组件、协议、状态机、真实 Extension Host 和截图回归验证，不以源字符串为主证据 | 冲突 | UI §15；总控 §20 | UI-13～UI-15、UI-17、INT-09 | behavior tests、Playwright pixels、Extension Host tests；旧字符串断言删除清单 |
| RQ-UI-06 | 主工作面达到成熟学习产品层级：设置、账号、provider、模型和诊断不裸露；一个主行动，配置按原生渐进披露 | 冲突 | UI §3.4、§8～§11；UI 线框 §7 | UI-05、UI-07、UI-11、UI-13～UI-15、UI-17、INT-09、INT-14 | configuration surface tests、视觉层级/密度评审、axe、最终安装 VSIX 截图 |

### 2.4 学习策略、画像与推荐

| ID | 锁定需求 | 当前 | 设计来源 | 实施任务 | 主要验收证据 |
| --- | --- | --- | --- | --- | --- |
| RQ-LRN-01 | `LearnerStateV2` 是紧凑、可丢弃投影，只保存概率、不确定度、证据、遗忘、迁移和禁用状态 | 冲突 | 总规 §11、§15；Learner §4～§5、§8～§9 | UI-10、LRN-03、LRN-12～LRN-15、LRN-17、INT-11 | reducer/replay hash、teaching summary、token section report、cutover tests |
| RQ-LRN-02 | 编译器、样例、测试、轨迹和 OJ verdict 优先；LLM 只提出技能/误区/动作候选 | 部分 | Learner §2～§3、§6 | LRN-01、LRN-05、LRN-06、LRN-08、LRN-17、INT-05 | producer provenance、candidate schema/safety、event projection consistency |
| RQ-LRN-03 | 晋级由可解释更新、重复证据、纠偏和迁移决定；无 E5 不 mastered；disabled 不自动重激活 | 冲突 | Learner §2、§5；ADR-0003 | FND-07、LRN-03、LRN-04、LRN-09、LRN-13、LRN-17、INT-05、INT-12 | mastery math/lifecycle/governance、replay hard gates、beta zero-violation |
| RQ-LRN-04 | 教练每轮默认一个教学动作；答案仅在明确放弃或 reveal 后可见 | 部分 | Learner §2、§6、§13 | LRN-06～LRN-08、LRN-17、UI-08 | teaching candidate/gate/controller tests、golden session flow、answer canaries |
| RQ-REC-01 | 推荐先硬过滤，再多目标排序；所有推荐有理由，禁用/越级/不可用平台违规为零 | 部分 | Learner §7 | LRN-09～LRN-11、LRN-17、UI-10、INT-12 | hard-filter/ranker/reason tests、friend-beta aggregate |
| RQ-EXP-01 | 学生问题进入追踪；bandit/深度模型/多代理只作有 propensity 的对照，实测胜出才主读 | 缺失 | Learner §3.3、§7.3、§12；策略研究 | LRN-01、LRN-11、LRN-13、LRN-16、INT-12 | question evidence fixtures、offline replay、propensity completeness、claim gate |

### 2.5 补全、观测、隐私与发布

| ID | 锁定需求 | 当前 | 设计来源 | 实施任务 | 主要验收证据 |
| --- | --- | --- | --- | --- | --- |
| RQ-AUTO-01 | 自动补全只读本地学生代码、语言/路径标签和代码习惯；完整请求体禁止题面、Teacher Pack、教练、画像和答案 | 部分 | 总规 §12；Foundation FND-09/FND-11 | FND-09、FND-11、INT-06、INT-10、INT-14 | full-request canary tests、Extension Host leakage test、architecture gate、package/log scan |
| RQ-OBS-01 | 按教学动作和 prompt section 记录 token、时延、重试、解析错误；不记录原文；画像 section 中位 token 降低至少 60% | 部分 | 总规 §15、§20；Learner §8 | FND-10、MCP-03、MCP-04、LRN-12、INT-11、INT-15 | usage allowlist、actual/estimate source、section report、performance/soak metrics |
| RQ-PRIV-01 | 凭据、原始代码、Teacher Pack、答案和个人事件不进日志/发行包/无关 MCP；支持删除和导出 | 部分 | 总规 §13；MCP §8；Learner §9 | FND-05、FND-09、FND-10、MCP-15、UI-04、INT-06、INT-10、INT-12、INT-14 | privacy scanner、deletion/export tests、package tree、anonymized beta report |
| RQ-REL-01 | VSIX 与外部 provider artifacts 可复现、依赖完整、内容干净、许可证/SBOM 可审计，在 VS Code 1.125.x 与 stable 空 PATH/cache profile 激活 | 冲突 | 总规 §17、§20；总控 §3、§15 | MCP-07、MCP-15、UI-03、UI-15、UI-17、INT-01～INT-03、INT-10、INT-14、INT-15 | bundle/installedVsix、provider install/rollback、hygiene、SBOM、fresh-profile activation |
| RQ-REL-02 | 五平台代表性黄金路径、故障注入、迁移和全量回滚在 RC 前通过 | 缺失 | 总规 §18～§20；MCP §10、§13；总控 M7～M8 | MCP-16、MCP-17、UI-15、LRN-15、LRN-16、INT-04、INT-07～INT-09、INT-13～INT-15 | golden paths、run/submit faults、UI matrix、rollback matrix、RC report |
| RQ-BETA-01 | 至少 30 个朋友内测任务形成对照报告；证据不足时只报告系统指标，不宣称学习提升 | 缺失 | 总规 §20；Learner §12.3；总控 §14 | LRN-16、LRN-17、INT-12、INT-15 | task catalog、anonymized aggregate、zero hard-gate violations、claim wording review |

## 3. 任务反向追踪

“主证据”列是该任务最直接的自动化或审计产物；分计划中列出的完整命令仍是执行标准。

### 3.1 Foundation：FND-01～FND-12

| 任务 | 服务的需求 | 任务作用 | 主证据 |
| --- | --- | --- | --- |
| FND-01 | RQ-BASE-01、RQ-BASE-02 | 建隔离实施工作树并重放基线，保护用户脏改动 | baseline manifest、`npm run compile`、原工作树 status/hash |
| FND-02 | RQ-EVT-02、RQ-ATT-01 | 统一 UUIDv7、Clock、canonical JSON 和 SHA-256，消除重放非确定性 | `test/domain/sharedPrimitives.test.ts` |
| FND-03 | RQ-EVT-01、RQ-EVT-02 | 定义版本化 `LearnerEvidenceEvent`，含 Attempt/operation 生命周期、治理和推荐曝光 | `test/domain/learnerEvidenceSchema.test.ts` |
| FND-04 | RQ-EVT-01、RQ-EVT-02 | 建跨进程单写 append-only EventStore、复合唯一、crash/lease 恢复和 replay | EventStore unit + multi-process tests |
| FND-05 | RQ-EVT-02、RQ-PRIV-01 | 大对象转本地内容寻址 Artifact，事件只保留 hash/provenance | `test/infrastructure/learnerArtifactStore.test.ts` |
| FND-06 | RQ-EVT-01、RQ-ATT-01 | 建 Attempt v2 身份和纯状态机，分离完成事实 | `test/domain/attemptStateMachineV2.test.ts` |
| FND-07 | RQ-MIG-01、RQ-LRN-03、RQ-SUB-01 | 建不可绕过 SafetyOverlay 和 feature flag policy | `test/domain/safetyOverlay.test.ts`、`workbenchFeatureFlags.test.ts` |
| FND-08 | RQ-MIG-01、RQ-EVT-02 | 只读归档 v1，提供幂等 migration dry-run | `test/infrastructure/legacyLearningMigration.test.ts` |
| FND-09 | RQ-AUTO-01、RQ-PRIV-01 | 让 autocomplete 所有入口通过同一完整请求 Gatekeeper | `test/autocompleteContextBoundaryV2.test.ts` 与旧补全回归 |
| FND-10 | RQ-OBS-01、RQ-PRIV-01 | 按 purpose/section 记录成本和错误，不记录原文 | `test/models/modelUsageTelemetry.test.ts` |
| FND-11 | RQ-ARCH-01、RQ-AUTO-01 | 用 import graph 强制领域、UI、平台和补全边界 | `test/architecture/dependencyBoundaries.test.ts` |
| FND-12 | RQ-BASE-01、RQ-BASE-02、RQ-ARCH-01 | 执行基座总验收并固定供三车道 pin 的 checkpoint | compile、full tests、migration dry-run、release VSIX 隔离安装激活、audit、diff-check report |

### 3.2 OJ/MCP：MCP-01～MCP-17

| 任务 | 服务的需求 | 任务作用 | 主证据 |
| --- | --- | --- | --- |
| MCP-01 | RQ-ARCH-01、RQ-MCP-01～RQ-MCP-04 | 固定中立 OJ contracts、schema、fixtures 和 provider manifest | `test/domain/ojContracts.test.ts`、deterministic schema generation |
| MCP-02 | RQ-MCP-03、RQ-MCP-04 | 建 ProviderRegistry 和 MCP client lifecycle | `providerRegistry.test.ts`、`mcpPlatformClient.test.ts` |
| MCP-03 | RQ-MCP-02、RQ-MCP-04、RQ-SEC-01、RQ-OBS-01 | 建 capability policy、分层 health 和风险/认证状态 | `ojCapabilityPolicy.test.ts`、`ojHealthMonitor.test.ts` |
| MCP-04 | RQ-MCP-01、RQ-MCP-02、RQ-MCP-04、RQ-OBS-01 | 让外部洛谷 Server 通过统一契约、漂移和健康门 | Luogu 33+ tests、`schemaDrift.test.ts`、local/deployed smoke |
| MCP-05 | RQ-MCP-01、RQ-MCP-04 | 扩展接 Broker，以 shadow compare 验证外部洛谷等价性 | `luoguMcpProvider.test.ts`、`luoguShadowComparator.test.ts` |
| MCP-06 | RQ-MCP-01、RQ-MIG-01 | 按操作切外部洛谷主读，停止扩建内置双实现 | caller scan、operation flag cutover/rollback report |
| MCP-07 | RQ-MCP-01、RQ-MCP-02、RQ-REL-01 | 建可独立 pin/发布的 adapter monorepo 和 conformance 基础 | clean install、workspace build/test、package manifests |
| MCP-08 | RQ-MCP-02 | 通过 Competitive Companion 为五平台提供单次、确定性导题 | `companionImportService.test.ts`、五平台 fixtures |
| MCP-09 | RQ-MCP-02、RQ-MCP-04 | 用 Codeforces 官方 API 提供公开 read，并尊重限流 | Codeforces contract/rate-limit/error fixtures |
| MCP-10 | RQ-MCP-02、RQ-RUN-01、RQ-SUB-01 | 用 `online-judge-tools` 提供 AtCoder local path，提交默认 policy-blocked | AtCoder adapter tests、CAPTCHA/policy fixtures |
| MCP-11 | RQ-MCP-02、RQ-RUN-01 | 提供牛客最薄 import/run，缺失写能力明确 unsupported | Nowcoder import/run/error fixtures |
| MCP-12 | RQ-MCP-02、RQ-RUN-01、RQ-SUB-01、RQ-SEC-01 | 在 adapter monorepo 固定 LeetCode fork package，验证 CN/Global、认证隔离和写契约 | dual-site conformance、auth isolation、run/submit fixtures |
| MCP-13 | RQ-RUN-01、RQ-MCP-02、RQ-MCP-04 | 统一 RunGateway、sandbox、资源限制和结果 provenance | `test/infrastructure/runner/*.test.ts` |
| MCP-14 | RQ-SUB-01、RQ-SEC-01 | 实现 prepare/preview/confirm/commit/poll 和原生确认 | `submissionApplicationService.test.ts`、`submissionConfirmationUi.test.ts` |
| MCP-15 | RQ-MCP-03、RQ-SEC-01、RQ-PRIV-01、RQ-REL-01 | SecretStorage、provider installer/launcher 与独立 Agent read-only definition | secret/installer/launcher/installed tools-list tests |
| MCP-16 | RQ-MCP-02～RQ-MCP-04、RQ-RUN-01、RQ-SUB-01、RQ-SEC-01、RQ-REL-02 | 五平台隔离 PoC、Agent/private entrypoint、crash ledger 与 conformance | `ojProviderConformance.test.ts`、外部 `test/conformance/*` |
| MCP-17 | RQ-MCP-01、RQ-MCP-02、RQ-MIG-01、RQ-REL-02 | 做 MCP 迁移总验收，列出 unsupported 并清理双实现入口 | conformance report、provider matrix、legacy caller/rollback gate |

### 3.3 UI：UI-01～UI-17

| 任务 | 服务的需求 | 任务作用 | 主证据 |
| --- | --- | --- | --- |
| UI-01 | RQ-UI-02 | 定义 protocol v2 envelope、command/event union 和 runtime schema | `test/ui/protocolV2.test.ts` |
| UI-02 | RQ-ARCH-01、RQ-UI-02、RQ-UI-03 | 实现单一 Coordinator、Projector 和 MessageRouter 所有权 | coordinator/projector/router tests |
| UI-03 | RQ-UI-01、RQ-REL-01 | 建 React/Vite Current Session 与 Review 双入口和可打包产物 | `test/ui/webviewBuild.test.ts`、`npm run build:webview` |
| UI-04 | RQ-UI-01、RQ-SEC-01、RQ-PRIV-01 | 建 CSP、nonce、资源清单和安全 WebviewHost | `test/ui/webviewDocument.test.ts` |
| UI-05 | RQ-UI-01、RQ-UI-06 | 用原生 TreeView 承担题库，并把设置/账号/provider/诊断导向原生表面 | Tree + configuration surface tests |
| UI-06 | RQ-UI-02、RQ-UI-03 | 建 Current Session Provider 与 reducer，不以 DOM 保存业务状态 | reducer/provider tests |
| UI-07 | RQ-UI-01、RQ-UI-03、RQ-UI-06 | 实现 ONE NOW/NEXT/BEFORE，限制主/次动作并移除设置型 Inspector | `currentSessionComponents.test.tsx` |
| UI-08 | RQ-UI-03、RQ-LRN-04 | 实现流式教练、独立取消、检查点输入和单动作呈现 | `streamingCoachTurn.test.tsx`、`checkpointInput.test.tsx` |
| UI-09 | RQ-UI-03、RQ-RUN-01、RQ-SUB-01 | 呈现 Run 和提交 preview/confirm/verdict，不自己执行平台写 | `runAndSubmissionViews.test.tsx` |
| UI-10 | RQ-UI-01、RQ-LRN-01、RQ-REC-01 | 用 Panel 展开复盘、画像证据和推荐解释 | `learningReviewPanel.test.tsx` |
| UI-11 | RQ-UI-04、RQ-UI-06 | 完成 theme/响应式/motion/zoom 与视觉层级、密度、配置裸露门 | `themeAndMotion.test.tsx` |
| UI-12 | RQ-UI-02、RQ-UI-03 | 恢复草稿、焦点、滚动锚点和多 Webview peer 状态 | `webviewRestoreState.test.tsx` |
| UI-13 | RQ-UI-02、RQ-UI-05、RQ-UI-06 | 用行为/契约/axe/配置表面测试替换源字符串证据 | golden flows、accessibility/configuration tests |
| UI-14 | RQ-UI-04～RQ-UI-06 | 建宽度/主题/错误/恢复截图、axe 与人工层级/密度矩阵 | visual specs + review rubric |
| UI-15 | RQ-UI-04～RQ-UI-06、RQ-REL-01、RQ-REL-02 | 在 VS Code 1.125.x 与 stable 开发宿主验证并声明安装 VSIX 后仍需重跑 | `workbenchUi.test.ts`、`test:extension-visual` |
| UI-16 | RQ-UI-01、RQ-MIG-01 | 先验证回滚，再停止注册旧 6685 行 Provider | registration/import scan、UI flag rollback evidence |
| UI-17 | RQ-UI-01～RQ-UI-06、RQ-REL-01 | 运行 UI 完整验收、设置不裸露和 VSIX hygiene | UI/full/visual/axe/Extension Host/package commands |

### 3.4 Learner：LRN-01～LRN-17

| 任务 | 服务的需求 | 任务作用 | 主证据 |
| --- | --- | --- | --- |
| LRN-01 | RQ-EVT-01、RQ-LRN-02、RQ-EXP-01 | 把旧工作流和学生问题映射为分级 evidence events | `evidenceCaptureService.test.ts` |
| LRN-02 | RQ-EVT-02、RQ-MIG-01 | 实现 archive/apply migration 和差异输入，不继承旧结论 | `legacyLearningMigrationApply.test.ts` |
| LRN-03 | RQ-LRN-01、RQ-LRN-03 | 实现带遗忘/帮助折扣的可解释 Beta-Bernoulli reducer | `masteryMath.test.ts`、`learnerReducerV2.test.ts` |
| LRN-04 | RQ-LRN-03 | 实现技能生命周期、冲突规则和 disabled 治理 | `skillLifecycleV2.test.ts`、`learnerGovernance.test.ts` |
| LRN-05 | RQ-LRN-02 | 先把编译、测试、轨迹和 OJ 变成确定性 provenance evidence | `evidenceProducers.test.ts` |
| LRN-06 | RQ-LRN-02、RQ-LRN-04 | 定义 LLM candidate contract 和不可绕过教学安全 gate | `teachingCandidatesV2.test.ts`、`teachingSafetyGate.test.ts` |
| LRN-07 | RQ-LRN-04 | 实现每轮单一 pedagogical move 的确定性 controller | `teachingActionController.test.ts` |
| LRN-08 | RQ-EVT-01、RQ-LRN-02、RQ-LRN-04、RQ-UI-02 | 将教学循环接入 Coordinator，所有动作和响应事件化 | `teachingApplicationService.test.ts` |
| LRN-09 | RQ-LRN-03、RQ-REC-01 | 先执行重复、禁用、难度和平台可用性硬过滤 | `recommendationHardFiltersV2.test.ts` |
| LRN-10 | RQ-REC-01 | 多目标排序并输出人可见理由/证据 | `recommendationRankerV2.test.ts` |
| LRN-11 | RQ-REC-01、RQ-EXP-01 | 只记录 propensity 和 bandit shadow，不上线探索 | `recommendationBanditSafety.test.ts` |
| LRN-12 | RQ-LRN-01、RQ-OBS-01 | 生成紧凑 teaching summary，守住画像 section 60% 降幅门 | `teachingSummaryV2.test.ts`、usage report |
| LRN-13 | RQ-EVT-02、RQ-LRN-01、RQ-LRN-03、RQ-EXP-01 | 建 replay、校准和离线差异 CLI | `learnerReplay.test.ts`、`replay:learner-v2`、`eval:learner-v2` |
| LRN-14 | RQ-LRN-01、RQ-MIG-01 | 生成 v1/v2 shadow 差异并要求人工审阅异常 | `learnerShadowComparator.test.ts` |
| LRN-15 | RQ-LRN-01、RQ-MIG-01、RQ-REL-02 | 实现 pointer/rollback 并只在 fixture/副本演练 | `learnerV2Cutover.test.ts` |
| LRN-16 | RQ-EXP-01、RQ-REL-02、RQ-BETA-01 | 准备朋友内测任务、脱敏聚合和结论门 | `friendBetaReport.test.ts` |
| LRN-17 | RQ-LRN-01～RQ-LRN-04、RQ-REC-01、RQ-BETA-01 | 汇总 reducer/controller/recommender/replay/package 验收 | learner full gate commands and report |

### 3.5 Integration：INT-01～INT-15

| 任务 | 服务的需求 | 任务作用 | 主证据 |
| --- | --- | --- | --- |
| INT-01 | RQ-BASE-01、RQ-ARCH-01、RQ-REL-01 | 建集成分支，固定 Foundation、contracts、providers 和前端版本 | integration manifest、lockfile/contract hashes |
| INT-02 | RQ-REL-01 | FND-01 后前移统一 bundle/installed-VSIX pipeline，立即修复激活 P0 | `releaseBundle.test.ts`、`installedVsix.test.ts` |
| INT-03 | RQ-REL-01、RQ-SEC-01 | 建依赖漏洞、许可证、精确版本和供应链门 | `dependencyPolicy.test.ts`、audit/license/SBOM |
| INT-04 | RQ-EVT-02、RQ-MIG-01、RQ-REL-02 | 在脱敏真实数据副本演练 dry-run/apply/idempotency | `fullStorageMigration.test.ts`、source byte hash |
| INT-05 | RQ-EVT-01、RQ-ATT-01、RQ-LRN-02、RQ-LRN-03 | 统一完成语义和跨域事件/投影一致性 | `completionSemantics.test.ts`、`eventProjectionConsistency.test.ts` |
| INT-06 | RQ-AUTO-01、RQ-PRIV-01 | 在单元和 Extension Host 验证完整补全请求零泄漏 | `autocompleteLeakageGoldenPath.test.ts`、Extension Host leakage test |
| INT-07 | RQ-MCP-02、RQ-RUN-01、RQ-SUB-01、RQ-REL-02 | 五平台代表性导题到推荐黄金路径 | `ojGoldenPaths.test.ts` |
| INT-08 | RQ-MCP-04、RQ-RUN-01、RQ-SUB-01、RQ-SEC-01、RQ-REL-02 | 对 sandbox、断网、限流、过期、lost response 和重复写做故障注入 | `runSandboxAndSubmitSafety.test.ts` |
| INT-09 | RQ-UI-03～RQ-UI-06、RQ-REL-02 | 重跑 standalone 与真实 Extension Host UI/主题/恢复/视觉层级矩阵 | Playwright、axe、人工评审、Extension Host reports |
| INT-10 | RQ-AUTO-01、RQ-PRIV-01、RQ-REL-01、RQ-SEC-01 | 扫描发行物、日志、删除/导出与隐私说明 | `privacyScanner.test.ts`、unpacked VSIX tree |
| INT-11 | RQ-LRN-01、RQ-OBS-01、RQ-UI-03 | 对 replay、activation、projection、render、postMessage 和 token 建性能门 | `replayAndUiPerformance.test.ts` |
| INT-12 | RQ-LRN-03、RQ-REC-01、RQ-EXP-01、RQ-BETA-01、RQ-PRIV-01 | 完成至少 30 个朋友任务并只发布脱敏、克制结论 | task catalog、aggregate report、hard-gate counts |
| INT-13 | RQ-EVT-02、RQ-MIG-01、RQ-REL-02 | 演练 UI/provider/learner/recommendation/package 全量回滚 | `rollbackMatrix.test.ts`、rollback runbook |
| INT-14 | RQ-BASE-02、RQ-AUTO-01、RQ-PRIV-01、RQ-REL-01、RQ-REL-02、RQ-SUB-01、RQ-UI-06 | 构建 RC，在空 PATH/cache 两版 VS Code 安装 provider 与 VSIX 并重跑最终视觉总门 | release/installed visual matrix、artifact/VSIX hash/SBOM |
| INT-15 | RQ-MCP-04、RQ-MIG-01、RQ-OBS-01、RQ-REL-01、RQ-REL-02、RQ-SUB-01、RQ-BETA-01 | 执行真实迁移/切主读、分批发布、观察并按安全触发回退 | migration/cutover、soak、rollback trigger evidence |

## 4. 覆盖审计

### 4.1 规划时静态结论

- 需求数：32。
- 实施任务数：78。
- 双向映射边数：227；需求表和任务表边集合完全相等。
- 无任务映射的需求：0。
- 无需求归属的任务：0。
- 规划阶段标记“已验证”的需求：0。
- 要求真实 Extension Host 证据的需求：RQ-BASE-02、RQ-UI-03～RQ-UI-05、RQ-AUTO-01、RQ-REL-01、RQ-REL-02。
- 要求条件 live 证据的需求：RQ-MCP-02～RQ-MCP-04、RQ-RUN-01；远端 read/run 按平台政策执行。RQ-SUB-01 的通用硬门使用 mock ceremony；live submit 仅在某 provider 已单独通过安全、条款和测试账户审批时作为附加条件证据，不是发行前置。
- 要求真实数据副本的需求：RQ-EVT-02、RQ-MIG-01、RQ-LRN-01、RQ-REL-02。
- 要求人类内测证据的需求：RQ-BETA-01；在完成前不得宣称学习效果。

### 4.2 实施时回填格式

每完成一个任务，在本表对应行后面的执行记录中追加：

```text
Task: FND-03
Commit: <sha>
Evidence: <report path or CI URL>
Commands: <exact commands and exit codes>
Requirements: RQ-EVT-01, RQ-EVT-02
Result: pass | fail | blocked
Residual risk: <risk IDs or none>
Reviewer: <independent reviewer/task>
```

只有某项需求的全部任务记录、自动化证据、必要人工证据和回滚证据都完整时，才把需求状态改为 `已验证`。
