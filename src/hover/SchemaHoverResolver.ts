import * as vscode from "vscode";
import type { SqlLanguage } from "../formatter/sqlFormatter";
import type { HoverResolver } from "./HoverResolver";
import { SchemaProvider, getSchemaProvider } from "../database/schema/SchemaProvider";
import { getConnectionManager } from "../database/connection/ConnectionManager";
import { sqlDialects } from "../core/sqlDialects";
import type { SqlDialect } from "../parser/dialectMapper";
import { isAstNode } from "../parser/AstVisitor";
import type { AstNode } from "../parser/astTypes";
import { extractTableNamesFromAst } from "../completion/AstCompletionProvider";
import { getDocumentAstCache } from "../parser/DocumentAstCache";

export class SchemaHoverResolver implements HoverResolver {
    private schemaProvider: SchemaProvider;

    constructor() {
        this.schemaProvider = getSchemaProvider();
    }

    async resolve(
        word: string,
        _dialect: SqlLanguage,
        document: vscode.TextDocument,
        position: vscode.Position,
    ): Promise<vscode.Hover | null> {
        const connectionManager = getConnectionManager();
        const activeConn = connectionManager.getActiveConnection();
        if (!activeConn) return null;

        const adapter = connectionManager.getAdapter(activeConn.id);
        if (!adapter || !adapter.isConnected()) return null;

        const database = activeConn.database || "";
        const dialectName = sqlDialects[document.languageId as keyof typeof sqlDialects] || "mysql";

        const astResult = getDocumentAstCache().getOrParse(document, dialectName as SqlDialect);
        if (!astResult.success || !astResult.ast) return null;

        const tableName = this.findTableNameAtPosition(astResult.ast, word);

        if (tableName) {
            const hoverInfo = await this.schemaProvider.getTableHoverInfo(tableName, database);
            if (hoverInfo) {
                const range = document.getWordRangeAtPosition(position) || new vscode.Range(position, position);
                return new vscode.Hover(hoverInfo, range);
            }
        }

        if (tableName) {
            const hoverInfo = await this.schemaProvider.getColumnHoverInfo(word, tableName, database);
            if (hoverInfo) {
                const range = document.getWordRangeAtPosition(position) || new vscode.Range(position, position);
                return new vscode.Hover(hoverInfo, range);
            }
        }

        const tables = await this.findTablesForColumnLookup(astResult.ast, document, position);
        for (const tbl of tables) {
            const hoverInfo = await this.schemaProvider.getColumnHoverInfo(word, tbl, database);
            if (hoverInfo) {
                const range = document.getWordRangeAtPosition(position) || new vscode.Range(position, position);
                return new vscode.Hover(hoverInfo, range);
            }
        }

        return null;
    }

    private findTableNameAtPosition(ast: unknown, word: string): string | null {
        const astList = Array.isArray(ast) ? ast : [ast];
        for (const item of astList) {
            if (!isAstNode(item)) continue;
            const node = item as AstNode;
            if (node.type === "select" && Array.isArray(node.from)) {
                for (const entry of node.from) {
                    if (entry == null || typeof entry !== "object") continue;
                    const fromEntry = entry as Record<string, unknown>;
                    const table = fromEntry.table;
                    if (typeof table === "string" && table.toLowerCase() === word.toLowerCase()) {
                        return table;
                    }
                }
            }
        }
        return null;
    }

    private async findTablesForColumnLookup(ast: unknown, document: vscode.TextDocument, position: vscode.Position): Promise<string[]> {
        const dialectName = sqlDialects[document.languageId as keyof typeof sqlDialects] || "mysql";
        const aliasMap = getDocumentAstCache().getOrBuildAliasMap(document, dialectName as SqlDialect);

        const lineText = document.lineAt(position.line).text;
        const textBeforeCursor = lineText.substring(0, position.character);
        const dotMatch = textBeforeCursor.match(/(\w+)\.\w*$/);
        if (dotMatch) {
            const alias = dotMatch[1];
            const tableName = this.schemaProvider.resolveAlias(alias, aliasMap);
            if (tableName) return [tableName];
        }

        const tables = extractTableNamesFromAst(ast);
        return tables;
    }
}
