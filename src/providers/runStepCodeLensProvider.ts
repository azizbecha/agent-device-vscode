import * as vscode from 'vscode';

import { parseScript } from '../runners/scriptParser';

const LANGUAGE_ID = 'agent-device';

export class RunStepCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (document.languageId !== LANGUAGE_ID) {
      return [];
    }
    const parsed = parseScript(document.getText());
    const lenses: vscode.CodeLens[] = [];
    for (const action of parsed.actions) {
      const lineIndex = Math.max(0, action.lineNumber - 1);
      const range = new vscode.Range(lineIndex, 0, lineIndex, 0);
      lenses.push(
        new vscode.CodeLens(range, {
          title: '$(play) Run',
          tooltip: 'Run only this line. May fail if it depends on prior state (refs, app screen).',
          command: 'agentDevice.runScriptLine',
          arguments: [document.uri, action.lineNumber],
        }),
        new vscode.CodeLens(range, {
          title: '$(play) Run up to here',
          tooltip: 'Run all steps up to and including this line',
          command: 'agentDevice.runScriptUpTo',
          arguments: [document.uri, action.lineNumber],
        }),
      );
    }
    return lenses;
  }
}
