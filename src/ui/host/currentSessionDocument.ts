import { randomBytes } from "node:crypto";

export interface CurrentSessionDocumentInput {
  cspSource: string;
  scriptUri: string;
  styleUri: string;
  nonce: string;
  language: string;
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function createWebviewNonce(): string {
  return randomBytes(32).toString("base64url");
}

export function renderCurrentSessionDocument(
  input: CurrentSessionDocumentInput
): string {
  const cspSource = escapeHtmlAttribute(input.cspSource);
  const nonce = escapeHtmlAttribute(input.nonce);

  return `<!DOCTYPE html>
<html lang="${escapeHtmlAttribute(input.language)}">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource} data:; style-src ${cspSource}; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="${escapeHtmlAttribute(input.styleUri)}">
</head>
<body>
  <div id="root"></div>
  <noscript id="no-script">JavaScript is required to use this view.</noscript>
  <script type="module" nonce="${nonce}" src="${escapeHtmlAttribute(input.scriptUri)}"></script>
</body>
</html>`;
}
