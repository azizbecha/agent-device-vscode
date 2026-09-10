import { describe, expect, it } from 'vitest';

import { validateLineQuoting } from '../src/language/quotingRules';
import { validateSelectorLines } from '../src/language/selectorRules';

describe('validateLineQuoting', () => {
  it('accepts the forms agent-device tokenizes correctly', () => {
    for (const line of [
      'click label=hey',
      'click label="hey"',
      'fill id="field-name" "Ada Lovelace"',
      'click "label=\'Sign in\'"',
      'click "label=\\"Sign in\\""',
      'wait "label=\\"Form\\"" 30000',
      'type "say \\"hi\\" now"',
      'click "role=button label=Continue || label=Continue" --settle',
      'click "label=A" # comment with "quotes"',
      'env APP="Agent Device Tester"',
    ]) {
      expect(validateLineQuoting(line, 0), line).toBeNull();
    }
  });

  it('repairs a bare argument whose quoted value spans a space', () => {
    const issue = validateLineQuoting('click label="Sign in"', 2);
    expect(issue?.code).toBe('malformed-argument-quoting');
    expect([issue?.line, issue?.startCol, issue?.endCol]).toEqual([2, 6, 21]);
    expect(issue?.message).toContain('`label="Sign` + `in"`');
    expect(issue?.fixes.map((f) => f.replacement)).toEqual([
      '"label=\'Sign in\'"',
      '"label=\\"Sign in\\""',
    ]);
  });

  it('repairs a quoted argument with unescaped inner quotes', () => {
    const issue = validateLineQuoting('click "label="Sign in"" --settle', 0);
    expect(issue?.code).toBe('malformed-argument-quoting');
    expect([issue?.startCol, issue?.endCol]).toEqual([6, 23]);
    expect(issue?.fixes[0]?.replacement).toBe('"label=\'Sign in\'"');
  });

  it('only offers the escaped form when the value contains an apostrophe', () => {
    const issue = validateLineQuoting('click label="Don\'t save"', 0);
    expect(issue?.fixes.map((f) => f.replacement)).toEqual(['"label=\\"Don\'t save\\""']);
  });

  it('reports unbalanced quotes without a fix', () => {
    const issue = validateLineQuoting('click label="Sign in', 0);
    expect(issue?.code).toBe('malformed-argument-quoting');
    expect(issue?.fixes).toEqual([]);
  });
});

describe('validateSelectorLines with quoting problems', () => {
  it('reports the quoting problem instead of cascading selector errors', () => {
    const issues = validateSelectorLines(['click "label="Sign in""']);
    expect(issues.map((i) => i.code)).toEqual(['malformed-argument-quoting']);
    expect(issues[0]?.fixes.length).toBeGreaterThan(0);
  });
});
