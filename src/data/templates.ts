export interface ScriptTemplate {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly content: string;
}

export const SCRIPT_TEMPLATES: readonly ScriptTemplate[] = [
  {
    id: 'empty',
    label: 'Empty file',
    description: 'Start from a blank script',
    content: `# Agent-device script

`,
  },
  {
    id: 'ios-settings',
    label: 'iOS — Settings smoke',
    description: 'Open Preferences, snapshot, drill into a menu',
    content: `# iOS smoke test against the system Settings app
context platform=ios
context timeout=10000

open com.apple.Preferences --relaunch
snapshot -i

click "label=General"
wait 500
find text "Software Update" exists
back
`,
  },
  {
    id: 'android-settings',
    label: 'Android — Settings smoke',
    description: 'Open Settings, snapshot, drill into a menu',
    content: `# Android smoke test against the system Settings app
context platform=android
context timeout=10000

open settings --relaunch
snapshot -i

click "label=Notifications"
wait 500
find text "Notification history" exists
back
`,
  },
  {
    id: 'login-flow',
    label: 'Login flow',
    description: 'Sign-in happy path with assertions on the next screen',
    content: `# Replace APP_ID and credentials before running
context platform=ios
context timeout=10000

env APP_ID=com.example.sampleapp
env USER_EMAIL=qa@example.com

open \${APP_ID} --relaunch
snapshot -i

click "label=Sign in"
fill @e3 "\${USER_EMAIL}"
fill @e5 "hunter2"
click @e7

wait 1000
find text "Dashboard" exists
is @e2 visible
`,
  },
  {
    id: 'search-assert',
    label: 'Search & assert',
    description: 'Type into a search field, verify a result appears',
    content: `# Search inside iOS Settings; verify a result becomes visible
context platform=ios
context timeout=10000

open com.apple.Preferences --relaunch
click "role=searchField"
type "General"
wait 500

find text "General" exists
`,
  },
  {
    id: 'scroll-until',
    label: 'Scroll & discover',
    description: 'Scroll the page and re-snapshot to find off-screen elements',
    content: `# Scroll a list, then re-snapshot to expose new refs
context platform=ios
context timeout=10000

open com.apple.Preferences --relaunch
snapshot -i

scroll down 0.6
wait 300
snapshot -i

scroll down 0.6
wait 300
snapshot -i
`,
  },
  {
    id: 'swipe-gestures',
    label: 'Swipe gestures',
    description: 'Drive swipes in both directions and re-snapshot',
    content: `# Manual swipes to drive the UI
context platform=ios
context timeout=10000

open com.apple.Preferences --relaunch
snapshot -i

# Swipe up to scroll
swipe 200 700 200 200 300
wait 300
snapshot -i

# Swipe back down
swipe 200 200 200 700 300
`,
  },
  {
    id: 'visual-baseline',
    label: 'Visual baseline',
    description: 'Capture screenshots at key points for later diffing',
    content: `# Save baseline screenshots; pair with \`diff screenshot\` later
context platform=ios
context timeout=10000

open com.apple.Preferences --relaunch
screenshot "./out/01-settings-root.png"

click "label=General"
wait 500
screenshot "./out/02-general.png"
`,
  },
  {
    id: 'react-native-metro',
    label: 'React Native (Metro)',
    description: 'Launch a RN app pointing at a running Metro bundler',
    content: `# Open a React Native app via Metro for live JS reloads
context platform=ios
context timeout=15000

env APP_ID=com.example.rnapp

runtime --platform ios --metro-host 127.0.0.1 --metro-port 8081
open \${APP_ID} --relaunch
snapshot -i
`,
  },
];
