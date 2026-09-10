export interface BuiltinVariableDef {
  readonly name: string;
  readonly summary: string;
}

export const BUILTIN_VARIABLES: readonly BuiltinVariableDef[] = [
  { name: 'AD_PLATFORM', summary: 'Active platform (e.g. ios, android).' },
  { name: 'AD_SESSION', summary: 'Active agent-device session name.' },
  { name: 'AD_FILENAME', summary: 'Path of the running .ad script.' },
  { name: 'AD_DEVICE', summary: 'Device identifier (when --device is set).' },
  { name: 'AD_ARTIFACTS', summary: 'Attempt artifacts directory (when running under `test`).' },
];
