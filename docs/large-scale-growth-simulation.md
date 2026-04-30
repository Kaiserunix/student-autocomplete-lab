# 大规模成长模拟测试方案

Date: 2026-05-01

Status: beta v2 必做项。任何全量 live 模型测试前，先按本文做成本估计和 dry run。

## 1. 目标

要测试的不是“模型会不会改错代码”，而是插件能不能长期模拟一个正常学生的成长：

- 错误是否被稳定归因到真实痛点；
- 提示是否只解决当前一步，而不是直接给答案；
- Student Skill 是否会从零散事件进化成可复用教学技能；
- 技能 ready 后，未见过的同类题是否更少提示、更准诊断；
- 推荐题是否能从低门槛练习逐步提升到算法模型，而不是原地踏步；
- 成本是否可控，是否能先用本地预设数据把链路跑通。

用户明确要求：要做大规模测试，写大量“系列预设代码”。目标规模暂定：

- 200 道题；
- 每题 5 份代码；
- 合计 1000 份代码样本；
- 覆盖从小白到较强选手的成长轨迹。

## 2. 先成本估计，再花钱

### 已有实测 token 基线

来自 `docs/internal-testing.md`：

| Run | Calls | Prompt tokens | Completion tokens | Total tokens |
| --- | ---: | ---: | ---: | ---: |
| MiMo usage smoke | 22 | 25,120 | 5,301 | 30,421 |
| MiMo transfer smoke | 92 | 134,995 | 27,649 | 162,644 |

折算后，每次诊断大约是：

- prompt：1.1k 到 1.5k tokens；
- completion：0.25k 到 0.35k tokens；
- total：1.4k 到 1.8k tokens。

真实 200 题会包含更长题面、Teacher Pack、更多历史 Student Skill，因此全量估算要更保守。

### 计划 token 预算

| Phase | Calls | Input / call | Output / call | Estimated input | Estimated output |
| --- | ---: | ---: | ---: | ---: | ---: |
| Teacher Pack generation | 200 | 2.5k | 0.9k | 0.50M | 0.18M |
| Diagnosis on wrong code | 1000 | 2.4k | 0.45k | 2.40M | 0.45M |
| AC score / optimization review | 200 | 2.5k | 0.7k | 0.50M | 0.14M |
| Transfer validation | 200 | 2.5k | 0.45k | 0.50M | 0.09M |
| Total | 1600 | - | - | 3.90M | 0.86M |

保守上浮 30% 后：

- input：约 5.1M；
- output：约 1.1M；
- total：约 6.2M。

### 公开价格口径

价格会变，执行前必须重新查。

DeepSeek 官方价格页在 2026-05-01 显示：

- `deepseek-v4-flash`：cache miss input $0.14 / 1M，output $0.28 / 1M；
- `deepseek-v4-pro`：折扣期 input $0.435 / 1M，output $0.87 / 1M；原价 input $1.74 / 1M，output $3.48 / 1M；
- 官方说明 Pro 75% 折扣延长到 2026-05-31 15:59 UTC。

OpenAI 官方价格页在 2026-05-01 显示：

- `gpt-5.4-nano`：standard input $0.20 / 1M，cached input $0.02 / 1M，output $1.25 / 1M；
- `gpt-5.4-mini`：standard input $0.75 / 1M，cached input $0.075 / 1M，output $4.50 / 1M；
- `gpt-5.5`：standard short-context input $5.00 / 1M，cached input $0.50 / 1M，output $30.00 / 1M。

MiMo 官网静态页面能确认 Token Plan、月/年订阅和 V2.5 模型覆盖，但静态抓取页面没有暴露可直接引用的每 1M token 单价。因此 MiMo 成本必须以 provider 返回的 `usage` 和用户账户实际扣费为准；项目里不能硬编码 MiMo 单价。

### 估算美元成本

按保守上浮后的 5.1M input + 1.1M output：

| Model route | Estimated cost |
| --- | ---: |
| DeepSeek V4 Flash, cache miss | about $1.02 |
| DeepSeek V4 Pro, discount price | about $3.18 |
| DeepSeek V4 Pro, list price | about $12.70 |
| OpenAI gpt-5.4-nano, standard | about $2.40 |
| OpenAI gpt-5.4-mini, standard | about $8.78 |
| OpenAI gpt-5.5, standard short context | about $58.50 |

结论：

- 第一轮不要直接全量 live。
- 先生成 1000 份本地 fixture，跑零成本结构验证。
- 再抽样 100 到 200 calls 做校准。
- 校准通过后，再跑 1600 calls 全量 live。
- 如果用 DeepSeek Flash/Pro 或 MiMo quota，全量测试成本可接受；如果用 GPT-5.5 级别模型，全量测试没有必要。

## 3. 数据集结构

每道题保存一个 case pack：

```json
{
  "problemId": "P1427",
  "platform": "luogu",
  "topic": ["array", "sentinel", "output_order"],
  "difficultyStage": "beginner",
  "teacherPackRef": "cache-key",
  "referenceComplexity": "O(n)",
  "samples": [],
  "wrongSubmissions": [
    {
      "submissionId": "P1427-novice-001",
      "learnerStage": "novice",
      "code": "...",
      "expectedOjStatus": "WA",
      "expectedPainPoints": ["sentinel_input", "output_order"],
      "expectedPrimaryPainPoint": "sentinel_input",
      "expectedSkillCandidate": "sentinel-input-output-order",
      "minimumUsefulHint": "先确认 0 是否应该被输出。",
      "localCounterexample": {
        "input": "1 2 0",
        "expected": "2 1",
        "actual": "0 2 1"
      }
    }
  ]
}
```

每份代码必须有：

- 明确题目绑定；
- 明确学生阶段；
- 明确 OJ-like 结果；
- 明确主痛点和可接受副痛点；
- 一个最小反例或解释；
- 期望 skill candidate；
- 是否允许暴力 AC；
- 推荐下一题的合理范围。

## 4. 200 题覆盖计划

题目不要求一次全部手写标准解。优先用题目元数据 + Teacher Pack + 预设错误模板生成样本。

| Stage | Problems | Code samples | Main focus |
| --- | ---: | ---: | --- |
| S1 输入输出/表达式 | 25 | 125 | input parsing, numeric type, output format |
| S2 分支/循环/数组 | 30 | 150 | branch coverage, loop boundary, indexing |
| S3 字符串/模拟/矩阵 | 25 | 125 | state simulation, grid boundary, formatting |
| S4 枚举/复杂度升级 | 25 | 125 | brute force, pruning, prefix/sort/hash |
| S5 递归/搜索 | 25 | 125 | base case, visited state, pruning |
| S6 二叉树/树 | 25 | 125 | traversal, depth, subtree boundary, tree distance |
| S7 图/并查集/堆/集合 | 25 | 125 | graph adjacency, DSU semantics, multiset |
| S8 贪心/DP/二分 | 20 | 100 | proof, invariant, state transition |

Total: 200 problems, 1000 code samples.

## 5. 正常人成长模拟

不要把 1000 份代码当作独立 bug 样本。要把它们串成一个学生成长轨迹。

### Learner stages

| Stage | Behavior |
| --- | --- |
| novice | 不稳定读入、输出格式、循环边界，常 RE/WA |
| beginner | 会写模板，但边界和数组下标仍频繁错 |
| apprentice | 能暴力 AC 小题，但不主动抽象复杂度 |
| algorithmic | 开始使用递归、搜索、树、图，但模型不稳 |
| advanced | 能 AC 多数题，主要问题转向复杂度、证明、代码质量 |

### Expected growth signals

每一轮应出现：

- 同一痛点重复 3 次左右才 promotion；
- ready skill 进入后，同类未见题的 hint depth 下降；
- 同一基础错误不应无限重复；
- 暴力 AC 后仍要识别学习分不足；
- 推荐题先窄化，再加难，而不是直接跳高；
- user correction 能压制错误 skill。

## 6. 评分规则

总分 100。

| Dimension | Weight | What it measures |
| --- | ---: | --- |
| Diagnosis accuracy | 25 | 痛点、主痛点、证据是否命中 |
| Teaching quality | 15 | 是否只给下一步，不直接泄题 |
| Skill evolution | 20 | candidate/active/disabled 是否合理，是否能 rollback |
| Transfer growth | 15 | ready skill 对未见同类题是否有效 |
| Recommendation | 10 | 是否按痛点、主题、难度推荐 |
| Scoring/optimization | 10 | AC 后是否区分正确性和学习价值 |
| Cost/robustness | 5 | parser 稳定、token 可控、失败可恢复 |

### Pass levels

| Level | Score | Meaning |
| --- | ---: | --- |
| Blocked | < 70 | 不适合 beta |
| Alpha strong | 70-79 | 个人可用，但不宜宣传成长能力 |
| Beta candidate | 80-89 | 可发布 beta，需标注限制 |
| Beta strong | >= 90 | 可以作为核心卖点展示 |

### Hard gates

无论总分多高，以下任一失败都不能过 beta：

- autocomplete 泄露题面或 Teacher Pack；
- parser 在 1000 fixture dry run 中崩溃；
- user-disabled skill 被模型重新激活；
- 不能记录 token usage；
- 推荐系统长期只推荐同难度/同形状题；
- 学习评分把“暴力 AC 但无算法提升”判成满分。

## 7. 执行顺序

### Phase 0: 生成 fixture，不花钱

目标：

- 建 `fixtures/growth-sim/`；
- 生成 200 个 problem packs；
- 每题 5 个 wrong/partial/accepted submissions；
- 本地测试 parser、schema、score aggregation；
- 不调用模型。

通过标准：

- 1000 samples 全部可解析；
- problemId/topic/painPoint/skillCandidate 不缺；
- 不同阶段分布合理；
- sample 不污染题目绑定。

### Phase 1: Stub teacher 跑通

目标：

- 用 deterministic stub 模拟 AI 输出；
- 测 Student Skill 是否按时间线成长；
- 测 recommendation ladder 是否变化；
- 测 rollback/disable/correction。

通过标准：

- 总分计算稳定；
- ready skill 数量有增长但不爆炸；
- 同类 transfer probe 能被触发；
- 至少 5 个 correction case 能改变后续行为。

### Phase 2: 100 到 200 call live calibration

目标：

- 随机抽样每个 stage；
- 用 MiMo 或 DeepSeek V4 Flash/Pro 跑真实模型；
- 对比 fixture expected labels；
- 更新 prompt/parser，不改 expected answer 迁就模型。

预算：

- 约 0.2M 到 0.8M tokens；
- DeepSeek Flash 约 $0.05 到 $0.20；
- DeepSeek Pro 折扣期约 $0.20 到 $0.80；
- MiMo 以实际 token plan 扣费为准。

通过标准：

- pain-point accuracy >= 0.90；
- primary pain-point accuracy >= 0.85；
- skill-candidate accuracy >= 0.85；
- parser crash = 0；
- token usage 写入结果文件。

### Phase 3: Full live run

目标：

- 跑 1600 calls 左右；
- 输出完整 growth report；
- 生成 public-safe summary；
- 原始 JSON 留在 `.runtime/`，不进 git。

预算：

- 保守约 6.2M tokens；
- DeepSeek Flash 约 $1；
- DeepSeek Pro 折扣期约 $3；
- OpenAI gpt-5.4-nano 约 $2.4；
- MiMo 以实际扣费为准。

通过标准：

- 总分 >= 80；
- hard gates 全过；
- 迁移指标 >= 0.80；
- 推荐题难度曲线能解释；
- 有一份可发布的 sanitized report。

## 8. 一劳永逸的实现形态

需要做三个工具，而不是一次性脚本：

1. `growth-fixture-generator`
   - 输入题单/标签/阶段；
   - 输出 200 problem packs；
   - 支持固定 seed。

2. `growth-sim-runner`
   - 支持 provider：fixture、stub、mimo、deepseek、openai-compatible；
   - 支持 resume；
   - 支持 `--max-calls`、`--max-usd`、`--dry-run-cost`；
   - 每一步记录 usage、score、Student Skill diff。

3. `growth-report`
   - 汇总 score；
   - 输出痛点准确率、迁移、推荐、成本；
   - 生成 sanitized markdown；
   - 原始 runtime 不提交。

## 9. 下一步实现建议

先做 Phase 0 + Phase 1：

- 不花钱；
- 能快速暴露 schema 和评分设计问题；
- 能证明 1000 份代码样本的结构跑得动；
- 再决定是否 live 全量。

第一批实现切片：

1. 增加 `fixtures/growth-sim/seed-topics.json`。
2. 增加 `src/growthSimulation/fixtureGenerator.ts`。
3. 增加 `src/growthSimulation/scoring.ts`。
4. 增加 CLI：`npm run trial:growth-sim -- --provider fixture --samples 1000`。
5. 增加测试：1000 sample 生成、分布、score aggregation、Student Skill growth。

