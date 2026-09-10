export interface ScriptTemplate {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly content: string;
}

/**
 * Starter scripts written against agent-device 0.21:
 *  - `--settle` on interactions returns the settled diff with fresh refs, so
 *    templates prefer it over `wait <ms>` + re-snapshot;
 *  - selectors (`label=`, `id=`, `role=`, `||`) instead of guessed `@eN` refs;
 *  - `is` / `wait absent` / `wait text` for assertions;
 *  - post-0.20 gesture forms (no trailing durationMs on `swipe` / `fling`).
 */
export const SCRIPT_TEMPLATES: readonly ScriptTemplate[] = [
  {
    id: 'empty',
    label: 'Empty file',
    description: 'Start from a blank script',
    content: `# Agent-device script
context platform=ios

`,
  },
  {
    id: 'ios-settings',
    label: 'iOS — Settings smoke',
    description: 'Open Preferences, drill into a menu, assert with selectors',
    content: `# iOS smoke test against the system Settings app
context platform=ios timeout=10000

open com.apple.Preferences --relaunch
snapshot -i

click "label=General" --settle
is exists "label=\\"Software Update\\""
back
`,
  },
  {
    id: 'android-settings',
    label: 'Android — Settings smoke',
    description: 'Open Settings, drill into a menu, assert with selectors',
    content: `# Android smoke test against the system Settings app
context platform=android timeout=10000

open settings --relaunch
snapshot -i

click "label=Notifications" --settle
is exists "label=\\"Notification history\\""
back
`,
  },
  {
    id: 'login-flow',
    label: 'Login flow',
    description: 'Sign-in happy path with selectors, settle diffs, and assertions',
    content: `# Replace APP_ID, ids, and credentials before running
context platform=ios timeout=15000

env APP_ID=com.example.sampleapp
env USER_EMAIL=qa@example.com
env USER_PASSWORD=hunter2

open \${APP_ID} --relaunch
wait "label=\\"Sign in\\"" 10000

click "label=\\"Sign in\\"" --settle
fill "id=email" "\${USER_EMAIL}"
fill "id=password" "\${USER_PASSWORD}"
keyboard dismiss
click "role=button label=Continue" --settle

wait absent "label=Loading..." 10000
wait text "Dashboard" 10000
is visible "id=dashboard-header"
`,
  },
  {
    id: 'assert-wait',
    label: 'Assert & wait',
    description: 'Every assertion form: is, wait text / absent / stable, find … exists',
    content: `# Assertion cheat sheet against iOS Settings
context platform=ios timeout=10000

open com.apple.Preferences --relaunch
wait stable

is exists "label=General"
is visible "role=button label=General || label=General"
is absent "label=\\"Does not exist\\""
find text "General" exists

click "label=General" --settle
wait text "About" 5000
wait absent "label=Loading..." 2000
get text "label=About"
`,
  },
  {
    id: 'search-assert',
    label: 'Search & assert',
    description: 'Type into a search field, verify a result appears',
    content: `# Search inside iOS Settings; verify a result becomes visible
context platform=ios timeout=10000

open com.apple.Preferences --relaunch
click "role=searchField" --settle
type "General" --settle

wait text "General" 5000
find text "General" exists
`,
  },
  {
    id: 'scroll-discover',
    label: 'Scroll & discover',
    description: 'Scroll with --settle so each step returns fresh refs',
    content: `# Scroll a list; --settle returns the settled diff with current refs
context platform=ios timeout=10000

open com.apple.Preferences --relaunch
snapshot -i

scroll down 0.6 --settle
scroll down 0.6 --settle
scroll down --pixels 320 --settle
`,
  },
  {
    id: 'gestures',
    label: 'Gestures (swipe, pan, fling, pinch)',
    description: 'Post-0.20 gesture forms: no trailing duration on swipe / fling',
    content: `# Gesture forms as agent-device 0.20+ accepts them
context platform=ios timeout=10000

open com.apple.Preferences --relaunch
snapshot -i

# Default-duration drag between two points (x1 y1 x2 y2)
swipe 200 700 200 200 --settle

# Timed drag: from (x, y) by (dx, dy) over durationMs
gesture pan 200 200 0 500 400 --settle

# Flick from a point, optional distance
gesture fling up 200 600 300 --settle

# Zoom and rotate around a point
gesture pinch 1.5 200 400
gesture rotate 35 200 400
`,
  },
  {
    id: 'visual-baseline',
    label: 'Visual baseline',
    description: 'Capture screenshots and diff them against a baseline',
    content: `# Save screenshots, then compare against a stored baseline
context platform=ios timeout=10000

open com.apple.Preferences --relaunch
screenshot "./out/01-settings-root.png" --normalize-status-bar

click "label=General" --settle
screenshot "./out/02-general.png" --normalize-status-bar

# Re-run later and diff the fresh capture against the saved baseline
diff screenshot --baseline "./baselines/02-general.png" "./out/02-general.png" --out "./out/02-general.diff.png"
`,
  },
  {
    id: 'react-native-metro',
    label: 'React Native (Metro)',
    description: 'Launch an RN app against a running Metro bundler',
    content: `# Open a React Native app via Metro for live JS reloads
context platform=ios timeout=15000

env APP_ID=com.example.rnapp

open \${APP_ID} --relaunch --metro-host 127.0.0.1 --metro-port 8081
react-native dismiss-overlay
wait stable
snapshot -i
`,
  },
  {
    id: 'macos-app',
    label: 'macOS — desktop app',
    description: 'Drive a native macOS app through the Apple desktop backend',
    content: `# macOS app session (System Settings); use --surface desktop for the whole desktop
context platform=macos timeout=30000

open "System Settings" --relaunch
snapshot -i

wait "role=button label=About" 5000
click "role=button label=About" --settle
wait "label=\\"System Report...\\" || label=Chip || label=Processor || label=macOS" 15000
screenshot "./out/macos-about.png"
back
`,
  },
  {
    id: 'linux-app',
    label: 'Linux — desktop app',
    description: 'Drive a GTK app on Linux (AT-SPI)',
    content: `# Linux desktop smoke (gnome-calculator)
context platform=linux timeout=30000

open gnome-calculator
wait "appname=gnome-calculator || windowtitle=Calculator" 15000
snapshot -i

click "role=button label=1" --settle
type "00+55="
wait text "155" 5000
screenshot "./out/linux-calculator.png"
`,
  },
  {
    id: 'android-tv',
    label: 'Android TV — remote navigation',
    description: 'Focus-first navigation with tv-remote on an Android TV emulator',
    content: `# Android TV: move D-pad focus, then select
context platform=android target=tv timeout=15000

open YouTube --relaunch
snapshot -i

tv-remote press down
tv-remote press right
is focused "role=button"
tv-remote press select
wait stable
screenshot "./out/tv-focus.png" --overlay-refs
`,
  },
];
