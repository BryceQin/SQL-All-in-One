import * as vscode from 'vscode';
import type { IConnectionService, ISchemaService } from '../../application/ports';
import { MaterializedViewDesignerPanel } from './MaterializedViewDesignerPanel';
import { handleError, ErrorCategory } from '../../core/errorHandler';
import type { MaterializedViewTreeNode } from '../databaseExplorer/treeNodes';

export function registerMaterializedViewDesignerCommands(
    context: vscode.ExtensionContext,
    connectionService: IConnectionService,
    schemaService: ISchemaService,
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    disposables.push(
        vscode.commands.registerCommand(
            'sqlAllInOne.createMaterializedView',
            async (node?: MaterializedViewTreeNode) => {
                try {
                    const database = node?.databaseName ?? (await askForDatabase(connectionService));
                    if (!database) {
                        return;
                    }

                    const panel = MaterializedViewDesignerPanel.createOrShow(
                        context.extensionUri,
                        context,
                        connectionService,
                        schemaService,
                    );
                    await panel.openForCreate(database);
                } catch (error) {
                    handleError(error, 'createMaterializedView', ErrorCategory.FEATURE);
                }
            },
        ),
    );

    disposables.push(
        vscode.commands.registerCommand(
            'sqlAllInOne.editMaterializedView',
            async (node?: MaterializedViewTreeNode) => {
                try {
                    if (!node) {
                        vscode.window.showErrorMessage('No materialized view selected');
                        return;
                    }

                    const panel = MaterializedViewDesignerPanel.createOrShow(
                        context.extensionUri,
                        context,
                        connectionService,
                        schemaService,
                    );
                    await panel.openForEdit(node.databaseName, node.mvName);
                } catch (error) {
                    handleError(error, 'editMaterializedView', ErrorCategory.FEATURE);
                }
            },
        ),
    );

    disposables.push(
        vscode.commands.registerCommand(
            'sqlAllInOne.dropMaterializedView',
            async (node?: MaterializedViewTreeNode) => {
                try {
                    if (!node) {
                        vscode.window.showErrorMessage('No materialized view selected');
                        return;
                    }

                    const confirmed = await vscode.window.showWarningMessage(
                        `Are you sure you want to drop materialized view "${node.mvName}"?`,
                        { modal: true },
                        'Drop',
                        'Cancel',
                    );

                    if (confirmed !== 'Drop') {
                        return;
                    }

                    const activeConn = connectionService.getActiveConnection();
                    if (!activeConn) {
                        vscode.window.showErrorMessage('No active connection');
                        return;
                    }

                    const adapter = connectionService.getAdapter(activeConn.id);
                    if (!adapter) {
                        vscode.window.showErrorMessage('No adapter found for connection');
                        return;
                    }

                    const sql = `DROP MATERIALIZED VIEW \`${node.databaseName}\`.\`${node.mvName}\``;
                    await adapter.queryAdapter.execute(sql);

                    schemaService.invalidate(activeConn.id, 'materializedView', node.databaseName);
                    vscode.window.showInformationMessage(`Materialized view "${node.mvName}" dropped successfully`);
                } catch (error) {
                    handleError(error, 'dropMaterializedView', ErrorCategory.SUB_ITEM);
                    vscode.window.showErrorMessage(`Failed to drop materialized view: ${error}`);
                }
            },
        ),
    );

    disposables.push(
        vscode.commands.registerCommand(
            'sqlAllInOne.refreshMaterializedView',
            async (node?: MaterializedViewTreeNode) => {
                try {
                    if (!node) {
                        vscode.window.showErrorMessage('No materialized view selected');
                        return;
                    }

                    const activeConn = connectionService.getActiveConnection();
                    if (!activeConn) {
                        vscode.window.showErrorMessage('No active connection');
                        return;
                    }

                    const adapter = connectionService.getAdapter(activeConn.id);
                    if (!adapter) {
                        vscode.window.showErrorMessage('No adapter found for connection');
                        return;
                    }

                    const sql = `REFRESH MATERIALIZED VIEW \`${node.databaseName}\`.\`${node.mvName}\``;
                    await adapter.queryAdapter.execute(sql);

                    vscode.window.showInformationMessage(`Materialized view "${node.mvName}" refresh initiated`);
                } catch (error) {
                    handleError(error, 'refreshMaterializedView', ErrorCategory.SUB_ITEM);
                    vscode.window.showErrorMessage(`Failed to refresh materialized view: ${error}`);
                }
            },
        ),
    );

    disposables.push(
        vscode.commands.registerCommand(
            'sqlAllInOne.viewMaterializedViewDDL',
            async (node?: MaterializedViewTreeNode) => {
                try {
                    if (!node) {
                        vscode.window.showErrorMessage('No materialized view selected');
                        return;
                    }

                    const activeConn = connectionService.getActiveConnection();
                    if (!activeConn) {
                        vscode.window.showErrorMessage('No active connection');
                        return;
                    }

                    const adapter = connectionService.getAdapter(activeConn.id);
                    if (!adapter) {
                        vscode.window.showErrorMessage('No adapter found for connection');
                        return;
                    }

                    const ddl = await adapter.schemaAdapter.getMaterializedViewDDL(
                        node.databaseName,
                        node.mvName,
                    );

                    const document = await vscode.workspace.openTextDocument({
                        content: ddl,
                        language: 'sql',
                    });
                    await vscode.window.showTextDocument(document);
                } catch (error) {
                    handleError(error, 'viewMaterializedViewDDL', ErrorCategory.SUB_ITEM);
                    vscode.window.showErrorMessage(`Failed to get materialized view DDL: ${error}`);
                }
            },
        ),
    );

    return disposables;
}

async function askForDatabase(connectionService: IConnectionService): Promise<string | undefined> {
    const activeConn = connectionService.getActiveConnection();
    if (!activeConn) {
        vscode.window.showErrorMessage('No active connection');
        return undefined;
    }

    const adapter = connectionService.getAdapter(activeConn.id);
    if (!adapter) {
        vscode.window.showErrorMessage('No adapter found for connection');
        return undefined;
    }

    const databases = await adapter.metadataAdapter.listDatabases();
    if (databases.length === 0) {
        vscode.window.showErrorMessage('No databases found');
        return undefined;
    }

    if (databases.length === 1) {
        return databases[0].name;
    }

    return vscode.window.showQuickPick(
        databases.map((db) => db.name),
        { placeHolder: 'Select database' },
    );
}