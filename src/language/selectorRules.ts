/**
 * Pure (vscode-free) selector analysis for `.ad` lines: find the quoted
 * positionals that hold selector expressions, and validate them against the
 * agent-device 0.21 selector grammar.
 */
import {
  ROLE_HINT_WORD_SET,
  SELECTOR_BOOLEAN_KEY_SET,
  SELECTOR_COMMANDS,
  SELECTOR_TEXT_KEY_SET,
  SELECTOR_TEXT_KEYS,
} from '../data/selectors';

export type SelectorIssueCode =
  | 'unknown-selector-key'
  | 'empty-selector-value'
  | 'empty-selector-segment'
  | 'unterminated-selector-quote'
  | 'unquoted-selector-value'
  | 'bare-selector-word';

export interface SelectorFix {
  readonly title: string;
  /** Replacement for the whole quoted positional, columns [SelectorString.start, SelectorString.end). */
  readonly replacement: string;
}

export interface SelectorIssue {
  readonly line: number;
  /** Columns are absolute within the line. */
  readonly startCol: number;
  readonly endCol: number;
  readonly message: string;
  readonly severity: 'error' | 'warning';
  readonly code: SelectorIssueCode;
  /** Range of the whole quoted positional, for fixes. */
  readonly stringStart: number;
  readonly stringEnd: number;
  readonly fixes: readonly SelectorFix[];
}

/** A double-quoted positional on a selector-taking command. */
export interface SelectorString {
  /** Column of the opening quote. */
  readonly start: number;
  /** Column just past the closing quote (or line end if unterminated). */
  readonly end: number;
  /** Raw inner text, escapes intact. */
  readonly inner: string;
  readonly innerStart: number;
}

interface Token {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/** `key=` at the start, or a `||` chain: agent-device treats the string as a selector. */
export function looksLikeSelector(inner: string): boolean {
  const trimmed = inner.trim();
  if (trimmed.includes('||')) {
    return true;
  }
  const match = /^([A-Za-z][A-Za-z0-9_-]*)=/.exec(trimmed);
  if (match) {
    return true;
  }
  return SELECTOR_BOOLEAN_KEY_SET.has(trimmed.toLowerCase());
}

/** Selector-bearing quoted positionals on this line, per `SELECTOR_COMMANDS`. */
export function findSelectorStrings(rawLine: string): SelectorString[] {
  const code = stripCommentSuffix(rawLine);
  const tokens = tokenizeWithOffsets(code);
  const head = tokens[0];
  if (!head || !SELECTOR_COMMANDS.has(head.text)) {
    return [];
  }
  const slots = SELECTOR_COMMANDS.get(head.text) ?? null;

  const out: SelectorString[] = [];
  let positionalIndex = 0;
  for (let i = 1; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (tok.text.startsWith('-') && !/^-\d/.test(tok.text)) {
      // `--crop-on <selector>` on screenshot is the one selector-valued flag.
      if (tok.text === '--crop-on' && tokens[i + 1]?.text.startsWith('"')) {
        const value = tokens[i + 1]!;
        out.push(toSelectorString(value));
        i++;
      }
      continue;
    }
    const isQuoted = tok.text.startsWith('"');
    const wanted = slots === null || slots.includes(positionalIndex);
    if (isQuoted && wanted) {
      const candidate = toSelectorString(tok);
      if (slots !== null || looksLikeSelector(candidate.inner)) {
        out.push(candidate);
      }
    }
    positionalIndex++;
  }
  return out;
}

export function validateSelectorExpression(
  selector: SelectorString,
  line: number,
): SelectorIssue[] {
  const issues: SelectorIssue[] = [];
  const { inner, innerStart } = selector;

  if (!looksLikeSelector(inner)) {
    // Plain text (e.g. `wait "Welcome"`), nothing to validate.
    return issues;
  }

  const base = {
    line,
    stringStart: selector.start,
    stringEnd: selector.end,
    fixes: [] as readonly SelectorFix[],
  };

  const segments = splitFallbackChain(inner);
  for (const segment of segments) {
    const trimmed = segment.text.trim();
    if (trimmed.length === 0) {
      issues.push({
        ...base,
        startCol: innerStart + segment.start,
        endCol: innerStart + Math.max(segment.end, segment.start + 1),
        message: 'Empty selector segment around `||`.',
        severity: 'error',
        code: 'empty-selector-segment',
      });
      continue;
    }
    const terms = tokenizeSelectorTerms(segment.text);
    if (terms.unterminated) {
      issues.push({
        ...base,
        startCol: innerStart + segment.start + terms.unterminated.start,
        endCol: innerStart + segment.end,
        message: 'Unterminated quoted value inside the selector.',
        severity: 'error',
        code: 'unterminated-selector-quote',
      });
    }
    const segmentBase = innerStart + segment.start;
    for (let i = 0; i < terms.tokens.length; i++) {
      const term = terms.tokens[i]!;
      const previous = terms.tokens[i - 1];
      const spill = unquotedSpaceSpill(previous, term, terms.tokens, i);
      if (spill) {
        const valueStart = previous!.start + previous!.text.indexOf('=') + 1;
        const spilled = segment.text.slice(valueStart, spill.end);
        const key = previous!.text.slice(0, previous!.text.indexOf('='));
        issues.push({
          ...base,
          startCol: segmentBase + valueStart,
          endCol: segmentBase + spill.end,
          message: `Selector values with spaces must be quoted: agent-device reads \`${key}=${spilled}\` as \`${key}=${previous!.text.slice(previous!.text.indexOf('=') + 1)}\` plus the term \`${term.text}\`. Write \`${key}='${spilled}'\` (or \`${key}=\\"${spilled}\\"\`).`,
          severity: 'error',
          code: 'unquoted-selector-value',
          fixes: [
            {
              title: `Quote the value: ${key}='${spilled}'`,
              replacement: quoteValueInString(
                inner,
                segment.start + valueStart,
                segment.start + spill.end,
              ),
            },
          ],
        });
        i = spill.lastIndex;
        continue;
      }
      const issue = validateTerm(term, line, segmentBase);
      if (issue) {
        issues.push({ ...base, ...issue });
      }
    }
  }
  return issues;
}

/**
 * `label=Sign in`: agent-device tokenizes on whitespace, so `in` becomes its
 * own (invalid) term. Detect a run of bare non-boolean words right after an
 * unquoted `key=value` and treat the whole run as the spilled value.
 */
function unquotedSpaceSpill(
  previous: Token | undefined,
  term: Token,
  tokens: readonly Token[],
  index: number,
): { end: number; lastIndex: number } | null {
  if (!previous || !isBareInvalidWord(term)) {
    return null;
  }
  const eq = previous.text.indexOf('=');
  if (eq === -1) {
    return null;
  }
  const key = previous.text.slice(0, eq).toLowerCase();
  const value = previous.text.slice(eq + 1);
  if (!SELECTOR_TEXT_KEY_SET.has(key) || value.length === 0) {
    return null;
  }
  if (value.startsWith("'") || value.startsWith('\\"')) {
    return null;
  }
  let lastIndex = index;
  while (lastIndex + 1 < tokens.length && isBareInvalidWord(tokens[lastIndex + 1]!)) {
    lastIndex++;
  }
  return { end: tokens[lastIndex]!.end, lastIndex };
}

function isBareInvalidWord(term: Token): boolean {
  return !term.text.includes('=') && !SELECTOR_BOOLEAN_KEY_SET.has(term.text.toLowerCase());
}

/** Wrap `inner[from, to)` in single quotes and return the full double-quoted positional. */
function quoteValueInString(inner: string, from: number, to: number): string {
  const value = inner.slice(from, to);
  const quoted = value.includes("'") ? `\\"${value}\\"` : `'${value}'`;
  return `"${inner.slice(0, from)}${quoted}${inner.slice(to)}"`;
}

export function validateSelectorLines(lines: readonly string[]): SelectorIssue[] {
  const issues: SelectorIssue[] = [];
  for (let line = 0; line < lines.length; line++) {
    for (const selector of findSelectorStrings(lines[line] ?? '')) {
      issues.push(...validateSelectorExpression(selector, line));
    }
  }
  return issues;
}

type TermIssue = Omit<SelectorIssue, 'stringStart' | 'stringEnd' | 'fixes'>;

function validateTerm(term: Token, line: number, base: number): TermIssue | null {
  const eq = term.text.indexOf('=');
  const startCol = base + term.start;
  if (eq === -1) {
    const word = term.text.toLowerCase();
    if (SELECTOR_BOOLEAN_KEY_SET.has(word)) {
      return null;
    }
    const hint = SELECTOR_TEXT_KEY_SET.has(word)
      ? ` Did you mean \`${word}=<value>\`?`
      : ROLE_HINT_WORD_SET.has(word)
        ? ` Did you mean \`role=${word}\`?`
        : '';
    return {
      line,
      startCol,
      endCol: base + term.end,
      message: `"${term.text}" is not a selector term. Use key=value or a boolean term (${[...SELECTOR_BOOLEAN_KEY_SET].join(', ')}).${hint}`,
      severity: 'error',
      code: 'bare-selector-word',
    };
  }

  const key = term.text.slice(0, eq);
  const value = term.text.slice(eq + 1);
  const keyLower = key.toLowerCase();

  if (SELECTOR_BOOLEAN_KEY_SET.has(keyLower)) {
    return null;
  }
  if (!SELECTOR_TEXT_KEY_SET.has(keyLower)) {
    const hint = ROLE_HINT_WORD_SET.has(keyLower)
      ? ` "${key}" looks like a role: try \`role=${keyLower}\` or \`label=${value}\`.`
      : ` Known keys: ${SELECTOR_TEXT_KEYS.map((k) => k.name).join(', ')}.`;
    return {
      line,
      startCol,
      endCol: startCol + key.length,
      message: `Unknown selector key "${key}".${hint}`,
      severity: 'error',
      code: 'unknown-selector-key',
    };
  }
  if (unquote(value).trim().length === 0) {
    return {
      line,
      startCol,
      endCol: base + term.end,
      message: `Selector key "${key}" has no value.`,
      severity: 'error',
      code: 'empty-selector-value',
    };
  }
  return null;
}

// ─── Selector text scanning (raw inner text, `\"` and `'` delimit values) ────

interface Segment {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export function splitFallbackChain(inner: string): Segment[] {
  const segments: Segment[] = [];
  let start = 0;
  let quote: string | null = null;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i]!;
    if (quote) {
      if (ch === '\\' && inner[i + 1] === '"') {
        if (quote === '"') {
          quote = null;
        }
        i++;
        continue;
      }
      if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '\\' && inner[i + 1] === '"') {
      quote = '"';
      i++;
      continue;
    }
    if (ch === "'") {
      quote = "'";
      continue;
    }
    if (ch === '|' && inner[i + 1] === '|') {
      segments.push({ text: inner.slice(start, i), start, end: i });
      i++;
      start = i + 1;
    }
  }
  segments.push({ text: inner.slice(start), start, end: inner.length });
  return segments;
}

function tokenizeSelectorTerms(segment: string): { tokens: Token[]; unterminated: Token | null } {
  const tokens: Token[] = [];
  let i = 0;
  let unterminated: Token | null = null;
  while (i < segment.length) {
    while (i < segment.length && /\s/.test(segment[i]!)) {
      i++;
    }
    if (i >= segment.length) {
      break;
    }
    const start = i;
    let quote: string | null = null;
    let closed = true;
    while (i < segment.length) {
      const ch = segment[i]!;
      if (quote) {
        if (ch === '\\' && segment[i + 1] === '"') {
          if (quote === '"') {
            quote = null;
          }
          i += 2;
          continue;
        }
        if (ch === quote) {
          quote = null;
        }
        i++;
        continue;
      }
      if (ch === '\\' && segment[i + 1] === '"') {
        quote = '"';
        i += 2;
        continue;
      }
      if (ch === "'") {
        quote = "'";
        i++;
        continue;
      }
      if (/\s/.test(ch)) {
        break;
      }
      i++;
    }
    if (quote) {
      closed = false;
    }
    const token = { text: segment.slice(start, i), start, end: i };
    if (!closed && !unterminated) {
      unterminated = token;
    }
    tokens.push(token);
  }
  return { tokens, unterminated };
}

function unquote(value: string): string {
  let v = value.trim();
  if (v.startsWith('\\"') && v.endsWith('\\"') && v.length >= 4) {
    v = v.slice(2, -2);
  } else if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) {
    v = v.slice(1, -1);
  }
  return v;
}

function toSelectorString(tok: Token): SelectorString {
  const terminated = tok.text.length >= 2 && tok.text.endsWith('"') && !tok.text.endsWith('\\"');
  const inner = terminated ? tok.text.slice(1, -1) : tok.text.slice(1);
  return { start: tok.start, end: tok.end, inner, innerStart: tok.start + 1 };
}

// ─── Line tokenizing ────────────────────────────────────────────────────────

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
    } else {
      while (i < input.length && !/\s/.test(input[i] ?? '')) {
        i++;
      }
    }
    out.push({ text: input.slice(start, i), start, end: i });
  }
  return out;
}

export function stripCommentSuffix(line: string): string {
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
