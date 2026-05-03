import { describe, expect, it } from 'vitest';

import { dequote, interpolate, parseScript } from '../src/runners/scriptParser';

describe('parseScript', () => {
  it('returns an empty result for blank or comment-only input', () => {
    expect(parseScript('')).toEqual({ env: {}, actions: [] });
    expect(parseScript('# only comments\n# nothing else')).toEqual({ env: {}, actions: [] });
  });

  it('captures context directives', () => {
    const parsed = parseScript(`context platform=ios
context timeout=10000
context retries=3`);
    expect(parsed.platform).toBe('ios');
    expect(parsed.timeoutMs).toBe(10_000);
    expect(parsed.retries).toBe(3);
    expect(parsed.actions).toEqual([]);
  });

  it('captures env directives', () => {
    const parsed = parseScript(`env APP_ID=com.example
env USER_EMAIL=qa@example.com`);
    expect(parsed.env).toEqual({
      APP_ID: 'com.example',
      USER_EMAIL: 'qa@example.com',
    });
  });

  it('records action lines with line numbers and tokenized argv', () => {
    const parsed = parseScript(`# header
context platform=ios

open com.apple.Preferences --relaunch
click "label=Sign in"`);
    expect(parsed.actions).toHaveLength(2);
    expect(parsed.actions[0]).toEqual({
      lineNumber: 4,
      raw: 'open com.apple.Preferences --relaunch',
      argv: ['open', 'com.apple.Preferences', '--relaunch'],
    });
    expect(parsed.actions[1]?.lineNumber).toBe(5);
    expect(parsed.actions[1]?.argv).toEqual(['click', '"label=Sign in"']);
  });

  it('strips trailing comments outside strings but keeps # inside quotes', () => {
    const parsed = parseScript(`click "search #123" # find that issue`);
    expect(parsed.actions[0]?.raw).toBe('click "search #123"');
    expect(parsed.actions[0]?.argv).toEqual(['click', '"search #123"']);
  });

  it('preserves backslash escapes inside double-quoted tokens', () => {
    const parsed = parseScript('click "label=Say \\"hi\\""');
    expect(parsed.actions[0]?.argv).toEqual(['click', '"label=Say \\"hi\\""']);
  });

  it('handles CRLF line endings', () => {
    const parsed = parseScript('open one\r\nopen two\r\n');
    expect(parsed.actions.map((a) => a.lineNumber)).toEqual([1, 2]);
  });
});

describe('interpolate', () => {
  it('substitutes simple variables', () => {
    expect(interpolate(['open', '${APP_ID}'], { APP_ID: 'com.x' })).toEqual(['open', 'com.x']);
  });

  it('substitutes inside quoted tokens', () => {
    expect(interpolate(['fill', '"${EMAIL}"'], { EMAIL: 'qa@example.com' })).toEqual([
      'fill',
      '"qa@example.com"',
    ]);
  });

  it('uses the inline default when the variable is missing', () => {
    expect(interpolate(['open', '${APP_ID:-com.fallback}'], {})).toEqual(['open', 'com.fallback']);
  });

  it('prefers a defined value over the default fallback', () => {
    expect(interpolate(['open', '${APP_ID:-com.fallback}'], { APP_ID: 'com.real' })).toEqual([
      'open',
      'com.real',
    ]);
  });

  it('substitutes empty string when neither value nor fallback is provided', () => {
    expect(interpolate(['open', '${MISSING}'], {})).toEqual(['open', '']);
  });

  it('leaves tokens without ${} untouched', () => {
    expect(interpolate(['click', '@e3'], { APP_ID: 'irrelevant' })).toEqual(['click', '@e3']);
  });
});

describe('dequote', () => {
  it('strips surrounding double quotes', () => {
    expect(dequote('"hello"')).toBe('hello');
  });

  it('unescapes backslash-escaped characters', () => {
    expect(dequote('"He said \\"hi\\""')).toBe('He said "hi"');
    expect(dequote('"line\\nfeed"')).toBe('linenfeed');
  });

  it('passes unquoted tokens through unchanged', () => {
    expect(dequote('@e3')).toBe('@e3');
    expect(dequote('--platform')).toBe('--platform');
  });

  it('does not strip a single trailing quote', () => {
    expect(dequote('"unbalanced')).toBe('"unbalanced');
  });
});
