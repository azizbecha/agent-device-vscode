import * as vscode from 'vscode';

import type { ReplayRunner } from '../runners/replayRunner';
import type { AgentDeviceConfig } from '../services/config';
import { formatDuration } from '../util/duration';
import { pluralize } from '../util/pluralize';

export function registerOutputChannelSink(
  context: vscode.ExtensionContext,
  runner: ReplayRunner,
  output: vscode.OutputChannel,
): void {
  context.subscriptions.push(
    runner.onEvent((event) => {
      switch (event.type) {
        case 'start':
          output.appendLine(`▶ run ${event.scriptName} (${pluralize(event.steps.length, 'step')})`);
          break;
        case 'stepStart':
          output.appendLine(`  ${formatStepIndex(event.index)} …`);
          break;
        case 'stepSuccess':
          output.appendLine(`  ${formatStepIndex(event.index)} ✓ ${formatDuration(event.durationMs)}`);
          break;
        case 'stepFailure':
          output.appendLine(`  ${formatStepIndex(event.index)} ✗ ${formatDuration(event.durationMs)} — ${event.error.message}`);
          break;
        case 'end':
          output.appendLine(`── ${event.status} in ${formatDuration(event.durationMs)}`);
          break;
      }
    }),
  );
}

export function registerRunNotifier(
  context: vscode.ExtensionContext,
  runner: ReplayRunner,
  config: AgentDeviceConfig,
): void {
  let scriptName = '';
  let stepDisplays: readonly string[] = [];
  let failedStep: { display: string; error: string } | null = null;

  context.subscriptions.push(
    runner.onEvent((event) => {
      switch (event.type) {
        case 'start':
          scriptName = event.scriptName;
          stepDisplays = event.steps.map((s) => s.display);
          failedStep = null;
          break;
        case 'stepFailure':
          failedStep = {
            display: stepDisplays[event.index] ?? `step ${event.index + 1}`,
            error: event.error.message,
          };
          break;
        case 'end': {
          const popups = config.notificationsEnabled();
          if (event.status === 'success') {
            const summary = `${scriptName} passed (${pluralize(stepDisplays.length, 'step')}, ${formatDuration(event.durationMs)})`;
            vscode.window.setStatusBarMessage(`$(pass) ${summary}`, 5000);
            if (popups) {
              void vscode.window.showInformationMessage(summary);
            }
          } else if (event.status === 'failure') {
            const detail = failedStep
              ? `${failedStep.display} — ${failedStep.error}`
              : 'unknown error';
            vscode.window.setStatusBarMessage(`$(error) ${scriptName} failed`, 5000);
            if (popups) {
              void vscode.window.showErrorMessage(`${scriptName} failed: ${detail}`);
            }
          } else if (event.status === 'cancelled') {
            vscode.window.setStatusBarMessage(`$(circle-slash) ${scriptName} cancelled`, 5000);
          }
          break;
        }
      }
    }),
  );
}

function formatStepIndex(index: number): string {
  return `step ${String(index + 1).padStart(2, '0')}`;
}
