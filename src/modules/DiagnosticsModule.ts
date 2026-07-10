import * as vscode from "vscode";
import type { Activatable } from "../core/Activatable";
import { isSqlDocument } from "../core/sqlDialects";
import { getContainer, Tokens } from "../core/diContainer";
import { createLazyProvider } from "../core/diUtils";
import type { SqlDiagnosticsProvider } from "../providers/SqlDiagnosticsProvider";

export class DiagnosticsModule implements Activatable {
    activate(context: vscode.ExtensionContext): void {
        const container = getContainer();
        const getDp = createLazyProvider<SqlDiagnosticsProvider>(container, Tokens.SqlDiagnosticsProvider, context);

        context.subscriptions.push(
            vscode.workspace.onDidChangeTextDocument((event) => {
                if (isSqlDocument(event.document)) {
                    getDp()?.debouncedProvideDiagnostics(event.document);
                }
            }),
            vscode.workspace.onDidOpenTextDocument((document) => {
                if (isSqlDocument(document)) getDp()?.provideDiagnostics(document);
            }),
            vscode.workspace.onDidSaveTextDocument((document) => {
                if (isSqlDocument(document)) getDp()?.provideDiagnostics(document);
            }),
        );

        const openSqlDocs = vscode.workspace.textDocuments.filter(isSqlDocument);
        if (openSqlDocs.length > 0) {
            queueMicrotask(() => openSqlDocs.forEach((doc) => getDp()?.provideDiagnostics(doc)));
        }
    }
}
