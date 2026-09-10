import * as vscode from 'vscode';

import { validateGestureLines, type GestureIssue } from '../language/gestureRules';

const LANGUAGE_ID = 'agent-device';
const DIAGNOSTIC_SOURCE = 'agent-device';

/**
 * Flags `swipe` / `gesture` lines that agent-device 0.20+ rejects at parse
 * time, and offers the upstream migration as a quick fix.
 */
export class GestureDiagnostics implements vscode.Disposable, vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  private readonly collection: vscode.DiagnosticCollection;
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly issuesByUri = new Map<string, readonly GestureIssue[]>();

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection(`${DIAGNOSTIC_SOURCE}.gesture`);
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
        providedCodeActionKinds: GestureDiagnostics.providedCodeActionKinds,
      }),
    );
    context.subscriptions.push(this);
  }

  dispose(): void {
    this.collection.dispose();
    for (const sub of this.subscriptions) {
      sub.dispose();
    }
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
        ?.find((d) => d.range.start.line === issue.line && d.code === issue.code);
      issue.fixes.forEach((fix, index) => {
        const action = new vscode.CodeAction(fix.title, vscode.CodeActionKind.QuickFix);
        action.edit = new vscode.WorkspaceEdit();
        action.edit.replace(
          document.uri,
          new vscode.Range(issue.line, 0, issue.line, issue.codeEndCol),
          fix.replacement,
        );
        action.isPreferred = index === 0;
        if (diagnostic) {
          action.diagnostics = [diagnostic];
        }
        actions.push(action);
      });
    }
    return actions;
  }

  private validate(document: vscode.TextDocument): void {
    if (document.languageId !== LANGUAGE_ID) {
      return;
    }
    const issues = validateGestureLines(document.getText().split(/\r?\n/));
    this.issuesByUri.set(document.uri.toString(), issues);
    this.collection.set(document.uri, issues.map(toDiagnostic));
  }
}

function toDiagnostic(issue: GestureIssue): vscode.Diagnostic {
  const range = new vscode.Range(issue.line, issue.startCol, issue.line, issue.endCol);
  const diagnostic = new vscode.Diagnostic(range, issue.message, vscode.DiagnosticSeverity.Error);
  diagnostic.source = DIAGNOSTIC_SOURCE;
  diagnostic.code = issue.code;
  if (issue.code === 'retired-gesture-positional') {
    diagnostic.tags = [vscode.DiagnosticTag.Deprecated];
  }
  return diagnostic;
}
