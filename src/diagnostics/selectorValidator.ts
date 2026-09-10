import * as vscode from 'vscode';

import { validateSelectorLines, type SelectorIssue } from '../language/selectorRules';

const LANGUAGE_ID = 'agent-device';
const DIAGNOSTIC_SOURCE = 'agent-device';

/** Validates selector expressions (`label=… || id=…`) inside quoted positionals. */
export class SelectorDiagnostics implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection(`${DIAGNOSTIC_SOURCE}.selector`);
  }

  activate(context: vscode.ExtensionContext): void {
    for (const document of vscode.workspace.textDocuments) {
      this.validate(document);
    }
    this.subscriptions.push(
      vscode.workspace.onDidOpenTextDocument((d) => this.validate(d)),
      vscode.workspace.onDidChangeTextDocument((e) => this.validate(e.document)),
      vscode.workspace.onDidCloseTextDocument((d) => this.collection.delete(d.uri)),
    );
    context.subscriptions.push(this);
  }

  dispose(): void {
    this.collection.dispose();
    for (const sub of this.subscriptions) {
      sub.dispose();
    }
  }

  private validate(document: vscode.TextDocument): void {
    if (document.languageId !== LANGUAGE_ID) {
      return;
    }
    const issues = validateSelectorLines(document.getText().split(/\r?\n/));
    this.collection.set(document.uri, issues.map(toDiagnostic));
  }
}

function toDiagnostic(issue: SelectorIssue): vscode.Diagnostic {
  const range = new vscode.Range(issue.line, issue.startCol, issue.line, issue.endCol);
  const severity =
    issue.severity === 'error'
      ? vscode.DiagnosticSeverity.Error
      : vscode.DiagnosticSeverity.Warning;
  const diagnostic = new vscode.Diagnostic(range, issue.message, severity);
  diagnostic.source = DIAGNOSTIC_SOURCE;
  diagnostic.code = issue.code;
  return diagnostic;
}
