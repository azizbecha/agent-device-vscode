import * as vscode from 'vscode';

import type { ReplayEvent, ReplayRunner } from '../runners/replayRunner';
import { parseSnapshotRefs, type SnapshotRef } from '../runners/snapshotParser';

export { parseSnapshotRefs, type SnapshotRef };

export class SnapshotIndex implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<void>();
  private readonly disposables: vscode.Disposable[] = [];
  private currentRefs: readonly SnapshotRef[] = [];
  private currentScriptPath: string | null = null;
  private stepCommands: readonly string[] = [];
  private currentRunScriptPath: string | null = null;

  readonly onDidChange = this.emitter.event;

  constructor(runner: ReplayRunner) {
    this.disposables.push(runner.onEvent((event) => this.handleEvent(event)));
  }

  dispose(): void {
    this.emitter.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  get refs(): readonly SnapshotRef[] {
    return this.currentRefs;
  }

  get scriptPath(): string | null {
    return this.currentScriptPath;
  }

  setRefs(refs: readonly SnapshotRef[], scriptPath: string | null = null): void {
    this.currentRefs = refs;
    this.currentScriptPath = scriptPath;
    this.emitter.fire();
  }

  clear(): void {
    if (this.currentRefs.length === 0 && this.currentScriptPath === null) {
      return;
    }
    this.currentRefs = [];
    this.currentScriptPath = null;
    this.emitter.fire();
  }

  private handleEvent(event: ReplayEvent): void {
    switch (event.type) {
      case 'start':
        this.stepCommands = event.steps.map((s) => firstToken(s.display));
        this.currentRunScriptPath = event.scriptPath;
        break;
      case 'stepSuccess': {
        const command = this.stepCommands[event.index];
        if (command !== 'snapshot' || !this.currentRunScriptPath) {
          return;
        }
        const refs = parseSnapshotRefs(event.stdout);
        if (refs.length === 0) {
          return;
        }
        this.currentRefs = refs;
        this.currentScriptPath = this.currentRunScriptPath;
        this.emitter.fire();
        break;
      }
      case 'end':
        this.stepCommands = [];
        this.currentRunScriptPath = null;
        break;
    }
  }
}

function firstToken(line: string): string {
  return line.split(/\s+/)[0] ?? '';
}
