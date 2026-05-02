export interface FlagDef {
  readonly name: string;
  readonly short?: string;
  readonly summary: string;
  readonly hasValue: boolean;
  readonly valueHint?: string;
  readonly valueChoices?: readonly string[];
}

export interface CommandDef {
  readonly name: string;
  readonly summary: string;
  readonly signature: string;
  readonly flags: readonly FlagDef[];
}

export interface DirectiveKeyDef {
  readonly name: string;
  readonly summary?: string;
  readonly valueChoices?: readonly string[];
}

export interface DirectiveDef {
  readonly name: string;
  readonly summary: string;
  readonly keys?: readonly DirectiveKeyDef[];
}

import { SUPPORTED_PLATFORMS } from './platforms';

const noFlags: readonly FlagDef[] = [];

const platformValueHint = `<${SUPPORTED_PLATFORMS.join('|')}>`;

export const COMMANDS: readonly CommandDef[] = [
  {
    name: 'open',
    summary: 'Launch an app (by id) or open a URL.',
    signature: 'open <app-id|url>',
    flags: [
      { name: '--relaunch', summary: 'Force a fresh launch instead of attaching.', hasValue: false },
      { name: '--platform', summary: 'Target platform.', hasValue: true, valueHint: platformValueHint, valueChoices: SUPPORTED_PLATFORMS },
    ],
  },
  {
    name: 'close',
    summary: 'Close the active app.',
    signature: 'close',
    flags: [
      { name: '--platform', summary: 'Target platform.', hasValue: true, valueHint: platformValueHint, valueChoices: SUPPORTED_PLATFORMS },
    ],
  },
  {
    name: 'back',
    summary: 'Navigate back (app-owned or system).',
    signature: 'back',
    flags: [
      { name: '--mode', summary: 'Back behavior.', hasValue: true, valueHint: '<app|system>' },
    ],
  },
  {
    name: 'replay',
    summary: 'Run another .ad script as a sub-flow.',
    signature: 'replay <file>',
    flags: noFlags,
  },
  {
    name: 'runtime',
    summary: 'Configure runtime hints (e.g. React Native Metro tunnel).',
    signature: 'runtime',
    flags: [
      { name: '--platform', summary: 'Target platform.', hasValue: true, valueHint: platformValueHint, valueChoices: SUPPORTED_PLATFORMS },
      { name: '--metro-host', summary: 'Metro bundler host.', hasValue: true, valueHint: '<host>' },
      { name: '--metro-port', summary: 'Metro bundler port.', hasValue: true, valueHint: '<port>' },
      { name: '--bundle-url', summary: 'Override the JS bundle URL.', hasValue: true, valueHint: '<url>' },
      { name: '--launch-url', summary: 'Deep-link URL to launch with.', hasValue: true, valueHint: '<url>' },
    ],
  },
  {
    name: 'appstate',
    summary: 'Get foreground app info.',
    signature: 'appstate',
    flags: noFlags,
  },
  {
    name: 'snapshot',
    summary: 'Capture the UI hierarchy with @eN refs.',
    signature: 'snapshot',
    flags: [
      { name: '--interactive', short: '-i', summary: 'Interactive elements only.', hasValue: false },
      { name: '--clean', short: '-c', summary: 'Remove empty structural noise.', hasValue: false },
      { name: '--depth', short: '-d', summary: 'Limit tree depth.', hasValue: true, valueHint: '<N>' },
      { name: '--scope', short: '-s', summary: 'Filter by label or identifier.', hasValue: true, valueHint: '<query>' },
      { name: '--raw', summary: 'Full off-screen tree (troubleshooting only).', hasValue: false },
    ],
  },
  {
    name: 'screenshot',
    summary: 'Save a screen image to disk.',
    signature: 'screenshot <path>',
    flags: [
      { name: '--fullscreen', summary: 'Capture the entire screen.', hasValue: false },
      { name: '--max-size', summary: 'Cap the longer edge in pixels.', hasValue: true, valueHint: '<N>' },
    ],
  },
  {
    name: 'click',
    summary: 'Tap an element or coordinates.',
    signature: 'click @eN | <selector> | <x> <y>',
    flags: [
      { name: '--count', summary: 'Tap repeatedly.', hasValue: true, valueHint: '<N>' },
      { name: '--interval-ms', summary: 'Delay between repeats.', hasValue: true, valueHint: '<ms>' },
      { name: '--hold-ms', summary: 'Hold duration before release.', hasValue: true, valueHint: '<ms>' },
      { name: '--jitter-px', summary: 'Random offset radius.', hasValue: true, valueHint: '<px>' },
      { name: '--double-tap', summary: 'Emit a double tap.', hasValue: false },
      { name: '--button', summary: 'Pointer button (desktop).', hasValue: true, valueHint: '<primary|secondary|middle>' },
    ],
  },
  {
    name: 'press',
    summary: 'Tap by coordinates (same engine as click).',
    signature: 'press <x> <y>',
    flags: [
      { name: '--count', summary: 'Tap repeatedly.', hasValue: true, valueHint: '<N>' },
      { name: '--interval-ms', summary: 'Delay between repeats.', hasValue: true, valueHint: '<ms>' },
      { name: '--hold-ms', summary: 'Hold duration before release.', hasValue: true, valueHint: '<ms>' },
      { name: '--jitter-px', summary: 'Random offset radius.', hasValue: true, valueHint: '<px>' },
      { name: '--double-tap', summary: 'Emit a double tap.', hasValue: false },
      { name: '--button', summary: 'Pointer button (desktop).', hasValue: true, valueHint: '<primary|secondary|middle>' },
    ],
  },
  {
    name: 'fill',
    summary: 'Clear the field and type text.',
    signature: 'fill @eN <text> | <selector> <text>',
    flags: [
      { name: '--delay-ms', summary: 'Per-keystroke delay.', hasValue: true, valueHint: '<ms>' },
    ],
  },
  {
    name: 'type',
    summary: 'Type text without clearing the field.',
    signature: 'type <text>',
    flags: [
      { name: '--delay-ms', summary: 'Per-keystroke delay.', hasValue: true, valueHint: '<ms>' },
    ],
  },
  {
    name: 'swipe',
    summary: 'Drag gesture between two points.',
    signature: 'swipe <x1> <y1> <x2> <y2> <duration>',
    flags: [
      { name: '--count', summary: 'Number of swipes.', hasValue: true, valueHint: '<N>' },
      { name: '--pause-ms', summary: 'Pause between swipes.', hasValue: true, valueHint: '<ms>' },
      { name: '--pattern', summary: 'Stroke pattern.', hasValue: true, valueHint: '<one-way|ping-pong>' },
    ],
  },
  {
    name: 'scroll',
    summary: 'Scroll content in a direction.',
    signature: 'scroll <up|down|left|right> <amount>',
    flags: [
      { name: '--pixels', summary: 'Scroll a fixed number of pixels (mutually exclusive with amount).', hasValue: true, valueHint: '<N>' },
    ],
  },
  {
    name: 'find',
    summary: 'Locate an element by text or label, then act on it.',
    signature: 'find <text|label> "<query>" <exists|click|fill|type|get_text|wait>',
    flags: [
      { name: '--first', summary: 'Pick the first match.', hasValue: false },
      { name: '--last', summary: 'Pick the last match.', hasValue: false },
    ],
  },
  {
    name: 'is',
    summary: 'Assert an element property.',
    signature: 'is <visible|hidden|exists|editable|selected|text> <selector>',
    flags: noFlags,
  },
  {
    name: 'wait',
    summary: 'Pause for a duration, or wait for a selector to appear.',
    signature: 'wait <ms> | wait <selector> <ms>',
    flags: noFlags,
  },
  {
    name: 'get',
    summary: 'Read text or an attribute from an element.',
    signature: 'get <text|value|attr> @eN | <selector>',
    flags: noFlags,
  },
  {
    name: 'record',
    summary: 'Start or stop a screen recording.',
    signature: 'record <start|stop> [path]',
    flags: [
      { name: '--fps', summary: 'Frames per second.', hasValue: true, valueHint: '<N>' },
      { name: '--quality', summary: 'Encoder quality (0-100).', hasValue: true, valueHint: '<N>' },
      { name: '--hide-touches', summary: 'Suppress touch indicators.', hasValue: false },
    ],
  },
  {
    name: 'keyboard',
    summary: 'Manage the on-screen or hardware keyboard.',
    signature: 'keyboard <show|hide|press>',
    flags: [
      { name: '--key', summary: 'Hardware key name.', hasValue: true, valueHint: '<name>' },
    ],
  },
  {
    name: 'clipboard',
    summary: 'Read or write the device clipboard.',
    signature: 'clipboard <get|set>',
    flags: [
      { name: '--text', summary: 'Text to write (for `set`).', hasValue: true, valueHint: '<value>' },
    ],
  },
  {
    name: 'alert',
    summary: 'Handle a system dialog.',
    signature: 'alert <get|wait|accept|dismiss>',
    flags: [
      { name: '--timeout-ms', summary: 'How long to wait for the alert.', hasValue: true, valueHint: '<ms>' },
    ],
  },
  {
    name: 'push',
    summary: 'Simulate a push notification.',
    signature: 'push "<title>" "<body>"',
    flags: [
      { name: '--payload', summary: 'JSON payload.', hasValue: true, valueHint: '<json>' },
    ],
  },
  {
    name: 'batch',
    summary: 'Execute a batch JSON file as a sub-flow.',
    signature: 'batch <file>',
    flags: noFlags,
  },
  {
    name: 'trigger-app-event',
    summary: 'Dispatch an app-defined event via deep link.',
    signature: 'trigger-app-event <event>',
    flags: [
      { name: '--payload', summary: 'JSON payload.', hasValue: true, valueHint: '<json>' },
    ],
  },
  {
    name: 'trace',
    summary: 'Capture a low-level session trace.',
    signature: 'trace <start|stop>',
    flags: [
      { name: '--out', summary: 'Output path.', hasValue: true, valueHint: '<path>' },
    ],
  },
  {
    name: 'logs',
    summary: 'Stream app logs or insert a timeline marker.',
    signature: 'logs',
    flags: [
      { name: '--app', summary: 'App id to filter.', hasValue: true, valueHint: '<id>' },
      { name: '--level', summary: 'Minimum log level.', hasValue: true, valueHint: '<warn|error>' },
      { name: '--mark', summary: 'Insert a labeled timeline marker.', hasValue: true, valueHint: '<label>' },
    ],
  },
  {
    name: 'perf',
    summary: 'Measure a performance metric over a window.',
    signature: 'perf',
    flags: [
      { name: '--metric', summary: 'Which metric to capture.', hasValue: true, valueHint: '<fps|cpu|memory>' },
      { name: '--window-ms', summary: 'Sampling window length.', hasValue: true, valueHint: '<ms>' },
    ],
  },
];

export const DIRECTIVES: readonly DirectiveDef[] = [
  {
    name: 'context',
    summary: 'Set per-script execution context (header).',
    keys: [
      { name: 'platform', summary: 'Target platform.', valueChoices: SUPPORTED_PLATFORMS },
      { name: 'timeout', summary: 'Default per-step timeout in ms.' },
      { name: 'retries', summary: 'How many retries on failure.' },
    ],
  },
  {
    name: 'env',
    summary: 'Define a script-scoped variable (header). Form: env KEY=VALUE.',
  },
];

export const FIND_LOCATORS: readonly string[] = ['text', 'label'];

export const FIND_ACTIONS: readonly string[] = ['exists', 'click', 'fill', 'type', 'get_text', 'wait'];

export const COMMAND_BY_NAME: ReadonlyMap<string, CommandDef> = new Map(
  COMMANDS.map((c) => [c.name, c]),
);

export const DIRECTIVE_BY_NAME: ReadonlyMap<string, DirectiveDef> = new Map(
  DIRECTIVES.map((d) => [d.name, d]),
);
