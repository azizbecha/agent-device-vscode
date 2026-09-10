import * as vscode from 'vscode';

import { validateSelectorLines, type SelectorIssue } from '../language/selectorRules';

const LANGUAGE_ID = 'agent-device';
const DIAGNOSTIC_SOURCE = 'agent-device';

/** Validates selector expressions (`label=… || id=…`) inside quoted positionals. */
export class SelectorDiagnostics implements vscode.Disposable, vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  private readonly collection: vscode.DiagnosticCollection;
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly issuesByUri = new Map<string, readonly SelectorIssue[]>();

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
      vscode.workspace.onDidCloseTextDocument((d) => {
        this.collection.delete(d.uri);
        this.issuesByUri.delete(d.uri.toString());
      }),
      vscode.languages.registerCodeActionsProvider(LANGUAGE_ID, this, {
        providedCodeActionKinds: SelectorDiagnostics.providedCodeActionKinds,
      }),
    );
    context.subscriptions.push(this);
  }

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
  ): vscode.CodeAction[] {
    const issues = this.issuesByUri.get(document.uri.toString()) ?? [];
    const actions: vscode.CodeAction[] = [];
    for (const issue of issues) {
      if (
        issue.fixes.length === 0 ||
        issue.line < range.start.line ||
        issue.line > range.end.line
      ) {
        continue;
      }
      const diagnostic = this.collection
        .get(document.uri)
        ?.find(
          (d) => d.range.start.line === issue.line && d.range.start.character === issue.startCol,
        );
      for (const fix of issue.fixes) {
        const action = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(
          document.uri,
          new vscode.Range(issue.line, issue.stringStart, issue.line, issue.stringEnd),
          fix.replacement,
        );
        action.isPreferred = true;
        if (diagnostic) {
          action.diagnostics = [diagnostic];
        }
        actions.push(action);
      }
    }
    return actions;
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
    this.issuesByUri.set(document.uri.toString(), issues);
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
