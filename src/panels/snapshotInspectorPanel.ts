import * as vscode from 'vscode';

import type { SnapshotIndex, SnapshotRef } from '../services/snapshotIndex';
import { codiconStylesheetUri, mediaUri, renderWebviewHtml } from './webviewHtml';

interface PostedState {
  readonly refs: readonly SnapshotRef[];
  readonly scriptName: string | null;
}

type IncomingMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'insert'; readonly refId: string }
  | { readonly type: 'copy'; readonly refId: string }
  | { readonly type: 'reveal-script' };

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
    const cursor = editor.selection.active;
    await editor.edit((builder) => {
      builder.insert(cursor, text);
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
  return renderWebviewHtml(webview, {
    title: 'Agent Device — Snapshot',
    stylesheets: [
      codiconStylesheetUri(webview, extensionUri),
      mediaUri(webview, extensionUri, 'snapshot.css'),
    ],
    scripts: [
      mediaUri(webview, extensionUri, 'webview-utils.js'),
      mediaUri(webview, extensionUri, 'snapshot.js'),
    ],
    bodyHtml: '<div id="root"></div>',
  });
}
