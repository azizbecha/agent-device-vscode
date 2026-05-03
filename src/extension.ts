import * as path from 'node:path';
import * as vscode from 'vscode';

import {
  COMMAND_BY_NAME,
  COMMANDS,
  DIRECTIVE_BY_NAME,
  DIRECTIVES,
  FIND_ACTIONS,
  FIND_LOCATORS,
} from './data/commands';
import { SUPPORTED_PLATFORMS } from './data/platforms';
import { BUILTIN_VARIABLES } from './data/variables';
import { PlatformDiagnostics } from './diagnostics/platformValidator';
import { RunOutputPanel } from './panels/runOutputPanel';
import { CommandCompletionProvider } from './providers/completionProvider';
import { CommandHoverProvider } from './providers/hoverProvider';
import { RunStepCodeLensProvider } from './providers/runStepCodeLensProvider';
import { ValueCompletionProvider } from './providers/valueCompletionProvider';
import { VariableCompletionProvider } from './providers/variableCompletionProvider';
import { HtmlReportWriter } from './reports/htmlReportWriter';
import { ReplayRunner } from './runners/replayRunner';
import { AdFileIndex } from './services/adFileIndex';
import { DeviceCatalog, type DeviceEntry } from './services/deviceCatalog';
import { AgentDeviceTestController } from './testing/agentDeviceTestController';
import { formatDuration } from './util/duration';
import { pluralize } from './util/pluralize';
import { SCRIPT_TEMPLATES } from './data/templates';
import { DeviceTreeProvider, isDeviceNode } from './views/deviceTreeProvider';

const LANGUAGE_ID = 'agent-device';

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('Agent Device');
  context.subscriptions.push(output);

  const cliPath = resolveCliPath(context);

  const runner = new ReplayRunner({ cliPath });
  context.subscriptions.push(runner);

  const fileIndex = new AdFileIndex();
  context.subscriptions.push(fileIndex);

  const deviceCatalog = new DeviceCatalog(cliPath);
  context.subscriptions.push(deviceCatalog);

  const reportWriter = new HtmlReportWriter(runner);
  context.subscriptions.push(reportWriter);

  registerLanguageProviders(context);
  registerDiagnostics(context);
  registerRunOutputPanel(context, runner, fileIndex, reportWriter);
  registerOutputChannelSink(context, runner, output);
  registerRunNotifier(context, runner);
  registerTestController(context, runner, fileIndex);
  registerDeviceView(context, deviceCatalog);
  registerCommands(context, runner);
  registerDeviceCommands(context, deviceCatalog);
  registerReportCommands(context, reportWriter);
}

function registerDeviceView(
  context: vscode.ExtensionContext,
  catalog: DeviceCatalog,
): void {
  const provider = new DeviceTreeProvider(catalog);
  context.subscriptions.push(
    provider,
    vscode.window.registerTreeDataProvider(DeviceTreeProvider.viewId, provider),
  );
  void catalog.refresh();
}

function registerDeviceCommands(
  context: vscode.ExtensionContext,
  catalog: DeviceCatalog,
): void {
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

function registerTestController(
  context: vscode.ExtensionContext,
  runner: ReplayRunner,
  fileIndex: AdFileIndex,
): void {
  const controller = new AgentDeviceTestController(runner, fileIndex);
  context.subscriptions.push(controller);
}

function resolveCliPath(context: vscode.ExtensionContext): string {
  const binName = process.platform === 'win32' ? 'agent-device.cmd' : 'agent-device';
  return path.join(context.extensionPath, 'node_modules', '.bin', binName);
}

function registerLanguageProviders(context: vscode.ExtensionContext): void {
  const completion = new CommandCompletionProvider(
    COMMANDS,
    DIRECTIVES,
    COMMAND_BY_NAME,
    FIND_LOCATORS,
    FIND_ACTIONS,
  );
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      LANGUAGE_ID,
      completion,
      ...CommandCompletionProvider.triggerCharacters,
    ),
  );

  const variables = new VariableCompletionProvider(BUILTIN_VARIABLES);
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      LANGUAGE_ID,
      variables,
      ...VariableCompletionProvider.triggerCharacters,
    ),
  );

  const values = new ValueCompletionProvider();
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      LANGUAGE_ID,
      values,
      ...ValueCompletionProvider.triggerCharacters,
    ),
  );

  const hover = new CommandHoverProvider(COMMAND_BY_NAME, DIRECTIVE_BY_NAME);
  context.subscriptions.push(vscode.languages.registerHoverProvider(LANGUAGE_ID, hover));

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(LANGUAGE_ID, new RunStepCodeLensProvider()),
  );
}

function registerDiagnostics(context: vscode.ExtensionContext): void {
  const platformDiagnostics = new PlatformDiagnostics(SUPPORTED_PLATFORMS);
  platformDiagnostics.activate(context);
}

function registerRunOutputPanel(
  context: vscode.ExtensionContext,
  runner: ReplayRunner,
  fileIndex: AdFileIndex,
  reportWriter: HtmlReportWriter,
): void {
  const panel = new RunOutputPanel(context.extensionUri, runner, fileIndex, reportWriter);
  context.subscriptions.push(
    panel,
    vscode.window.registerWebviewViewProvider(RunOutputPanel.viewId, panel),
  );
}

function registerReportCommands(
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

function registerOutputChannelSink(
  context: vscode.ExtensionContext,
  runner: ReplayRunner,
  output: vscode.OutputChannel,
): void {
  context.subscriptions.push(
    runner.onEvent((event) => {
      switch (event.type) {
        case 'start':
          output.appendLine(`▶ run ${event.scriptName} (${pluralize(event.steps.length, 'step')})`);
          break;
        case 'stepStart':
          output.appendLine(`  ${formatStepIndex(event.index)} …`);
          break;
        case 'stepSuccess':
          output.appendLine(`  ${formatStepIndex(event.index)} ✓ ${formatDuration(event.durationMs)}`);
          break;
        case 'stepFailure':
          output.appendLine(`  ${formatStepIndex(event.index)} ✗ ${formatDuration(event.durationMs)} — ${event.error.message}`);
          break;
        case 'end':
          output.appendLine(`── ${event.status} in ${formatDuration(event.durationMs)}`);
          break;
      }
    }),
  );
}

function formatStepIndex(index: number): string {
  return `step ${String(index + 1).padStart(2, '0')}`;
}

function registerRunNotifier(
  context: vscode.ExtensionContext,
  runner: ReplayRunner,
): void {
  let scriptName = '';
  let stepDisplays: readonly string[] = [];
  let failedStep: { display: string; error: string } | null = null;

  context.subscriptions.push(
    runner.onEvent((event) => {
      switch (event.type) {
        case 'start':
          scriptName = event.scriptName;
          stepDisplays = event.steps.map((s) => s.display);
          failedStep = null;
          break;
        case 'stepFailure':
          failedStep = {
            display: stepDisplays[event.index] ?? `step ${event.index + 1}`,
            error: event.error.message,
          };
          break;
        case 'end':
          if (event.status === 'success') {
            const summary = `${scriptName} passed (${pluralize(stepDisplays.length, 'step')}, ${formatDuration(event.durationMs)})`;
            vscode.window.setStatusBarMessage(`$(pass) ${summary}`, 5000);
            void vscode.window.showInformationMessage(summary);
          } else if (event.status === 'failure') {
            const detail = failedStep
              ? `${failedStep.display} — ${failedStep.error}`
              : 'unknown error';
            vscode.window.setStatusBarMessage(`$(error) ${scriptName} failed`, 5000);
            void vscode.window.showErrorMessage(`${scriptName} failed: ${detail}`);
          } else if (event.status === 'cancelled') {
            vscode.window.setStatusBarMessage(`$(circle-slash) ${scriptName} cancelled`, 5000);
          }
          break;
      }
    }),
  );
}

function registerCommands(
  context: vscode.ExtensionContext,
  runner: ReplayRunner,
): void {
  const runScript = vscode.commands.registerCommand(
    'agentDevice.runScript',
    async (uri?: vscode.Uri) => {
      const target = await resolveRunTarget(uri);
      if (!target) {
        return;
      }
      await safeRun(runner, target.scriptPath);
    },
  );
  context.subscriptions.push(runScript);

  const runUpTo = vscode.commands.registerCommand(
    'agentDevice.runScriptUpTo',
    async (uri: vscode.Uri, lineNumber: number) => {
      const target = await resolveRunTarget(uri);
      if (!target) {
        return;
      }
      await safeRun(runner, target.scriptPath, { endAtLine: lineNumber });
    },
  );
  context.subscriptions.push(runUpTo);

  const runLine = vscode.commands.registerCommand(
    'agentDevice.runScriptLine',
    async (uri: vscode.Uri, lineNumber: number) => {
      const target = await resolveRunTarget(uri);
      if (!target) {
        return;
      }
      await safeRun(runner, target.scriptPath, { onlyLine: lineNumber });
    },
  );
  context.subscriptions.push(runLine);

  const cancelRun = vscode.commands.registerCommand('agentDevice.cancelRun', () => {
    runner.cancel();
  });
  context.subscriptions.push(cancelRun);

  const newScript = vscode.commands.registerCommand('agentDevice.newScript', async () => {
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
  });
  context.subscriptions.push(newScript);
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

export function deactivate(): void {}
