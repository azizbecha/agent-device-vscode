import { describe, expect, it } from 'vitest';

import { validateGestureLine, validateGestureLines } from '../src/language/gestureRules';

describe('validateGestureLine', () => {
  it('accepts every current gesture form', () => {
    for (const line of [
      'swipe 540 1500 540 500',
      'swipe 540 1500 540 500 --count 8 --pause-ms 30 --pattern ping-pong',
      'gesture pan 200 420 0 -80',
      'gesture pan 200 420 80 -40 700 --pointer-count 2',
      'gesture fling right 200 420 180',
      'gesture fling up 200 420',
      'gesture swipe left-edge',
      'gesture pinch 2.0',
      'gesture pinch 0.5 200 400',
      'gesture rotate 35 200 420',
      'gesture transform 200 420 80 -40 2 35 700',
      'gesture transform 200 420 80 -40 2 35',
      'gesture drag "id=\\"drag-source\\"" "id=\\"drop-target\\""',
      'gesture drag @e4~s12 "label=Archive" 700 600 200',
      'gesture pan 1 2 3 4 --settle --platform android',
      'click 10 20 # not a gesture',
    ]) {
      expect(validateGestureLine(line, 0), line).toBeNull();
    }
  });

  it('flags the retired swipe duration and offers both migrations', () => {
    const issue = validateGestureLine('swipe 200 700 200 200 300', 3);
    expect(issue?.code).toBe('retired-gesture-positional');
    expect(issue?.line).toBe(3);
    expect([issue?.startCol, issue?.endCol]).toEqual([22, 25]);
    expect(issue?.fixes.map((f) => f.replacement)).toEqual([
      'swipe 200 700 200 200',
      'gesture pan 200 700 0 -500 300',
    ]);
  });

  it('keeps non-swipe flags when converting to pan', () => {
    const issue = validateGestureLine('swipe 0 0 10 10 250 --count 2 --settle', 0);
    expect(issue?.fixes[1]?.replacement).toBe('gesture pan 0 0 10 10 250 --settle');
    expect(issue?.fixes[0]?.replacement).toBe('swipe 0 0 10 10 --count 2 --settle');
  });

  it('flags the retired fling duration', () => {
    const issue = validateGestureLine('gesture fling left 210 443 90 500', 0);
    expect(issue?.code).toBe('retired-gesture-positional');
    expect(issue?.fixes[0]?.replacement).toBe('gesture fling left 210 443 90');
  });

  it('flags the retired gesture swipe duration', () => {
    const issue = validateGestureLine('gesture swipe left 500', 0);
    expect(issue?.code).toBe('retired-gesture-positional');
    expect(issue?.fixes[0]?.replacement).toBe('gesture swipe left');
  });

  it('flags the retired rotate velocity', () => {
    const issue = validateGestureLine('gesture rotate 35 200 420 2', 0);
    expect(issue?.code).toBe('retired-gesture-positional');
    expect(issue?.message).toContain('velocity');
    expect(issue?.fixes[0]?.replacement).toBe('gesture rotate 35 200 420');
  });

  it('reports plain arity overflow without a fix', () => {
    const issue = validateGestureLine('gesture pan 1 2 3 4 5 6', 0);
    expect(issue?.code).toBe('gesture-arity');
    expect(issue?.fixes).toEqual([]);
    expect(issue?.message).toContain('at most 5');
  });

  it('reports too few arguments', () => {
    expect(validateGestureLine('swipe 1 2 3', 0)?.code).toBe('gesture-arity');
    expect(validateGestureLine('gesture transform 1 2 3', 0)?.code).toBe('gesture-arity');
    expect(validateGestureLine('gesture drag @e1', 0)?.code).toBe('gesture-arity');
  });

  it('reports unknown or missing gesture kinds', () => {
    expect(validateGestureLine('gesture', 0)?.code).toBe('unknown-gesture-kind');
    expect(validateGestureLine('gesture tap 1 2', 0)?.code).toBe('unknown-gesture-kind');
  });

  it('validates fling directions and swipe presets', () => {
    expect(validateGestureLine('gesture fling diagonal 1 2', 0)?.code).toBe(
      'invalid-gesture-value',
    );
    expect(validateGestureLine('gesture swipe up', 0)?.code).toBe('invalid-gesture-value');
  });

  it('ignores comment suffixes and preserves the code end column', () => {
    const issue = validateGestureLine('swipe 1 2 3 4 5   # old form', 0);
    expect(issue?.codeEndCol).toBe('swipe 1 2 3 4 5'.length);
  });
});

describe('validateGestureLines', () => {
  it('collects issues across a script', () => {
    const issues = validateGestureLines([
      'context platform=ios',
      'swipe 1 2 3 4 5',
      'gesture pinch 2',
      'gesture rotate 1 2 3 4',
    ]);
    expect(issues.map((i) => [i.line, i.code])).toEqual([
      [1, 'retired-gesture-positional'],
      [3, 'retired-gesture-positional'],
    ]);
  });
});
