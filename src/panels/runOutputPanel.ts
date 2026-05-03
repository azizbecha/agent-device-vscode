import * as vscode from 'vscode';

import type { ReplayEvent, ReplayRunner, StepDescriptor } from '../runners/replayRunner';
import type { AdFileIndex } from '../services/adFileIndex';

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
  | ({ kind: 'run' } & RunState);

interface IncomingMessage {
  readonly type:
    | 'ready'
    | 'run'
    | 'run-file'
    | 'cancel'
    | 'reveal-script'
    | 'reveal-line'
    | 'show-list'
    | 'new-file';
  readonly lineNumber?: number;
  readonly uri?: string;
}

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
  ) {
    this.disposables.push(runner.onEvent((event) => this.handleRunnerEvent(event)));
    this.disposables.push(
      this.fileIndex.onDidChange(() => {
        if (this.currentView === 'list') {
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
    }
  }

  private postState(): void {
    if (!this.view) {
      return;
    }
    const state: PostedState =
      this.currentView === 'list'
        ? { kind: 'list', files: this.snapshotFiles() }
        : { kind: 'run', ...this.runState };
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
  const nonce = makeNonce();
  const cssUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'media', 'runOutput.css'),
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
  <title>Agent Device — Run Output</title>
  <link rel="stylesheet" href="${codiconUri}" />
  <link rel="stylesheet" href="${cssUri}" />
</head>
<body>
  <main id="root"><div class="placeholder">Loading…</div></main>
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
  let state = { kind: 'list', files: [] };
  let elapsedTimer = null;
  const expanded = new Set();

  window.addEventListener('message', function (e) {
    if (e.data && e.data.type === 'state') {
      state = e.data.state;
      render();
    }
  });

  function render() {
    if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null; }
    if (state.kind === 'list') {
      renderList();
    } else {
      renderRun();
    }
    bind();
  }

  function renderList() {
    const hasFiles = state.files && state.files.length > 0;
    const header =
      '<div class="list-header">' +
        '<span class="list-title">' +
          (hasFiles
            ? state.files.length + ' .ad ' + (state.files.length === 1 ? 'script' : 'scripts')
            : 'Agent Device') +
        '</span>' +
        '<button id="new-file" class="ghost" title="New from template">' +
          '<i class="codicon codicon-new-file"></i>New' +
        '</button>' +
      '</div>';

    let body;
    if (!hasFiles) {
      body =
        '<div class="empty-state">' +
          '<i class="codicon codicon-file-code empty-icon"></i>' +
          '<h3>No .ad scripts yet</h3>' +
          '<p>Create one from a template, or start from an empty file.</p>' +
          '<button id="new-file-empty">' +
            '<i class="codicon codicon-new-file"></i>Create from template' +
          '</button>' +
        '</div>';
    } else {
      body = '<ol class="files">' +
        state.files.map(function (file) {
          return '<li class="file" data-uri="' + esc(file.uri) + '" title="Run">' +
            '<i class="codicon codicon-file-code"></i>' +
            '<span class="file-path">' + esc(file.relativePath) + '</span>' +
            '<i class="codicon codicon-play file-run-hint" title="Run"></i>' +
          '</li>';
        }).join('') +
      '</ol>';
    }
    root.innerHTML = header + body;
  }

  function renderRun() {
    const back = '<div class="actions"><button id="back" class="ghost"><i class="codicon codicon-arrow-left"></i>Back to list</button></div>';
    const summary = renderSummary();
    const actions = state.status === 'running'
      ? '<div class="actions"><button id="stop"><i class="codicon codicon-debug-stop"></i>Stop</button></div>'
      : (state.status === 'idle'
          ? ''
          : '<div class="actions"><button id="run">Re-run</button></div>');
    const list = state.steps && state.steps.length
      ? '<ol class="steps">' + state.steps.map(renderStep).join('') + '</ol>'
      : '<div class="placeholder">No steps to show.</div>';
    root.innerHTML = back + summary + actions + list;

    if (state.status === 'running' && state.startedAt) {
      const startedAt = state.startedAt;
      elapsedTimer = setInterval(function () {
        const el = document.getElementById('elapsed');
        if (el) el.textContent = formatDuration(Date.now() - startedAt);
        const running = document.querySelector('li.step.running');
        if (running) {
          const stepStartedAtAttr = running.getAttribute('data-started-at');
          if (stepStartedAtAttr) {
            const stepStartedAt = Number(stepStartedAtAttr);
            const dur = running.querySelector('.step-duration');
            if (dur) dur.textContent = formatDuration(Date.now() - stepStartedAt);
          }
        }
      }, 100);
    }
  }

  function renderSummary() {
    const status = statusHtml(state.status);
    const name = state.scriptName ? '<span class="script-name" id="reveal">' + esc(state.scriptName) + '</span>' : '';
    const dur = state.status === 'running'
      ? '<span class="duration" id="elapsed">0ms</span>'
      : (state.durationMs != null ? '<span class="duration">' + formatDuration(state.durationMs) + '</span>' : '');
    return '<div class="summary">' + status + name + dur + '</div>';
  }

  function statusHtml(status) {
    if (status === 'running')   return '<span class="status running"><i class="codicon codicon-loading codicon-modifier-spin"></i>Running</span>';
    if (status === 'success')   return '<span class="status success"><i class="codicon codicon-pass-filled"></i>Pass</span>';
    if (status === 'failure')   return '<span class="status failure"><i class="codicon codicon-error"></i>Fail</span>';
    if (status === 'cancelled') return '<span class="status cancelled"><i class="codicon codicon-circle-slash"></i>Cancelled</span>';
    return '';
  }

  function stepIconHtml(state) {
    if (state === 'pending') return '<span class="step-icon pending"><i class="codicon codicon-circle-large-outline"></i></span>';
    if (state === 'running') return '<span class="step-icon running"><i class="codicon codicon-loading codicon-modifier-spin"></i></span>';
    if (state === 'passed')  return '<span class="step-icon passed"><i class="codicon codicon-pass-filled"></i></span>';
    if (state === 'failed')  return '<span class="step-icon failed"><i class="codicon codicon-error"></i></span>';
    if (state === 'skipped') return '<span class="step-icon skipped"><i class="codicon codicon-circle-slash"></i></span>';
    return '';
  }

  function renderStep(step) {
    const isExpanded = expanded.has(step.index);
    const dur = step.durationMs != null ? formatDuration(step.durationMs) : '';
    const startedAt = step.state === 'running' && step.startedAt ? step.startedAt : '';
    const header =
      '<div class="step-header" data-step="' + step.index + '">' +
        stepIconHtml(step.state) +
        '<span class="step-line" data-line="' + step.lineNumber + '">L' + step.lineNumber + '</span>' +
        '<span class="step-text">' + esc(step.display) + '</span>' +
        '<span class="step-duration">' + dur + '</span>' +
      '</div>';
    const body = isExpanded ? renderStepBody(step) : '';
    return '<li class="step ' + step.state + (isExpanded ? ' expanded' : '') + '"' +
      (startedAt ? ' data-started-at="' + startedAt + '"' : '') + '>' + header + body + '</li>';
  }

  function renderStepBody(step) {
    const parts = [];
    if (step.errorMessage) {
      parts.push(renderOutputBlock('Error', step.errorMessage, 'error'));
    }
    if (step.stderr && step.stderr.trim()) {
      parts.push(renderOutputBlock('stderr', step.stderr.trim(), ''));
    }
    if (step.stdout && step.stdout.trim()) {
      parts.push(renderOutputBlock('stdout', step.stdout.trim(), ''));
    }
    if (parts.length === 0) {
      const placeholder = step.state === 'running' ? 'in progress…' : 'no output';
      parts.push('<div class="step-body"><div class="label-row"><span class="label">' + placeholder + '</span></div></div>');
    }
    return parts.join('');
  }

  function renderOutputBlock(label, text, extraClass) {
    return '<div class="step-body ' + extraClass + '">' +
      '<div class="label-row">' +
        '<span class="label">' + esc(label) + '</span>' +
        '<button class="copy-btn" type="button" title="Copy"><i class="codicon codicon-clippy"></i><span class="copy-label">Copy</span></button>' +
      '</div>' +
      '<pre>' + esc(text) + '</pre>' +
    '</div>';
  }

  function bind() {
    const runBtn = document.getElementById('run');
    if (runBtn) runBtn.addEventListener('click', function () { vscode.postMessage({ type: 'run' }); });

    const stopBtn = document.getElementById('stop');
    if (stopBtn) stopBtn.addEventListener('click', function () { vscode.postMessage({ type: 'cancel' }); });

    const backBtn = document.getElementById('back');
    if (backBtn) backBtn.addEventListener('click', function () { vscode.postMessage({ type: 'show-list' }); });

    const newBtn = document.getElementById('new-file');
    if (newBtn) newBtn.addEventListener('click', function () { vscode.postMessage({ type: 'new-file' }); });
    const newBtnEmpty = document.getElementById('new-file-empty');
    if (newBtnEmpty) newBtnEmpty.addEventListener('click', function () { vscode.postMessage({ type: 'new-file' }); });

    const reveal = document.getElementById('reveal');
    if (reveal) reveal.addEventListener('click', function () { vscode.postMessage({ type: 'reveal-script' }); });

    const fileRows = document.querySelectorAll('li.file');
    fileRows.forEach(function (row) {
      row.addEventListener('click', function () {
        const uri = row.getAttribute('data-uri');
        if (uri) vscode.postMessage({ type: 'run-file', uri: uri });
      });
    });

    const expandableHeaders = document.querySelectorAll('li.step.passed > .step-header, li.step.failed > .step-header, li.step.running > .step-header');
    expandableHeaders.forEach(function (header) {
      header.addEventListener('click', function (e) {
        if (e.target && e.target.classList && e.target.classList.contains('step-line')) {
          return;
        }
        const idx = Number(header.getAttribute('data-step'));
        if (expanded.has(idx)) expanded.delete(idx); else expanded.add(idx);
        render();
      });
    });

    const lineLinks = document.querySelectorAll('.step-line');
    lineLinks.forEach(function (link) {
      link.addEventListener('click', function (e) {
        e.stopPropagation();
        const lineNumber = Number(link.getAttribute('data-line'));
        vscode.postMessage({ type: 'reveal-line', lineNumber: lineNumber });
      });
    });

    const copyButtons = document.querySelectorAll('.copy-btn');
    copyButtons.forEach(function (btn) {
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        const body = btn.closest('.step-body');
        const pre = body && body.querySelector('pre');
        if (!pre) return;
        const text = pre.textContent || '';
        Promise.resolve(navigator.clipboard.writeText(text))
          .then(function () { flashCopied(btn, 'Copied'); })
          .catch(function () { flashCopied(btn, 'Failed'); });
      });
    });
  }

  function flashCopied(btn, label) {
    const span = btn.querySelector('.copy-label');
    if (!span) return;
    btn.classList.add('copied');
    span.textContent = label;
    setTimeout(function () {
      btn.classList.remove('copied');
      span.textContent = 'Copy';
    }, 1200);
  }

  function esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDuration(ms) {
    const value = Math.max(0, Math.floor(ms));
    if (value < 1000) return value + 'ms';
    const seconds = Math.floor(value / 1000);
    if (seconds < 60) return seconds + 's';
    const minutes = Math.floor(seconds / 60);
    const remSeconds = seconds % 60;
    if (minutes < 60) return remSeconds === 0 ? minutes + 'm' : minutes + 'm ' + remSeconds + 's';
    const hours = Math.floor(minutes / 60);
    const remMinutes = minutes % 60;
    return remMinutes === 0 ? hours + 'h' : hours + 'h ' + remMinutes + 'm';
  }

  vscode.postMessage({ type: 'ready' });
})();
`;
