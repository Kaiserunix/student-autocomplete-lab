# Student Autocomplete Lab · 不替你交卷的 VS Code 算法私教

> **Public Beta** · 中文优先的 VS Code 算法学习助手 | *A Chinese-first, anti-spoiler VS Code algorithm coach that structurally separates 1–3 line context-blind autocomplete from Socratic hints and a local, inspectable Student Skill profile.*

**用 Copilot 刷算法题，一按 Tab 整道题全剧透了？**
Student Autocomplete Lab 把**「故意看不到题面的 1–3 行防剧透短补全」**与**「主动触发的苏格拉底式阶梯提示 + 本地可纠偏学习画像」**在架构上彻底隔离——帮你省掉重复模板手敲，但把真正的算法思考留给你自己。

[3 分钟安装（VSIX）](#快速开始推荐打包安装-vsix) · [DeepSeek 双模型速查](#30-秒-deepseek-与-openai-compatible-双模型配置) · [五平台 OJ 能力矩阵](#五平台-oj-能力与交题矩阵) · [产品策略与路线图](docs/PRODUCT_STRATEGY.md)

---

## 为什么不直接给完整答案？（架构级防剧透隔离）

“看懂一份题解”和“自己独立 AC”之间，往往隔着几次关键尝试。为了让自动补全绝不越界剧透，本项目在代码层将**短补全通道**与**教学通道**物理隔离（并由单元测试持续守护边界）：

| 通道 | ✅ 能看到的上下文 | 🚫 架构上严格隔离（绝不可见） |
| --- | --- | --- |
| **短补全（Ghost Text / FIM，1–3 行）** | 光标附近的学生代码、当前语言与文件信息、允许使用的个人编码习惯 | **完整题面、标准答案、Teacher Pack、教练对话记录、讲解报告与学习结论** |
| **AI 教练（侧栏主动触发）** | 当前题面、你的代码、历史提示层级与本地学习画像 | 仅在你点击「给点提示 / 再具体一点 / 我放弃了」时按阶梯释放信息 |

一句话总结：**短补全只顺着你的代码续写 1–3 行减少机械输入，AI 教练按阶梯推动思考，本地学习画像 (`Student Skill`) 沉淀长期错因线索。**

---

## 快速开始（推荐打包安装 VSIX）

环境要求：VS Code `1.125.0+`、Node.js `20+` 与 npm。*(当前主要在 Windows + PowerShell 上开发与验证，欢迎 macOS / Linux 用户试用并提交兼容性反馈。)*

### 方式 A：打包为 `.vsix` 装进日常 VS Code（适合直接刷题）

无需每次开调试窗口，构建清理后的 Public Beta 安装包并安装到你的主力 VS Code：

```powershell
git clone https://github.com/Kaiserunix/student-autocomplete-lab.git
cd student-autocomplete-lab
npm ci
npm run package:beta-release
code --install-extension .\.runtime\student-autocomplete-lab-0.1.0-beta.1-release.vsix
```

*(macOS / Linux 将最后一行路径改为 `.runtime/student-autocomplete-lab-0.1.0-beta.1-release.vsix`。)*

### 方式 B：源码调试启动（适合贡献者与二次开发）

```powershell
git clone https://github.com/Kaiserunix/student-autocomplete-lab.git
cd student-autocomplete-lab
npm ci
npm test
npm run compile
```

用 VS Code 打开项目根目录，按 `F5` 选择 `Run Student Autocomplete Extension` 启动 Extension Development Host。

### 第一次使用（6 步跑通）

1. 打开左侧活动栏的 **`AI 做题陪练`**。
2. 在 **`AI 配置`** 中选好 Provider、教学模型与补全模型（强烈推荐按下方双模型表配置）。
3. 在线导入一道 **洛谷** 或 **AtCoder** 题，或直接选择一份本地 **Markdown** 题面。
4. 创建 Python / C / C++ / Rust 练习文件开始写代码。
5. 停顿约 `350 ms` 看到灰色 Ghost Text 按需接受；卡住时再点侧栏 AI 教练要一个小提示。
6. 做完后做一次找错/复盘，顺手检查并纠正本地 **Student Skill** 学习画像。

> 如果短补全没有响应，优先检查补全 Base URL 是否匹配 FIM 接口（例如 DeepSeek 需用 `/beta`），也可运行命令：`AI 做题陪练：立即补全一次（备用）`。

---

## 30 秒 DeepSeek 与 OpenAI-Compatible 双模型配置

教学与补全支持拆分不同模型：高频短补全追求极速低延迟，复杂提示与复盘交给强推理模型。

| 角色 | 推荐模型（DeepSeek 示例） | Base URL（⚠️ 务必注意路径） | 用途 |
| --- | --- | --- | --- |
| **短补全（FIM Autocomplete）** | `deepseek-chat` | `https://api.deepseek.com/beta` *(FIM 必须用 `/beta`，填 `/v1` 会导致补全静默无响应！)* | 约 350ms 极速续写 1–3 行代码 |
| **AI 教练（教学 / 提示 / 复盘）** | `deepseek-reasoner` 或 `deepseek-chat` | `https://api.deepseek.com/v1` | 阶梯提示、WA 反例构造、代码评分与复盘 |

### 全部支持的模型接入方式（不绑定单一厂商）

| 方式 | 适合场景 |
| --- | --- |
| **OpenAI-compatible** | 接入 DeepSeek、MiMo、OpenRouter 或自建兼容服务 |
| **OpenAI API Key** | 直接使用 OpenAI 官方接口 |
| **Anthropic Messages** | 使用 Anthropic 原生接口 |
| **Codex OAuth（实验性）** | 复用本地 Codex CLI 的 ChatGPT 登录会话 |

> [!WARNING]
> **Codex OAuth 风险提示**：该接入方式可能存在账号风险或受上游服务策略调整影响。作者自测期间未遇封号仅代表个人测试结果，不构成零风险或官方保证；介意请优先使用标准 API Key。

通过侧栏保存的 API Key 会存入 **VS Code SecretStorage**。`secrets/models.env` 仅用于本地开发备用且已被 Git 忽略，请勿提交任何密钥到仓库。

---

## 五平台 OJ 能力与交题矩阵

不同 OJ 平台的公开接口与反爬策略差异很大，下表如实标注当前版本的开箱能力与所需本地组件：

| 平台 | 题面与样例导入 | 交题 / 评测链路 |
| --- | --- | --- |
| **洛谷 (Luogu)** | ✅ **开箱直读**公开题面、样例与标签（如需独立 MCP 接入其他客户端见 [`Kaiserunix/luogu-mcp-server`](https://github.com/Kaiserunix/luogu-mcp-server)） | 扩展内仅只读，在洛谷网页提交 |
| **AtCoder** | ✅ **开箱直读**公开题面与样例 | ⚠️ 实验性调用本机 [`online-judge-tools/oj`](https://github.com/online-judge-tools/oj)（当前受 AtCoder 上游 Cloudflare Turnstile 限制） |
| **Codeforces** | ⚙️ 远端搜索读取**公开元数据**；完整题面通过 **Competitive Companion**（端口 `10043`）或本地 Markdown 导入 | 🧪 实验性调用本机 `online-judge-tools/oj`（强制 2 分钟一次性显式确认） |
| **牛客 (NowCoder)** | ⚙️ 需另配本地牛客 MCP 适配器（[`ketherworks/competitive-programming-mcp`](https://github.com/ketherworks/competitive-programming-mcp)），未配时可用 Markdown 导入 | 🧪 通过独立本地 `stdio` 牛客 MCP 运行与二次确认提交 |
| **LeetCode** | ⚙️ 需另配本地适配器或使用 Markdown 备用通道 | 只读 / Markdown 练习链路 |

> **可靠兜底**：无论网络或外部适配器状态如何，**本地 Markdown 题面导入**始终开箱可用，并支持生成 Python、C、C++、Rust 练习文件。

---

## 核心功能一览

| 你正在…… | 它会…… |
| --- | --- |
| 重复输入模板代码（快读、建图、边界判断） | 顺着当前代码续写 1–3 行防剧透 Ghost Text |
| 遇到 WA 或思路卡壳 | 从边界、状态转移或反例中挑一个方向给小提示 |
| 需要更进一步引导 | 按阶梯逐步细化提示，直到你主动选择「我放弃了」才看完整讲解 |
| 完成一道题 | 辅助找错、评分与复盘，对比是否存在更优解法（最终结果以编译器与官方 OJ 为准） |
| 反复踩同一类坑 | 沉淀为可查看、可纠正、可禁用、可回滚历史版本的本地 **Student Skill** 学习画像 |
| 不知道下一题练什么 | 结合薄弱线索给出下一题推荐并解释推荐理由 |

<details>
<summary><strong>实验性 Codeforces / AtCoder 本地提交说明（点击展开）</strong></summary>

当前版本支持调用你自己安装的 [`online-judge-tools/oj`](https://github.com/online-judge-tools/oj)，向 Codeforces 或 AtCoder 提交已保存的活动代码文件：

- 每次提交前须亲自核对题目链接、文件、语言与代码大小，再生成一次性确认（2 分钟失效，代码改动立即失效）。
- 扩展绝不自动重试，不读取浏览器凭据，也不持久化带源码的原始 CLI 输出。
- 仅想本地体验提交流程（不访问真实 OJ，仅监听 `127.0.0.1`）：

```powershell
npm run prototype:oj
```

</details>

---

## 数据默认保存在本机

题库缓存、做题记录、Student Skill 学习画像、Teacher Pack 与模型用量统计全部默认留在本地，且以下目录/内容均被 `.gitignore` 排除、不会进入 Git：

- API Key 与 OAuth 会话（存于 VS Code SecretStorage）
- `.runtime/` 里的运行产物与本地打包 VSIX
- `.student-autocomplete/` 里的个人学习画像与记录
- `practice/` 里的个人练习代码

---

## 开发者指南

```text
src/
├─ autocomplete/    防剧透短补全：上下文隔离、触发、请求、过滤
├─ skills/          语言策略、个人习惯与模型渲染
├─ sidebar/         VS Code 侧栏与交互
├─ problemBank/     洛谷与 Markdown 题库
├─ teaching/        阶梯提示、讲解、评分与 Student Skill
├─ recommendation/  下一题推荐
├─ models/          多 Provider 模型客户端
├─ codex/           Codex OAuth 与 app-server
├─ oj/              五平台题库连接、契约与状态
├─ submission/      实验性 OJ 提交
└─ storage/         本地 JSON / JSONL 数据
```

常用命令：

| 命令 | 用途 |
| --- | --- |
| `npm test` | 运行全部 Vitest 测试（含上下文隔离边界测试） |
| `npm run compile` | 编译扩展 |
| `npm run smoke:oj-read` | 实测五平台搜索与只读导题 |
| `npm run prototype:oj` | 启动本地 OJ Console 演示 |
| `npm run package:beta` | 生成本地调试 VSIX 包 |
| `npm run package:beta-release` | 生成清理后的公开 Beta 候选 VSIX 包 |
| `npm run check:hygiene` | 检查发行包是否夹带本地数据或敏感内容 |

更深入的设计、评测与演进规划见 [`docs/`](docs/)、[`docs/PRODUCT_STRATEGY.md`](docs/PRODUCT_STRATEGY.md) 与 [`docs/current-gaps-and-next-steps.md`](docs/current-gaps-and-next-steps.md)。*（注：Live trial 会消耗付费模型额度，运行前请确认预算；当前 1,000 步长期画像演进评测属于合成模拟评测。）*

---

## 已知边界与 Public Beta 演进中

- 英文界面目前仅覆盖主要路径；
- C / C++ / Rust 短补全与学习画像校准仍在持续打磨；
- 推荐排序与学习画像需要更多真实刷题样本验证；
- macOS / Linux 仍需更多实机兼容性反馈。

欢迎提交 Issue 反馈以下场景（**提交前请删除 API Key、OAuth 信息、个人代码与未公开题面**）：补全过长或剧透、提示过于直接、边界条件遗漏、题目无法导入、学习画像判断偏差或配置后无响应。

## License

[MIT](LICENSE) © 2026 kaiserunix · 第三方组件与许可见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
