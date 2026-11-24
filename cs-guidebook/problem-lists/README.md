# Algo Coach 精选梯度题单资产包（CS-Guidebook · `v0.2.1`）

本目录是[《第 7 章 算法实战训练与作业精选》](../07-算法实战训练与作业精选.md)的配套可导入题单资产包，面向 `student-autocomplete-lab`（`algo-coach v0.2.1`）设计，包含 **40 道原生 6-OJ 梯度经典题**（30 道洛谷 + 6 道 Codeforces + 3 道 AtCoder + 1 道力扣中国）与 **4 道 CSES 纯净拓展离线卡片**。

---

## 一、目录结构说明

```text
problem-lists/
├── README.md                                  # 本使用指南与快捷题号汇总
├── import-to-algo-coach.mjs                   # 零依赖 Node.js ESM 跨平台导入脚本
├── bridge/                                    # 方式 C：Competitive Companion Bridge 实时推题数组
│   ├── set1-warmup.cc.json
│   ├── set2-fundamentals.cc.json
│   ├── set3-search-graph-dp.cc.json
│   └── set4-advanced.cc.json
├── cache-v2/                                  # 方式 B：problem-doc/v2 持久化缓存（最推荐整套静默入库）
│   ├── set1-warmup.bundle.json
│   ├── set2-fundamentals.bundle.json
│   ├── set3-search-graph-dp.bundle.json
│   ├── set4-advanced.bundle.json
│   └── problems/                              # 40 个按 sanitizeKeyForFile 命名的单题 JSON
└── offline-cards/                             # 方式 D：4 张原创概要 CSES 离线 Markdown 单题卡
    ├── cses-1068-weird-algorithm.md
    ├── cses-1640-sum-of-two-values.md
    ├── cses-1633-dice-combinations.md
    └── cses-1648-dynamic-range-sum-queries.md
```

---

## 二、四条真实导入通路速查（方式 A ~ D）

> [!NOTE]
> `algo-coach v0.2.1` 当前未提供“本地文件选择器批量导入 JSON”UI 按钮；下方 **方式 A ~ D** 的编号与[《第 7 章 算法实战训练与作业精选》](../07-算法实战训练与作业精选.md)严格一一对应，你可以根据刷题习惯任选其一。

### 方式 A：Omnibar 快捷题号单题秒导（最轻量 · 零脚本）

如果你每天只按节奏开 1~2 道题，直接在侧栏 **选题 → 导题（Auto）** 输入框，或用命令面板执行 **`Algo Coach: Import Problem`**（`algoCoach.importProblem`）粘贴下方任意题号并回车即可：

| 套题 | 全部快捷题号（直接复制到导题框即可） |
| :--- | :--- |
| **Set 1 · 语法模拟与热身** | `P5707`、`P1046`、`P1047`、`P1980`、`P1055`、`P1042`、`CF4A`、`CF231A`、`CF1900A`、`abc340_b` |
| **Set 2 · STL 排序二分贪心** | `P1093`、`P8218`、`P2367`、`P2249`、`P1873`、`P1803`、`P1090`、`209`、`CF706B`、`abc350_c` |
| **Set 3 · 搜索图论与入门 DP** | `P1219`、`P1443`、`CF520B`、`dp_a`、`P1216`、`P1048`、`P1616`、`P4779`、`P3366`、`B3644` |
| **Set 4 · 进阶结构与数论** | `P1226`、`P3383`、`P5788`、`P1886`、`P3374`、`P3372`、`P1525`、`P3379`、`P1880`、`CF1526C2` |

---

### 方式 B：静默批量写入 `problem-doc/v2` 缓存（最推荐整套入库）

将 `cache-v2/problems/` 中的单题 JSON 写入 VS Code 全局存储目录后，题目会静默出现在侧栏 **选题 (`Bank`) → 已存** 中，不会一次弹出几十个编辑器标签页。

先用 `--dry-run` 预演探测到的目录（不写入任何文件）：

```bash
node cs-guidebook/problem-lists/import-to-algo-coach.mjs --mode cache --set all --dry-run
```

确认路径无误后，按套或全量导入：

```bash
# 导入 Set 1（同样支持 --set set1 / --set 1 / --all）
node cs-guidebook/problem-lists/import-to-algo-coach.mjs --mode cache --set set1

# 一次性导入全部 40 题
node cs-guidebook/problem-lists/import-to-algo-coach.mjs --all
```

常用可选参数：
- **自定义目录（适配 Cursor / VS Code Insiders / VSCodium / Portable 版）**：通过 `--target <dir>`（或 `--target-dir <dir>`）直接指定 `globalStorage/kaiserunix.algo-coach/problems-cache/problems`（也可只传到 `kaiserunix.algo-coach` 根目录，脚本会自动补全后缀）。
- **保护已水合缓存**：默认跳过目标目录中已存在的同名 JSON，防止覆盖你已经拉取到本地的完整题面；确需覆盖时附加 `--force`。
- **纯手动导入（不运行脚本）**：将 `cache-v2/problems/*.json` 手动复制到对应系统的缓存目录即可：
  - Windows：`%APPDATA%\Code\User\globalStorage\kaiserunix.algo-coach\problems-cache\problems\`
  - macOS：`~/Library/Application Support/Code/User/globalStorage/kaiserunix.algo-coach/problems-cache/problems/`
  - Linux：`~/.config/Code/User/globalStorage/kaiserunix.algo-coach/problems-cache/problems/`

导入完成后，在 VS Code 按 `Ctrl+Shift+P`（macOS 为 `Cmd+Shift+P`）执行 **`Developer: Reload Window`** 刷新侧栏，即可在 **选题 → 已存** 看到题目列表。

---

### 方式 C：Localhost Bridge 实时推题

适合边刷边直接生成代码文件，脚本会自动探测 `127.0.0.1:27121` ~ `27130` 的在线 `/health` 端口并逐题推送：

```bash
# 先干跑检查 payload（不发送 HTTP 请求）
node cs-guidebook/problem-lists/import-to-algo-coach.mjs --mode bridge --set set1 --dry-run

# 确保 VS Code 侧栏右上角显示绿灯 127.0.0.1:27121 后推送 Set 1
node cs-guidebook/problem-lists/import-to-algo-coach.mjs --mode bridge --set set1
```

如果插件顺延绑定到了其他端口，可显式指定 `--port 27122`。

> [!WARNING]
> Bridge 模式每收到 1 题就会立即在工作区 `practice/` 生成并打开 1 个代码标签页。建议按单套（`set1`~`set4`）分批推送，避免一次打开 40 个标签页影响编辑体验。

---

### 方式 D：CSES 离线 Markdown 卡片导入（非原生 OJ / 断网练习）

`algo-coach` 当前无 CSES 原生 Adapter，因此我们在 `offline-cards/` 提供了 4 张严格对齐 `markdownParser.ts` 元数据规范的单题卡：

- [cses-1068-weird-algorithm.md](./offline-cards/cses-1068-weird-algorithm.md)
- [cses-1640-sum-of-two-values.md](./offline-cards/cses-1640-sum-of-two-values.md)
- [cses-1633-dice-combinations.md](./offline-cards/cses-1633-dice-combinations.md)
- [cses-1648-dynamic-range-sum-queries.md](./offline-cards/cses-1648-dynamic-range-sum-queries.md)

导入步骤：打开侧栏 **选题** → 展开底部 **「粘贴题面 / 插件同步」** 抽屉 → 粘贴任意一张 `.md` 卡片全文 → 点击 **「导入为新题」**。

---

## 三、按需水合与版权安全机制说明

1. **零版权正文抄录**：`cache-v2/` 与 `bridge/` 中全部 40 道 6-OJ 题目均不包含第三方 OJ 题面正文与官方测试样例，所有缓存 JSON 严格标记为 `"completeness": "metadata_only"` 与 `"samples": []`。
2. **首次点击自动拉取完整题面与模板**：在 Algo Coach 侧栏点击任意 `metadata_only` 题目时，插件会自动联网从对应 OJ（Codeforces 经镜像站）水合官方完整题面、官方样例与力扣 `209` 的 `functionMeta` 代码签名模板，并写回本地缓存。
3. **开箱可用学习画像与 FSRS**：每道题已预先配置对齐插件 `taxonomy.ts` 的 `conceptTags`、难度分级（`normalizedTier`）与标准 ISO-8601 `provenance.fetchedAt` 时间戳，导入后即可正常参与排序、成长掌握度统计与间隔复习调度。
