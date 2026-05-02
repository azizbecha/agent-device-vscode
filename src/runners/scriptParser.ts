export interface ParsedAction {
  readonly lineNumber: number;
  readonly raw: string;
  readonly argv: readonly string[];
}

export interface ParsedScript {
  readonly platform?: string;
  readonly timeoutMs?: number;
  readonly retries?: number;
  readonly env: Readonly<Record<string, string>>;
  readonly actions: readonly ParsedAction[];
}

const VAR_PATTERN = /\$\{([A-Z_][A-Z0-9_]*)(?::-([^}]*))?\}/g;

export function parseScript(text: string): ParsedScript {
  const env: Record<string, string> = {};
  const actions: ParsedAction[] = [];
  let platform: string | undefined;
  let timeoutMs: number | undefined;
  let retries: number | undefined;

  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const stripped = stripComment(lines[i] ?? '').trim();
    if (stripped.length === 0) {
      continue;
    }

    const argv = tokenize(stripped);
    if (argv.length === 0) {
      continue;
    }

    const head = argv[0];
    if (head === 'context') {
      for (const tok of argv.slice(1)) {
        const eq = tok.indexOf('=');
        if (eq < 0) {
          continue;
        }
        const key = tok.slice(0, eq);
        const value = tok.slice(eq + 1);
        if (key === 'platform') {
          platform = value;
        } else if (key === 'timeout') {
          timeoutMs = Number.parseInt(value, 10);
        } else if (key === 'retries') {
          retries = Number.parseInt(value, 10);
        }
      }
      continue;
    }

    if (head === 'env') {
      for (const tok of argv.slice(1)) {
        const eq = tok.indexOf('=');
        if (eq > 0) {
          env[tok.slice(0, eq)] = tok.slice(eq + 1);
        }
      }
      continue;
    }

    actions.push({ lineNumber: i + 1, raw: stripped, argv });
  }

  return { platform, timeoutMs, retries, env, actions };
}

export function interpolate(
  argv: readonly string[],
  vars: Readonly<Record<string, string>>,
): string[] {
  return argv.map((token) => substitute(token, vars));
}

export function dequote(token: string): string {
  if (token.length >= 2 && token.startsWith('"') && token.endsWith('"')) {
    return token.slice(1, -1).replace(/\\(.)/g, '$1');
  }
  return token;
}

function substitute(input: string, vars: Readonly<Record<string, string>>): string {
  return input.replace(VAR_PATTERN, (_match, name, fallback) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) {
      return vars[name] ?? '';
    }
    return fallback ?? '';
  });
}

function stripComment(line: string): string {
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

function tokenize(input: string): string[] {
  const out: string[] = [];
  let i = 0;
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i] ?? '')) {
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
    while (i < input.length && !/\s/.test(input[i] ?? '')) {
      i++;
    }
    out.push(input.slice(start, i));
  }
  return out;
}
