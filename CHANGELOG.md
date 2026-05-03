# Changelog

All notable changes to this extension will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.2] - 2026-05-03

### Fixed

- **Run steps now work in installed extensions.** The `node_modules/.bin/agent-device` shim that npm creates locally is not preserved in the packaged `.vsix`, so spawning the bundled CLI failed with `ENOENT` on every step. The extension now spawns the CLI's `.mjs` entrypoint directly via the host's Node runtime (`process.execPath` with `ELECTRON_RUN_AS_NODE=1`), which works in VS Code, Cursor, and other Electron-based forks.

## [0.1.1] - 2026-05-03

### Changed

- Rename the extension identifier from `agent-device-vscode` to `agent-device`. New marketplace IDs: `azizbecha.agent-device` (VS Code Marketplace), `azizbecha/agent-device` (Open VSX). The previous `agent-device-vscode` listing has been unpublished.

## [0.1.0] - 2026-05-03

Initial public release.

### Authoring

- TextMate grammar for `.ad` files (commands, `@eN` refs, flags, double-quoted strings, `${VAR}` interpolation, `#` comments).
- Completion: top-level commands, command-scoped flags, `context` keys, `find` sub-actions.
- Variable completion inside `${...}` (built-in `AD_*` plus `env`-defined names).
- Element-ref (`@eN`) completion populated from the latest `snapshot -i` output.
- Platform value completion + diagnostic for `--platform` / `context platform=`.
- Hover docs for commands, directives, and flags.

### Running

- Run Output panel in the bottom container with a workspace-wide `.ad` file picker, live per-step status, expandable stdout / stderr / error blocks with copy buttons, and a Stop button that kills the in-flight subprocess.
- CodeLenses on every action line: `▶ Run` (this line only) and `▶ Run up to here`.
- Native gutter test icons via per-step `TestItem`s with ranges.
- Test Explorer integration — runs from any entry point (panel, CodeLens, palette, native gutter) all reflect in the Testing view.
- Status-bar pill + popup notifications on success / failure / cancellation.
- Keybinding: `Ctrl+Shift+Enter` / `Cmd+Shift+Enter` runs the active `.ad`.

### Templates

- `+ New` opens a QuickPick of nine starter templates (empty, iOS / Android Settings smoke, login flow, search & assert, scroll & discover, swipe gestures, visual baseline, React Native + Metro).

### Devices

- Sidebar tree of every iOS simulator and Android AVD, grouped by platform with booted entries floated.
- Boot / Shut down with inline icons, right-click, palette, and quick-pick fallbacks. iOS uses `xcrun simctl` directly; Android uses `emulator -avd` and `adb emu kill`.

### Snapshot Inspector

- Sidebar view with a tree of `@eN` refs from the most recent snapshot. Click a row to insert at the cursor; copy and search affordances built in.
- `Refresh Snapshot` and `Clear Snapshot` commands wired to the view title.

### Reports

- Self-contained HTML run reports under `<workspace>/.agent-device-reports/<iso-timestamp>/index.html`. Sticky toolbar with search, status filter pills, expand-all toggle, per-step copy buttons, and prefers-color-scheme support.

### Settings

- Sidebar Settings panel with a User / Workspace scope toggle, source labels per field, and per-field reset.
- `agentDevice.cliPath`, `session`, `androidSdkPath`, `report.enabled`, `notifications.enabled`.

### Tooling

- Strict TypeScript, oxlint + oxfmt, vitest unit tests for the parsers and helpers, GitHub Actions CI.
