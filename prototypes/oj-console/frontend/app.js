"use strict";

const body = document.body;
const vscodeApi = typeof acquireVsCodeApi === "function" ? acquireVsCodeApi() : null;
const sessionToken = vscodeApi ? "" : body.dataset.sessionToken || "";
delete body.dataset.sessionToken;

const pendingRequests = new Map();
const finalizedJobs = new Set();
let requestSequence = 0;

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
  confirmButton: document.getElementById("confirmButton"),
  jobIdentity: document.getElementById("jobIdentity"),
  timeline: document.getElementById("timeline"),
  resultPanel: document.getElementById("resultPanel"),
  resultCode: document.getElementById("resultCode"),
  resultState: document.getElementById("resultState"),
  resultMessage: document.getElementById("resultMessage"),
  resultLink: document.getElementById("resultLink"),
  activityLog: document.getElementById("activityLog"),
  palette: document.getElementById("palette"),
  paletteInput: document.getElementById("paletteInput"),
  paletteList: document.getElementById("paletteList"),
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
    placeholder: "https://codeforces.com/contest/1234/problem/A",
    hostPattern: /(^|\.)codeforces\.com$/i
  },
  atcoder: {
    platform: "atcoder",
    label: "AtCoder",
    defaultUrl: "https://atcoder.jp/contests/abc350/tasks/abc350_a",
    placeholder: "https://atcoder.jp/contests/abc350/tasks/abc350_a",
    hostPattern: /(^|\.)atcoder\.jp$/i
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
  toastTimer: null,
  stageTimes: [],
  stageTicker: null,
  currentStageIndex: null,
  paletteOpen: false,
  previewExpiresAt: null,
  expiryTimer: null
};

class ConsoleRequestError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

async function api(path, options = {}) {
  if (vscodeApi) {
    let bridgePayload;
    if (options.bridgeBody !== undefined) {
      bridgePayload = options.bridgeBody;
    } else if (typeof options.body === "string") {
      try {
        bridgePayload = JSON.parse(options.body);
      } catch {
        bridgePayload = undefined;
      }
    }
    const requestId = `ojc-${++requestSequence}`;
    return new Promise((resolve, reject) => {
      pendingRequests.set(requestId, { resolve, reject });
      vscodeApi.postMessage({ type: "ojConsoleRequest", requestId, path, body: bridgePayload });
    });
  }
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

if (vscodeApi) {
  window.addEventListener("message", (event) => {
    const message = event.data;
    if (!message || typeof message !== "object") {
      return;
    }
    if (message.type === "ojConsoleResponse") {
      const pending = pendingRequests.get(message.requestId);
      if (!pending) {
        return;
      }
      pendingRequests.delete(message.requestId);
      if (message.ok) {
        pending.resolve(message.payload);
      } else {
        const error = message.error || {};
        pending.reject(new ConsoleRequestError(
          error.code || "request_failed",
          error.message || "本地请求失败。"
        ));
      }
    } else if (message.type === "ojConsoleJob" && message.job) {
      handleJobView(message.job);
    }
  });
}

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)");

let activeViewTransition = null;

function transitionDom(mutate) {
  if (reduceMotion.matches || !document.startViewTransition) {
    mutate();
    return;
  }
  if (activeViewTransition) {
    activeViewTransition.skipTransition();
  }
  const transition = document.startViewTransition(mutate);
  activeViewTransition = transition;
  transition.finished.catch(() => undefined).finally(() => {
    if (activeViewTransition === transition) {
      activeViewTransition = null;
    }
  });
}

const SCRAMBLE_GLYPHS = "ABCDEF0123456789#$%&*+=";

function scrambleText(element, text) {
  if (element.textContent === text) {
    return;
  }
  cancelAnimationFrame(element._scrambleFrame);
  if (reduceMotion.matches) {
    element.textContent = text;
    return;
  }
  const chars = [...text];
  const resolveAt = chars.map((char, index) => (char === " " ? 0 : 3 + index * 1.6 + Math.random() * 4));
  const total = Math.max(1, ...resolveAt);
  let frame = 0;
  const tick = () => {
    frame += 1;
    element.textContent = chars
      .map((char, index) => (char === " " || frame >= resolveAt[index]
        ? char
        : SCRAMBLE_GLYPHS[(Math.random() * SCRAMBLE_GLYPHS.length) | 0]))
      .join("");
    if (frame <= total) {
      element._scrambleFrame = requestAnimationFrame(tick);
    }
  };
  tick();
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
  if (!button.dataset.idleHtml) {
    button.dataset.idleHtml = button.innerHTML;
  }
  button.disabled = busy;
  button.classList.toggle("is-busy", busy);
  button.innerHTML = busy ? busyText : button.dataset.idleHtml;
}

function setVisible(element, visible) {
  clearTimeout(element._visTimer);
  if (visible) {
    element.classList.remove("is-hidden", "is-leaving");
  } else if (!element.classList.contains("is-hidden")) {
    element.classList.add("is-leaving");
    element._visTimer = setTimeout(() => {
      element.classList.add("is-hidden");
      element.classList.remove("is-leaving");
    }, 200);
  }
}

function formatBytes(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function formatCountdown(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function paintExpiry() {
  const remain = (state.previewExpiresAt || 0) - Date.now();
  elements.previewExpiry.textContent = remain <= 0 ? "EXPIRED" : `EXPIRES ${formatCountdown(remain)}`;
}

function startExpiry(value) {
  stopExpiry();
  state.previewExpiresAt = new Date(value).getTime();
  paintExpiry();
  state.expiryTimer = setInterval(paintExpiry, 500);
}

function stopExpiry() {
  clearInterval(state.expiryTimer);
  state.expiryTimer = null;
  state.previewExpiresAt = null;
}

function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(1)}s`;
}

function paintStageTimes(currentIndex, terminal) {
  const items = Array.from(elements.timeline.children);
  for (const [index, item] of items.entries()) {
    const timeEl = item.querySelector("time");
    const start = state.stageTimes[index];
    const next = state.stageTimes[index + 1];
    if (start == null) {
      timeEl.textContent = "";
    } else if (next != null) {
      timeEl.textContent = formatDuration(next - start);
    } else if (terminal && index === items.length - 1) {
      timeEl.textContent = `Σ ${formatDuration(Date.now() - state.stageTimes[0])}`;
    } else if (index === currentIndex) {
      timeEl.textContent = formatDuration(Date.now() - start);
    } else {
      timeEl.textContent = "";
    }
  }
}

function stopStageTicker() {
  clearInterval(state.stageTicker);
  state.stageTicker = null;
}

function updateActions() {
  const realBlocked = state.mode === "real" && !(state.status && state.status.realModeUnlocked);
  elements.previewButton.disabled = !state.source || realBlocked;
  elements.loginButton.disabled = !(state.status && state.status.realModeUnlocked && state.status.tool.available);
}

function clearOperation() {
  state.preview = null;
  state.activeJobId = null;
  stopStageTicker();
  stopExpiry();
  elements.previewExpiry.textContent = "—";
  setVisible(elements.previewCard, false);
  setVisible(elements.emptyStage, true);
  elements.resultPanel.className = "result-panel is-hidden";
  elements.resultLink.classList.add("is-hidden");
  elements.confirmButton.disabled = false;
  elements.confirmButton.textContent = "确认并执行一次";
  elements.jobIdentity.textContent = "NO ACTIVE JOB";
  resetTimeline();
}

function resetTimeline() {
  state.stageTimes = [];
  state.currentStageIndex = null;
  for (const item of elements.timeline.children) {
    item.classList.remove("is-done", "is-current");
    item.querySelector("time").textContent = "";
  }
}

function setMode(mode) {
  transitionDom(() => {
    state.mode = mode;
    for (const button of document.querySelectorAll("[data-mode]")) {
      const active = button.dataset.mode === mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
    const real = mode === "real";
    setVisible(elements.demoControls, !real);
    setVisible(elements.realGate, real);
    elements.headerMode.textContent = real ? "REAL" : "DEMO";
    scrambleText(elements.modeSequence, real ? "01 / ARMED" : "00 / SAFE");
    elements.modeWarning.textContent = real ? "CAUTION CHANNEL · 确认后可能远程提交" : "SAFE CHANNEL · 不产生远程提交";
    elements.modeWarning.classList.toggle("is-danger", real);
    clearOperation();
    updateActions();
  });
  addActivity("MODE", mode === "real" ? "切换到真实模式，仍需显式解锁。" : "切换到安全演示模式。");
}

function validateProblemUrl() {
  const value = elements.problemUrl.value.trim();
  const profile = platformProfiles[elements.targetPlatform.value] || platformProfiles.codeforces;
  let valid = false;
  if (value) {
    try {
      valid = profile.hostPattern.test(new URL(value).hostname);
    } catch (error) {
      void error;
    }
  }
  const showInvalid = Boolean(value) && !valid;
  if (showInvalid && !elements.problemUrl.classList.contains("is-invalid")) {
    elements.problemUrl.classList.remove("field-shake");
    void elements.problemUrl.offsetWidth;
    elements.problemUrl.classList.add("field-shake");
  }
  elements.problemUrl.classList.toggle("is-invalid", showInvalid);
  return valid;
}

function setPlatform(platform) {
  const profile = platformProfiles[platform] || platformProfiles.codeforces;
  elements.targetPlatform.value = profile.platform;
  elements.problemUrl.value = profile.defaultUrl;
  elements.problemUrl.placeholder = profile.placeholder;
  elements.problemUrl.classList.remove("is-invalid");
  setVisible(elements.handleField, profile.platform === "codeforces");
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
    scrambleText(elements.serverStatus, "LOCAL / ONLINE");
    scrambleText(elements.toolStatus, status.tool.available ? `OJ ${status.tool.version || "READY"}` : "OJ MISSING");
    const unlocked = status.realModeUnlocked;
    elements.gateState.parentElement.classList.toggle("is-unlocked", unlocked);
    scrambleText(elements.gateState, unlocked ? "REAL MODE UNLOCKED" : "REAL MODE LOCKED");
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

function fileToBase64(file) {
  return file.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  });
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
    const source = vscodeApi
      ? await api("/api/source", {
          method: "POST",
          bridgeBody: { fileName: file.name, contentBase64: await fileToBase64(file) }
        })
      : await api("/api/source", {
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
    scrambleText(elements.sourceDigest, `SHA-256 / ${source.digest}`);
    setVisible(elements.sourceTicket, true);
    elements.filePrompt.textContent = "更换源码文件";
    addActivity("SOURCE", `${source.fileName} 已进入临时内存，摘要 ${source.digest}。`);
    showToast("源码元数据已就绪。")
  } catch (error) {
    state.source = null;
    setVisible(elements.sourceTicket, false);
    elements.filePrompt.textContent = "拖入或选择文件";
    showToast(error.message, true);
  }
  updateActions();
}

function renderPreview(preview) {
  setVisible(elements.emptyStage, false);
  setVisible(elements.previewCard, true);
  elements.previewCard.classList.add("is-fresh");
  setTimeout(() => elements.previewCard.classList.remove("is-fresh"), 900);
  startExpiry(preview.expiresAt);
  elements.previewMode.textContent = preview.mode.toUpperCase();
  elements.previewMode.classList.toggle("is-real", preview.mode === "real");
  elements.previewTarget.textContent = preview.target.canonicalUrl;
  elements.previewSource.textContent = preview.source.fileName;
  elements.previewSourceMeta.textContent = `${preview.source.language.toUpperCase()} / ${formatBytes(preview.source.byteSize)}`;
  elements.previewDigest.textContent = "";
  scrambleText(elements.previewDigest, preview.source.digest);
  elements.previewScenario.textContent = preview.mode === "demo" ? scenarioLabels[preview.scenario] : "LIVE / ONE SHOT";
  elements.previewHandle.textContent = preview.target.platform === "codeforces"
    ? preview.codeforcesHandle || "NOT SET"
    : "SUBMISSION LINK ONLY";
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
  if (!validateProblemUrl()) {
    elements.problemUrl.focus();
    showToast("题目链接与所选平台不匹配。", true);
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
  stopExpiry();
  elements.previewExpiry.textContent = "CONSUMED";
  setButtonBusy(elements.confirmButton, true, "正在消费确认…");
  try {
    const accepted = await api("/api/confirm", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirmationId })
    });
    state.activeJobId = accepted.jobId;
    scrambleText(elements.jobIdentity, `JOB / ${accepted.jobId.slice(0, 8).toUpperCase()}`);
    addActivity("CONFIRM", "一次性确认已消费，任务开始执行。")
    if (!vscodeApi) {
      await pollJob(accepted.jobId);
    }
    elements.confirmButton.textContent = "确认已使用";
  } catch (error) {
    addActivity("ERROR", error.message);
    showToast(error.message, true);
    elements.confirmButton.textContent = "确认已失效，请重新预览";
  }
}

function celebrateAccepted() {
  if (reduceMotion.matches) {
    return;
  }
  const rect = elements.resultCode.getBoundingClientRect();
  const originX = rect.left + rect.width / 2;
  const originY = rect.top + rect.height / 2;
  const colors = ["var(--acid)", "var(--cyan)", "#ffffff"];
  for (let i = 0; i < 26; i += 1) {
    const particle = document.createElement("i");
    particle.className = "confetti";
    const angle = Math.random() * Math.PI * 2;
    const distance = 60 + Math.random() * 150;
    const size = 3 + Math.random() * 5;
    particle.style.left = `${originX}px`;
    particle.style.top = `${originY}px`;
    particle.style.width = `${size}px`;
    particle.style.height = `${size * (Math.random() > 0.5 ? 1 : 2.4)}px`;
    particle.style.background = colors[i % colors.length];
    document.body.appendChild(particle);
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 70;
    const spin = (Math.random() * 2 - 1) * 560;
    const flight = particle.animate(
      [
        { transform: "translate(0, 0) rotate(0deg)", opacity: 1 },
        { transform: `translate(${dx}px, ${dy + 130}px) rotate(${spin}deg)`, opacity: 0 }
      ],
      { duration: 950 + Math.random() * 700, easing: "cubic-bezier(.16, .8, .3, 1)" }
    );
    flight.onfinish = () => particle.remove();
  }
}

function handleJobView(job) {
  if (!job || (state.activeJobId !== null && job.jobId !== state.activeJobId)) {
    return;
  }
  state.activeJobId = job.jobId;
  renderJob(job);
  if (terminalStates.has(job.state) && !finalizedJobs.has(job.jobId)) {
    finalizedJobs.add(job.jobId);
    if (job.state === "accepted") {
      celebrateAccepted();
    }
    addActivity("FINAL", `${job.state.toUpperCase()} / ${job.verdict || "NO VERDICT"}`);
    showToast(`任务结束：${job.verdict || job.state}`);
  }
}

async function pollJob(jobId) {
  for (let attempt = 0; attempt < 240 && state.activeJobId === jobId; attempt += 1) {
    const job = await api(`/api/submissions/${encodeURIComponent(jobId)}`);
    handleJobView(job);
    if (terminalStates.has(job.state)) {
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
  const terminal = terminalStates.has(job.state);
  if (!state.stageTimes.length) {
    state.stageTimes.push(Date.now());
  }
  while (state.stageTimes.length <= currentIndex) {
    state.stageTimes.push(Date.now());
  }
  state.currentStageIndex = currentIndex;
  for (const [index, item] of Array.from(elements.timeline.children).entries()) {
    const current = index === currentIndex && !terminal;
    item.classList.toggle("is-done", index < currentIndex || terminal && index === currentIndex);
    item.classList.toggle("is-current", current);
    item.setAttribute("aria-current", current ? "step" : "false");
  }
  paintStageTimes(currentIndex, terminal);
  if (terminal) {
    stopStageTicker();
  } else if (!state.stageTicker) {
    state.stageTicker = setInterval(() => paintStageTimes(state.currentStageIndex ?? 0, false), 500);
  }
  const nextPanelClass = `result-panel is-${job.state}`;
  if (elements.resultPanel.className !== nextPanelClass) {
    elements.resultPanel.className = nextPanelClass;
  }
  scrambleText(elements.resultCode, job.verdict || (terminal ? job.state.slice(0, 2).toUpperCase() : "···"));
  scrambleText(elements.resultState, job.state.toUpperCase());
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

let dragDepth = 0;
window.addEventListener("dragenter", (event) => {
  if (event.dataTransfer && [...event.dataTransfer.types].includes("Files")) {
    dragDepth += 1;
    elements.dropZone.classList.add("is-dragging");
  }
});
window.addEventListener("dragleave", () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) {
    elements.dropZone.classList.remove("is-dragging");
  }
});
window.addEventListener("dragover", (event) => event.preventDefault());
window.addEventListener("drop", (event) => {
  event.preventDefault();
  dragDepth = 0;
  elements.dropZone.classList.remove("is-dragging");
});

for (const digestEl of [elements.sourceDigest, elements.previewDigest]) {
  digestEl.classList.add("copyable");
  digestEl.title = "点击复制摘要";
  digestEl.addEventListener("click", async () => {
    const text = digestEl.textContent.replace(/^SHA-256 \/ /, "");
    try {
      await navigator.clipboard.writeText(text);
      showToast("摘要已复制到剪贴板。");
    } catch (error) {
      void error;
      showToast("复制失败，请手动选择文本。", true);
    }
  });
}
elements.previewButton.addEventListener("click", createPreview);
elements.confirmButton.addEventListener("click", confirmSubmission);
elements.unlockButton.addEventListener("click", unlockRealMode);
elements.loginButton.addEventListener("click", openLoginTerminal);
elements.targetPlatform.addEventListener("change", () => setPlatform(elements.targetPlatform.value));
elements.problemUrl.addEventListener("input", () => {
  clearOperation();
  validateProblemUrl();
});
elements.handle.addEventListener("input", clearOperation);
elements.scenario.addEventListener("change", clearOperation);

let paletteIndex = 0;
let paletteItems = [];

function paletteActions() {
  return [
    { label: "生成安全预览", tag: "RUN", enabled: () => !elements.previewButton.disabled, run: createPreview },
    { label: "确认并执行", tag: "RUN", enabled: () => Boolean(state.preview) && !elements.confirmButton.disabled, run: confirmSubmission },
    { label: "重置当前操作", tag: "RUN", enabled: () => true, run: clearOperation },
    { label: "切换到 DEMO 模式", tag: "MODE", enabled: () => state.mode !== "demo", run: () => setMode("demo") },
    { label: "切换到 REAL 模式", tag: "MODE", enabled: () => state.mode !== "real", run: () => setMode("real") },
    { label: "平台 · Codeforces", tag: "TARGET", enabled: () => elements.targetPlatform.value !== "codeforces", run: () => setPlatform("codeforces") },
    { label: "平台 · AtCoder", tag: "TARGET", enabled: () => elements.targetPlatform.value !== "atcoder", run: () => setPlatform("atcoder") },
    { label: "主题 · 青柠", tag: "THEME", enabled: () => document.body.dataset.theme !== "acid", run: () => setTheme("acid") },
    { label: "主题 · 紫罗兰", tag: "THEME", enabled: () => document.body.dataset.theme !== "violet", run: () => setTheme("violet") },
    { label: "主题 · 琥珀", tag: "THEME", enabled: () => document.body.dataset.theme !== "amber", run: () => setTheme("amber") },
    { label: "主题 · 冰蓝", tag: "THEME", enabled: () => document.body.dataset.theme !== "cyan", run: () => setTheme("cyan") },
    { label: "聚焦解锁短语", tag: "GATE", enabled: () => state.mode === "real", run: () => elements.unlockPhrase.focus() },
    { label: "打开登录终端", tag: "GATE", enabled: () => !elements.loginButton.disabled, run: openLoginTerminal }
  ];
}

function markPaletteActive() {
  const items = Array.from(elements.paletteList.children);
  for (const [index, item] of items.entries()) {
    const active = index === paletteIndex;
    item.classList.toggle("is-active", active);
    item.setAttribute("aria-selected", String(active));
  }
  if (items[paletteIndex]) {
    items[paletteIndex].scrollIntoView({ block: "nearest" });
  }
}

function renderPalette() {
  const query = elements.paletteInput.value.trim().toLowerCase();
  paletteItems = paletteActions().filter((action) => !query || action.label.toLowerCase().includes(query));
  paletteIndex = Math.min(paletteIndex, Math.max(0, paletteItems.length - 1));
  elements.paletteList.textContent = "";
  for (const [index, action] of paletteItems.entries()) {
    const item = document.createElement("li");
    const label = document.createElement("span");
    const tag = document.createElement("em");
    label.textContent = action.label;
    tag.textContent = action.tag;
    item.append(label, tag);
    item.setAttribute("role", "option");
    item.setAttribute("aria-selected", String(index === paletteIndex));
    item.classList.toggle("is-active", index === paletteIndex);
    item.classList.toggle("is-disabled", !action.enabled());
    item.addEventListener("click", () => runPaletteAction(index));
    item.addEventListener("pointermove", () => {
      if (paletteIndex !== index) {
        paletteIndex = index;
        markPaletteActive();
      }
    });
    elements.paletteList.appendChild(item);
  }
}

function runPaletteAction(index) {
  const action = paletteItems[index];
  if (!action || !action.enabled()) {
    return;
  }
  closePalette();
  action.run();
}

function openPalette() {
  state.paletteOpen = true;
  paletteIndex = 0;
  elements.paletteInput.value = "";
  renderPalette();
  elements.palette.classList.remove("is-hidden");
  elements.paletteInput.focus();
}

function closePalette() {
  state.paletteOpen = false;
  elements.palette.classList.add("is-hidden");
}

elements.paletteInput.addEventListener("input", () => {
  paletteIndex = 0;
  renderPalette();
});

elements.paletteInput.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    const delta = event.key === "ArrowDown" ? 1 : -1;
    paletteIndex = (paletteIndex + delta + paletteItems.length) % Math.max(1, paletteItems.length);
    markPaletteActive();
  } else if (event.key === "Enter") {
    event.preventDefault();
    runPaletteAction(paletteIndex);
  }
});

elements.palette.addEventListener("click", (event) => {
  if (event.target === elements.palette) {
    closePalette();
  }
});

document.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    if (state.paletteOpen) {
      closePalette();
    } else {
      openPalette();
    }
    return;
  }
  if (state.paletteOpen) {
    if (event.key === "Escape") {
      event.preventDefault();
      closePalette();
    }
    return;
  }
  if (event.repeat) {
    return;
  }
  const target = event.target;
  const typing = target instanceof HTMLElement
    && (target.tagName === "INPUT" || target.tagName === "SELECT" || target.tagName === "TEXTAREA");
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    if (state.preview && !elements.confirmButton.disabled) {
      confirmSubmission();
    } else if (!elements.previewButton.disabled) {
      createPreview();
    }
    return;
  }
  if (typing) {
    return;
  }
  if (event.key === "Escape") {
    clearOperation();
  } else if (event.key === "d" || event.key === "D") {
    setMode("demo");
  } else if (event.key === "r" || event.key === "R") {
    setMode("real");
  }
});

for (const card of document.querySelectorAll(".glow")) {
  card.addEventListener("pointermove", (event) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    card.style.setProperty("--my", `${event.clientY - rect.top}px`);
  });
}

const tiltTarget = document.querySelector(".mode-console");
if (tiltTarget && matchMedia("(prefers-reduced-motion: no-preference)").matches) {
  tiltTarget.addEventListener("pointermove", (event) => {
    const rect = tiltTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    tiltTarget.style.transform = `perspective(900px) rotateX(${(-y * 3.5).toFixed(2)}deg) rotateY(${(x * 3.5).toFixed(2)}deg)`;
  });
  tiltTarget.addEventListener("pointerleave", () => {
    tiltTarget.style.transform = "";
  });
}

if (!reduceMotion.matches && matchMedia("(pointer: fine)").matches) {
  for (const button of [elements.previewButton, elements.confirmButton]) {
    button.addEventListener("pointermove", (event) => {
      if (button.disabled) {
        return;
      }
      const rect = button.getBoundingClientRect();
      const dx = (event.clientX - rect.left - rect.width / 2) * 0.16;
      const dy = (event.clientY - rect.top - rect.height / 2) * 0.28;
      button.style.transform = `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
    });
    button.addEventListener("pointerleave", () => {
      button.style.transform = "";
    });
  }
}

setTimeout(() => {
  for (const el of document.querySelectorAll(".reveal")) {
    el.classList.remove("reveal", "reveal-one", "reveal-two", "reveal-three");
  }
}, 1400);

const THEME_KEY = "oj-console-theme";

function setTheme(theme, animate = true) {
  const apply = () => {
    document.body.dataset.theme = theme;
    for (const button of document.querySelectorAll(".theme-dock button")) {
      const active = button.dataset.theme === theme;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    }
  };
  if (animate) {
    transitionDom(apply);
  } else {
    apply();
  }
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (error) {
    void error;
  }
}

for (const button of document.querySelectorAll(".theme-dock button")) {
  button.addEventListener("click", () => setTheme(button.dataset.theme));
}

let savedTheme = "acid";
try {
  savedTheme = localStorage.getItem(THEME_KEY) || "acid";
} catch (error) {
  void error;
}
setTheme(savedTheme, false);

setClock();
setInterval(setClock, 1000);
setPlatform("codeforces");
setMode("demo");
addActivity("BOOT", "等待本地服务状态。");
refreshStatus();
