import * as vscode from 'vscode';

import { CONTEXT_PLATFORMS, DEVICE_TARGETS, PLATFORM_SELECTORS } from '../data/platforms';

interface ValueSlot {
  readonly choices: readonly string[];
  readonly kind: string;
}

const PLATFORM_FLAG = /--platform(?:\s+|=)([A-Za-z0-9_-]*)$/;
const TARGET_FLAG = /--target(?:\s+|=)([A-Za-z0-9_-]*)$/;
const CONTEXT_PLATFORM_KEY = /^\s*context\b.*(?:^|\s)platform=([A-Za-z0-9_-]*)$/;
const CONTEXT_TARGET_KEY = /^\s*context\b.*(?:^|\s)target=([A-Za-z0-9_-]*)$/;

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

export function detectSlot(linePrefix: string): ValueSlot | null {
  if (CONTEXT_PLATFORM_KEY.test(linePrefix)) {
    return { choices: CONTEXT_PLATFORMS, kind: 'context platform' };
  }
  if (CONTEXT_TARGET_KEY.test(linePrefix)) {
    return { choices: DEVICE_TARGETS, kind: 'context target' };
  }
  if (PLATFORM_FLAG.test(linePrefix)) {
    return { choices: PLATFORM_SELECTORS, kind: 'platform' };
  }
  if (TARGET_FLAG.test(linePrefix)) {
    return { choices: DEVICE_TARGETS, kind: 'target' };
  }
  return null;
}
