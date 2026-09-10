import * as vscode from 'vscode';

import { registerCommands } from './wiring/commands';
import { registerLanguageFeatures } from './wiring/languageFeatures';
import { registerOutputChannelSink, registerRunNotifier } from './wiring/runEvents';
import { createServices } from './wiring/services';
import { describeNodeRequirement, satisfiesNodeRequirement } from './services/runtimeCheck';
import { registerViews } from './wiring/views';

export function activate(context: vscode.ExtensionContext): void {
  const services = createServices(context);

  warnIfHostNodeTooOld(services.config.cliPathOverride() !== undefined);

  registerLanguageFeatures(context, services.runner, services.fileIndex, services.snapshotIndex);

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

/**
 * The bundled CLI runs on the extension host's Node. Older hosts (VS Code
 * < 1.101, or forks still on Electron 34) cannot run agent-device 0.21, so
 * point the user at `agentDevice.cliPath` instead of failing on every step.
 */
function warnIfHostNodeTooOld(hasCliOverride: boolean): void {
  const hostNode = process.versions.node;
  if (hasCliOverride || satisfiesNodeRequirement(hostNode)) {
    return;
  }
  const openSettings = 'Set agentDevice.cliPath';
  void vscode.window
    .showWarningMessage(
      `Agent Device: the bundled agent-device CLI needs Node ${describeNodeRequirement()}+ but this ` +
        `editor's extension host runs Node ${hostNode}. Update the editor, or point ` +
        '`agentDevice.cliPath` at an agent-device install on a newer Node.',
      openSettings,
    )
    .then((choice) => {
      if (choice === openSettings) {
        void vscode.commands.executeCommand('workbench.action.openSettings', 'agentDevice.cliPath');
      }
    });
}
