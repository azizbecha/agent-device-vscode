import * as fs from 'node:fs/promises';
import * as vscode from 'vscode';

import { CliRunner } from './cliRunner';
import type { ParsedScript } from './scriptParser';
import { dequote, interpolate, parseScript } from './scriptParser';

export interface StepDescriptor {
  readonly index: number;
  readonly lineNumber: number;
  readonly raw: string;
  readonly display: string;
}

export interface StepError {
  readonly message: string;
  readonly stderr?: string;
}

export type ReplayEvent =
  | {
      readonly type: 'start';
      readonly scriptPath: string;
      readonly scriptName: string;
      readonly startedAt: number;
      readonly steps: readonly StepDescriptor[];
    }
  | { readonly type: 'stepStart'; readonly index: number; readonly startedAt: number }
  | {
      readonly type: 'stepSuccess';
      readonly index: number;
      readonly durationMs: number;
      readonly stdout: string;
    }
  | {
      readonly type: 'stepFailure';
      readonly index: number;
      readonly durationMs: number;
      readonly error: StepError;
    }
  | {
      readonly type: 'end';
      readonly durationMs: number;
      readonly status: 'success' | 'failure' | 'cancelled';
    };

export interface ReplayRunnerOptions {
  readonly cliPath: string;
  readonly sessionName?: string;
}

export interface ReplayRunOptions {
  readonly token?: vscode.CancellationToken;
  readonly endAtLine?: number;
  readonly onlyLine?: number;
}

export class ReplayRunner implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<ReplayEvent>();
  private readonly cli: CliRunner;
  private readonly sessionName: string;
  private currentRun: vscode.CancellationTokenSource | null = null;

  readonly onEvent = this.emitter.event;

  constructor(options: ReplayRunnerOptions) {
    this.cli = new CliRunner(options.cliPath);
    this.sessionName = options.sessionName ?? 'vscode';
  }

  dispose(): void {
    this.cancel();
    this.emitter.dispose();
  }

  get isRunning(): boolean {
    return this.currentRun !== null;
  }

  cancel(): void {
    this.currentRun?.cancel();
  }

  async run(scriptPath: string, options: ReplayRunOptions = {}): Promise<void> {
    if (this.currentRun) {
      throw new Error('A replay is already running. Stop it first.');
    }
    const source = new vscode.CancellationTokenSource();
    this.currentRun = source;
    const externalSubscription = options.token?.onCancellationRequested(() => source.cancel());
    try {
      await this.runInternal(scriptPath, options, source.token);
    } finally {
      externalSubscription?.dispose();
      source.dispose();
      this.currentRun = null;
    }
  }

  private async runInternal(
    scriptPath: string,
    options: ReplayRunOptions,
    token: vscode.CancellationToken,
  ): Promise<void> {
    const overallStartedAt = Date.now();
    const text = await fs.readFile(scriptPath, 'utf8');
    const parsed = parseScript(text);

    const filteredActions = filterActions(parsed.actions, options);

    const builtins: Record<string, string> = {
      AD_PLATFORM: parsed.platform ?? '',
      AD_SESSION: this.sessionName,
      AD_FILENAME: scriptPath,
    };
    const allVars: Record<string, string> = { ...builtins, ...parsed.env };

    const steps: StepDescriptor[] = filteredActions.map((action, index) => ({
      index,
      lineNumber: action.lineNumber,
      raw: action.raw,
      display: interpolate(action.argv, allVars).join(' '),
    }));

    const scriptName = scriptPath.split(/[\\/]/).pop() ?? scriptPath;

    this.emitter.fire({
      type: 'start',
      scriptPath,
      scriptName,
      startedAt: overallStartedAt,
      steps,
    });

    const sessionEnv: NodeJS.ProcessEnv = {};
    if (parsed.platform) {
      sessionEnv.AD_PLATFORM = parsed.platform;
    }

    const abortController = new AbortController();
    const cancelSubscription = token.onCancellationRequested(() => abortController.abort());

    let overallStatus: 'success' | 'failure' | 'cancelled' = 'success';

    try {
      for (let i = 0; i < filteredActions.length; i++) {
        if (token.isCancellationRequested) {
          overallStatus = 'cancelled';
          break;
        }

        const action = filteredActions[i]!;
        const interpolated = interpolate(action.argv, allVars).map(dequote);
        const argv = [...interpolated, '--session', this.sessionName];

        const stepStartedAt = Date.now();
        this.emitter.fire({ type: 'stepStart', index: i, startedAt: stepStartedAt });

        try {
          const result = await this.cli.run(argv, {
            env: sessionEnv,
            signal: abortController.signal,
          });
          const durationMs = Date.now() - stepStartedAt;

          if (result.exitCode === 0) {
            this.emitter.fire({
              type: 'stepSuccess',
              index: i,
              durationMs,
              stdout: result.stdout,
            });
          } else if (token.isCancellationRequested) {
            overallStatus = 'cancelled';
            break;
          } else {
            overallStatus = 'failure';
            this.emitter.fire({
              type: 'stepFailure',
              index: i,
              durationMs,
              error: {
                message: extractErrorMessage(result.stderr || result.stdout),
                stderr: result.stderr,
              },
            });
            break;
          }
        } catch (err) {
          if (token.isCancellationRequested || isAbortError(err)) {
            overallStatus = 'cancelled';
            break;
          }
          overallStatus = 'failure';
          this.emitter.fire({
            type: 'stepFailure',
            index: i,
            durationMs: Date.now() - stepStartedAt,
            error: { message: err instanceof Error ? err.message : String(err) },
          });
          break;
        }
      }
    } finally {
      cancelSubscription.dispose();
    }

    this.emitter.fire({
      type: 'end',
      durationMs: Date.now() - overallStartedAt,
      status: overallStatus,
    });
  }
}

function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === 'AbortError';
}

function filterActions(
  actions: ParsedScript['actions'],
  options: ReplayRunOptions,
): ParsedScript['actions'] {
  if (options.onlyLine != null) {
    return actions.filter((a) => a.lineNumber === options.onlyLine);
  }
  if (options.endAtLine != null) {
    return actions.filter((a) => a.lineNumber <= options.endAtLine!);
  }
  return actions;
}

function extractErrorMessage(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return 'step failed';
  }
  const firstLine = trimmed.split(/\r?\n/)[0] ?? '';
  return firstLine.trim() || 'step failed';
}
