import * as vscode from 'vscode';
import type { QueryResultPanel } from '../../views/queryResult/QueryResultPanel';
import { t } from '../../i18n/index';

export function registerExportCommands(
    getQueryResultPanel: () => QueryResultPanel | undefined
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];
    const formats = ['csv', 'json', 'insert', 'ddl'] as const;
    const commands = [
        'hive-formatter.exportCsv',
        'hive-formatter.exportJson',
        'hive-formatter.exportInsert',
        'hive-formatter.exportDdl'
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
                    vscode.window.showWarningMessage(t('database.noQueryResult'));
                }
            })
        );
    }

    return disposables;
}
