# 风险登记册

评分：影响 I 与概率 P 均为 1–5；优先级为 `I × P`。负责人是后续实施角色，不是当前调查者。

风险 gate 不使用含糊的 P0/P1 标签：

- `release_blocker`：未关闭不得进入朋友内测或 RC。
- `claim_blocker`：可继续隔离开发，但不得宣称 UI/学习效果完成。
- `standard`：由关联任务关闭，若风险实际发生可由变更控制升级 gate。

状态为 `open | mitigating | closed | accepted`。本规划阶段全部是 open；只有账本所列关闭任务产生验收证据后才能改 closed。accepted 必须有项目所有者签字、到期日和已演练回滚，不能靠实现者自行降级。

| ID | 风险 | I | P | 优先级 | 触发信号 | 预防/恢复 | 验收证据 | 负责人 |
| --- | --- | ---: | ---: | ---: | --- | --- | --- | --- |
| R-001 | release VSIX 漏装运行时依赖，安装后无法激活 | 5 | 5 | 25 | Extension Host `Cannot find module` | 从 import graph 生成白名单；全新 profile 安装 smoke | 安装态黄金路径 + 零 exthost error | Release |
| R-002 | 普通 beta 把内部文档、实验代码或隐私材料发给朋友 | 5 | 4 | 20 | VSIX 包含 `docs/fixtures/cli/internalTesting` | 单一 release pipeline、内容 allowlist、secret/content scanner | `vsce ls` 快照和阻断测试 | Release |
| R-003 | 同一次提交因网络超时被自动重试两次 | 5 | 3 | 15 | commit 无响应、通用 retry 生效 | prepare/commit 分离；claim fsync 后 adapter 永不重调；只按 prepare 已知的 submissionOperationId 查询 ledger/status | 四个 claim/socket/crash/lost-response fixture，无第二次 adapter invocation | OJ Security |
| R-004 | 确认后代码被修改，实际提交内容与预览不一致 | 5 | 3 | 15 | preview hash 与 commit hash 不同 | 短 TTL intent；commit 二次校验 platform/problem/language/account/hash | mismatch 必须阻断 | OJ Security |
| R-005 | Cookie/API key 进入模型、Webview、参数或日志 | 5 | 3 | 15 | 日志/trace 出现认证字段 | SecretStorage；本地 stdio env；结构化脱敏；远端禁 cookie | secret canary 全链路零命中 | Security |
| R-006 | 远程只读 fallback 携带代码、Teacher Pack 或学习事件 | 5 | 3 | 15 | remote request body 出现私有字段 | Broker 按风险域构造最小请求；远端只接 `OjProblemRef` / query | 网络记录 contract test | Privacy |
| R-007 | 第三方 MCP 宣称 read-only，实际新增写工具 | 5 | 3 | 15 | `tools/list_changed` 出现未审工具 | 静态 allowlist + schema hash + risk policy；变化隔离 | 未批准工具不可调用 | MCP |
| R-008 | 洛谷、LeetCode、AtCoder 非官方自动化触发条款/CAPTCHA/封号 | 5 | 4 | 20 | 403、challenge、账号异常 | 平台合规矩阵；个人本地显式启用；不承诺被阻断提交 | PoC policy status 明确 `disabled_by_policy` | Product/Security |
| R-009 | Windows 无沙箱运行下载/生成/参考代码访问文件或网络 | 5 | 4 | 20 | untrusted artifact 在普通用户进程执行 | 当前绑定学生代码只走 bounded trusted mode；其他 artifact 无 AppContainer/WSL/container 就阻断 | 逃逸 fixture 与无沙箱 untrusted run 被阻断 | Runner |
| R-010 | 自动补全读取题面、答案或 marker 外内容 | 5 | 3 | 15 | 完整 provider request 出现 canary | 单一 ContextBoundary；prefix/suffix/metadata 全请求体测试 | 泄漏数必须为 0 | Autocomplete |
| R-011 | 侧栏预览绕过 Inline provider 安全 gate | 5 | 3 | 15 | 两条路径 payload 不同 | 预览和 inline 只调用同一 request builder | payload snapshot 一致 | Autocomplete |
| R-012 | Webview/Host 双状态导致刷新后会话、草稿或焦点丢失 | 4 | 5 | 20 | reload 后 thread 为空或回错题 | Host 单一事实源；Webview 只存 UI 恢复元数据 | reload/hidden/reopen E2E | UI |
| R-013 | 迟到事件解除其他请求 busy 或写入另一题 | 4 | 5 | 20 | 任意 message 执行全局 unlock | requestId/attemptId/revision/sequence；operation registry | 乱序 property tests | UI/Protocol |
| R-014 | 260px 导航/按钮被截断，关键动作不可达 | 4 | 5 | 20 | 标签省略、横向滚动、动作在首屏外 | 单主行动、次动作菜单、容器查询 | 260px screenshot + keyboard gate | UI |
| R-015 | 600px 侧栏侵占编辑器，学习工具反客为主 | 3 | 4 | 12 | 编辑器宽度不足 | 宽复盘进入 Webview Panel；侧栏保持会话摘要 | 600px 布局验收 | UI |
| R-016 | 动画忽略 reduced-motion 或造成流式布局跳动 | 3 | 4 | 12 | 无限旋转/平滑滚动仍生效 | CSS/VS Code reduced motion 双信号；稳定高度增量 | reduced-motion screenshot/trace | UI |
| R-017 | UI 测试仍以源码字符串存在当作行为证据 | 4 | 5 | 20 | 测试只 `readFile(...).toContain` | reducer/component/protocol/Extension Host/截图五层门 | 删除主证据字符串测试 | QA |
| R-018 | 事件与投影双写中途失败，无法重放一致状态 | 5 | 3 | 15 | event append 成功、session rewrite 失败 | append-only event log；投影可重建；原子 checkpoint | crash/replay fault injection | Data |
| R-019 | 同一题多次练习共享 `attempt:${problemKey}` 被覆盖 | 4 | 4 | 16 | 新一轮复用旧 sessionId | 随机 attemptId；`OjProblemRef` 只作索引 | 同题三次 replay 独立 | Data |
| R-020 | 旧 Student Skill 结论被直接当 v2 事实继承 | 5 | 3 | 15 | migration 从 `skills` 字段造 active/mastered | 只导入原始可验证事件与用户纠偏；旧文件只读 | migration provenance report | Learning |
| R-021 | LLM 一次高置信诊断直接晋级或掌握 | 5 | 4 | 20 | 单条 model_label 改 mastery | LLM 只产候选；概率更新按证据等级；迁移硬门 | 单证据不可晋级测试 | Learning |
| R-022 | disabled skill 通过陈旧 transfer/recommendation 路径重新生效 | 5 | 3 | 15 | 禁用后仍加分/加难 | disabled 在过滤、投影、提示、推荐均为硬约束 | disabled reactivation = 0 | Learning |
| R-023 | 用系统指标改善声称真实学习改善 | 5 | 4 | 20 | 只有 replay/token 数据却写“学习提升” | 结论分级；朋友内测迁移题才支持学习相关描述 | 报告措辞审计 | Research |
| R-024 | 30 个任务不是 30 个独立样本，统计结论虚高 | 4 | 4 | 16 | 同人/同技能重复任务被当独立 | 任务与参与者分层；报告置信区间和聚类限制 | 预注册分析表 | Research |
| R-025 | contextual bandit 在线探索给新手不合适动作 | 4 | 3 | 12 | 无保护探索触发更难/更深提示 | 硬约束先过滤；默认 deterministic；探索 feature flag | offline replay + safe action set | Recommendation |
| R-026 | MCP 能力健康把 transport 200 当平台可用 | 4 | 5 | 20 | health 绿但上游超时 | 分层 health：transport/auth/upstream/schema/rate-limit | 上游断网时显示 degraded | MCP |
| R-027 | Codeforces API 被误描述为题面或提交 API | 4 | 3 | 12 | UI 出现“官方提交”但无能力 | capability provenance；题面 Companion、提交 manual | capability contract test | MCP |
| R-028 | Competitive Companion localhost 接收器被本机其他进程伪造 | 4 | 3 | 12 | 未授权 POST 导入题目 | 单次接收窗口、nonce、origin/source 校验、用户确认 | forged POST 被拒 | MCP |
| R-029 | LeetCode 双站点 ID/语言/认证混用 | 4 | 3 | 12 | CN problem 被 global cookie 提交 | site/account/ref 三元绑定；独立 SecretStorage key | cross-site fixture 阻断 | MCP |
| R-030 | 平台 response 漂移被当“空题/不存在”写入缓存 | 4 | 4 | 16 | 登录 HTML/CAPTCHA 解析为空 | content-type/schema/known challenge 检测；不缓存失败 | drift fixtures | MCP |
| R-031 | JSONL/快照迁移不是幂等，重复启动复制或丢事件 | 5 | 3 | 15 | migration rerun 结果变化 | migration journal、checksum、dry-run、备份、重复执行测试 | 两次迁移 byte-stable | Data |
| R-032 | 回滚只切 feature flag，数据已被新写路径不可逆改坏 | 5 | 3 | 15 | 旧 reader 不能读取新数据 | 新旧文件并存；旧路径只读；双写仅用于可丢投影 | 一键回滚演练 | Release |
| R-033 | React/Vite 引入后 CSP、资产或 sourcemap 破坏 release | 4 | 4 | 16 | Webview blank、eval、map 入包 | 静态 bundle manifest；nonce CSP；资源 allowlist | 安装态 CSP + VSIX 内容门 | UI/Release |
| R-034 | 旧 Provider 一次性重写导致功能遗漏 | 4 | 5 | 20 | 导题/纠偏/归档路径无替代 | strangler 迁移、兼容协议、逐表面 golden path | 每阶段能力矩阵 | Architecture |
| R-035 | Provider 只是拆文件但仍跨层 import，复杂度转移未消失 | 4 | 4 | 16 | UI host 直接 import model/storage/skill merge | 依赖规则与 lint gate；Coordinator/ports 边界 | architecture dependency test | Architecture |
| R-036 | VS Code 版本声明与实际 API/测试版本错位 | 3 | 4 | 12 | 1.125 上安装失败或类型未覆盖 | engines/types/CI matrix 同步；最低版本 Extension Host | 1.125.x + current stable smoke | Release |
| R-037 | 本地用户已有 17 个画像快照导致迁移耗时/体积膨胀 | 3 | 4 | 12 | 启动时全量重复解析 | 流式 replay、checkpoint、压缩归档、进度/取消 | 最大 fixture 性能门 | Data |
| R-038 | 真实提交确认被快捷键、Agent 或会话授权绕过 | 5 | 3 | 15 | command 直接触发 commit | commit 不注册为普通 Agent tool；确认 proof 绑定 UI ceremony | 绕过测试全部失败 | OJ Security |
| R-039 | 运行/提交错误把 WA/CE/TLE 当 transport error 自动重试 | 5 | 3 | 15 | verdict 进入 retry policy | verdict 是成功领域结果；只有明确网络读可重试 | error taxonomy tests | OJ |
| R-040 | 日志记录原始代码、题面、答案、个人事件 | 5 | 3 | 15 | internal log 出现 canary | 结构化最小遥测、默认本地、字段 allowlist、保留策略 | privacy scanner | Privacy |
| R-041 | 设置、账号、provider、模型和内部统计裸露，主界面像工程配置面板 | 4 | 5 | 20 | 首屏首先看到设置卡、badge 墙或技术 ID | 原生 Settings/Commands/QuickPick/Output 渐进披露；ONE NOW 主层级 | configuration surface test + 人工 5 秒层级评审 | UI/Product |
| R-042 | fresh profile 找不到外部 Server，只能依赖开发机绝对路径/PATH | 5 | 4 | 20 | VSIX 激活但 provider 全 unavailable | artifact manifest、hash/attestation、globalStorage installer、atomic rollback | 空 PATH/cache 安装/启动/卸载/降级 | Release/MCP |
| R-043 | 多 VS Code 窗口并发写同一 EventStore，sequence/hash/sidecar 竞争 | 5 | 4 | 20 | 重复 sequence、断链、sidecar 倒退 | 跨进程 lease/CAS + 复合唯一索引 + crash recovery | 双进程/强杀持锁者测试 | Data |
| R-044 | 模型原始 token 在安全检查前流给学生，答案片段无法撤回 | 5 | 3 | 15 | 正常 hint delta 命中答案/完整代码 canary | 先生成并整体验证 learner-facing blocks，再按验证 block 呈现 | 首 delta 前 canary/相似度/模板 gate | Teaching/UI |
| R-045 | 回装历史 VSIX 恢复旧 v1 writer，回滚期产生第二事实源 | 5 | 3 | 15 | 回滚期间 legacy JSON/JSONL 新写 | rollback-compatible VSIX 保留 v2 capture，只切 v1 read-only | 回滚期间操作再 replay 一致 | Migration/Release |

## 风险关闭账本

| ID | Gate | 关联需求 | 主要关闭任务 | 规划状态 |
| --- | --- | --- | --- | --- |
| R-001 | release_blocker | RQ-BASE-02、RQ-REL-01 | INT-02、FND-12、INT-14 | open |
| R-002 | release_blocker | RQ-PRIV-01、RQ-REL-01 | INT-10、INT-14 | open |
| R-003 | release_blocker | RQ-SUB-01 | MCP-14、INT-08 | open |
| R-004 | release_blocker | RQ-SUB-01 | MCP-14、UI-09、INT-08 | open |
| R-005 | release_blocker | RQ-SEC-01、RQ-PRIV-01 | MCP-15、INT-10 | open |
| R-006 | standard | RQ-SEC-01、RQ-PRIV-01 | MCP-03、INT-10 | open |
| R-007 | standard | RQ-MCP-03、RQ-MCP-04、RQ-SEC-01 | MCP-03、MCP-16 | open |
| R-008 | standard | RQ-MCP-02、RQ-SEC-01 | MCP-16、INT-08 | open |
| R-009 | release_blocker | RQ-RUN-01 | MCP-13、INT-08 | open |
| R-010 | release_blocker | RQ-AUTO-01 | FND-09、INT-06 | open |
| R-011 | standard | RQ-AUTO-01 | FND-09、INT-06 | open |
| R-012 | claim_blocker | RQ-UI-02、RQ-UI-03 | UI-12、INT-09 | open |
| R-013 | claim_blocker | RQ-UI-02、RQ-UI-03 | UI-02、UI-13 | open |
| R-014 | claim_blocker | RQ-UI-04、RQ-UI-06 | UI-14、INT-09 | open |
| R-015 | standard | RQ-UI-04、RQ-UI-06 | UI-11、INT-09 | open |
| R-016 | claim_blocker | RQ-UI-04 | UI-11、UI-14 | open |
| R-017 | claim_blocker | RQ-UI-05 | UI-13、UI-17 | open |
| R-018 | release_blocker | RQ-EVT-01、RQ-EVT-02 | FND-04、INT-05 | open |
| R-019 | standard | RQ-ATT-01 | FND-06、INT-05 | open |
| R-020 | standard | RQ-MIG-01、RQ-LRN-01 | FND-08、LRN-02 | open |
| R-021 | release_blocker | RQ-LRN-02、RQ-LRN-03 | LRN-03、LRN-17 | open |
| R-022 | release_blocker | RQ-MIG-01、RQ-LRN-03 | FND-07、LRN-04 | open |
| R-023 | claim_blocker | RQ-BETA-01 | LRN-16、INT-12、INT-15 | open |
| R-024 | claim_blocker | RQ-BETA-01 | LRN-16、INT-12 | open |
| R-025 | standard | RQ-EXP-01、RQ-REC-01 | LRN-11、LRN-13 | open |
| R-026 | claim_blocker | RQ-MCP-04 | MCP-03、MCP-16 | open |
| R-027 | standard | RQ-MCP-02 | MCP-09、MCP-16 | open |
| R-028 | standard | RQ-MCP-02、RQ-SEC-01 | MCP-08、MCP-16 | open |
| R-029 | standard | RQ-MCP-02、RQ-SEC-01 | MCP-12、MCP-16 | open |
| R-030 | standard | RQ-MCP-04 | MCP-04、MCP-16 | open |
| R-031 | release_blocker | RQ-EVT-02、RQ-MIG-01 | FND-08、LRN-02、INT-04 | open |
| R-032 | release_blocker | RQ-MIG-01、RQ-REL-02 | INT-13、INT-14 | open |
| R-033 | claim_blocker | RQ-UI-05、RQ-REL-01 | UI-03、INT-14 | open |
| R-034 | standard | RQ-UI-01 | UI-16、UI-17 | open |
| R-035 | standard | RQ-ARCH-01 | FND-11、UI-17 | open |
| R-036 | standard | RQ-REL-01 | UI-15、INT-14 | open |
| R-037 | standard | RQ-EVT-02、RQ-MIG-01 | INT-04、INT-11 | open |
| R-038 | release_blocker | RQ-SUB-01 | MCP-14、INT-08 | open |
| R-039 | standard | RQ-RUN-01、RQ-SUB-01 | MCP-13、MCP-14、INT-08 | open |
| R-040 | release_blocker | RQ-PRIV-01 | FND-10、INT-10 | open |
| R-041 | claim_blocker | RQ-UI-06 | UI-13、UI-14、INT-09 | open |
| R-042 | release_blocker | RQ-MCP-03、RQ-REL-01 | MCP-15、INT-14 | open |
| R-043 | release_blocker | RQ-EVT-02 | FND-04、INT-13 | open |
| R-044 | release_blocker | RQ-LRN-04、RQ-UI-03 | LRN-06、LRN-08、UI-08 | open |
| R-045 | release_blocker | RQ-MIG-01、RQ-REL-02 | INT-13、INT-14 | open |

## Gate 摘要

以下风险未关闭时不得进入朋友内测：`R-001`、`R-002`、`R-003`、`R-004`、`R-005`、`R-009`、`R-010`、`R-018`、`R-021`、`R-022`、`R-031`、`R-032`、`R-038`、`R-040`、`R-042`、`R-043`、`R-044`、`R-045`。

以下风险未关闭时可以继续本地开发，但 UI/学习效果不得宣称完成：`R-012`、`R-013`、`R-014`、`R-016`、`R-017`、`R-023`、`R-024`、`R-026`、`R-033`、`R-041`。
