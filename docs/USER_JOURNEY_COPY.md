# Student Autocomplete Lab — User Journey & Microcopy Deck (`v0.1.0-beta.1` → `v0.2.0-beta`)

> **Code-Truth Baseline**: Verified against `src/sidebar/ProblemBankViewProvider.ts`, `src/sidebar/webview/{formalDesign,i18n}.ts`, `src/extension.ts`, `src/autocomplete/{inlineProvider,context,filter}.ts`, `src/oj/vscodeProviderConfiguration.ts`, `src/submission/*`, `prototypes/oj-console/frontend/index.html`, `package.json`, `README.md`, and `MANUAL-ACCEPTANCE.md`.

---

## 1. Product Positioning, Stage Alignment & Hero Copy

### 1.1 Stage & Naming Harmonization

| Surface | Current Value | Friction / Conflict | vNext Canonical Copy |
| :--- | :--- | :--- | :--- |
| **GitHub Repo About** | `alpha` / generic description | Conflicts with `package.json:5` (`0.1.0-beta.1`) and `README.md:11` (`Beta 状态`) | **Public Beta (`v0.1.0-beta.1`)** — 中文优先的 VS Code 算法私教：防剧透 1–3 行短补全 + 苏格拉底阶梯提示 + 本地可纠错学习档案 |
| **VS Code Marketplace / `package.json:4`** | `A Chinese-first VS Code algorithm coach with safe autocomplete and inspectable learning skills.` | Accurate in English, but Chinese users scanning the extension page miss the anti-spoiler hook | `不替你交卷的 VS Code 算法学习助手：故意看不到题面的 1–3 行防剧透短补全、苏格拉底式阶梯提示与本地可回滚学习档案 (Student Skill)。` |
| **Activity Bar Container (`package.json:245`)** | `AI 做题陪练` | Matches commands (`AI 做题陪练：...`), keep as canonical brand prefix | `AI 做题陪练` |
| **Webview Masthead (`ProblemBankViewProvider.ts:3755`)** | `做题陪练` (`zh`) / `Student Autocomplete Lab` (`en`) | Consistent | `做题陪练 · COMPETITION DOSSIER` |

### 1.2 Hero Pitch Variants (README & Community Channels)

#### A. Primary README Hero Block (Top of `README.md`)
```markdown
# Student Autocomplete Lab · 不替你交卷的 VS Code 算法私教

> **Copilot 一按 `Tab` 直接把整道算法题剧透完？**
> 我们把 **「故意看不到题面与标程的 1–3 行短补全」** 与 **「知晓题面的苏格拉底式阶梯提示 + 本地可纠错学习档案 (Student Skill)」** 在架构层彻底物理隔离——只接住你的机械输入，绝不剥夺你推导出 AC 的那一刻。

| 你的刷题痛点 | 普通 AI 编程助手 (Copilot / Cursor) | Student Autocomplete Lab (`competition-dossier`) |
| :--- | :--- | :--- |
| **写 `cin` / 建图 / 边界循环时按 `Tab`** | 偷偷读题号或注释，一次性吐出 30 行完整 AC 标程，失去思考机会 | **防剧透上下文闸门**：补全通道物理隔离题面、标程与 Teacher Pack，最多续写 **1–3 行**局部代码 |
| **遇到 `WA` / `TLE` 思路卡壳** | 直接重写整份代码，看完似懂非懂，下次换题照样卡 | **四级阶梯提示**：`给一个提示`（方向）→ `提示更具体`（反例/状态）→ `自由追问` → `我卡住了`（最小修复路径 + 补救小练习） |
| **同类边界/爆 `long long` 反复犯错** | 无记忆或黑盒记忆，无法查看也无法纠正 | **本地学习档案 (`Student Skill`)**：记录证据计数与来源题号，支持 **`这条不准` / `有帮助` / `禁用` / `版本回滚`** |
```

#### B. 30-Second Value Hook for ACM / OI University Clubs & V2EX
- **Headline**: `给刷洛谷 / CF / AtCoder 的同学做了个“防剧透”的 VS Code 插件：短补全物理隔离题面，AI 教练只给反例不抄答案`
- **Sub-hook**: `支持 DeepSeek 双模型分流（deepseek-chat /beta 跑毫秒级 1–3 行 FIM 短补全 + deepseek-reasoner 跑苏格拉底诊断），所有学习画像与证据链 100% 留在本地 JSONL。`

---

## 2. Terminology Harmonization Matrix (Closing the 4-Way Naming Split)

Currently, `README.md`, `package.json` commands, `src/extension.ts` notifications, and the `competition-dossier` sidebar webview (`ProblemBankViewProvider.ts`) use **four different vocabularies** for the exact same UI controls.

| Concept / Action | `README.md` (Current) | `package.json` & `src/extension.ts` (Current) | Shipped Webview UI (`ProblemBankViewProvider.ts`) | **vNext Unified Canonical Term (`zh` / `en`)** |
| :--- | :--- | :--- | :--- | :--- |
| **Tab 1: Main Coaching Workspace** | `AI 教练` (`lines 61, 63`) | `AI 教练` (`extension.ts:122`) | `作答现场` (`#tabAi`, `line 3776`) | **`作答现场 (AI 教练)`** / **`AI Coach`** |
| **Tab 2: Problem Intake & Queue** | `题库` (`line 74`) | `保存题目` (`package.json:40`) | `题目张贴板` (`#tabProblem`, `line 3777`) | **`题目张贴板 (题库)`** / **`Problems`** |
| **Tab 3: Inspectable Learner Profile** | `学习画像` / `Student Skill` (`line 80`) | — | `学习档案` (`#tabSkill`, `line 3778`) | **`学习档案 (Student Skill)`** / **`Learning Profile`** |
| **AI Provider & Model Settings Drawer** | `AI 配置` (`lines 31, 101`) | `AI 做题陪练` (`package.json:71`) | `账户与模型` (`#accountModelDrawer`, `line 3999`) | **`账户与模型 (AI 配置)`** / **`Account & Models`** |
| **Action: Level-1 Hint** | `给一个小提示` (`line 65`) | `AI 做题陪练：给点提示` (`extension.ts:89`) | `给一个提示` (`#coachHint`, `line 3952`) | **`给一个提示`** / **`Hint`** |
| **Action: Level-2 Specific Hint** | `再具体一点` (`line 66`) | `AI 做题陪练：再具体点` (`extension.ts:92`, toast says `更具体`) | `提示更具体` (`#coachSpecific`, inside `更多操作`, `line 3956`) | **`提示更具体`** / **`More Specific`** |
| **Action: Give Up / Lesson Report** | `放弃后看讲解` (`line 68`) | `AI 做题陪练：我放弃了` (`extension.ts:95`) | `我卡住了` (`#coachGiveUp`, inside `更多操作`, `line 3958`) | **`我卡住了（看讲解）`** / **`I'm Stuck (Lesson)`** |
| **Action: Post-Solve Review & Archive** | `做完后找错、评分和复盘` (`line 69`) | — | `完成复盘` (`#coachCompleted`, inside `更多操作`, `line 3959`) | **`完成复盘（评分并归档）`** / **`Finish & Review`** |
| **Action: Pre-Submit AI Self-Check** | `找错` (`line 69`) | — | `找错复盘` (`line 6707`, **only rendered in `已归档`!**) | **`交题前自检 (AI 估计)`** (Active) / **`找错复盘`** (Archived) |
| **Action: Rule-Based Next Problem** | `推荐下一道练习题` (`line 70`) | `AI 做题陪练：推荐下一题` (`extension.ts:98`) | `推荐下一题` (`line 6728`, **only rendered in `已归档`!**) | **`推荐下一题`** / **`Recommend Next`** |
| **Internal Transport Naming** | `OpenAI-compatible` | `requestMimoAutocompleteDetailed`, `requestMimoTeacherPack` (145 `mimo` refs) | `#aiBaseUrl` placeholder `https://token-plan-cn.xiaomimimo.com/v1`, model `mimo-v2.5` (`lines 4060, 4072`) | Neutralize user-facing placeholders to **`https://api.deepseek.com/v1`** & **`deepseek-chat`** |

---

## 3. Onboarding & Configuration Microcopy

### 3.1 Dual-Path Installation Copy (`README.md` Quick Start Replacement)

#### Path A: 60-Second Student VSIX Install (Recommended for Contest Learners)
```markdown
### 方式一：打包并安装本地插件（推荐刷题学生，无需开 F5 调试窗口）

在日常刷题工作区直接使用插件，只需生成干净的候选 `.vsix` 并安装到 VS Code：

```powershell
git clone https://github.com/Kaiserunix/student-autocomplete-lab.git
cd student-autocomplete-lab
npm ci
npm run package:beta-release
code --install-extension .runtime/student-autocomplete-lab-beta-release-0.1.0-beta.1.vsix
```

> 💡 **版本冲突提醒（`MANUAL-ACCEPTANCE.md:7`）**：如果你此前安装过开发包 `kaiserunix.student-autocomplete-lab`，请在扩展面板 (`Ctrl+Shift+X`) 搜索 `@installed student-autocomplete`，将旧包设为 **「禁用（工作区）」**，仅保留 `student-autocomplete-lab-beta-release` 启用。
```

#### Path B: Extension Development Host (`F5` for Contributors)
```markdown
### 方式二：从源码启动调试宿主（适合二次开发与运行评测脚本）

```powershell
npm ci && npm test && npm run compile
```
用 VS Code 打开本仓库，按 `F5` 选择 `Run Student Autocomplete Extension`。
```

### 3.2 30-Second AI Provider Preset Cards (For `#accountModelDrawer` & README)

| Preset Chip Label | `兼容模式 (mode)` | `分析接口 Base URL` | `补全接口 Base URL` | `补全协议` | `提示/评分模型` | `补全模型` | In-UI Helper Microcopy |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **🔥 DeepSeek 双模型推荐** | `OpenAI 兼容` (`openai-compatible`) | `https://api.deepseek.com/v1` | `https://api.deepseek.com/beta` | `Completions` (`openai-completions`) | `deepseek-reasoner` (or `deepseek-chat`) | `deepseek-chat` | `DeepSeek FIM 短补全必须走 /beta 端点与 Completions 协议；填 /v1 会导致补全静默返回空。` |
| **⚡ OpenAI 官方 API Key** | `OpenAI 官方` (`openai`) | `https://api.openai.com/v1` | *(Auto-follows Chat URL)* | `Chat Completions` (locked) | `gpt-4o` / `o3-mini` | `gpt-4o-mini` | `密钥保存在本机 VS Code SecretStorage，不会写入 settings.json 或 Git。` |
| **🧪 Codex OAuth (实验性)** | `OpenAI 官方` + `Codex OAuth` | *(Managed via local `codex` CLI)* | *(Managed via local `codex` CLI)* | `Chat Completions` | *(Select from account dropdown)* | *(Select from account dropdown)* | `⚠️ 实验性功能：复用本机 Codex CLI 会话，可能受服务端策略调整影响。日常稳定刷题优先推荐 API Key。` |
| **🧠 Anthropic Native** | `Anthropic Native` (`anthropic-native`) | `https://api.anthropic.com/v1` | *(Auto-follows Chat URL)* | `Messages` (locked) | `claude-3-7-sonnet-latest` | `claude-3-5-haiku-latest` | `使用 Anthropic 原生 Messages 协议；建议用 Haiku 跑高频补全、Sonnet 跑教学诊断。` |

---

## 4. State-by-State UI Microcopy Catalog (`zh-CN` & `en-US`)

### 4.1 Masthead & Empty States (`#sessionMasthead`, `#coachSelection`, `#problemDetail`, `#studentSkillPanel`)

| UI Location & State | Current Copy (`ProblemBankViewProvider.ts`) | Problem with Current Copy | vNext Upgraded Copy (`zh-CN`) | vNext Upgraded Copy (`en-US`) |
| :--- | :--- | :--- | :--- | :--- |
| **`#coachSelection` Empty State (No problem selected)** (`lines 5163-5166`) | `还没选题` / `到题目张贴板选一道题。` | No clickable button! User must manually scroll up and click the `题目张贴板` tab | **Title**: `尚未载入当前题目`<br>**Body**: `先从「题目张贴板」导入一道洛谷/AtCoder/Markdown 题，或开启 6 题初始诊断。`<br>**CTA 1**: `[去题目张贴板选题 →]` (switches to `problemPage`)<br>**CTA 2**: `[一键导入 6 道初始诊断题]` | **Title**: `No Active Problem`<br>**Body**: `Import a problem from the Problems tab or start the 6-problem diagnostic route.`<br>**CTA 1**: `[Open Problems Tab →]`<br>**CTA 2**: `[Import 6-Problem Diagnostic]` |
| **`#coachSelection` Missing Practice File State** (`line 5177`) | Shows passive pill `未打开文件` in `.tagRow`; clicking `给一个提示` throws error (`line 956`) | Preset, Problem-Set, and Markdown imports never create a practice file, leaving the student stuck with no create-file button | **Pill**: `⚠️ 未打开练习代码`<br>**Inline Action Button**: `[+ 创建/打开 {{practiceLanguage}} 练习文件]` (`practice/<platform>-<id>/solution.<ext>`) | **Pill**: `⚠️ No Code File Open`<br>**Inline Action Button**: `[+ Create / Open {{practiceLanguage}} Practice File]` |
| **`#problemDetail` Empty State (`POSTER / EMPTY`)** (`lines 6750-6774`) | `还没有张贴当前题目。选择一份 Markdown 题面，或者从洛谷取回题目后再进入作答现场。`<br>Buttons: `[选择 Markdown 题目]` `[从洛谷获取]` | Clicking `[从洛谷获取]` runs `luoguPid.focus()` on a closed `<details>` (`line 3876`), so **nothing happens on screen**! | **Eyebrow**: `POSTER / EMPTY · 待张贴题面`<br>**Body**: `选择本地 .md 题面、按题号拉取洛谷公开题面（自动创建代码文件），或一键导入新手诊断路线。`<br>**CTA 1**: `[拉取洛谷题目并建文件]` (opens `<details>` & focuses `#luoguPid`)<br>**CTA 2**: `[选择 Markdown 题目]` | **Eyebrow**: `POSTER / EMPTY`<br>**Body**: `Import a local .md problem, fetch a Luogu problem by ID (auto-creates a starter file), or load a starter route.`<br>**CTA 1**: `[Fetch Luogu ID & Create File]`<br>**CTA 2**: `[Choose Markdown File]` |
| **`#problemDetail` Metadata-Only Summary (`!problem.statement`)** (`lines 6801-6810`) | `这是题单导入的题目摘要，尚未下载完整题面。` + `[下载完整题面]` | Only handles `platform === "luogu"`. If a Codeforces metadata item is inspected, it says `暂无题面。` without explaining why | **Luogu**: `当前仅缓存了题单元数据摘要。点击下方按钮拉取完整题面并创建练习文件。` `[下载完整题面并建文件]`<br>**Codeforces**: `Codeforces 官方 API 仅提供题名、难度与标签元数据。请通过 Competitive Companion (端口 10043) 或导入 Markdown 补充完整题面。` | **Luogu**: `Only problem-set metadata is cached. Fetch the full statement and create a starter file below.`<br>**Codeforces**: `Codeforces official API returns metadata only. Import the full statement via Competitive Companion (port 10043) or Markdown.` |
| **`#studentSkillPanel` Empty State** (`lines 5646-5648`) | `还没有 Student Skill 数据。先进行一次 AI 提示或学习评分，系统会开始形成画像。` | Doesn't reassure the student about privacy or explain how observations promote to skills | **Title**: `学习档案尚为空白 (rev 0)`<br>**Body**: `当你请求「给一个提示」「完成复盘」或「我卡住了」时，AI 会把暴露出的痛点与代码习惯沉淀到这里。所有数据 100% 存储在本地，你随时可以标记「这条不准」、禁用规则或回滚历史版本。` | **Title**: `Learning Profile Empty (rev 0)`<br>**Body**: `Hints, completion reviews, and lesson reports distill recurring pain points and code habits here. Stored 100% locally—mark items inaccurate, disable rules, or roll back anytime.` |

### 4.2 Error & Diagnostic Microcopy (Replacing Cryptic Failures with Recovery Steps)

| Trigger / Code Path | Current Error Copy | vNext Actionable Error Copy (`zh-CN`) |
| :--- | :--- | :--- |
| **Coaching clicked with no active editor** (`ProblemBankViewProvider.ts:956, 1348, 1473, 2058`) | `先打开你的代码文件，AI 才能分析当前卡点。` | `未检测到打开的代码编辑器。请点击上方「创建/打开练习文件」，或在编辑器中聚焦你的作答文件（.py / .c / .cpp / .rs）后再请求教练。` |
| **Completion Review clicked on empty/template code** (`ProblemBankViewProvider.ts:1483, 1636`) | `当前学生代码看起来还是模板或空 pass，不能做学习评分。先写一点真实代码；如果已经卡住，请用“给点提示”或“我放弃了”。` | `当前代码仍是初始模板（或仅含空 pass/return），无法评估真实思路。请先写几行核心逻辑；若不知如何下手，请点「给一个提示」或展开更多操作点「我卡住了」。` *(Note: updates `"给点提示"/"我放弃了"` to match actual button labels `"给一个提示"/"我卡住了"`!)* |
| **Autocomplete Preview: `model-empty`** (`ProblemBankViewProvider.ts:1827, 6159`) | `模型返回为空。把光标放在函数体、循环体或半行代码后再试。` | `补全模型返回为空 (model-empty)。请尝试：① 将光标移至函数体/循环体内未写完的代码行末尾（如 total += ）；② 若使用 DeepSeek FIM，请确认「补全接口 Base URL」填的是 https://api.deepseek.com/beta 而非 /v1。` |
| **Autocomplete Preview: `validator-rejected`** (`ProblemBankViewProvider.ts:1828, 6155`) | `AI 返回内容已被安全策略拦截：<rejectionReason>` | `🛡️ 防剧透安全闸门已拦截本次补全 ({{rejectionReason}})：模型试图输出超过 3 行的完整解法、Markdown 解释或题面剧透，已被本地过滤器丢弃。` |
| **Command Palette Dummy Toast** (`src/extension.ts:122`) | `请在左侧 AI 教练中点击「给点提示」继续。` | **Direct Execution**: Forward the command directly to `ProblemBankViewProvider` (`provider.triggerCoachAction("hint" | "specific" | "giveUp" | "recommend")`), or if no problem is selected: `已在左侧打开「作答现场」，请先选择一道题目并打开代码文件。` |
| **Expired OJ Search Result** (`ProblemBankViewProvider.ts:343, 363`) | `这条搜索结果已失效，请重新搜索后再导入。` | `该搜索缓存已随窗口刷新失效。请重新点击「搜索」获取最新题库条目后再导入。` |
| **Untrusted Workspace on OJ Submit** (`ProblemBankViewProvider.ts:2018`) | `真实 OJ 提交在受限工作区中已禁用；请先确认并信任当前工作区。` | `安全拦截：当前处于 VS Code 受限工作区（Restricted Mode），已禁用外部 oj CLI 调用。请点击状态栏「管理工作区信任」设为信任后再试。` |
| **Dirty Editor on OJ Submit Confirm** (`ProblemBankViewProvider.ts:1916`) | `预览后代码已修改，请保存并重新生成提交预览。` | `安全校验未通过：生成预览后代码文件发生了改动（SHA-256/版本号不一致）。请按 Ctrl+S 保存并重新点击「提交前确认」。` |

---

## 5. Anti-Spoiler Context Receipt & Status Bar Microcopy

### 5.1 Restoring the Context Isolation Receipt (`appendContextAudit` in `ProblemBankViewProvider.ts:6193`)

In `ProblemBankViewProvider.ts:6193`, `function appendContextAudit() {}` is currently an empty stub, even though the extension host computes `skillAudit` and `contextAudit` (`lines 1042, 1120, 1806`) and `MANUAL-ACCEPTANCE.md:55,69` requires displaying the route, renderer, and applied rules without leaking code or keys!

**vNext Receipt Drawer Microcopy (appended to `#aiResponse` after every Hint, Follow-up, Lesson, Score, or Autocomplete Preview)**:
- **Collapsed Summary**: `🛡️ 上下文与防剧透审计凭据 · 路由：{{route}} · 已应用 {{appliedCount}} 条规则`
- **Expanded Body (`route === "autocomplete_preview"`)**:
  ```text
  路由通道：autocomplete_preview（防剧透短补全隔离通道）
  语言 / 渲染器：{{language}} · {{renderer}} ({{enforcement}})
  ✅ 已注入：光标前后局部代码窗口、语言策略 ({{languagePolicyId}})、已启用代码习惯 ({{appliedLearnerRuleIds}})
  🚫 物理隔离：完整题面、标准答案、Teacher Pack、教练对话历史、已禁用规则 ({{excludedDisabledCount}} 条)
  ```
- **Expanded Body (`route === "coach"`)**:
  ```text
  路由通道：coach（苏格拉底教学诊断通道）
  语言 / 渲染器：{{language}} · {{renderer}} ({{enforcement}})
  ✅ 已注入：当前题面、活动编辑器代码、最近 {{turnCount}} 轮提示摘要、学习档案摘要、隐藏 Teacher Pack 参考点
  🚫 严格排除：自动补全提示词、已禁用/判错的 Student Skill ({{excludedDisabledCount}} 条)、未授权直接泄题
  ```

### 5.2 VS Code Bottom Status Bar (`src/extension.ts:35-40, 66-80`)

| Event (`InlineCompletionEvent.type`) | Current Status Bar Text | Current Tooltip | vNext Status Bar Text | vNext Actionable Tooltip |
| :--- | :--- | :--- | :--- | :--- |
| **Idle / Activated** | `$(sparkle) AI 自动补全已开启` | `停下输入约 350 毫秒后自动显示灰色 Ghost Text；点击这里可立即补全一次。` | `$(sparkle) 短补全就绪 (1–3行防剧透)` | `停顿 350ms 自动触发 1–3 行局部续写（物理隔离题面与标程）。点击立即触发一次补全。` |
| **`request`** | `$(sync~spin) AI 补全中` | *(stale)* | `$(sync~spin) AI 短补全生成中…` | `正在请求补全模型（{{language}} 第 {{line}} 行）…` |
| **`success`** | `$(check) AI 补全已返回` | `python line 12 2 line(s)` | `$(check) 短补全已就绪 ({{lines}} 行)` | `已生成 {{lines}} 行安全续写（按 Tab 接受，Esc 忽略）。点击可重新触发。` |
| **`empty`** | `$(circle-slash) AI 返回空补全` | `The autocomplete model returned no continuation.` | `$(circle-slash) 短补全无续写` | `模型在当前光标处未返回续写。可在函数/循环体未完成行重试，或在侧栏点「测试补全接口」排查配置。` |
| **`rejected`** | `$(shield) AI 补全已拦截` | `Autocomplete output rejected by policy: ...` | `$(shield) 防剧透已拦截长代码` | `安全闸门已拦截违规输出（{{reason}}）：禁止超过 3 行、含 Markdown 或疑似整题答案。` |
| **`error`** | `$(warning) AI 补全异常` | `<raw error message>` | `$(warning) 短补全连接异常` | `补全请求失败：{{message}}。请展开侧栏「作答现场 → 账户与模型」运行「健康检查」。` |

---

## 6. Five-Platform OJ Capability & Submission Copy Matrix

Use this exact copy table in both `README.md` and the `在线题库` / `提交到 OJ` drawers so students never hit unexpected adapter errors or Turnstile blocks:

| 平台 (`Platform`) | 在线搜题 (`Search`) | 题面与样例导入 (`Fetch Statement`) | 代码提交方式 (`Submission Path`) | 状态标签与用户提示文案 (`In-UI Copy`) |
| :--- | :--- | :--- | :--- | :--- |
| **洛谷 (`Luogu`)** | ✅ 开箱即用（托管只读 MCP + 直连题号/题单） | ✅ 开箱即用（支持完整题面、样例与 6 题初始诊断路线） | 🔒 仅只读导题（请前往洛谷网页交题，回插件选 `AC/WA` 复盘） | `🟢 托管只读已就绪 · 支持按题号 (P1001)、题单 ID (100) 或关键词一键导题并建文件` |
| **AtCoder** | ⚠️ 需精确 `contestId/taskId`（如 `abc086/abc086_a` 或完整 URL） | ✅ 开箱即用（托管只读 MCP 自动解析题面与样例） | 🧪 实验性本机 `oj` CLI 提交（⚠️ 目前受上游 Cloudflare Turnstile 限制） | `🟡 只读导题就绪 · 搜索请填 abc350/abc350_a；本机 oj 交题当前可能被 AtCoder Turnstile 拦截（请勿尝试绕过，建议网页交题）` |
| **Codeforces** | ✅ 开箱即用（托管官方 API MCP，支持按题号/标签搜索） | ⚠️ 远端仅返回元数据（题名/难度/标签）；**完整题面需用 Competitive Companion 或导入 Markdown** | 🧪 实验性本机 `oj` CLI 单次确认提交 + 可选 Handle 公开判题轮询 | `🟡 仅搜索元数据 · 官方 API 不返回题面正文，点击搜索结果将「打开原题」；完整题面请用 Markdown 导入，交题需本机安装 online-judge-tools/oj` |
| **牛客 (`NowCoder`)** | 🔌 需配置本机牛客 MCP (`studentAutocomplete.oj.nowcoder.entrypoint`) | 🔌 本机 MCP + Competitive Companion (`127.0.0.1:10043`) 或 Markdown | 🔌 本机牛客 MCP 独立支持（插件侧栏仅作只读题库接入） | `🔌 需本机适配器 · 请在「连接设置」指定牛客 MCP dist/index.js 路径；未安装时请直接使用「导入 Markdown」` |
| **LeetCode** | 🔌 需配置本机私有适配器 (`studentAutocomplete.oj.leetcode.entrypoint`) | 🔌 本机匿名只读适配器（支持 `cn` / `global` 站点切换）或 Markdown | 🔒 固定匿名只读（不支持插件内交题） | `🔌 需本机适配器 · 默认匿名只读，无需填写凭据；未配置本机适配器入口时请使用「导入 Markdown」` |
