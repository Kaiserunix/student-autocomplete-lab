const { mkdir, readFile, writeFile } = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const sourcePath = path.join(root, "src", "sidebar", "ProblemBankViewProvider.ts");
const outputPath = path.join(root, ".runtime", "formal-sidebar-fixture.html");

const problem = {
  platform: "luogu",
  id: "P1048",
  title: "采药",
  sourceUrl: "https://www.luogu.com.cn/problem/P1048",
  difficulty: 3,
  tags: ["动态规划", "背包", "状态转移"],
  statement: "辰辰是个天资聪颖的孩子，他的梦想是成为世界上最伟大的医师。给定总时间和若干株草药，每株草药有采集时间与价值，请在规定时间内取得最大价值。",
  inputFormat: "第一行有两个整数 T 和 M。接下来 M 行，每行两个整数，表示采集时间和价值。",
  outputFormat: "输出能够获得的最大总价值。",
  samples: [{ input: "70 3\n71 100\n69 1\n1 2", output: "3" }],
  hint: "把时间看作容量。每株草药只能采一次。"
};

const completedProblem = {
  ...problem,
  id: "P1428",
  title: "小鱼比可爱",
  tags: ["数组", "循环"],
  completedAt: "2026-07-14T11:12:00.000Z",
  completionReason: "completed",
  painSummary: "循环边界 · 数组计数",
  optimizationReport: {
    optimizationNeeded: false
  }
};

const state = {
  type: "problemBankState",
  problems: [problem],
  completedProblems: [completedProblem],
  selectedKey: "luogu:P1048",
  status: "已就绪",
  activeEditor: {
    fileName: "P1048.cpp",
    relativePath: "practice/P1048.cpp",
    languageId: "cpp"
  },
  uiLanguage: "zh",
  aiStatus: {
    providerMode: "openai",
    envPath: "VS Code Settings + SecretStorage",
    autocomplete: {
      configured: true,
      model: "gpt-5.1-codex-mini",
      format: "codex-app-server",
      endpoint: "codex://app-server"
    },
    teaching: {
      configured: true,
      model: "gpt-5.1",
      format: "codex-app-server",
      endpoint: "codex://app-server"
    }
  },
  aiConfig: {
    mode: "openai",
    authMode: "codex-oauth",
    baseUrl: "https://api.openai.com/v1",
    autocompleteBaseUrl: "",
    chatModel: "gpt-5.1",
    autocompleteModel: "gpt-5.1-codex-mini",
    autocompleteFormat: "openai-chat",
    hasApiKey: false
  },
  codexOAuth: {
    auth: {
      status: "signed-in",
      email: "student@example.com",
      planType: "Plus"
    },
    models: [
      { id: "gpt-5.1", displayName: "GPT-5.1" },
      { id: "gpt-5.1-codex-mini", displayName: "GPT-5.1 Codex Mini" }
    ],
    recommendedTeachingModel: "gpt-5.1",
    recommendedAutocompleteModel: "gpt-5.1-codex-mini"
  },
  studentSkill: {
    revision: 7,
    updatedAt: "2026-07-14T11:20:00.000Z",
    hardRules: {
      autocompleteMayReadProblemStatement: false,
      allowFullSolutionAutocomplete: false,
      disabledSkills: []
    },
    skills: {
      "dp-state-definition": {
        name: "dp-state-definition",
        status: "active",
        reason: "连续两道题在状态含义清楚后都能独立写出转移，但初始化仍需要提醒。",
        evidenceCount: 4,
        score: 3.2,
        lastSeen: "2026-07-14T11:12:00.000Z",
        sourcePainPoints: ["状态定义", "初始化"],
        rules: ["先让学生用一句话说清 dp[i] 的含义。", "初始化不直接给答案，先让学生检查空集状态。"],
        examples: [{ problemId: "P1048", topic: "01 背包", source: "solution_score", occurredAt: "2026-07-14T11:12:00.000Z", evidence: "能够解释倒序枚举，但遗漏 dp[0] 的语义。" }]
      },
      "boundary-check": {
        name: "boundary-check",
        status: "candidate",
        reason: "两次出现循环上界与数组长度混淆，证据仍不足以设为强规则。",
        evidenceCount: 2,
        score: 1.4,
        lastSeen: "2026-07-14T10:40:00.000Z",
        sourcePainPoints: ["循环边界"],
        rules: ["提交前让学生指出最后一次合法下标。"],
        examples: [{ problemId: "P1428", topic: "数组计数", source: "diagnosis", occurredAt: "2026-07-14T10:40:00.000Z", evidence: "循环写成 i <= n，访问了 a[n]。" }]
      }
    }
  },
  studentSkillVersions: [
    { versionId: "v7", revision: 7, archivedAt: "2026-07-14T11:20:00.000Z", reason: "solution_score", activeSkillCount: 1, candidateSkillCount: 1, disabledSkillCount: 0 },
    { versionId: "v6", revision: 6, archivedAt: "2026-07-14T10:45:00.000Z", reason: "diagnosis", activeSkillCount: 1, candidateSkillCount: 0, disabledSkillCount: 0 }
  ]
};

function fixtureBootstrap() {
  const params = new URLSearchParams(location.search);
  const view = params.get("view") || "attempt";
  const baseState = JSON.parse(document.getElementById("fixtureState").textContent);
  if (view === "empty") {
    baseState.problems = [];
    baseState.selectedKey = "";
    baseState.status = "还没有张贴题目；选择 Markdown 或从洛谷获取。";
    baseState.activeEditor = undefined;
    baseState.studentSkill = undefined;
    baseState.studentSkillVersions = [];
  }
  let emitted = false;
  const dispatch = (data) => window.dispatchEvent(new MessageEvent("message", { data }));
  const activateView = () => {
    if (view === "problem" || view === "empty") {
      document.getElementById("tabProblem").click();
    }
    if (view === "profile") {
      document.getElementById("tabSkill").click();
    }
    if (view === "account") {
      document.getElementById("accountModelDrawer").open = true;
    }
    if (view === "submission") {
      document.getElementById("ojSubmissionPanel").open = true;
      dispatch({
        type: "ojSubmissionPreview",
        status: "提交预览已生成；尚未发送代码。",
        toolVersion: "12.0.0",
        preview: {
          confirmationId: "preview-1",
          problemKey: "luogu:P1048",
          target: { contestKind: "contest", contestId: 1048, problemIndex: "A", canonicalUrl: "https://codeforces.com/contest/1048/problem/A" },
          editor: { filePath: "practice/P1048.cpp", languageId: "cpp", codeSize: 816 },
          codeforcesHandle: "student_handle",
          expiresAt: "2026-07-14T12:05:00.000Z"
        }
      });
    }
  };
  window.acquireVsCodeApi = () => ({
    postMessage(message) {
      if (!emitted && message.command === "loadProblems") {
        emitted = true;
        setTimeout(() => {
          dispatch(baseState);
          setTimeout(activateView, 20);
        }, 0);
      }
    },
    getState() {
      return undefined;
    },
    setState() {}
  });
}

async function main() {
  const source = await readFile(sourcePath, "utf8");
  const start = source.indexOf("<!DOCTYPE html>");
  const end = source.indexOf("</html>`;", start);
  if (start < 0 || end < 0) {
    throw new Error("Unable to locate the sidebar webview document.");
  }
  let html = source.slice(start, end + "</html>".length);
  html = html
    .replaceAll("${webview.cspSource}", "'self'")
    .replaceAll("${nonce}", "qa")
    .replaceAll("${starterPresetsJson}", "[]")
    .replaceAll("${practiceLanguageOptionsJson}", JSON.stringify([{ id: "cpp", label: "C++17" }, { id: "python", label: "Python 3" }]));
  html = html.replaceAll("\\\\", "\\");
  html = html.replace(
    "</style>",
    ".vscode-dark{--vscode-sideBar-background:#0b1016;--vscode-editor-background:#0b1016;--vscode-editor-foreground:#edf3f7;--vscode-foreground:#d9e2e9;--vscode-descriptionForeground:#8795a2;--vscode-panel-border:#2d3b47;--vscode-input-background:#101821;--vscode-input-foreground:#edf3f7;--vscode-input-border:#344652;--vscode-focusBorder:#45d6e6;--vscode-button-background:#176f7d;--vscode-button-foreground:#f4fdff;--vscode-button-hoverBackground:#208898;--vscode-textLink-foreground:#57d7e5;--vscode-editorWarning-foreground:#e7b85f;--vscode-testing-iconPassed:#78d6a7;--vscode-errorForeground:#ef6b73;--vscode-list-hoverBackground:#17232d;--vscode-editorWidget-background:#111a23;--vscode-disabledForeground:#66727d}</style>"
  );
  html = html.replace('<html lang="zh-CN">', '<html lang="zh-CN" class="vscode-dark">');
  const bootstrapSource = `(${fixtureBootstrap.toString()})();`;
  const fixtureState = JSON.stringify(state).replaceAll("<", "\\u003c");
  html = html.replace(
    /<script nonce="qa">\s*const vscode = acquireVsCodeApi\(\);/,
    `<script id="fixtureState" type="application/json">${fixtureState}</script>\n  <script nonce="qa">${bootstrapSource}</script>\n  <script nonce="qa">\n    const vscode = acquireVsCodeApi();`
  );
  if (!html.includes('id="fixtureState"')) {
    throw new Error("Unable to inject the sidebar fixture bootstrap.");
  }
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, "utf8");
  process.stdout.write(outputPath + "\n");
}

main().catch((error) => {
  process.stderr.write(String(error instanceof Error ? error.stack : error) + "\n");
  process.exitCode = 1;
});
