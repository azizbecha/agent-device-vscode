import * as path from 'node:path';
import * as vscode from 'vscode';

import { HtmlReportWriter } from '../reports/htmlReportWriter';
import { ReplayRunner } from '../runners/replayRunner';
import { AdFileIndex } from '../services/adFileIndex';
import { AgentDeviceConfig } from '../services/config';
import { DeviceCatalog } from '../services/deviceCatalog';
import { SnapshotIndex } from '../services/snapshotIndex';

export interface ExtensionServices {
  readonly config: AgentDeviceConfig;
  readonly resolveCliPath: () => string;
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
  const resolveCliPath = (): string => config.cliPathOverride() ?? resolveBundledCliPath(context);

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

function resolveBundledCliPath(context: vscode.ExtensionContext): string {
  const binName = process.platform === 'win32' ? 'agent-device.cmd' : 'agent-device';
  return path.join(context.extensionPath, 'node_modules', '.bin', binName);
}
