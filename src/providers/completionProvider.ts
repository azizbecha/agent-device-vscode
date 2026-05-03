import * as vscode from 'vscode';

import type { CommandDef, DirectiveDef } from '../data/commands';

interface LineCursorContext {
  readonly inComment: boolean;
  readonly inString: boolean;
  readonly firstToken: string | null;
  readonly currentToken: string;
  readonly tokensBefore: readonly string[];
}

export class CommandCompletionProvider implements vscode.CompletionItemProvider {
  static readonly triggerCharacters: readonly string[] = [' ', '-', '@'];

  constructor(
    private readonly commands: readonly CommandDef[],
    private readonly directives: readonly DirectiveDef[],
    private readonly commandIndex: ReadonlyMap<string, CommandDef>,
    private readonly findLocators: readonly string[],
    private readonly findActions: readonly string[],
  ) {}

  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] {
    const linePrefix = document.lineAt(position.line).text.slice(0, position.character);
    const ctx = analyzeCursor(linePrefix);

    if (ctx.inComment || ctx.inString) {
      return [];
    }

    if (ctx.firstToken === null) {
      return this.suggestTopLevel();
    }

    if (ctx.firstToken === 'context') {
      return this.suggestContextKeys(ctx.currentToken);
    }

    if (ctx.firstToken === 'find') {
      return this.suggestFindArgs(ctx);
    }

    if (ctx.currentToken.startsWith('--')) {
      return this.suggestFlags(ctx.firstToken, 'long');
    }
    if (ctx.currentToken.length > 0 && ctx.currentToken.startsWith('-')) {
      return this.suggestFlags(ctx.firstToken, 'short');
    }

    return [];
  }

  private suggestTopLevel(): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];
    for (const command of this.commands) {
      const item = new vscode.CompletionItem(command.name, vscode.CompletionItemKind.Keyword);
      item.detail = command.signature;
      item.documentation = new vscode.MarkdownString(command.summary);
      items.push(item);
    }
    for (const directive of this.directives) {
      const item = new vscode.CompletionItem(directive.name, vscode.CompletionItemKind.Module);
      item.detail = directive.name;
      item.documentation = new vscode.MarkdownString(directive.summary);
      items.push(item);
    }
    return items;
  }

  private suggestContextKeys(currentToken: string): vscode.CompletionItem[] {
    if (currentToken.includes('=')) {
      return [];
    }
    const context = this.directives.find((d) => d.name === 'context');
    if (!context?.keys) {
      return [];
    }
    return context.keys.map((key) => {
      const item = new vscode.CompletionItem(`${key.name}=`, vscode.CompletionItemKind.Property);
      item.insertText = `${key.name}=`;
      item.detail = key.summary ?? `context ${key.name}=…`;
      if (key.valueChoices?.length) {
        item.command = { command: 'editor.action.triggerSuggest', title: 'Suggest value' };
      }
      return item;
    });
  }

  private suggestFindArgs(ctx: LineCursorContext): vscode.CompletionItem[] {
    const argsAfterFind = ctx.tokensBefore.slice(1);
    if (argsAfterFind.length === 0) {
      return this.findLocators.map(
        (locator) => new vscode.CompletionItem(locator, vscode.CompletionItemKind.EnumMember),
      );
    }
    if (argsAfterFind.length >= 2) {
      return this.findActions.map(
        (action) => new vscode.CompletionItem(action, vscode.CompletionItemKind.Method),
      );
    }
    return [];
  }

  private suggestFlags(commandName: string, kind: 'long' | 'short'): vscode.CompletionItem[] {
    const command = this.commandIndex.get(commandName);
    if (!command) {
      return [];
    }
    const items: vscode.CompletionItem[] = [];
    for (const flag of command.flags) {
      const label = kind === 'short' ? flag.short : flag.name;
      if (!label) {
        continue;
      }
      const item = new vscode.CompletionItem(label, vscode.CompletionItemKind.Property);
      item.detail = flag.valueHint ? `${label} ${flag.valueHint}` : label;
      item.documentation = new vscode.MarkdownString(flag.summary);
      items.push(item);
    }
    return items;
  }
}

function analyzeCursor(linePrefix: string): LineCursorContext {
  let inString = false;
  let inComment = false;
  for (let i = 0; i < linePrefix.length; i++) {
    const ch = linePrefix[i];
    if (ch === '\\' && inString) {
      i++;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (!inString && ch === '#') {
      inComment = true;
      break;
    }
  }

  const tokens = tokenize(linePrefix);
  const trailingSpace = /\s$/.test(linePrefix);
  const currentToken = trailingSpace ? '' : (tokens[tokens.length - 1] ?? '');
  const tokensBefore = trailingSpace ? tokens : tokens.slice(0, -1);
  const stillTypingFirstWord = tokensBefore.length === 0;

  return {
    inComment,
    inString,
    firstToken: stillTypingFirstWord ? null : (tokensBefore[0] ?? null),
    currentToken,
    tokensBefore,
  };
}

function tokenize(input: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i]!)) {
      i++;
    }
    if (i >= input.length) {
      break;
    }
    if (input[i] === '"') {
      const start = i++;
      while (i < input.length) {
        if (input[i] === '\\') {
          i += 2;
          continue;
        }
        if (input[i] === '"') {
          i++;
          break;
        }
        i++;
      }
      out.push(input.slice(start, i));
      continue;
    }
    const start = i;
    while (i < input.length && !/\s/.test(input[i]!)) {
      i++;
    }
    out.push(input.slice(start, i));
  }
  return out;
}
