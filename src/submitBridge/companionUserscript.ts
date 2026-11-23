export interface CompanionUserscriptConfig {
  port: number;
  token: string;
}

export const COMPANION_USERSCRIPT_FILENAME = "algo-coach-verdict-bridge.user.js";

/**
 * Builds a customized Tampermonkey / Violentmonkey userscript pre-filled with
 * the user's local Algo Coach bridge port and per-installation `verdictToken`.
 * Reads only visible rendered verdict text in the active browser tab (no cookies/credentials).
 */
export function buildCompanionUserscript(config: CompanionUserscriptConfig): string {
  const port =
    Number.isInteger(config.port) && config.port >= 1 && config.port <= 65535
      ? config.port
      : 27121;
  const endpoint = `http://127.0.0.1:${port}/verdict`;
  const tokenJson = JSON.stringify(config.token);
  const endpointJson = JSON.stringify(endpoint);

  return `// ==UserScript==
// @name         Algo Coach Verdict Bridge
// @namespace    https://github.com/Kaiserunix/student-autocomplete-lab
// @version      0.1.0
// @description  Read visible official OJ verdicts in your logged-in browser tab and sync them to Algo Coach (no cookies or passwords read).
// @match        https://leetcode.cn/problems/*
// @match        https://leetcode.cn/submissions/*
// @match        https://leetcode.com/problems/*
// @match        https://leetcode.com/submissions/*
// @match        https://www.luogu.com.cn/record/*
// @match        https://www.luogu.com.cn/problem/*
// @match        https://codeforces.com/*/submission/*
// @match        https://codeforces.com/problemset/submission/*
// @match        https://codeforces.com/problemset/status*
// @match        https://codeforces.com/*/status*
// @match        https://codeforces.com/*/my*
// @match        https://m.codeforces.com/*/submission/*
// @match        https://m.codeforces.com/problemset/status*
// @match        https://m.codeforces.com/*/status*
// @match        https://m.codeforces.com/*/my*
// @match        https://atcoder.jp/contests/*/submissions/*
// @match        https://ac.nowcoder.com/acm/contest/view-submission*
// @match        https://ac.nowcoder.com/acm/contest/*
// @match        https://ac.nowcoder.com/acm/problem/*
// @match        https://www.nowcoder.com/practice/*
// @match        https://nowcoder.com/practice/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// ==/UserScript==

(function () {
  "use strict";

  const BRIDGE_URL = ${endpointJson};
  const VERDICT_TOKEN = ${tokenJson};
  const sentKeys = new Set();

  function warnHttpStatus(status) {
    if (status === 401) {
      console.warn(
        "[Algo Coach] Verdict bridge rejected token (HTTP 401). Please re-copy the userscript from Algo Coach."
      );
    } else if (status >= 400) {
      console.warn(
        "[Algo Coach] Verdict bridge returned HTTP " + status + " (" + BRIDGE_URL + ")."
      );
    }
  }

  function warnNetworkError(detail) {
    console.warn(
      "[Algo Coach] Failed to reach verdict bridge at " + BRIDGE_URL + ". Ensure Algo Coach is running and bridge port matches.",
      detail || ""
    );
  }

  function postVerdict(payload) {
    if (!payload || !payload.verdict || !payload.platform) return;
    const dedupKey = [
      payload.platform,
      payload.sourceId || "",
      payload.submissionId || "",
      payload.verdict
    ].join("|");
    if (sentKeys.has(dedupKey)) return;
    sentKeys.add(dedupKey);

    const body = JSON.stringify(payload);
    if (typeof GM_xmlhttpRequest === "function") {
      GM_xmlhttpRequest({
        method: "POST",
        url: BRIDGE_URL,
        headers: {
          "Content-Type": "application/json",
          "x-algo-coach-token": VERDICT_TOKEN
        },
        data: body,
        onload: function (res) {
          if (res && typeof res.status === "number") {
            warnHttpStatus(res.status);
          }
        },
        onerror: function (err) {
          warnNetworkError(err);
        },
        ontimeout: function () {
          warnNetworkError("Request timed out");
        }
      });
      return;
    }

    if (typeof fetch === "function") {
      fetch(BRIDGE_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-algo-coach-token": VERDICT_TOKEN
        },
        body
      })
        .then(function (res) {
          if (res && !res.ok) {
            warnHttpStatus(res.status);
          }
        })
        .catch(function (err) {
          warnNetworkError(err);
        });
    }
  }

  function normalizeVisibleVerdict(text) {
    const t = String(text || "").trim();
    if (!t || t.includes("通过率")) return null;
    const hasNegativePass = /(?:未|不|部分|未能|没有|尚未)通过/.test(t);
    if (
      !hasNegativePass &&
      (/^(AC|Accepted|通过)$/i.test(t) ||
        /\\bAccepted\\b/i.test(t) ||
        t.includes("通过") ||
        t.includes("答案正确"))
    ) {
      return "AC";
    }
    if (/^(WA|Wrong Answer)$/i.test(t) || /Wrong Answer/i.test(t) || t.includes("解答错误") || t.includes("答案错误")) {
      return "WA";
    }
    if (/^(TLE|Time Limit Exceeded)$/i.test(t) || /Time Limit Exceeded/i.test(t) || t.includes("超出时间限制") || t.includes("运行超时")) {
      return "TLE";
    }
    if (/^(MLE|Memory Limit Exceeded)$/i.test(t) || /Memory Limit Exceeded/i.test(t) || t.includes("超出内存限制") || t.includes("内存超限")) {
      return "MLE";
    }
    if (/^(RE|Runtime Error)$/i.test(t) || /Runtime Error/i.test(t) || t.includes("执行出错") || t.includes("运行错误")) {
      return "RE";
    }
    if (/^(CE|Compile(?:r|ation)? Error)$/i.test(t) || /Compil(?:e|ation) Error/i.test(t) || t.includes("编译出错") || t.includes("编译错误")) {
      return "CE";
    }
    return null;
  }

  function findFirstAnchor(containers, selector, excludeNav) {
    for (let c = 0; c < containers.length; c += 1) {
      const root = containers[c];
      if (!root) continue;
      const list = root.querySelectorAll(selector);
      for (let i = 0; i < list.length; i += 1) {
        const el = list[i];
        if (excludeNav && el.closest("nav, header, [role='navigation']")) continue;
        return el;
      }
    }
    return null;
  }

  function extractLeetCode(host) {
    const platform = host === "leetcode.cn" || host === "www.leetcode.cn" ? "leetcode-cn" : "leetcode-global";
    const resultEl = document.querySelector('[data-e2e-locator="submission-result"]');
    const verdict = resultEl ? normalizeVisibleVerdict(resultEl.textContent) : null;
    if (!verdict) return null;

    const pathMatch = location.pathname.match(/^\\/(?:contest\\/[a-z0-9-]+\\/)?problems\\/([A-Za-z0-9-]+)/i);
    let slug = pathMatch && pathMatch[1] ? pathMatch[1] : null;
    if (!slug) {
      const containers = Array.from(
        document.querySelectorAll('[data-e2e-locator="submission-detail"], main, [class*="submission"]')
      );
      if (containers.length === 0) containers.push(document);
      for (let c = 0; c < containers.length && !slug; c += 1) {
        const anchors = containers[c].querySelectorAll('a[href*="/problems/"]');
        for (let i = 0; i < anchors.length; i += 1) {
          const el = anchors[i];
          if (el.closest("nav, header, [role='navigation']")) continue;
          const href = el.getAttribute("href") || "";
          const m = href.match(/\\/problems\\/([A-Za-z0-9-]+)/i);
          if (m && m[1] && m[1].toLowerCase() !== "all") {
            slug = m[1];
            break;
          }
        }
      }
    }
    if (!slug) return null;

    const normalizedSlug = platform === "leetcode-cn" ? slug : slug.toLowerCase();
    const subMatch = location.pathname.match(/\\/submissions\\/(?:detail\\/)?(\\d+)/);
    return {
      platform: platform,
      sourceId: normalizedSlug,
      problemUrl: "https://" + host.replace(/^www\\./, "") + "/problems/" + normalizedSlug + "/",
      submissionUrl: location.href,
      submissionId: subMatch ? subMatch[1] : undefined,
      verdict: verdict
    };
  }

  function extractLuogu() {
    const recMatch = location.pathname.match(/^\\/record\\/(\\d+)/);
    if (!recMatch) return null;
    const statusEl = document.querySelector(
      ".status-name, .record-status .lfe-caption, .info-rows .lfe-caption, [class*='record'] .status-name"
    );
    const verdict = statusEl ? normalizeVisibleVerdict(statusEl.textContent) : null;
    if (!verdict) return null;

    const probAnchors = document.querySelectorAll('a[href^="/problem/"]');
    let pid = null;
    for (let i = 0; i < probAnchors.length; i += 1) {
      const anchor = probAnchors[i];
      if (anchor.closest("nav, header, [role='navigation']")) continue;
      const href = anchor.getAttribute("href") || "";
      const pidMatch = href.match(/^\\/problem\\/([A-Za-z0-9_]+)(?:[?#]|$)/);
      if (pidMatch && pidMatch[1] && pidMatch[1].toLowerCase() !== "list") {
        pid = pidMatch[1];
        break;
      }
    }
    if (!pid) return null;

    return {
      platform: "luogu",
      sourceId: pid,
      problemUrl: "https://www.luogu.com.cn/problem/" + pid,
      submissionUrl: location.href,
      submissionId: recMatch[1],
      verdict: verdict
    };
  }

  function parseCodeforcesProblemHref(probHref) {
    const m =
      probHref.match(/\\/(contest|gym)\\/(\\d+)\\/problem\\/([A-Za-z0-9]+)/i) ||
      probHref.match(/\\/(problemset)\\/problem\\/(\\d+)\\/([A-Za-z0-9]+)/i);
    if (!m) return null;
    const isGym = m[1].toLowerCase() === "gym";
    return {
      sourceId: (isGym ? "gym:" : "") + m[2] + m[3].toUpperCase(),
      problemUrl: new URL(probHref, location.origin).href
    };
  }

  function extractCodeforces() {
    const subMatch = location.pathname.match(
      /^\\/(?:(contest|gym)\\/(\\d+)|problemset)\\/submission\\/(?:(\\d+)\\/)?(\\d+)/i
    );
    if (subMatch) {
      const container = document.querySelector("#pageContent .datatable, #pageContent") || document;
      const verdictEl = container.querySelector(".verdict-accepted, .verdict-rejected, span[class*='verdict-']");
      const verdict = verdictEl ? normalizeVisibleVerdict(verdictEl.textContent) : null;
      if (!verdict) return null;

      const probAnchor = findFirstAnchor([container], 'a[href*="/problem/"]', true);
      const probHref = probAnchor ? probAnchor.getAttribute("href") || "" : "";
      const parsedProb = probHref ? parseCodeforcesProblemHref(probHref) : null;

      return {
        platform: "codeforces",
        sourceId: parsedProb ? parsedProb.sourceId : undefined,
        problemUrl: parsedProb ? parsedProb.problemUrl : undefined,
        submissionUrl: location.href,
        submissionId: subMatch[4],
        verdict: verdict
      };
    }

    if (/^\\/(?:(?:contest|gym)\\/\\d+\\/(?:my|status)|problemset\\/status)/i.test(location.pathname)) {
      const row = document.querySelector(
        "table.status-frame-datatable tr[data-submission-id], #pageContent tr[data-submission-id]"
      );
      if (!row) return null;

      const verdictEl = row.querySelector(".verdict-accepted, .verdict-rejected, span[class*='verdict-']");
      const verdict = verdictEl ? normalizeVisibleVerdict(verdictEl.textContent) : null;
      if (!verdict) return null;

      const subIdAttr = row.getAttribute("data-submission-id") || "";
      const subAnchor = row.querySelector('a[href*="/submission/"]');
      const subHref = subAnchor ? subAnchor.getAttribute("href") || "" : "";
      const subHrefMatch = subHref.match(/\\/submission\\/(?:\\d+\\/)?(\\d+)/);
      const submissionId = /^\\d+$/.test(subIdAttr) ? subIdAttr : subHrefMatch ? subHrefMatch[1] : undefined;

      const probAnchor = row.querySelector('a[href*="/problem/"]');
      const probHref = probAnchor ? probAnchor.getAttribute("href") || "" : "";
      const parsedProb = probHref ? parseCodeforcesProblemHref(probHref) : null;

      return {
        platform: "codeforces",
        sourceId: parsedProb ? parsedProb.sourceId : undefined,
        problemUrl: parsedProb ? parsedProb.problemUrl : undefined,
        submissionUrl: subHref ? new URL(subHref, location.origin).href : location.href,
        submissionId: submissionId,
        verdict: verdict
      };
    }

    return null;
  }

  function extractAtCoder() {
    const directSub = location.pathname.match(/^\\/contests\\/([a-z0-9_-]+)\\/submissions\\/(\\d+)/i);
    if (directSub) {
      const labelEl = document.querySelector("#judge-status span.label, td span.label");
      const verdict = labelEl ? normalizeVisibleVerdict(labelEl.textContent) : null;
      if (!verdict) return null;

      const taskAnchor = findFirstAnchor([document.querySelector("#main-container") || document], 'a[href*="/tasks/"]', true);
      const taskHref = taskAnchor ? taskAnchor.getAttribute("href") || "" : "";
      const taskMatch = taskHref.match(/\\/contests\\/([a-z0-9_-]+)\\/tasks\\/([a-z0-9_-]+)/i);

      return {
        platform: "atcoder",
        sourceId: taskMatch ? taskMatch[2].toLowerCase() : undefined,
        problemUrl: taskMatch
          ? "https://atcoder.jp/contests/" + taskMatch[1].toLowerCase() + "/tasks/" + taskMatch[2].toLowerCase()
          : undefined,
        submissionUrl: location.href,
        submissionId: directSub[2],
        verdict: verdict
      };
    }

    const meMatch = location.pathname.match(/^\\/contests\\/([a-z0-9_-]+)\\/submissions\\/me(?:\\/|$)/i);
    if (meMatch) {
      const row = document.querySelector("#main-container table tbody tr, table tbody tr");
      if (!row) return null;
      const labelEl = row.querySelector("span.label");
      const verdict = labelEl ? normalizeVisibleVerdict(labelEl.textContent) : null;
      if (!verdict) return null;

      const taskAnchor = row.querySelector('a[href*="/tasks/"]');
      const taskHref = taskAnchor ? taskAnchor.getAttribute("href") || "" : "";
      const taskMatch = taskHref.match(/\\/contests\\/([a-z0-9_-]+)\\/tasks\\/([a-z0-9_-]+)/i);

      const subAnchor = row.querySelector('a[href*="/submissions/"]');
      const subHref = subAnchor ? subAnchor.getAttribute("href") || "" : "";
      const subIdMatch = subHref.match(/\\/submissions\\/(\\d+)/);

      return {
        platform: "atcoder",
        sourceId: taskMatch ? taskMatch[2].toLowerCase() : undefined,
        problemUrl: taskMatch
          ? "https://atcoder.jp/contests/" + taskMatch[1].toLowerCase() + "/tasks/" + taskMatch[2].toLowerCase()
          : undefined,
        submissionUrl: subHref ? new URL(subHref, location.origin).href : location.href,
        submissionId: subIdMatch ? subIdMatch[1] : undefined,
        verdict: verdict
      };
    }

    return null;
  }

  function parseNowCoderProblemUrl(rawUrl) {
    if (!rawUrl) return null;
    try {
      const u = new URL(rawUrl, location.origin);
      const acmMatch = u.pathname.match(/^\\/acm\\/problem\\/(\\d+)/i);
      if (acmMatch) {
        return {
          sourceId: "acm-" + acmMatch[1],
          problemUrl: "https://ac.nowcoder.com/acm/problem/" + acmMatch[1]
        };
      }
      const contestMatch = u.pathname.match(/^\\/acm\\/contest\\/(\\d+)\\/([A-Za-z0-9]+)(?:\\/|$)/i);
      if (contestMatch) {
        const letter = contestMatch[2].toUpperCase();
        return {
          sourceId: "contest-" + contestMatch[1] + "-" + letter,
          problemUrl: "https://ac.nowcoder.com/acm/contest/" + contestMatch[1] + "/" + letter
        };
      }
      const practiceMatch = u.pathname.match(/^\\/(?:practice|questionTerminal)\\/([a-f0-9]+)/i);
      if (practiceMatch) {
        const pid = practiceMatch[1].toLowerCase();
        return {
          sourceId: "practice-" + pid,
          problemUrl: "https://www.nowcoder.com/practice/" + pid
        };
      }
    } catch (_err) {
      return null;
    }
    return null;
  }

  function extractNowCoder() {
    const isViewSubmission = /\\/acm\\/contest\\/view-submission/i.test(location.pathname);
    const selector = isViewSubmission
      ? ".result-tag, .status-name, .submission-status, .judge-status, .submit-result .status, [data-e2e='submission-result']"
      : ".result-tag, .submission-status, .judge-status, .submit-result .status, [data-e2e='submission-result']";
    const candidates = document.querySelectorAll(selector);
    let verdict = null;
    for (let i = 0; i < candidates.length; i += 1) {
      const el = candidates[i];
      if (el.closest("nav, header, [role='navigation'], .question-intr, .subject-describe")) continue;
      const v = normalizeVisibleVerdict(el.textContent);
      if (v) {
        verdict = v;
        break;
      }
    }
    if (!verdict) return null;

    let parsedProb = null;
    const anchors = document.querySelectorAll('a[href*="/acm/problem/"], a[href*="/acm/contest/"], a[href*="/practice/"]');
    for (let i = 0; i < anchors.length; i += 1) {
      const anchor = anchors[i];
      if (anchor.closest("nav, header, [role='navigation']")) continue;
      const candidate = parseNowCoderProblemUrl(anchor.getAttribute("href") || "");
      if (candidate) {
        parsedProb = candidate;
        break;
      }
    }
    if (!parsedProb) {
      parsedProb = parseNowCoderProblemUrl(location.href);
    }
    if (!parsedProb) return null;

    const querySubMatch = location.search.match(/[?&](?:submissionId|submitId|id)=(\\d+)/i);
    const pathSubMatch = location.pathname.match(/\\/(?:view-submission|submission)\\/(\\d+)/i);
    const domSubEl = document.querySelector("[data-submission-id], a[href*='submissionId=']");
    const domSubAttr = domSubEl ? domSubEl.getAttribute("data-submission-id") || "" : "";
    const domSubHref = domSubEl ? domSubEl.getAttribute("href") || "" : "";
    const domSubMatch = domSubHref.match(/submissionId=(\\d+)/i);
    const submissionId =
      (querySubMatch && querySubMatch[1]) ||
      (pathSubMatch && pathSubMatch[1]) ||
      (/^\\d+$/.test(domSubAttr) ? domSubAttr : null) ||
      (domSubMatch && domSubMatch[1]) ||
      undefined;

    return {
      platform: "nowcoder",
      sourceId: parsedProb.sourceId,
      problemUrl: parsedProb.problemUrl,
      submissionUrl: location.href,
      submissionId: submissionId,
      verdict: verdict
    };
  }

  function scanAndSend() {
    const host = location.hostname.toLowerCase();
    let payload = null;
    if (host === "leetcode.cn" || host === "www.leetcode.cn" || host === "leetcode.com" || host === "www.leetcode.com") {
      payload = extractLeetCode(host);
    } else if (host === "www.luogu.com.cn" || host === "luogu.com.cn") {
      payload = extractLuogu();
    } else if (host === "codeforces.com" || host === "www.codeforces.com" || host === "m.codeforces.com") {
      payload = extractCodeforces();
    } else if (host === "atcoder.jp") {
      payload = extractAtCoder();
    } else if (host === "ac.nowcoder.com" || host === "www.nowcoder.com" || host === "nowcoder.com") {
      payload = extractNowCoder();
    }
    if (payload) {
      postVerdict(payload);
    }
  }

  let debounceTimer = null;
  function scheduleScan() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(scanAndSend, 350);
  }

  const observer = new MutationObserver(scheduleScan);
  observer.observe(document.documentElement || document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
  window.addEventListener("load", scheduleScan);
  scheduleScan();
})();
`;
}
