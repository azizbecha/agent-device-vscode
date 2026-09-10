import * as vscode from 'vscode';

import { validateScriptHeader, type HeaderIssue } from '../language/contextRules';

const LANGUAGE_ID = 'agent-device';
const DIAGNOSTIC_SOURCE = 'agent-device';

/**
 * Validates the `.ad` header (`context` / `env`) and `--platform` / `--target`
 * flag values against agent-device 0.21's accepted vocabulary.
 */
export class HeaderDiagnostics implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly subscriptions: vscode.Disposable[] = [];

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection(`${DIAGNOSTIC_SOURCE}.header`);
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
    const lines = document.getText().split(/\r?\n/);
    const diagnostics = validateScriptHeader(lines).map(toDiagnostic);
    this.collection.set(document.uri, diagnostics);
  }
}

function toDiagnostic(issue: HeaderIssue): vscode.Diagnostic {
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
