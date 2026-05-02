import * as path from 'node:path';
import * as vscode from 'vscode';

import {
  COMMAND_BY_NAME,
  COMMANDS,
  DIRECTIVE_BY_NAME,
  DIRECTIVES,
  FIND_ACTIONS,
  FIND_LOCATORS,
} from './data/commands';
import { SUPPORTED_PLATFORMS } from './data/platforms';
import { BUILTIN_VARIABLES } from './data/variables';
import { PlatformDiagnostics } from './diagnostics/platformValidator';
import { RunOutputPanel } from './panels/runOutputPanel';
import { CommandCompletionProvider } from './providers/completionProvider';
import { CommandHoverProvider } from './providers/hoverProvider';
import { ValueCompletionProvider } from './providers/valueCompletionProvider';
import { VariableCompletionProvider } from './providers/variableCompletionProvider';
import { ReplayRunner } from './runners/replayRunner';

const LANGUAGE_ID = 'agent-device';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Agent Device');
  context.subscriptions.push(output);

  const runner = new ReplayRunner({ cliPath: resolveCliPath(context) });
  context.subscriptions.push(runner);

  registerLanguageProviders(context);
  registerDiagnostics(context);
  registerRunOutputPanel(context, runner);
  registerOutputChannelSink(context, runner, output);
  registerCommands(context, runner);
}

function resolveCliPath(context: vscode.ExtensionContext): string {
  const binName = process.platform === 'win32' ? 'agent-device.cmd' : 'agent-device';
  return path.join(context.extensionPath, 'node_modules', '.bin', binName);
}

function registerLanguageProviders(context: vscode.ExtensionContext): void {
  const completion = new CommandCompletionProvider(
    COMMANDS,
    DIRECTIVES,
    COMMAND_BY_NAME,
    FIND_LOCATORS,
    FIND_ACTIONS,
  );
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      LANGUAGE_ID,
      completion,
      ...CommandCompletionProvider.triggerCharacters,
    ),
  );

  const variables = new VariableCompletionProvider(BUILTIN_VARIABLES);
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      LANGUAGE_ID,
      variables,
      ...VariableCompletionProvider.triggerCharacters,
    ),
  );

  const values = new ValueCompletionProvider();
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      LANGUAGE_ID,
      values,
      ...ValueCompletionProvider.triggerCharacters,
    ),
  );

  const hover = new CommandHoverProvider(COMMAND_BY_NAME, DIRECTIVE_BY_NAME);
  context.subscriptions.push(vscode.languages.registerHoverProvider(LANGUAGE_ID, hover));
}

function registerDiagnostics(context: vscode.ExtensionContext): void {
  const platformDiagnostics = new PlatformDiagnostics(SUPPORTED_PLATFORMS);
  platformDiagnostics.activate(context);
}

function registerRunOutputPanel(
  context: vscode.ExtensionContext,
  runner: ReplayRunner,
): void {
  const panel = new RunOutputPanel(context.extensionUri, runner);
  context.subscriptions.push(
    panel,
    vscode.window.registerWebviewViewProvider(RunOutputPanel.viewId, panel),
  );
}

function registerOutputChannelSink(
  context: vscode.ExtensionContext,
  runner: ReplayRunner,
  output: vscode.OutputChannel,
): void {
  context.subscriptions.push(
    runner.onEvent((event) => {
      switch (event.type) {
        case 'start':
          output.appendLine(`▶ run ${event.scriptName} (${event.steps.length} steps)`);
          break;
        case 'stepStart':
          output.appendLine(`  ${formatStepIndex(event.index)} …`);
          break;
        case 'stepSuccess':
          output.appendLine(`  ${formatStepIndex(event.index)} ✓ ${event.durationMs}ms`);
          break;
        case 'stepFailure':
          output.appendLine(`  ${formatStepIndex(event.index)} ✗ ${event.durationMs}ms — ${event.error.message}`);
          break;
        case 'end':
          output.appendLine(`── ${event.status} in ${event.durationMs}ms`);
          break;
      }
    }),
  );
}

function formatStepIndex(index: number): string {
  return `step ${String(index + 1).padStart(2, '0')}`;
}

function registerCommands(
  context: vscode.ExtensionContext,
  runner: ReplayRunner,
): void {
  const runScript = vscode.commands.registerCommand('agentDevice.runScript', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== LANGUAGE_ID) {
      vscode.window.showWarningMessage('Open a .ad file to run.');
      return;
    }
    if (editor.document.isDirty) {
      await editor.document.save();
    }
    try {
      await runner.run(editor.document.uri.fsPath);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Replay failed: ${message}`);
    }
  });
  context.subscriptions.push(runScript);
}

export function deactivate(): void {}
