import * as vscode from 'vscode';

import type { AgentDeviceConfig } from '../services/config';

type Scope = 'user' | 'workspace';
type FieldType = 'text' | 'boolean';

interface FieldDef {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly type: FieldType;
  readonly placeholder?: string;
}

const FIELDS: readonly FieldDef[] = [
  {
    key: 'cliPath',
    label: 'CLI Path',
    hint: 'Override the agent-device binary path. Leave empty to use the bundled version.',
    type: 'text',
    placeholder: 'bundled',
  },
  {
    key: 'session',
    label: 'Session',
    hint: 'Daemon session name passed to agent-device for replay runs.',
    type: 'text',
    placeholder: 'vscode',
  },
  {
    key: 'androidSdkPath',
    label: 'Android SDK Path',
    hint: 'Override $ANDROID_HOME / $ANDROID_SDK_ROOT for adb and emulator lookup.',
    type: 'text',
    placeholder: '$ANDROID_HOME',
  },
  {
    key: 'report.enabled',
    label: 'Generate HTML reports',
    hint: 'Write a report under .agent-device-reports/ after every run.',
    type: 'boolean',
  },
  {
    key: 'notifications.enabled',
    label: 'Show run-finished popups',
    hint: 'Toast on success/failure. Status bar pill always shows regardless.',
    type: 'boolean',
  },
];

interface FieldSnapshot {
  readonly key: string;
  readonly userValue: string | boolean | undefined;
  readonly workspaceValue: string | boolean | undefined;
  readonly defaultValue: string | boolean | undefined;
}

interface IncomingMessage {
  readonly type: 'ready' | 'set' | 'reset-field' | 'open-native';
  readonly key?: string;
  readonly value?: string | boolean;
  readonly scope?: Scope;
}

export class SettingsPanel implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'agentDevice.settings';

  private view: vscode.WebviewView | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly config: AgentDeviceConfig,
  ) {
    this.disposables.push(this.config.onDidChange(() => this.postSnapshot()));
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
    this.postSnapshot();
  }

  private async handleMessage(msg: IncomingMessage): Promise<void> {
    switch (msg.type) {
      case 'ready':
        this.postSnapshot();
        break;
      case 'set':
        if (typeof msg.key === 'string' && msg.scope) {
          await this.writeSetting(msg.key, msg.value, msg.scope);
        }
        break;
      case 'reset-field':
        if (typeof msg.key === 'string' && msg.scope) {
          await this.writeSetting(msg.key, undefined, msg.scope);
        }
        break;
      case 'open-native':
        await vscode.commands.executeCommand('workbench.action.openSettings', 'agentDevice');
        break;
    }
  }

  private async writeSetting(key: string, value: unknown, scope: Scope): Promise<void> {
    const target =
      scope === 'workspace'
        ? vscode.ConfigurationTarget.Workspace
        : vscode.ConfigurationTarget.Global;
    const cfg = vscode.workspace.getConfiguration('agentDevice');
    const normalized = value === '' ? undefined : value;
    try {
      await cfg.update(key, normalized, target);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      void vscode.window.showErrorMessage(`Failed to update setting: ${message}`);
    }
  }

  private postSnapshot(): void {
    if (!this.view) {
      return;
    }
    const cfg = vscode.workspace.getConfiguration('agentDevice');
    const fields: FieldSnapshot[] = FIELDS.map((field) => {
      const inspected = cfg.inspect<string | boolean>(field.key);
      return {
        key: field.key,
        userValue: inspected?.globalValue,
        workspaceValue: inspected?.workspaceValue,
        defaultValue: inspected?.defaultValue,
      };
    });
    const hasWorkspace = vscode.workspace.workspaceFolders !== undefined;
    this.view.webview.postMessage({ type: 'snapshot', fields, hasWorkspace });
  }
}

function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const nonce = makeNonce();
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'settings.css'),
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

  const fieldDefsJson = JSON.stringify(FIELDS);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp};" />
  <title>Agent Device — Settings</title>
  <link rel="stylesheet" href="${codiconUri}" />
  <link rel="stylesheet" href="${cssUri}" />
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}">window.__AD_FIELDS__ = ${fieldDefsJson};</script>
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
  const fields = window.__AD_FIELDS__ || [];
  let snapshot = [];
  let hasWorkspace = false;
  let scope = (vscode.getState() && vscode.getState().scope) || 'user';

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'snapshot') {
      snapshot = e.data.fields;
      hasWorkspace = !!e.data.hasWorkspace;
      if (!hasWorkspace && scope === 'workspace') scope = 'user';
      render();
    }
  });

  function render() {
    const scopeBar =
      '<div class="scope" role="tablist">' +
        scopeBtn('user', 'User') +
        scopeBtn('workspace', 'Workspace', !hasWorkspace) +
      '</div>';

    const fieldHtml = fields.map(renderField).join('');
    const footer =
      '<div class="footer">' +
        '<button class="link-btn" id="open-native">' +
          'Open in Settings UI →' +
        '</button>' +
      '</div>';
    root.innerHTML = scopeBar + '<div class="fields">' + fieldHtml + '</div>' + footer;
    bind();
  }

  function scopeBtn(value, label, disabled) {
    const selected = scope === value;
    return '<button class="scope-btn" data-scope="' + value + '"' +
      (disabled ? ' disabled' : '') +
      ' aria-selected="' + selected + '" role="tab">' + esc(label) + '</button>';
  }

  function renderField(field) {
    const snap = snapshot.find(function (s) { return s.key === field.key; }) || {};
    const scopeValue = scope === 'user' ? snap.userValue : snap.workspaceValue;
    const otherValue = scope === 'user' ? snap.workspaceValue : snap.userValue;
    const explicitlySet = scopeValue !== undefined;

    const sourceLabel = explicitlySet
      ? '<span class="field-source from-' + scope + '">' + scope + '</span>'
      : (otherValue !== undefined
          ? '<span class="field-source">inherited from ' + (scope === 'user' ? 'workspace' : 'user') + '</span>'
          : '<span class="field-source">default</span>');

    if (field.type === 'boolean') {
      const effective = explicitlySet
        ? !!scopeValue
        : (otherValue !== undefined ? !!otherValue : !!snap.defaultValue);
      return '<div class="field">' +
        '<div class="field-label">' + esc(field.label) + '</div>' +
        '<div class="field-checkbox">' +
          '<input type="checkbox" id="f-' + esc(field.key) + '"' + (effective ? ' checked' : '') + ' />' +
          '<label for="f-' + esc(field.key) + '">' + esc(field.hint) + '</label>' +
        '</div>' +
        sourceLabel +
      '</div>';
    }

    const stringValue = typeof scopeValue === 'string' ? scopeValue : '';
    const placeholder = (typeof otherValue === 'string' && otherValue) || field.placeholder || '';
    const resetBtn = explicitlySet
      ? '<button class="action" data-reset="' + esc(field.key) + '" title="Reset this scope">↺</button>'
      : '';
    return '<div class="field">' +
      '<div class="field-label">' + esc(field.label) + '</div>' +
      '<div class="field-row">' +
        '<input type="text" id="f-' + esc(field.key) + '" value="' + esc(stringValue) + '" placeholder="' + esc(placeholder) + '" />' +
        resetBtn +
      '</div>' +
      '<div class="field-hint">' + esc(field.hint) + '</div>' +
      sourceLabel +
    '</div>';
  }

  function bind() {
    document.querySelectorAll('.scope-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const next = btn.getAttribute('data-scope');
        if (!next || btn.disabled) return;
        scope = next;
        vscode.setState({ scope: scope });
        render();
      });
    });

    fields.forEach(function (field) {
      const el = document.getElementById('f-' + field.key);
      if (!el) return;
      if (field.type === 'boolean') {
        el.addEventListener('change', function () {
          vscode.postMessage({
            type: 'set',
            key: field.key,
            value: el.checked,
            scope: scope,
          });
        });
      } else {
        el.addEventListener('change', function () {
          vscode.postMessage({
            type: 'set',
            key: field.key,
            value: el.value,
            scope: scope,
          });
        });
      }
    });

    document.querySelectorAll('[data-reset]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        const key = btn.getAttribute('data-reset');
        if (!key) return;
        vscode.postMessage({ type: 'reset-field', key: key, scope: scope });
      });
    });

    const native = document.getElementById('open-native');
    if (native) native.addEventListener('click', function () { vscode.postMessage({ type: 'open-native' }); });
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
