import type * as vscode from 'vscode';
import type { Activatable } from './Activatable';
import { handleError, ErrorCategory } from './errorHandler';

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
        // 隔离失败：单个模块激活错误不应阻止其余模块激活。
        // 同时通过 ErrorHandler 统一记录，便于聚合监控与用户通知。
        console.error('[SQL All in One] Module activation failed:', e);
        try {
          handleError(e, 'ModuleRegistry.activateAll', ErrorCategory.CRITICAL);
        } catch {
          // ErrorHandler 自身失败时降级为 console.error，避免雪崩
        }
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
        // 隔离失败：单个模块停用错误不应阻止其余模块停用。
        console.error('[SQL All in One] Module deactivation failed:', e);
        try {
          handleError(e, 'ModuleRegistry.deactivateAll', ErrorCategory.FEATURE);
        } catch {
          // ErrorHandler 自身失败时降级为 console.error
        }
      }
    }
  }
}
