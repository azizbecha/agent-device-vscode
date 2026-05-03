import { randomBytes } from 'node:crypto';
import * as vscode from 'vscode';

export interface WebviewHtmlOptions {
  readonly title: string;
  readonly stylesheets: readonly vscode.Uri[];
  readonly scripts: readonly vscode.Uri[];
  readonly bodyHtml: string;
  /**
   * Optional data exposed on `window.AgentDevice.data` before any script runs.
   * Useful for static config that would otherwise need a round-trip postMessage.
   */
  readonly data?: unknown;
}

export function renderWebviewHtml(webview: vscode.Webview, options: WebviewHtmlOptions): string {
  const nonce = makeNonce();
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');
  const styles = options.stylesheets
    .map((uri) => `<link rel="stylesheet" href="${uri}" />`)
    .join('\n  ');
  const dataScript =
    options.data === undefined
      ? ''
      : `<script nonce="${nonce}">window.AgentDevice = window.AgentDevice || {}; window.AgentDevice.data = ${jsonForScript(options.data)};</script>\n  `;
  const scripts = options.scripts
    .map((uri) => `<script nonce="${nonce}" src="${uri}"></script>`)
    .join('\n  ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp};" />
  <title>${escapeTitle(options.title)}</title>
  ${styles}
</head>
<body>
  ${options.bodyHtml}
  ${dataScript}${scripts}
</body>
</html>`;
}

function jsonForScript(value: unknown): string {
  // Block a closing </script> in any embedded string from prematurely terminating
  // the host <script> tag.
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function codiconStylesheetUri(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
): vscode.Uri {
  return webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'),
  );
}

export function mediaUri(
  webview: vscode.Webview,
  extensionUri: vscode.Uri,
  ...segments: string[]
): vscode.Uri {
  return webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, 'media', ...segments));
}

function makeNonce(): string {
  return randomBytes(16).toString('base64');
}

function escapeTitle(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
