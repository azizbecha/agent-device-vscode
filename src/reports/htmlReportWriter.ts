import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

import type { ReplayEvent, ReplayRunner } from '../runners/replayRunner';
import {
  renderReport,
  type ReportData,
  type ReportStep,
  type ReportStepState,
  type ReportStatus,
} from './reportTemplate';

interface PendingStep {
  index: number;
  lineNumber: number;
  display: string;
  state: ReportStepState | 'pending' | 'running';
  durationMs?: number;
  stdout?: string;
  stderr?: string;
  errorMessage?: string;
}

interface PendingReport {
  scriptName: string;
  scriptPath: string;
  startedAt: number;
  steps: PendingStep[];
}

const REPORT_DIR_NAME = '.agent-device-reports';

export class HtmlReportWriter implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly emitter = new vscode.EventEmitter<vscode.Uri>();
  private current: PendingReport | null = null;
  private lastReport: vscode.Uri | undefined;

  readonly onDidWriteReport = this.emitter.event;

  constructor(runner: ReplayRunner) {
    this.disposables.push(runner.onEvent((event) => this.onRunnerEvent(event)));
  }

  get lastReportUri(): vscode.Uri | undefined {
    return this.lastReport;
  }

  dispose(): void {
    this.emitter.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private onRunnerEvent(event: ReplayEvent): void {
    switch (event.type) {
      case 'start':
        this.current = {
          scriptName: event.scriptName,
          scriptPath: event.scriptPath,
          startedAt: event.startedAt,
          steps: event.steps.map((s) => ({
            index: s.index,
            lineNumber: s.lineNumber,
            display: s.display,
            state: 'pending',
          })),
        };
        break;
      case 'stepSuccess': {
        const step = this.current?.steps[event.index];
        if (step) {
          step.state = 'passed';
          step.durationMs = event.durationMs;
          step.stdout = event.stdout;
        }
        break;
      }
      case 'stepFailure': {
        const step = this.current?.steps[event.index];
        if (step) {
          step.state = 'failed';
          step.durationMs = event.durationMs;
          step.errorMessage = event.error.message;
          step.stderr = event.error.stderr;
        }
        break;
      }
      case 'end':
        if (this.current) {
          const data = finalizeReport(this.current, event.status, event.durationMs);
          void this.writeToDisk(data);
          this.current = null;
        }
        break;
    }
  }

  private async writeToDisk(data: ReportData): Promise<void> {
    try {
      const root = this.reportRoot();
      const runId = formatRunId(data.startedAt);
      const dir = path.join(root, runId);
      await fs.mkdir(dir, { recursive: true });
      const file = path.join(dir, 'index.html');
      await fs.writeFile(file, renderReport(data), 'utf8');
      this.lastReport = vscode.Uri.file(file);
      this.emitter.fire(this.lastReport);
    } catch {
      // Reports are advisory; failure to write should not surface as a runner error.
    }
  }

  private reportRoot(): string {
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (folder) {
      return path.join(folder.uri.fsPath, REPORT_DIR_NAME);
    }
    return path.join(os.tmpdir(), 'agent-device-reports');
  }
}

function finalizeReport(
  pending: PendingReport,
  status: ReportStatus,
  durationMs: number,
): ReportData {
  const steps: ReportStep[] = pending.steps.map((s) => ({
    index: s.index,
    lineNumber: s.lineNumber,
    display: s.display,
    state: s.state === 'pending' || s.state === 'running' ? 'skipped' : s.state,
    durationMs: s.durationMs,
    stdout: s.stdout,
    stderr: s.stderr,
    errorMessage: s.errorMessage,
  }));
  return {
    scriptName: pending.scriptName,
    scriptPath: pending.scriptPath,
    startedAt: pending.startedAt,
    durationMs,
    status,
    steps,
  };
}

function formatRunId(startedAt: number): string {
  return new Date(startedAt).toISOString().replace(/[:.]/g, '-');
}
