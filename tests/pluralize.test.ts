import { describe, expect, it } from 'vitest';

import { pluralize } from '../src/util/pluralize';

describe('pluralize', () => {
  it('uses the singular form for exactly 1', () => {
    expect(pluralize(1, 'step')).toBe('1 step');
    expect(pluralize(1, 'child', 'children')).toBe('1 child');
  });

  it('appends s by default for non-1 counts', () => {
    expect(pluralize(0, 'step')).toBe('0 steps');
    expect(pluralize(2, 'step')).toBe('2 steps');
    expect(pluralize(42, 'step')).toBe('42 steps');
  });

  it('uses the explicit plural form when provided', () => {
    expect(pluralize(2, 'child', 'children')).toBe('2 children');
    expect(pluralize(0, 'mouse', 'mice')).toBe('0 mice');
  });

  it('handles negative counts', () => {
    expect(pluralize(-1, 'step')).toBe('-1 steps');
  });
});
