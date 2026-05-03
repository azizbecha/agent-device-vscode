import * as vscode from 'vscode';

import { CliRunner, type BinPath } from '../runners/cliRunner';

export type DevicePlatform = 'ios' | 'android' | 'macos' | 'linux';
export type DeviceKind = 'simulator' | 'device';

export interface DeviceEntry {
  readonly id: string;
  readonly name: string;
  readonly platform: DevicePlatform;
  readonly kind: DeviceKind;
  readonly booted: boolean;
}

interface RawDevice {
  readonly platform: DevicePlatform;
  readonly id: string;
  readonly name: string;
  readonly kind: DeviceKind;
  readonly booted: boolean;
}

interface RawDevicesResponse {
  readonly success?: boolean;
  readonly data?: { readonly devices?: readonly RawDevice[] };
}

const SESSION_NAME = 'vscode-devices';

export class DeviceCatalog implements vscode.Disposable {
  private readonly cli: CliRunner;
  private readonly adbCli: CliRunner;
  private readonly emulatorCli: CliRunner;
  private readonly emitter = new vscode.EventEmitter<void>();
  private readonly aborter = new AbortController();
  private cache: readonly DeviceEntry[] = [];
  private loading = false;

  readonly onDidChange = this.emitter.event;

  constructor(cliPath: BinPath, sdkHome?: string | (() => string | undefined)) {
    this.cli = new CliRunner(cliPath);
    const resolveSdk = (): string | undefined =>
      typeof sdkHome === 'function' ? sdkHome() : sdkHome;
    this.adbCli = new CliRunner(() => {
      const home = resolveSdk();
      return home ? `${home}/platform-tools/adb` : 'adb';
    });
    this.emulatorCli = new CliRunner(() => {
      const home = resolveSdk();
      return home ? `${home}/emulator/emulator` : 'emulator';
    });
  }

  dispose(): void {
    this.aborter.abort();
    this.emitter.dispose();
  }

  private get signal(): AbortSignal {
    return this.aborter.signal;
  }

  get devices(): readonly DeviceEntry[] {
    return this.cache;
  }

  get isLoading(): boolean {
    return this.loading;
  }

  async refresh(): Promise<void> {
    if (this.loading) {
      return;
    }
    this.loading = true;
    this.emitter.fire();
    try {
      const [ios, android] = await Promise.all([
        this.queryViaAgentDevice('ios'),
        this.queryAndroidViaSdk(),
      ]);
      this.cache = sortDevices([...ios, ...android]);
    } finally {
      this.loading = false;
      this.emitter.fire();
    }
  }

  async boot(device: DeviceEntry): Promise<void> {
    if (device.platform === 'ios') {
      await this.bootIosSimulator(device);
    } else if (device.platform === 'android') {
      this.bootAndroidEmulator(device);
    } else {
      throw new Error(`Boot is not supported for platform: ${device.platform}`);
    }
    await this.refresh();
  }

  async shutdown(device: DeviceEntry): Promise<void> {
    if (device.platform === 'ios') {
      await this.shutdownIosSimulator(device);
    } else if (device.platform === 'android') {
      await this.shutdownAndroidEmulator(device);
    } else {
      throw new Error(`Shutdown is not supported for platform: ${device.platform}`);
    }
    await this.refresh();
  }

  private async shutdownIosSimulator(device: DeviceEntry): Promise<void> {
    const xcrun = new CliRunner('xcrun');
    const result = await xcrun.run(['simctl', 'shutdown', device.id]);
    if (result.exitCode !== 0) {
      throw new Error(extractCliErrorMessage(result.stdout, result.stderr));
    }
  }

  private async shutdownAndroidEmulator(device: DeviceEntry): Promise<void> {
    const serial = await this.findEmulatorSerial(device.name);
    if (!serial) {
      throw new Error(`No running emulator found for AVD "${device.name}"`);
    }
    const result = await this.adbCli.run(['-s', serial, 'emu', 'kill']);
    if (result.exitCode !== 0) {
      throw new Error(extractCliErrorMessage(result.stdout, result.stderr));
    }
  }

  private async findEmulatorSerial(avdName: string): Promise<string | null> {
    const serials = await this.runningEmulatorSerials();
    for (const serial of serials) {
      if ((await this.serialAvdName(serial)) === avdName) {
        return serial;
      }
    }
    return null;
  }

  private async runningEmulatorSerials(): Promise<string[]> {
    const result = await this.adbCli.run(['devices'], { signal: this.signal }).catch(() => null);
    if (!result || result.exitCode !== 0) {
      return [];
    }
    const serials: string[] = [];
    for (const raw of result.stdout.split(/\r?\n/).slice(1)) {
      const parts = raw.trim().split(/\s+/);
      if (parts[0]?.startsWith('emulator-') && parts[1] === 'device') {
        serials.push(parts[0]);
      }
    }
    return serials;
  }

  private async serialAvdName(serial: string): Promise<string | null> {
    const r = await this.adbCli.run(['-s', serial, 'emu', 'avd', 'name'], { signal: this.signal }).catch(() => null);
    if (!r || r.exitCode !== 0) {
      return null;
    }
    return (
      r.stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find((line) => line.length > 0 && line !== 'OK') ?? null
    );
  }

  private async bootIosSimulator(device: DeviceEntry): Promise<void> {
    const xcrun = new CliRunner('xcrun');
    const result = await xcrun.run(['simctl', 'boot', device.id]);
    const alreadyBooted = /Unable to boot.+Booted/i.test(result.stderr);
    if (result.exitCode !== 0 && !alreadyBooted) {
      throw new Error(extractCliErrorMessage(result.stdout, result.stderr));
    }
    // Reveal the Simulator app so the user can interact with it.
    await new CliRunner('open').run(['-a', 'Simulator']).catch(() => undefined);
  }

  private bootAndroidEmulator(device: DeviceEntry): void {
    this.emulatorCli.spawnDetached(['-avd', device.name]);
  }

  private async queryViaAgentDevice(platform: DevicePlatform): Promise<DeviceEntry[]> {
    const result = await this.cli
      .run(['devices', '--json', '--platform', platform, '--session', SESSION_NAME], {
        signal: this.signal,
      })
      .catch(() => null);
    if (!result || result.exitCode !== 0) {
      return [];
    }
    const parsed = safeParseJson<RawDevicesResponse>(result.stdout);
    if (!parsed?.data?.devices) {
      return [];
    }
    return parsed.data.devices.map((raw) => ({
      id: raw.id,
      name: raw.name,
      platform: raw.platform,
      kind: raw.kind,
      booted: raw.booted,
    }));
  }

  private async queryAndroidViaSdk(): Promise<DeviceEntry[]> {
    const avds = await this.listAvds();
    if (avds.length === 0) {
      return [];
    }
    const runningNames = await this.runningAvdNames();
    return avds.map((name) => ({
      id: name,
      name,
      platform: 'android' as const,
      kind: 'simulator' as const,
      booted: runningNames.has(name),
    }));
  }

  private async listAvds(): Promise<string[]> {
    const result = await this.emulatorCli.run(['-list-avds'], { signal: this.signal }).catch(() => null);
    if (!result || result.exitCode !== 0) {
      return [];
    }
    return result.stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^[A-Za-z0-9._-]+$/.test(line));
  }

  private async runningAvdNames(): Promise<Set<string>> {
    const names = new Set<string>();
    for (const serial of await this.runningEmulatorSerials()) {
      const name = await this.serialAvdName(serial);
      if (name) {
        names.add(name);
      }
    }
    return names;
  }
}

function sortDevices(devices: readonly DeviceEntry[]): DeviceEntry[] {
  return [...devices].sort((a, b) => {
    if (a.platform !== b.platform) {
      return a.platform.localeCompare(b.platform);
    }
    if (a.booted !== b.booted) {
      return a.booted ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function safeParseJson<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

interface CliErrorEnvelope {
  readonly success?: boolean;
  readonly error?: { readonly message?: string; readonly code?: string };
}

function extractCliErrorMessage(stdout: string, stderr: string): string {
  const fromStdout = readJsonError(stdout);
  if (fromStdout) {
    return fromStdout;
  }
  const fromStderr = readJsonError(stderr);
  if (fromStderr) {
    return fromStderr;
  }
  const fallback = (stderr || stdout).trim();
  if (!fallback) {
    return 'boot failed';
  }
  const firstNonBraceLine = fallback
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.length > 0 && line !== '{' && line !== '}');
  return firstNonBraceLine || fallback;
}

function readJsonError(text: string): string | null {
  const parsed = safeParseJson<CliErrorEnvelope>(text);
  return parsed?.error?.message?.trim() || null;
}
