export interface FlagDef {
  readonly name: string;
  readonly short?: string;
  readonly summary: string;
  readonly hasValue: boolean;
  readonly valueHint?: string;
  readonly valueChoices?: readonly string[];
}

/** A fixed-vocabulary positional right after the command name (e.g. `record start`). */
export interface SubcommandDef {
  readonly name: string;
  readonly summary: string;
  /** Full form shown as completion detail, e.g. `gesture pan <x> <y> <dx> <dy> [durationMs]`. */
  readonly signature?: string;
}

export interface CommandDef {
  readonly name: string;
  readonly summary: string;
  readonly signature: string;
  readonly flags: readonly FlagDef[];
  readonly subcommands?: readonly SubcommandDef[];
  /** Other spellings agent-device accepts for this command (completion shows the canonical one). */
  readonly aliases?: readonly string[];
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

const platformValueHint = `<${SUPPORTED_PLATFORMS.join('|')}>`;

/** Flags every command accepts; scripts usually set these once via `context`. */
const TARGET_FLAGS: readonly FlagDef[] = [
  {
    name: '--platform',
    summary: 'Target platform.',
    hasValue: true,
    valueHint: platformValueHint,
    valueChoices: SUPPORTED_PLATFORMS,
  },
  {
    name: '--target',
    summary: 'Device target class.',
    hasValue: true,
    valueHint: '<mobile|tv|desktop>',
    valueChoices: ['mobile', 'tv', 'desktop'],
  },
  { name: '--device', summary: 'Device name to target.', hasValue: true, valueHint: '<name>' },
  { name: '--session', summary: 'Named daemon session.', hasValue: true, valueHint: '<name>' },
];

/** Post-action observation flags shared by interactions. */
const SETTLE_FLAGS: readonly FlagDef[] = [
  {
    name: '--settle',
    summary: 'Wait for the UI to go quiet, then return the settled snapshot diff with fresh refs.',
    hasValue: false,
  },
  {
    name: '--settle-quiet',
    summary: 'Quiet window the UI must hold to count as settled (default 500ms).',
    hasValue: true,
    valueHint: '<ms>',
  },
  {
    name: '--verify',
    summary: 'Verify the action produced an observable change.',
    hasValue: false,
  },
];

const PRESS_SERIES_FLAGS: readonly FlagDef[] = [
  { name: '--count', summary: 'Repeat count (max 200).', hasValue: true, valueHint: '<n>' },
  {
    name: '--interval-ms',
    summary: 'Delay between iterations.',
    hasValue: true,
    valueHint: '<ms>',
  },
  {
    name: '--hold-ms',
    summary: 'Hold duration for each iteration.',
    hasValue: true,
    valueHint: '<ms>',
  },
  {
    name: '--jitter-px',
    summary: 'Deterministic coordinate jitter radius.',
    hasValue: true,
    valueHint: '<n>',
  },
  { name: '--double-tap', summary: 'Use a double-tap per iteration.', hasValue: false },
  {
    name: '--button',
    summary: 'Mouse button (desktop / web).',
    hasValue: true,
    valueHint: '<primary|secondary|middle>',
    valueChoices: ['primary', 'secondary', 'middle'],
  },
];

const SNAPSHOT_SHAPE_FLAGS: readonly FlagDef[] = [
  { name: '--interactive', short: '-i', summary: 'Interactive elements only.', hasValue: false },
  { name: '--clean', short: '-c', summary: 'Remove empty structural noise.', hasValue: false },
  { name: '--depth', short: '-d', summary: 'Limit tree depth.', hasValue: true, valueHint: '<n>' },
  {
    name: '--scope',
    short: '-s',
    summary: 'Scope to a label or identifier.',
    hasValue: true,
    valueHint: '<query>',
  },
  { name: '--raw', summary: 'Raw provider tree (troubleshooting only).', hasValue: false },
];

const METRO_FLAGS: readonly FlagDef[] = [
  { name: '--metro-host', summary: 'Metro bundler host.', hasValue: true, valueHint: '<host>' },
  { name: '--metro-port', summary: 'Metro bundler port.', hasValue: true, valueHint: '<port>' },
  {
    name: '--bundle-url',
    summary: 'Override the JS bundle URL.',
    hasValue: true,
    valueHint: '<url>',
  },
  {
    name: '--launch-url',
    summary: 'Deep-link URL to launch with.',
    hasValue: true,
    valueHint: '<url>',
  },
];

export const GESTURE_SUBCOMMANDS: readonly SubcommandDef[] = [
  {
    name: 'pan',
    summary: 'Timed drag from a point by a delta. One finger by default.',
    signature: 'gesture pan <x> <y> <dx> <dy> [durationMs] [--pointer-count 2]',
  },
  {
    name: 'fling',
    summary: 'Quick directional flick from a point.',
    signature: 'gesture fling <up|down|left|right> <x> <y> [distance]',
  },
  {
    name: 'drag',
    summary: 'Drag one element onto another (refs, selectors, or coordinates).',
    signature: 'gesture drag <source> <destination> [sourceHoldMs] [moveMs] [destinationHoldMs]',
  },
  {
    name: 'pinch',
    summary: 'Two-finger zoom by scale factor, optionally centred on a point.',
    signature: 'gesture pinch <scale> [x] [y]',
  },
  {
    name: 'rotate',
    summary: 'Two-finger rotation by degrees, optionally centred on a point.',
    signature: 'gesture rotate <degrees> [x] [y]',
  },
  {
    name: 'transform',
    summary: 'Combined pan, zoom, and rotate in one gesture.',
    signature: 'gesture transform <x> <y> <dx> <dy> <scale> <degrees> [durationMs]',
  },
  {
    name: 'swipe',
    summary: 'Preset edge or directional swipe.',
    signature: 'gesture swipe <left|right|left-edge|right-edge>',
  },
];

export const COMMANDS: readonly CommandDef[] = [
  // ─── Navigation ────────────────────────────────────────────────────────────
  {
    name: 'open',
    summary: 'Launch an app (by id or name), open a URL, or open a deep link into an app.',
    signature: 'open <app|url> [url]',
    aliases: ['launch', 'relaunch'],
    flags: [
      {
        name: '--relaunch',
        summary: 'Terminate the app process before launching.',
        hasValue: false,
      },
      {
        name: '--surface',
        summary: 'macOS session surface (defaults to app).',
        hasValue: true,
        valueHint: '<app|frontmost-app|desktop|menubar>',
        valueChoices: ['app', 'frontmost-app', 'desktop', 'menubar'],
      },
      {
        name: '--activity',
        summary: 'Android launch activity (package/Activity).',
        hasValue: true,
        valueHint: '<component>',
      },
      {
        name: '--launch-args',
        summary: 'Extra process launch argument (repeatable).',
        hasValue: true,
        valueHint: '<arg>',
      },
      ...METRO_FLAGS,
      {
        name: '--save-script',
        summary: 'Record the session into a .ad script on close.',
        hasValue: true,
        valueHint: '[path]',
      },
      {
        name: '--device-hub',
        summary: 'Use Xcode Device Hub for Apple simulators.',
        hasValue: false,
      },
      ...TARGET_FLAGS,
    ],
  },
  {
    name: 'close',
    summary: 'End the session and close the app.',
    signature: 'close [app]',
    flags: [
      {
        name: '--shutdown',
        summary: 'Shut down the simulator / emulator after ending the session.',
        hasValue: false,
      },
      ...TARGET_FLAGS,
    ],
  },
  {
    name: 'back',
    summary: 'Navigate back (app-provided back UI, or system back).',
    signature: 'back [--in-app|--system]',
    flags: [
      { name: '--in-app', summary: 'Use app-provided back UI when available.', hasValue: false },
      { name: '--system', summary: 'Use system back input or gesture.', hasValue: false },
      ...TARGET_FLAGS,
    ],
  },
  { name: 'home', summary: 'Go to the home screen.', signature: 'home', flags: TARGET_FLAGS },
  {
    name: 'app-switcher',
    summary: 'Open the app switcher.',
    signature: 'app-switcher',
    flags: TARGET_FLAGS,
  },
  {
    name: 'orientation',
    summary: 'Rotate the device (replaces the removed `rotate` command).',
    signature: 'orientation <portrait|portrait-upside-down|landscape-left|landscape-right>',
    flags: TARGET_FLAGS,
    subcommands: [
      { name: 'portrait', summary: 'Upright portrait.' },
      { name: 'portrait-upside-down', summary: 'Portrait, rotated 180°.' },
      { name: 'landscape-left', summary: 'Landscape, home edge on the left.' },
      { name: 'landscape-right', summary: 'Landscape, home edge on the right.' },
    ],
  },
  {
    name: 'boot',
    summary: 'Boot a simulator or emulator.',
    signature: 'boot',
    flags: [
      { name: '--headless', summary: 'Android: launch without a GUI window.', hasValue: false },
      ...TARGET_FLAGS,
    ],
  },
  {
    name: 'shutdown',
    summary: 'Shut down a simulator or emulator.',
    signature: 'shutdown',
    flags: TARGET_FLAGS,
  },
  {
    name: 'runtime',
    summary: 'Set session-scoped runtime hints (Metro host / port, bundle URL, launch URL).',
    signature: 'runtime',
    flags: [...METRO_FLAGS, ...TARGET_FLAGS],
  },

  // ─── Capture and inspect ───────────────────────────────────────────────────
  {
    name: 'snapshot',
    summary: 'Capture the accessibility tree with @eN refs.',
    signature: 'snapshot [-i] [-d <n>] [-s <scope>] [--diff] [--actions] [--raw]',
    flags: [
      ...SNAPSHOT_SHAPE_FLAGS,
      {
        name: '--diff',
        summary: 'Show a structural diff against the previous snapshot.',
        hasValue: false,
      },
      { name: '--actions', summary: 'Include the supported actions per node.', hasValue: false },
      {
        name: '--force-full',
        summary: 'Re-emit the full tree even when unchanged.',
        hasValue: false,
      },
      { name: '--timeout', summary: 'Capture timeout.', hasValue: true, valueHint: '<ms>' },
      ...TARGET_FLAGS,
    ],
  },
  {
    name: 'diff',
    summary: 'Diff the current snapshot or a screenshot against a baseline.',
    signature: 'diff <snapshot|screenshot> [current.png]',
    flags: [
      ...SNAPSHOT_SHAPE_FLAGS,
      {
        name: '--baseline',
        short: '-b',
        summary: 'Baseline image path (screenshot).',
        hasValue: true,
        valueHint: '<path>',
      },
      { name: '--out', summary: 'Diff image output path.', hasValue: true, valueHint: '<path>' },
      {
        name: '--threshold',
        summary: 'Colour distance threshold (default 0.1).',
        hasValue: true,
        valueHint: '<0-1>',
      },
      { name: '--overlay-refs', summary: 'Draw @eN refs onto the diff image.', hasValue: false },
      ...TARGET_FLAGS,
    ],
    subcommands: [
      { name: 'snapshot', summary: 'Structural diff against the previous snapshot.' },
      { name: 'screenshot', summary: 'Pixel diff against a baseline image.' },
    ],
  },
  {
    name: 'screenshot',
    summary: 'Save a screen image to disk.',
    signature: 'screenshot [path]',
    flags: [
      { name: '--fullscreen', summary: 'Capture the entire screen / document.', hasValue: false },
      {
        name: '--scale',
        summary: 'Resize both dimensions by this factor.',
        hasValue: true,
        valueHint: '<0-1>',
      },
      {
        name: '--overlay-refs',
        summary: 'Draw current @eN refs and target rectangles onto the PNG.',
        hasValue: false,
      },
      {
        name: '--crop-on',
        summary: 'Crop the capture to the frame this selector resolves to.',
        hasValue: true,
        valueHint: '<selector>',
      },
      {
        name: '--normalize-status-bar',
        summary: 'Normalize iOS simulator chrome for reusable diff baselines.',
        hasValue: false,
      },
      ...TARGET_FLAGS,
    ],
  },
  {
    name: 'record',
    summary: 'Start or stop a screen recording.',
    signature: 'record <start|stop> [path]',
    flags: [
      { name: '--fps', summary: 'Target frames per second.', hasValue: true, valueHint: '<n>' },
      {
        name: '--quality',
        summary: 'Output quality preset.',
        hasValue: true,
        valueHint: '<medium|high>',
        valueChoices: ['medium', 'high'],
      },
      { name: '--hide-touches', summary: 'Skip touch-overlay post-processing.', hasValue: false },
      {
        name: '--scope',
        summary: 'Recording scope (default app).',
        hasValue: true,
        valueHint: '<app|device|system>',
        valueChoices: ['app', 'device', 'system'],
      },
      ...TARGET_FLAGS,
    ],
    subcommands: [
      { name: 'start', summary: 'Start recording (optionally to an explicit path).' },
      { name: 'stop', summary: 'Stop the active recording.' },
    ],
  },
  {
    name: 'get',
    summary: 'Read text or attributes from an element.',
    signature: 'get <text|attrs> @eN | <selector>',
    flags: TARGET_FLAGS,
    subcommands: [
      { name: 'text', summary: 'Visible text of the element.' },
      { name: 'attrs', summary: 'All attributes of the element.' },
    ],
  },
  {
    name: 'appstate',
    summary: 'Get foreground app info.',
    signature: 'appstate',
    flags: TARGET_FLAGS,
  },
  {
    name: 'apps',
    summary: 'List installed apps.',
    signature: 'apps',
    flags: [
      { name: '--all', summary: 'Include system / OEM apps.', hasValue: false },
      ...TARGET_FLAGS,
    ],
  },
  {
    name: 'capabilities',
    summary: 'List the commands the current target supports.',
    signature: 'capabilities',
    flags: TARGET_FLAGS,
  },
  {
    name: 'devices',
    summary: 'List available devices.',
    signature: 'devices',
    flags: TARGET_FLAGS,
  },
  {
    name: 'doctor',
    summary: 'Check local tooling for a platform.',
    signature: 'doctor',
    flags: [
      {
        name: '--app',
        summary: 'Verify an installed app without opening a session.',
        hasValue: true,
        valueHint: '<id-or-name>',
      },
      { name: '--remote', summary: 'Check remote connection setup instead.', hasValue: false },
      ...TARGET_FLAGS,
    ],
  },

  // ─── Interactions ──────────────────────────────────────────────────────────
  {
    name: 'click',
    summary: 'Tap an element by ref, selector, or coordinates.',
    signature: 'click @eN | <selector> | <x> <y>',
    flags: [...PRESS_SERIES_FLAGS, ...SETTLE_FLAGS, ...TARGET_FLAGS],
  },
  {
    name: 'press',
    summary: 'Tap an element by ref, selector, or coordinates (same engine as click).',
    signature: 'press @eN | <selector> | <x> <y>',
    aliases: ['tap'],
    flags: [...PRESS_SERIES_FLAGS, ...SETTLE_FLAGS, ...TARGET_FLAGS],
  },
  {
    name: 'longpress',
    summary: 'Press and hold (default 500ms).',
    signature: 'longpress @eN | <selector> | <x> <y> [durationMs]',
    aliases: ['long-press'],
    flags: [...SETTLE_FLAGS, ...TARGET_FLAGS],
  },
  {
    name: 'hover',
    summary: 'Move the pointer without pressing (web only).',
    signature: 'hover @eN | <selector> | <x> <y>',
    flags: [...SETTLE_FLAGS, ...TARGET_FLAGS],
  },
  {
    name: 'focus',
    summary: 'Move keyboard focus to an element.',
    signature: 'focus @eN | <selector>',
    flags: [...SETTLE_FLAGS, ...TARGET_FLAGS],
  },
  {
    name: 'fill',
    summary: 'Clear the field and type text. Use an empty string to clear.',
    signature: 'fill @eN | <selector> "<text>"',
    flags: [
      { name: '--delay-ms', summary: 'Per-keystroke delay.', hasValue: true, valueHint: '<ms>' },
      {
        name: '--record-as',
        summary: 'Send the live text but publish ${VAR} in an armed .ad recording.',
        hasValue: true,
        valueHint: '<VAR>',
      },
      ...SETTLE_FLAGS,
      ...TARGET_FLAGS,
    ],
  },
  {
    name: 'type',
    summary: 'Type into the focused field without clearing it.',
    signature: 'type "<text>"',
    flags: [
      { name: '--delay-ms', summary: 'Per-keystroke delay.', hasValue: true, valueHint: '<ms>' },
      ...SETTLE_FLAGS,
      ...TARGET_FLAGS,
    ],
  },
  {
    name: 'swipe',
    summary: 'Drag between two points. For a timed drag use `gesture pan`.',
    signature: 'swipe <x1> <y1> <x2> <y2>',
    flags: [
      { name: '--count', summary: 'Number of swipes (max 200).', hasValue: true, valueHint: '<n>' },
      { name: '--pause-ms', summary: 'Pause between swipes.', hasValue: true, valueHint: '<ms>' },
      {
        name: '--pattern',
        summary: 'Repeat pattern.',
        hasValue: true,
        valueHint: '<one-way|ping-pong>',
        valueChoices: ['one-way', 'ping-pong'],
      },
      ...SETTLE_FLAGS,
      ...TARGET_FLAGS,
    ],
  },
  {
    name: 'gesture',
    summary: 'Multi-touch and timed gestures: pan, fling, drag, pinch, rotate, transform, swipe.',
    signature: 'gesture <pan|fling|drag|pinch|rotate|transform|swipe> …',
    flags: [
      {
        name: '--pointer-count',
        summary: 'Pan: number of touch pointers (default 1).',
        hasValue: true,
        valueHint: '<1|2>',
        valueChoices: ['1', '2'],
      },
      ...SETTLE_FLAGS,
      ...TARGET_FLAGS,
    ],
    subcommands: GESTURE_SUBCOMMANDS,
  },
  {
    name: 'scroll',
    summary: 'Scroll content in a direction.',
    signature: 'scroll <up|down|left|right> [amount]',
    flags: [
      {
        name: '--pixels',
        summary: 'Explicit gesture distance in pixels (instead of amount).',
        hasValue: true,
        valueHint: '<n>',
      },
      {
        name: '--duration-ms',
        summary: 'Pace the gesture over this duration when supported.',
        hasValue: true,
        valueHint: '<ms>',
      },
      ...SETTLE_FLAGS,
      ...TARGET_FLAGS,
    ],
    subcommands: [
      { name: 'up', summary: 'Scroll up.' },
      { name: 'down', summary: 'Scroll down.' },
      { name: 'left', summary: 'Scroll left.' },
      { name: 'right', summary: 'Scroll right.' },
    ],
  },
  {
    name: 'find',
    summary: 'Locate an element semantically, then act on it.',
    signature:
      'find [text|label|value|role|id] "<query>" <exists|click|fill|type|get|wait|list> [value]',
    flags: [
      { name: '--first', summary: 'Pick the first match when ambiguous.', hasValue: false },
      { name: '--last', summary: 'Pick the last match when ambiguous.', hasValue: false },
      ...SETTLE_FLAGS,
      ...TARGET_FLAGS,
    ],
  },
  {
    name: 'is',
    summary: 'Assert an element predicate (fails the step when false).',
    signature:
      'is <visible|hidden|exists|absent|editable|selected|focused|text> <selector> [expected]',
    flags: TARGET_FLAGS,
    subcommands: [
      { name: 'visible', summary: 'Element exists and is on screen.' },
      { name: 'hidden', summary: 'Element exists but is not visible.' },
      { name: 'exists', summary: 'Element is in the tree.' },
      { name: 'absent', summary: 'Element is not in the tree.' },
      { name: 'editable', summary: 'Element accepts text input.' },
      { name: 'selected', summary: 'Element is selected / checked.' },
      { name: 'focused', summary: 'Element has focus (TV / desktop).' },
      {
        name: 'text',
        summary: 'Element text equals the expected value.',
        signature: 'is text <selector> "<expected>"',
      },
    ],
  },
  {
    name: 'wait',
    summary: 'Sleep, or wait for a ref / selector / text to appear, disappear, or settle.',
    signature:
      'wait <ms> | wait @eN|<selector> [ms] | wait text "<text>" [ms] | wait absent <selector> [ms] | wait stable [quietMs] [timeoutMs]',
    flags: TARGET_FLAGS,
    subcommands: [
      {
        name: 'text',
        summary: 'Wait for visible text.',
        signature: 'wait text "<text>" [timeoutMs]',
      },
      {
        name: 'absent',
        summary: 'Wait until a selector no longer matches.',
        signature: 'wait absent <selector> [timeoutMs]',
      },
      {
        name: 'stable',
        summary: 'Wait for the UI to stop changing.',
        signature: 'wait stable [quietMs] [timeoutMs]',
      },
    ],
  },
  {
    name: 'alert',
    summary: 'Read, wait for, accept, or dismiss a system dialog.',
    signature: 'alert [get|wait|accept|dismiss] [timeoutMs]',
    flags: TARGET_FLAGS,
    subcommands: [
      { name: 'get', summary: 'Read the current alert.' },
      {
        name: 'wait',
        summary: 'Wait for an alert to appear.',
        signature: 'alert wait [timeoutMs]',
      },
      { name: 'accept', summary: 'Tap the affirmative button.' },
      { name: 'dismiss', summary: 'Tap the cancel button.' },
    ],
  },
  {
    name: 'keyboard',
    summary: 'Inspect or dismiss the on-screen keyboard.',
    signature: 'keyboard <status|get|dismiss>',
    flags: TARGET_FLAGS,
    subcommands: [
      { name: 'status', summary: 'Whether the keyboard is shown.' },
      { name: 'get', summary: 'Keyboard details.' },
      { name: 'dismiss', summary: 'Hide the keyboard.' },
    ],
  },
  {
    name: 'clipboard',
    summary: 'Read or write the device clipboard.',
    signature: 'clipboard <read|write> ["<text>"]',
    flags: TARGET_FLAGS,
    subcommands: [
      { name: 'read', summary: 'Read clipboard text.' },
      {
        name: 'write',
        summary: 'Write text (empty string clears).',
        signature: 'clipboard write "<text>"',
      },
    ],
  },
  {
    name: 'push',
    summary: 'Simulate a push notification from an .apns file or inline JSON.',
    signature: 'push <app> <payload.apns|json>',
    flags: TARGET_FLAGS,
  },
  {
    name: 'trigger-app-event',
    summary: 'Dispatch an app-defined event via the app hook.',
    signature: 'trigger-app-event <event> [json]',
    flags: TARGET_FLAGS,
  },
  {
    name: 'settings',
    summary:
      'Toggle device settings: wifi, airplane, location, animations, appearance, biometrics, permissions.',
    signature: 'settings <area> <value…>',
    flags: TARGET_FLAGS,
    subcommands: [
      { name: 'wifi', summary: 'Wi-Fi on / off.', signature: 'settings wifi <on|off>' },
      {
        name: 'airplane',
        summary: 'Airplane mode on / off.',
        signature: 'settings airplane <on|off>',
      },
      {
        name: 'location',
        summary: 'Location services, or set coordinates.',
        signature: 'settings location <on|off|set <lat> <lng>>',
      },
      {
        name: 'animations',
        summary: 'System animations on / off.',
        signature: 'settings animations <on|off>',
      },
      {
        name: 'appearance',
        summary: 'Light / dark appearance.',
        signature: 'settings appearance <light|dark|toggle>',
      },
      {
        name: 'faceid',
        summary: 'Simulate Face ID.',
        signature: 'settings faceid <match|nonmatch|enroll|unenroll>',
      },
      {
        name: 'touchid',
        summary: 'Simulate Touch ID.',
        signature: 'settings touchid <match|nonmatch|enroll|unenroll>',
      },
      {
        name: 'fingerprint',
        summary: 'Simulate Android fingerprint.',
        signature: 'settings fingerprint <match|nonmatch>',
      },
      {
        name: 'clear-app-state',
        summary: 'Clear app data.',
        signature: 'settings clear-app-state [app]',
      },
      {
        name: 'reset-keychain',
        summary: 'Reset the simulator keychain.',
        signature: 'settings reset-keychain clear',
      },
      {
        name: 'permission',
        summary: 'Grant / deny / reset an app permission.',
        signature: 'settings permission <grant|deny|reset> <permission> [limited]',
      },
    ],
  },
  {
    name: 'install',
    summary: 'Install an app in place (keeps data).',
    signature: 'install <app-id> <path>',
    flags: TARGET_FLAGS,
  },
  {
    name: 'reinstall',
    summary: 'Uninstall then install an app (fresh state).',
    signature: 'reinstall <app-id> <path>',
    flags: TARGET_FLAGS,
  },
  {
    name: 'install-from-source',
    summary: 'Download and install an app from a URL or GitHub Actions artifact.',
    signature: 'install-from-source <url>',
    flags: [
      {
        name: '--github-actions-artifact',
        summary: 'Resolve a GitHub Actions artifact (owner/repo:artifact-id).',
        hasValue: true,
        valueHint: '<owner/repo:artifact>',
      },
      {
        name: '--header',
        summary: 'HTTP header for URL downloads (repeatable).',
        hasValue: true,
        valueHint: '<name:value>',
      },
      ...TARGET_FLAGS,
    ],
  },
  {
    name: 'tv-remote',
    summary: 'Send TV remote button presses (Android TV, tvOS, Vega).',
    signature: 'tv-remote <press|longpress> <up|down|left|right|select|menu|home|back>',
    flags: [
      {
        name: '--duration-ms',
        summary: 'Hold duration for the press.',
        hasValue: true,
        valueHint: '<ms>',
      },
      ...TARGET_FLAGS,
    ],
    subcommands: [
      {
        name: 'press',
        summary: 'Press a remote button.',
        signature: 'tv-remote press <button> [--duration-ms <ms>]',
      },
      {
        name: 'longpress',
        summary: 'Press and hold a remote button (500ms).',
        signature: 'tv-remote longpress <button>',
      },
    ],
  },
  {
    name: 'viewport',
    summary: 'Resize the active web viewport.',
    signature: 'viewport <width> <height>',
    flags: TARGET_FLAGS,
  },
  {
    name: 'react-native',
    summary: 'React Native helpers.',
    signature: 'react-native dismiss-overlay',
    flags: TARGET_FLAGS,
    subcommands: [{ name: 'dismiss-overlay', summary: 'Dismiss the RN dev overlay / LogBox.' }],
  },

  // ─── Diagnostics ───────────────────────────────────────────────────────────
  {
    name: 'logs',
    summary: 'Stream app logs to the session log file, or insert a timeline marker.',
    signature: 'logs <path|start|stop|clear|doctor|mark> ["<label>"]',
    flags: [
      {
        name: '--restart',
        summary: 'logs clear: stop, clear, then start streaming again.',
        hasValue: false,
      },
      ...TARGET_FLAGS,
    ],
    subcommands: [
      { name: 'path', summary: 'Print the session log file path.' },
      { name: 'start', summary: 'Start streaming app stdout / stderr.' },
      { name: 'stop', summary: 'Stop streaming.' },
      { name: 'clear', summary: 'Truncate the log files.', signature: 'logs clear [--restart]' },
      { name: 'doctor', summary: 'Show log backend readiness.' },
      {
        name: 'mark',
        summary: 'Insert a labelled timeline marker.',
        signature: 'logs mark "<label>"',
      },
    ],
  },
  {
    name: 'events',
    summary: 'Print recent session request / action events.',
    signature: 'events [limit] [cursor]',
    flags: TARGET_FLAGS,
  },
  {
    name: 'network',
    summary: 'Dump recent HTTP(S) requests.',
    signature: 'network dump [limit]',
    flags: [
      {
        name: '--include',
        summary: 'Include headers, bodies, or both.',
        hasValue: true,
        valueHint: '<summary|headers|body|all>',
        valueChoices: ['summary', 'headers', 'body', 'all'],
      },
      ...TARGET_FLAGS,
    ],
    subcommands: [{ name: 'dump', summary: 'Parse recent requests (method / url / status).' }],
  },
  {
    name: 'audio',
    summary: 'Probe audio output levels over time.',
    signature: 'audio probe <start|status|stop> [seconds] [bucketMs]',
    flags: TARGET_FLAGS,
    subcommands: [
      {
        name: 'probe',
        summary: 'Audio probe.',
        signature: 'audio probe <start|status|stop> [seconds] [bucketMs]',
      },
    ],
  },
  {
    name: 'perf',
    summary: 'Performance diagnostics. Needs an area: frames, memory, cpu, or trace.',
    signature: 'perf <frames|memory|cpu|trace> …',
    flags: [
      {
        name: '--kind',
        summary: 'Profiler / snapshot kind.',
        hasValue: true,
        valueHint: '<xctrace|simpleperf|perfetto|android-hprof|memgraph>',
      },
      {
        name: '--template',
        summary: 'xctrace template name.',
        hasValue: true,
        valueHint: '<name>',
      },
      { name: '--out', summary: 'Artifact output path.', hasValue: true, valueHint: '<path>' },
      ...TARGET_FLAGS,
    ],
    subcommands: [
      { name: 'frames', summary: 'Frame timing sample.' },
      {
        name: 'memory',
        summary: 'Memory sample or heap snapshot.',
        signature: 'perf memory <sample|snapshot> [--kind …] [--out …]',
      },
      {
        name: 'cpu',
        summary: 'CPU profile.',
        signature: 'perf cpu profile <start|stop|report> --kind <xctrace|simpleperf>',
      },
      {
        name: 'trace',
        summary: 'System trace.',
        signature: 'perf trace <start|stop> --kind <xctrace|perfetto>',
      },
    ],
  },
  {
    name: 'trace',
    summary: 'Capture a low-level session trace.',
    signature: 'trace <start|stop> [path]',
    flags: TARGET_FLAGS,
    subcommands: [
      { name: 'start', summary: 'Start tracing.' },
      { name: 'stop', summary: 'Stop tracing and write the file.' },
    ],
  },

  // ─── Workflows ─────────────────────────────────────────────────────────────
  {
    name: 'replay',
    summary: 'Run another .ad script as a sub-flow.',
    signature: 'replay <file.ad>',
    flags: [
      {
        name: '--env',
        short: '-e',
        summary: 'Override a script variable (repeatable).',
        hasValue: true,
        valueHint: 'KEY=VALUE',
      },
      { name: '--from', summary: 'Start at step n.', hasValue: true, valueHint: '<n>' },
      {
        name: '--plan-digest',
        summary: 'Plan digest that --from must match.',
        hasValue: true,
        valueHint: '<sha256>',
      },
      {
        name: '--keep-session',
        summary: 'Skip the terminal close and keep the session open.',
        hasValue: false,
      },
      { name: '--timeout', summary: 'Per-step timeout.', hasValue: true, valueHint: '<ms>' },
      ...TARGET_FLAGS,
    ],
  },
  {
    name: 'batch',
    summary: 'Execute a JSON array of {"command","input"} steps.',
    signature: 'batch --steps <json> | --steps-file <path>',
    flags: [
      { name: '--steps', summary: 'Inline JSON steps array.', hasValue: true, valueHint: '<json>' },
      {
        name: '--steps-file',
        summary: 'Read steps JSON from a file.',
        hasValue: true,
        valueHint: '<path>',
      },
      {
        name: '--on-error',
        summary: 'Stop when a step fails.',
        hasValue: true,
        valueHint: 'stop',
        valueChoices: ['stop'],
      },
      {
        name: '--max-steps',
        summary: 'Maximum number of steps.',
        hasValue: true,
        valueHint: '<n>',
      },
      ...TARGET_FLAGS,
    ],
  },
];

/**
 * Commands agent-device 0.20 / 0.21 removed, with the replacement to suggest.
 * These never appear in completion; hover / diagnostics can point at the successor.
 */
export const REMOVED_COMMANDS: ReadonlyMap<string, string> = new Map([
  [
    'rotate',
    'Renamed to `orientation` (device rotation). For the two-finger gesture use `gesture rotate`.',
  ],
  ['metrics', 'Removed. Use `perf frames`, `perf memory sample`, or `perf cpu profile …`.'],
  ['ensure-simulator', 'Removed. Use `boot`.'],
]);

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

export const FIND_LOCATORS: readonly string[] = ['text', 'label', 'value', 'role', 'id'];

export const FIND_ACTIONS: readonly string[] = [
  'exists',
  'click',
  'fill',
  'type',
  'get',
  'wait',
  'list',
];

function indexCommands(commands: readonly CommandDef[]): ReadonlyMap<string, CommandDef> {
  const index = new Map<string, CommandDef>();
  for (const command of commands) {
    index.set(command.name, command);
    for (const alias of command.aliases ?? []) {
      index.set(alias, command);
    }
  }
  return index;
}

export const COMMAND_BY_NAME: ReadonlyMap<string, CommandDef> = indexCommands(COMMANDS);

export const DIRECTIVE_BY_NAME: ReadonlyMap<string, DirectiveDef> = new Map(
  DIRECTIVES.map((d) => [d.name, d]),
);
