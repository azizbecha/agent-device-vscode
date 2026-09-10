/**
 * Every value `--platform` accepts (agent-device `PLATFORM_SELECTORS`).
 * `apple` aliases the Apple automation backend; `ios` / `macos` narrow it.
 */
export const PLATFORM_SELECTORS = [
  'ios',
  'android',
  'macos',
  'linux',
  'harmonyos',
  'vega',
  'web',
  'apple',
] as const;

export type PlatformSelector = (typeof PLATFORM_SELECTORS)[number];

/** Kept for callers that only care about the `--platform` flag. */
export const SUPPORTED_PLATFORMS = PLATFORM_SELECTORS;

/**
 * Values `context platform=` accepts in a `.ad` header: every selector except
 * `web`, which replay does not target yet.
 */
export const CONTEXT_PLATFORMS: readonly PlatformSelector[] = PLATFORM_SELECTORS.filter(
  (p) => p !== 'web',
);

export const CONTEXT_PLATFORMS_SET: ReadonlySet<string> = new Set<string>(CONTEXT_PLATFORMS);
export const PLATFORM_SELECTORS_SET: ReadonlySet<string> = new Set<string>(PLATFORM_SELECTORS);

/** `--target` / `context target=` device classes. */
export const DEVICE_TARGETS = ['mobile', 'tv', 'desktop'] as const;
export type DeviceTarget = (typeof DEVICE_TARGETS)[number];
export const DEVICE_TARGETS_SET: ReadonlySet<string> = new Set<string>(DEVICE_TARGETS);

/** agent-device caps `context retries=` (and `--retries`) at this value. */
export const CONTEXT_MAX_RETRIES = 3;
