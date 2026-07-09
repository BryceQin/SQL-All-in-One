import * as vscode from 'vscode';
import { getConnectionManager } from '../connection/ConnectionManager';
import { ConnectionConfig } from '../connection/ConnectionConfig';
import { DatabaseModule } from '../DatabaseModule';
import type { ITreeNode } from '../../shared/treeNodeTypes';
import { getSchemaCache } from '../schema/SchemaCache';
import type { DatabaseAdapter } from '../adapters/AdapterFactory';
import { t } from '../../i18n/index';
import { getConfigManager } from '../../core/configManager';

// NOTE: This module no longer imports anything from the views layer.
// All panel operations (QueryResultPanel, TableDesignerPanel, ExplainPlanPanel,
// DataTransferDialog) and tree-provider operations (refresh, addFavorite,
// removeFavorite) are delegated to views-layer command handlers registered in
// Task 8:
//   - hive-formatter.showQueryLoading(sql)
//   - hive-formatter.showQueryResult(result, connName, connColor, tableName?)
//   - hive-formatter.showQueryError(error, sql)
//   - hive-formatter.setQueryResultPanelSql(sql, autoExecute?)
//   - hive-formatter.sendDatabaseList(databases, current)
//   - hive-formatter.setQueryResultPanelCallbacks(connectionId, database)
//   - hive-formatter.openTableDesigner({ database, tableName? })
//   - hive-formatter.showExplainPlan(sql, isPanel?)
//   - hive-formatter.showDataTransferDialog()
//   - hive-formatter.refreshTreeProvider()
//   - hive-formatter.addTreeFavorite(...)
//   - hive-formatter.removeTreeFavorite(...)
// The database layer only emits these commands; if a handler is not yet
// registered, `executeCommand` resolves to `undefined` silently.

/**
 * Reads a string field from a tree node without importing concrete
 * `*TreeNode` classes from the views layer. The database layer must
 * stay decoupled from `views/databaseExplorer/treeNodes`.
 */
function getNodeField(node: ITreeNode, field: string): string {
    return (node as unknown as Record<string, unknown>)[field] as string;
}

function formatColumnDefs(ddl: string): string {
    const viewMatch = ddl.match(/^CREATE\s+(?:MATERIALIZED\s+)?VIEW\s+`[^`]+`\s*\(/i);
    if (!viewMatch) return ddl;
    const startIdx = viewMatch.index! + viewMatch[0].length - 1;
    let depth = 1;
    let i = startIdx + 1;
    let inQuote = false;
    let quoteChar = '';
    while (i < ddl.length && depth > 0) {
        const ch = ddl[i];
        if (inQuote) {
            if (ch === quoteChar && ddl[i - 1] !== '\\') { inQuote = false; }
            i++;
            continue;
        }
        if (ch === '"' || ch === "'") { inQuote = true; quoteChar = ch; i++; continue; }
        if (ch === '(') { depth++; i++; continue; }
        if (ch === ')') { depth--; if (depth === 0) break; i++; continue; }
        i++;
    }
    if (depth !== 0) return ddl;
    const endIdx = i;
    const inner = ddl.substring(startIdx + 1, endIdx);
    const cols = splitColumnDefs(inner);
    if (cols.length <= 1) return ddl;
    return ddl.substring(0, startIdx + 1) + '\n  ' + cols.join(',\n  ') + '\n' + ddl.substring(endIdx);
}

function splitColumnDefs(content: string): string[] {
    const items: string[] = [];
    let current = '';
    let depth = 0;
    let inQuote = false;
    let quoteChar = '';
    for (let i = 0; i < content.length; i++) {
        const ch = content[i];
        if (inQuote) {
            current += ch;
            if (ch === quoteChar && content[i - 1] !== '\\') { inQuote = false; }
            continue;
        }
        if (ch === '"' || ch === "'") { inQuote = true; quoteChar = ch; current += ch; continue; }
        if (ch === '(') { depth++; current += ch; continue; }
        if (ch === ')') { depth--; current += ch; continue; }
        if (ch === ',' && depth === 0) {
            const trimmed = current.trim();
            if (trimmed) items.push(trimmed);
            current = '';
            continue;
        }
        current += ch;
    }
    const trimmed = current.trim();
    if (trimmed) items.push(trimmed);
    return items;
}

function formatDdlOutput(ddl: string): string {
    let s = ddl.replace(/\s+/g, ' ').trim();

    s = formatColumnDefs(s);

    s = s.replace(/\)\s+(COMMENT\s)/i, ')\n$1');
    s = s.replace(/\)\s+(DISTRIBUTED\b)/i, ')\n$1');
    s = s.replace(/\)\s+(REFRESH\b)/i, ')\n$1');
    s = s.replace(/\)\s+(PROPERTIES\s*\()/i, ')\n$1');
    s = s.replace(/\)\s+(AS\s+SELECT\b)/i, ')\n$1');

    s = s.replace(/"\s+(DISTRIBUTED\b)/g, '"\n$1');
    s = s.replace(/"\s+(REFRESH\b)/g, '"\n$1');
    s = s.replace(/"\s+(PROPERTIES\s*\()/g, '"\n$1');
    s = s.replace(/"\s+(AS\s+SELECT\b)/g, '"\n$1');

    s = s.replace(
        /PROPERTIES\s*\(([^)]+)\)/i,
        (_m, inner: string) => {
            const items = splitProperties(inner);
            return 'PROPERTIES (\n  ' + items.join(',\n  ') + '\n)';
        }
    );

    s = s.replace(
        /\bAS\s+SELECT\b(.+)/is,
        (_m, rest: string) => {
            if (hasTopLevelUnionAll(rest)) {
                return 'AS\n' + formatUnionSelect(rest);
            }
            let formatted = rest
                .replace(/\s+FROM\b/gi, '\nFROM')
                .replace(/\s+WHERE\b/gi, '\nWHERE')
                .replace(/\s+GROUP\s+BY\b/gi, '\nGROUP BY')
                .replace(/\s+HAVING\b/gi, '\nHAVING')
                .replace(/\s+ORDER\s+BY\b/gi, '\nORDER BY')
                .replace(/\s+LIMIT\b/gi, '\nLIMIT');
            formatted = 'AS\nSELECT' + splitSelectColumns(formatted);
            return formatSubquery(formatted);
        }
    );

    return s;
}

function hasTopLevelUnionAll(sql: string): boolean {
    let depth = 0;
    let inQuote = false;
    let quoteChar = '';
    const upper = sql.toUpperCase();
    for (let i = 0; i < sql.length; i++) {
        const ch = sql[i];
        if (inQuote) {
            if (ch === quoteChar && sql[i - 1] !== '\\') {
                inQuote = false;
            }
            continue;
        }
        if (ch === '"' || ch === "'") {
            inQuote = true;
            quoteChar = ch;
            continue;
        }
        if (ch === '(') { depth++; continue; }
        if (ch === ')') { depth--; continue; }
        if (depth === 0 && upper.substring(i).startsWith('UNION ALL')) {
            return true;
        }
    }
    return false;
}

function splitProperties(content: string): string[] {
    const items: string[] = [];
    let current = '';
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < content.length; i++) {
        const ch = content[i];

        if (inQuote) {
            current += ch;
            if (ch === quoteChar && content[i - 1] !== '\\') {
                inQuote = false;
            }
            continue;
        }

        if (ch === '"' || ch === "'") {
            inQuote = true;
            quoteChar = ch;
            current += ch;
            continue;
        }

        if (ch === ',') {
            const trimmed = current.trim();
            if (trimmed) items.push(trimmed);
            current = '';
            continue;
        }

        current += ch;
    }

    const trimmed = current.trim();
    if (trimmed) items.push(trimmed);

    return items;
}

function splitSelectColumns(selectPart: string): string {
    const fromIdx = selectPart.search(/\nFROM\b/i);
    const selectBody = fromIdx >= 0 ? selectPart.substring(0, fromIdx) : selectPart;
    const afterFrom = fromIdx >= 0 ? selectPart.substring(fromIdx) : '';

    const trimmed = selectBody.trim();
    if (!trimmed) return selectPart;

    const cols: string[] = [];
    let current = '';
    let depth = 0;
    let inQuote = false;
    let quoteChar = '';

    for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i];

        if (inQuote) {
            current += ch;
            if (ch === quoteChar && trimmed[i - 1] !== '\\') {
                inQuote = false;
            }
            continue;
        }

        if (ch === '"' || ch === "'") {
            inQuote = true;
            quoteChar = ch;
            current += ch;
            continue;
        }

        if (ch === '(') { depth++; current += ch; continue; }
        if (ch === ')') { depth--; current += ch; continue; }

        if (ch === ',' && depth === 0) {
            const c = current.trim();
            if (c) cols.push(c);
            current = '';
            continue;
        }

        current += ch;
    }

    const c = current.trim();
    if (c) cols.push(c);

    if (cols.length <= 1) return selectPart;

    return '\n  ' + cols.join(',\n  ') + afterFrom;
}

function formatUnionSelect(sql: string): string {
    const parts = sql.split(/\bUNION\s+ALL\b/i).map(p => p.trim());
    const formattedParts = parts.map((part, idx) => {
        let p = part;
        if (!/^\s*SELECT\b/i.test(p)) {
            p = 'SELECT ' + p;
        }
        p = p
            .replace(/\bSELECT\b\s*/i, 'SELECT\n  ')
            .replace(/\s+FROM\b/gi, '\nFROM')
            .replace(/\s+WHERE\b/gi, '\nWHERE')
            .replace(/\s+GROUP\s+BY\b/gi, '\nGROUP BY')
            .replace(/\s+HAVING\b/gi, '\nHAVING')
            .replace(/\s+ORDER\s+BY\b/gi, '\nORDER BY')
            .replace(/\s+LIMIT\b/gi, '\nLIMIT');
        p = formatSelectColsInLine(p);
        if (idx < parts.length - 1) {
            return p + '\nUNION ALL';
        }
        return p;
    });
    const lastPart = formattedParts[formattedParts.length - 1];
    const unionParts = formattedParts.slice(0, -1);
    const match = lastPart.match(/^([\s\S]*?)(FROM\b[\s\S]*)$/i);
    if (match) {
        const selectBlock = match[1].trimEnd();
        const restBlock = match[2];
        const formatted = restBlock
            .replace(/FROM\b\s*/i, 'FROM\n  ')
            .replace(/\s+WHERE\b/gi, '\nWHERE')
            .replace(/\s+GROUP\s+BY\b/gi, '\nGROUP BY')
            .replace(/\s+ORDER\s+BY\b/gi, '\nORDER BY')
            .replace(/\s+LIMIT\b/gi, '\nLIMIT');
        return [...unionParts, selectBlock, formatted].join('\n');
    }
    return formattedParts.join('\n');
}

function formatSelectColsInLine(selectBlock: string): string {
    const lines = selectBlock.split('\n');
    if (lines.length < 2) return selectBlock;
    const keyword = lines[0];
    const rest = lines.slice(1).join('\n');
    const fromIdx = rest.search(/\n\s*FROM\b/i);
    const colsPart = fromIdx >= 0 ? rest.substring(0, fromIdx) : rest;
    const afterPart = fromIdx >= 0 ? rest.substring(fromIdx) : '';
    const cols = colsPart.split(/\s*,\s*/).filter(c => c.trim());
    if (cols.length <= 1) return selectBlock;
    return keyword + '\n  ' + cols.join(',\n  ') + afterPart;
}

function formatSubquery(sql: string): string {
    let result = '';
    let i = 0;
    while (i < sql.length) {
        if (sql[i] === '(') {
            let depth = 1;
            let j = i + 1;
            while (j < sql.length && depth > 0) {
                if (sql[j] === '(') depth++;
                if (sql[j] === ')') depth--;
                j++;
            }
            const inner = sql.substring(i + 1, j - 1).trim();
            if (/^\s*SELECT\b/i.test(inner)) {
                if (/\bUNION\s+ALL\b/i.test(inner)) {
                    const parts = inner.split(/\bUNION\s+ALL\b/i).map(p => p.trim());
                    const formatted = parts.map((p, idx) => {
                        let fp = p
                            .replace(/\bSELECT\b\s*/i, 'SELECT\n      ')
                            .replace(/\s+FROM\b/gi, '\n    FROM')
                            .replace(/\s+WHERE\b/gi, '\n    WHERE');
                        fp = formatSubqueryCols(fp);
                        if (idx < parts.length - 1) {
                            return fp + '\n  UNION ALL';
                        }
                        return fp;
                    });
                    result += '(\n  ' + formatted.join('\n') + '\n)';
                } else {
                    result += '(' + inner + ')';
                }
            } else {
                result += sql.substring(i, j);
            }
            i = j;
        } else {
            result += sql[i];
            i++;
        }
    }
    return result;
}

function formatSubqueryCols(block: string): string {
    const lines = block.split('\n');
    if (lines.length < 2) return block;
    const keyword = lines[0].trim();
    const rest = lines.slice(1).join('\n');
    const fromIdx = rest.search(/\n\s*FROM\b/i);
    const colsPart = fromIdx >= 0 ? rest.substring(0, fromIdx) : rest;
    const afterPart = fromIdx >= 0 ? rest.substring(fromIdx) : '';
    const cols = colsPart.split(/\s*,\s*/).map(c => c.trim()).filter(c => c);
    if (cols.length <= 1) return block;
    return keyword + '\n      ' + cols.join(',\n      ') + afterPart;
}

export function registerSchemaCommands(
    _context: vscode.ExtensionContext,
    dbModule: DatabaseModule
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.refreshSchema', async () => {
            const activeConn = getConnectionManager().getActiveConnection();
            if (activeConn) {
                getSchemaCache().invalidate(activeConn.id);
            }
            vscode.commands.executeCommand('hive-formatter.refreshTreeProvider');
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.viewTableData', async (node?: ITreeNode) => {
            try {
                if (!node) {
                    vscode.window.showErrorMessage(t('database.noTableNodeSelected'));
                    return;
                }

                const connectionId = getNodeField(node, 'connectionId');
                const databaseName = getNodeField(node, 'databaseName');
                let name = '';
                if (node.type === 'table') {
                    name = getNodeField(node, 'tableName');
                } else if (node.type === 'view') {
                    name = getNodeField(node, 'viewName');
                } else if (node.type === 'materializedView') {
                    name = getNodeField(node, 'mvName');
                }

                const connectionManager = getConnectionManager();
                const adapter = connectionManager.getAdapter(connectionId);
                if (!adapter) {
                    vscode.window.showWarningMessage(t('database.noAdapterForTable'));
                    return;
                }

                const quotedName = adapter.schemaAdapter.quoteIdentifier(databaseName) + '.' + adapter.schemaAdapter.quoteIdentifier(name);
                const maxRows = getConfigManager().get<number>('query.maxRows', 1000);
                // No trailing semicolon: the streaming query path and some
                // drivers (e.g. mysql2 streaming, better-sqlite3) treat a
                // trailing `;` as a second empty statement, which can either
                // error out or produce an empty result set.
                const sql = `SELECT * FROM ${quotedName} LIMIT ${maxRows}`;

                // Ask the views layer to ensure the panel exists and bind a
                // QueryResultController pinned to (connectionId, databaseName).
                // The controller then handles onExecutePanelSql etc. via the
                // injected port services, so the database layer no longer
                // reaches into the panel.
                await vscode.commands.executeCommand(
                    'hive-formatter.setQueryResultPanelCallbacks',
                    connectionId,
                    databaseName,
                );
                await vscode.commands.executeCommand('hive-formatter.showQueryLoading', sql);

                try {
                    const dbListAdapter = getConnectionManager().getAdapter(connectionId);
                    if (dbListAdapter) {
                        const dbs = await dbListAdapter.metadataAdapter.listDatabases();
                        vscode.commands.executeCommand(
                            'hive-formatter.sendDatabaseList',
                            dbs.map(d => d.name),
                            databaseName,
                        );
                    }
                } catch (_e) { /* ignore */ }

                // Hand the SQL to the panel and trigger execution. The panel's
                // onExecutePanelSql callback (wired by the controller) runs the
                // query and pushes the result back via showResult.
                await vscode.commands.executeCommand(
                    'hive-formatter.setQueryResultPanelSql',
                    sql,
                    true,
                );
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                const outputChannel = dbModule.getOutputChannel();
                vscode.window.showErrorMessage(t('database.failedToViewTableData', msg));
                outputChannel?.appendLine(`❌ viewTableData error: ${msg}`);
            }
        })
    );

    function createViewDDLCommand(
        commandId: string,
        getNodeName: (node: ITreeNode) => string,
        getDDL: (adapter: DatabaseAdapter, database: string, name: string) => Promise<string>
    ): vscode.Disposable {
        return vscode.commands.registerCommand(commandId, async (node?: ITreeNode) => {
            if (!node) return;
            const connectionId = getNodeField(node, 'connectionId');
            const databaseName = getNodeField(node, 'databaseName');
            const adapter = getConnectionManager().getAdapter(connectionId);
            if (!adapter) return;
            try {
                const ddl = await getDDL(adapter, databaseName, getNodeName(node));
                const formatted = formatDdlOutput(ddl);
                const document = await vscode.workspace.openTextDocument({
                    content: formatted,
                    language: 'sql'
                });
                await vscode.window.showTextDocument(document);
            } catch (error) {
                vscode.window.showErrorMessage(t('database.failedToGetDdl', String(error)));
            }
        });
    }

    disposables.push(
        createViewDDLCommand('hive-formatter.viewTableDDL', n => getNodeField(n, 'tableName'), (a, db, name) => a.schemaAdapter.getTableDDL(db, name)),
        createViewDDLCommand('hive-formatter.viewViewDDL', n => getNodeField(n, 'viewName'), (a, db, name) => a.schemaAdapter.getViewDDL(db, name)),
        createViewDDLCommand('hive-formatter.viewMaterializedViewDDL', n => getNodeField(n, 'mvName'), (a, db, name) => a.schemaAdapter.getMaterializedViewDDL(db, name)),
        createViewDDLCommand('hive-formatter.viewFunctionDDL', n => getNodeField(n, 'functionName'), (a, db, name) => a.schemaAdapter.getFunctionDDL(db, name)),
        createViewDDLCommand('hive-formatter.viewProcedureDDL', n => getNodeField(n, 'procedureName'), (a, db, name) => a.schemaAdapter.getProcedureDDL(db, name)),
        createViewDDLCommand('hive-formatter.viewTriggerDDL', n => getNodeField(n, 'triggerName'), (a, db, name) => a.schemaAdapter.getTriggerDDL(db, name)),
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.newQuery', async (node?: ITreeNode) => {
            let database = '';
            let connectionId = '';
            if (node?.type === 'database') {
                database = getNodeField(node, 'databaseName');
                connectionId = getNodeField(node, 'connectionId');
            } else if (node?.type === 'connection') {
                connectionId = getNodeField(node, 'connectionId');
                const activeConn = getConnectionManager().getActiveConnection();
                database = activeConn?.database || '';
            }

            const connectionManager = getConnectionManager();
            const activeConn = connectionManager.getActiveConnection();
            if (!connectionId && activeConn) {
                connectionId = activeConn.id;
            }
            if (!database && activeConn) {
                database = activeConn.database || '';
            }

            const newQueryAdapter = connectionId ? connectionManager.getAdapter(connectionId) : undefined;
            const q = newQueryAdapter ? newQueryAdapter.schemaAdapter.quoteIdentifier.bind(newQueryAdapter.schemaAdapter) : ((id: string): string => '`' + id.replace(/`/g, '``') + '`');
            const content = database ? `USE ${q(database)};\n\n` : '';

            // Ensure the panel exists and bind a controller pinned to
            // (connectionId, database). The views layer owns panel creation
            // and controller attachment.
            await vscode.commands.executeCommand(
                'hive-formatter.setQueryResultPanelCallbacks',
                connectionId,
                database,
            );

            try {
                const dbListAdapter = connectionId ? connectionManager.getAdapter(connectionId) : undefined;
                if (dbListAdapter) {
                    const dbs = await dbListAdapter.metadataAdapter.listDatabases();
                    vscode.commands.executeCommand(
                        'hive-formatter.sendDatabaseList',
                        dbs.map(d => d.name),
                        database,
                    );
                }
            } catch (_e) { /* ignore: database list is best-effort */ console.debug('[SQL All in One] Failed to list databases for table designer:', _e) }

            // Set the SQL content without auto-executing (user typed a fresh
            // `USE db;` stub they will append to).
            await vscode.commands.executeCommand(
                'hive-formatter.setQueryResultPanelSql',
                content,
                false,
            );
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.copyColumnName', async (node?: ITreeNode) => {
            if (node) {
                // ColumnTreeNode.label === columnInfo.name (see views/databaseExplorer/treeNodes.ts).
                await vscode.env.clipboard.writeText(node.label);
                vscode.window.showInformationMessage(t('database.columnCopied'));
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.addToFavorites', async (node?: ITreeNode) => {
            if (node) {
                const connectionId = getNodeField(node, 'connectionId');
                const databaseName = getNodeField(node, 'databaseName');
                const conn = getConnectionManager().getAllConnections().find(
                    (c) => c.id === connectionId
                );
                if (conn) {
                    let name = '';
                    let type: 'table' | 'view' = 'view';
                    if (node.type === 'table') {
                        name = getNodeField(node, 'tableName');
                        type = 'table';
                    } else if (node.type === 'view') {
                        name = getNodeField(node, 'viewName');
                        type = 'view';
                    } else if (node.type === 'materializedView') {
                        name = getNodeField(node, 'mvName');
                        type = 'view';
                    }
                    await vscode.commands.executeCommand(
                        'hive-formatter.addTreeFavorite',
                        connectionId,
                        conn.name,
                        databaseName,
                        type,
                        name,
                    );
                    vscode.window.showInformationMessage(t('database.addedToFavorites'));
                }
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.removeFromFavorites', async (node?: ITreeNode) => {
            if (node) {
                await vscode.commands.executeCommand(
                    'hive-formatter.removeTreeFavorite',
                    getNodeField(node, 'connectionId'),
                    getNodeField(node, 'databaseName'),
                    node.type as 'table' | 'view',
                    getNodeField(node, 'objectName'),
                );
                vscode.window.showInformationMessage(t('database.removedFromFavorites'));
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.revealInExplorer', async (node?: ITreeNode) => {
            if (node) {
                vscode.window.showInformationMessage(
                    t('explorer.revealInfo', node.type, getNodeField(node, 'objectName'), getNodeField(node, 'connectionName'), getNodeField(node, 'databaseName'))
                );
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.setDefaultDatabase', async (node?: ITreeNode) => {
            if (node) {
                const connectionId = getNodeField(node, 'connectionId');
                const databaseName = getNodeField(node, 'databaseName');
                const manager = getConnectionManager();
                const currentConfig = manager.getAllConnections().find(c => c.id === connectionId);
                if (!currentConfig) {
                    vscode.window.showErrorMessage(t('database.connectionNotFound'));
                    return;
                }

                const updatedConfig: ConnectionConfig = {
                    ...currentConfig,
                    database: databaseName
                };

                try {
                    await manager.updateConnection(connectionId, updatedConfig);
                    vscode.commands.executeCommand('hive-formatter.refreshTreeProvider');
                    vscode.window.showInformationMessage(t('database.defaultDatabaseSet', databaseName));
                } catch (error) {
                    vscode.window.showErrorMessage(t('database.failedToSetDefaultDatabase', String(error)));
                }
            }
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.designTable', async (node?: ITreeNode) => {
            const connectionManager = getConnectionManager();
            const activeConn = connectionManager.getActiveConnection();
            if (!activeConn) {
                vscode.window.showWarningMessage(t('database.noActiveConnection'));
                return;
            }

            let database = '';
            if (node?.type === 'database') {
                database = getNodeField(node, 'databaseName');
            } else {
                database = activeConn.database || '';
            }

            if (!database) {
                try {
                    const adapter = connectionManager.getAdapter(activeConn.id);
                    if (!adapter) {
                        vscode.window.showWarningMessage(t('database.noDatabaseAdapter'));
                        return;
                    }
                    const databases = await adapter.metadataAdapter.listDatabases();
                    const picked = await vscode.window.showQuickPick(
                        databases.map(d => d.name),
                        { placeHolder: t('database.selectDatabase') }
                    );
                    if (!picked) return;
                    database = picked;
                } catch {
                    vscode.window.showWarningMessage(t('database.failedToListDatabases'));
                    return;
                }
            }

            await vscode.commands.executeCommand(
                'hive-formatter.openTableDesigner',
                { database },
            );
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.editTable', async (node?: ITreeNode) => {
            if (!node) {
                vscode.window.showWarningMessage(t('database.selectTableToEdit'));
                return;
            }

            const connectionId = getNodeField(node, 'connectionId');
            const databaseName = getNodeField(node, 'databaseName');
            const tableName = getNodeField(node, 'tableName');

            const connectionManager = getConnectionManager();
            const adapter = connectionManager.getAdapter(connectionId);
            if (!adapter) {
                vscode.window.showWarningMessage(t('database.noAdapterForTable'));
                return;
            }

            await vscode.commands.executeCommand(
                'hive-formatter.openTableDesigner',
                { database: databaseName, tableName },
            );
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.explainQuery', async () => {
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage(t('database.noActiveEditor'));
                return;
            }

            const connectionManager = getConnectionManager();
            const activeConn = connectionManager.getActiveConnection();
            if (!activeConn) {
                vscode.window.showWarningMessage(t('database.noActiveConnection'));
                return;
            }

            const adapter = connectionManager.getAdapter(activeConn.id);
            if (!adapter) {
                vscode.window.showWarningMessage(t('database.noActiveAdapter'));
                return;
            }

            const capabilities = adapter.schemaAdapter.getDialectCapabilities();
            if (!capabilities.supportsExplain) {
                vscode.window.showWarningMessage(t('database.currentDbNoExplain'));
                return;
            }

            const statementDetector = dbModule.getStatementDetector();
            if (!statementDetector) {
                vscode.window.showWarningMessage(t('database.noActiveAdapter'));
                return;
            }
            const statement = statementDetector.detectSelectionOrCurrent(
                editor.document,
                editor.selection
            );

            if (!statement.sql) {
                vscode.window.showWarningMessage(t('database.noSqlFound'));
                return;
            }

            // Delegate panel creation + explain-plan rendering to the views
            // layer, which owns ExplainPlanPanel.
            await vscode.commands.executeCommand(
                'hive-formatter.showExplainPlan',
                statement.sql,
                false,
            );
        })
    );

    disposables.push(
        vscode.commands.registerCommand('hive-formatter.importData', async () => {
            const connectionManager = getConnectionManager();
            const activeConn = connectionManager.getActiveConnection();
            if (!activeConn) {
                vscode.window.showWarningMessage(t('database.noActiveConnection'));
                return;
            }

            // Delegate dialog creation to the views layer, which owns
            // DataTransferDialog.
            await vscode.commands.executeCommand('hive-formatter.showDataTransferDialog');
        })
    );

    return disposables;
}
