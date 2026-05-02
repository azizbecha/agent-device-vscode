import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Agent Device');
  context.subscriptions.push(output);

  const runScript = vscode.commands.registerCommand('agentDevice.runScript', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'agent-device') {
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
