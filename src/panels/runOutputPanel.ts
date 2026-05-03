import * as vscode from 'vscode';

import type { HtmlReportWriter } from '../reports/htmlReportWriter';
import type { ReplayEvent, ReplayRunner, StepDescriptor } from '../runners/replayRunner';
import type { AdFileIndex } from '../services/adFileIndex';
import { codiconStylesheetUri, mediaUri, renderWebviewHtml } from './webviewHtml';

type StepState = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

interface StepView {
  index: number;
  lineNumber: number;
  display: string;
  state: StepState;
  startedAt?: number;
  durationMs?: number;
  stdout?: string;
  stderr?: string;
  errorMessage?: string;
}

interface RunState {
  status: 'idle' | 'running' | 'success' | 'failure' | 'cancelled';
  scriptPath?: string;
  scriptName?: string;
  startedAt?: number;
  durationMs?: number;
  steps: StepView[];
}

interface ListedFile {
  uri: string;
  relativePath: string;
  name: string;
}

type PostedState =
  | { kind: 'list'; files: ListedFile[] }
  | ({ kind: 'run'; reportAvailable: boolean } & RunState);

type IncomingMessage =
  | { readonly type: 'ready' }
  | { readonly type: 'run' }
  | { readonly type: 'run-file'; readonly uri: string }
  | { readonly type: 'cancel' }
  | { readonly type: 'reveal-script' }
  | { readonly type: 'reveal-line'; readonly lineNumber: number }
  | { readonly type: 'show-list' }
  | { readonly type: 'new-file' }
  | { readonly type: 'open-report' };

export class RunOutputPanel implements vscode.WebviewViewProvider, vscode.Disposable {
  static readonly viewId = 'agentDevice.runOutput';

  private view: vscode.WebviewView | undefined;
  private currentView: 'list' | 'run' = 'list';
  private runState: RunState = { status: 'idle', steps: [] };
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly extensionUri: vscode.Uri,
    runner: ReplayRunner,
    private readonly fileIndex: AdFileIndex,
    private readonly reportWriter: HtmlReportWriter,
  ) {
    this.disposables.push(runner.onEvent((event) => this.handleRunnerEvent(event)));
    this.disposables.push(
      this.fileIndex.onDidChange(() => {
        if (this.currentView === 'list') {
          this.postState();
        }
      }),
    );
    this.disposables.push(
      this.reportWriter.onDidWriteReport(() => {
        if (this.currentView === 'run') {
          this.postState();
        }
      }),
    );
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [this.extensionUri],
    };
    view.webview.html = renderHtml(view.webview, this.extensionUri);
    view.webview.onDidReceiveMessage((msg: IncomingMessage) => this.handleMessage(msg));
    void this.fileIndex.ready().then(() => {
      if (this.currentView === 'list') {
        this.postState();
      }
    });
    this.postState();
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private handleRunnerEvent(event: ReplayEvent): void {
    switch (event.type) {
      case 'start':
        this.currentView = 'run';
        this.runState = {
          status: 'running',
          scriptPath: event.scriptPath,
          scriptName: event.scriptName,
          startedAt: event.startedAt,
          steps: event.steps.map(toPendingStep),
        };
        break;
      case 'stepStart': {
        const step = this.runState.steps[event.index];
        if (step) {
          step.state = 'running';
          step.startedAt = event.startedAt;
        }
        break;
      }
      case 'stepSuccess': {
        const step = this.runState.steps[event.index];
        if (step) {
          step.state = 'passed';
          step.durationMs = event.durationMs;
          step.stdout = event.stdout;
        }
        break;
      }
      case 'stepFailure': {
        const step = this.runState.steps[event.index];
        if (step) {
          step.state = 'failed';
          step.durationMs = event.durationMs;
          step.errorMessage = event.error.message;
          step.stderr = event.error.stderr;
        }
        break;
      }
      case 'end':
        this.runState.status = event.status;
        this.runState.durationMs = event.durationMs;
        for (const step of this.runState.steps) {
          if (step.state === 'pending' || step.state === 'running') {
            step.state = 'skipped';
          }
        }
        break;
    }
    this.postState();
  }

  private async handleMessage(msg: IncomingMessage): Promise<void> {
    switch (msg?.type) {
      case 'ready':
        this.postState();
        break;
      case 'run':
        await vscode.commands.executeCommand('agentDevice.runScript');
        break;
      case 'run-file':
        if (msg.uri) {
          await vscode.commands.executeCommand('agentDevice.runScript', vscode.Uri.parse(msg.uri));
        }
        break;
      case 'cancel':
        await vscode.commands.executeCommand('agentDevice.cancelRun');
        break;
      case 'reveal-script':
        if (this.runState.scriptPath) {
          await vscode.window.showTextDocument(vscode.Uri.file(this.runState.scriptPath));
        }
        break;
      case 'reveal-line':
        if (this.runState.scriptPath && typeof msg.lineNumber === 'number') {
          const doc = await vscode.workspace.openTextDocument(
            vscode.Uri.file(this.runState.scriptPath),
          );
          const editor = await vscode.window.showTextDocument(doc);
          const line = Math.max(0, msg.lineNumber - 1);
          editor.revealRange(
            new vscode.Range(line, 0, line, 0),
            vscode.TextEditorRevealType.InCenterIfOutsideViewport,
          );
          editor.selection = new vscode.Selection(line, 0, line, 0);
        }
        break;
      case 'show-list':
        this.currentView = 'list';
        this.postState();
        break;
      case 'new-file':
        await vscode.commands.executeCommand('agentDevice.newScript');
        break;
      case 'open-report':
        await vscode.commands.executeCommand('agentDevice.openLastReport');
        break;
    }
  }

  private postState(): void {
    if (!this.view) {
      return;
    }
    const state: PostedState =
      this.currentView === 'list'
        ? { kind: 'list', files: this.snapshotFiles() }
        : {
            kind: 'run',
            reportAvailable: this.reportWriter.lastReportUri !== undefined,
            ...this.runState,
          };
    this.view.webview.postMessage({ type: 'state', state });
  }

  private snapshotFiles(): ListedFile[] {
    return this.fileIndex.files
      .map(
        (uri): ListedFile => ({
          uri: uri.toString(),
          relativePath: vscode.workspace.asRelativePath(uri),
          name: basename(uri.path),
        }),
      )
      .sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  }
}

function toPendingStep(descriptor: StepDescriptor): StepView {
  return {
    index: descriptor.index,
    lineNumber: descriptor.lineNumber,
    display: descriptor.display,
    state: 'pending',
  };
}

function basename(p: string): string {
  const i = p.lastIndexOf('/');
  return i >= 0 ? p.slice(i + 1) : p;
}

function renderHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  return renderWebviewHtml(webview, {
    title: 'Agent Device — Run Output',
    stylesheets: [
      codiconStylesheetUri(webview, extensionUri),
      mediaUri(webview, extensionUri, 'runOutput.css'),
    ],
    scripts: [
      mediaUri(webview, extensionUri, 'webview-utils.js'),
      mediaUri(webview, extensionUri, 'runOutput.js'),
    ],
    bodyHtml: '<main id="root"><div class="placeholder">Loading…</div></main>',
  });
}
