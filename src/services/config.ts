import * as vscode from 'vscode';

const SECTION = 'agentDevice';

export class AgentDeviceConfig {
  private get config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration(SECTION);
  }

  cliPathOverride(): string | undefined {
    return nonEmpty(this.config.get<string>('cliPath'));
  }

  sessionName(): string {
    return nonEmpty(this.config.get<string>('session')) ?? 'vscode';
  }

  androidSdkPath(): string | undefined {
    return (
      nonEmpty(this.config.get<string>('androidSdkPath')) ??
      nonEmpty(process.env.ANDROID_HOME) ??
      nonEmpty(process.env.ANDROID_SDK_ROOT)
    );
  }

  reportEnabled(): boolean {
    return this.config.get<boolean>('report.enabled') ?? true;
  }

  notificationsEnabled(): boolean {
    return this.config.get<boolean>('notifications.enabled') ?? true;
  }

  onDidChange(listener: () => void): vscode.Disposable {
    return vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration(SECTION)) {
        listener();
      }
    });
  }
}

function nonEmpty(value: string | undefined): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
