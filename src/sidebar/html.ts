import type { UiLanguage } from "./stateView";

export interface WebviewDocumentShellInput {
  language: UiLanguage;
  nonce: string;
  cspSource: string;
  style: string;
  body: string;
  script: string;
}

export function createWebviewNonce(now = Date.now()): string {
  return String(now);
}

export function htmlLanguage(language: UiLanguage): "zh-CN" | "en" {
  return language === "en" ? "en" : "zh-CN";
}

export function renderWebviewDocumentShell(input: WebviewDocumentShellInput): string {
  return `<!DOCTYPE html>
<html lang="${htmlLanguage(input.language)}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${input.cspSource} 'nonce-${input.nonce}'; script-src 'nonce-${input.nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style nonce="${input.nonce}">
${input.style}
  </style>
</head>
<body>
${input.body}
  <script nonce="${input.nonce}">
${input.script}
  </script>
</body>
</html>`;
}
