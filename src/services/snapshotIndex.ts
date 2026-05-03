import * as vscode from 'vscode';

import type { ReplayEvent, ReplayRunner } from '../runners/replayRunner';

export interface SnapshotRef {
  readonly id: string;
  readonly type?: string;
  readonly label?: string;
}

const REF_LINE = /^\s*@(e\d+)\s+\[([^\]]+)\](?:\s+"((?:[^"\\]|\\.)*)")?/;

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

export function parseSnapshotRefs(stdout: string): SnapshotRef[] {
  const refs: SnapshotRef[] = [];
  const seen = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    const match = REF_LINE.exec(line);
    if (!match) {
      continue;
    }
    const [, id, type, label] = match;
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    refs.push({
      id,
      type: type?.trim(),
      label: label ? unescapeLabel(label) : undefined,
    });
  }
  return refs;
}

function firstToken(line: string): string {
  return line.split(/\s+/)[0] ?? '';
}

function unescapeLabel(value: string): string {
  return value.replace(/\\(.)/g, '$1');
}
