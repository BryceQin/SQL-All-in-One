import * as vscode from 'vscode'
import type { SqlLanguage } from '../formatter/sqlFormatter'
import type { HoverResolver } from './HoverResolver'
import { SchemaProvider } from '../database/schema/SchemaProvider'
import { ConnectionManager } from '../database/connection/ConnectionManager'
import { sqlDialects } from '../core/sqlDialects'
import { getParserEngine } from '../parser/SqlParserEngine'
import type { SqlDialect } from '../parser/dialectMapper'
import { isAstNode } from '../parser/AstVisitor'
import type { AstNode } from '../parser/astTypes'
import { extractTableNames } from '../completion/AstCompletionProvider'

export class SchemaHoverResolver implements HoverResolver {
    private schemaProvider: SchemaProvider

    constructor() {
        this.schemaProvider = SchemaProvider.getInstance()
    }

    async resolve(
        word: string,
        dialect: SqlLanguage,
        document: vscode.TextDocument,
        position: vscode.Position,
    ): Promise<vscode.Hover | null> {
        const connectionManager = ConnectionManager.getInstance()
        const activeConn = connectionManager.getActiveConnection()
        if (!activeConn) return null

        const adapter = connectionManager.getAdapter(activeConn.id)
        if (!adapter || !adapter.isConnected()) return null

        const database = activeConn.database || ''
        const dialectName = sqlDialects[document.languageId as keyof typeof sqlDialects] || 'mysql'

        const tableName = this.findTableNameAtPosition(document, position, word, dialectName as SqlDialect)

        if (tableName) {
            const hoverInfo = await this.schemaProvider.getTableHoverInfo(tableName, database)
            if (hoverInfo) {
                const range = document.getWordRangeAtPosition(position) || new vscode.Range(position, position)
                return new vscode.Hover(hoverInfo, range)
            }
        }

        if (tableName) {
            const hoverInfo = await this.schemaProvider.getColumnHoverInfo(word, tableName, database)
            if (hoverInfo) {
                const range = document.getWordRangeAtPosition(position) || new vscode.Range(position, position)
                return new vscode.Hover(hoverInfo, range)
            }
        }

        const tables = await this.findTablesForColumnLookup(document, position, dialectName as SqlDialect)
        for (const tbl of tables) {
            const hoverInfo = await this.schemaProvider.getColumnHoverInfo(word, tbl, database)
            if (hoverInfo) {
                const range = document.getWordRangeAtPosition(position) || new vscode.Range(position, position)
                return new vscode.Hover(hoverInfo, range)
            }
        }

        return null
    }

    private findTableNameAtPosition(
        document: vscode.TextDocument,
        position: vscode.Position,
        word: string,
        dialect: SqlDialect,
    ): string | null {
        const sql = document.getText()
        const result = getParserEngine().tryAstify(sql, dialect)
        if (!result.success || !result.ast) return null

        const astList = Array.isArray(result.ast) ? result.ast : [result.ast]
        for (const ast of astList) {
            if (!isAstNode(ast)) continue
            const node = ast as AstNode
            if (node.type === 'select' && Array.isArray(node.from)) {
                for (const entry of node.from) {
                    if (entry == null || typeof entry !== 'object') continue
                    const fromEntry = entry as Record<string, unknown>
                    const table = fromEntry.table
                    if (typeof table === 'string' && table.toLowerCase() === word.toLowerCase()) {
                        return table
                    }
                }
            }
        }
        return null
    }

    private async findTablesForColumnLookup(
        document: vscode.TextDocument,
        position: vscode.Position,
        dialect: SqlDialect,
    ): Promise<string[]> {
        const sql = document.getText()
        const aliasMap = this.schemaProvider.parseAliasMap(sql, dialect)

        const lineText = document.lineAt(position.line).text
        const textBeforeCursor = lineText.substring(0, position.character)
        const dotMatch = textBeforeCursor.match(/(\w+)\.\w*$/)
        if (dotMatch) {
            const alias = dotMatch[1]
            const tableName = this.schemaProvider.resolveAlias(alias, aliasMap)
            if (tableName) return [tableName]
        }

        const tables = extractTableNames(sql, dialect)
        return tables
    }
}
