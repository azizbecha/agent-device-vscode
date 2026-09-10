/**
 * Pure (vscode-free) validation of the `.ad` header and of the target flags
 * that mirror it, so it can be unit-tested and reused by diagnostics.
 *
 * Mirrors agent-device 0.21 `@agent-device/ad-script`:
 *  - `context` / `env` lines must precede every action line;
 *  - `context platform=` accepts every `--platform` selector except `web`;
 *  - `context target=` is `mobile|tv|desktop`;
 *  - `context retries=` is an integer 0..3, `timeout=` a positive integer;
 *  - a context key declared twice fails fast.
 */
import {
  CONTEXT_MAX_RETRIES,
  CONTEXT_PLATFORMS,
  CONTEXT_PLATFORMS_SET,
  DEVICE_TARGETS,
  DEVICE_TARGETS_SET,
  PLATFORM_SELECTORS,
  PLATFORM_SELECTORS_SET,
} from '../data/platforms';

export type HeaderIssueCode =
  | 'unsupported-platform'
  | 'unsupported-context-platform'
  | 'unsupported-target'
  | 'invalid-context-value'
  | 'duplicate-context-key'
  | 'unknown-context-key'
  | 'header-after-action';

export interface HeaderIssue {
  readonly line: number;
  readonly startCol: number;
  readonly endCol: number;
  readonly message: string;
  readonly severity: 'error' | 'warning';
  readonly code: HeaderIssueCode;
}

const KNOWN_CONTEXT_KEYS: ReadonlySet<string> = new Set([
  'platform',
  'target',
  'timeout',
  'retries',
]);

const PLATFORM_FLAG = /--platform(?:\s+|=)([A-Za-z0-9_-]+)/g;
const TARGET_FLAG = /--target(?:\s+|=)([A-Za-z0-9_-]+)/g;
const CONTEXT_PAIR = /(?<=\s)([A-Za-z_][A-Za-z0-9_-]*)=(\S*)/g;

export function validateScriptHeader(lines: readonly string[]): HeaderIssue[] {
  const issues: HeaderIssue[] = [];
  const seenContextKeys = new Map<string, number>();
  let sawAction = false;

  for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
    const code = stripCommentSuffix(lines[lineIdx] ?? '');
    if (code.trim().length === 0) {
      continue;
    }

    const head = /^\s*([A-Za-z][A-Za-z0-9-]*)/.exec(code)?.[1];
    const isHeader = head === 'context' || head === 'env';

    if (isHeader && sawAction) {
      const startCol = code.indexOf(head);
      issues.push({
        line: lineIdx,
        startCol,
        endCol: startCol + head.length,
        message: `\`${head}\` lines must come before the first action. agent-device rejects a script whose header follows an action.`,
        severity: 'error',
        code: 'header-after-action',
      });
    }

    if (head === 'context') {
      issues.push(...validateContextLine(code, lineIdx, seenContextKeys));
      continue;
    }
    if (head === 'env') {
      continue;
    }

    sawAction = true;
    issues.push(...validateTargetFlags(code, lineIdx));
  }

  return issues;
}

function validateContextLine(
  code: string,
  lineIdx: number,
  seen: Map<string, number>,
): HeaderIssue[] {
  const issues: HeaderIssue[] = [];
  for (const match of code.matchAll(CONTEXT_PAIR)) {
    const key = match[1] ?? '';
    const value = match[2] ?? '';
    const keyStart = match.index ?? 0;
    const valueStart = keyStart + key.length + 1;

    if (!KNOWN_CONTEXT_KEYS.has(key)) {
      issues.push({
        line: lineIdx,
        startCol: keyStart,
        endCol: keyStart + key.length,
        message: `Unknown context key "${key}" is ignored. Known keys: ${[...KNOWN_CONTEXT_KEYS].join(', ')}.`,
        severity: 'warning',
        code: 'unknown-context-key',
      });
      continue;
    }

    const previous = seen.get(key);
    if (previous !== undefined) {
      issues.push({
        line: lineIdx,
        startCol: keyStart,
        endCol: keyStart + key.length,
        message: `Context key "${key}" is already set on line ${previous + 1}. agent-device fails fast on duplicate context keys.`,
        severity: 'error',
        code: 'duplicate-context-key',
      });
    } else {
      seen.set(key, lineIdx);
    }

    const valueIssue = validateContextValue(key, value, lineIdx, valueStart);
    if (valueIssue) {
      issues.push(valueIssue);
    }
  }
  return issues;
}

function validateContextValue(
  key: string,
  value: string,
  line: number,
  startCol: number,
): HeaderIssue | null {
  const endCol = startCol + Math.max(value.length, 1);
  switch (key) {
    case 'platform':
      if (CONTEXT_PLATFORMS_SET.has(value)) {
        return null;
      }
      if (value === 'web') {
        return {
          line,
          startCol,
          endCol,
          message:
            '`context platform=web` is not supported: replay does not target web yet. Pass `--platform web` on individual commands instead.',
          severity: 'error',
          code: 'unsupported-context-platform',
        };
      }
      return {
        line,
        startCol,
        endCol,
        message: `Unsupported platform "${value}". Expected one of ${list(CONTEXT_PLATFORMS)}.`,
        severity: 'error',
        code: 'unsupported-context-platform',
      };
    case 'target':
      if (DEVICE_TARGETS_SET.has(value)) {
        return null;
      }
      return {
        line,
        startCol,
        endCol,
        message: `Unsupported target "${value}". Expected one of ${list(DEVICE_TARGETS)}.`,
        severity: 'error',
        code: 'unsupported-target',
      };
    case 'timeout':
      if (/^\d+$/.test(value) && Number.parseInt(value, 10) > 0) {
        return null;
      }
      return {
        line,
        startCol,
        endCol,
        message: `context timeout must be a positive integer number of milliseconds, got "${value}".`,
        severity: 'error',
        code: 'invalid-context-value',
      };
    case 'retries': {
      const n = /^\d+$/.test(value) ? Number.parseInt(value, 10) : Number.NaN;
      if (Number.isInteger(n) && n >= 0 && n <= CONTEXT_MAX_RETRIES) {
        return null;
      }
      return {
        line,
        startCol,
        endCol,
        message: `context retries must be an integer between 0 and ${CONTEXT_MAX_RETRIES}, got "${value}".`,
        severity: 'error',
        code: 'invalid-context-value',
      };
    }
    default:
      return null;
  }
}

function validateTargetFlags(rawCode: string, lineIdx: number): HeaderIssue[] {
  const issues: HeaderIssue[] = [];
  // Blank out string contents (keeping columns) so a flag-shaped literal is not a flag.
  const code = maskStrings(rawCode);
  for (const match of code.matchAll(PLATFORM_FLAG)) {
    const value = match[1] ?? '';
    if (PLATFORM_SELECTORS_SET.has(value)) {
      continue;
    }
    const startCol = (match.index ?? 0) + match[0].length - value.length;
    issues.push({
      line: lineIdx,
      startCol,
      endCol: startCol + value.length,
      message: `Unsupported platform "${value}". Expected one of ${list(PLATFORM_SELECTORS)}.`,
      severity: 'error',
      code: 'unsupported-platform',
    });
  }
  for (const match of code.matchAll(TARGET_FLAG)) {
    const value = match[1] ?? '';
    if (DEVICE_TARGETS_SET.has(value)) {
      continue;
    }
    const startCol = (match.index ?? 0) + match[0].length - value.length;
    issues.push({
      line: lineIdx,
      startCol,
      endCol: startCol + value.length,
      message: `Unsupported target "${value}". Expected one of ${list(DEVICE_TARGETS)}.`,
      severity: 'error',
      code: 'unsupported-target',
    });
  }
  return issues;
}

function list(values: readonly string[]): string {
  return values.map((v) => `"${v}"`).join(', ');
}

/** Replace the inside of every double-quoted string with spaces, preserving length. */
export function maskStrings(line: string): string {
  let out = '';
  let inString = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i] ?? '';
    if (inString && ch === '\\') {
      out += '  ';
      i++;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }
    out += inString ? ' ' : ch;
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
