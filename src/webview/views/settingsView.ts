import type { FeatureFlags, PresetMode } from "../../core/contracts";
import { badge, btn, cnt, d, drawer, emptyBox, h, inp, sec, sel, sp, subTabs, tbl, toggleRow } from "../dom";
import { t, type UiLang } from "../i18n";
import { icon } from "../icons";
import { DS, escapeHtml as E, getDraftOrFallback as dr, type WebviewState } from "../state";

const PRESETS: ReadonlyArray<[PresetMode, string, string, string, string]> = [
  ["starter", "新手入门", "Starter", "引导+热身", "Guided"],
  ["focus", "专注刷题", "Focus", "防剧透平衡", "Balanced"],
  ["contest", "竞赛面试", "Contest", "手动+严厉", "Strict"]
];

const PROVS: ReadonlyArray<[string, string, string]> = [
  ["openai-compatible", "OpenAI 兼容", "OpenAI-Compat"],
  ["openai", "OpenAI 官方", "OpenAI"],
  ["anthropic", "Anthropic Claude", "Anthropic"],
  ["ollama", "Ollama 本地", "Ollama (Local)"]
];

export function renderSettingsView(st: WebviewState): string {
  const { snapshot: snap } = st;
  const { flags: f, aiConfig: ai } = snap;
  const l: UiLang = f.uiLanguage;
  const T = (zh: string, en: string) => t(l, zh, en);
  const g = (k: string, fb = "") => dr(st, k, fb);
  const sub = dr(st, "sub.settings", "env") === "exp" ? "exp" : "env";
  const backTab = st.prevTab && st.prevTab !== "settings" ? st.prevTab : "workspace";

  const fSel = (k: string, items: ReadonlyArray<[string, string]>, cur: string, cls = "sel sm", extra = "") =>
    sel(items, cur, `data-action="flag-select" data-key="${k}"${extra}`, cls);
  const fRow = (lbl: string, k: string, items: ReadonlyArray<[string, string]>, cur: string, desc = "") =>
    h("label", "fi", (desc ? d("tc", sp("tr-l", E(lbl)) + sp("mu", E(desc))) : sp("", E(lbl))) + fSel(k, items, cur));
  const slider = (k: string, lbl: string, v: number) => {
    const pct = Math.round(v * 100);
    return h("label", "sr", sp("", E(lbl)) + `<input class="rg" type="range" min="0" max="100" step="5" value="${pct}" data-action="flag-range" data-key="${k}">` + cnt(`${pct}%`));
  };

  const presetCard = sec(
    T("训练模式预设", "Mode Preset"),
    d(
      "seg-track pr-strip",
      PRESETS.map(([p, zh, en, dzh, den]) =>
        h("button", `pr${f.preset === p ? " pr-a" : ""}`, sp("fw", E(T(zh, en))) + sp("mu", E(T(dzh, den))), `type="button" aria-pressed="${f.preset === p}" data-action="preset-select" data-preset="${p}"`)
      ).join("")
    ),
    d(
      "r g1",
      fSel("uiLanguage", [["zh-CN", "简体中文"], ["en-US", "English"]], f.uiLanguage, "sel sc", ` aria-label="${E(T("界面语言", "Language"))}"`) +
        btn(T("返回", "Back"), "switch-tab", "g", "xs", `data-tab="${backTab}"`)
    )
  );

  const nav = subTabs(
    "settings",
    [["env", E(T("模型与环境", "AI & Env"))], ["exp", E(T("防剧透与体验", "Experience"))]],
    sub,
    T("设置分类", "Settings")
  );

  if (sub === "exp") {
    const flagsList: ReadonlyArray<[keyof FeatureFlags, string, string]> = [
      ["patternMapperEnabled", T("审题模式识别", "Pattern Mapper"), T("编码前定位题型与复杂度", "Pattern & complexity check")],
      ["mockInterviewEnabled", T("模拟面试复盘", "Mock Review"), T("教练页常驻复杂度复盘", "Show review in Coach")],
      ["stylishRankEnabled", T("DMC 段位铭牌", "DMC Rank"), T("手写与样例实时评级", "Live rank gauge")],
      ["starterPackEnabled", T("新手热身题包", "Starter Pack"), T("在题单展示 3 题热身", "Show warmup in Sheets")],
      ["shortcutHintsEnabled", T("快捷键提示", "Shortcut Tips"), T("学会后自动消失", "Auto-graduates once learned")]
    ];
    const ghostModes: ReadonlyArray<[string, string]> = [
      ["adaptive", T("自适应防剧透", "Adaptive")],
      ["fast-syntax", T("快速语法补全", "Fast Syntax")],
      ["manual", T("手动 (Alt+\\)", "Manual (Alt+\\)")],
      ["off", T("关闭", "Off")]
    ];
    const frictionModes: ReadonlyArray<[string, string]> = [
      ["off", T("关闭", "Off")],
      ["multi-choice", T("多选辨错", "Multi-Choice")],
      ["lead-and-reveal", T("先引导后揭示", "Lead & Reveal")]
    ];
    const soundPacks: ReadonlyArray<[string, string]> = [
      ["muted-brown", T("闷声茶轴", "Muted Brown")],
      ["crisp-blue", T("清脆青轴", "Crisp Blue")],
      ["soft-drop", T("轻柔雨滴", "Soft Drop")]
    ];
    const flagsCard = sec(
      T("防剧透与训练开关", "Training Flags"),
      d(
        "c g1",
        fRow(T("行内代码提示", "Ghost Text"), "ghostTextMode", ghostModes, f.ghostTextMode, T("语法补全触发方式", "Completion trigger")) +
          toggleRow("strictWordAccept", T("逐词接受补全", "Strict Word Accept"), T("按 Tab 逐词接受防盲按", "Tab accepts one word"), f.strictWordAccept) +
          fRow(T("主动回忆微摩擦", "Micro-Friction"), "microFriction", frictionModes, f.microFriction, T("补全前简短回忆", "Recall check")) +
          flagsList.map(([k, lb, de]) => toggleRow(k, lb, de, Boolean(f[k]))).join("")
      )
    );

    const langs: ReadonlyArray<[string, string]> = [["cpp", "C++"], ["python", "Python"], ["c", "C"], ["rust", "Rust"], ["java", "Java"], ["generic", T("通用", "Any")]];
    const ov = snap.userOverrides;
    const delHabLbl = E(T("删除习惯", "Delete habit"));
    const habitsList = ov.autocompleteCodeHabits.length
      ? ov.autocompleteCodeHabits
          .map((hb) =>
            d(
              "row",
              h("label", "r g1 f1", `<input class="ck" type="checkbox" data-action="habit-toggle" data-habit-id="${E(hb.id)}"${hb.enabled ? " checked" : ""}>` + badge(hb.language, "m", true) + sp("lt", E(hb.ruleText))) +
                h("button", "bi", icon("del"), `type="button" title="${delHabLbl}" aria-label="${delHabLbl}" data-action="habit-delete" data-habit-id="${E(hb.id)}"`)
            )
          )
          .join("")
      : emptyBox(T("暂无补全习惯，可在下方添加。", "No coding habits yet."));
    const habitsDrawer = drawer(
      "settings-habits",
      T("补全编码习惯", "Coding Habits"),
      habitsList +
        d(
          "field-bar mt1",
          sel(langs, dr(st, "hlang", snap.activeLanguage ?? "cpp"), `data-draft="hlang" aria-label="${E(T("语言", "Lang"))}"`, "sel sc fb-sel") +
            inp("hab", dr(st, "hab"), T("如：优先用 long long", "e.g. Prefer long long"), "in f1 fb-in", "text", ` maxlength="120" aria-label="${E(T("编码习惯", "Habit"))}"`) +
            btn(`${icon("plus")} ${T("添加", "Add")}`, "habit-add", "s", "sm", 'data-role="fb-btn"')
        ),
      cnt(ov.autocompleteCodeHabits.length),
      ov.autocompleteCodeHabits.length > 0
    );

    const audioStateLabel = st.audioState === "running" ? T("已解锁", "Ready") : st.audioState === "suspended" ? T("待解锁", "Paused") : T("未启动", "Idle");
    const audioDrawer = drawer(
      "settings-audio",
      T("打字音与 AC 和弦", "Typing & AC Audio"),
      d(
        "c g1",
        toggleRow("typingSoundEnabled", T("机械打字音", "Typing Sound"), T("失焦自动静音", "Auto-mutes on blur"), f.typingSoundEnabled) +
          fRow(T("轴体音效", "Sound Pack"), "typingSoundPack", soundPacks, f.typingSoundPack) +
          slider("typingSoundVolume", T("打字音量", "Typing Vol"), f.typingSoundVolume) +
          toggleRow("celebrationSoundEnabled", T("AC / 升段和弦", "AC Chime"), T("通过样例或升段轻鸣", "Chime on AC & rank-up"), f.celebrationSoundEnabled) +
          slider("celebrationSoundVolume", T("和弦音量", "Chime Vol"), f.celebrationSoundVolume) +
          d(
            "r rw g1 mt1",
            btn(`${icon("vol")} ${T("试听解锁", "Test Sound")}`, "audio-preview-unlock", "t", "sm", 'data-sound-kind="key_normal"') +
              btn(T("试听和弦", "Chime"), "audio-preview-unlock", "s", "sm", 'data-sound-kind="chime_pass"') +
              btn(`${icon(snap.audioMuted ? "mute" : "vol")} ${snap.audioMuted ? T("取消静音", "Unmute") : T("静音", "Mute")}`, "audio-toggle-mute", "g")
          )
      ),
      badge(audioStateLabel, st.audioState === "running" ? "ok" : "m")
    );

    const visualDrawer = drawer(
      "settings-visual",
      T("新手视觉预设与教程", "Visual Preset & Guide"),
      d("mu", E(T("当前工作区彩虹括号与缩进线，随时还原。", "Workspace rainbow brackets & guides, restorable."))) +
        d(
          "r rw g1 mt1",
          btn(T("应用预设", "Apply"), "starter-apply-visual") +
            btn(T("还原", "Restore"), "starter-restore-visual", "s", "sm", "", !snap.visualPresetApplied) +
            btn(T("新手教程", "Guide"), "starter-open-walkthrough", "g")
        ),
      badge(snap.visualPresetApplied ? T("已应用", "On") : T("未启用", "Off"), snap.visualPresetApplied ? "ok" : "m")
    );

    return presetCard + nav + flagsCard + habitsDrawer + audioDrawer + visualDrawer;
  }

  const provItems: Array<[string, string]> = PROVS.map(([id, zh, en]) => [id, T(zh, en)]);
  const fieldLine = (lbl: string, ctrl: string) => h("label", "ai-field", sp("lx", E(lbl)) + ctrl);
  const roleBox = (r: "chat" | "fim", title: string, ph: string, isSecond = false) => {
    const c = ai[r];
    const p = `ai.${r}.`;
    const curProv = g(`${p}provider`, c.provider);
    const isLocal = curProv === "ollama";
    const keyBadge = isLocal
      ? badge(T("免密本地", "Local"), "ok")
      : badge(c.hasApiKey ? T("密钥已存", "Saved") : T("未配置", "No Key"), c.hasApiKey ? "ok" : "m");
    const keyPh = isLocal ? T("本地免 Key", "Optional") : c.hasApiKey ? T("留空保持已存密钥", "Keep saved key") : T("输入 API Key", "Enter API Key");
    return d(
      isSecond ? "ai-role ai-role-sep" : "ai-role",
      d("r rb g1", sp("ai-role-t", E(title)) + keyBadge) +
        fieldLine(T("服务商", "Provider"), sel(provItems, curProv, `data-draft="${p}provider"`)) +
        fieldLine(T("接口地址", "Base URL"), inp(`${p}baseUrl`, g(`${p}baseUrl`, c.baseUrl), ph, "in mo")) +
        fieldLine(T("模型", "Model"), inp(`${p}model`, g(`${p}model`, c.model), "deepseek-chat", "in mo")) +
        fieldLine("API Key", inp(`${p}apiKey`, g(`${p}apiKey`), keyPh, "in mo", "password"))
    );
  };

  const stepLabel = (s: "models" | "chat" | "fim") => (s === "models" ? T("模型列表", "MODELS") : s === "chat" ? T("对话", "CHAT") : T("补全", "FIM"));
  const hc = snap.lastHealthCheck
    ? d(
        "sub-sep",
        d("r rb", sp("lx fw", T("连通自检", "Health Check")) + badge(snap.lastHealthCheck.ok ? T("通过", "PASS") : T("异常", "FAIL"), snap.lastHealthCheck.ok ? "ok" : "er")) +
          snap.lastHealthCheck.steps
            .map((s) =>
              d(
                "hr",
                d("r g1 rw", badge(stepLabel(s.step), s.ok ? "ok" : "er", l === "en-US") + cnt(`${Math.round(s.latencyMs)}ms`) + (s.code ? badge(s.code, "m", true) : "")) +
                  d("mu", E(s.message)) +
                  (s.remediation ? d("fn", E(s.remediation)) : "")
              )
            )
            .join("")
      )
    : "";

  const aiExtra = h(
    "details",
    "dt",
    h("summary", "", `${icon("chev", 11)} ${E(T("可选：补全模型配置", "Optional: FIM Model"))}`) +
      d("c g2 mt1", roleBox("fim", T("防剧透补全模型", "Anti-Spoiler FIM"), `${DS}beta`)),
    'data-drawer="settings-ai-extra"'
  );

  const cfField = d(
    "ai-role ai-role-sep",
    fieldLine(T("Codeforces 用户名（选填）", "Codeforces Handle"), inp("ai.codeforcesHandle", g("ai.codeforcesHandle", ai.codeforcesHandle), "tourist", "in mo"))
  );

  const aiCard = sec(
    T("AI 模型与平台配置", "AI & Platform"),
    d(
      "c g2",
      roleBox("chat", T("教练对话模型", "Coaching Chat"), `${DS}v1`) +
        cfField +
        aiExtra +
        d(
          "r rw g1",
          btn(T("保存配置", "Save"), "ai-save-config", "p") +
            btn(T("连通自检", "Check"), "ai-health-check")
        ) +
        d(
          "r rw g1",
          sp("lx", T("快捷预设", "Presets")) +
            btn(T("DeepSeek 预设", "DeepSeek"), "ai-fill-deepseek", "g", "xs") +
            btn(T("Ollama 本地", "Ollama"), "ai-fill-ollama", "g", "xs")
        ) +
        hc
    )
  );

  const availCount = snap.toolchains.filter((tc) => tc.available).length;
  const tcBadge = snap.toolchains.length ? badge(`${availCount}/${snap.toolchains.length}`, availCount > 0 ? "ok" : "wn") : badge(T("未检测", "Unchecked"), "m");
  const tcHtml = snap.toolchains.length
    ? tbl(
        `<th>${E(T("语言", "Lang"))}</th><th>${E(T("状态", "Status"))}</th><th>${E(T("详情", "Detail"))}</th>`,
        snap.toolchains
          .map((tc) => `<tr><td class="mo">${E(tc.language)}</td><td>${badge(tc.available ? T("可用", "Ready") : T("缺失", "Missing"), tc.available ? "ok" : "er")}</td><td class="mu">${E(tc.available ? [tc.command, tc.version].filter(Boolean).join(" ") || "ok" : tc.installHint)}</td></tr>`)
          .join("")
      )
    : emptyBox(T("点击「检测」扫描本地编译器。", "Click Detect to probe local compilers."));
  const toolchainDrawer = drawer(
    "settings-toolchain",
    T("本地编译环境检测", "Toolchain Doctor"),
    d("r rb g1", sp("mu", E(T("扫描本地跑样例编译器。", "Probe local compilers."))) + btn(`${icon("ref", 11)} ${T("检测", "Detect")}`, "runner-check-toolchains", "s", "xs")) + d("mt1", tcHtml),
    tcBadge,
    snap.toolchains.length > 0 || f.preset === "starter"
  );

  return presetCard + nav + aiCard + toolchainDrawer;
}
