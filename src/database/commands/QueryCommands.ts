import * as vscode from "vscode";
import { getConnectionManager } from "../connection/ConnectionManager";
import { DatabaseModule } from "../DatabaseModule";
import type { SqlDialect } from "../../parser/dialectMapper";
import { getSchemaCache } from "../schema/SchemaCache";
import { getConfigManager } from "../../core/configManager";
import { t } from "../../i18n/index";

// NOTE: This module no longer imports anything from the views layer.
// Showing the query result panel / pushing results into it is delegated to
// views-layer command handlers registered in Task 8:
//   - hive-formatter.showQueryLoading(sql)
//   - hive-formatter.showQueryResult(result, connectionName, connectionColor)
//   - hive-formatter.showQueryError(error, sql)
// The database layer only emits these commands; if a handler is not yet
// registered, `executeCommand` resolves to `undefined` silently.

function isDDLStatement(sql: string): boolean {
    const upper = sql.trim().toUpperCase();
    return (
        upper.startsWith("ALTER ") ||
        upper.startsWith("CREATE ") ||
        upper.startsWith("DROP ") ||
        upper.startsWith("RENAME ") ||
        upper.startsWith("TRUNCATE ")
    );
}

function isRoutineDDL(sql: string): boolean {
    const upper = sql.trim().toUpperCase();
    return /\b(CREATE|DROP|ALTER)\s+(FUNCTION|PROCEDURE)\b/i.test(upper);
}

function invalidateSchemaOnDDL(sql: string): void {
    const cfgMgr = getConfigManager();
    if (!cfgMgr.get<boolean>("schemaCache.refreshOnDDL", true)) return;

    const connectionManager = getConnectionManager();
    const activeConn = connectionManager.getActiveConnection();
    if (!activeConn) return;

    const schemaCache = getSchemaCache();
    schemaCache.invalidate(activeConn.id, "table", activeConn.database);
    if (isRoutineDDL(sql)) {
        schemaCache.invalidate(activeConn.id, "function", activeConn.database);
        schemaCache.invalidate(activeConn.id, "procedure", activeConn.database);
    }
}

export function registerQueryCommands(_context: vscode.ExtensionContext, dbModule: DatabaseModule): { disposables: vscode.Disposable[] } {
    const disposables: vscode.Disposable[] = [];

    disposables.push(
        vscode.commands.registerCommand("hive-formatter.executeQuery", async () => {
            const queryExecutor = dbModule.getQueryExecutor();
            const safeQueryGuard = dbModule.getSafeQueryGuard();
            const statementDetector = dbModule.getStatementDetector();
            const queryHistory = dbModule.getQueryHistory();
            const outputChannel = dbModule.getOutputChannel();

            if (!queryExecutor || !safeQueryGuard || !statementDetector || !queryHistory) {
                vscode.window.showErrorMessage(t("database.noActiveAdapter"));
                return;
            }

            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage(t("database.noActiveEditor"));
                return;
            }

            const connectionManager = getConnectionManager();
            const activeConn = connectionManager.getActiveConnection();
            let adapter = activeConn ? connectionManager.getAdapter(activeConn.id) : undefined;

            if (!adapter) {
                const connections = connectionManager.getAllConnections().filter((c) => connectionManager.getState(c.id) === "connected");
                if (connections.length === 0) {
                    vscode.window.showWarningMessage(t("database.noActiveConnection"));
                    return;
                }
                const picked = await vscode.window.showQuickPick(
                    connections.map((c) => ({
                        label: c.name,
                        description: `${c.host}:${c.port}`,
                        connectionId: c.id,
                    })),
                    { placeHolder: t("database.selectAConnection") },
                );
                if (!picked) return;
                connectionManager.setActiveConnection(picked.connectionId);
                adapter = connectionManager.getAdapter(picked.connectionId);
            }

            if (!adapter) {
                vscode.window.showErrorMessage(t("database.failedToGetAdapter"));
                return;
            }

            const statement = statementDetector.detectSelectionOrCurrent(editor.document, editor.selection);

            if (!statement.sql) {
                vscode.window.showWarningMessage(t("database.noSqlFound"));
                return;
            }

            const safetyResult = await safeQueryGuard.analyze(statement.sql, undefined, activeConn?.dialect as SqlDialect | undefined);
            if (!safetyResult.safe) {
                const confirmed = await safeQueryGuard.confirm(safetyResult);
                if (!confirmed) return;
            }

            // Ensure the query result panel exists and shows the loading state.
            // The views layer owns panel creation and callback registration
            // (Task 8 registers `hive-formatter.showQueryLoading` which lazily
            // creates the panel + attaches the QueryResultController).
            await vscode.commands.executeCommand("hive-formatter.showQueryLoading", statement.sql);

            const activeConfig = connectionManager.getActiveConnection();
            const result = await queryExecutor.execute(adapter, statement.sql, { database: activeConfig?.database }, activeConfig?.id);

            if (result.status === "error") {
                outputChannel?.appendLine(`❌ Error: ${result.error?.message || t("database.unknownError")}`);
                outputChannel?.appendLine(`   SQL: ${statement.sql}`);
                vscode.commands.executeCommand("hive-formatter.showQueryError", result.error, statement.sql);
            } else {
                outputChannel?.appendLine(
                    `✅ ${t("database.queryExecutedSuccessfully", String(result.executionTime), String(result.rowCount))}`,
                );
                outputChannel?.appendLine(`   SQL: ${statement.sql}`);

                if (result.affectedRows !== undefined && result.affectedRows > 0) {
                    outputChannel?.appendLine(`   ${t("database.affectedRows", String(result.affectedRows))}`);
                }

                vscode.commands.executeCommand("hive-formatter.showQueryResult", result, activeConfig?.name, activeConfig?.color);
            }

            if (result.status !== "error" || result.error?.code !== "CANCELLED") {
                if (result.status === "success" && isDDLStatement(statement.sql)) {
                    invalidateSchemaOnDDL(statement.sql);
                }

                await queryHistory.add({
                    sql: statement.sql,
                    connectionId: activeConfig?.id || "",
                    connectionName: activeConfig?.name || "",
                    database: activeConfig?.database || "",
                    executedAt: new Date().toISOString(),
                    executionTime: result.executionTime,
                    rowCount: result.rowCount,
                    affectedRows: result.affectedRows,
                    status: result.status === "success" ? "success" : "error",
                    errorMessage: result.error?.message,
                });
            }
        }),
    );

    disposables.push(
        vscode.commands.registerCommand("hive-formatter.executeSelection", async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage(t("database.noActiveEditor"));
                return;
            }

            if (editor.selection.isEmpty) {
                vscode.window.showWarningMessage(t("database.noTextSelected"));
                return;
            }

            vscode.commands.executeCommand("hive-formatter.executeQuery");
        }),
    );

    disposables.push(
        vscode.commands.registerCommand("hive-formatter.cancelQuery", async () => {
            const queryExecutor = dbModule.getQueryExecutor();
            if (!queryExecutor) {
                vscode.window.showWarningMessage(t("database.noActiveAdapter"));
                return;
            }
            const running = queryExecutor.getRunningQueries();
            if (running.length === 0) {
                vscode.window.showInformationMessage(t("database.noRunningQueries"));
                return;
            }

            if (running.length === 1) {
                await queryExecutor.cancel(running[0].queryId);
                vscode.window.showInformationMessage(t("database.queryCancelled"));
                return;
            }

            const picked = await vscode.window.showQuickPick(
                running.map((q) => ({
                    label: q.sql.substring(0, 80),
                    description: t("database.runningFor", String(Date.now() - q.startTime)),
                    queryId: q.queryId,
                })),
                { placeHolder: t("database.selectQueryToCancel") },
            );

            if (!picked) return;
            await queryExecutor.cancel(picked.queryId);
            vscode.window.showInformationMessage(t("database.queryCancelled"));
        }),
    );

    disposables.push(
        vscode.commands.registerCommand("hive-formatter.showQueryHistory", async () => {
            const queryHistory = dbModule.getQueryHistory();
            if (!queryHistory) {
                vscode.window.showWarningMessage(t("database.noActiveAdapter"));
                return;
            }
            const entries = queryHistory.getRecent(50);
            if (entries.length === 0) {
                vscode.window.showInformationMessage(t("database.noQueryHistory"));
                return;
            }

            const picked = await vscode.window.showQuickPick(
                entries.map((entry) => ({
                    label: entry.sql.substring(0, 80),
                    description: `${entry.connectionName} | ${entry.executionTime}ms | ${new Date(entry.executedAt).toLocaleString()}`,
                    detail:
                        entry.status === "error"
                            ? t("database.errorDetail", entry.errorMessage || "")
                            : t("database.rowCount", String(entry.rowCount)),
                    entry,
                })),
                { placeHolder: t("database.queryHistory") },
            );

            if (!picked) return;

            const action = await vscode.window.showQuickPick([t("database.openInEditor"), t("database.copySql")], {
                placeHolder: t("database.action"),
            });

            if (action === t("database.openInEditor")) {
                const doc = await vscode.workspace.openTextDocument({
                    content: picked.entry.sql,
                    language: "sql",
                });
                await vscode.window.showTextDocument(doc);
            } else if (action === t("database.copySql")) {
                await vscode.env.clipboard.writeText(picked.entry.sql);
                vscode.window.showInformationMessage(t("database.sqlCopied"));
            }
        }),
    );

    disposables.push(
        vscode.commands.registerCommand("hive-formatter.clearQueryHistory", async () => {
            const confirm = await vscode.window.showWarningMessage(t("database.clearHistoryConfirm"), { modal: true }, t("database.clear"));
            if (confirm === t("database.clear")) {
                const queryHistory = dbModule.getQueryHistory();
                if (queryHistory) {
                    await queryHistory.clear();
                }
                vscode.window.showInformationMessage(t("database.queryHistoryCleared"));
            }
        }),
    );

    return { disposables };
}
