import * as vscode from 'vscode';

import type { SnapshotIndex } from '../services/snapshotIndex';

const TRIGGER_PATTERN = /@\w*$/;

export class ElementRefCompletionProvider implements vscode.CompletionItemProvider {
  static readonly triggerCharacters: readonly string[] = ['@'];

  constructor(private readonly index: SnapshotIndex) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] {
    const refs = this.index.refs;
    if (refs.length === 0) {
      return [];
    }
    const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
    if (!TRIGGER_PATTERN.test(linePrefix)) {
      return [];
    }
    return refs.map((ref, idx) => {
      const item = new vscode.CompletionItem(`@${ref.id}`, vscode.CompletionItemKind.Reference);
      item.insertText = `@${ref.id}`;
      item.detail = formatDetail(ref);
      item.sortText = idx.toString().padStart(4, '0');
      const md = new vscode.MarkdownString(formatMarkdown(ref));
      md.supportHtml = false;
      item.documentation = md;
      return item;
    });
  }
}

function formatDetail(ref: { type?: string; label?: string }): string {
  if (ref.type && ref.label) {
    return `${ref.type} · ${ref.label}`;
  }
  if (ref.type) {
    return ref.type;
  }
  if (ref.label) {
    return ref.label;
  }
  return 'element ref';
}

function formatMarkdown(ref: { id: string; type?: string; label?: string }): string {
  const lines = ['*From the most recent snapshot.*'];
  if (ref.type) {
    lines.push(`Type: \`${ref.type}\``);
  }
  if (ref.label) {
    lines.push(`Label: \`${ref.label}\``);
  }
  return lines.join('\n\n');
}
