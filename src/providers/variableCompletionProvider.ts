import * as vscode from 'vscode';

import type { BuiltinVariableDef } from '../data/variables';

const ENV_DECLARATION = /^\s*env\s+([A-Z_][A-Z0-9_]*)=/gm;

export class VariableCompletionProvider implements vscode.CompletionItemProvider {
  static readonly triggerCharacters: readonly string[] = ['{'];

  constructor(private readonly builtins: readonly BuiltinVariableDef[]) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] {
    const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
    if (!isInsideVariableReference(linePrefix)) {
      return [];
    }

    const items: vscode.CompletionItem[] = [];
    const seen = new Set<string>();

    for (const v of this.builtins) {
      seen.add(v.name);
      const item = new vscode.CompletionItem(v.name, vscode.CompletionItemKind.Variable);
      item.detail = 'built-in';
      item.documentation = new vscode.MarkdownString(v.summary);
      items.push(item);
    }

    for (const name of envVariableNames(document)) {
      if (seen.has(name)) {
        continue;
      }
      seen.add(name);
      const item = new vscode.CompletionItem(name, vscode.CompletionItemKind.Variable);
      item.detail = 'defined via env';
      items.push(item);
    }

    return items;
  }
}

function isInsideVariableReference(linePrefix: string): boolean {
  for (let i = linePrefix.length - 1; i >= 0; i--) {
    const ch = linePrefix[i];
    if (ch === '}') {
      return false;
    }
    if (ch === '{' && i > 0 && linePrefix[i - 1] === '$') {
      const between = linePrefix.slice(i + 1);
      if (between.includes(':-')) {
        return false;
      }
      return true;
    }
  }
  return false;
}

function envVariableNames(document: vscode.TextDocument): string[] {
  const names: string[] = [];
  const text = document.getText();
  ENV_DECLARATION.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ENV_DECLARATION.exec(text)) !== null) {
    if (match[1]) {
      names.push(match[1]);
    }
  }
  return names;
}
