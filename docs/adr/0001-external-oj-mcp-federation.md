# ADR-0001：外部 OJ MCP 联邦

- 状态：Accepted
- 日期：2026-07-10
- 决策者：项目所有者 + 本轮规划审阅

## 背景

扩展当前同时拥有洛谷 HTTP clients、4-tool 内置 MCP 和进程内“伪 MCP”推荐；另一个独立仓库已提供 11-tool 洛谷 MCP、stdio 和 Streamable HTTP。继续在扩展和 Server 两边实现平台解析会造成 schema、重试、认证、限流与修复漂移。首批还要加入 LeetCode、牛客、Codeforces、AtCoder，复制模式不可扩展。

## 决策

采用“五个平台 Server 各自权威，扩展只做可信 Broker”的联邦架构。

- 每个平台 I/O、认证、上游 response normalization、rate limit 和平台错误属于独立 Server。
- 扩展拥有 `OjBroker`、中立领域契约、能力策略、产品流程、教学策略、提交确认 UI 和本地数据所有权。
- 确定性 UI 操作由扩展直接调用 Broker，不让模型充当普通导题/运行流程中间人。
- 同一平台实现提供独立 Agent-facing read-only entrypoint，通过 `McpServerDefinitionProvider` 暴露；VS Code 的定义粒度是整台 Server，因此 Agent 实际 `tools/list` 只能注册 R0/R1。产品 Broker 的 private entrypoint 不暴露给 Agent。
- 公开只读可使用固定远程 HTTP；账户私有读、运行与提交优先本地 stdio。
- 扩展内置洛谷 MCP 和直接 HTTP clients 进入弃用：先 shadow compare，再切读流量，保留一个发布周期只读回滚，随后删除。
- Server 与扩展通过版本化 JSON Schema 交互，不共享业务源码。
- 扩展负责经用户确认的 provider artifact 生命周期：固定来源/version/commit/OS/arch/runtime/entrypoint/hash/attestation/SBOM，安装到 globalStorage 并可原子回退；不依赖开发机绝对路径、全局包或 `@latest`。
- 平台提交 Server 在 prepare 时预分配稳定 operation id，并用持久化 ledger 保证 crash/response-lost 后可查询且 upstream dispatch 最多一次。
- MCP Apps 仅可作为脱敏、只读、可关闭的工具结果预览；主学习会话、状态恢复和提交确认仍完全属于扩展。

## 所有权

| 所有者 | 负责 | 不负责 |
| --- | --- | --- |
| 平台 Server | auth、抓取/API、normalize、平台 run/submit、platform error | Student Skill、推荐排序、UI、朋友内测事件 |
| `OjBroker` | discovery、schema validation、capability/policy、routing、health、telemetry | 页面解析、教学动作 |
| Learning domain | attempt、evidence、教学、推荐、迁移验证 | Cookie、上游协议 |
| UI | 展示能力、预览、显式确认、恢复动作 | 直接调用 Server、保存凭据 |

## 后果

正面：平台修复集中；五站可独立部署/回滚；能力和来源可追踪；凭据边界更清楚；Agent 与产品 Broker 可复用同一套已审计 provider 代码和契约，同时使用风险隔离的不同 entrypoint。

代价：需要中立契约、Broker 生命周期、多个进程健康与版本管理；社区 Server 必须 fork/审计；不同平台能力不会完全对称。

## 被拒绝方案

- **全部平台逻辑放扩展**：发布耦合、认证和网络依赖扩大，无法独立更新。
- **一个巨型多平台 Server**：凭据和故障域过大，平台许可证/部署策略互相污染。
- **让 Agent 自由选 MCP 完成普通流程**：不可预测、成本高、难做幂等和提交确认。
- **只使用 Registry 自动安装**：Registry 是发现机制，不是安全背书。

## 验证

- 旧/新洛谷 shadow 对拍；
- 五 Server contract/conformance fixtures；
- capability/policy 与注册工具一致；
- Agent 实际发现工具不含 run/prepare/commit；空 PATH/空 cache 能按 manifest 安装与回退；
- 未确认真实提交为零；
- 任一平台下线不影响本地会话与其他平台；
- Secret canary 不进入 MCP 参数、日志、Webview 或模型上下文。
