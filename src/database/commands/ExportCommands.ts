import * as vscode from 'vscode';
import type { QueryResultPanel } from '../../views/queryResult/QueryResultPanel';

export function registerExportCommands(
    getQueryResultPanel: () => QueryResultPanel | undefined
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];
    const formats = ['csv', 'json', 'insert', 'ddl'] as const;
    const commands = [
        'sql-all-in-one.exportCsv',
        'sql-all-in-one.exportJson',
        'sql-all-in-one.exportInsert',
        'sql-all-in-one.exportDdl'
    ] as const;

    for (let i = 0; i < formats.length; i++) {
        const format = formats[i];
        const command = commands[i];
        disposables.push(
            vscode.commands.registerCommand(command, async () => {
                const panel = getQueryResultPanel();
                if (panel) {
                    panel.triggerExport(format);
                } else {
                    vscode.window.showWarningMessage('No query result to export');
                }
            })
        );
    }

    return disposables;
}
