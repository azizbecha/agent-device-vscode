import * as vscode from 'vscode';

import {
  COMMAND_BY_NAME,
  COMMANDS,
  DIRECTIVE_BY_NAME,
  DIRECTIVES,
  FIND_ACTIONS,
  FIND_LOCATORS,
} from '../data/commands';
import { SUPPORTED_PLATFORMS } from '../data/platforms';
import { BUILTIN_VARIABLES } from '../data/variables';
import { PlatformDiagnostics } from '../diagnostics/platformValidator';
import { CommandCompletionProvider } from '../providers/completionProvider';
import { ElementRefCompletionProvider } from '../providers/elementRefCompletionProvider';
import { CommandHoverProvider } from '../providers/hoverProvider';
import { RunStepCodeLensProvider } from '../providers/runStepCodeLensProvider';
import { ValueCompletionProvider } from '../providers/valueCompletionProvider';
import { VariableCompletionProvider } from '../providers/variableCompletionProvider';
import type { AdFileIndex } from '../services/adFileIndex';
import type { ReplayRunner } from '../runners/replayRunner';
import type { SnapshotIndex } from '../services/snapshotIndex';
import { AgentDeviceTestController } from '../testing/agentDeviceTestController';

const LANGUAGE_ID = 'agent-device';

export function registerLanguageFeatures(
  context: vscode.ExtensionContext,
  runner: ReplayRunner,
  fileIndex: AdFileIndex,
  snapshotIndex: SnapshotIndex,
): void {
  registerProviders(context, snapshotIndex);
  registerDiagnostics(context);
  registerTestController(context, runner, fileIndex);
}

function registerProviders(
  context: vscode.ExtensionContext,
  snapshotIndex: SnapshotIndex,
): void {
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

  const elementRefs = new ElementRefCompletionProvider(snapshotIndex);
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      LANGUAGE_ID,
      elementRefs,
      ...ElementRefCompletionProvider.triggerCharacters,
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

function registerTestController(
  context: vscode.ExtensionContext,
  runner: ReplayRunner,
  fileIndex: AdFileIndex,
): void {
  const controller = new AgentDeviceTestController(runner, fileIndex);
  context.subscriptions.push(controller);
}
