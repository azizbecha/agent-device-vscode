export interface SnapshotRef {
  readonly id: string;
  readonly type?: string;
  readonly label?: string;
  readonly depth: number;
}

const REF_LINE = /^([ \t]*)@(e\d+)\s+\[([^\]]+)\](?:\s+"((?:[^"\\]|\\.)*)")?/;

export function parseSnapshotRefs(stdout: string): SnapshotRef[] {
  const refs: SnapshotRef[] = [];
  const seen = new Set<string>();
  for (const line of stdout.split(/\r?\n/)) {
    const match = REF_LINE.exec(line);
    if (!match) {
      continue;
    }
    const [, indent, id, type, label] = match;
    if (!id || seen.has(id)) {
      continue;
    }
    seen.add(id);
    refs.push({
      id,
      type: type?.trim(),
      label: label ? unescapeLabel(label) : undefined,
      depth: indentDepth(indent ?? ''),
    });
  }
  return refs;
}

function unescapeLabel(value: string): string {
  return value.replace(/\\(.)/g, '$1');
}

function indentDepth(indent: string): number {
  let depth = 0;
  for (const ch of indent) {
    if (ch === '\t') {
      depth += 1;
    } else {
      depth += 0.5;
    }
  }
  return Math.floor(depth);
}
