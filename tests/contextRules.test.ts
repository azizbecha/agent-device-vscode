import { describe, expect, it } from 'vitest';

import { validateScriptHeader } from '../src/language/contextRules';

function codes(script: string): string[] {
  return validateScriptHeader(script.split('\n')).map((i) => i.code);
}

describe('validateScriptHeader', () => {
  it('accepts a well-formed multi-platform header', () => {
    expect(
      codes(`context platform=macos target=desktop timeout=60000 retries=1
env APP="TextEdit"
open "\${APP}" --relaunch
click "role=button" --platform apple --target desktop`),
    ).toEqual([]);
  });

  it('accepts every non-web platform selector in context', () => {
    for (const p of ['ios', 'android', 'macos', 'linux', 'harmonyos', 'vega', 'apple']) {
      expect(codes(`context platform=${p}`), p).toEqual([]);
    }
  });

  it('rejects web in context but allows it as a per-command flag', () => {
    const issues = validateScriptHeader(['context platform=web', 'open x --platform web']);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('unsupported-context-platform');
    expect(issues[0]?.message).toContain('--platform web');
    expect(issues[0]?.startCol).toBe('context platform='.length);
  });

  it('flags unknown platform and target values with ranges on the value', () => {
    const issues = validateScriptHeader([
      'context platform=windows target=watch',
      'open x --platform tizen --target car',
    ]);
    expect(issues.map((i) => [i.code, i.line, i.startCol, i.endCol])).toEqual([
      ['unsupported-context-platform', 0, 17, 24],
      ['unsupported-target', 0, 32, 37],
      ['unsupported-platform', 1, 18, 23],
      ['unsupported-target', 1, 33, 36],
    ]);
  });

  it('validates timeout and retries values', () => {
    expect(codes('context timeout=abc')).toEqual(['invalid-context-value']);
    expect(codes('context timeout=0')).toEqual(['invalid-context-value']);
    expect(codes('context retries=4')).toEqual(['invalid-context-value']);
    expect(codes('context retries=3 timeout=1')).toEqual([]);
  });

  it('reports duplicate context keys across lines', () => {
    const issues = validateScriptHeader(['context platform=ios', 'context platform=android']);
    expect(issues.map((i) => i.code)).toEqual(['duplicate-context-key']);
    expect(issues[0]?.line).toBe(1);
    expect(issues[0]?.message).toContain('line 1');
  });

  it('allows different keys on separate context lines', () => {
    expect(codes('context platform=ios\ncontext timeout=10000')).toEqual([]);
  });

  it('warns on unknown context keys without failing', () => {
    const issues = validateScriptHeader(['context platform=ios kind=simulator']);
    expect(issues).toHaveLength(1);
    expect(issues[0]?.code).toBe('unknown-context-key');
    expect(issues[0]?.severity).toBe('warning');
  });

  it('rejects header lines after the first action', () => {
    expect(codes('open x\ncontext platform=ios\nenv A=1')).toEqual([
      'header-after-action',
      'header-after-action',
    ]);
  });

  it('ignores comments and strings', () => {
    expect(codes('# context platform=nope\nfill @e1 "--platform nope"')).toEqual([]);
  });
});
