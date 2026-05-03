import { describe, expect, it } from 'vitest';

import { formatDuration } from '../src/util/duration';

describe('formatDuration', () => {
  it('formats sub-second values in milliseconds', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(1)).toBe('1ms');
    expect(formatDuration(345)).toBe('345ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('flips to seconds at 1000ms', () => {
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(1500)).toBe('1s');
    expect(formatDuration(45_000)).toBe('45s');
    expect(formatDuration(59_999)).toBe('59s');
  });

  it('flips to minutes at 60s', () => {
    expect(formatDuration(60_000)).toBe('1m');
    expect(formatDuration(60_500)).toBe('1m');
    expect(formatDuration(83_000)).toBe('1m 23s');
    expect(formatDuration(3_599_999)).toBe('59m 59s');
  });

  it('flips to hours at 60m', () => {
    expect(formatDuration(3_600_000)).toBe('1h');
    expect(formatDuration(3_900_000)).toBe('1h 5m');
    expect(formatDuration(7_200_000)).toBe('2h');
  });

  it('clamps negative values to zero', () => {
    expect(formatDuration(-1)).toBe('0ms');
    expect(formatDuration(-100_000)).toBe('0ms');
  });

  it('floors fractional milliseconds', () => {
    expect(formatDuration(123.9)).toBe('123ms');
  });
});
