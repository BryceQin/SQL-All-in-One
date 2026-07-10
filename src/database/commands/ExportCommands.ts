import * as vscode from "vscode";
import { t } from "../../i18n/index";

// NOTE: This module no longer imports `QueryResultPanel` from the views layer.
// Exporting the current query result is delegated to a views-layer command
// handler (registered in Task 8) that owns the panel instance:
//   - hive-formatter.exportQueryResult(format)
// which internally calls `panel.triggerExport(format)` and surfaces a warning
// when no panel / result is available.

export function registerExportCommands(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];
    const formats = ["csv", "json", "insert", "ddl"] as const;
    const commands = [
        "hive-formatter.exportCsv",
        "hive-formatter.exportJson",
        "hive-formatter.exportInsert",
        "hive-formatter.exportDdl",
    ] as const;

    for (let i = 0; i < formats.length; i++) {
        const format = formats[i];
        const command = commands[i];
        disposables.push(
            vscode.commands.registerCommand(command, async () => {
                // Delegate to the views layer, which owns the panel and the
                // export UI (file picker, format-specific serialization). The
                // handler returns `true` on success / `false` when there is no
                // panel or no result to export.
                const handled = await vscode.commands.executeCommand<boolean>("hive-formatter.exportQueryResult", format);
                if (!handled) {
                    vscode.window.showWarningMessage(t("database.noQueryResult"));
                }
            }),
        );
    }

    return disposables;
}
