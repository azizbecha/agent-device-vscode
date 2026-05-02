import * as vscode from 'vscode';

const LANGUAGE_ID = 'agent-device';
const DIAGNOSTIC_SOURCE = 'agent-device';

const PLATFORM_FLAG = /--platform(?:\s+|=)([A-Za-z0-9_-]+)/g;
const CONTEXT_PLATFORM_KEY = /^\s*context\s+(?:[^#\n]*?\s)?platform=([A-Za-z0-9_-]+)/;

export class PlatformDiagnostics implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly subscriptions: vscode.Disposable[] = [];
  private readonly validSet: ReadonlySet<string>;

  constructor(private readonly validPlatforms: readonly string[]) {
    this.collection = vscode.languages.createDiagnosticCollection(DIAGNOSTIC_SOURCE);
    this.validSet = new Set<string>(validPlatforms);
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
    const issues: vscode.Diagnostic[] = [];

    for (let lineIdx = 0; lineIdx < document.lineCount; lineIdx++) {
      const lineText = document.lineAt(lineIdx).text;
      const codePortion = stripCommentSuffix(lineText);
      if (codePortion.length === 0) {
        continue;
      }

      for (const match of codePortion.matchAll(PLATFORM_FLAG)) {
        const value = match[1];
        if (!value || this.validSet.has(value)) {
          continue;
        }
        const matchIndex = match.index ?? 0;
        const valueStart = matchIndex + match[0].length - value.length;
        issues.push(this.makeDiagnostic(lineIdx, valueStart, value));
      }

      const ctx = CONTEXT_PLATFORM_KEY.exec(codePortion);
      if (ctx) {
        const value = ctx[1];
        if (value && !this.validSet.has(value)) {
          const valueStart = ctx.index + ctx[0].length - value.length;
          issues.push(this.makeDiagnostic(lineIdx, valueStart, value));
        }
      }
    }

    this.collection.set(document.uri, issues);
  }

  private makeDiagnostic(line: number, valueStart: number, value: string): vscode.Diagnostic {
    const range = new vscode.Range(line, valueStart, line, valueStart + value.length);
    const expected = this.validPlatforms.map((p) => `"${p}"`).join(' or ');
    const diagnostic = new vscode.Diagnostic(
      range,
      `Unsupported platform "${value}". Expected ${expected}.`,
      vscode.DiagnosticSeverity.Error,
    );
    diagnostic.source = DIAGNOSTIC_SOURCE;
    diagnostic.code = 'unsupported-platform';
    return diagnostic;
  }
}

function stripCommentSuffix(line: string): string {
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '\\' && inString) {
      i++;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString && ch === '#') {
      return line.slice(0, i);
    }
  }
  return line;
}
