/**
 * `.ad` argument quoting, mirroring `@agent-device/ad-script`'s tokenizer:
 *
 *  - an argument that starts with `"` is a JSON string: it runs to the next
 *    unescaped `"`, and an inner `"` must be written `\"`;
 *  - any other argument ends at the first whitespace, quotes included.
 *
 * So the two "natural" spellings of a selector value with a space both break:
 *
 *    click label="Sign in"        → tokens  label="Sign   in"
 *    click "label="Sign in""      → tokens  label=   Sign   in""
 *
 * This module detects both and rebuilds the intended single argument as
 * `"label='Sign in'"` (preferred) or `"label=\"Sign in\""`.
 */

export interface QuotingFix {
  readonly title: string;
  /** Replacement for the columns [start, end) of the line. */
  readonly replacement: string;
}

export interface QuotingIssue {
  readonly line: number;
  readonly startCol: number;
  readonly endCol: number;
  readonly message: string;
  readonly code: 'malformed-argument-quoting';
  readonly fixes: readonly QuotingFix[];
}

interface Token {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export function validateLineQuoting(rawLine: string, line: number): QuotingIssue | null {
  const code = stripCommentSuffix(rawLine);
  const tokens = tokenizeWithOffsets(code);
  // Header lines (`env KEY="a b"`, `context …`) have their own key=value parser upstream.
  if (tokens.length < 2 || tokens[0]!.text === 'env' || tokens[0]!.text === 'context') {
    return null;
  }

  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i]!;
    const bareWithQuote = !tok.text.startsWith('"') && countUnescapedQuotes(tok.text) % 2 === 1;
    const quotedThenGlued =
      tok.text.startsWith('"') && tok.text.length >= 2 && /(?<!\\)"[^\s]/.test(tok.text.slice(1));
    if (!bareWithQuote && !quotedThenGlued) {
      continue;
    }

    const spanStart = tok.start;
    const spanEnd = lastQuoteBefore(code, code.length) + 1;
    if (spanEnd <= spanStart) {
      return null;
    }
    const span = code.slice(spanStart, spanEnd);
    const intended = intendedArgument(span);
    if (intended === null) {
      return {
        line,
        startCol: spanStart,
        endCol: spanEnd,
        message:
          'Unbalanced quotes. In .ad scripts an argument that starts with `"` is a JSON string (inner quotes are `\\"`), and any other argument ends at the first space.',
        code: 'malformed-argument-quoting',
        fixes: [],
      };
    }

    const single = intended.replace(/"/g, "'");
    const fixes: QuotingFix[] = [];
    if (!intended.includes("'")) {
      fixes.push({ title: `Rewrite as "${single}"`, replacement: `"${single}"` });
    }
    const escaped = `"${intended.replace(/"/g, '\\"')}"`;
    fixes.push({ title: `Rewrite as ${escaped}`, replacement: escaped });

    return {
      line,
      startCol: spanStart,
      endCol: spanEnd,
      message:
        `agent-device splits this into ${describeSplit(code.slice(spanStart, spanEnd))} because an argument ends at the first space unless the whole argument is one \`"…"\` string. ` +
        `Write \`"${single}"\`${intended.includes("'") ? '' : ` (or \`${escaped}\`)`}. A value without spaces needs no quotes at all: \`${intended.split(/\s/)[0]?.replace(/["']/g, '')}\`.`,
      code: 'malformed-argument-quoting',
      fixes,
    };
  }
  return null;
}

/** Recover `label="Sign in"` from `label="Sign in"` or `"label="Sign in""`. */
function intendedArgument(span: string): string | null {
  let inner = span;
  // `"label="Sign in""` → strip the outer pair the author added.
  if (inner.startsWith('"') && inner.endsWith('"') && inner.length >= 2) {
    inner = inner.slice(1, -1);
  }
  if (countUnescapedQuotes(inner) % 2 !== 0) {
    return null;
  }
  return inner;
}

function describeSplit(span: string): string {
  const parts = span.split(/\s+/).filter((p) => p.length > 0);
  return parts.map((p) => `\`${p}\``).join(' + ');
}

function countUnescapedQuotes(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') {
      i++;
      continue;
    }
    if (text[i] === '"') {
      count++;
    }
  }
  return count;
}

function lastQuoteBefore(text: string, limit: number): number {
  for (let i = Math.min(limit, text.length) - 1; i >= 0; i--) {
    if (text[i] === '"' && text[i - 1] !== '\\') {
      return i;
    }
  }
  return -1;
}

function tokenizeWithOffsets(input: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i] ?? '')) {
      i++;
    }
    if (i >= input.length) {
      break;
    }
    const start = i;
    if (input[i] === '"') {
      i++;
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
      // Glued tail: `"label="Sign` continues without whitespace.
      while (i < input.length && !/\s/.test(input[i] ?? '')) {
        i++;
      }
    } else {
      while (i < input.length && !/\s/.test(input[i] ?? '')) {
        i++;
      }
    }
    out.push({ text: input.slice(start, i), start, end: i });
  }
  return out;
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
