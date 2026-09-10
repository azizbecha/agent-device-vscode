import { describe, expect, it } from 'vitest';

import { SCRIPT_TEMPLATES } from '../src/data/templates';
import { parseScript } from '../src/runners/scriptParser';

describe('script templates', () => {
  it('have unique ids and labels', () => {
    const ids = SCRIPT_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    const labels = SCRIPT_TEMPLATES.map((t) => t.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('declare a platform in the header and parse cleanly', () => {
    for (const template of SCRIPT_TEMPLATES) {
      const parsed = parseScript(template.content);
      expect(parsed.platform, template.id).toBeDefined();
      for (const action of parsed.actions) {
        expect(action.argv.length, `${template.id}:${action.lineNumber}`).toBeGreaterThan(0);
      }
    }
  });

  it('never use the retired timed swipe or fling forms', () => {
    for (const template of SCRIPT_TEMPLATES) {
      for (const action of parseScript(template.content).actions) {
        const positionals = action.argv.slice(1).filter((t) => !t.startsWith('-'));
        if (action.argv[0] === 'swipe') {
          expect(positionals.length, `${template.id}:${action.lineNumber}`).toBe(4);
        }
        if (action.argv[0] === 'gesture' && action.argv[1] === 'fling') {
          expect(positionals.length - 1, `${template.id}:${action.lineNumber}`).toBeLessThanOrEqual(
            4,
          );
        }
      }
    }
  });

  it('never use commands agent-device removed', () => {
    for (const template of SCRIPT_TEMPLATES) {
      for (const action of parseScript(template.content).actions) {
        expect(['rotate', 'metrics'], `${template.id}:${action.lineNumber}`).not.toContain(
          action.argv[0],
        );
        if (action.argv[0] === 'perf') {
          expect(action.argv[1], `${template.id}:${action.lineNumber}`).toBeDefined();
        }
      }
    }
  });
});
