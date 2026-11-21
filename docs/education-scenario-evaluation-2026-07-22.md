# 教育场景与侧边栏联测报告（2026-07-22）

Status: Reference — empirical Codex OAuth sidebar evaluation and cross-module educational hard-gate audit.

## 结论

本次在已安装的 `kaiserunix.student-autocomplete-lab-beta-release@0.1.0-beta.1` 中完成了真实 Codex OAuth 联测，并同时运行确定性评测与跨模块教育硬门审计。

当前结论分为两层：

- **交互能力可用**：简单提示、渐进提示、继续追问、学习画像、健康检查和自动 Ghost Text 都能工作；去掉显式错误注释后的单次纠偏复测也能识别道路可达性与交易顺序；真实 Ghost Text 能自动触发，且本次给出了正确、局部的一行续写。
- **教育发布门未通过**：同题同主痛点的旧基线证据，加上本轮同一代码快照的两次连续提示，合计三份后就把技能累计成 `active`；侧边栏“测试补全接口”生成了与 cursor/suffix 局部上下文不匹配的价格扫描片段；推荐、禁用技能、迁移证据、纠错、回滚和事件重放还存在已复现的跨模块缺口。

因此，这个版本适合个人 Beta 内测和继续采样，不应宣称已经证明学习效果，也不应把 Student Skill 或自动推荐当作高可信结论。

## 范围与评测设置

- 评测版本：`kaiserunix.student-autocomplete-lab-beta-release@0.1.0-beta.1`（`codex/language-skill-composition`）
- 模型路由：补全 `gpt-5.3-codex-spark`，教练/分析 `gpt-5.6-terra`（`codex-app-server`）
- 测试题目：P1073 `[NOIP 2009 提高组] 最优贸易`
- 测试代码：故意忽略道路方向、可达性与买卖顺序，只计算全局最低/最高价（`print(max(prices) - min(prices))`）
- **Cue contamination 说明**：首轮合成文件包含注释 `# 错误尝试：忽略城市间的可达关系和买卖先后顺序。`，直接泄露预期主痛点，因此首轮仅评估“有显式线索时的教学克制性”。后续另用不含该注释、文件名中性的临时代码做了一次独立纠偏复测。
- **数据隔离**：两轮测试前后均对学习数据（`attemptEvents.jsonl`、`attemptSessions.jsonl`、`problems.jsonl`、`studentProfile.json`、`studentSkill.json`、`teacherPacks.jsonl`、`studentSkillVersions/`）做备份与 SHA-256 恢复校验，未改动扩展 global storage 中的 `codex-oauth`，且工作树内不留任何凭证或临时备份。

## 真实侧边栏联测

评分采用双轨：功能分 `F`（0–2）与教育分 `E`（0–4；教练 4 分表示准确、渐进、克制并给清晰下一步；补全 4 分表示精确最小局部续写且无泄漏）。

| 场景 | 观察 | F | E | 结论 |
| --- | --- | ---: | ---: | --- |
| 简单提示 | 沿显式错误注释给出邻接表和先后关系的小步提示；无完整代码 | 2 | 3 | 回应质量通过，独立诊断未验证 |
| 再具体点 | 明确 `z == 2` 加反向边并维护最低买入价传播；无完整实现 | 2 | 2 | 有增量脚手架，但受 cue 污染且重复证据污染画像 |
| 继续追问 | 用单向道路反例解释全局最小/最大为何不合法，给出三城市自检；无完整代码 | 2 | 4 | 通过 |
| 学习画像 | revision、状态、分数、规则和最近证据均可查看 | 2 | 3 | 可审计，但证据展示偏长，隐私/可读性需收敛 |
| 侧栏补全预览 | 返回模型、语言、renderer 与规则命中；但在道路读取循环 `input()` 处开始扫描价格，与 suffix 已有逻辑重复 | 2 | 0 | 功能可用，局部续写错误 |
| 自动 Ghost Text | 输入 `x, y, z =` 后约 7 秒自动显示灰色 `map(int, input().split())`；未按 Tab 接受 | 2 | 4 | 自动触发、局部正确 |
| 完成复盘 / 我卡住了 / 推荐下一题 | 未执行实时写入验收 | — | — | 避免在已存在硬门反例的情况下制造无效状态 |

首轮已执行的 6 个场景得分为 `F=12/12`、`E=16/24`（不等于完整 `F/18、E/36` 评分）。

### 关键实测摘录

- **无诱导注释纠偏复测（独立 replicate，不计入首轮分母）**：删除错误注释并换中性文件名后单次点击“给一个提示”，模型独立指出全局最小/最大会跨不可达城市交易，并引导用邻接表与沿边传播最低买入价（`F=2/2、E=4/4`）。画像从 `revision 1 / evidence 1 / score 0.93 / candidate` 升至 `revision 2 / evidence 2 / score 1.91 / candidate`，符合单次提示不立即晋级预期。单题单次采样不代表稳定性或跨题泛化。
- **连续提示导致画像过早晋级**：同题旧基线证据（`revision 1 / evidence 1 / score 0.93`）+ 本轮同一代码快照的两次连续提示（简单提示 -> `evidence 2 / 1.92`，再具体点 -> `evidence 3 / 3.09`）直接将技能推升为 `active`，不能代表三次独立表现。
- **继续追问隔离正确**：追问前后 `studentProfile.json` 与 `studentSkill.json` 的 SHA-256 不变，`attemptEvents.jsonl` 与 `attemptSessions.jsonl` 更新，符合“对话写会话、不晋级画像”预期。
- **自动 Ghost Text vs 侧栏补全预览**：真实编辑器在 `x, y, z =` 后自动给出局部正确的一行续写，且 4 个学习/会话文件 SHA-256 不变；侧栏“测试补全接口”在撤销编辑后于第 10 行 `input()` 处执行，触发快照不同，但返回了与 suffix 重复的价格扫描代码。两者底层均走 `buildAutocompleteInputFromText` + `requestMimoAutocompleteDetailed`，差异在于 preview 展示 raw suggestion 而 inline 经过展示处理。
- **UI 同步缺陷**：侧栏顶部“当前文件”在切换编辑器后偶发停留于旧文件显示，尽管模型调用实际读取了活动 Python 文本。

## 确定性评测

| 套件 | 命令 | 结果 |
| --- | --- | --- |
| 核心教学/画像/推荐测试 | `npx vitest run test/studentSkill.test.ts test/studentSkillStore.test.ts test/teachingCycle.test.ts test/recommendationEngine.test.ts test/transferValidation.test.ts test/selfEvolutionTrial.test.ts test/selfEvolutionEval.test.ts test/longitudinalSelfEvolution.test.ts test/journeyTrial.test.ts test/skillProgressionSimulation.test.ts` | 10 files / 39 tests passed |
| 1000 步纵向 fixture | `npm run trial:longitudinal-self-evolution -- --provider fixture --limit 1000 --no-write` | 1000 samples，pain-point / primary / skill-candidate 均 1.0，0 error，0 mismatch，revision 1000，0 token |
| 5 样本自进化 fixture | `npm run trial:self-evolution-eval -- --provider fixture --no-write` | 痛点、主痛点、推荐、skill candidate、perfect step 均 1.0，bias record 0 |

这些确定性测试只证明 fixture 与状态机自洽，不能等同于“真实教育效果 100%”。

## 已复现的 7 项教育硬门缺口

临时反例脚本已复现以下跨模块缺陷（尚未转入仓库回归测试，修复优先级高于单次 prompt 调优）：

1. **重复证据可错误晋级**（`src/teaching/studentSkill.ts`）：同一 patch 重放三次得到 `active`、`evidenceCount=3`，但唯一 example 仅 1 个。
2. **禁用技能仍可授权升难度**（`src/recommendation/transfer.ts`）：输入 disabled skill 及其遗留迁移记录，仍进入 transfer-ready 并推荐难度 4，实际状态 `failed` 而文案写“允许上探”。
3. **无关技能迁移抬高全局难度**（`src/recommendation/rules.ts`）：目标为循环技能、仅树技能带迁移证据时，循环题目标难度仍被抬高。
4. **纠错未完整传播到旧画像**：用户 correction 压住 `StudentSkill`，但 legacy `StudentProfile` 旧痛点计数保留，合并时取较大计数仍影响推荐排序。
5. **“不提供完整答案”仅靠 prompt**：将完整 Python 解答放入 `hint`/`specificHint` 时，`teachingReport` parser 仍接受，缺少输出侧语义门。
6. **`AttemptSession` 重放不幂等**：相同事件写两次导致 ledger 2 条、session `eventIds` 1 条、coach thread 2 轮。
7. **回滚可静默复活禁用技能**：当前为 `disabled`、旧版本为 `active` 时执行回滚，结果直接变为 `active`，绕过显式重新启用。

## 评测限制

- Live 采样仅覆盖单题、单路由、单次动作，未采集 live token usage、parser retry 或 provider error 计数，也未保存可公开复核的原始 live artifact。
- 教育分为单评审启发式打分；`F >= 16/18`、`E >= 27/36` 仅为内部工程放行线，非教育实验验证阈值。
- 未执行完成复盘、放弃、推荐的真实 UI 写入验收，也未测试 Ghost Text 的 `Tab` 接受或部分接受。

## 下一轮修复与试点门槛

在开展人类教育试点前，先修复上述 7 项硬门并补充 Vitest 回归测试：

1. 为证据建立稳定 identity（按 problem/code/diagnosis 或显式事件 ID 幂等去重）；
2. 推荐按目标 skill 检查迁移证据并严格排除 disabled；
3. correction 同步约束 legacy profile，或让推荐只消费统一后的 `StudentSkill`；
4. 回滚不得静默改变 `disabled` 状态；
5. 为 coach parser 增加完整答案/长度的输出侧门禁，为 autocomplete 增加与 cursor/suffix 的局部连续性及重复代码检查；
6. 让侧栏预览显式捕获并展示与 inline 一致的 cursor/prefix/suffix 及 presentation 文本；
7. 修复活动文件卡片同步。

修复后的形成性试点建议：3–5 名学生 × 每人 ≥10 会话，采用“有助手/无助手”平衡交叉设计 + 延迟迁移题，记录首次正确时间、提示升级次数、Ghost Text 接受后修改率、重复误区率、无提示迁移率，并将“代码 AC”与“独立解释原理”分开计分。完整放行门槛：9 场景 `F >= 16/18`、`E >= 27/36` 且全部硬门 100% 通过。
