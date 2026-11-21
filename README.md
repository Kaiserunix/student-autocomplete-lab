# Algo Coach (`algo-coach`)

> Multi-OJ local runner, Socratic algorithm tutor, and anti-spoiler code completion for VS Code (`^1.93.0`, Node `>=20`).

Algo Coach（算法私教）是一款全新重构的本地优先 VS Code 算法训练扩展：在保留低摩擦刷题体验（多平台导题、本地多语言跑样例、可选新手教程包）的同时，通过代码级防剧透隔离，把真正的算法思考留给你自己。

## 核心架构特性

1. **架构级防剧透 3 区幽灵代码 (`src/core/autocomplete/`, `src/core/contextProjection/`)**
   - 物理上下文隔离：补全通道永不可见题面、错题本、掌握度或教练对话记录，并剥离代码中的自然语言注释。
   - `<20KB` 零 WASM 词法分区器：
     - **Green Zone**（头文件、快读、STL API）：`450–600ms` 触发，1–3 行机械补全。
     - **Neutral Zone**（常规语句）：`900–1200ms` 触发，严格限 1 行。
     - **Red Zone**（注释后首行、经典算法函数签名后首行、`if`/`while`/`for` 条件槽、`dp`/`mid`/`ans` 赋值右值）：自动静默，仅允许手动 `Alt+\` 触发。
   - 支持 `strictWordAccept`（`Tab` 逐词接受）与动态熔断（高速连击、连续退格、WA 后 6 秒冷却、连续盲接防 Drifting）。
   - DeepSeek `/beta` FIM 逐字节保真 `suffix`。

2. **5 级苏格拉底算法教练 + 输出防泄漏硬门 (`src/core/coach/`, `src/core/ai/`)**
   - 确定性 5 级阶梯（`L1 审题观察` → `L2 模式联想` → `L3 解法方向` → `L4 点明技法` → `L5 伪代码骨架`），按题持久化、不跳级，仅在显式二次确认「我放弃了」后解锁完整讲解。
   - 内置 30 秒 **Pattern Mapper**、基于真实本地失败样例的 **Dry-Run 干跑**、三档严厉度（含零谄媚 `strict` 人格）。
   - 输出侧 `spoilerPolicy.ts` 确定性拦截完整代码、主函数骨架、参考解重叠、边界标签回显与密钥/路径泄漏。
   - 独立 Chat / FIM 双角色 API Key（存于 VS Code `SecretStorage`），支持 OpenAI-compatible（DeepSeek `/v1` + `/beta`）、OpenAI、Anthropic、Ollama 与 3 步健康自检。

3. **解耦双层结构化学习档案 + FSRS 遗忘调度 (`src/core/learner/`)**
   - 单一事实源：`learningEvents.v2.jsonl`（按 `eventId` 幂等追加，中间提示永不推进掌握度）+ `userOverrides.v2.json`（人类显式屏蔽、作废与习惯，自动逻辑绝不静默覆盖）+ 纯函数 `deriveLearnerSnapshot`（集成 `ts-fsrs`）。
   - 0 Token 三桶确定性下一题推荐：FSRS 到期错题复习 → 未屏蔽高频错因同标签同级迁移 → 单标签达标后 ZPD 上探。
   - 每次教练回复附带透明上下文回执，支持一键屏蔽错因。

4. **去 MCP 的 4 层混合多 OJ 适配与本地多语言评测器 (`src/problems/`, `src/runner/`, `src/submitBridge/`)**
   - **L1 内置直读 Adapter**：LeetCode `.com`/`.cn`（Guest 零登录 GraphQL + 精选路线索引 Hot 100 / Blind 75 / NeetCode 150）、洛谷（Lentille 宽容 Schema）、AtCoder（`kenkoooo` 索引 + 公开任务 HTML）、Codeforces（官方 `problemset.problems` 元数据 API）。
   - **L2 Localhost Bridge**：兼容 Competitive Companion（端口自动顺延 + DNS Rebinding 防护）。
   - **L3 通用离线 Markdown + 智能剪贴板合并器**。
   - **P0 本地多语言评测器 (`RunnerEngine`)**：同时支持 ACM/OI Stdio（Python/C++/C/Rust/Java）与 LeetCode Function-Harness（动态生成临时 Driver 保持源码干净）、`sha256` 编译缓存、Toolchain Doctor、进程树超时强杀与 1 MiB OLE 截断（预留 `RunnerEngine` 接口供 P2 接入可选 Rust 原生沙箱）。
   - **合法提交桥**：不绕过任何 CAPTCHA / Turnstile，提供一键剥离本地调试代码并打开官方精确提交页 + Codeforces 免登录公开 `user.status` Verdict 自动同步。

5. **全可独立关闭的新手教程包、DMC 连击段位与机械键盘音效 (`src/experience/`, `src/webview/`)**
   - 三档场景预设：`starter`（新手入门）/ `focus`（专注刷题·默认）/ `contest`（竞赛/面试），所有子模块关闭即彻底 `dispose()` 监听并隐藏入口。
   - **新手教程包**：原生 `contributes.walkthroughs` 5 步闯关、一键应用/100% 无损回滚 VS Code 原生彩色括号与缩进线、零 OS 钩子毕业式快捷键轻提示、3 道离线热身题。
   - **DMC Stylish Rank**：`D · Draft` → `C · Clean` → `B · Built` → `A · Assert` → `S · Sharp` → `SS · Surgical` → `SSS · Spotless`（手敲封顶 `B`、过原题样例破境 `A`/`S`、盲接 Tab 与大段粘贴惩罚、开头头文件豁免、思考友好衰减）。
   - **机械键盘 Web Audio 音效（默认全关）**：零外部音频文件程序化合成（`crisp-blue` / `muted-brown` / `soft-drop`），状态栏一键静音，失焦自动静默，`Backspace` `-4dB` 防爆音。
   - **原生 VS Code 主题前端**：100% `--vscode-*` 令牌、`dist/webview.js` 仅 ~35KB、零硬编码色值、零渐变与零 Emoji。

## 开发与调试

```powershell
npm install
npm run verify   # typecheck + 架构边界守卫 + 198 项 Vitest 单测 + esbuild 打包
```

在 VS Code 中打开仓库根目录，按 `F5` 运行 **Run Algo Coach Extension** 即可启动 Extension Development Host。

### DeepSeek 双模型推荐配置

| 角色 | 推荐模型 | Base URL |
| :--- | :--- | :--- |
| Chat（苏格拉底教练） | `deepseek-chat` 或 `deepseek-reasoner` | `https://api.deepseek.com/v1` |
| FIM（防剧透短补全） | `deepseek-chat` | `https://api.deepseek.com/beta` *(FIM 必须用 `/beta`)* |

## 目录结构

```text
src/
├─ core/
│  ├─ contracts/          # 共享领域类型与 Webview 协议契约（零 vscode 依赖）
│  ├─ ai/                 # 多 Provider 客户端、独立 Chat/FIM 路由与 3 步健康自检
│  ├─ autocomplete/       # 3 区词法分类、自适应触发与熔断、物理隔离网关、输出过滤
│  ├─ contextProjection/  # 4 层无状态上下文编排、DeepSeek FIM 保真渲染与脱敏审计
│  ├─ coach/              # 5 级阶梯、Pattern Mapper、WA Dry-Run、输出防剧透硬门
│  └─ learner/            # OLM + ts-fsrs + 幂等事件流 + 人类覆盖层 + 三桶推荐
├─ problems/              # 6 源混合读题 Adapter、LocalhostBridge、Markdown/剪贴板合并
├─ runner/                # 本地多语言评测器（Stdio + LeetCode Harness + Toolchain Doctor）
├─ submitBridge/          # 5 平台 HTTPS 白名单跳转、调试代码剥离与 CF 公开 Verdict 同步
├─ experience/            # Preset/FeatureFlags、新手教程包、快捷键教练、DMC 段位、音效策略
├─ extension/             # 薄 VS Code 宿主（按职责拆分 Controllers，零巨石单体）
└─ webview/               # 反 GPT 味极轻原生前端 + 程序化 Web Audio 机械键盘合成器
```
