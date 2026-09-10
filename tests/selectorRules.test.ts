import { describe, expect, it } from 'vitest';

import {
  findSelectorStrings,
  looksLikeSelector,
  splitFallbackChain,
  validateSelectorLines,
} from '../src/language/selectorRules';

function codes(line: string): string[] {
  return validateSelectorLines([line]).map((i) => i.code);
}

describe('looksLikeSelector', () => {
  it('detects key=value, chains, and bare boolean terms', () => {
    expect(looksLikeSelector('label=General')).toBe(true);
    expect(looksLikeSelector('a || b')).toBe(true);
    expect(looksLikeSelector('visible')).toBe(true);
    expect(looksLikeSelector('Welcome back')).toBe(false);
    expect(looksLikeSelector('qa@example.com')).toBe(false);
  });
});

describe('findSelectorStrings', () => {
  it('picks the selector positional per command', () => {
    expect(findSelectorStrings('click "label=General" --settle').map((s) => s.inner)).toEqual([
      'label=General',
    ]);
    expect(findSelectorStrings('fill "id=email" "qa@example.com"').map((s) => s.inner)).toEqual([
      'id=email',
    ]);
    expect(findSelectorStrings('is visible "role=button"').map((s) => s.inner)).toEqual([
      'role=button',
    ]);
    expect(findSelectorStrings('get text "label=About"').map((s) => s.inner)).toEqual([
      'label=About',
    ]);
  });

  it('handles selector-shaped strings on wait, gesture drag and --crop-on', () => {
    expect(findSelectorStrings('wait "label=Loading..." 5000').map((s) => s.inner)).toEqual([
      'label=Loading...',
    ]);
    expect(findSelectorStrings('wait text "Welcome" 5000')).toEqual([]);
    expect(findSelectorStrings('wait "Welcome" 5000')).toEqual([]);
    expect(
      findSelectorStrings('gesture drag "id=src" "label=Archive" 700 600 200').map((s) => s.inner),
    ).toEqual(['id=src', 'label=Archive']);
    expect(
      findSelectorStrings('screenshot out.png --crop-on "label=Save"').map((s) => s.inner),
    ).toEqual(['label=Save']);
  });

  it('ignores refs, coordinates, and non-selector commands', () => {
    expect(findSelectorStrings('click @e4')).toEqual([]);
    expect(findSelectorStrings('press 100 200')).toEqual([]);
    expect(findSelectorStrings('type "label=not a selector"')).toEqual([]);
  });

  it('reports absolute columns', () => {
    const [s] = findSelectorStrings('  click "label=General"');
    expect([s?.start, s?.innerStart, s?.end]).toEqual([8, 9, 23]);
  });
});

describe('splitFallbackChain', () => {
  it('splits on || outside quoted values', () => {
    expect(splitFallbackChain('label=A || id=b').map((s) => s.text.trim())).toEqual([
      'label=A',
      'id=b',
    ]);
    expect(splitFallbackChain("label='a || b' || id=c").map((s) => s.text.trim())).toEqual([
      "label='a || b'",
      'id=c',
    ]);
    expect(splitFallbackChain('label=\\"x || y\\" || id=c').map((s) => s.text.trim())).toEqual([
      'label=\\"x || y\\"',
      'id=c',
    ]);
  });
});

describe('validateSelectorLines', () => {
  it('accepts valid selectors', () => {
    for (const line of [
      'click "label=General"',
      'click "role=button label=Continue"',
      'is visible "role=button label=Continue || label=Continue"',
      'wait "label=\\"System Report...\\" || label=Chip" 5000',
      'click "label=\'Sign in\' visible"',
      'is exists "appname=gnome-calculator || windowtitle=Calculator"',
      'click "visible=true hittable"',
      'wait "Welcome back" 5000',
    ]) {
      expect(codes(line), line).toEqual([]);
    }
  });

  it('flags unknown keys with a role hint', () => {
    const issues = validateSelectorLines(['click "button=Save"']);
    expect(issues.map((i) => i.code)).toEqual(['unknown-selector-key']);
    expect(issues[0]?.message).toContain('role=button');
    expect([issues[0]?.startCol, issues[0]?.endCol]).toEqual([7, 13]);
  });

  it('flags unknown keys without a hint', () => {
    expect(codes('click "name=Save"')).toEqual(['unknown-selector-key']);
  });

  it('flags empty values, empty segments, and bare words', () => {
    expect(codes('click "label="')).toEqual(['empty-selector-value']);
    expect(codes('click "label=A ||"')).toEqual(['empty-selector-segment']);
    expect(codes('click "label=A || || id=b"')).toEqual(['empty-selector-segment']);
    expect(codes('click "label=A button"')).toEqual(['bare-selector-word']);
  });

  it('flags unterminated quoted values', () => {
    expect(codes('click "label=\'Sign in"')).toEqual(['unterminated-selector-quote']);
  });

  it('ignores comments', () => {
    expect(codes('click "label=A" # button=x')).toEqual([]);
  });
});
