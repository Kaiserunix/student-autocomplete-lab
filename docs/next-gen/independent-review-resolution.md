# 独立架构审阅与闭环记录

- 审阅日期：2026-07-10
- 审阅对象：下一代算法学习工作台完整规划包
- 审阅方式：三条相互独立的高推理审阅车道，分别覆盖规格与追踪、MCP/安全/发布、UI/学习策略
- 闭环原则：审阅意见不能只写“采纳”；必须落到类型、状态、任务、失败测试、验收门或明确的非目标

本记录证明的是规划问题已被定位并落实到可执行约束，不证明业务实现已经完成。release VSIX 激活失败、真实平台响应漂移、安装版视觉质量和 Learner v2 学习效果仍须由后续实施产生新证据。

## 1. 审阅范围

三条车道都读取总规格、三份分册、四份 ADR、六份实施计划、需求追踪表、风险登记册和调查附件，但各自保持独立判断：

| 车道 | 主要问题 | 输出要求 |
| --- | --- | --- |
| 规格与追踪 | 需求是否可追踪，类型/状态机/任务依赖是否自洽，迁移顺序是否可执行 | 找到双向边缺口、命名漂移、无法重放的状态和错误依赖 |
| MCP、安全与发布 | 五平台边界、Server 获取与启动、鉴权、提交 at-most-once、运行隔离、VSIX 发布 | 以崩溃点、空环境、恶意输入和真实安装产物挑战设计 |
| UI 与学习策略 | 信息架构、并发协议、流式安全、画像数学、推荐曝光、安装态可访问性 | 以状态恢复、答案泄漏、错误掌握声明和低级配置暴露挑战设计 |

审阅后由主规划车道逐条重读相关上下文、修改文档，并运行机械一致性检查。没有让审阅代理直接编辑规划文件。

## 2. 已闭环的架构问题

| 编号 | 审阅发现 | 规划闭环 | 主要落点 |
| --- | --- | --- | --- |
| REV-01 | EventStore 只描述线程内串行，两个 VS Code/CLI 进程可同时写坏 sequence/hash | 增加单 writer lease、writer token、heartbeat/expiry、stale-lock quarantine、原子 append/sidecar 规则和双进程/杀进程测试 | FND-04、R-043 |
| REV-02 | Attempt replay 没有覆盖 started-without-terminal、文档绑定、操作恢复 | 事件并集加入 attempt/document/operation/submit authorization 生命周期；未终结操作重放为 recovering | Learner v2 规格、FND-06、LRN-01 |
| REV-03 | UI envelope 对 bootstrap 与 attempt 命令使用同一必填字段，无法表达真实并发 | 拆成 unbound 与 attempt-bound command；后者强制 attemptId/expectedRevision，Host event 强制 request phase/sequence/terminal | UI 规格、ADR-0002、UI-02 |
| REV-04 | 完成、放弃和揭示答案没有完整命令面 | 加入 attempt.declareComplete、attempt.abandon、answer.reveal.request；揭示答案只走 Host 原生确认 | UI 规格、UI-09、UI-10 |
| REV-05 | “每轮一个教学动作”只有口号，多进程重复请求可能产生两个动作 | 事件头加入 uniquenessKey，使用 attempt/turn/teaching_action_issued 唯一键并在 EventStore 原子判重 | Learner v2 规格、FND-04、LRN-07 |
| REV-06 | 模型原始 token 若先流到 Webview，后置答案检查无法撤回泄漏 | 先生成完整结构化 block，经过答案/完整代码/误区/策略门后标记 ValidatedLearnerFacingBlock，再按已验证 block 呈现 | 总规格、UI 规格、UI-08、LRN-07、R-044 |
| REV-07 | disabled 同时存在 correction 字段和独立事件，重放会产生两种真相 | v2 仅允许 skill_governance_changed(state=enabled/disabled)；correction 只表达证据纠偏；旧事件名只作为迁移输入 | Learner v2 规格、FND-07、FND-08、LRN-03 |
| REV-08 | 遗忘计算读取当前时间，导致同一事件流重放 hash 随运行时间变化 | 引入 LearnerReplayContextV2，显式携带 evaluatedAsOf 与 reducer/taxonomy/policy 版本；checkpoint/hash 包含完整 context | Learner v2 规格、LRN-04 |
| REV-09 | transfer multiplier 与 misconception 更新方向未定义，可能让错误证据提高掌握度 | 删除未定义 transfer multiplier；E5 迁移证据先验真；分别定义 mastery 与 misconception 的观测方向和边界测试 | Learner v2 规格、LRN-05 |
| REV-10 | 推荐只记录选择，没有 presented/exposure/propensity，无法评估 bandit 或排序偏差 | 事件拆成 decided/presented/chosen/dismissed/deferred；记录 slate、position、propensity；1000 门以真实曝光计数 | Learner v2 规格、LRN-10、LRN-13 |
| REV-11 | 开发 Extension Host 截图不能证明最终 VSIX 布局和依赖完整 | 增加最终安装版 test:installed-extension-visual；目标宽度、主题、焦点、减少动画都在打包产物上复测 | UI-17、INT-09、INT-14 |
| REV-12 | 可访问性门没有指定可复现引擎版本 | 固定 axe-core 4.12.1 与 @axe-core/playwright 4.12.1，并保留键盘/焦点/高对比人工与 Extension Host 证据 | UI 规格、UI-15 |
| REV-13 | Learner 计划先做真实切换，Integration 又安排迁移演练，顺序冲突 | LRN-15 只实现并对 fixture/副本演练；INT-04 做真实数据副本；INT-15 在 RC 通过后唯一拥有生产 apply/freeze/read cutover | Learner 计划、Integration 计划、Master M8 |
| REV-14 | 需求正向表与任务反向表存在边集合漂移风险 | 固定 32 条需求、78 个任务、227 条边；INT-01 实现 exact set equality checker，禁止只比较计数 | 需求追踪表、INT-01 |
| REV-15 | 搜索和导入在能力表中出现，但没有精确 request/result 类型 | 增加 OjSearchRequest/Result、OjImportWindowRequest/Window/Preview、Broker 方法和 oj_open_import_window | MCP 规格、MCP-01 |
| REV-16 | 提交响应丢失时只靠 jobId，无法区分未发送、已发送无响应和重复发送 | prepare 预分配 submissionOperationId；Server 持久化 SubmissionOperationLedger，在 dispatch 前原子消费 proof；崩溃后只查询 operation | MCP 规格、ADR-0004、MCP-14 |
| REV-17 | 本地运行把“当前代码”和下载/生成/答案 artifact 都当成同一可信级别 | 绑定当前学生文件允许受限但非沙箱运行；任何下载、生成、参考 artifact 必须使用 AppContainer/WSL/container，否则阻断 | MCP 规格、MCP-13 |
| REV-18 | Broker 直接写学习事件会把基础设施层变成业务事实源 | 改为 OJ Application Service 调 Broker，再由 EvidenceCaptureService 写事件 | 总规格、MCP 规格、FND-10 |
| REV-19 | 里程碑声称 Review Panel 已完成，但任务依赖仍在后续；部分硬依赖用模糊标签 | 修正 UI-12 归属和 G3 表述；依赖表只使用任务/Gate ID，并明确早期 INT-02 例外路径 | Master 计划 |
| REV-20 | newEventId、SafeAutocompleteRequest、blocked_by_policy 等命名跨分册漂移 | 统一为 newUuidV7、AutocompleteSafeRequest、disabled_by_policy 和 LegacyAttemptReadAdapter | 总规格与四份实施计划 |
| REV-21 | Provider 只写“安装某包”，没有来源、哈希、运行时和空环境启动契约 | 增加 provider artifact manifest、installer、launcher、SBOM/license/attestation、精确版本和空 PATH/cache 测试 | MCP 规格、MCP-02、MCP-16 |
| REV-22 | VS Code Agent 侧假设能按工具过滤同一 Server，实际 provider 粒度是整台 Server | 单独构建 R0/R1 Agent-facing entrypoint；R2-R4 private product entrypoint 不暴露；安装态检查实际 tools/list | MCP 规格、MCP-15 |
| REV-23 | stdio 启动继承 shell、HOME、PATH 和缓存，会扩大供应链与凭据面 | 使用已验证绝对 entrypoint、shell=false、最小 env、隔离 HOME/TMP/cache 和进程限制；未审阅 private/write provider 阻断 | MCP 规格、MCP-02、R-042 |
| REV-24 | 洛谷 Worker 的临时 bearer 路径不足以承担 remote private 写操作 | 当前 Worker 只保留 R0 public；未来 remote private 必须另做 OAuth 2.1、RFC 9728、Origin、audience、redirect/SSRF conformance | MCP-04、ADR-0001 |
| REV-25 | 旧 VSIX 可能恢复 v1 writer，回滚会制造双写和不可重放 delta | 只允许 rollback-compatible VSIX：继续写 v2 facts/SafetyOverlay，切旧 UI 与 v1 read-only pointer；普通历史包仅离线取证 | Integration 计划、Master M8、R-045 |
| REV-26 | “五平台各做一次真实提交”会把危险外部写入变成普遍发布硬门 | mock confirmation ceremony 是所有平台硬门；真实提交仅在用户批准、测试账户和 provider 政策允许时作为条件证据 | MCP-14、INT-08、ADR-0004 |
| REV-27 | release 激活 P0 被排到集成末期，可能在数周实现后才发现 bundle 仍不可用 | FND-01 后立即执行 INT-02 最小安装版闭环，修复后才允许 FND-02；每个里程碑重跑 installed smoke | Master M0/M1、FND-12、INT-02 |
| REV-28 | “UI 更动态”可能被误解为加动画，设置和内部状态仍平铺在主屏 | 新增 RQ-UI-06：主屏只保留题目/阶段、当前行动、反馈、时间线；账户、provider、诊断、实验开关按原生表面渐进披露 | UI 线框、UI 规格、UI-05/07/11/13-15/17、R-041 |
| REV-29 | 已锁定的 MCP Apps 边界没有进入规格，后续可能被误做成第二套主工作台 | 固定为脱敏、只读、可关闭的工具结果预览；不能持有领域状态、替代 Current Session 或确认外部写 | 总规格、MCP/UI 规格、ADR-0001 |
| REV-30 | attempt.select 只传 problemKey，同题多次练习会选错历史会话 | 拆成 problem.select(problemKey) 与 attempt.select(attemptId)，并加入同题三次 Attempt 协议/Tree 测试 | UI 规格、UI-05 |
| REV-31 | UI-08 在真实教学安全门实现前声称发布 Validated block | UI-08 只做 receipt-bearing fixture 的纯 renderer；LRN-06～08 拥有私有构造器、publisher 和生产接线，依赖方向改为 UI-08 -> LRN-08 | UI/Learner 计划、Master 依赖 |
| REV-32 | Run/Submit 任务直接写 E3/E4，绕过唯一 EvidenceCapture 路径 | MCP-13/14 只调用 EvidenceCaptureService typed methods，并硬依赖 LRN-01/05；禁止 import EventStore | MCP 计划、Master 依赖 |
| REV-33 | 交接指令跳过 release P0，早期 INT-02 又依赖尚不存在的 Vite manifest | INT-02 拆 Phase A extension bundle/G0R 与 UI-03 后 Phase B Webview assets；启动指令固定 FND-01 -> Phase A -> G0R -> FND-02 | Integration/Master 计划 |
| REV-34 | 风险只有分数，没有 gate、状态、关联需求和关闭任务 | 新增 45 条风险关闭账本，使用 release_blocker/claim_blocker/standard 与 open/mitigating/closed/accepted 生命周期 | 风险登记册、需求关闭规则 |
| REV-35 | installed visual 在 package 前运行，可能测试旧 VSIX | package 先生成 hash-bound artifact manifest；installed/visual 脚本强制消费该 manifest，禁止 development-host fallback | UI-15、INT-02、INT-14 |
| REV-36 | coach 传输把 ValidatedLearnerFacingBlock 退化成裸 string | 协议改为 coach.block + ValidatedLearnerFacingBlockView/receipt/content hash；raw string 在 runtime schema 失败 | UI/Learner 规格与计划 |
| REV-37 | expectedRevision 与跨进程 append 不是原子 CAS | EventStore 在 writer lease 内执行 attempt-scoped compare-and-append，并维护可重建 revision sidecar | 总规格、UI 规格、FND-04 |
| REV-38 | shadow capture 失败会产生 v1-only 事实，且非空 shadow log 无法迁移到空目标 | 增加 fsynced capture outbox；双持久化失败阻断 v1 side effect；staging 合并 legacy + shadow watermark + outbox 并原子切 pointer | Learner 规格/计划、INT-15 |
| REV-39 | 负 Δt 会让遗忘因子大于 1、放大 posterior | effectiveAt 对 previous/evaluatedAsOf clamp，Δt 下界 0；clock anomaly 可诊断且进入 property tests | Learner 规格、LRN-03 |
| REV-40 | 迟到 enabled 事件可能清除后来的 disabled tombstone | enabled 必填 userIntentId 与 clearsDisabledEventId，且必须精确匹配当前 tombstone；旧引用只产生 conflict | Learner 规格、LRN-04 |
| REV-41 | 推荐曝光没有稳定 impression 和真实可见条件 | presentationId + impressionId + surface + visibility；可见比例/时长门和 uniquenessKey 防 reload 重计 | UI/Learner 规格、LRN-10 |
| REV-42 | Tree 常驻平台状态与“设置不裸露”冲突 | 正常 Tree 仅学习集合；服务异常组仅在用户可行动 degraded/auth-required 时出现并在恢复后消失 | UI-05 |
| REV-43 | 提交 Server 无法获得用户确认时的未保存/Remote URI 精确代码 | prepare 传 TextDocument 内存 OjCodeArtifact，Server 写 SubmissionCodeVault；proof/commit 绑定 opaque artifact/hash，禁止重读路径 | MCP 规格、MCP-14 |
| REV-44 | dispatching 无法区分 socket 前后崩溃却声称可确认未发送 | 改为保守 dispatch_claimed；claim fsync 后永不再次调用 adapter，未知结果只查询，不宣称已发/未发 | MCP 规格、ADR-0004、MCP-14 |
| REV-45 | Provider manifest 无 rollback artifact/secret mapping，多个 entrypoint 共用一份工具 allowlist | active/rollback 完整 artifact descriptors；每个 entrypoint 独立 expectedTools/risks/secretRefs | MCP-01、MCP-15 |
| REV-46 | rollback-compatible VSIX 只有概念，没有构建和安装测试 | INT-13 新增独立 profile/script/test/artifact manifest，INT-14 同时构建验证 RC 与 rollback 包 | Integration 计划 |
| REV-47 | RC 空环境只验证一个代表 provider，覆盖不了 Node/Python/remote/private 差异 | 五个平台每个最终 manifest 的 active/rollback 都安装、启动、tools-list、卸载和回退 | INT-14 |
| REV-48 | AtCoder Server 自己 local test 会绕过唯一 RunGateway 沙箱门 | AtCoder package 只产生 import/download/test plan；oj test 也必须作为 MCP-13 RunGateway 受管 adapter | MCP-10、MCP-13 |
| REV-49 | OjSearchResult 只有 ProblemRef，无法显示标题、难度和标签 | 新增 OjProblemSummary，搜索返回 summary 列表并保留 source | MCP 规格、MCP-01、MCP-09 |

## 3. UI 成熟度专项结论

本轮追加审阅明确否决“在现有 6685 行模板上换颜色、加卡片、加动画”的路线。UI 成熟度由以下行为判断：

1. 用户进入工作台后五秒内能说出正在做哪道题、处于哪个阶段、当前唯一主行动是什么。
2. 正常学习状态不出现 provider ID、模型参数、遥测字段、feature flag、内部 badge 墙或大段画像 JSON。
3. 主视图同一时刻只有一个 primary action，最多两个可见 secondary action；破坏性和外部写操作不能与普通提示同权。
4. 常规设置进入 VS Code Settings 的 @ext 过滤页；账户进入命令面板/原生认证；provider 管理进入专用管理面；诊断进入 Output/受控详情。
5. 动效只表达请求开始、流式 block 到达、阶段变化、可恢复失败和任务完成，并遵守 prefers-reduced-motion。
6. 验收使用最终安装 VSIX 的 260/320/360/600 像素截图、浅色/深色/高对比/减少动画、键盘流程和配置表面断言。

因此，“界面看起来更高级”被转换成可失败的层级、密度、配置披露和安装态测试，不依赖审阅者主观口味作为唯一证据。

## 4. 仍需实施证据的风险

以下事项不是规划缺口，也没有被文档工作伪装成已解决：

- release VSIX 安装后缺少 teaching workflow module，当前仍是 P0；INT-02 必须先写失败安装测试再修复。
- 洛谷 live upstream 在调查环境超时；五平台均须通过 fixture、schema drift、限流、认证过期和条件 live smoke。
- provider 候选的许可证、发布 artifact、运行时和维护状态须在实际 pin 当天重新核验。
- Learner v2 的 60% profile section token 降幅、迁移表现和推荐相关性必须由固定回放集产生。
- 朋友内测少于足够统计效力时，只能报告系统指标和探索性迁移表现，不能宣称真实学习提升。
- UI 线框只有实施为真实 React/VS Code 表面，并通过安装版截图和交互门后，才能证明产品成熟度改善。
- 真实提交不作为无条件 CI；没有用户逐次确认、测试账户和 provider 许可时，预期结果就是安全阻断。

## 5. 闭环验收

规划包在提交前必须同时满足：

- 本文所有 REV 项都能定位到至少一个规格约束和一个实施/验收落点。
- 需求追踪的正向与反向边集合完全相等，不只计数相等。
- 风险登记册的影响、概率和优先级可机械复算。
- MCP 候选权重合计 100，原始维度分数和加权总分可复算。
- 全包不存在未决占位标记或延期处理标记。
- 本地 Markdown 链接有效，代码围栏闭合，表格列数一致。
- 规划分支 compile 和完整测试仍通过；用户原脏工作树没有被修改。

完成这些检查只表示本轮调查与制订计划可交付。后续实现仍必须逐任务执行 red-green、安装态验证、迁移演练和回滚演练。
