# 教育场景与侧边栏联测报告（2026-07-22）

## 结论

本次在已安装的 `kaiserunix.student-autocomplete-lab-beta-release@0.1.0-beta.1` 中完成了真实 Codex OAuth 联测，并同时运行确定性评测与跨模块教育硬门审计。

当前结论分为两层：

- **交互能力可用**：简单提示、渐进提示、继续追问、学习画像、健康检查和自动 Ghost Text 都能工作；去掉显式错误注释后的单次纠偏复测也能识别道路可达性与交易顺序；真实 Ghost Text 能自动触发，且这次给出了正确、局部的一行续写。
- **教育发布门未通过**：同题同主痛点的旧基线证据，加上本轮同一代码快照的两次连续提示，合计三份后就把技能累计成 `active`；侧边栏“测试补全接口”生成了与 cursor/suffix 局部上下文不匹配的价格扫描片段；推荐、禁用技能、迁移证据、纠错、回滚和事件重放还存在已复现的跨模块缺口。

因此，这个版本适合个人 Beta 内测和继续采样，不应宣称已经证明学习效果，也不应把 Student Skill 或自动推荐当作高可信结论。

## 范围和隔离边界

### 版本与环境

- 分支：`codex/language-skill-composition`
- 已安装并实际打开：`kaiserunix.student-autocomplete-lab-beta-release@0.1.0-beta.1`
- 补全模型：`gpt-5.3-codex-spark`
- 教练/分析模型：`gpt-5.6-terra`
- 协议：`codex-app-server`
- 题目：P1073 `[NOIP 2009 提高组] 最优贸易`
- 首轮合成错误代码：`.runtime/education-eval/p1073-global-greedy.py`
- 无诱导注释纠偏复测：临时 `p1073-attempt.py`，测试后已删除

### 测试代码的错误设计

代码故意忽略道路方向、可达性和买卖顺序，只计算全局最低价与最高价：

```python
cheapest = min(prices)
most_expensive = max(prices)
print(most_expensive - cheapest)
```

但本轮夹具还含有下面这条注释：

```python
# 错误尝试：忽略城市间的可达关系和买卖先后顺序。
```

这条注释把预期主痛点直接告诉了教练模型，也进入 autocomplete 的本地上下文，构成 **cue contamination**。因此，首轮提示可以评估“在显式错误线索下是否仍能给出渐进、克制的教学回应”，不能用来证明模型能从无提示代码中独立诊断该主痛点。后文另用不含这条注释、文件名也不暗示错误策略的临时代码做了一次纠偏复测；复测仍保留产品正常提供的 P1073 题目上下文。

它可以同时测试：

1. 原计划测试教练能否从当前代码独立识别“图模型/顺序约束”，但由于上述注释污染，该目标本轮未得到有效证据；
2. 提示是否逐步加深且不直接给完整答案；
3. 追问是否围绕学生的最新问题；
4. 自动补全是否只续写光标附近代码；
5. Student Skill 是否把重复交互误当作独立学习证据。

### 数据保护

真实侧栏调用前，第一次全量备份因超时而误将 `codex-oauth` 一并复制到被 Git 忽略的临时目录。发现后已删除整个误备份，并验证工作树内 `codex-oauth` 目录数和 `auth.json` 文件数均为 0。正式用于回滚的是随后创建的学习数据专用备份，它只包含：

- `attemptEvents.jsonl`
- `attemptSessions.jsonl`
- `problems.jsonl`
- `studentProfile.json`
- `studentSkill.json`
- `teacherPacks.jsonl`
- `studentSkillVersions/`

首轮联测和无诱导注释纠偏复测分别结束后都恢复上述数据。最终恢复校验结果：6 个顶层文件与 1 个版本文件的 SHA-256 均与相应测试前备份一致，版本文件数量 `1 == 1`，`studentSkill.revision == 1`；扩展真实 global storage 中的 `codex-oauth` 仍存在且未被恢复操作覆盖。校验完成后，两次学习数据专用临时备份均已删除。

## 真实侧边栏联测

评分采用双轨：功能分 `F` 为 0–2，教育分 `E` 为 0–4。对教练回答，教育分 4 表示准确、渐进、贴合当前代码、克制，并给出清晰的下一步或自检；对 autocomplete，教育分 4 表示精确的最小局部续写、语法与意图正确、没有题面或解答泄漏。

| 场景 | 观察 | F | E | 结论 |
| --- | --- | ---: | ---: | --- |
| 简单提示 | 沿显式错误注释给出邻接表和先后关系的小步提示；没有完整代码 | 2 | 3 | 回应质量通过，独立诊断未验证 |
| 再具体点 | 明确 `z == 2` 要加反向边，并引导维护最低买入价向后继传播；没有给完整实现 | 2 | 2 | 有增量脚手架，但受 cue 污染且重复证据污染画像 |
| 继续追问 | 用单向道路反例解释“全局最小/最大不一定构成合法买卖顺序”，给出三城市自检；没有完整代码 | 2 | 4 | 通过 |
| 学习画像 | revision、状态、分数、规则和最近证据均可查看 | 2 | 3 | 可审计，但证据展示很长，隐私/可读性需收敛 |
| 侧栏补全预览 | 能返回并显示模型、语言、renderer 和规则命中信息；但在道路读取循环的 `input()` 处开始扫描价格，并与 suffix 已有价格逻辑重复 | 2 | 0 | 功能可用，局部续写错误 |
| 自动 Ghost Text | 输入 `x, y, z =` 后约 7 秒自动显示灰色 `map(int, input().split())`；未按 Tab 接受 | 2 | 4 | 自动触发、局部正确 |
| 我已完成 | 未点击 | — | — | 本轮不把 UNKNOWN 结果写成 completed |
| 我放弃了 | 未点击 | — | — | 本轮不触发归档/揭题状态 |
| 推荐下一题 | 未点击 | — | — | 已有跨模块硬门反例，先阻断而不是制造更多实时状态 |

已执行的首轮 6 个场景得分为 `F=12/12`、`E=16/24`。这不是完整的 `F/18、E/36` 发布评分，因为完成、放弃和推荐没有做实时写入验收；简单提示与具体提示又受到 cue contamination，结合下述硬门失败，不能换算成整体通过。后续纠偏复测作为独立 replicate 记录，不回填或重算这组首轮分母。

### 简单提示

关键内容：

> 当前结果只比较了全局价格。先把每条道路保存成邻接表，再思考低价能否在到达高价城市之前经过。

判断：在显式注释已经指出问题的前提下，回应只给一个小动作，没有泄露完整算法或代码；不能据此评价独立诊断准确性。

### 无诱导注释纠偏复测（不计入首轮分母）

复测代码保留相同的错误实现，但删除了直接说明“忽略可达关系和买卖顺序”的注释，并使用中性的临时文件名。产品仍像正常教学场景一样提供 P1073 题目上下文。只点击一次“给一个提示”，未点击“再具体”。

关键内容：

> 现在的输出只看prices的全局最小和最大，症状是会把不能按道路先后到达的两座城市也拿来交易。先把每条道路保存成邻接表，再思考“到某城前见过的最低价格”该如何沿边传递。

该回答独立于显式错误注释识别了可达性、先后顺序和沿边传播方向，没有给完整代码，记为 `F=2/2、E=4/4`。画像从 revision 1、evidence 1、score 0.93、candidate 变为 revision 2、evidence 2、score 1.91、candidate，符合“一次提示新增一次证据且不立即晋级”。随后已恢复到 revision 1，并校验 7 个画像/会话/版本文件的 SHA-256 与复测前一致。

这只是一题、一个模型、一次采样；本次观察表明模型没有依赖那条错误注释也能给出正确小步提示，但这不是独立诊断的稳定性或跨题泛化证据。

### 再具体点

关键内容：

> 把读到的 `x, y, z` 加入邻接表，且 `z == 2` 时必须加入反向边。给每个城市维护一个最低买入价：它变得更小时，再传播给后继城市。

判断：比首轮更具体，仍保持脚手架式引导。不过两次提示加上原有证据，已经使同一技能从 candidate 提升为 active：

| 时点 | Revision | Evidence | Score | Status |
| --- | ---: | ---: | ---: | --- |
| 测试前 | 1 | 1 | 0.93 | candidate |
| 简单提示后 | 2 | 2 | 1.92 | candidate |
| 再具体点后 | 3 | 3 | 3.09 | active |

第一份基线证据来自先前同题的 `solve(): pass`，本轮两份来自同一个 global-greedy 代码快照的连续提示。它们同属一题和同一主痛点，不能证明三次独立学习表现，因此该晋级不可信。完全相同 patch 重放三次也会晋级，是后文单独列出的确定性反例，不应与这次真实侧栏路径混为一谈。

### 继续追问

问题：

> 为什么全局最小值和全局最大值不一定合法？请只用一个反例思路解释，不要给完整代码。

回答正确指出：单向路线中高价城市可能先于低价城市，虽然全局价差很大，却不能先低买再高卖。回答还要求画一条三城市单向路线检查出现顺序，没有给完整代码。

追问前后：

- `studentProfile.json` SHA-256 不变；
- `studentSkill.json` SHA-256 不变；
- `attemptEvents.jsonl` 与 `attemptSessions.jsonl` 改变，符合“对话写会话、不晋级画像”的预期。

### 学习画像

画像页能展示：

- revision、candidate/active/disabled 数量；
- skill 状态、分数、证据数、相关规则；
- 最近证据及其来源。

问题有两个：

1. 同题同主痛点的旧基线证据与本轮同一代码快照的连续提示被直接累计，并推动 active；
2. 最近证据包含很长的 prompt/context，虽然便于审计，但增加视觉噪声和本地隐私暴露面。

### 自动补全：不同触发快照下的 Ghost Text 与诊断预览

真实编辑器路径：

1. 选中道路读取循环中的 `input()`；
2. 输入 `x, y, z =`；
3. 不按快捷键，等待自动触发；
4. 约 7 秒后看到灰色 `map(int, input().split())`；
5. 按 Esc 取消，并撤销合成编辑。

这一条续写是当前局部代码的合理下一步，长度为一行，没有解释、题面或完整解法。触发前后四个学习/会话文件的 SHA-256 完全一致，说明仅显示 Ghost Text 不会污染 Student Skill 或 AttemptSession。

侧栏的“测试补全接口”是在代码已经撤销后执行的；当时光标位于第 10 行道路读取循环内被选中的 `input()`，并不是 `x, y, z =` 之后，所以它和真实 Ghost Text 不是同一个精确触发上下文。预览中至少可见三行，以 `cheapest = 10**18`、`best = 0` 和遍历 `prices` 开头。即使不依赖完整题意，这也没有延续当前位置的道路读取，并与 suffix 中已有的 `cheapest = min(prices)` 等价格逻辑重复，属于局部连续性和语义意图失败。当前截图不足以证明完整返回的确切行数，也不足以判定发生了完整答案泄漏。

因此：

- 编辑器真实自动补全：本次通过；
- 侧栏诊断预览：能调用，但本次结果与 cursor/suffix 的局部上下文不匹配；
- 两次请求的触发快照不同，不能据本次结果断言 inline 与 preview 的实现路径不一致。代码审计确认二者都调用 `buildAutocompleteInputFromText` 和 `requestMimoAutocompleteDetailed`；preview 另外显示 raw suggestion，而 inline 还经过展示/插入处理。

另外，侧栏顶部“当前文件”在不同阶段仍显示已经过时的 `.runtime/ui-audit/smoke/smoke.c` 或 `p1073-global-greedy.py`，而真实活动编辑器已经切到另一个 Python 文件。模型调用实际读取了活动 Python 文本（route 显示 `Language: python`），所以这是 UI 同步/展示缺陷，不是本次模型路由失败。

## 确定性评测

### 核心测试

命令：

```powershell
npx vitest run test/studentSkill.test.ts test/studentSkillStore.test.ts test/teachingCycle.test.ts test/recommendationEngine.test.ts test/transferValidation.test.ts test/selfEvolutionTrial.test.ts test/selfEvolutionEval.test.ts test/longitudinalSelfEvolution.test.ts test/journeyTrial.test.ts test/skillProgressionSimulation.test.ts
```

结果：`10 files / 39 tests passed`。

### 1000 步纵向 fixture

命令：

```powershell
npm run trial:longitudinal-self-evolution -- --provider fixture --limit 1000 --no-write
```

结果：

- samples：1000；
- pain-point accuracy：1.0；
- primary pain-point accuracy：1.0；
- skill-candidate accuracy：1.0；
- provider/parser error：0；
- mismatch：0；
- 最终 Student Skill revision：1000；
- 模型用量：0。

### 5 样本自进化 fixture

命令：

```powershell
npm run trial:self-evolution-eval -- --provider fixture --no-write
```

结果：痛点、主痛点、推荐、skill candidate、perfect step 均为 1.0，bias record 为 0。

这些结果只证明 fixture、状态机和期望标签自洽。它们不包含真实学生、真实模型波动、知识保持或迁移学习，因此不能解释为“教育效果 100%”。

## 评测限制

- Live 部分只有一道题、一个模型路由和每个动作的一次采样，不能估计稳定性或跨题泛化；
- 首轮夹具中的显式错误注释污染了教练诊断，因此首轮简单提示/具体提示只评回应质量；纠偏复测去掉了这条注释，但仍只有单题单次采样；
- 教育分由一名评审按启发式 rubric 给出，没有复评、盲评或评审一致性校准；
- `F >= 16/18`、`E >= 27/36` 是内部工程放行线，不是经学习科学实验验证的教育效果阈值；
- 本轮没有保存可公开复核的 live 原始响应 artifact，也没有采集 app-server 的 live token usage、parser retry 或 provider error 计数；保留的证据是 UI 摘录、状态转移和文件哈希观察，不能据此声称 live 成本或鲁棒性已经通过；
- 完成、放弃和推荐没有做真实 UI 写入验收，Ghost Text 也没有测试 Tab 接受或部分接受。

## 已复现的教育硬门缺口

上述选定的 10 个测试文件、39 项测试通过，但以下跨模块反例已经用临时小型脚本触发：

1. **重复证据可错误晋级**：同一 patch 重放三次得到 `active`、`evidenceCount=3`，但唯一 example 只有 1 个。相关逻辑见 `src/teaching/studentSkill.ts`。
2. **禁用技能仍可授权升难度**：输入一个 disabled skill 和它遗留的迁移记录后，该技能仍进入 transfer-ready，并推荐难度 4；实际状态为 failed，文案却写“允许上探”。相关逻辑见 `src/recommendation/transfer.ts`。
3. **无关技能迁移会抬高全局难度**：目标是循环技能、仅树技能带迁移证据时，循环题的目标难度仍被抬高；目标技能本身没有迁移证据。相关逻辑见 `src/recommendation/rules.ts`。
4. **纠错没有完整传播到旧画像**：用户 correction 能压住 Student Skill，但 legacy StudentProfile 的旧 pain-point 计数仍会保留；推荐合并新旧画像时取较大计数，因此错误痛点仍可能影响排序。这里不是说 `profile.skillCandidates.ready` 会被推荐器直接消费。
5. **“不提供完整答案”只存在于 prompt**：把完整 Python 解答放进 `hint`/`specificHint` 后，teaching report parser 仍接受，没有输出侧语义拦截。
6. **AttemptSession 重放不幂等**：相同事件写两次时，ledger 有 2 条、session eventIds 有 1 条、coach thread 有 2 轮。
7. **回滚可静默复活禁用技能**：以 disabled 为当前状态、active 为旧版本执行回滚后，结果直接变为 active，绕过显式重新启用。

这些反例的最小输入和实际观察已在上面概述，但临时脚本及 stdout 没有作为原始 artifact 保留，也尚未转成提交到仓库的回归测试。因此本报告只能证明本次会话中已复现，不能替代可重复执行的回归证据。它们仍比模型单次回答质量更重要，因为一旦成立，会让长期画像和推荐逐渐偏离学生真实能力。

## 教育评估判断

### 已证明

- Codex OAuth 的教练与补全路径在当前安装中均能返回；
- 在显式错误注释提示下，简单提示、具体提示和追问能围绕同一错误逐步加深；
- 在保留正常题目上下文、去掉显式错误注释后的单次复测中，简单提示能识别道路可达性与交易顺序；
- 本次真实提示没有泄露完整代码；
- 自动 Ghost Text 能无需快捷键触发；
- 本次真实 Ghost Text 是局部且正确的一行；
- 追问不会晋级 Student Skill；
- 本次 Ghost Text 和补全健康检查未写入学习画像/会话；
- 学习画像有可追溯的 revision、状态和证据视图。

### 未证明

- 学生是否更快独立做对题；
- 一周后是否仍记得图上的顺序约束；
- 能否迁移到另一道同族、但表面不同的题；
- 自动补全被接受后，学生是理解了还是只复制；
- 完成、放弃、推荐三条实时路径的完整 UI 状态转移；
- Ghost Text 的 Tab 接受与部分接受行为；
- 多语言与不同水平学生下的教学一致性。
- 去掉错误注释后，教练独立识别主痛点的多次稳定性、跨题泛化和不同模型一致性。

## 下一轮建议

在继续做人类教育实验前，先修复以下阻断项：

1. 给证据建立稳定 identity，按 problem/code/diagnosis 或显式事件 ID 幂等去重；
2. 推荐必须按目标 skill 检查迁移证据，并排除 disabled；
3. correction 同时约束 legacy profile，或让推荐只消费统一后的 Student Skill；
4. 回滚不得静默改变 disabled 状态；
5. 为 coach parser 增加完整答案与长度的输出侧语义门；autocomplete 保留现有最大行数、解释文本和上下文标记门，再新增与 cursor/suffix 的局部连续性、重复代码及明显语义漂移检查；
6. 让侧栏预览明确捕获 cursor/prefix/suffix 快照，并展示经过 inline presentation 后实际会插入的文本；用同一快照对比两条展示路径；
7. 修复活动文件卡片的同步。

修复后建议先做一个小型、可解释的形成性可用性/方法试点；它用于发现交互问题，不足以证明教育效果：

- 3–5 名学生，每人至少 10 个会话；
- 同一学生采用“有助手/无助手”交叉设计，题族和难度要匹配，并对条件顺序做平衡，避免仅比较不同学生或把练习顺序当成产品效果；
- 主任务后增加延迟迁移题；
- 记录首次正确尝试时间、提示升级次数、Ghost Text 接受后修改率、重复误区率、无提示迁移成功率；
- 把“答案正确”与“独立解释为什么正确”分开计分。

建议的教育 Beta 门槛仍为完整 9 场景 `F >= 16/18`、`E >= 27/36`，并且上述硬门全部通过。任何硬门失败都不能用总分抵消。

## 本次清理与工作树边界

- 合成 Python 文件位于被忽略的 `.runtime/education-eval/`；
- 联测产生的学习画像、会话与版本历史已恢复到测试前 SHA-256；
- 初次全量备份曾误把 OAuth 状态复制到被忽略目录；该误备份已整体删除，并验证工作树内不存在 `codex-oauth` 或 `auth.json`；
- 用于两轮恢复的学习数据专用临时备份在哈希校验完成后均已删除；
- 扩展真实 global storage 中的 OAuth 数据未被恢复操作覆盖；
- 用户原有的未跟踪 `test.c` 未修改、未暂存。
