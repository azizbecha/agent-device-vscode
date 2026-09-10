/**
 * The bundled agent-device CLI is spawned with the extension host's own Node
 * runtime (process.execPath + ELECTRON_RUN_AS_NODE), so the host's Node
 * version is the CLI's Node version. agent-device 0.21 requires Node >= 22.12,
 * which VS Code first shipped in 1.101 (Electron 35).
 */
export interface NodeVersionRequirement {
  readonly major: number;
  readonly minor: number;
}

export interface ParsedNodeVersion {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export const AGENT_DEVICE_MIN_NODE: NodeVersionRequirement = { major: 22, minor: 12 };

export function parseNodeVersion(version: string): ParsedNodeVersion | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/.exec(version.trim());
  if (!match) {
    return null;
  }
  return {
    major: Number.parseInt(match[1] ?? '0', 10),
    minor: Number.parseInt(match[2] ?? '0', 10),
    patch: Number.parseInt(match[3] ?? '0', 10),
  };
}

export function satisfiesNodeRequirement(
  version: string,
  requirement: NodeVersionRequirement = AGENT_DEVICE_MIN_NODE,
): boolean {
  const parsed = parseNodeVersion(version);
  if (!parsed) {
    return false;
  }
  if (parsed.major !== requirement.major) {
    return parsed.major > requirement.major;
  }
  return parsed.minor >= requirement.minor;
}

export function describeNodeRequirement(
  requirement: NodeVersionRequirement = AGENT_DEVICE_MIN_NODE,
): string {
  return `${requirement.major}.${requirement.minor}`;
}
