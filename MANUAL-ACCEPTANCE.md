# 语言技能组合：剩余人工验收

自动化已经完成编译、419 项测试、1000 例 fixture 评测、隐私扫描、发布包内容审计，并安装：

- `kaiserunix.student-autocomplete-lab-beta-release@0.1.0-beta.1`

当前还同时装有旧的 `kaiserunix.student-autocomplete-lab@0.1.0-beta.1`。它和 beta-release 注册相同命令/视图，若同时启用会让验收对象不明确。以下只剩真实 VS Code 界面和当前账号调用的验收。Computer Use 因检测到用户正在操作 VS Code 而停止，避免抢占你的键盘/鼠标。无需重新安装。

## 1. 重载并检查真实调用

1. 按 `Ctrl+Shift+X` 打开扩展页，搜索 `@installed student-autocomplete`。
2. 对 `kaiserunix.student-autocomplete-lab` 选择“禁用（工作区）”；保持 `kaiserunix.student-autocomplete-lab-beta-release` 启用。不要删除旧版，验收后可恢复。
3. 按 `Ctrl+Shift+P`，运行 `Developer: Reload Window`。
4. 打开左侧“AI 做题陪练”，展开“AI 接口配置”。
5. 若测试当前已授权的 Codex OAuth，确认：
   - 兼容模式：`OpenAI 官方`
   - OpenAI 认证：`Codex OAuth`
   - 状态为已登录
   - “提示/评分模型”和“补全模型”均来自当前账号列表
6. 点击“刷新模型”，再点击“保存 AI 配置”。不要退出登录，也不要把 token、key 或模型输出抄进本文件。
7. 点击“健康检查”。

通过标准：

- “模型列表”“AI 提示”“自动补全”三项均通过；
- 自动补全卡片显示实际 `Renderer` 和 `Validation`；正常结果应为 `success`；
- 若模型返回空，应明确显示 `model-empty`；若安全策略拒绝，应明确显示 `validator-rejected`，不能笼统写成网络错误；
- 只显示密钥为“已保存/已提供”，绝不显示明文。

若还要测自接 OpenAI 兼容服务：使用你自己的 URL/key，保存后重复“拉取模型”和“健康检查”。DeepSeek 聊天 Base URL 用 `/v1`，FIM 补全 Base URL 用 `https://api.deepseek.com/beta`。不需要为了验收新建或粘贴任何 key 到本文档。

## 2. 验证四种语言的 Ghost Text

已准备四个可丢弃文件：

- `.runtime/ui-audit/smoke/smoke.py`
- `.runtime/ui-audit/smoke/smoke.c`
- `.runtime/ui-audit/smoke/smoke.cpp`
- `.runtime/ui-audit/smoke/smoke.rs`

逐个执行：

1. 打开文件，在内层 `if` 的空白缩进行输入一段未完成代码，例如 `total +=`。
2. 停止输入约 350 毫秒，不运行任何命令；等待自动出现灰色 Ghost Text。
3. 这是关键验收，侧栏“测试补全接口”预览或命令面板的立即补全都不能替代自动触发证明。
4. 若未自动出现，可运行 `AI 做题陪练：立即补全一次（备用）` 区分“自动触发失效”和“模型/传输失效”，再到侧栏点击“测试补全接口”查看 `model-empty`、`validator-rejected` 或传输失败分类。
5. 文件是可丢弃的，可以按 `Tab` 接受后检查语法，也可以按 `Esc` 拒绝。

通过标准：

- 输出只有代码，最多连续 3 行；无解释、Markdown、题面、完整答案或提示词回显；
- Python 保持缩进；
- C/C++ 保持花括号、分号、类型和边界风格；
- Rust 保持借用/所有权以及 `Option`/`Result` 结构，不随意 `unwrap`；
- 侧栏审计可显示 route、language、renderer、稳定规则 ID、规则预算和 enforcement，但不得显示代码前后缀、文件路径、题面、Teacher Pack、标准答案、key 或 token。

## 3. 验证同一学习会话

在当前已导入题目和对应代码文件上：

1. 点击“简单提示”。
2. 点击“再具体点”，确认只收窄当前问题，不直接给完整答案。
3. 在“追问 / 闲聊”输入一句针对当前问题的话，点击“继续聊”；确认先回答最新问题，语言策略和 learner rules 仍一致。
4. 再通过停顿输入自动获得一次 1–3 行 Ghost Text；补全和追问本身不应提升 StudentSkill。
5. 点击“我已完成”或“我放弃了”进入有教学证据的复盘；只有这类教学工作流可以更新 StudentSkill revision/evidence。
6. 点击“推荐下一题”，确认界面给出明确推荐理由。

通过标准：

- 教练审计显示 `coach` 路由和稳定规则 ID，补全审计显示 `autocomplete` 路由；
- 被用户禁用或被判为错误诊断的技能不会出现在已应用规则中；
- 自动补全永远不取得题面、标准答案、Teacher Pack 或教练对话历史；
- 推荐结果有可见原因，难度变化有相应学习证据。

完成后，请只反馈哪一步失败以及界面显示的分类/错误文字；不要发送 key、token 或完整模型输出。
