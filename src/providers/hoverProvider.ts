import * as vscode from 'vscode';

import type { CommandDef, DirectiveDef, FlagDef } from '../data/commands';

const TOKEN_REGEX = /(--[a-z][a-z0-9-]*)|(-[a-z])|(@e\d+)|([a-z][a-z0-9-]*)/;

export class CommandHoverProvider implements vscode.HoverProvider {
  constructor(
    private readonly commandIndex: ReadonlyMap<string, CommandDef>,
    private readonly directiveIndex: ReadonlyMap<string, DirectiveDef>,
  ) {}

  provideHover(document: vscode.TextDocument, position: vscode.Position): vscode.Hover | null {
    const range = document.getWordRangeAtPosition(position, TOKEN_REGEX);
    if (!range) {
      return null;
    }
    const word = document.getText(range);
    const lineText = document.lineAt(position.line).text;

    if (isInsideCommentOrString(lineText, range.start.character)) {
      return null;
    }

    if (word.startsWith('--') || (word.length === 2 && word.startsWith('-'))) {
      return this.flagHover(lineText, word);
    }

    if (word.startsWith('@e')) {
      return null;
    }

    const firstToken = firstWord(lineText);
    if (firstToken !== word) {
      return null;
    }

    const command = this.commandIndex.get(word);
    if (command) {
      return renderCommand(command);
    }
    const directive = this.directiveIndex.get(word);
    if (directive) {
      return renderDirective(directive);
    }
    return null;
  }

  private flagHover(lineText: string, word: string): vscode.Hover | null {
    const firstToken = firstWord(lineText);
    if (!firstToken) {
      return null;
    }
    const command = this.commandIndex.get(firstToken);
    if (!command) {
      return null;
    }
    const flag = command.flags.find((f) => f.name === word || f.short === word);
    if (!flag) {
      return null;
    }
    return renderFlag(flag);
  }
}

function renderCommand(command: CommandDef): vscode.Hover {
  const md = new vscode.MarkdownString();
  md.appendCodeblock(command.signature, 'agent-device');
  md.appendMarkdown(command.summary);
  return new vscode.Hover(md);
}

function renderDirective(directive: DirectiveDef): vscode.Hover {
  const md = new vscode.MarkdownString();
  md.appendMarkdown(`**${directive.name}** — ${directive.summary}`);
  if (directive.keys?.length) {
    const keyList = directive.keys.map((k) => `\`${k}\``).join(', ');
    md.appendMarkdown(`\n\nKeys: ${keyList}`);
  }
  return new vscode.Hover(md);
}

function renderFlag(flag: FlagDef): vscode.Hover {
  const md = new vscode.MarkdownString();
  const header = flag.short ? `**${flag.name}** (\`${flag.short}\`)` : `**${flag.name}**`;
  const hint = flag.valueHint ? ` \`${flag.valueHint}\`` : '';
  md.appendMarkdown(`${header}${hint}\n\n${flag.summary}`);
  return new vscode.Hover(md);
}

function firstWord(line: string): string | null {
  const match = /^\s*([A-Za-z][A-Za-z0-9-]*)/.exec(line);
  return match ? (match[1] ?? null) : null;
}

function isInsideCommentOrString(line: string, column: number): boolean {
  let inString = false;
  for (let i = 0; i < column; i++) {
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
      return true;
    }
  }
  return inString;
}
