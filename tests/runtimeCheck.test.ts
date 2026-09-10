import { describe, expect, it } from 'vitest';

import {
  describeNodeRequirement,
  parseNodeVersion,
  satisfiesNodeRequirement,
} from '../src/services/runtimeCheck';

describe('parseNodeVersion', () => {
  it('parses with or without the leading v', () => {
    expect(parseNodeVersion('v22.15.1')).toEqual({ major: 22, minor: 15, patch: 1 });
    expect(parseNodeVersion('20.19.0')).toEqual({ major: 20, minor: 19, patch: 0 });
  });

  it('returns null for garbage', () => {
    expect(parseNodeVersion('')).toBeNull();
    expect(parseNodeVersion('electron')).toBeNull();
  });
});

describe('satisfiesNodeRequirement', () => {
  it('accepts the minimum and anything newer', () => {
    expect(satisfiesNodeRequirement('22.12.0')).toBe(true);
    expect(satisfiesNodeRequirement('v22.15.1')).toBe(true);
    expect(satisfiesNodeRequirement('24.0.0')).toBe(true);
  });

  it('rejects older majors and older minors of the same major', () => {
    expect(satisfiesNodeRequirement('20.19.0')).toBe(false);
    expect(satisfiesNodeRequirement('22.11.9')).toBe(false);
    expect(satisfiesNodeRequirement('nope')).toBe(false);
  });

  it('honours a custom requirement', () => {
    expect(satisfiesNodeRequirement('18.0.0', { major: 18, minor: 0 })).toBe(true);
  });
});

describe('describeNodeRequirement', () => {
  it('formats major.minor', () => {
    expect(describeNodeRequirement()).toBe('22.12');
  });
});
