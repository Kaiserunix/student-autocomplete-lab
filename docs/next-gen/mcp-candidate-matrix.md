# MCP 与 OJ 组件候选评分矩阵

调查时点：2026-07-10。评分用于决定 PoC 顺序，不代表法律认可或长期承诺。社区仓库即使得分较高，也必须固定 commit/version、复核许可证、运行契约测试和威胁模型。

## 1. 评分方法

每项 0–5 分，`加权分 = Σ(单项分 × 权重) / 5`，满分 100。

| 维度 | 权重 | 5 分条件 |
| --- | ---: | --- |
| 许可证 | 8 | 明确、兼容、覆盖代码与发行物 |
| 维护活跃度 | 8 | 近期发布/提交、issue 有响应、无明显弃置 |
| 官方性/Registry | 8 | 官方 API/官方 Registry，且身份可核验 |
| 目标站点覆盖 | 8 | 覆盖所需站点/区域和核心读能力 |
| 认证隔离 | 10 | 凭据不进参数/日志；支持本地隔离或标准 OAuth |
| 结构化契约 | 10 | output schema、稳定 JSON、来源与版本完整 |
| 测试与可复现性 | 8 | unit/fixture/integration/conformance 可固定运行 |
| 限流与错误模型 | 8 | 明确 rate limit、challenge、schema drift、retry 分类 |
| 运行/提交能力 | 8 | 能力真实、分级、可预览、可确认、可查询不确定结果 |
| 凭据与执行风险 | 10 | 最小权限、SecretStorage/本地 env、沙箱或明确拒绝 |
| 可固定版本 | 6 | 有 release/lock/hash，可离线复现 |
| 可替换性 | 8 | 薄适配、无产品状态侵入、领域契约独立 |

硬否决优先于总分：无许可证、明文凭据、无法阻止真实提交、无沙箱却运行不可信代码、违反平台已知限制，均不得直接进入生产。

权重合计 100。原始分是调查时点的工程审计判断，不是社区项目质量排名；`0` 表示缺失或无法验证，低分项必须由 PoC 重新取证。

## 2. 候选总表

| 候选 | 分数/100 | 裁决 | 首批用途 | 生产边界 |
| --- | ---: | --- | --- | --- |
| 现有外部 `Kaiserunix/luogu-mcp-server` v0.2.1 | 64.4 | **采用并加固** | 洛谷公开搜索、取题、题单、topic、profile | 成为洛谷唯一权威；先不加真实提交 |
| 扩展内置 `student-problem-search` MCP | 43.6 | **迁移后删除** | 一个发布周期只读回滚 | 不再新增平台逻辑 |
| `jinzcdev/leetcode-mcp-server` | 69.6 | **固定 fork 后封装** | LeetCode global/CN 读、auth mock、run/submit PoC | 本地 stdio；Broker 必须拦截 direct submit |
| `SPerekrestova/interactive-leetcode-mcp` | 65.2 | **拒绝整包，借鉴测试/错误模型** | 参考 strict gate、快照、学习流程 | 不接受明文 credential file 与产品职责侵入 |
| Codeforces 官方 API | 81.6 | **直接采用** | problems/contest/user/submission status 元数据 | 无题面、样例或提交能力，不得伪装 |
| Competitive Companion | 71.6 | **封装为用户触发导入器** | 五平台题面与样例导入 | 单次 localhost ingress + nonce；不负责搜索/提交 |
| `online-judge-tools/oj` | 69.6 | **作为本地执行器封装** | AtCoder 等下载、登录、本地测试；有限提交实验 | 不暴露 shell/`--yes`；平台 policy 可禁用提交 |
| pipeworx Codeforces/LeetCode remote MCP | 48.4 | **首批拒绝** | 只做契约对照 | 第三方远端、隐私/认证/可替换性不足 |
| `Infinityay/nowcoder-mcp` | 35.2 | **拒绝题库用途** | 无 | 主要是内容/面经搜索，不是 OJ problem workflow |
| 其他微型 Nowcoder MCP | 25.2 | **拒绝** | 无 | 活跃度、许可证、契约和测试不足 |
| `moritanian/atcoder_mcp` | 27.6 | **拒绝整包** | 可读代码作调研 | 体量小、许可证/维护/契约不足 |
| `atcoder-cli` | 61.6 | **可选薄 CLI 适配** | AtCoder contest workspace 辅助 | 仍依赖 `online-judge-tools`，不成为统一领域层 |

### 2.1 原始分复算表

缩写：`LIC` 许可证、`ACT` 活跃度、`OFF` 官方性/Registry、`COV` 覆盖、`AUTH` 认证隔离、`STR` 结构化契约、`TEST` 测试、`ERR` 限流/错误、`OPS` 运行/提交、`RISK` 凭据/执行风险、`PIN` 固定版本、`REPL` 可替换性。

| 候选 | LIC 8 | ACT 8 | OFF 8 | COV 8 | AUTH 10 | STR 10 | TEST 8 | ERR 8 | OPS 8 | RISK 10 | PIN 6 | REPL 8 | 加权分 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Luogu external | 5 | 4 | 1 | 4 | 3 | 3 | 4 | 3 | 1 | 3 | 4 | 4 | 64.4 |
| Internal MCP | 5 | 4 | 0 | 2 | 1 | 1 | 3 | 1 | 1 | 3 | 4 | 2 | 43.6 |
| `jinzcdev` | 5 | 3 | 1 | 5 | 3 | 3 | 3 | 4 | 5 | 3 | 3 | 4 | 69.6 |
| `interactive-leetcode` | 5 | 4 | 4 | 4 | 1 | 4 | 5 | 4 | 4 | 1 | 3 | 1 | 65.2 |
| Codeforces official API | 3 | 5 | 5 | 3 | 5 | 5 | 4 | 4 | 1 | 5 | 3 | 5 | 81.6 |
| Competitive Companion | 5 | 5 | 1 | 5 | 5 | 3 | 4 | 2 | 1 | 3 | 4 | 5 | 71.6 |
| `online-judge-tools` | 5 | 4 | 2 | 4 | 2 | 2 | 5 | 4 | 5 | 2 | 4 | 4 | 69.6 |
| pipeworx remote | 3 | 3 | 1 | 4 | 1 | 3 | 2 | 2 | 3 | 1 | 4 | 3 | 48.4 |
| `Infinityay/nowcoder-mcp` | 3 | 3 | 1 | 1 | 2 | 2 | 1 | 1 | 0 | 2 | 2 | 3 | 35.2 |
| Other Nowcoder | 2 | 1 | 0 | 1 | 2 | 1 | 1 | 1 | 0 | 2 | 2 | 2 | 25.2 |
| `moritanian/atcoder_mcp` | 2 | 2 | 0 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 3 | 27.6 |
| `atcoder-cli` | 5 | 3 | 1 | 4 | 2 | 2 | 4 | 3 | 4 | 2 | 4 | 4 | 61.6 |

复算公式示例：Luogu external 为 `(5×8 + 4×8 + ... + 4×8) / 5 = 64.4`。硬否决仍优先于总分，因此 Registry 分高但凭据/职责边界不合格的整包仍可被拒绝。

## 3. 平台裁决

### 3.1 洛谷

采用用户已有的独立 Server 作为唯一平台权威。当前部署 Worker 已实测 health、MCP initialize 和 11 个 tools；本地 build、33 个测试和 worker smoke 通过。live upstream 因连接洛谷超时失败，说明必须将“Server 活着”和“平台可用”分开。

加固前不得切主流量：

- 为所有工具增加 `outputSchema`、`structuredContent` 和统一 `OjError`；
- 把产品痛点排序从 Server 移回扩展；Server 只做 canonical topic/标签/检索映射；
- 增加 rate limit、cache provenance、challenge/schema drift 检测；
- 发布 `server.json`、精确版本和 artifact hash；
- 评估 [官方 MCP Registry](https://registry.modelcontextprotocol.io/) 登记；Registry 只用于发现，不替代信任审计；
- 调研获得权限后迁移到[洛谷开放平台](https://www.luogu.com.cn/article/q54gjclm)，网页适配只作为降级路径。

### 3.2 LeetCode

首选对 `jinzcdev/leetcode-mcp-server` 做固定 commit fork，因为它同时覆盖 global/CN、搜索/取题、用户、run/submit，并有更接近平台适配器的职责边界。[仓库](https://github.com/jinzcdev/leetcode-mcp-server)

不得直接生产使用的原因：

- `submit_solution` 可直接产生外部写入；
- 上游风险 annotation、确认 proof、outcome unknown 与幂等语义不足；
- session/cookie 处理需要改成 SecretStorage -> 本地 stdio env；
- 必须验证 LeetCode 条款及个人本地实验边界。[LeetCode Terms](https://leetcode.com/terms/)

`interactive-leetcode-mcp` 已进入官方 Registry，工程和学习流程较完整，但它把学习会话、workspace、凭据和 runner 纳入同一 Server，侵入本产品职责；已审阅版本还存在本地明文 credential file 和 Windows sandbox 不足。结论是借鉴其错误码、源码快照 gate 和生命周期测试，不采用整包。[仓库](https://github.com/SPerekrestova/interactive-leetcode-mcp)

### 3.3 Codeforces

公开元数据以 [Codeforces 官方 API](https://codeforces.com/apiHelp) 为准。它提供 problemset、contest、user、submission status 等结构化数据，并要求控制请求频率；它**不提供题面/样例和提交 API**。

组合方式：

- 官方 API：元数据、比赛、用户、提交状态；
- Competitive Companion：用户在浏览器显式点击后导入题面/样例；
- 本地 runner：编译/样例；
- 提交：首批 `manual`，只打开官方页面或记录用户回填，不声称官方 API 可提交。

### 3.4 AtCoder

成熟 MCP 不足。首批使用 Competitive Companion 导入，`online-judge-tools` 负责本地 download/test/login 试验。AtCoder 官方已说明 CAPTCHA 会影响且不支持非官方提交工具，因此真实提交能力默认 `disabled_by_policy`，除非后续重新审计。[AtCoder notice](https://atcoder.jp/posts/1457?lang=en)

### 3.5 牛客

现成 Nowcoder MCP 多用于帖子、面经或内容搜索，不满足 OJ problem/run/submit 契约。牛客公开 API 文档主要面向企业招聘，不是练习 OJ API。[牛客 API 文档](https://docs.nowcoder.com/)

首批能力：

- Competitive Companion 用户触发导入；
- 本地样例运行；
- 官方页面跳转与手工 verdict；
- 最薄本地 MCP 外壳只暴露统一契约，不复制产品策略；
- 搜索/登录/提交均保持 `unsupported`，直到有可审计来源。

## 4. 复用组件边界

### Competitive Companion

[Competitive Companion](https://github.com/jmerle/competitive-companion) 支持本轮五个平台，适合作为浏览器到本地的题面/样例导入协议。它不是长期题库 API。

必须增加：

- 用户显式开启 60 秒单次接收窗口；
- 随机 nonce，导入后立即失效；
- 只绑定 loopback，验证 content type、body size、schema 和 source URL；
- 预览平台、题号、标题、样例数后确认保存；
- 拒绝来自非目标站点和重复 replay 的 POST；
- 不接收凭据、代码、画像或 Teacher Pack。

### online-judge-tools

[online-judge-tools](https://github.com/online-judge-tools/oj) 作为本地执行器，不作为领域 API：

- Server 传入结构化 `OjProblemRef` / `OjCodeArtifact`，不接受 Webview shell string；
- 禁止外层直接传 `--yes`；
- stdout/stderr 限长，cwd/env 白名单，超时可取消；
- 每个平台 capability 单独探测；
- login/challenge 不进入模型工具参数；
- 提交工具在 policy 未通过时完全不注册。

## 5. 统一 PoC 进入门

候选只有同时满足以下条件才能从 `investigating` 进入 `approved`：

1. 许可证与固定版本记录在 SBOM。
2. 无凭据 fixture 下 `initialize/tools/list` 可复现。
3. 每个 output 通过本地 `oj-contract/v1` schema。
4. 公开读、私有读、本地执行、外部写风险等级准确。
5. 断网、超时、429、403、登录 HTML、CAPTCHA、schema drift 有 fixture。
6. write 工具不能由模型或普通 UI 命令直接 commit。
7. 真实提交测试默认不存在；只有单独人工 ceremony 才可运行。
8. 安装不使用 `@latest`，不全局污染 PATH，不读取无关 home 目录。
9. 每个 Server 使用独立凭据、缓存、日志和 intent namespace。
10. 卸载/回滚不影响其他平台和现有本地学习数据。
11. provider 有可验证 artifact manifest，空 PATH/空 cache 可安装、启动、卸载和回退；Agent-facing entrypoint 的实际 tools/list 不含 R2-R4。

## 6. 五平台能力目标

| 能力 | 洛谷 | LeetCode | 牛客 | Codeforces | AtCoder |
| --- | --- | --- | --- | --- | --- |
| capabilities/health | 首批 | 首批 | 首批 | 首批 | 首批 |
| search | 首批 | 首批 | 后续/unsupported | 首批元数据 | 后续/limited |
| import detail | 首批 MCP | 首批 MCP | Companion | Companion + API | Companion/oj |
| local run | 通用 runner | 通用 runner | 通用 runner | 通用 runner | oj + 通用 runner |
| platform run | 未承诺 | PoC | unsupported | unsupported | unsupported |
| submission sync | 可调研 | PoC | manual | 官方 API 读 | limited/manual |
| real submit | 关闭 | 本地实验后再决策 | unsupported | manual | policy blocked |

能力探测必须如实显示 `available | auth_required | unsupported | disabled_by_policy | degraded`。统一 UI 不等于统一伪造能力。
