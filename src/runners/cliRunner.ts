import { spawn } from 'node:child_process';

export interface ResolvedBin {
  readonly command: string;
  readonly prefixArgs: readonly string[];
  readonly env?: NodeJS.ProcessEnv;
}

type BinSpec = string | ResolvedBin;
export type BinPath = BinSpec | (() => BinSpec);

export interface CliExecution {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
}

export interface CliRunOptions {
  readonly env?: NodeJS.ProcessEnv;
  readonly cwd?: string;
  readonly signal?: AbortSignal;
}

export class CliRunner {
  constructor(private readonly binPath: BinPath) {}

  private resolveBin(): ResolvedBin {
    const value = typeof this.binPath === 'function' ? this.binPath() : this.binPath;
    return typeof value === 'string' ? { command: value, prefixArgs: [] } : value;
  }

  run(argv: readonly string[], options: CliRunOptions = {}): Promise<CliExecution> {
    return new Promise((resolve, reject) => {
      const bin = this.resolveBin();
      const proc = spawn(bin.command, [...bin.prefixArgs, ...argv], {
        env: { ...process.env, ...bin.env, ...options.env },
        cwd: options.cwd,
        signal: options.signal,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      proc.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      proc.on('error', reject);
      proc.on('close', (code) => {
        resolve({ exitCode: code ?? -1, stdout, stderr });
      });
    });
  }

  spawnDetached(argv: readonly string[], options: CliRunOptions = {}): void {
    const bin = this.resolveBin();
    const proc = spawn(bin.command, [...bin.prefixArgs, ...argv], {
      env: { ...process.env, ...bin.env, ...options.env },
      cwd: options.cwd,
      detached: true,
      stdio: 'ignore',
    });
    proc.unref();
  }
}
