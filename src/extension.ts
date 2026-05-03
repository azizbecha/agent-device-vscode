import * as vscode from 'vscode';

import { registerCommands } from './wiring/commands';
import { registerLanguageFeatures } from './wiring/languageFeatures';
import { registerOutputChannelSink, registerRunNotifier } from './wiring/runEvents';
import { createServices } from './wiring/services';
import { registerViews } from './wiring/views';

export function activate(context: vscode.ExtensionContext): void {
  const services = createServices(context);

  registerLanguageFeatures(
    context,
    services.runner,
    services.fileIndex,
    services.snapshotIndex,
  );

  registerViews(context, services);

  registerOutputChannelSink(context, services.runner, services.output);
  registerRunNotifier(context, services.runner, services.config);

  registerCommands(context, {
    runner: services.runner,
    deviceCatalog: services.deviceCatalog,
    reportWriter: services.reportWriter,
    snapshotIndex: services.snapshotIndex,
    resolveCliPath: services.resolveCliPath,
    sessionName: () => services.config.sessionName(),
  });
}

export function deactivate(): void {}
