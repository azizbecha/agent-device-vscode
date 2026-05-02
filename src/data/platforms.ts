export const SUPPORTED_PLATFORMS = ['android', 'ios'] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];

export const SUPPORTED_PLATFORMS_SET: ReadonlySet<string> = new Set<string>(SUPPORTED_PLATFORMS);
