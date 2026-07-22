"use strict";

const body = document.body;
const sessionToken = body.dataset.sessionToken || "";
delete body.dataset.sessionToken;

const elements = {
  serverDot: document.getElementById("serverDot"),
  serverStatus: document.getElementById("serverStatus"),
  toolStatus: document.getElementById("toolStatus"),
  headerMode: document.getElementById("headerMode"),
  clock: document.getElementById("clock"),
  modeSequence: document.getElementById("modeSequence"),
  modeWarning: document.getElementById("modeWarning"),
  fileInput: document.getElementById("fileInput"),
  dropZone: document.getElementById("dropZone"),
  filePrompt: document.getElementById("filePrompt"),
  sourceTicket: document.getElementById("sourceTicket"),
  sourceName: document.getElementById("sourceName"),
  sourceMeta: document.getElementById("sourceMeta"),
  sourceDigest: document.getElementById("sourceDigest"),
  targetPlatform: document.getElementById("targetPlatform"),
  problemUrl: document.getElementById("problemUrl"),
  handleField: document.getElementById("handleField"),
  handle: document.getElementById("handle"),
  scenario: document.getElementById("scenario"),
  demoControls: document.getElementById("demoControls"),
  realGate: document.getElementById("realGate"),
  gateState: document.getElementById("gateState"),
  unlockPhrase: document.getElementById("unlockPhrase"),
  unlockButton: document.getElementById("unlockButton"),
  loginButton: document.getElementById("loginButton"),
  previewButton: document.getElementById("previewButton"),
  emptyStage: document.getElementById("emptyStage"),
  previewCard: document.getElementById("previewCard"),
  previewExpiry: document.getElementById("previewExpiry"),
  previewMode: document.getElementById("previewMode"),
  previewTarget: document.getElementById("previewTarget"),
  previewSource: document.getElementById("previewSource"),
  previewSourceMeta: document.getElementById("previewSourceMeta"),
  previewDigest: document.getElementById("previewDigest"),
  previewScenario: document.getElementById("previewScenario"),
  previewHandle: document.getElementById("previewHandle"),
  confirmTitle: document.getElementById("confirmTitle"),
  confirmNote: document.getElementById("confirmNote"),
  confirmButton: document.getElementById("confirmButton"),
  jobIdentity: document.getElementById("jobIdentity"),
  timeline: document.getElementById("timeline"),
  resultPanel: document.getElementById("resultPanel"),
  resultCode: document.getElementById("resultCode"),
  resultState: document.getElementById("resultState"),
  resultMessage: document.getElementById("resultMessage"),
  resultLink: document.getElementById("resultLink"),
  activityLog: document.getElementById("activityLog"),
  toast: document.getElementById("toast")
};

const scenarioLabels = {
  accepted: "Accepted",
  wrong_answer: "Wrong Answer",
  compile_error: "Compile Error",
  unknown: "Unknown / Timeout",
  login_required: "Login Required"
};

const platformProfiles = {
  codeforces: {
    platform: "codeforces",
    label: "Codeforces",
    defaultUrl: "https://codeforces.com/contest/4/problem/A",
    placeholder: "https://codeforces.com/contest/1234/problem/A"
  },
  atcoder: {
    platform: "atcoder",
    label: "AtCoder",
    defaultUrl: "https://atcoder.jp/contests/abc350/tasks/abc350_a",
    placeholder: "https://atcoder.jp/contests/abc350/tasks/abc350_a"
  }
};

const terminalStates = new Set(["submitted", "accepted", "rejected", "unknown", "failed"]);
const stageIndexes = {
  created: 0,
  submitting: 1,
  queued: 2,
  judging: 3,
  submitted: 4,
  accepted: 4,
  rejected: 4,
  unknown: 4,
  failed: 4
};

const state = {
  mode: "demo",
  source: null,
  preview: null,
  status: null,
  activeJobId: null,
  toastTimer: null
};

class ConsoleRequestError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set("X-OJ-Console-Token", sessionToken);
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const code = payload && payload.error ? payload.error.code : "request_failed";
    const message = payload && payload.error ? payload.error.message : "本地请求失败。";
    throw new ConsoleRequestError(code, message);
  }
  return payload;
}

function setClock() {
  elements.clock.textContent = new Date().toLocaleTimeString("zh-CN", { hour12: false });
}

function showToast(message, isError = false) {
  clearTimeout(state.toastTimer);
  elements.toast.textContent = message;
  elements.toast.classList.toggle("is-error", isError);
  elements.toast.classList.add("is-visible");
  state.toastTimer = setTimeout(() => elements.toast.classList.remove("is-visible"), 3200);
}

function addActivity(label, message) {
  const item = document.createElement("li");
  const time = document.createElement("time");
  const text = document.createElement("span");
  time.textContent = label;
  text.textContent = message;
  item.append(time, text);
  elements.activityLog.prepend(item);
  while (elements.activityLog.children.length > 8) {
    elements.activityLog.lastElementChild.remove();
  }
}

function setButtonBusy(button, busy, busyText) {
  if (!button.dataset.idleText) {
    button.dataset.idleText = button.textContent.trim();
  }
  button.disabled = busy;
  button.textContent = busy ? busyText : button.dataset.idleText;
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function formatExpiry(value) {
  const date = new Date(value);
  return `EXPIRES ${date.toLocaleTimeString("zh-CN", { hour12: false })}`;
}

function updateActions() {
  const realBlocked = state.mode === "real" && !(state.status && state.status.realModeUnlocked);
  elements.previewButton.disabled = !state.source || realBlocked;
  elements.loginButton.disabled = !(state.status && state.status.realModeUnlocked && state.status.tool.available);
}

function clearOperation() {
  state.preview = null;
  state.activeJobId = null;
  elements.previewCard.classList.add("is-hidden");
  elements.emptyStage.classList.remove("is-hidden");
  elements.resultPanel.className = "result-panel is-hidden";
  elements.resultLink.classList.add("is-hidden");
  elements.confirmButton.disabled = false;
  elements.confirmButton.textContent = "确认并执行一次";
  elements.jobIdentity.textContent = "NO ACTIVE JOB";
  resetTimeline();
}

function resetTimeline() {
  for (const item of elements.timeline.children) {
    item.classList.remove("is-done", "is-current");
  }
}

function setMode(mode) {
  state.mode = mode;
  for (const button of document.querySelectorAll("[data-mode]")) {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  const real = mode === "real";
  elements.demoControls.classList.toggle("is-hidden", real);
  elements.realGate.classList.toggle("is-hidden", !real);
  elements.headerMode.textContent = real ? "REAL" : "DEMO";
  elements.modeSequence.textContent = real ? "01 / ARMED" : "00 / SAFE";
  elements.modeWarning.textContent = real ? "CAUTION CHANNEL · 确认后可能远程提交" : "SAFE CHANNEL · 不产生远程提交";
  elements.modeWarning.classList.toggle("is-danger", real);
  clearOperation();
  updateActions();
  addActivity("MODE", real ? "切换到真实模式，仍需显式解锁。" : "切换到安全演示模式。");
}

function setPlatform(platform) {
  const profile = platformProfiles[platform] || platformProfiles.codeforces;
  elements.targetPlatform.value = profile.platform;
  elements.problemUrl.value = profile.defaultUrl;
  elements.problemUrl.placeholder = profile.placeholder;
  elements.handleField.classList.toggle("is-hidden", profile.platform !== "codeforces");
  if (profile.platform !== "codeforces") {
    elements.handle.value = "";
  }
  elements.loginButton.textContent = `登录 ${profile.label}`;
  clearOperation();
  addActivity("PLATFORM", `目标平台切换为 ${profile.label}。`);
}

async function refreshStatus() {
  try {
    const status = await api("/api/status");
    state.status = status;
    elements.serverDot.classList.add("is-online");
    elements.serverStatus.textContent = "LOCAL / ONLINE";
    elements.toolStatus.textContent = status.tool.available ? `OJ ${status.tool.version || "READY"}` : "OJ MISSING";
    const unlocked = status.realModeUnlocked;
    elements.gateState.parentElement.classList.toggle("is-unlocked", unlocked);
    elements.gateState.textContent = unlocked ? "REAL MODE UNLOCKED" : "REAL MODE LOCKED";
    elements.unlockButton.disabled = unlocked;
    elements.unlockPhrase.disabled = unlocked;
    updateActions();
    addActivity("STATUS", status.tool.message);
  } catch (error) {
    elements.serverStatus.textContent = "LOCAL / OFFLINE";
    elements.serverDot.classList.remove("is-online");
    showToast(error.message, true);
  }
}

async function uploadSource(file) {
  if (!file) {
    return;
  }
  if (file.size > 1024 * 1024) {
    showToast("源码文件不能超过 1 MiB。", true);
    return;
  }
  elements.filePrompt.textContent = "正在写入本地内存…";
  clearOperation();
  try {
    const source = await api("/api/source", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "X-Source-Name": file.name
      },
      body: file
    });
    state.source = source;
    elements.sourceName.textContent = source.fileName;
    elements.sourceMeta.textContent = `${source.language.toUpperCase()} · ${formatBytes(source.byteSize)}`;
    elements.sourceDigest.textContent = `SHA-256 / ${source.digest}`;
    elements.sourceTicket.classList.remove("is-hidden");
    elements.filePrompt.textContent = "更换源码文件";
    addActivity("SOURCE", `${source.fileName} 已进入临时内存，摘要 ${source.digest}。`);
    showToast("源码元数据已就绪。")
  } catch (error) {
    state.source = null;
    elements.sourceTicket.classList.add("is-hidden");
    elements.filePrompt.textContent = "拖入或选择文件";
    showToast(error.message, true);
  }
  updateActions();
}

function renderPreview(preview) {
  elements.emptyStage.classList.add("is-hidden");
  elements.previewCard.classList.remove("is-hidden");
  elements.previewExpiry.textContent = formatExpiry(preview.expiresAt);
  elements.previewMode.textContent = preview.mode.toUpperCase();
  elements.previewMode.classList.toggle("is-real", preview.mode === "real");
  elements.previewTarget.textContent = preview.target.canonicalUrl;
  elements.previewSource.textContent = preview.source.fileName;
  elements.previewSourceMeta.textContent = `${preview.source.language.toUpperCase()} / ${formatBytes(preview.source.byteSize)}`;
  elements.previewDigest.textContent = preview.source.digest;
  elements.previewScenario.textContent = preview.mode === "demo" ? scenarioLabels[preview.scenario] : "LIVE / ONE SHOT";
  const platform = platformProfiles[preview.target.platform] || platformProfiles.codeforces;
  elements.previewHandle.textContent = preview.target.platform === "codeforces"
    ? preview.codeforcesHandle || "NOT SET"
    : "SUBMISSION LINK ONLY";
  elements.confirmTitle.textContent = preview.mode === "real" ? `只向 ${platform.label} 提交一次` : "只运行一次演示任务";
  elements.confirmNote.textContent = preview.mode === "real" ? "不会自动重试；模糊结果会标记 UNKNOWN。" : "确认记录两分钟内有效，使用后立即失效。";
  elements.confirmButton.textContent = preview.mode === "real" ? "确认真实提交一次" : "确认并执行一次";
  elements.confirmButton.disabled = false;
}

async function createPreview() {
  if (!state.source) {
    showToast("请先选择源码文件。", true);
    return;
  }
  const problemUrl = elements.problemUrl.value.trim();
  if (!problemUrl) {
    showToast("请填写所选平台的题目链接。", true);
    return;
  }
  setButtonBusy(elements.previewButton, true, "正在固定预览…");
  try {
    const request = {
      sourceId: state.source.sourceId,
      problemUrl,
      platform: elements.targetPlatform.value,
      mode: state.mode
    };
    const handle = elements.handle.value.trim();
    if (elements.targetPlatform.value === "codeforces" && handle) {
      request.codeforcesHandle = handle;
    }
    if (state.mode === "demo") {
      request.scenario = elements.scenario.value;
    }
    const preview = await api("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request)
    });
    state.preview = preview;
    renderPreview(preview);
    addActivity("PREVIEW", `${preview.mode.toUpperCase()} 预览已固定，等待一次性确认。`);
    showToast("预览已生成，请核对后确认。")
    elements.previewCard.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setButtonBusy(elements.previewButton, false, "");
    updateActions();
  }
}

async function confirmSubmission() {
  if (!state.preview) {
    return;
  }
  const confirmationId = state.preview.confirmationId;
  state.preview = null;
  setButtonBusy(elements.confirmButton, true, "正在消费确认…");
  try {
    const accepted = await api("/api/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationId })
    });
    state.activeJobId = accepted.jobId;
    elements.jobIdentity.textContent = `JOB / ${accepted.jobId.slice(0, 8).toUpperCase()}`;
    addActivity("CONFIRM", "一次性确认已消费，任务开始执行。")
    await pollJob(accepted.jobId);
    elements.confirmButton.textContent = "确认已使用";
  } catch (error) {
    addActivity("ERROR", error.message);
    showToast(error.message, true);
    elements.confirmButton.textContent = "确认已失效，请重新预览";
  }
}

async function pollJob(jobId) {
  for (let attempt = 0; attempt < 240 && state.activeJobId === jobId; attempt += 1) {
    const job = await api(`/api/submissions/${encodeURIComponent(jobId)}`);
    renderJob(job);
    if (terminalStates.has(job.state)) {
      addActivity("FINAL", `${job.state.toUpperCase()} / ${job.verdict || "NO VERDICT"}`);
      showToast(`任务结束：${job.verdict || job.state}`);
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (state.activeJobId === jobId) {
    showToast("浏览器等待超时；后端不会自动重试提交。", true);
  }
}

function renderJob(job) {
  const currentIndex = stageIndexes[job.state] ?? 0;
  for (const [index, item] of Array.from(elements.timeline.children).entries()) {
    item.classList.toggle("is-done", index < currentIndex || terminalStates.has(job.state) && index === currentIndex);
    item.classList.toggle("is-current", index === currentIndex && !terminalStates.has(job.state));
  }
  elements.resultPanel.className = `result-panel is-${job.state}`;
  elements.resultCode.textContent = job.verdict || (terminalStates.has(job.state) ? job.state.slice(0, 2).toUpperCase() : "···");
  elements.resultState.textContent = job.state.toUpperCase();
  elements.resultMessage.textContent = job.message;
  if (job.submissionUrl) {
    elements.resultLink.href = job.submissionUrl;
    elements.resultLink.classList.remove("is-hidden");
  } else {
    elements.resultLink.classList.add("is-hidden");
  }
}

async function unlockRealMode() {
  const phrase = elements.unlockPhrase.value;
  setButtonBusy(elements.unlockButton, true, "正在解锁…");
  try {
    await api("/api/real-mode/unlock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phrase })
    });
    elements.unlockPhrase.value = "";
    addActivity("UNLOCK", "当前进程的真实模式已解锁。")
    showToast("真实模式已解锁，重启后会重新锁定。")
    await refreshStatus();
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setButtonBusy(elements.unlockButton, false, "");
    elements.unlockButton.disabled = Boolean(state.status && state.status.realModeUnlocked);
    updateActions();
  }
}

async function openLoginTerminal() {
  setButtonBusy(elements.loginButton, true, "正在打开…");
  try {
    await api("/api/login-terminal", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: elements.targetPlatform.value })
    });
    addActivity("LOGIN", "已请求打开可见 PowerShell 登录终端。")
    showToast("登录终端已打开，请在窗口中完成交互。")
  } catch (error) {
    showToast(error.message, true);
  } finally {
    setButtonBusy(elements.loginButton, false, "");
    updateActions();
  }
}

for (const button of document.querySelectorAll("[data-mode]")) {
  button.addEventListener("click", () => setMode(button.dataset.mode));
}

elements.fileInput.addEventListener("change", () => uploadSource(elements.fileInput.files[0]));
elements.dropZone.addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    elements.fileInput.click();
  }
});

for (const eventName of ["dragenter", "dragover"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("is-dragging");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("is-dragging");
  });
}

elements.dropZone.addEventListener("drop", (event) => uploadSource(event.dataTransfer.files[0]));
elements.previewButton.addEventListener("click", createPreview);
elements.confirmButton.addEventListener("click", confirmSubmission);
elements.unlockButton.addEventListener("click", unlockRealMode);
elements.loginButton.addEventListener("click", openLoginTerminal);
elements.targetPlatform.addEventListener("change", () => setPlatform(elements.targetPlatform.value));
elements.problemUrl.addEventListener("input", clearOperation);
elements.handle.addEventListener("input", clearOperation);
elements.scenario.addEventListener("change", clearOperation);

setClock();
setInterval(setClock, 1000);
setPlatform("codeforces");
setMode("demo");
refreshStatus();
