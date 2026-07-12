# ADR-0002：混合式 VS Code UI 壳

- 状态：Accepted
- 日期：2026-07-10

## 背景

当前 6685 行 `ProblemBankViewProvider.ts` 把题库、当前会话、画像、配置、复盘、HTML、CSS、浏览器脚本和宿主编排放进一个 WebviewView。真实安装态显示 260px 导航截断、600px 伤害编辑器；Webview 状态不可可靠恢复，测试主要依赖源码字符串。

三个独立方向经过比较：原生混合壳、单一自适应 React 工作台、行动时间线。三者各解决不同层级问题。

## 决策

采用组合式目标：

1. 原生 `TreeView` 负责题库、进行中会话、历史和推荐队列。
2. React/Vite `WebviewView` 负责当前学习会话。
3. 编辑器 `WebviewPanel` 负责复杂复盘、画像证据、策略解释和回滚。
4. 当前会话内部采用 `ONE NOW / NEXT / BEFORE`：一个主行动、后续队列、事件时间线。
5. View 与 Panel 共享静态 bundle、设计 tokens、组件和 protocol client；不共享浏览器领域状态。
6. Host `SessionCoordinator` 是唯一领域状态机；Webview 只发送 intent、消费 projection。
7. 不使用已归档的 VS Code Webview UI Toolkit；使用 VS Code CSS variables、Codicon/Lucide 和可访问 headless primitives。
8. 设置、账号、MCP/provider、模型预算和诊断不作为学习首屏内容；使用 VS Code Settings、Command Palette、QuickPick、Output 和按需 Panel 渐进披露。

## 关键约束

- `ProblemBankViewProvider` 最终不超过约 250 行注册/转发；不得直接 import model clients、JSONL store、Student Skill merge 或平台 clients。
- 260/320/360/600px 使用容器查询；宽复盘不靠永久扩大侧栏。
- 支持 Light/Dark/High Contrast、forced colors、VS Code/reduced-motion 双信号。
- Host/Webview 消息均版本化并经 Zod 验证；所有 command 有 requestId，除 bootstrap/select/start 外的 attempt-bound command 必须有 attemptId + expectedRevision；流式/progress event 有 sequence；每个 accepted command 恰好一个终态 event。
- Webview `setState` 只保存草稿、focus key、scroll anchor、按需详情展开状态和 attemptId。
- React 更新不抢焦点，不整页重建，不以 `retainContextWhenHidden` 代替恢复设计。
- 正常态只有一个显著主行动和最多两个直接可见次动作；技术 ID、设置表单、feature flags 和内部遥测不进入首屏。

## 后果

正面：集合导航更原生；代码编辑保持中心；当前行动清楚；复盘获得宽度；状态可重放；组件/协议/Extension Host 可分层测试。

代价：需要跨三个表面的 Coordinator、Panel serializer 和焦点恢复；构建与 CSP 增加 React 资产管理；迁移必须分阶段绞杀旧 Provider。

## 被拒绝方案

- 在现有 template string 上继续堆 CSS。
- 用一个巨型 React Webview 复制 TreeView、Settings、Output 和通知。
- 用时间线替代题库集合管理。
- 先重写 UI 再补状态机。

## 验证

- `260/320/360/600 × zh/en × light/dark/high-contrast × normal/reduced-motion` 截图与交互矩阵；
- 无水平溢出、文字遮挡和动态布局跳动；
- 正常首屏不裸露设置/内部配置，异常态仍能在两次操作内到达修复或诊断；
- axe serious/critical violation 为零，并完成人工层级/密度评审；
- 全键盘黄金路径和焦点恢复；
- hide/reload/reopen 后恢复同一 attempt；
- 迟到流、取消、离线、错误重试不污染当前状态；
- 最终全新 VSIX 安装后重跑宽度、主题、reduced-motion、键盘和恢复矩阵。
