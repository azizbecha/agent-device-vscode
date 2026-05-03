import { describe, expect, it } from 'vitest';

import { parseSnapshotRefs } from '../src/runners/snapshotParser';

describe('parseSnapshotRefs', () => {
  it('parses a flat list with type and label', () => {
    const stdout = `Snapshot: 3 nodes
@e1 [application] "Settings"
@e2 [text] "General"
@e3 [button] "Sign in"`;
    expect(parseSnapshotRefs(stdout)).toEqual([
      { id: 'e1', type: 'application', label: 'Settings', depth: 0 },
      { id: 'e2', type: 'text', label: 'General', depth: 0 },
      { id: 'e3', type: 'button', label: 'Sign in', depth: 0 },
    ]);
  });

  it('parses entries without a label', () => {
    const stdout = `@e1 [window]
@e2 [other]`;
    expect(parseSnapshotRefs(stdout)).toEqual([
      { id: 'e1', type: 'window', label: undefined, depth: 0 },
      { id: 'e2', type: 'other', label: undefined, depth: 0 },
    ]);
  });

  it('unescapes backslash-escaped quotes inside labels', () => {
    const refs = parseSnapshotRefs('@e1 [text] "He said \\"hi\\""');
    expect(refs).toHaveLength(1);
    expect(refs[0]?.label).toBe('He said "hi"');
  });

  it('computes depth from leading whitespace (2 spaces = 1 level, 1 tab = 1 level)', () => {
    const stdout = [
      '@e1 [application] "Root"',
      '  @e2 [window]',
      '    @e3 [button] "OK"',
      '\t@e4 [text] "tabbed"',
      '\t\t@e5 [image]',
    ].join('\n');
    const depths = parseSnapshotRefs(stdout).map((r) => r.depth);
    expect(depths).toEqual([0, 1, 2, 1, 2]);
  });

  it('ignores non-ref lines and trailing diagnostic output', () => {
    const stdout = `Snapshot: 1 nodes
some preface
@e1 [text] "Real"
captured at 2026-05-03T10:11:12Z
not @e99 [fake]`;
    const refs = parseSnapshotRefs(stdout);
    expect(refs.map((r) => r.id)).toEqual(['e1']);
  });

  it('deduplicates refs that appear twice', () => {
    const stdout = `@e1 [text] "First"
@e2 [text] "Second"
@e1 [text] "Duplicate first"`;
    const refs = parseSnapshotRefs(stdout);
    expect(refs.map((r) => r.id)).toEqual(['e1', 'e2']);
    expect(refs[0]?.label).toBe('First');
  });

  it('returns an empty array for empty stdout', () => {
    expect(parseSnapshotRefs('')).toEqual([]);
    expect(parseSnapshotRefs('\n\n')).toEqual([]);
    expect(parseSnapshotRefs('Snapshot: 0 nodes\n')).toEqual([]);
  });

  it('handles CRLF line endings', () => {
    const stdout = '@e1 [text] "A"\r\n@e2 [button] "B"\r\n';
    expect(parseSnapshotRefs(stdout).map((r) => r.id)).toEqual(['e1', 'e2']);
  });
});
