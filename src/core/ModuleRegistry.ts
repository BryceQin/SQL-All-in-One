import type * as vscode from 'vscode';
import type { Activatable } from './Activatable';

export class ModuleRegistry {
  private modules: Activatable[] = [];

  register(module: Activatable): void {
    this.modules.push(module);
  }

  async activateAll(context: vscode.ExtensionContext): Promise<void> {
    for (const module of this.modules) {
      try {
        await module.activate(context);
      } catch (e) {
        // Isolate failures: a single module activation error should not
        // prevent the remaining modules from being activated.
        console.error('[SQL All in One] Module activation failed:', e);
      }
    }
  }

  async deactivateAll(): Promise<void> {
    for (const module of [...this.modules].reverse()) {
      if (!module.deactivate) {
        continue;
      }
      try {
        await module.deactivate();
      } catch (e) {
        // Isolate failures: a single module deactivation error should not
        // prevent the remaining modules from being deactivated.
        console.error('[SQL All in One] Module deactivation failed:', e);
      }
    }
  }
}
