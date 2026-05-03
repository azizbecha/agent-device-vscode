import * as vscode from 'vscode';

import type { AgentDeviceConfig } from '../services/config';
import { codiconStylesheetUri, mediaUri, renderWebviewHtml } from './webviewHtml';

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

type IncomingMessage =
  | { readonly type: 'ready' }
  | {
      readonly type: 'set';
      readonly key: string;
      readonly value: string | boolean;
      readonly scope: Scope;
    }
  | { readonly type: 'reset-field'; readonly key: string; readonly scope: Scope }
  | { readonly type: 'open-native' };

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
  return renderWebviewHtml(webview, {
    title: 'Agent Device — Settings',
    stylesheets: [
      codiconStylesheetUri(webview, extensionUri),
      mediaUri(webview, extensionUri, 'settings.css'),
    ],
    scripts: [
      mediaUri(webview, extensionUri, 'webview-utils.js'),
      mediaUri(webview, extensionUri, 'settings.js'),
    ],
    bodyHtml: '<div id="root"></div>',
    data: { fields: FIELDS },
  });
}
