import * as fs from 'node:fs/promises';
import * as vscode from 'vscode';

import { CliRunner } from './cliRunner';
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

export class ReplayRunner implements vscode.Disposable {
  private readonly emitter = new vscode.EventEmitter<ReplayEvent>();
  private readonly cli: CliRunner;
  private readonly sessionName: string;

  readonly onEvent = this.emitter.event;

  constructor(options: ReplayRunnerOptions) {
    this.cli = new CliRunner(options.cliPath);
    this.sessionName = options.sessionName ?? 'vscode';
  }

  dispose(): void {
    this.emitter.dispose();
  }

  async run(scriptPath: string, token?: vscode.CancellationToken): Promise<void> {
    const overallStartedAt = Date.now();
    const text = await fs.readFile(scriptPath, 'utf8');
    const parsed = parseScript(text);

    const builtins: Record<string, string> = {
      AD_PLATFORM: parsed.platform ?? '',
      AD_SESSION: this.sessionName,
      AD_FILENAME: scriptPath,
    };
    const allVars: Record<string, string> = { ...builtins, ...parsed.env };

    const steps: StepDescriptor[] = parsed.actions.map((action, index) => ({
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

    let overallStatus: 'success' | 'failure' | 'cancelled' = 'success';

    for (let i = 0; i < parsed.actions.length; i++) {
      if (token?.isCancellationRequested) {
        overallStatus = 'cancelled';
        break;
      }

      const action = parsed.actions[i]!;
      const interpolated = interpolate(action.argv, allVars).map(dequote);
      const argv = [...interpolated, '--session', this.sessionName];

      const stepStartedAt = Date.now();
      this.emitter.fire({ type: 'stepStart', index: i, startedAt: stepStartedAt });

      try {
        const result = await this.cli.run(argv, { env: sessionEnv });
        const durationMs = Date.now() - stepStartedAt;

        if (result.exitCode === 0) {
          this.emitter.fire({
            type: 'stepSuccess',
            index: i,
            durationMs,
            stdout: result.stdout,
          });
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

    this.emitter.fire({
      type: 'end',
      durationMs: Date.now() - overallStartedAt,
      status: overallStatus,
    });
  }
}

function extractErrorMessage(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) {
    return 'step failed';
  }
  const firstLine = trimmed.split(/\r?\n/)[0] ?? '';
  return firstLine.trim() || 'step failed';
}
