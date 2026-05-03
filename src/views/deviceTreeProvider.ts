import * as vscode from 'vscode';

import type { DeviceCatalog, DeviceEntry, DevicePlatform } from '../services/deviceCatalog';

type DeviceNode =
  | { readonly kind: 'group'; readonly platform: DevicePlatform }
  | { readonly kind: 'device'; readonly device: DeviceEntry }
  | { readonly kind: 'message'; readonly text: string };

const PLATFORM_LABELS: Record<DevicePlatform, string> = {
  ios: 'iOS',
  android: 'Android',
  macos: 'macOS',
  linux: 'Linux',
};

const ALWAYS_SHOWN_PLATFORMS: readonly DevicePlatform[] = ['ios', 'android'];

const PLATFORM_EMPTY_HINT: Record<DevicePlatform, string> = {
  ios: 'No iOS simulators. Install Xcode + a runtime.',
  android: 'No Android emulators. Create an AVD via Android Studio.',
  macos: 'No macOS targets available.',
  linux: 'No Linux targets available.',
};

export class DeviceTreeProvider implements vscode.TreeDataProvider<DeviceNode>, vscode.Disposable {
  static readonly viewId = 'agentDevice.devices';

  private readonly emitter = new vscode.EventEmitter<DeviceNode | undefined>();
  private readonly disposables: vscode.Disposable[] = [];

  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly catalog: DeviceCatalog) {
    this.disposables.push(this.catalog.onDidChange(() => this.emitter.fire(undefined)));
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.emitter.dispose();
  }

  getChildren(element?: DeviceNode): DeviceNode[] {
    if (!element) {
      if (this.catalog.isLoading && this.catalog.devices.length === 0) {
        return [{ kind: 'message', text: 'Loading devices…' }];
      }
      const knownPlatforms = uniquePlatforms(this.catalog.devices);
      const platforms = mergePlatforms(ALWAYS_SHOWN_PLATFORMS, knownPlatforms);
      return platforms.map((platform) => ({ kind: 'group', platform }));
    }
    if (element.kind === 'group') {
      const devices = this.catalog.devices
        .filter((d) => d.platform === element.platform)
        .map<DeviceNode>((device) => ({ kind: 'device', device }));
      if (devices.length === 0) {
        return [{ kind: 'message', text: PLATFORM_EMPTY_HINT[element.platform] }];
      }
      return devices;
    }
    return [];
  }

  getTreeItem(element: DeviceNode): vscode.TreeItem {
    if (element.kind === 'message') {
      const item = new vscode.TreeItem(element.text, vscode.TreeItemCollapsibleState.None);
      item.contextValue = 'message';
      return item;
    }
    if (element.kind === 'group') {
      const platformLabel = PLATFORM_LABELS[element.platform] ?? element.platform;
      const count = this.catalog.devices.filter((d) => d.platform === element.platform).length;
      const item = new vscode.TreeItem(platformLabel, vscode.TreeItemCollapsibleState.Expanded);
      item.description = String(count);
      item.iconPath = new vscode.ThemeIcon(iconForPlatform(element.platform));
      item.contextValue = 'agentDevice.deviceGroup';
      return item;
    }
    const { device } = element;
    const item = new vscode.TreeItem(device.name, vscode.TreeItemCollapsibleState.None);
    item.description = device.kind === 'simulator' ? 'Simulator' : 'Device';
    item.tooltip = `${device.name}\n${device.id}\n${device.kind} · ${device.booted ? 'booted' : 'shutdown'}`;
    item.contextValue = device.booted ? 'agentDevice.device.booted' : 'agentDevice.device.shutdown';
    item.iconPath = device.booted
      ? new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor('testing.iconPassed'))
      : new vscode.ThemeIcon('circle-large-outline');
    return item;
  }
}

function uniquePlatforms(devices: readonly DeviceEntry[]): DevicePlatform[] {
  const seen = new Set<DevicePlatform>();
  for (const d of devices) {
    seen.add(d.platform);
  }
  return Array.from(seen);
}

function mergePlatforms(
  always: readonly DevicePlatform[],
  found: readonly DevicePlatform[],
): DevicePlatform[] {
  const merged = new Set<DevicePlatform>(always);
  for (const platform of found) {
    merged.add(platform);
  }
  return Array.from(merged).sort((a, b) => a.localeCompare(b));
}

function iconForPlatform(platform: DevicePlatform): string {
  switch (platform) {
    case 'ios':
    case 'android':
      return 'device-mobile';
    case 'macos':
      return 'device-desktop';
    case 'linux':
      return 'terminal';
    default:
      return 'device-mobile';
  }
}

export function isDeviceNode(node: unknown): node is DeviceNode & { kind: 'device' } {
  return typeof node === 'object' && node !== null && (node as { kind?: string }).kind === 'device';
}
