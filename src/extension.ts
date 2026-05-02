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
import { CommandCompletionProvider } from './providers/completionProvider';
import { CommandHoverProvider } from './providers/hoverProvider';
import { ValueCompletionProvider } from './providers/valueCompletionProvider';
import { VariableCompletionProvider } from './providers/variableCompletionProvider';

const LANGUAGE_ID = 'agent-device';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Agent Device');
  context.subscriptions.push(output);

  registerLanguageProviders(context);
  registerDiagnostics(context);
  registerCommands(context, output);
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

function registerCommands(
  context: vscode.ExtensionContext,
  output: vscode.OutputChannel,
): void {
  const runScript = vscode.commands.registerCommand('agentDevice.runScript', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== LANGUAGE_ID) {
      vscode.window.showWarningMessage('Open a .ad file to run.');
      return;
    }
    output.show(true);
    output.appendLine(`[run] ${editor.document.uri.fsPath}`);
    output.appendLine('Not yet implemented — see roadmap Phase 0.');
  });
  context.subscriptions.push(runScript);
}

export function deactivate(): void {}
