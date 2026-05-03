import * as vscode from 'vscode';

import { RunOutputPanel } from '../panels/runOutputPanel';
import { SettingsPanel } from '../panels/settingsPanel';
import { SnapshotInspectorPanel } from '../panels/snapshotInspectorPanel';
import type { HtmlReportWriter } from '../reports/htmlReportWriter';
import type { ReplayRunner } from '../runners/replayRunner';
import type { AdFileIndex } from '../services/adFileIndex';
import type { AgentDeviceConfig } from '../services/config';
import type { DeviceCatalog } from '../services/deviceCatalog';
import type { SnapshotIndex } from '../services/snapshotIndex';
import { DeviceTreeProvider } from '../views/deviceTreeProvider';

export interface ViewsDeps {
  readonly runner: ReplayRunner;
  readonly fileIndex: AdFileIndex;
  readonly reportWriter: HtmlReportWriter;
  readonly snapshotIndex: SnapshotIndex;
  readonly config: AgentDeviceConfig;
  readonly deviceCatalog: DeviceCatalog;
}

export function registerViews(context: vscode.ExtensionContext, deps: ViewsDeps): void {
  registerRunOutputPanel(context, deps);
  registerSettingsPanel(context, deps.config);
  registerSnapshotInspector(context, deps.snapshotIndex);
  registerDeviceTree(context, deps.deviceCatalog);
}

function registerRunOutputPanel(context: vscode.ExtensionContext, deps: ViewsDeps): void {
  const panel = new RunOutputPanel(
    context.extensionUri,
    deps.runner,
    deps.fileIndex,
    deps.reportWriter,
  );
  context.subscriptions.push(
    panel,
    vscode.window.registerWebviewViewProvider(RunOutputPanel.viewId, panel),
  );
}

function registerSettingsPanel(context: vscode.ExtensionContext, config: AgentDeviceConfig): void {
  const panel = new SettingsPanel(context.extensionUri, config);
  context.subscriptions.push(
    panel,
    vscode.window.registerWebviewViewProvider(SettingsPanel.viewId, panel),
  );
}

function registerSnapshotInspector(
  context: vscode.ExtensionContext,
  snapshotIndex: SnapshotIndex,
): void {
  const panel = new SnapshotInspectorPanel(context.extensionUri, snapshotIndex);
  context.subscriptions.push(
    panel,
    vscode.window.registerWebviewViewProvider(SnapshotInspectorPanel.viewId, panel),
  );
}

function registerDeviceTree(context: vscode.ExtensionContext, catalog: DeviceCatalog): void {
  const provider = new DeviceTreeProvider(catalog);
  context.subscriptions.push(
    provider,
    vscode.window.registerTreeDataProvider(DeviceTreeProvider.viewId, provider),
  );
  void catalog.refresh();
}
