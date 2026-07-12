import { Buffer } from "node:buffer";
import { beforeEach, describe, expect, test, vi } from "vitest";

const { randomBytesMock } = vi.hoisted(() => ({
  randomBytesMock: vi.fn()
}));

vi.mock("node:crypto", () => ({
  randomBytes: randomBytesMock
}));

import {
  createWebviewNonce,
  renderCurrentSessionDocument
} from "../../src/ui/host/currentSessionDocument";

describe("current session webview document", () => {
  beforeEach(() => {
    randomBytesMock.mockReset();
  });

  test("renders a locked-down shell with external stylesheet and module script", () => {
    const html = renderCurrentSessionDocument({
      cspSource: "https://webview.example",
      scriptUri: "https://webview.example/current-session.js",
      styleUri: "https://webview.example/current-session.css",
      nonce: "secure-nonce",
      language: "zh-CN"
    });

    expect(html).toContain('<html lang="zh-CN">');
    expect(html).toContain(
      'content="default-src \'none\'; img-src https://webview.example data:; style-src https://webview.example; script-src \'nonce-secure-nonce\';"'
    );
    expect(html).toContain(
      '<link rel="stylesheet" href="https://webview.example/current-session.css">'
    );
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain('<noscript id="no-script">');
    expect(html).toContain(
      '<script type="module" nonce="secure-nonce" src="https://webview.example/current-session.js"></script>'
    );
    const scriptBodies = Array.from(
      html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g),
      (match) => match[1].trim()
    );
    expect(scriptBodies).toEqual([""]);
    expect(html).not.toContain("unsafe-inline");
    expect(html).not.toContain("unsafe-eval");
  });

  test("escapes every caller-provided HTML attribute value", () => {
    const html = renderCurrentSessionDocument({
      cspSource: 'https://webview.example"; worker-src *',
      scriptUri: 'bundle.js" onload="run()&next=<script>',
      styleUri: 'styles.css" onload="run()&next=<style>',
      nonce: 'nonce" onload="run()&next=<nonce>',
      language: 'en" dir="rtl&next=<lang>'
    });

    expect(html).toContain(
      'lang="en&quot; dir=&quot;rtl&amp;next=&lt;lang&gt;"'
    );
    expect(html).toContain(
      'img-src https://webview.example&quot;; worker-src * data:'
    );
    expect(html).toContain(
      'href="styles.css&quot; onload=&quot;run()&amp;next=&lt;style&gt;"'
    );
    expect(html).toContain(
      'nonce="nonce&quot; onload=&quot;run()&amp;next=&lt;nonce&gt;"'
    );
    expect(html).toContain(
      'src="bundle.js&quot; onload=&quot;run()&amp;next=&lt;script&gt;"'
    );
    expect(html).not.toContain('onload="run()');
  });

  test("creates a nonce from cryptographically random bytes", () => {
    const bytes = Buffer.from("0123456789abcdef0123456789abcdef");
    randomBytesMock.mockReturnValue(bytes);

    expect(createWebviewNonce()).toBe(bytes.toString("base64url"));
    expect(randomBytesMock).toHaveBeenCalledOnce();
    expect(randomBytesMock).toHaveBeenCalledWith(32);
  });
});
