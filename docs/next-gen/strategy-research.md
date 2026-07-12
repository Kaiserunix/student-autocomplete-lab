# 学习策略研究结论与采用边界

调查日期：2026-07-10。研究用于形成设计约束，不等于产品已证明学习效果。

## 1. 当前策略裁决

不在 `StudentSkill/v1` 上继续增加阈值。原因：

- 提示调用后的 LLM diagnosis 会立即 merge，2–3 次同类模型意见即可把 candidate 变 active；
- 旧 profile 也以次数/分数到 ready，模型判断与可验证证据没有分层；
- 当前所谓 transfer validation 主要测教师模型对未见 fixture 的标签命中，再估算提示减少，不是学习者的跨题、延迟、低帮助表现；
- 用户点击“已完成”即使 OJ 为 `UNKNOWN` 也可形成完成事件，两次低提示完成又可能成为加难依据；
- 回滚覆盖旧快照，可能回到禁用前；禁用不是不可逆安全 overlay；
- 同题 sessionId 固定，重做、独立尝试和迁移无法可靠区分；
- 现有事件缺少证据等级、independence、帮助暴露、来源、代码 hash、因果链和完整性。

保留资产：独立 autocomplete 边界、JSONL、local oracle、用户纠偏入口、推荐解释字段、模型路由、usage 记录、Teacher Pack 与代码/OJ evidence 分层的雏形。

## 2. 研究基线

### 2.1 分层提示

[2025 数字提示系统综述](https://aclanthology.org/2025.tacl-1.25/)支持行为触发、简短到定向、按学生响应逐层升级的提示设计，但研究异质性和偏差意味着不能把“用了分层提示”当成效果证明。

- 采用：动作逐级升级、先诊断/追问、一次一个动作、提示淡出、理解检查。
- 不采用：由模型一次性同时生成 hint、checkpoint、micro-steps 并全部展示。

### 2.2 CodeAid

[CodeAid](https://arxiv.org/abs/2401.11314)在大型编程课堂中强调不直接给最终解、行级解释、伪代码/子目标和学生控制。它证明可用性与课堂采用，不是学习增益 RCT。

- 采用：答案门、代码锚点、子目标、用户控制、提示深度。
- 不采用：把使用次数或主观帮助直接作为掌握证据。

### 2.3 LearnLM / Guided Learning / Study Mode

[LearnLM](https://arxiv.org/abs/2412.16429)、[Gemini Guided Learning](https://blog.google/products-and-platforms/products/education/guided-learning/)和 [OpenAI Study Mode](https://openai.com/index/chatgpt-study-mode/)共同强调主动参与、管理认知负担、逐层解释、理解检查、元认知与可行动反馈。OpenAI 也说明依靠系统指令的行为可能不一致。

- 采用：教学动作控制器、一个动作、检查点、自我解释、行动理由。
- 不采用：只靠 prompt 保证状态、安全或答案门；这些必须由确定性控制器执行。

### 2.4 学生问题与 SQKT

[SQKT](https://aclanthology.org/2025.acl-long.1343/)表明学生问题可改善编程知识追踪的表现预测。问题文本含有掌握/误区信号，但仍是预测特征。

- 采用：问题作为 E1 特征，影响待诊断技能、教学偏好和动作候选。
- 不采用：学生问到某概念就直接认定存在误区、晋级或掌握。

### 2.5 知识追踪

经典 [Bayesian Knowledge Tracing](https://doi.org/10.1007/BF01099821)提供可解释的掌握/猜测/失误思路。首版采用更易审计的加权 Beta-Bernoulli，而不是不可解释深度模型。

- 采用：先验、后验、不确定区间、遗忘、可重放。
- 不采用：只展示单一 confidence score；深度 KT 只作为离线对照。

### 2.6 Contextual Bandit

[LinUCB](https://arxiv.org/abs/1003.0146)可用于安全候选集内的探索排序；[离线 replay](https://arxiv.org/abs/1003.5956)要求有合适的随机/propensity 日志。

- 采用：硬过滤后、低权重、feature flag 的排序实验。
- 不采用：在没有至少 1,000 条带 propensity 的安全随机决策前声称 bandit 离线改善；不允许探索越过安全门。

### 2.7 Tutor CoPilot

[Tutor CoPilot](https://arxiv.org/abs/2410.03017)的随机研究支持 AI 辅助真人导师可能改善结果，但场景是 K-12 数学且有人类导师中介。

- 采用：把 AI 当教学动作建议器而不是权威。
- 不采用：把其百分点直接外推到算法自学插件。

### 2.8 ExeGen 与多代理

[ExeGen](https://papers.nips.cc/paper_files/paper/2025/hash/85dbd2fb8b355e4231b51e454c08ec1c-Abstract-Conference.html)说明多代理可用于练习生成/验证，但仍需要执行、oracle、去歧义与在线评估。

- 采用：生成题可作为离线候选，必须执行和验证。
- 不采用：因“多代理”新颖就进入主运行架构；没有 oracle 的生成题不能作为迁移证据。

## 3. 证据等级

| 等级 | 来源 | 掌握更新 | 例子 |
| --- | --- | ---: | --- |
| E0 | LLM 候选/旧画像叙述 | 0 | 标签、误区、教学动作建议、legacy summary |
| E1 | 行为/自报 | 0 | 提问、请求提示、跳过、`UNKNOWN` 完成、自我解释文本 |
| E2 | 确定性静态证据 | pass 0.20 / fail 0.50 | 编译器、AST、类型/数据流规则 |
| E3 | 本地动态/可执行 oracle | 0.80 | 样例、微型反例、沙箱测试 |
| E4 | 可验证外部结果/治理 veto | 1.00 | OJ verdict、人工验证、用户纠偏 |
| E5 | 未见题、延迟、低帮助迁移 | 1.25 | 不同题族、延迟至少 7 天、E3/E4 验证 |

优先级：E5 > E4 > E3 > E2 > E1 > E0。重复证据由 independence key 去重；同题同缺陷 24 小时内重试最多 0.25 独立权重。

## 4. 可证伪的目标

| 目标 | 基线 | v2 门 | 可声称内容 |
| --- | --- | --- | --- |
| profile prompt 中位数 | 当前实例约 136 token 粗估 | ≤54 token，且不损失必要 hard rules | “画像段更紧凑” |
| disabled 重激活 | 需 replay 测量 | 0 | “安全不变量通过” |
| 无迁移掌握 | 当前 schema 可发生 | 0 | “状态门更严格” |
| 无迁移加难 | `UNKNOWN completed` 有风险 | 0 | “推荐硬门通过” |
| 无理由推荐 | 当前已有解释字段 | 0 | “解释完整率 100%” |
| autocomplete 泄漏 | 尚未完整请求体测量 | 0 | “固定 canary 集零泄漏” |
| 真实学习 | 未测 | 延迟未见迁移题 + 对照/配对报告 | 只能在有足够人类证据时谨慎描述 |

系统指标改善不能写成“提高了学习效果”。最低 30 个朋友内测任务只能证明可用性与发现问题；学习结论需要更多参与者、技能分层、延迟测量和不确定区间。

## 5. 朋友内测分层

### Gate A：系统/安全试运行

- 至少 30 个代表任务；
- 覆盖 5 平台、4 语言、完成/放弃/离线/错误/确认取消；
- 重点报告 crash、事件完整率、恢复率、错误提交、泄漏和体验。

### Gate B：学习迁移探索

理想设计为 12–20 位参与者、每人约 20 题、4 个匹配技能族：

- Day 0 无帮助前测；
- Day 1–7 练习；
- Day 8 未见迁移题；
- Day 22 延迟保持；
- 技能族内比较两种都通过安全门的教学动作策略；
- 报告 E5 pass、提示负担、放弃、Brier/ECE、配对差值和 bootstrap 区间。

若参与者或任务数不足，只报告 case series，不做总体因果结论。

## 6. 成本约束

- 事件、静态/动态检查、reducer、硬过滤、固定排序：0 token。
- 每教学轮最多一次 LLM 候选调用，目标 ≤1,500 input + 300 output tokens。
- 每 attempt 默认最多 3 次付费调用，超限退化为确定性动作。
- 100-call 校准约 0.20M tokens；小规模内测建议总硬上限 1.0M tokens。
- 任何 live/batch route 默认 dry-run；运行前显式 `maxTokens` 和 `maxUsd`，建议总预算不超过 10 USD 或账户安全配额的较低者。
- provider price 是运行时配置/报告数据，不能把仓库静态价格当长期事实。

## 7. 采用结论

主架构采用：事件事实源、证据等级、可解释概率状态、确定性教学动作控制器、两阶段推荐、可选安全 bandit、旧实现只读归档。

对照实验保留：深度 KT、多代理练习生成、学习型排序。它们只有在固定 replay、人类迁移表现和成本三者都胜出时才可能替换主路径。
