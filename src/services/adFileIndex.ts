import * as vscode from 'vscode';

const FILE_GLOB = '**/*.ad';
const EXCLUDE_GLOB = '**/node_modules/**';

export class AdFileIndex implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly emitter = new vscode.EventEmitter<void>();
  private readonly cache = new Map<string, vscode.Uri>();
  private initialized = false;
  private initialization: Promise<void> | null = null;

  readonly onDidChange = this.emitter.event;

  constructor() {
    const watcher = vscode.workspace.createFileSystemWatcher(FILE_GLOB);
    watcher.onDidCreate((uri) => this.add(uri));
    watcher.onDidDelete((uri) => this.remove(uri));
    watcher.onDidChange(() => this.emitter.fire());
    this.disposables.push(watcher, this.emitter);
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.cache.clear();
  }

  get files(): readonly vscode.Uri[] {
    return Array.from(this.cache.values());
  }

  async ready(): Promise<void> {
    if (this.initialized) {
      return;
    }
    if (!this.initialization) {
      this.initialization = (async () => {
        const uris = await vscode.workspace.findFiles(FILE_GLOB, EXCLUDE_GLOB);
        for (const uri of uris) {
          this.cache.set(uri.toString(), uri);
        }
        this.initialized = true;
        this.emitter.fire();
      })();
    }
    await this.initialization;
  }

  private add(uri: vscode.Uri): void {
    const id = uri.toString();
    if (this.cache.has(id)) {
      return;
    }
    this.cache.set(id, uri);
    this.emitter.fire();
  }

  private remove(uri: vscode.Uri): void {
    if (this.cache.delete(uri.toString())) {
      this.emitter.fire();
    }
  }
}
