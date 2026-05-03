import * as vscode from 'vscode';

import type { SnapshotIndex, SnapshotRef } from '../services/snapshotIndex';

interface PostedState {
  readonly refs: readonly SnapshotRef[];
  readonly scriptName: string | null;
}

interface IncomingMessage {
  readonly type: 'ready' | 'insert' | 'copy' | 'reveal-script';
  readonly refId?: string;
}

export class SnapshotInspectorPanel implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'agentDevice.snapshotInspector';

  private view: vscode.WebviewView | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly index: SnapshotIndex,
  ) {
    this.disposables.push(this.index.onDidChange(() => this.postState()));
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    view.webview.html = renderHtml(view.webview, this.extensionUri);
    view.webview.onDidReceiveMessage((msg: IncomingMessage) => this.handleMessage(msg));
    this.postState();
  }

  private async handleMessage(msg: IncomingMessage): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this.postState();
        break;
      case 'insert':
        if (msg.refId) {
          await this.insertAtCursor(`@${msg.refId}`);
        }
        break;
      case 'copy':
        if (msg.refId) {
          await vscode.env.clipboard.writeText(`@${msg.refId}`);
        }
        break;
      case 'reveal-script':
        if (this.index.scriptPath) {
          await vscode.window.showTextDocument(vscode.Uri.file(this.index.scriptPath));
        }
        break;
    }
  }

  private async insertAtCursor(text: string): Promise<void> {
    let editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'agent-device') {
      const adEditor = vscode.window.visibleTextEditors.find(
        (e) => e.document.languageId === 'agent-device',
      );
      if (adEditor) {
        await vscode.window.showTextDocument(adEditor.document, adEditor.viewColumn);
        editor = vscode.window.activeTextEditor;
      }
    }
    if (!editor) {
      vscode.window.showInformationMessage('Open a .ad file to insert this ref.');
      return;
    }
    await editor.edit((builder) => {
      builder.insert(editor!.selection.active, text);
    });
  }

  private postState(): void {
    if (!this.view) {
      return;
    }
    const scriptName = this.index.scriptPath ? basename(this.index.scriptPath) : null;
    const state: PostedState = {
      refs: this.index.refs,
      scriptName,
    };
    this.view.webview.postMessage({ type: 'state', state });
  }
}

function basename(p: string): string {
  const i = Math.max(p.lastIndexOf('/'), p.lastIndexOf('\\'));
  return i >= 0 ? p.slice(i + 1) : p;
}

function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = makeNonce();
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'snapshot.css'),
  );
  const codiconUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'node_modules', '@vscode', 'codicons', 'dist', 'codicon.css'),
  );
  const csp = [
    `default-src 'none'`,
    `style-src ${webview.cspSource}`,
    `font-src ${webview.cspSource}`,
    `script-src 'nonce-${nonce}'`,
  ].join('; ');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp};" />
  <title>Agent Device — Snapshot</title>
  <link rel="stylesheet" href="${codiconUri}" />
  <link rel="stylesheet" href="${cssUri}" />
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">${PANEL_JS}</script>
</body>
</html>`;
}

function makeNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

const PANEL_JS = `
(function () {
  const vscode = acquireVsCodeApi();
  const root = document.getElementById('root');
  let state = { refs: [], scriptName: null };
  let query = '';

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'state') {
      state = e.data.state;
      render();
    }
  });

  function render() {
    if (!state.refs || state.refs.length === 0) {
      root.innerHTML = renderEmpty();
      return;
    }
    const summary = state.scriptName
      ? state.refs.length + ' element' + (state.refs.length === 1 ? '' : 's') + ' from ' + esc(state.scriptName)
      : state.refs.length + ' elements';
    root.innerHTML =
      '<div class="toolbar">' +
        '<label class="search">' +
          '<i class="codicon codicon-search"></i>' +
          '<input id="search" type="search" placeholder="Filter by ref, type, label" autocomplete="off" spellcheck="false" />' +
        '</label>' +
      '</div>' +
      '<div class="summary">' + summary + '</div>' +
      '<div class="tree" id="tree">' +
        state.refs.map(renderRow).join('') +
      '</div>';
    bind();
    if (query) {
      const input = document.getElementById('search');
      if (input) input.value = query;
      applyFilter();
    }
  }

  function renderEmpty() {
    return '<div class="empty">' +
      'No snapshot yet.<br>' +
      'Run <code>snapshot -i</code> in your .ad to capture one.' +
    '</div>';
  }

  function renderRow(ref) {
    const padding = (ref.depth || 0) * 12;
    const type = ref.type || '';
    const label = ref.label;
    const haystack = (ref.id + ' ' + type + ' ' + (label || '')).toLowerCase();
    const labelHtml = label
      ? '<span class="label"><span class="label-text">' + esc(label) + '</span><span class="label-type">[' + esc(type) + ']</span></span>'
      : '<span class="label no-label"><span class="label-text">' + esc(type || 'unnamed') + '</span></span>';
    return '<div class="row" data-id="' + esc(ref.id) + '" data-type="' + esc(type) + '" data-search="' + esc(haystack) + '" style="padding-left:' + (6 + padding) + 'px">' +
      '<i class="codicon ' + iconForType(type) + ' icon"></i>' +
      '<span class="ref">@' + esc(ref.id) + '</span>' +
      labelHtml +
      '<span class="actions">' +
        '<button class="action insert" data-action="insert" data-ref="' + esc(ref.id) + '" title="Insert at cursor">→ Insert</button>' +
        '<button class="action copy" data-action="copy" data-ref="' + esc(ref.id) + '" title="Copy"><i class="codicon codicon-clippy"></i></button>' +
      '</span>' +
    '</div>';
  }

  function iconForType(type) {
    switch ((type || '').toLowerCase()) {
      case 'application': return 'codicon-window';
      case 'window':      return 'codicon-window';
      case 'button':      return 'codicon-debug-line-by-line';
      case 'text':
      case 'statictext':  return 'codicon-symbol-string';
      case 'image':       return 'codicon-file-media';
      case 'textfield':
      case 'searchfield': return 'codicon-edit';
      case 'switch':
      case 'toggle':      return 'codicon-circle-large-filled';
      case 'cell':        return 'codicon-symbol-array';
      case 'other':       return 'codicon-symbol-misc';
      default:            return 'codicon-symbol-namespace';
    }
  }

  function bind() {
    document.querySelectorAll('.row').forEach(function (row) {
      row.addEventListener('click', function (e) {
        const target = e.target;
        if (target instanceof HTMLElement && target.closest('.action')) return;
        const refId = row.getAttribute('data-id');
        if (refId) vscode.postMessage({ type: 'insert', refId: refId });
      });
    });

    document.querySelectorAll('[data-action]').forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const action = btn.getAttribute('data-action');
        const refId = btn.getAttribute('data-ref');
        if (!action || !refId) return;
        vscode.postMessage({ type: action, refId: refId });
        if (action === 'copy') {
          flashCopied(btn);
        }
      });
    });

    const search = document.getElementById('search');
    if (search) {
      search.addEventListener('input', function () {
        query = search.value || '';
        applyFilter();
      });
      search.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { search.value = ''; query = ''; applyFilter(); }
      });
    }
  }

  function applyFilter() {
    const q = query.trim().toLowerCase();
    document.querySelectorAll('.row').forEach(function (row) {
      const haystack = row.getAttribute('data-search') || '';
      row.hidden = q.length > 0 && haystack.indexOf(q) === -1;
    });
  }

  function flashCopied(btn) {
    const original = btn.innerHTML;
    btn.classList.add('copied');
    btn.innerHTML = '<i class="codicon codicon-check"></i>';
    setTimeout(function () {
      btn.classList.remove('copied');
      btn.innerHTML = original;
    }, 1200);
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  vscode.postMessage({ type: 'ready' });
})();
`;
