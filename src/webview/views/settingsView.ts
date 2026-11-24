import type { FeatureFlags, PresetMode } from "../../core/contracts";
import { al, ap, badge, btn, cnt, d, drawer, emptyBox, h, inp, sec, sel, sp, subTabs, tbl, toggleRow } from "../dom";
import { LANG_OPTS, tr, type UiLang } from "../i18n";
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
  const T = tr(l);
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
    T("模式预设", "Preset"),
    d(
      "seg-track pr-strip",
      PRESETS.map(([p, zh, en, dzh, den]) =>
        h("button", `pr${f.preset === p ? " pr-a" : ""}`, sp("fw", E(T(zh, en))) + sp("mu", E(T(dzh, den))), `type="button" ${ap(f.preset === p)} data-action="preset-select" data-preset="${p}"`)
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
      ["patternMapperEnabled", T("审题模式", "Pattern Map"), T("编码前识别题型", "Pre-code check")],
      ["mockInterviewEnabled", T("模拟面试复盘", "Mock Review"), T("教练页常驻复盘", "Show in Coach")],
      ["stylishRankEnabled", T("刷题段位铭牌", "Practice Rank"), T("手写与样例实时评级", "Live gauge")],
      ["starterPackEnabled", T("新手热身题包", "Starter Pack"), T("题单展示热身包", "Warmup in Sheets")],
      ["shortcutHintsEnabled", T("快捷键提示", "Shortcut Tips"), T("学会后自动消失", "Auto-graduates")]
    ];
    const tl = (rows: ReadonlyArray<[string, string, string]>): Array<[string, string]> => rows.map(([k, z, e]) => [k, T(z, e)]);
    const ghostModes = tl([["adaptive", "自适应", "Adaptive"], ["fast-syntax", "快速语法", "Fast Syntax"], ["manual", "手动 (Alt+\\)", "Manual (Alt+\\)"], ["off", "关闭", "Off"]]);
    const soundPacks = tl([["muted-brown", "闷声茶轴", "Muted Brown"], ["crisp-blue", "清脆青轴", "Crisp Blue"], ["soft-drop", "轻柔雨滴", "Soft Drop"]]);
    const flagsCard = sec(
      T("防剧透与训练开关", "Training Flags"),
      d(
        "c g1",
        fRow(T("行内提示", "Ghost Text"), "ghostTextMode", ghostModes, f.ghostTextMode, T("触发方式", "Trigger")) +
          toggleRow("strictWordAccept", T("逐词接受", "Strict Word Accept"), T("Tab 逐词防盲按", "One word/Tab"), f.strictWordAccept) +
          flagsList.map(([k, lb, de]) => toggleRow(k, lb, de, Boolean(f[k]))).join("")
      )
    );

    const langs: ReadonlyArray<[string, string]> = [...LANG_OPTS, ["generic", T("通用", "Any")]];
    const habs = snap.userOverrides.autocompleteCodeHabits;
    const delHabAttr = al(T("删除习惯", "Delete habit"));
    const habitsList = habs.length
      ? habs
          .map((hb) =>
            d(
              "row",
              h("label", "r g1 f1", `<input class="ck" type="checkbox" data-action="habit-toggle" data-habit-id="${E(hb.id)}"${hb.enabled ? " checked" : ""}>` + badge(hb.language, "m", true) + sp("lt", E(hb.ruleText))) +
                h("button", "bi", icon("del"), `type="button" ${delHabAttr} data-action="habit-delete" data-habit-id="${E(hb.id)}"`)
            )
          )
          .join("")
      : emptyBox(T("暂无习惯，可在下方添加。", "No habits yet."));
    const habitsDrawer = drawer(
      "settings-habits",
      T("编码习惯", "Coding Habits"),
      habitsList +
        d(
          "field-bar mt1",
          sel(langs, dr(st, "hlang", snap.activeLanguage ?? "cpp"), `data-draft="hlang" aria-label="${E(T("语言", "Lang"))}"`, "sel sc fb-sel") +
            inp("hab", dr(st, "hab"), T("如：优先用 long long", "e.g. Prefer long long"), "in f1 fb-in", "text", ` maxlength="120" aria-label="${E(T("编码习惯", "Habit"))}"`) +
            btn(`${icon("plus")} ${T("添加", "Add")}`, "habit-add", "s", "sm", 'data-role="fb-btn"')
        ),
      cnt(habs.length),
      habs.length > 0
    );

    const audioStateLabel = st.audioState === "running" ? T("已解锁", "Ready") : st.audioState === "suspended" ? T("待解锁", "Paused") : T("未启动", "Idle");
    const audioDrawer = drawer(
      "settings-audio",
      T("打字音与和弦", "Audio"),
      d(
        "c g1",
        toggleRow("typingSoundEnabled", T("打字音", "Typing Sound"), T("失焦自动静音", "Auto-mutes"), f.typingSoundEnabled) +
          fRow(T("音效", "Pack"), "typingSoundPack", soundPacks, f.typingSoundPack) +
          slider("typingSoundVolume", T("打字音量", "Typing Vol"), f.typingSoundVolume) +
          toggleRow("celebrationSoundEnabled", T("AC 和弦", "AC Chime"), T("AC / 升段轻鸣", "Chime on AC"), f.celebrationSoundEnabled) +
          slider("celebrationSoundVolume", T("和弦音量", "Chime Vol"), f.celebrationSoundVolume) +
          d(
            "r rw g1 mt1",
            btn(`${icon("vol")} ${T("试听", "Test")}`, "audio-preview-unlock", "t", "sm", 'data-sound-kind="key_normal"') +
              btn(T("和弦", "Chime"), "audio-preview-unlock", "s", "sm", 'data-sound-kind="chime_pass"') +
              btn(`${icon(snap.audioMuted ? "mute" : "vol")} ${snap.audioMuted ? T("取消静音", "Unmute") : T("静音", "Mute")}`, "audio-toggle-mute", "g")
          )
      ),
      badge(audioStateLabel, st.audioState === "running" ? "ok" : "m")
    );

    const visualDrawer = drawer(
      "settings-visual",
      T("视觉预设与教程", "Visual & Guide"),
      d("mu", E(T("彩虹括号与缩进线。", "Rainbow brackets & guides."))) +
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
    const c = ai[r], p = `ai.${r}.`, qf = (k: string, fb = "") => g(p + k, fb);
    const curProv = qf("provider", c.provider);
    const isLocal = curProv === "ollama";
    const keyBadge = isLocal
      ? badge(T("免密本地", "Local"), "ok")
      : badge(c.hasApiKey ? T("密钥已存", "Saved") : T("未配置", "No Key"), c.hasApiKey ? "ok" : "m");
    const keyPh = isLocal ? T("无需填写", "Optional") : c.hasApiKey ? T("留空保持", "Keep key") : "API Key";
    return d(
      isSecond ? "ai-role ai-role-sep" : "ai-role",
      d("r rb g1", sp("ai-role-t", E(title)) + keyBadge) +
        fieldLine(T("服务商", "Provider"), sel(provItems, curProv, `data-draft="${p}provider"`)) +
        fieldLine(T("接口地址", "Base URL"), inp(`${p}baseUrl`, qf("baseUrl", c.baseUrl), ph, "in mo")) +
        fieldLine(T("模型", "Model"), inp(`${p}model`, qf("model", c.model), "deepseek-chat", "in mo")) +
        fieldLine("API Key", inp(`${p}apiKey`, qf("apiKey"), keyPh, "in mo", "password"))
    );
  };

  const stepLabel = (s: "models" | "chat" | "fim") => (s === "models" ? T("模型列表", "MODELS") : s === "chat" ? T("对话", "CHAT") : T("补全", "COMPLETION"));
  const lhc = snap.lastHealthCheck;
  const hc = lhc
    ? d(
        "sub-sep",
        d("r rb", sp("lx fw", T("连通自检", "Health Check")) + badge(lhc.ok ? T("通过", "PASS") : T("异常", "FAIL"), lhc.ok ? "ok" : "er")) +
          lhc.steps
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
    h("summary", "", `${icon("chev", 11)} ${E(T("可选：补全模型", "Optional: Autocomplete"))}`) +
      d("c g2 mt1", roleBox("fim", T("防剧透补全模型", "Anti-Spoiler Autocomplete"), `${DS}beta`)),
    'data-drawer="settings-ai-extra"'
  );

  const oj = ai.ojHandles;
  const ojRows: Array<[string, string, string, string]> = [
    ["codeforcesHandle", "Codeforces", T("用户名", "Username"), oj?.codeforces ?? ai.codeforcesHandle],
    ["oj.leetcodeCn", T("力扣中国", "LC CN"), T("主页 ID", "Profile ID"), oj?.leetcodeCn ?? ""],
    ["oj.leetcodeGlobal", T("LeetCode 国际", "LC Global"), T("用户名", "Username"), oj?.leetcodeGlobal ?? ""],
    ["oj.atcoder", "AtCoder", T("用户名", "Username"), oj?.atcoder ?? ""]
  ];
  const cfField = d(
    "ai-role ai-role-sep",
    sp("lx", T("OJ 公开用户名", "Public OJ Handles")) +
      d("g2-k", ojRows.map(([k, lbl, ph, fb]) => fieldLine(lbl, inp(`ai.${k}`, g(`ai.${k}`, fb), ph, "in mo"))).join(""))
  );

  const aiCard = sec(
    T("AI 与平台配置", "AI & Platform"),
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

  const tcs = snap.toolchains;
  const availCount = tcs.filter((tc) => tc.available).length;
  const tcBadge = tcs.length ? badge(`${availCount}/${tcs.length}`, availCount > 0 ? "ok" : "wn") : badge(T("未检测", "Unchecked"), "m");
  const tcHtml = tcs.length
    ? tbl(
        `<th>${E(T("语言", "Lang"))}</th><th>${E(T("状态", "Status"))}</th><th>${E(T("详情", "Detail"))}</th>`,
        tcs
          .map((tc) => `<tr><td class="mo">${E(tc.language)}</td><td>${badge(tc.available ? T("可用", "Ready") : T("缺失", "Missing"), tc.available ? "ok" : "er")}</td><td class="mu">${E(tc.available ? [tc.command, tc.version].filter(Boolean).join(" ") || "ok" : tc.installHint)}</td></tr>`)
          .join("")
      )
    : emptyBox(T("点击「检测」扫描编译器。", "Click Detect for compilers."));
  const toolchainDrawer = drawer(
    "settings-toolchain",
    T("本地编译环境", "Local Compilers"),
    d("r rb g1", sp("mu", E(T("扫描本地编译器。", "Probe compilers."))) + btn(`${icon("ref", 11)} ${T("检测", "Detect")}`, "runner-check-toolchains", "s", "xs")) + d("mt1", tcHtml),
    tcBadge,
    tcs.length > 0 || f.preset === "starter"
  );

  return presetCard + nav + aiCard + toolchainDrawer;
}
