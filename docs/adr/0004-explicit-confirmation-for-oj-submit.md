# ADR-0004：每次真实 OJ 提交显式确认

- 状态：Accepted
- 日期：2026-07-10

## 背景

真实提交是外部、可能计罚时、影响账号并且不可撤销的写操作。网络超时还可能出现“平台已收到但客户端不知道”的状态。当前 UI 的“我已完成”与 AI 估计/归档语义混杂，不能作为真实提交授权。

## 决策

每次真实提交都执行：

```text
prepare -> preview -> user reviews -> native modal confirmation
-> one-time confirmation proof -> commit once -> poll result
```

首版不支持会话授权、后台连续提交、Agent 直接 commit 或 commit 自动重试。

### Preview 必显字段

- 平台与站点；
- 登录账号 display；
- 题号/比赛；
- 语言与平台 language id；
- 文件 URI、bytes 与 SHA-256；
- 最近一次 local run 的 verdict/hash；
- provider、能力来源与风险警告；
- 预计动作：“将向外部平台提交一次”。

### Confirmation proof

prepare 先分配稳定 `submissionOperationId` 并在 local Server ledger 写 `prepared`。Extension Host 在原生 modal 确认后生成 proof，绑定：`intentId + submissionOperationId + provider + platform/site + account + problem + language + codeSha256 + expiresAt + nonce`。proof 一次性、短 TTL，不进 Webview state、日志、模型或普通 command 参数。

### Commit 语义

- Server 再次校验所有绑定字段；不匹配/过期立即阻断。
- Server 在调用上游前原子消费 proof nonce/requestId，并 fsync operation ledger 为 `dispatch_claimed`；从该点起重复 commit 或重启只返回/查询既有 operation，不再次调用 adapter。
- commit 不由通用 retry middleware 重试；上游本身通常不幂等，at-most-once 由本地 ledger/dispatch gate 提供。
- 响应丢失或 Server 崩溃返回/恢复为 `outcome_unknown`；之后只按 prepare 时已经知道的 `submissionOperationId` 查询。
- 用户修改代码、换语言、换账号、重启 provider 都使 intent 失效。
- `commit_submission` 不暴露给普通 VS Code Agent。

## 威胁模型

| 威胁 | 防护 |
| --- | --- |
| 双击/消息 replay | requestId 去重 + single-use intent |
| 预览后改代码 | hash 二次校验 |
| 跨账号/跨站复用 proof | proof 绑定 account/site/provider |
| 模型诱导提交 | Agent 不见 commit；confirmation 在 Host 原生 UI |
| 网络超时/进程崩溃双提 | prepare operation id + 持久化 dispatch ledger；commit 无 retry；poll only |
| Webview 伪造确认 | Webview 只能请求 review；proof 由 Host 生成 |
| Server 新增 direct submit tool | allowlist/schema hash/quarantine |
| 后台任务连续提交 | policy 不注册该能力 |

## 后果

正面：用户知道实际提交内容；外部写与 AI 估计分离；网络不确定时避免重复；审计证据完整。

代价：每次多一步确认；平台 Server 都要实现 prepare/commit；某些现成 Server 需 fork；自动刷题/批量提交不支持。

## 被拒绝方案

- “第一次确认，本会话都允许”：威胁模型和误操作面显著扩大。
- Webview 内普通按钮直接 submit：可伪造/重放，无法安全持有 proof。
- 把上游 submit 标为 idempotent 后自动 retry：平台通常不提供可靠幂等键。
- 让用户只确认题号、不确认 hash/账号/语言：无法证明预览与实际一致。

## 验证

- 无 confirmation、过期、hash/account/site mismatch 全部失败；
- 双击、duplicate message、Host reload 只产生一次 commit；
- 模拟“claim fsync 前、claim 后 socket 前、上游成功后、MCP 响应丢失”均有保守恢复结果，且不会第二次调用 adapter；
- proof/secret 不出现在日志、Webview、MCP tool history、模型 trace；
- 取消确认不产生外部写事件；
- 每个平台 live submit 必须单独人工启用，默认测试只用 mock。
