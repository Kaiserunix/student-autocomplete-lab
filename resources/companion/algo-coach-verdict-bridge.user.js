// ==UserScript==
// @name         Algo Coach Verdict Bridge
// @namespace    https://github.com/Kaiserunix/student-autocomplete-lab
// @version      0.1.0
// @description  Read visible official OJ verdicts in your logged-in browser tab and sync them to Algo Coach (no cookies or passwords read).
// @match        https://leetcode.cn/problems/*
// @match        https://leetcode.com/problems/*
// @match        https://leetcode.com/submissions/*
// @match        https://www.luogu.com.cn/record/*
// @match        https://www.luogu.com.cn/problem/*
// @match        https://codeforces.com/*/submission/*
// @match        https://codeforces.com/problemset/status*
// @match        https://codeforces.com/*/status*
// @match        https://atcoder.jp/contests/*/submissions/*
// @match        https://ac.nowcoder.com/acm/contest/view-submission*
// @match        https://ac.nowcoder.com/acm/problem/*
// @match        https://www.nowcoder.com/practice/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// ==/UserScript==

// Template placeholder: use "复制 6 平台回传脚本（油猴）" inside Algo Coach -> 选题 -> 更多来源与工具
// to copy a version pre-filled with your active local port and per-install verdictToken.
(function () {
  "use strict";

  const BRIDGE_URL = "http://127.0.0.1:27121/verdict";
  const VERDICT_TOKEN = "REPLACE_WITH_TOKEN_COPIED_FROM_ALGO_COACH";
  const sentKeys = new Set();

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
        data: body
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
      }).catch(function () {});
    }
  }

  function normalizeVisibleVerdict(text) {
    const t = String(text || "").trim();
    if (!t) return null;
    if (/^(AC|Accepted|通过)$/i.test(t) || /\bAccepted\b/i.test(t) || t.includes("通过") || t.includes("答案正确")) {
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

  function extractLeetCode(host) {
    const platform = host === "leetcode.cn" || host === "www.leetcode.cn" ? "leetcode-cn" : "leetcode-global";
    const resultEl = document.querySelector('[data-e2e-locator="submission-result"]');
    const verdict = resultEl ? normalizeVisibleVerdict(resultEl.textContent) : null;
    if (!verdict) return null;

    const pathMatch = location.pathname.match(/^\/problems\/([a-z0-9-]+)/i);
    const problemLink = document.querySelector('a[href*="/problems/"]');
    const linkMatch = problemLink && problemLink.getAttribute("href")
      ? problemLink.getAttribute("href").match(/\/problems\/([a-z0-9-]+)/i)
      : null;
    const slug = (pathMatch && pathMatch[1]) || (linkMatch && linkMatch[1]);
    if (!slug) return null;

    const subMatch = location.pathname.match(/\/submissions\/(?:detail\/)?(\d+)/);
    return {
      platform: platform,
      sourceId: slug.toLowerCase(),
      problemUrl: "https://" + host.replace(/^www\./, "") + "/problems/" + slug.toLowerCase() + "/",
      submissionUrl: location.href,
      submissionId: subMatch ? subMatch[1] : undefined,
      verdict: verdict
    };
  }

  function extractLuogu() {
    const recMatch = location.pathname.match(/^\/record\/(\d+)/);
    if (!recMatch) return null;
    const statusEl = document.querySelector(".status-name, .lfe-caption, h1");
    const verdict = statusEl ? normalizeVisibleVerdict(statusEl.textContent) : null;
    if (!verdict) return null;

    const probAnchor = document.querySelector('a[href^="/problem/"]');
    const href = probAnchor ? probAnchor.getAttribute("href") || "" : "";
    const pidMatch = href.match(/\/problem\/([A-Za-z0-9_]+)/);
    if (!pidMatch) return null;

    return {
      platform: "luogu",
      sourceId: pidMatch[1],
      problemUrl: "https://www.luogu.com.cn/problem/" + pidMatch[1],
      submissionUrl: location.href,
      submissionId: recMatch[1],
      verdict: verdict
    };
  }

  function extractCodeforces() {
    const subMatch = location.pathname.match(/^\/(?:contest|gym)\/(\d+)\/submission\/(\d+)/);
    if (!subMatch) return null;
    const verdictEl = document.querySelector(".verdict-accepted, .verdict-rejected, span[class*='verdict-']");
    const verdict = verdictEl ? normalizeVisibleVerdict(verdictEl.textContent) : null;
    if (!verdict) return null;

    const probAnchor = document.querySelector('a[href*="/problem/"]');
    const probHref = probAnchor ? probAnchor.getAttribute("href") || "" : "";
    const probMatch = probHref.match(/\/(?:contest|gym)\/(\d+)\/problem\/([A-Za-z0-9]+)/);
    const sourceId = probMatch ? probMatch[1] + probMatch[2].toUpperCase() : undefined;

    return {
      platform: "codeforces",
      sourceId: sourceId,
      problemUrl: probAnchor ? new URL(probHref, location.origin).href : undefined,
      submissionUrl: location.href,
      submissionId: subMatch[2],
      verdict: verdict
    };
  }

  function extractAtCoder() {
    const subMatch = location.pathname.match(/^\/contests\/([a-z0-9_-]+)\/submissions\/(\d+)/i);
    if (!subMatch) return null;
    const labelEl = document.querySelector("#judge-status span.label, td span.label");
    const verdict = labelEl ? normalizeVisibleVerdict(labelEl.textContent) : null;
    if (!verdict) return null;

    const taskAnchor = document.querySelector('a[href*="/tasks/"]');
    const taskHref = taskAnchor ? taskAnchor.getAttribute("href") || "" : "";
    const taskMatch = taskHref.match(/\/contests\/([a-z0-9_-]+)\/tasks\/([a-z0-9_-]+)/i);

    return {
      platform: "atcoder",
      sourceId: taskMatch ? taskMatch[2].toLowerCase() : undefined,
      problemUrl: taskMatch
        ? "https://atcoder.jp/contests/" + taskMatch[1].toLowerCase() + "/tasks/" + taskMatch[2].toLowerCase()
        : undefined,
      submissionUrl: location.href,
      submissionId: subMatch[2],
      verdict: verdict
    };
  }

  function extractNowCoder() {
    const statusEl = document.querySelector(".result-tag, .status-name, .submission-status, [class*='verdict'], [class*='status']");
    const verdict = statusEl ? normalizeVisibleVerdict(statusEl.textContent) : null;
    if (!verdict) return null;

    const acmHrefAnchor = document.querySelector('a[href*="/acm/problem/"], a[href*="/practice/"]');
    const probUrl = acmHrefAnchor ? new URL(acmHrefAnchor.getAttribute("href") || "", location.origin).href : location.href;
    const acmMatch = probUrl.match(/\/acm\/problem\/(\d+)/);

    return {
      platform: "nowcoder",
      sourceId: acmMatch ? "acm-" + acmMatch[1] : undefined,
      problemUrl: probUrl,
      submissionUrl: location.href,
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
    } else if (host === "codeforces.com" || host === "www.codeforces.com") {
      payload = extractCodeforces();
    } else if (host === "atcoder.jp") {
      payload = extractAtCoder();
    } else if (host === "ac.nowcoder.com" || host === "www.nowcoder.com") {
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
