# 下一代算法学习工作台规划包

- 日期：2026-07-10
- 规划分支：`codex/next-gen-planning`
- 调查基准：`098365f2f18a758692a493e9b7b31fe7fe71e163`

本目录及 `docs/superpowers/specs`、`docs/superpowers/plans`、`docs/adr` 构成本轮完整交付。本轮只增加调查、规格、架构决策和实施计划，不修改业务代码。

规划规模：32 条锁定需求、78 个可独立验收任务、8 个实施里程碑、4 个 ADR。后续实现从隔离工作树开始，不能直接在当前用户脏工作树执行。

## 阅读顺序

1. [可信基线](./baseline-audit.md)
2. [总设计规格](../superpowers/specs/2026-07-10-next-generation-learning-workbench-design.md)
3. [MCP/OJ 联邦设计](../superpowers/specs/2026-07-10-oj-mcp-federation-design.md)
4. [状态驱动 UI 设计](../superpowers/specs/2026-07-10-state-driven-ui-design.md)
5. [学习策略与画像 v2 设计](../superpowers/specs/2026-07-10-learner-state-v2-design.md)
6. [需求追踪表](./requirements-traceability.md)
7. [独立架构审阅与闭环](./independent-review-resolution.md)
8. [总实施编排](../superpowers/plans/2026-07-10-next-generation-master-program.md)
9. [事件与契约基座实施计划](../superpowers/plans/2026-07-10-event-and-contract-foundation.md)
10. [MCP 实施计划](../superpowers/plans/2026-07-10-oj-mcp-federation.md)
11. [UI 实施计划](../superpowers/plans/2026-07-10-state-driven-ui.md)
12. [学习策略实施计划](../superpowers/plans/2026-07-10-learner-state-v2.md)
13. [集成发布计划](../superpowers/plans/2026-07-10-integration-release.md)

## 调查附件

- [MCP 候选评分矩阵](./mcp-candidate-matrix.md)
- [三套 UI 方向与线框](./ui-wireframes.md)
- [学习策略研究结论](./strategy-research.md)
- [风险登记册](./risk-register.md)

## 架构决策

- [ADR-0001：外部 OJ MCP 联邦](../adr/0001-external-oj-mcp-federation.md)
- [ADR-0002：混合式 VS Code UI 壳](../adr/0002-hybrid-vscode-ui-shell.md)
- [ADR-0003：事件派生 Learner State v2](../adr/0003-event-derived-learner-state-v2.md)
- [ADR-0004：每次真实提交显式确认](../adr/0004-explicit-confirmation-for-oj-submit.md)

## 决策摘要

- 五个平台各自由独立 Server 负责平台 I/O；扩展只拥有类型化 Broker、领域映射和产品编排。
- UI 采用原生 TreeView + React WebviewView + 编辑器 Webview Panel；当前学习会话遵循“一个当前行动、一条可恢复时间线”。
- 原始学习事件是唯一事实源；`LearnerStateV2` 是可丢弃、可重放的紧凑投影。
- 真实提交使用 `prepare -> preview -> explicit confirm -> commit`，每次提交都重新确认；超时结果只查询，不自动重提。
- 自动补全继续是独立安全域，不得读取题面、Teacher Pack、教练记录、画像结论或答案。
- 旧实现保留一个发布周期的只读回滚能力；迁移不原地覆盖历史文件。
