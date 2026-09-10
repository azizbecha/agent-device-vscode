/**
 * Pure (vscode-free) validation of `swipe` and `gesture …` lines against the
 * agent-device 0.20 gesture redesign, mirroring
 * `@agent-device/contracts/gesture-normalization`:
 *
 *   swipe x1 y1 x2 y2                       (trailing durationMs removed)
 *   gesture pan x y dx dy [durationMs]      [--pointer-count 2]
 *   gesture fling <dir> x y [distance]      (trailing durationMs removed)
 *   gesture swipe <preset>                  (trailing durationMs removed)
 *   gesture pinch scale [x] [y]
 *   gesture rotate degrees [x] [y]          (trailing velocity removed)
 *   gesture transform x y dx dy scale degrees [durationMs]
 *   gesture drag <src> <dst> [sourceHoldMs] [moveMs] [destinationHoldMs]
 *
 * agent-device rejects the retired forms at parse time with INVALID_ARGS, so
 * the editor flags them before a run and offers the same migration as a fix.
 */

export type GestureIssueCode =
  | 'retired-gesture-positional'
  | 'gesture-arity'
  | 'unknown-gesture-kind'
  | 'invalid-gesture-value';

export interface GestureFix {
  readonly title: string;
  /** Replacement for the code portion of the line (comment suffix is preserved by the caller). */
  readonly replacement: string;
}

export interface GestureIssue {
  readonly line: number;
  readonly startCol: number;
  readonly endCol: number;
  /** Column where the code portion ends (exclusive); fixes replace [0, codeEndCol). */
  readonly codeEndCol: number;
  readonly message: string;
  readonly code: GestureIssueCode;
  readonly fixes: readonly GestureFix[];
}

export const GESTURE_KINDS = [
  'pan',
  'fling',
  'drag',
  'pinch',
  'rotate',
  'transform',
  'swipe',
] as const;
export type GestureKind = (typeof GESTURE_KINDS)[number];

export const FLING_DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
export const SWIPE_PRESETS = ['left', 'right', 'left-edge', 'right-edge'] as const;

interface ArityRule {
  readonly min: number;
  readonly max: number;
  readonly usage: string;
  /** Name of the positional agent-device removed; present when max+1 args is the retired form. */
  readonly retired?: string;
}

const SWIPE_RULE: ArityRule = {
  min: 4,
  max: 4,
  usage: 'swipe accepts 4 arguments: x1 y1 x2 y2',
  retired: 'durationMs',
};

const GESTURE_RULES: Record<GestureKind, ArityRule> = {
  pan: { min: 4, max: 5, usage: 'gesture pan accepts at most 5 arguments: x y dx dy [durationMs]' },
  fling: {
    min: 3,
    max: 4,
    usage: 'gesture fling accepts at most 4 arguments: direction x y [distance]',
    retired: 'durationMs',
  },
  swipe: {
    min: 1,
    max: 1,
    usage: 'gesture swipe accepts 1 argument: preset',
    retired: 'durationMs',
  },
  pinch: { min: 1, max: 3, usage: 'gesture pinch accepts at most 3 arguments: scale [x] [y]' },
  rotate: {
    min: 1,
    max: 3,
    usage: 'gesture rotate accepts at most 3 arguments: degrees [x] [y]',
    retired: 'velocity',
  },
  transform: {
    min: 6,
    max: 7,
    usage: 'gesture transform accepts at most 7 arguments: x y dx dy scale degrees [durationMs]',
  },
  drag: {
    min: 2,
    max: 5,
    usage:
      'gesture drag accepts at most 5 arguments: source destination [sourceHoldMs] [moveMs] [destinationHoldMs]',
  },
};

/** Flags that consume the next token, so it is not counted as a positional. */
const VALUE_FLAGS: ReadonlySet<string> = new Set([
  '--pointer-count',
  '--settle-quiet',
  '--count',
  '--pause-ms',
  '--pattern',
  '--platform',
  '--target',
  '--device',
  '--udid',
  '--serial',
  '--session',
]);

interface Token {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

export function validateGestureLines(lines: readonly string[]): GestureIssue[] {
  const issues: GestureIssue[] = [];
  for (let line = 0; line < lines.length; line++) {
    const issue = validateGestureLine(lines[line] ?? '', line);
    if (issue) {
      issues.push(issue);
    }
  }
  return issues;
}

export function validateGestureLine(rawLine: string, line: number): GestureIssue | null {
  const code = stripCommentSuffix(rawLine);
  const tokens = tokenizeWithOffsets(code);
  const head = tokens[0];
  if (!head) {
    return null;
  }
  const codeEndCol = code.trimEnd().length;

  if (head.text === 'swipe') {
    const { positionals, flags } = splitArgs(tokens.slice(1));
    return checkArity({
      line,
      codeEndCol,
      rule: SWIPE_RULE,
      label: 'swipe',
      command: [head],
      positionals,
      flags,
      migrate: migrateRetiredSwipe,
    });
  }

  if (head.text !== 'gesture') {
    return null;
  }

  const kindToken = tokens[1];
  if (!kindToken || kindToken.text.startsWith('-')) {
    return {
      line,
      startCol: head.start,
      endCol: head.end,
      codeEndCol,
      message: `gesture needs a kind: ${GESTURE_KINDS.join(', ')}.`,
      code: 'unknown-gesture-kind',
      fixes: [],
    };
  }
  if (!isGestureKind(kindToken.text)) {
    return {
      line,
      startCol: kindToken.start,
      endCol: kindToken.end,
      codeEndCol,
      message: `Unknown gesture kind "${kindToken.text}". Expected one of: ${GESTURE_KINDS.join(', ')}.`,
      code: 'unknown-gesture-kind',
      fixes: [],
    };
  }

  const kind = kindToken.text;
  const { positionals, flags } = splitArgs(tokens.slice(2));
  const valueIssue = checkValues(kind, positionals, line, codeEndCol);
  if (valueIssue) {
    return valueIssue;
  }
  return checkArity({
    line,
    codeEndCol,
    rule: GESTURE_RULES[kind],
    label: `gesture ${kind}`,
    command: [head, kindToken],
    positionals,
    flags,
    migrate: kind === 'rotate' ? migrateRetiredRotate : migrateRetiredTrailing,
  });
}

interface ArityCheck {
  readonly line: number;
  readonly codeEndCol: number;
  readonly rule: ArityRule;
  readonly label: string;
  readonly command: readonly Token[];
  readonly positionals: readonly Token[];
  readonly flags: readonly Token[];
  readonly migrate: (
    command: readonly Token[],
    positionals: readonly Token[],
    flags: readonly Token[],
  ) => readonly GestureFix[];
}

function checkArity(check: ArityCheck): GestureIssue | null {
  const { rule, positionals, label, line, codeEndCol } = check;
  const count = positionals.length;

  if (count < rule.min) {
    const anchor = check.command[check.command.length - 1] ?? check.command[0]!;
    return {
      line,
      startCol: check.command[0]!.start,
      endCol: anchor.end,
      codeEndCol,
      message: `${label} needs at least ${rule.min} argument${rule.min === 1 ? '' : 's'} (got ${count}). ${rule.usage}.`,
      code: 'gesture-arity',
      fixes: [],
    };
  }

  if (count <= rule.max) {
    return null;
  }

  const extra = positionals[rule.max]!;
  const last = positionals[positionals.length - 1]!;
  if (rule.retired && count === rule.max + 1) {
    const fixes = check.migrate(check.command, positionals, check.flags);
    return {
      line,
      startCol: extra.start,
      endCol: extra.end,
      codeEndCol,
      message: `The trailing ${rule.retired} positional was removed from ${label} in agent-device 0.20. ${rule.usage}.${fixes[0] ? ` ${fixes[0].title}.` : ''}`,
      code: 'retired-gesture-positional',
      fixes,
    };
  }

  return {
    line,
    startCol: extra.start,
    endCol: last.end,
    codeEndCol,
    message: `${label} got ${count} arguments. ${rule.usage}.`,
    code: 'gesture-arity',
    fixes: [],
  };
}

function checkValues(
  kind: GestureKind,
  positionals: readonly Token[],
  line: number,
  codeEndCol: number,
): GestureIssue | null {
  const first = positionals[0];
  if (!first) {
    return null;
  }
  if (kind === 'fling' && !(FLING_DIRECTIONS as readonly string[]).includes(first.text)) {
    return {
      line,
      startCol: first.start,
      endCol: first.end,
      codeEndCol,
      message: `gesture fling direction must be one of ${FLING_DIRECTIONS.join(', ')}, got "${first.text}".`,
      code: 'invalid-gesture-value',
      fixes: [],
    };
  }
  if (kind === 'swipe' && !(SWIPE_PRESETS as readonly string[]).includes(first.text)) {
    return {
      line,
      startCol: first.start,
      endCol: first.end,
      codeEndCol,
      message: `gesture swipe preset must be one of ${SWIPE_PRESETS.join(', ')}, got "${first.text}".`,
      code: 'invalid-gesture-value',
      fixes: [],
    };
  }
  return null;
}

// ─── Migrations (same text agent-device prints in its INVALID_ARGS error) ────

function rebuild(
  command: readonly Token[],
  positionals: readonly string[],
  flags: readonly Token[],
): string {
  return [...command.map((t) => t.text), ...positionals, ...flags.map((t) => t.text)].join(' ');
}

function migrateRetiredTrailing(
  command: readonly Token[],
  positionals: readonly Token[],
  flags: readonly Token[],
): readonly GestureFix[] {
  const kept = positionals.slice(0, -1).map((t) => t.text);
  const canonical = rebuild(command, kept, flags);
  return [
    {
      title: `Drop the trailing ${positionals[positionals.length - 1]!.text}`,
      replacement: canonical,
    },
  ];
}

function migrateRetiredRotate(
  command: readonly Token[],
  positionals: readonly Token[],
  flags: readonly Token[],
): readonly GestureFix[] {
  const kept = positionals.slice(0, -1).map((t) => t.text);
  return [
    {
      title: 'Drop the velocity; rotation pacing derives from degrees',
      replacement: rebuild(command, kept, flags),
    },
  ];
}

function migrateRetiredSwipe(
  command: readonly Token[],
  positionals: readonly Token[],
  flags: readonly Token[],
): readonly GestureFix[] {
  const [x1, y1, x2, y2, durationMs] = positionals.map((t) => t.text) as [
    string,
    string,
    string,
    string,
    string,
  ];
  const fixes: GestureFix[] = [
    {
      title: 'Drop the duration (default-duration swipe)',
      replacement: rebuild(command, [x1, y1, x2, y2], flags),
    },
  ];
  const nx1 = Number(x1);
  const ny1 = Number(y1);
  const nx2 = Number(x2);
  const ny2 = Number(y2);
  if ([nx1, ny1, nx2, ny2].every(Number.isFinite)) {
    const panCommand: Token[] = [
      { text: 'gesture', start: 0, end: 0 },
      { text: 'pan', start: 0, end: 0 },
    ];
    // swipe's --count/--pause-ms/--pattern do not apply to pan.
    const panFlags = flags.filter((f) => !['--count', '--pause-ms', '--pattern'].includes(f.text));
    fixes.push({
      title: `Convert to gesture pan (keeps the ${durationMs}ms timing)`,
      replacement: rebuild(
        panCommand,
        [x1, y1, String(nx2 - nx1), String(ny2 - ny1), durationMs],
        dropFlagValues(panFlags, flags),
      ),
    });
  }
  return fixes;
}

/** Keep value tokens only for flags that survived filtering. */
function dropFlagValues(kept: readonly Token[], all: readonly Token[]): Token[] {
  const out: Token[] = [];
  for (let i = 0; i < all.length; i++) {
    const tok = all[i]!;
    const isFlag = tok.text.startsWith('-');
    if (isFlag) {
      if (kept.includes(tok)) {
        out.push(tok);
        if (VALUE_FLAGS.has(tok.text) && all[i + 1] && !all[i + 1]!.text.startsWith('-')) {
          out.push(all[i + 1]!);
        }
      }
      if (VALUE_FLAGS.has(tok.text)) {
        i++;
      }
    }
  }
  return out;
}

// ─── Tokenizing ─────────────────────────────────────────────────────────────

function isGestureKind(value: string): value is GestureKind {
  return (GESTURE_KINDS as readonly string[]).includes(value);
}

function splitArgs(tokens: readonly Token[]): { positionals: Token[]; flags: Token[] } {
  const positionals: Token[] = [];
  const flags: Token[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (tok.text.startsWith('-') && !/^-\d/.test(tok.text)) {
      flags.push(tok);
      const next = tokens[i + 1];
      if (VALUE_FLAGS.has(tok.text) && next && !next.text.startsWith('-')) {
        flags.push(next);
        i++;
      }
      continue;
    }
    positionals.push(tok);
  }
  return { positionals, flags };
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
