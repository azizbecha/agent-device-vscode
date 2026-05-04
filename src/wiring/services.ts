import * as path from 'node:path';
import * as vscode from 'vscode';

import { HtmlReportWriter } from '../reports/htmlReportWriter';
import { type ResolvedBin } from '../runners/cliRunner';
import { ReplayRunner } from '../runners/replayRunner';
import { AdFileIndex } from '../services/adFileIndex';
import { AgentDeviceConfig } from '../services/config';
import { DeviceCatalog } from '../services/deviceCatalog';
import { SnapshotIndex } from '../services/snapshotIndex';

export interface ExtensionServices {
  readonly config: AgentDeviceConfig;
  readonly resolveCliPath: () => ResolvedBin;
  readonly runner: ReplayRunner;
  readonly fileIndex: AdFileIndex;
  readonly deviceCatalog: DeviceCatalog;
  readonly reportWriter: HtmlReportWriter;
  readonly snapshotIndex: SnapshotIndex;
  readonly output: vscode.OutputChannel;
}

export function createServices(context: vscode.ExtensionContext): ExtensionServices {
  const output = vscode.window.createOutputChannel('Agent Device');
  context.subscriptions.push(output);

  const config = new AgentDeviceConfig();
  const resolveCliPath = (): ResolvedBin => {
    const override = config.cliPathOverride();
    return override !== undefined
      ? { command: override, prefixArgs: [] }
      : resolveBundledCli(context);
  };

  const runner = new ReplayRunner({
    cliPath: resolveCliPath,
    sessionName: () => config.sessionName(),
  });
  context.subscriptions.push(runner);

  const fileIndex = new AdFileIndex();
  context.subscriptions.push(fileIndex);

  const deviceCatalog = new DeviceCatalog(resolveCliPath, () => config.androidSdkPath());
  context.subscriptions.push(deviceCatalog);

  const reportWriter = new HtmlReportWriter(runner, config);
  context.subscriptions.push(reportWriter);

  const snapshotIndex = new SnapshotIndex(runner);
  context.subscriptions.push(snapshotIndex);

  return {
    config,
    resolveCliPath,
    runner,
    fileIndex,
    deviceCatalog,
    reportWriter,
    snapshotIndex,
    output,
  };
}

function resolveBundledCli(context: vscode.ExtensionContext): ResolvedBin {
  // The .vsix doesn't include npm's `.bin` shim directory, so spawn the CLI's
  // .mjs entrypoint directly via the host's Node runtime. In the extension
  // host, process.execPath is Electron — ELECTRON_RUN_AS_NODE makes it behave
  // as a plain Node interpreter for the child process.
  const scriptPath = path.join(
    context.extensionPath,
    'node_modules',
    'agent-device',
    'bin',
    'agent-device.mjs',
  );
  return {
    command: process.execPath,
    prefixArgs: [scriptPath],
    env: { ELECTRON_RUN_AS_NODE: '1' },
  };
}
