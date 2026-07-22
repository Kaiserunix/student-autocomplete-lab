# Student Autocomplete Lab

### 写算法题时，你可能只差一行，也可能需要一个反例。它会尽量分清。

Student Autocomplete Lab 是一个中文优先的 VS Code 算法学习助手。

少写了一行输入，它可以帮你补上；思路卡住了，它先给一个小提示；反复在同类问题上出错，它会把这些线索整理成一份只留在本地的学习画像。

它不会默认给出整题答案。代码依然由你完成，AI 只在合适的时候向前推一步。

> 🧪 **Beta 状态：** 核心流程已经可用，细节仍在持续完善。目前建议从源码启动体验。

## 快速开始

你需要 VS Code `1.95.0` 或更新版本，以及 Node.js 和 npm。

```powershell
git clone https://github.com/Kaiserunix/student-autocomplete-lab.git
cd student-autocomplete-lab
npm ci
npm test
npm run compile
```

然后用 VS Code 打开项目，按 `F5`，选择 `Run Student Autocomplete Extension`。

项目目前主要在 Windows + PowerShell 上开发和验证。macOS、Linux 用户也欢迎试用并反馈兼容性问题。

### 第一次使用

1. 打开活动栏里的 `AI 做题陪练`。
2. 在 `AI 配置` 里选好 Provider 和模型。
3. 导入一道洛谷题，或选择一份 Markdown。
4. 创建练习文件，开始写代码。
5. 看到 Ghost Text 就按需接受；卡住了再去问教练。
6. 做完后复盘一下，再看看学习画像记录得是否准确。

如果补全没有响应，可以尝试命令：`AI 做题陪练：立即补全一次（备用）`。

## 它能帮你做什么？

| 你正在…… | 它会…… |
| --- | --- |
| 重复输入模板代码 | 补一小段 Ghost Text，通常只有 1–3 行 |
| 遇到 WA 或思路停滞 | 从边界、状态或反例里挑一个方向提醒你 |
| 需要更明确的提示 | 逐步增加细节，同时尽量保留思考空间 |
| 完成一道题 | 陪你找错、评分、复盘，看看是否还有更好的写法 |
| 反复卡在同类问题 | 把证据记进可查看、可纠正的 Student Skill |
| 不知道下一题练什么 | 给出推荐题目，也解释推荐理由 |

一句话总结：**短补全减少重复输入，AI 教练推动思考，学习画像沉淀长期线索。**

## 核心功能

### ✨ 短补全

支持 Python、C、C++、Rust 等常见算法语言。停下输入约 350 ms，编辑器会尝试给出一小段灰色续写；想立刻再来一次，也可以手动触发。

它会尽量顺着现有代码继续写，而不是接管整个解题过程。

### 💬 AI 教练

侧栏里的 `AI 教练` 可以：

- 给一个小提示；
- 再具体一点；
- 接着追问；
- 放弃后看讲解；
- 做完后找错、评分和复盘；
- 推荐下一道练习题。

AI 找错和评分都只是辅助判断。最终结果仍以编译器、样例和官方 OJ 为准。

### 📚 题库

可以按题号导入洛谷题目、搜索题目和题单，也可以直接导入一份 Markdown。项目还能帮你创建 Python、C、C++、Rust 练习文件。

洛谷导入依赖公开接口，可能随上游变化。遇到导入失败时，Markdown 仍是一条可靠的备用通道。

### 🪴 会长大的学习画像

Student Skill 会记录反复出现的痛点、可能有用的习惯和最近证据。它提供的是可回看的学习线索，而不是一份替你定义“是否学会”的成绩单。

判断不准确时可以纠正，不想继续使用的结论可以禁用，也可以查看历史版本并回滚。

### 🔌 你选模型，不绑一家

| 方式 | 适合什么情况 |
| --- | --- |
| OpenAI API Key | 直接使用 OpenAI 模型 |
| Codex OAuth（实验性） | 使用本地 Codex CLI 的 ChatGPT 登录会话 |
| OpenAI-compatible | 接入 DeepSeek、MiMo 或其他兼容服务 |
| Anthropic Messages | 使用 Anthropic 原生接口 |

> **Codex OAuth 风险提示：** 这条接入方式可能存在账号风险，也可能受到 Codex 服务调整的影响。作者自测期间暂未遇到封号，但这只是个人测试结果，不代表零风险或官方保证。介意的话，建议改用 API Key。

教学和补全可以使用不同模型：高频补全更看重速度，复杂复盘则可以交给更擅长推理的模型。

## 配置 AI

在侧栏 `AI 配置` 或 VS Code Settings 中填写：

- Provider 模式；
- Base URL；
- 教学模型；
- 自动补全模型；
- 补全请求格式；
- API Key，或 Codex OAuth。

从侧栏保存的 API Key 会进入 VS Code SecretStorage。`secrets/models.env` 只用于本地开发备用，并已被 Git 忽略。请不要把密钥提交到仓库。

<details>
<summary><strong>实验性 Codeforces / AtCoder 提交</strong></summary>

当前版本可以调用你自己安装的 [`online-judge-tools/oj`](https://github.com/online-judge-tools/oj)，向 Codeforces 或 AtCoder 提交已经保存的活动代码文件。

每次提交前，你都要亲自检查题目链接、文件、语言和代码大小，再生成一次性确认。确认两分钟后失效，代码一改也会失效。

提交始终需要用户显式确认。扩展不会自动重试，也不会读取浏览器凭据或保存带源码的原始 CLI 输出。

只想看看流程，可以启动不会真的提交代码的本地演示：

```powershell
npm run prototype:oj
```

它只监听 `127.0.0.1`，默认演示模式不会访问真实 OJ。

</details>

## 数据保存在本地

默认都在本机：题库、做题记录、学习画像、Teacher Pack 和模型用量记录。

这些东西不会进 Git：

- API Key 和 OAuth 会话；
- `.runtime/` 里的运行记录；
- `.student-autocomplete/` 里的个人学习数据；
- `practice/` 里的练习文件；
- 本地生成的 VSIX。

## 为什么不直接给完整答案？

因为“看懂一份答案”和“自己能写出来”中间，通常还隔着几次尝试。

所以项目把补全和教学分成了两条路：

| 短补全能看到 | 短补全看不到 |
| --- | --- |
| 光标附近的学生代码 | 完整题面 |
| 当前语言与文件信息 | 标准答案 |
| 允许使用的代码习惯 | Teacher Pack |
|  | 教练对话、讲解报告和学习结论 |

题面和隐藏参考材料只会进入你主动发起的教学流程，不会被自动补全用来生成整题答案。

## 开发者指南

```text
src/
├─ autocomplete/    短补全：上下文、触发、请求、过滤
├─ skills/          语言策略、个人习惯与模型渲染
├─ sidebar/         VS Code 侧栏与交互
├─ problemBank/     洛谷和 Markdown 题库
├─ teaching/        提示、讲解、评分与 Student Skill
├─ recommendation/  下一题推荐
├─ models/          模型客户端
├─ codex/           Codex OAuth 与 app-server
├─ submission/      实验性 OJ 提交
└─ storage/         本地 JSON / JSONL 数据
```

常用命令：

| 命令 | 用途 |
| --- | --- |
| `npm test` | 运行全部测试 |
| `npm run compile` | 编译扩展 |
| `npm run prototype:oj` | 启动本地 OJ Console |
| `npm run package:beta` | 生成完整本地测试包 |
| `npm run package:beta-release` | 生成清理后的公开候选包 |
| `npm run check:hygiene` | 检查发行包是否包含本地数据或敏感内容 |

想了解更深的设计、实验和评测，可以从 [`docs/`](docs/) 开始。Live trial 可能消耗付费模型额度，运行前请确认模型配置和预算。

## 仍在完善

核心功能已经可用，但还不是稳定发行版：

- 英文界面只覆盖主要路径；
- LeetCode 目前更推荐 Markdown 导入；
- Codeforces、AtCoder 提交还是实验功能；
- C、C++、Rust 的补全仍在持续打磨；
- 推荐和学习画像需要更多真实练习来校准；
- macOS、Linux 还需要更多兼容性反馈。

接下来会把当前题目、代码、教练对话和复盘连成更自然的一条线，再逐步接入更多题库和 OJ。

详细进度记录在 [`docs/current-gaps-and-next-steps.md`](docs/current-gaps-and-next-steps.md)。

## 参与项目

欢迎提交 Issue，尤其是这些反馈：

- 补全过长或偏离当前代码；
- 提示过于直接，已经接近完整答案；
- 某个边界条件没有得到提醒；
- 题目无法导入；
- 学习画像记录不准确；
- 配置完成后没有正常响应。

提交问题前，请删除 API Key、OAuth 信息、个人代码和未公开题面。

## License

[MIT](LICENSE) © 2026 kaiserunix

第三方组件与许可见 [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md)。
