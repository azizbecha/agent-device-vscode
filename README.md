# Agent Device for VS Code

Author, run, and inspect [agent-device](https://incubator.callstack.com/agent-device) `.ad` scripts inside VS Code — Vitest-style.

## Features

### Authoring
- **Syntax highlighting** for `.ad` files — commands, `@eN` refs, flags, double-quoted strings, `${VAR}` interpolation, `#` comments
- **Completion** for commands, command-scoped flags, `context` keys (`platform=`, `timeout=`, `retries=`), `find` sub-actions
- **Variable completion** inside `${...}` — built-in `AD_*` plus `env`-defined names from the same file
- **Platform value completion + diagnostic** — suggests `android` / `ios` after `--platform` and `context platform=`, errors on anything else
- **Hover** docs for commands, directives, and flags

### Running
- **Run Output panel** in the bottom panel container — opens to a workspace-wide `.ad` file picker; click any file to run
- **Per-step UI** as steps execute live: pending circle → spinner → green ✓ / red ✗ / muted skipped, with live duration counters
- **Click any step row** (passed/failed/running) to expand stdout, stderr, or the error block; copy buttons on every output block
- **Stop** button kills the in-flight subprocess immediately (forwards `AbortSignal` to the spawned `agent-device`)
- **CodeLenses** above each action line: `▶ Run` (just that line) and `▶ Run up to here`
- **Native gutter test icons** — every action line is a child `TestItem` with a `range`, so the editor gutter shows pass/fail icons after each run
- **Test Explorer integration** — every `.ad` file appears as a `TestItem`; runs from any entry point (panel, CodeLens, palette, native test gutter) all reflect the same state in the Testing view

### Templates
- `+ New` opens a QuickPick with 9 starter templates: empty file, iOS/Android Settings smoke, login flow, search & assert, scroll & discover, swipe gestures, visual baseline, React Native (Metro)

### Devices
- **Devices view** lists every iOS simulator and Android AVD, grouped by platform, booted entries first
- **Boot / Shut down** inline icons on hover, also in the right-click menu and Command Palette
- iOS uses `xcrun simctl` directly; Android uses `emulator -avd` + `adb emu kill` for reliable per-device control regardless of the daemon's session lock

### Reports
- Every run writes a self-contained HTML report to `<workspace>/.agent-device-reports/<iso-timestamp>/`
- Sticky toolbar with **search** (`/` to focus), **status filter pills** (All / Passed / Failed / Skipped with counts), **Expand all / Collapse all**
- Per-step Copy command + Copy stdout/stderr buttons; light/dark mode auto-detected; pure HTML/CSS/JS, no external assets — share by zipping the run folder

## Install (development)

```bash
npm install
npm run watch
```

Then press `F5` in VS Code to launch the Extension Development Host. Open any folder containing `.ad` files and click the **Agent Device** tab in the bottom panel.

## Install (packaged)

```bash
npm run package    # produces agent-device-vscode-<version>.vsix
code --install-extension agent-device-vscode-<version>.vsix
```

## Settings

Open via the gear icon in either Agent Device view title, the Command Palette (`Agent Device: Open Settings`), or VS Code's settings UI filtered to `agentDevice`.

| Setting | Default | Purpose |
|---|---|---|
| `agentDevice.cliPath` | bundled | Override path to the `agent-device` binary. Useful when developing against a local checkout. |
| `agentDevice.session` | `vscode` | Daemon session name used for replay runs. |
| `agentDevice.androidSdkPath` | `$ANDROID_HOME` | Override the Android SDK location used to find `adb` and `emulator`. |
| `agentDevice.report.enabled` | `true` | Generate HTML reports under `.agent-device-reports/`. |
| `agentDevice.notifications.enabled` | `true` | Show success / failure popups (status bar pill always shows). |

User-level settings apply globally; workspace-level settings override per project — both surfaces are reachable from the gear icon.

## Architecture

```
src/
  extension.ts                — activation; wires everything
  data/                       — static catalogs (commands, templates, platforms, variables)
  diagnostics/                — platform-value validator
  panels/                     — RunOutputPanel (webview, list + run views)
  providers/                  — completion, hover, codelens
  reports/                    — HtmlReportWriter + reportTemplate
  runners/                    — ReplayRunner (event emitter), CliRunner, scriptParser
  services/                   — AdFileIndex, DeviceCatalog, AgentDeviceConfig
  testing/                    — AgentDeviceTestController (TestRun mirroring)
  views/                      — DeviceTreeProvider
  util/                       — duration / pluralize helpers
media/
  agent-device.svg            — activity bar icon
  runOutput.css               — webview styles (loaded via webview.asWebviewUri)
syntaxes/
  agent-device.tmLanguage.json
examples/
  demo.ad
```

The runner spawns the `agent-device` CLI per step (so cancellation kills the in-flight subprocess immediately), parses `.ad` itself for variable interpolation and step-by-step events, and emits a typed event stream that every UI surface consumes.

## License

MIT.
