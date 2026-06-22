import * as vscode from 'vscode'
import { SchemaProvider, getSchemaProvider, type ClauseType, type CompletionContext } from '../database/schema/SchemaProvider'
import { getConnectionManager } from '../database/connection/ConnectionManager'
import { getConfigManager } from '../core/configManager'
import { sqlDialects } from '../core/sqlDialects'
import type { SqlDialect } from '../parser/dialectMapper'
import { getDocumentAstCache } from '../parser/DocumentAstCache'
import { findCursorContextFromAst } from './AstCompletionProvider'

const clauseTypeMap: Record<string, ClauseType> = {
    select_columns: 'SELECT',
    from_table: 'FROM',
    join_type: 'JOIN',
    on_condition: 'WHERE',
    where_expr: 'WHERE',
    groupby_columns: 'GROUP BY',
    orderby_columns: 'ORDER BY',
    cte_name: 'FROM',
    unknown: 'OTHER',
    function_args: 'OTHER',
    window_func: 'SELECT',
    case_when: 'SELECT',
}

export class SchemaCompletionProvider {
    private schemaProvider: SchemaProvider

    constructor() {
        this.schemaProvider = getSchemaProvider()
    }

    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
        preParsedResult?: { success: boolean; ast: unknown },
    ): Promise<vscode.CompletionItem[]> {
        const cfgMgr = getConfigManager()
        if (!cfgMgr.get('enableCompletion', true)) return []
        if (!cfgMgr.get('completion.schema', true)) return []

        const connectionManager = getConnectionManager()
        const activeConn = connectionManager.getActiveConnection()
        if (!activeConn) return []

        const adapter = connectionManager.getAdapter(activeConn.id)
        if (!adapter || !adapter.isConnected()) return []

        const dialectName = sqlDialects[document.languageId as keyof typeof sqlDialects] || 'mysql'
        const lineText = document.lineAt(position.line).text
        const textBeforeCursor = lineText.substring(0, position.character)

        const parseResult = preParsedResult ?? getDocumentAstCache().getOrParse(document, dialectName as SqlDialect)

        const clauseType = this.determineClauseTypeFromAst(parseResult, position, textBeforeCursor)
        const prefix = this.extractPrefix(textBeforeCursor)
        const aliasMap = getDocumentAstCache().getOrBuildAliasMap(document, dialectName as SqlDialect)

        const context: CompletionContext = {
            connectionId: activeConn.id,
            database: activeConn.database || '',
            clauseType,
            prefix,
            aliasMap,
        }

        try {
            const items = await this.schemaProvider.getCompletionItems(context)
            return items
        } catch (e) {
            console.debug('[SQL All in One] SchemaCompletionProvider.getCompletionItems failed:', e)
            return []
        }
    }

    /**
     * Called by VSCode when a completion item is being shown/selected. Delegates
     * to {@link SchemaProvider.resolveCompletionItem} which updates the MRU
     * cache based on the item's data. This keeps MRU updates out of item
     * generation (a read operation) and ties them to actual user interaction.
     */
    resolveCompletionItem(item: vscode.CompletionItem, _token: vscode.CancellationToken): vscode.ProviderResult<vscode.CompletionItem> {
        try {
            return this.schemaProvider.resolveCompletionItem(item)
        } catch (e) {
            console.debug('[SQL All in One] SchemaCompletionProvider.resolveCompletionItem failed:', e)
            return item
        }
    }

    private determineClauseTypeFromAst(
        parseResult: { success: boolean; ast: unknown },
        position: vscode.Position,
        textBeforeCursor: string,
    ): ClauseType {
        const trimmed = textBeforeCursor.trim().toUpperCase()

        if (trimmed.endsWith('USE') || /\bUSE\s+$/i.test(textBeforeCursor)) {
            return 'USE'
        }
        if (/\bCALL\s+$/i.test(textBeforeCursor)) {
            return 'CALL'
        }
        if (/\bINSERT\s+INTO\s+$/i.test(textBeforeCursor)) {
            return 'INSERT INTO'
        }
        if (/\bUPDATE\s+$/i.test(textBeforeCursor)) {
            return 'UPDATE'
        }

        if (parseResult.success && parseResult.ast) {
            const astContext = findCursorContextFromAst(parseResult.ast, { line: position.line, column: position.character })
            const mapped = clauseTypeMap[astContext]
            if (mapped && mapped !== 'OTHER') return mapped
        }

        if (/\bFROM\s+$/i.test(textBeforeCursor)) return 'FROM'
        if (/\bJOIN\s+$/i.test(textBeforeCursor)) return 'JOIN'
        if (/\bSELECT\s+$/i.test(textBeforeCursor)) return 'SELECT'
        if (/\bWHERE\s+$/i.test(textBeforeCursor)) return 'WHERE'
        if (/\bORDER\s+BY\s+$/i.test(textBeforeCursor)) return 'ORDER BY'
        if (/\bGROUP\s+BY\s+$/i.test(textBeforeCursor)) return 'GROUP BY'
        if (/\bHAVING\s+$/i.test(textBeforeCursor)) return 'HAVING'

        return 'OTHER'
    }

    private extractPrefix(textBeforeCursor: string): string {
        const match = textBeforeCursor.match(/[\w.]+$/)
        return match ? match[0].toLowerCase() : ''
    }
}
