import * as vscode from 'vscode';

import { SCRIPT_TEMPLATES } from '../data/templates';
import type { HtmlReportWriter } from '../reports/htmlReportWriter';
import { CliRunner, type ResolvedBin } from '../runners/cliRunner';
import type { ReplayRunner } from '../runners/replayRunner';
import type { DeviceCatalog, DeviceEntry } from '../services/deviceCatalog';
import { parseSnapshotRefs, type SnapshotIndex } from '../services/snapshotIndex';
import { isDeviceNode } from '../views/deviceTreeProvider';

const LANGUAGE_ID = 'agent-device';

export interface CommandsDeps {
  readonly runner: ReplayRunner;
  readonly deviceCatalog: DeviceCatalog;
  readonly reportWriter: HtmlReportWriter;
  readonly snapshotIndex: SnapshotIndex;
  readonly resolveCliPath: () => ResolvedBin;
  readonly sessionName: () => string;
}

export function registerCommands(context: vscode.ExtensionContext, deps: CommandsDeps): void {
  registerRunCommands(context, deps.runner);
  registerDeviceCommands(context, deps.deviceCatalog);
  registerSnapshotCommands(context, deps.snapshotIndex, deps.resolveCliPath, deps.sessionName);
  registerReportCommand(context, deps.reportWriter);
  registerSettingsCommand(context);
}

function registerRunCommands(context: vscode.ExtensionContext, runner: ReplayRunner): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('agentDevice.runScript', async (uri?: vscode.Uri) => {
      const target = await resolveRunTarget(uri);
      if (!target) {
        return;
      }
      await safeRun(runner, target.scriptPath);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'agentDevice.runScriptUpTo',
      async (uri: vscode.Uri, lineNumber: number) => {
        const target = await resolveRunTarget(uri);
        if (!target) {
          return;
        }
        await safeRun(runner, target.scriptPath, { endAtLine: lineNumber });
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      'agentDevice.runScriptLine',
      async (uri: vscode.Uri, lineNumber: number) => {
        const target = await resolveRunTarget(uri);
        if (!target) {
          return;
        }
        await safeRun(runner, target.scriptPath, { onlyLine: lineNumber });
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('agentDevice.cancelRun', () => runner.cancel()),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('agentDevice.newScript', async () => {
      const picked = await vscode.window.showQuickPick(
        SCRIPT_TEMPLATES.map((template) => ({
          label: template.label,
          description: template.description,
          template,
        })),
        {
          title: 'New .ad Script',
          placeHolder: 'Choose a template to start from',
          matchOnDescription: true,
        },
      );
      if (!picked) {
        return;
      }
      const doc = await vscode.workspace.openTextDocument({
        language: LANGUAGE_ID,
        content: picked.template.content,
      });
      await vscode.window.showTextDocument(doc);
    }),
  );
}

function registerDeviceCommands(context: vscode.ExtensionContext, catalog: DeviceCatalog): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('agentDevice.refreshDevices', () => catalog.refresh()),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('agentDevice.bootDevice', async (node?: unknown) => {
      const device = await resolveDeviceTarget(node, catalog, 'shutdown');
      if (!device) {
        return;
      }
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Booting ${device.name}…`,
            cancellable: false,
          },
          () => catalog.boot(device),
        );
        vscode.window.showInformationMessage(`Booted ${device.name}.`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to boot ${device.name}: ${message}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('agentDevice.shutdownDevice', async (node?: unknown) => {
      const device = await resolveDeviceTarget(node, catalog, 'booted');
      if (!device) {
        return;
      }
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: `Shutting down ${device.name}…`,
            cancellable: false,
          },
          () => catalog.shutdown(device),
        );
        vscode.window.showInformationMessage(`Shut down ${device.name}.`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Failed to shut down ${device.name}: ${message}`);
      }
    }),
  );
}

function registerSnapshotCommands(
  context: vscode.ExtensionContext,
  snapshotIndex: SnapshotIndex,
  cliPath: () => ResolvedBin,
  sessionName: () => string,
): void {
  const cli = new CliRunner(cliPath);

  context.subscriptions.push(
    vscode.commands.registerCommand('agentDevice.refreshSnapshot', async () => {
      try {
        const result = await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Window,
            title: 'agent-device: capturing snapshot…',
          },
          () => cli.run(['snapshot', '-i', '--session', sessionName()]),
        );
        if (result.exitCode !== 0) {
          const message =
            (result.stderr || result.stdout).trim().split(/\r?\n/)[0] ?? 'snapshot failed';
          vscode.window.showErrorMessage(`Snapshot failed: ${message}`);
          return;
        }
        const refs = parseSnapshotRefs(result.stdout);
        snapshotIndex.setRefs(refs, snapshotIndex.scriptPath);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Snapshot failed: ${message}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('agentDevice.clearSnapshot', () => snapshotIndex.clear()),
  );
}

function registerReportCommand(
  context: vscode.ExtensionContext,
  reportWriter: HtmlReportWriter,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('agentDevice.openLastReport', async () => {
      const uri = reportWriter.lastReportUri;
      if (!uri) {
        vscode.window.showInformationMessage('No reports yet. Run a script first.');
        return;
      }
      await vscode.env.openExternal(uri);
    }),
  );
}

function registerSettingsCommand(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('agentDevice.openSettings', () => {
      void vscode.commands.executeCommand('workbench.action.openSettings', 'agentDevice');
    }),
  );
}

async function safeRun(
  runner: ReplayRunner,
  scriptPath: string,
  options?: { endAtLine?: number; onlyLine?: number },
): Promise<void> {
  try {
    await runner.run(scriptPath, options ?? {});
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    vscode.window.showErrorMessage(`Replay failed: ${message}`);
  }
}

async function resolveRunTarget(
  uri: vscode.Uri | undefined,
): Promise<{ scriptPath: string } | null> {
  if (uri instanceof vscode.Uri) {
    const document = await vscode.workspace.openTextDocument(uri);
    if (document.isDirty) {
      await document.save();
    }
    return { scriptPath: uri.fsPath };
  }
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== LANGUAGE_ID) {
    vscode.window.showWarningMessage('Open a .ad file to run.');
    return null;
  }
  if (editor.document.isDirty) {
    await editor.document.save();
  }
  return { scriptPath: editor.document.uri.fsPath };
}

async function resolveDeviceTarget(
  node: unknown,
  catalog: DeviceCatalog,
  state: 'booted' | 'shutdown',
): Promise<DeviceEntry | undefined> {
  if (isDeviceNode(node)) {
    return node.device;
  }
  const wantBooted = state === 'booted';
  const candidates = catalog.devices.filter((d) => d.booted === wantBooted);
  if (candidates.length === 0) {
    vscode.window.showInformationMessage(
      wantBooted ? 'No booted devices to shut down.' : 'No shutdown devices to boot.',
    );
    return undefined;
  }
  const picked = await vscode.window.showQuickPick(
    candidates.map((device) => ({
      label: device.name,
      description: `${device.platform} · ${device.kind}`,
      device,
    })),
    {
      title: wantBooted ? 'Shut down device' : 'Boot device',
      placeHolder: wantBooted ? 'Pick a device to shut down' : 'Pick a device to boot',
    },
  );
  return picked?.device;
}
