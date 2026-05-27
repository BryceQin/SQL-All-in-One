import * as vscode from 'vscode'
import type { AstNavigator, SymbolIndex } from './AstNavigator'
import { getNavigationContext } from './guard'
import { toSqlDialect } from '../core/sqlDialects'
import { getReservedWordSet } from '../languages/keywords/reservedWords'

export class SqlRenameProvider implements vscode.RenameProvider {
    constructor(private navigator: AstNavigator) {}

    prepareRename(
        document: vscode.TextDocument,
        position: vscode.Position,
        _token: vscode.CancellationToken,
    ): vscode.Range | null {
        try {
            const ctx = getNavigationContext(document, position, this.navigator)
            if (!ctx) return null

            if (!this.navigator.hasDefinition(ctx.word, ctx.index)) return null

            const range = document.getWordRangeAtPosition(position)
            if (!range) return null
            return range
        } catch {
            return null
        }
    }

    provideRenameEdits(
        document: vscode.TextDocument,
        position: vscode.Position,
        newName: string,
        _token: vscode.CancellationToken,
    ): vscode.WorkspaceEdit | null {
        const ctx = getNavigationContext(document, position, this.navigator)
        if (!ctx) return null

        if (ctx.word === newName) return null

        const symbolType = this.navigator.detectSymbolType(ctx.word, ctx.index)
        if (!symbolType) return null

        const validationError = this.validateNewName(newName, ctx.word, ctx.index, document.languageId)
        if (validationError) throw new Error(validationError)

        const defLocation = this.navigator.getDefinition(ctx.word, ctx.index)
        const refs = this.navigator.findReferences(ctx.ast, ctx.word, document, symbolType)

        const edit = new vscode.WorkspaceEdit()
        if (defLocation) {
            edit.replace(document.uri, defLocation.range, newName)
        }
        for (const ref of refs) {
            if (ref.location.uri.toString() === document.uri.toString()) {
                edit.replace(document.uri, ref.location.range, newName)
            }
        }

        return edit
    }

    private validateNewName(newName: string, oldName: string, index: SymbolIndex, languageId: string): string | null {
        const dialect = toSqlDialect(languageId)
        const reservedWords = getReservedWordSet(dialect)
        if (reservedWords.has(newName.toUpperCase())) {
            return `'${newName}' 是 SQL 保留字，不能用作标识符`
        }

        const nameLower = newName.toLowerCase()
        if (index.cteDefinitions.has(nameLower) && nameLower !== oldName.toLowerCase()) {
            return `名称 '${newName}' 已被使用`
        }
        if (index.tableAliasDefinitions.has(nameLower) && nameLower !== oldName.toLowerCase()) {
            return `名称 '${newName}' 已被使用`
        }
        if (index.columnAliasDefinitions.has(nameLower) && nameLower !== oldName.toLowerCase()) {
            return `名称 '${newName}' 已被使用`
        }

        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(newName)) {
            return '名称只能包含字母、数字和下划线，且不能以数字开头'
        }

        return null
    }
}
