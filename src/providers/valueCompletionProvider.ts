import * as vscode from 'vscode';

import { SUPPORTED_PLATFORMS } from '../data/platforms';

interface ValueSlot {
  readonly choices: readonly string[];
  readonly kind: string;
}

const PLATFORM_FLAG = /(?:--platform)(?:\s+|=)([A-Za-z0-9_-]*)$/;
const CONTEXT_PLATFORM_KEY = /^\s*context\s+platform=([A-Za-z0-9_-]*)$/;

export class ValueCompletionProvider implements vscode.CompletionItemProvider {
  static readonly triggerCharacters: readonly string[] = [' ', '='];

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] {
    const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
    const slot = detectSlot(linePrefix);
    if (!slot) {
      return [];
    }
    return slot.choices.map((value) => {
      const item = new vscode.CompletionItem(value, vscode.CompletionItemKind.EnumMember);
      item.detail = slot.kind;
      return item;
    });
  }
}

function detectSlot(linePrefix: string): ValueSlot | null {
  if (PLATFORM_FLAG.test(linePrefix) || CONTEXT_PLATFORM_KEY.test(linePrefix)) {
    return { choices: SUPPORTED_PLATFORMS, kind: 'platform' };
  }
  return null;
}
