import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  COMMAND_BY_NAME,
  COMMANDS,
  DIRECTIVES,
  FIND_ACTIONS,
  FIND_LOCATORS,
  REMOVED_COMMANDS,
} from '../src/data/commands';

const grammar = JSON.parse(
  readFileSync(join(__dirname, '..', 'syntaxes', 'agent-device.tmLanguage.json'), 'utf8'),
) as { repository: Record<string, { match?: string }> };

function grammarRegex(rule: string): RegExp {
  const match = grammar.repository[rule]?.match;
  if (!match) {
    throw new Error(`grammar rule ${rule} has no match`);
  }
  return new RegExp(match);
}

describe('command catalog', () => {
  it('has unique command names and aliases', () => {
    const names = COMMANDS.flatMap((c) => [c.name, ...(c.aliases ?? [])]);
    expect(new Set(names).size).toBe(names.length);
  });

  it('resolves aliases to their canonical command', () => {
    expect(COMMAND_BY_NAME.get('tap')?.name).toBe('press');
    expect(COMMAND_BY_NAME.get('long-press')?.name).toBe('longpress');
    expect(COMMAND_BY_NAME.get('launch')?.name).toBe('open');
  });

  it('does not list commands agent-device removed', () => {
    for (const removed of REMOVED_COMMANDS.keys()) {
      expect(COMMAND_BY_NAME.has(removed)).toBe(false);
    }
    expect(REMOVED_COMMANDS.has('rotate')).toBe(true);
  });

  it('covers the 0.20 / 0.21 command surface', () => {
    for (const name of [
      'gesture',
      'orientation',
      'hover',
      'longpress',
      'focus',
      'home',
      'diff',
      'viewport',
      'tv-remote',
      'network',
      'settings',
      'react-native',
      'capabilities',
      'events',
    ]) {
      expect(COMMAND_BY_NAME.has(name), name).toBe(true);
    }
  });

  it('requires perf to name an area', () => {
    const perf = COMMAND_BY_NAME.get('perf');
    expect(perf?.subcommands?.map((s) => s.name)).toEqual(['frames', 'memory', 'cpu', 'trace']);
    expect(perf?.flags.some((f) => f.name === '--metric')).toBe(false);
  });

  it('describes the redesigned swipe without a trailing duration', () => {
    expect(COMMAND_BY_NAME.get('swipe')?.signature).toBe('swipe <x1> <y1> <x2> <y2>');
    const gestureKinds = COMMAND_BY_NAME.get('gesture')?.subcommands?.map((s) => s.name);
    expect(gestureKinds).toEqual(['pan', 'fling', 'drag', 'pinch', 'rotate', 'transform', 'swipe']);
  });

  it('uses well-formed flag names', () => {
    for (const command of COMMANDS) {
      for (const flag of command.flags) {
        expect(flag.name, `${command.name} ${flag.name}`).toMatch(/^--[a-z][a-z0-9-]*$/);
        if (flag.short) {
          expect(flag.short).toMatch(/^-[a-z]$/);
        }
        if (flag.valueChoices) {
          expect(flag.hasValue).toBe(true);
        }
      }
    }
  });

  it('lists the find vocabulary agent-device parses', () => {
    expect(FIND_LOCATORS).toEqual(['text', 'label', 'value', 'role', 'id']);
    expect(FIND_ACTIONS).toContain('list');
    expect(FIND_ACTIONS).not.toContain('get_text');
  });
});

describe('TextMate grammar', () => {
  it('highlights every catalog command and alias', () => {
    const command = grammarRegex('command');
    for (const c of COMMANDS) {
      for (const name of [c.name, ...(c.aliases ?? [])]) {
        expect(command.test(`${name} foo`), name).toBe(true);
        expect(command.test(`  ${name}`), name).toBe(true);
      }
    }
  });

  it('does not highlight removed commands or directives as commands', () => {
    const command = grammarRegex('command');
    for (const removed of REMOVED_COMMANDS.keys()) {
      expect(command.test(`${removed} portrait`), removed).toBe(false);
    }
    for (const d of DIRECTIVES) {
      expect(command.test(`${d.name} platform=ios`), d.name).toBe(false);
      expect(grammarRegex('directive').test(`${d.name} platform=ios`), d.name).toBe(true);
    }
  });

  it('matches versioned element refs', () => {
    const ref = grammarRegex('elementRef');
    expect('@e4'.match(ref)?.[0]).toBe('@e4');
    expect('@e4~s12'.match(ref)?.[0]).toBe('@e4~s12');
  });
});
