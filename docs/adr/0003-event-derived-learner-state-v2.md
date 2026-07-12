# ADR-0003：事件派生 Learner State v2

- 状态：Accepted
- 日期：2026-07-10

## 背景

`StudentSkill/v1` 同时承担原始证据、LLM 叙述、规则、状态和 prompt 摘要。模型诊断可在少量重复后晋级，现有 transfer validation 不等同于学生迁移，事件又不足以重放当前画像。版本文件从约 8 KB 增长到约 97 KB。

## 决策

- `LearnerEvidenceEvent` append-only log 是唯一事实源。
- `LearnerStateV2` 是版本化纯 reducer 生成的可丢弃投影。
- 证据分 E0–E5；LLM 与行为自报不直接增加掌握。
- 采用带遗忘和帮助折扣的加权 Beta-Bernoulli，显示可信区间。
- `disabled` 位于不可被普通 rollback 移除的 safety overlay。
- 掌握要求两个不同题族 E5 pass，至少一个延迟 7 天。
- 每 turn 由确定性 Controller 选择一个教学动作。
- 推荐先硬过滤，再多目标排序；bandit 只能重排安全集合。
- 旧 Student Skill/Profile 只读归档；只迁移可验证事件、用户纠偏和禁用治理，旧结论最多 E0。

## 后果

正面：状态可重放、可解释、可校准；用户纠偏有真正语义；禁用与迁移成为硬门；prompt 更紧凑；新策略可 shadow compare。

代价：需要事件 taxonomy、artifact store、reducer version/checkpoint、概率校准和历史差异报告；旧历史无法神奇升级成高等级证据，初期会显示更多 unknown/candidate。

## 被拒绝方案

- 在 v1 上继续加阈值：无法解决事实/投影混合和重放缺失。
- LLM 全权画像：不可审计，纠偏与禁用易漂移。
- 直接采用深度 KT：当前数据量、可解释性与离线评估条件不足。
- 只保存最终 State：无法迁移 reducer、审计或纠错。
- 把所有原始代码塞进事件：隐私和体积不可接受；代码走本地 CAS。

## 验证

- 同事件/版本得到相同 state hash；
- duplicate/乱序/损坏事件有确定行为；
- disabled reactivation、无 E5 掌握/加难、多动作、无理由推荐、泄漏均为 0；
- v1/v2 差异报告能解释每个状态变化；
- 一键回滚不丢事件、不复活禁用、不降低 autocomplete 策略；
- 人类数据不足时报告不声称学习增益。
