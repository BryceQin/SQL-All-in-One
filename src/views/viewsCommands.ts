import * as vscode from "vscode";
import { ExplainPlanPanel } from "./explainPlan/ExplainPlanPanel";
import { DataTransferDialog } from "./dataTransfer/DataTransferDialog";
import { registerQueryResultCommands } from "./queryResult/queryResultCommands";
import { registerTableDesignerCommands } from "./tableDesigner/tableDesignerCommands";
import { registerMaterializedViewDesignerCommands } from "./materializedViewDesigner/materializedViewDesignerCommands";
import { registerTreeProviderCommands } from "./databaseExplorer/treeProviderCommands";
import { getContainer, Tokens } from "../core/diContainer";
import type { IConnectionService, IDataTransferService, IExplainPlanService, ISchemaService } from "../application/ports";

/**
 * Register every views-layer command handler that the database layer
 * delegates to via `vscode.commands.executeCommand(...)`.
 *
 * This is the single entry point invoked from extension activation (Task 8.4).
 * It must run AFTER the database-layer commands are registered so that
 * database commands which fire views-layer commands (e.g.
 * `hive-formatter.executeQuery` → `hive-formatter.showQueryLoading`) find a
 * registered handler.
 *
 * Ordering within this function matters:
 *   1. Tree provider is created first so that refresh / favorite commands
 *      have a target when subsequent init steps (e.g. connection manager
 *      initialization) fire `refreshTreeProvider`.
 *   2. Query-result handlers are registered before the user can run any
 *      query, ensuring `showQueryLoading` / `showQueryResult` resolve.
 *   3. Table designer, explain-plan, and data-transfer handlers are
 *      independent and registered last.
 *
 * @returns the aggregated disposables (also pushed onto context.subscriptions).
 */
export function registerViewsCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // 1. Tree provider — create the DatabaseTreeProvider + TreeView and
    //    register refresh / favorite commands. The createTreeProvider command
    //    is invoked immediately so the tree is available before any
    //    connection-state events fire.
    disposables.push(...registerTreeProviderCommands(context));
    vscode.commands.executeCommand("hive-formatter.createTreeProvider");

    // 2. Query-result panel handlers (showQueryLoading, showQueryResult,
    //    showQueryError, setQueryResultPanelSql, sendDatabaseList,
    //    setQueryResultPanelCallbacks, exportQueryResult,
    //    getCurrentQueryResult).
    disposables.push(...registerQueryResultCommands(context));

    // 3. Table designer handler (openTableDesigner).
    disposables.push(...registerTableDesignerCommands(context));

    // 3.5 Materialized view designer handler.
    const container = getContainer();
    disposables.push(...registerMaterializedViewDesignerCommands(
        context,
        container.get<IConnectionService>(Tokens.ConnectionService),
        container.get<ISchemaService>(Tokens.SchemaService),
    ));

    // 4. Explain-plan handler. The database layer fires
    //    `hive-formatter.showExplainPlan(sql, isPanel?)` from
    //    SchemaCommands.explainQuery; the views layer owns the panel.
    disposables.push(
        vscode.commands.registerCommand("hive-formatter.showExplainPlan", async (sql: string, _isPanel?: boolean) => {
            const container = getContainer();
            const panel = ExplainPlanPanel.createOrShow(
                context.extensionUri,
                context,
                container.get<IConnectionService>(Tokens.ConnectionService),
                container.get<IExplainPlanService>(Tokens.ExplainPlanService),
            );
            await panel.showExplainPlan(sql, false);
        }),
    );

    // 5. Data-transfer dialog handler. Fired by SchemaCommands.importData.
    disposables.push(
        vscode.commands.registerCommand("hive-formatter.showDataTransferDialog", () => {
            const container = getContainer();
            DataTransferDialog.createOrShow(
                context.extensionUri,
                context,
                container.get<IConnectionService>(Tokens.ConnectionService),
                container.get<IDataTransferService>(Tokens.DataTransferService),
            );
        }),
    );

    for (const d of disposables) {
        context.subscriptions.push(d);
    }
    return disposables;
}
