import * as vscode from 'vscode';

import { ROLE_HINT_WORDS, SELECTOR_BOOLEAN_KEYS, SELECTOR_TEXT_KEYS } from '../data/selectors';
import { findSelectorStrings } from '../language/selectorRules';

/**
 * Completes selector keys (`label=`, `id=`, `role=`, …), boolean terms, the
 * `||` fallback operator, and role words after `role=` when the cursor is
 * inside a quoted selector positional.
 */
export class SelectorCompletionProvider implements vscode.CompletionItemProvider {
  static readonly triggerCharacters: readonly string[] = ['"', ' ', '=', '|'];

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] {
    const lineText = document.lineAt(position.line).text;
    const selector = findSelectorStrings(lineText).find(
      (s) => position.character > s.start && position.character <= s.end,
    );
    if (!selector) {
      return [];
    }
    const before = lineText.slice(selector.innerStart, position.character);
    const currentTerm = /(\S*)$/.exec(before)?.[1] ?? '';

    if (/^role=\\?"?[A-Za-z]*$/.test(currentTerm)) {
      return ROLE_HINT_WORDS.map((role, index) => {
        const item = new vscode.CompletionItem(role, vscode.CompletionItemKind.EnumMember);
        item.detail = 'role';
        item.sortText = String(index).padStart(3, '0');
        return item;
      });
    }

    if (currentTerm.includes('=')) {
      return [];
    }

    const items: vscode.CompletionItem[] = [];
    for (const key of SELECTOR_TEXT_KEYS) {
      const item = new vscode.CompletionItem(`${key.name}=`, vscode.CompletionItemKind.Property);
      item.detail = `${key.name}=<value>`;
      item.documentation = new vscode.MarkdownString(key.summary);
      item.sortText = `0${key.name}`;
      if (key.name === 'role') {
        item.command = { command: 'editor.action.triggerSuggest', title: 'Suggest role' };
      }
      items.push(item);
    }
    for (const key of SELECTOR_BOOLEAN_KEYS) {
      const item = new vscode.CompletionItem(key.name, vscode.CompletionItemKind.Constant);
      item.detail = `${key.name} (boolean term)`;
      item.documentation = new vscode.MarkdownString(key.summary);
      item.sortText = `1${key.name}`;
      items.push(item);
    }
    if (before.trim().length > 0 && !before.trimEnd().endsWith('||')) {
      const item = new vscode.CompletionItem('||', vscode.CompletionItemKind.Operator);
      item.detail = 'fallback: try the next selector if this one has no match';
      item.insertText = '|| ';
      item.sortText = '2||';
      items.push(item);
    }
    return items;
  }
}
