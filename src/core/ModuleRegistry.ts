import type * as vscode from 'vscode';
import type { Activatable } from './Activatable';

export class ModuleRegistry {
  private modules: Activatable[] = [];

  register(module: Activatable): void {
    this.modules.push(module);
  }

  async activateAll(context: vscode.ExtensionContext): Promise<void> {
    for (const module of this.modules) {
      await module.activate(context);
    }
  }

  async deactivateAll(): Promise<void> {
    for (const module of [...this.modules].reverse()) {
      if (module.deactivate) {
        await module.deactivate();
      }
    }
  }
}
