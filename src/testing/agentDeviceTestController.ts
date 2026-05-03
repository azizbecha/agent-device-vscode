import * as vscode from 'vscode';

import type { ReplayEvent, ReplayRunner } from '../runners/replayRunner';
import { parseScript } from '../runners/scriptParser';
import { formatDuration } from '../util/duration';
import { pluralize } from '../util/pluralize';

const FILE_GLOB = '**/*.ad';
const EXCLUDE_GLOB = '**/node_modules/**';

export class AgentDeviceTestController implements vscode.Disposable {
  static readonly id = 'agentDevice';
  static readonly label = 'Agent Device';

  private readonly controller: vscode.TestController;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(private readonly runner: ReplayRunner) {
    this.controller = vscode.tests.createTestController(
      AgentDeviceTestController.id,
      AgentDeviceTestController.label,
    );
    this.disposables.push(this.controller);

    this.controller.createRunProfile(
      'Run',
      vscode.TestRunProfileKind.Run,
      (request, token) => this.handleRunRequest(request, token),
      true,
    );

    void this.discoverInitial();

    const watcher = vscode.workspace.createFileSystemWatcher(FILE_GLOB);
    watcher.onDidCreate((uri) => void this.upsertFile(uri));
    watcher.onDidChange((uri) => void this.repopulate(uri));
    watcher.onDidDelete((uri) => this.removeFile(uri));
    this.disposables.push(watcher);

    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument((doc) => {
        if (doc.languageId === 'agent-device') {
          void this.repopulate(doc.uri, doc.getText());
        }
      }),
    );
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private async discoverInitial(): Promise<void> {
    const uris = await vscode.workspace.findFiles(FILE_GLOB, EXCLUDE_GLOB);
    for (const uri of uris) {
      await this.upsertFile(uri);
    }
  }

  private async upsertFile(uri: vscode.Uri): Promise<void> {
    const id = uri.toString();
    let item = this.controller.items.get(id);
    if (!item) {
      item = this.controller.createTestItem(id, vscode.workspace.asRelativePath(uri), uri);
      this.controller.items.add(item);
    }
    await this.populateChildren(item);
  }

  private async repopulate(uri: vscode.Uri, prefetched?: string): Promise<void> {
    const item = this.controller.items.get(uri.toString());
    if (!item) {
      await this.upsertFile(uri);
      return;
    }
    await this.populateChildren(item, prefetched);
  }

  private async populateChildren(fileItem: vscode.TestItem, prefetched?: string): Promise<void> {
    if (!fileItem.uri) {
      return;
    }
    let text: string;
    if (prefetched !== undefined) {
      text = prefetched;
    } else {
      try {
        const buffer = await vscode.workspace.fs.readFile(fileItem.uri);
        text = new TextDecoder('utf-8').decode(buffer);
      } catch {
        return;
      }
    }
    const parsed = parseScript(text);
    fileItem.children.replace(
      parsed.actions.map((action) => {
        const childId = `${fileItem.id}#L${action.lineNumber}`;
        const label = action.raw;
        const child = this.controller.createTestItem(childId, label, fileItem.uri);
        const lineIdx = Math.max(0, action.lineNumber - 1);
        child.range = new vscode.Range(lineIdx, 0, lineIdx, action.raw.length);
        return child;
      }),
    );
  }

  private removeFile(uri: vscode.Uri): void {
    this.controller.items.delete(uri.toString());
  }

  private async handleRunRequest(
    request: vscode.TestRunRequest,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const fileItems = collectFileItems(this.controller, request);
    const run = this.controller.createTestRun(request);

    try {
      for (const fileItem of fileItems) {
        if (token.isCancellationRequested) {
          run.skipped(fileItem);
          fileItem.children.forEach((child) => run.skipped(child));
          continue;
        }
        await this.runOneFile(run, fileItem, token);
      }
    } finally {
      run.end();
    }
  }

  private async runOneFile(
    run: vscode.TestRun,
    fileItem: vscode.TestItem,
    token: vscode.CancellationToken,
  ): Promise<void> {
    if (!fileItem.uri) {
      run.skipped(fileItem);
      return;
    }

    const childByLine = new Map<number, vscode.TestItem>();
    fileItem.children.forEach((child) => {
      if (child.range) {
        childByLine.set(child.range.start.line + 1, child);
      }
    });

    run.started(fileItem);
    fileItem.children.forEach((child) => run.enqueued(child));

    const handledChildren = new Set<string>();
    let stepLineByIndex: readonly number[] = [];
    let firstFailure: { message: string; stack?: string } | null = null;
    const startedAt = Date.now();

    const subscription = this.runner.onEvent((event) => {
      handleEventForRun({
        event,
        run,
        fileItem,
        childByLine,
        handledChildren,
        getStepLine: (index) => stepLineByIndex[index],
        setStepLines: (lines) => { stepLineByIndex = lines; },
        onFailure: (failure) => {
          if (!firstFailure) {
            firstFailure = failure;
          }
        },
      });
    });

    try {
      await this.runner.run(fileItem.uri.fsPath, { token });
      const durationMs = Date.now() - startedAt;
      fileItem.children.forEach((child) => {
        if (!handledChildren.has(child.id)) {
          run.skipped(child);
        }
      });
      if (token.isCancellationRequested) {
        run.skipped(fileItem);
      } else if (firstFailure) {
        run.failed(fileItem, buildTestMessage(firstFailure, fileItem), durationMs);
      } else {
        run.passed(fileItem, durationMs);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      run.failed(fileItem, new vscode.TestMessage(message), Date.now() - startedAt);
    } finally {
      subscription.dispose();
    }
  }
}

interface EventRouter {
  readonly event: ReplayEvent;
  readonly run: vscode.TestRun;
  readonly fileItem: vscode.TestItem;
  readonly childByLine: ReadonlyMap<number, vscode.TestItem>;
  readonly handledChildren: Set<string>;
  readonly getStepLine: (index: number) => number | undefined;
  readonly setStepLines: (lines: readonly number[]) => void;
  readonly onFailure: (failure: { message: string; stack?: string }) => void;
}

function handleEventForRun(ctx: EventRouter): void {
  const { event, run, fileItem, childByLine, handledChildren } = ctx;
  switch (event.type) {
    case 'start':
      ctx.setStepLines(event.steps.map((s) => s.lineNumber));
      run.appendOutput(`▶ ${fileItem.label} (${pluralize(event.steps.length, 'step')})\r\n`, undefined, fileItem);
      break;
    case 'stepStart': {
      const child = childForStep(childByLine, ctx.getStepLine(event.index));
      if (child) {
        run.started(child);
      }
      run.appendOutput(`  step ${pad(event.index + 1)} …\r\n`, undefined, fileItem);
      break;
    }
    case 'stepSuccess': {
      const child = childForStep(childByLine, ctx.getStepLine(event.index));
      if (child) {
        run.passed(child, event.durationMs);
        handledChildren.add(child.id);
      }
      run.appendOutput(
        `  step ${pad(event.index + 1)} ✓ ${formatDuration(event.durationMs)}\r\n`,
        undefined,
        fileItem,
      );
      break;
    }
    case 'stepFailure': {
      const child = childForStep(childByLine, ctx.getStepLine(event.index));
      if (child) {
        run.failed(child, new vscode.TestMessage(event.error.message), event.durationMs);
        handledChildren.add(child.id);
      }
      ctx.onFailure({ message: event.error.message, stack: event.error.stderr });
      run.appendOutput(
        `  step ${pad(event.index + 1)} ✗ ${formatDuration(event.durationMs)} — ${event.error.message}\r\n`,
        undefined,
        fileItem,
      );
      break;
    }
    case 'end':
      run.appendOutput(
        `── ${event.status} in ${formatDuration(event.durationMs)}\r\n`,
        undefined,
        fileItem,
      );
      break;
  }
}

function childForStep(
  childByLine: ReadonlyMap<number, vscode.TestItem>,
  lineNumber: number | undefined,
): vscode.TestItem | undefined {
  return lineNumber != null ? childByLine.get(lineNumber) : undefined;
}

function buildTestMessage(
  failure: { message: string; stack?: string },
  fileItem: vscode.TestItem,
): vscode.TestMessage {
  const message = new vscode.TestMessage(
    failure.stack ? `${failure.message}\n\n${failure.stack}` : failure.message,
  );
  if (fileItem.uri) {
    message.location = new vscode.Location(fileItem.uri, new vscode.Position(0, 0));
  }
  return message;
}

function collectFileItems(
  controller: vscode.TestController,
  request: vscode.TestRunRequest,
): vscode.TestItem[] {
  const targets = request.include?.length
    ? request.include
    : collectAllTopLevel(controller);

  const excluded = new Set(request.exclude?.map((i) => i.id) ?? []);
  const seen = new Set<string>();
  const files: vscode.TestItem[] = [];

  for (const item of targets) {
    if (excluded.has(item.id)) {
      continue;
    }
    const fileItem = topLevelOf(item);
    if (!seen.has(fileItem.id)) {
      seen.add(fileItem.id);
      files.push(fileItem);
    }
  }
  return files;
}

function collectAllTopLevel(controller: vscode.TestController): vscode.TestItem[] {
  const out: vscode.TestItem[] = [];
  controller.items.forEach((item) => out.push(item));
  return out;
}

function topLevelOf(item: vscode.TestItem): vscode.TestItem {
  let cursor = item;
  while (cursor.parent) {
    cursor = cursor.parent;
  }
  return cursor;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}
