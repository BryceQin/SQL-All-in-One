import type * as vscode from 'vscode';

export interface Activatable {
  activate(context: vscode.ExtensionContext): void | Promise<void>;
  deactivate?(): void | Promise<void>;
}
