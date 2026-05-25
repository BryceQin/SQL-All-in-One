import * as vscode from 'vscode'
import { t } from '../i18n'
import { getParserEngine } from '../parser/SqlParserEngine'
import { toSqlDialect } from '../core/sqlDialects'
import { isAstNode } from '../parser/AstVisitor'
import { getNodeLocation, getStatementEndLocation } from '../parser/astUtils'
import type { AstNode } from '../parser/astTypes'

export class SqlOutlineProvider implements vscode.DocumentSymbolProvider {
    provideDocumentSymbols(
        document: vscode.TextDocument,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.SymbolInformation[] | vscode.DocumentSymbol[]> {
        const text = document.getText()
        const dialect = toSqlDialect(document.languageId)

        const result = getParserEngine().tryAstify(text, dialect)
        if (result.success && result.ast) {
            try {
                return this.provideDocumentSymbolsFromAst(document, result.ast)
            } catch {
                // AST parsing succeeded but symbol extraction failed, fall back to regex
            }
        }

        return this.provideDocumentSymbolsFallback(document)
    }

    private provideDocumentSymbolsFromAst(
        document: vscode.TextDocument,
        ast: unknown[] | unknown
    ): vscode.DocumentSymbol[] {
        const symbols: vscode.DocumentSymbol[] = []
        const astList = Array.isArray(ast) ? ast : [ast]

        for (const stmt of astList) {
            if (!isAstNode(stmt)) continue
            const node = stmt as AstNode
            const symbol = this.processAstStatement(document, node)
            if (symbol) {
                symbols.push(symbol)
            }
        }

        return symbols
    }

    private processAstStatement(
        document: vscode.TextDocument,
        node: AstNode
    ): vscode.DocumentSymbol | null {
        const type = node.type

        if (type === 'select') {
            return this.processSelectStatement(document, node)
        }

        if (type === 'insert') {
            return this.processInsertStatement(document, node)
        }

        if (type === 'update') {
            return this.processUpdateStatement(document, node)
        }

        if (type === 'delete') {
            return this.processDeleteStatement(document, node)
        }

        if (type === 'create') {
            return this.processCreateStatement(document, node)
        }

        return null
    }

    private processSelectStatement(
        document: vscode.TextDocument,
        node: AstNode
    ): vscode.DocumentSymbol | null {
        // Extract table name from FROM clause
        const tableName = this.extractTableNameFromFrom(node)
        const name = tableName ? `SELECT - ${tableName}` : 'SELECT'

        const symbol = this.createSymbolFromAst(document, name, t('outline.query'), vscode.SymbolKind.Event, node)
        if (!symbol) return null

        // Handle WITH/CTE clause
        const withClause = node.with
        if (withClause) {
            const withSymbol = this.processWithClause(document, withClause)
            if (withSymbol) {
                // Add WITH symbol as a child of the SELECT symbol
                symbol.children.push(withSymbol)
            }
        }

        // Process _next chain (UNION queries)
        this.processSelectChain(document, node, symbol.children)

        return symbol
    }

    private processSelectChain(
        document: vscode.TextDocument,
        node: AstNode,
        siblings: vscode.DocumentSymbol[]
    ): void {
        const next = node._next
        if (next != null && isAstNode(next)) {
            const nextNode = next as AstNode
            if (nextNode.type === 'select') {
                const tableName = this.extractTableNameFromFrom(nextNode)
                const name = tableName ? `SELECT - ${tableName}` : 'SELECT (UNION)'
                const unionSymbol = this.createSymbolFromAst(document, name, t('outline.query'), vscode.SymbolKind.Event, nextNode)
                if (unionSymbol) {
                    siblings.push(unionSymbol)
                }
                // Recursively process further UNION
                this.processSelectChain(document, nextNode, siblings)
            }
        }
    }

    private processWithClause(
        document: vscode.TextDocument,
        withClause: unknown
    ): vscode.DocumentSymbol | null {
        let cteItems: unknown[] = []

        if (isAstNode(withClause) && (withClause as AstNode).type === 'with') {
            const withNode = withClause as AstNode
            const value = withNode.value
            if (Array.isArray(value)) {
                cteItems = value
            }
        } else if (Array.isArray(withClause)) {
            cteItems = withClause
        }

        if (cteItems.length === 0) return null

        const cteSymbols: vscode.DocumentSymbol[] = []
        for (const item of cteItems) {
            if (item == null || typeof item !== 'object') continue
            const itemNode = item as Record<string, unknown>
            const cteName = this.extractCteName(itemNode)
            if (cteName && isAstNode(item)) {
                const cteSymbol = this.createSymbolFromAst(
                    document,
                    cteName,
                    'CTE',
                    vscode.SymbolKind.Constant,
                    item as AstNode
                )
                if (cteSymbol) {
                    cteSymbols.push(cteSymbol)
                }
            }
        }

        if (cteSymbols.length === 0) return null

        // Create the WITH clause parent symbol
        // Use the first CTE's location start and last CTE's location end for the WITH range
        const firstCte = cteItems[0]
        const lastCte = cteItems[cteItems.length - 1]
        if (!isAstNode(firstCte) || !isAstNode(lastCte)) return null

        const startLoc = getNodeLocation(firstCte as AstNode)
        const endLoc = getStatementEndLocation(lastCte as AstNode)
        if (!startLoc) return null

        const startPos = new vscode.Position(startLoc.line - 1, startLoc.column - 1)
        const endPos = endLoc
            ? new vscode.Position(endLoc.line - 1, endLoc.column - 1)
            : startPos

        const range = new vscode.Range(startPos, endPos)
        const withSymbol = new vscode.DocumentSymbol(
            t('outline.withClause'),
            t('outline.cte'),
            vscode.SymbolKind.Namespace,
            range,
            range
        )
        withSymbol.children = cteSymbols

        return withSymbol
    }

    private extractCteName(item: Record<string, unknown>): string | null {
        const name = item.name
        if (typeof name === 'string' && name.length > 0) {
            return name
        }
        if (name != null && typeof name === 'object') {
            const nameObj = name as Record<string, unknown>
            if (typeof nameObj.value === 'string' && nameObj.value.length > 0) {
                return nameObj.value
            }
        }
        return null
    }

    private processInsertStatement(
        document: vscode.TextDocument,
        node: AstNode
    ): vscode.DocumentSymbol | null {
        const tableName = this.extractTableNameFromTable(node)
        const name = tableName ? `INSERT - ${tableName}` : 'INSERT'
        return this.createSymbolFromAst(document, name, t('outline.query'), vscode.SymbolKind.Event, node)
    }

    private processUpdateStatement(
        document: vscode.TextDocument,
        node: AstNode
    ): vscode.DocumentSymbol | null {
        const tableName = this.extractTableNameFromTable(node)
        const name = tableName ? `UPDATE - ${tableName}` : 'UPDATE'
        return this.createSymbolFromAst(document, name, t('outline.query'), vscode.SymbolKind.Event, node)
    }

    private processDeleteStatement(
        document: vscode.TextDocument,
        node: AstNode
    ): vscode.DocumentSymbol | null {
        const tableName = this.extractTableNameFromFrom(node)
        const name = tableName ? `DELETE - ${tableName}` : 'DELETE'
        return this.createSymbolFromAst(document, name, t('outline.query'), vscode.SymbolKind.Event, node)
    }

    private processCreateStatement(
        document: vscode.TextDocument,
        node: AstNode
    ): vscode.DocumentSymbol | null {
        const keyword = node.keyword
        if (typeof keyword !== 'string') return null

        const tableName = this.extractCreateTableName(node)

        if (keyword === 'table') {
            const name = tableName || 'TABLE'
            return this.createSymbolFromAst(document, name, t('outline.table'), vscode.SymbolKind.Struct, node)
        }

        if (keyword === 'view') {
            const name = tableName || 'VIEW'
            return this.createSymbolFromAst(document, name, t('outline.view'), vscode.SymbolKind.Interface, node)
        }

        if (keyword === 'function') {
            const name = tableName || 'FUNCTION'
            return this.createSymbolFromAst(document, name, t('outline.function'), vscode.SymbolKind.Function, node)
        }

        if (keyword === 'procedure') {
            const name = tableName || 'PROCEDURE'
            return this.createSymbolFromAst(document, name, t('outline.procedure'), vscode.SymbolKind.Method, node)
        }

        return null
    }

    private extractTableNameFromFrom(node: AstNode): string | null {
        const from = node.from
        if (!Array.isArray(from) || from.length === 0) return null

        const first = from[0]
        if (first == null || typeof first !== 'object') return null
        const fromEntry = first as Record<string, unknown>

        // Try table property
        const table = fromEntry.table
        if (typeof table === 'string' && table.length > 0) {
            return table
        }
        // Try as property (alias)
        const as = fromEntry.as
        if (typeof as === 'string' && as.length > 0) {
            return as
        }
        // table could be an object with value
        if (table != null && typeof table === 'object') {
            const tableObj = table as Record<string, unknown>
            if (typeof tableObj.value === 'string' && tableObj.value.length > 0) {
                return tableObj.value
            }
        }

        return null
    }

    private extractTableNameFromTable(node: AstNode): string | null {
        const table = node.table
        if (!Array.isArray(table) || table.length === 0) {
            // table might be a single object, not an array
            if (table != null && typeof table === 'object' && !Array.isArray(table)) {
                return this.extractNameFromTableObj(table as Record<string, unknown>)
            }
            if (typeof table === 'string' && table.length > 0) {
                return table
            }
            return null
        }

        const first = table[0]
        if (first == null || typeof first !== 'object') return null
        return this.extractNameFromTableObj(first as Record<string, unknown>)
    }

    private extractNameFromTableObj(tableObj: Record<string, unknown>): string | null {
        const table = tableObj.table
        if (typeof table === 'string' && table.length > 0) {
            return table
        }
        if (table != null && typeof table === 'object') {
            const tableSub = table as Record<string, unknown>
            if (typeof tableSub.value === 'string' && tableSub.value.length > 0) {
                return tableSub.value
            }
        }
        return null
    }

    private extractCreateTableName(node: AstNode): string | null {
        const table = node.table
        if (table == null) return null

        // table can be an array or a single object
        if (Array.isArray(table)) {
            if (table.length === 0) return null
            return this.extractNameFromTableObj(table[0] as Record<string, unknown>)
        }

        if (typeof table === 'string') {
            return table
        }

        if (typeof table === 'object') {
            return this.extractNameFromTableObj(table as Record<string, unknown>)
        }

        return null
    }

    private createSymbolFromAst(
        document: vscode.TextDocument,
        name: string,
        detail: string,
        kind: vscode.SymbolKind,
        node: AstNode,
    ): vscode.DocumentSymbol | null {
        const startLoc = getNodeLocation(node)
        const endLoc = getStatementEndLocation(node)
        if (!startLoc) return null

        const startPos = new vscode.Position(startLoc.line - 1, startLoc.column - 1)
        const endPos = endLoc
            ? new vscode.Position(endLoc.line - 1, endLoc.column - 1)
            : startPos

        const range = new vscode.Range(startPos, endPos)
        return new vscode.DocumentSymbol(name, detail, kind, range, range)
    }

    // ===== Fallback: regex-based approach (kept for when AST parsing fails) =====

    private provideDocumentSymbolsFallback(
        document: vscode.TextDocument
    ): vscode.DocumentSymbol[] {
        const symbols: vscode.DocumentSymbol[] = []
        const text = document.getText()
        const lines = text.split('\n')

        // 正则表达式
        const cteRegex = /^\s*(\w+)\s+AS\s*\(/i
        const selectRegex = /^\s*(SELECT)\b/i
        const insertRegex = /^\s*(INSERT)\b/i
        const updateRegex = /^\s*(UPDATE)\b/i
        const deleteRegex = /^\s*(DELETE)\b/i
        const createTableRegex = /^\s*(CREATE\s+TABLE)\s+(?:\w+\.)?(\w+)/i
        const createViewRegex = /^\s*(CREATE\s+VIEW)\s+(?:\w+\.)?(\w+)/i
        const createFunctionRegex = /^\s*(CREATE\s+FUNCTION)\s+(?:\w+\.)?(\w+)/i
        const createProcedureRegex = /^\s*(CREATE\s+PROCEDURE)\s+(?:\w+\.)?(\w+)/i
        const withRegex = /^\s*WITH\s+/i

        // 跟踪当前 WITH 块
        let inWithBlock = false
        let withStartLine = -1
        const cteSymbols: vscode.DocumentSymbol[] = []

        for (let lineNum = 0; lineNum < lines.length; lineNum++) {
            const line = lines[lineNum]

            // 检查 WITH 块开始
            if (withRegex.test(line)) {
                inWithBlock = true
                withStartLine = lineNum
            }

            // 在 WITH 块中检查 CTE
            if (inWithBlock) {
                const cteMatch = line.match(cteRegex)
                if (cteMatch) {
                    const cteName = cteMatch[1]
                    const cteSymbol = this.createSymbolFallback(
                        document,
                        cteName,
                        'CTE',
                        vscode.SymbolKind.Constant,
                        lineNum,
                        lineNum
                    )
                    cteSymbols.push(cteSymbol)
                }

                // 检查 WITH 块结束
                const isMainQuery = /^\s*(SELECT|INSERT|UPDATE|DELETE|MERGE)\b/i.test(line)
                if (isMainQuery && withStartLine >= 0) {
                    if (cteSymbols.length > 0) {
                        const withSymbol = this.createSymbolFallback(
                            document,
                            t('outline.withClause'),
                            t('outline.cte'),
                            vscode.SymbolKind.Namespace,
                            withStartLine,
                            lineNum - 1
                        )
                        withSymbol.children = cteSymbols
                        symbols.push(withSymbol)
                    }
                    inWithBlock = false
                    withStartLine = -1
                    // 清空 CTE 列表，它们已被添加到 WITH 块中
                    cteSymbols.length = 0
                }
            }

            // 检查主查询语句
            if (selectRegex.test(line)) {
                const symbol = this.createQuerySymbolFallback(document, 'SELECT', lineNum, lines)
                symbols.push(symbol)
            } else if (insertRegex.test(line)) {
                const symbol = this.createQuerySymbolFallback(document, 'INSERT', lineNum, lines)
                symbols.push(symbol)
            } else if (updateRegex.test(line)) {
                const symbol = this.createQuerySymbolFallback(document, 'UPDATE', lineNum, lines)
                symbols.push(symbol)
            } else if (deleteRegex.test(line)) {
                const symbol = this.createQuerySymbolFallback(document, 'DELETE', lineNum, lines)
                symbols.push(symbol)
            }

            // 检查 CREATE 语句
            const createTableMatch = line.match(createTableRegex)
            if (createTableMatch) {
                const symbol = this.createSymbolFallback(
                    document,
                    createTableMatch[2],
                    t('outline.table'),
                    vscode.SymbolKind.Struct,
                    lineNum,
                    this.findEndOfBlock(lineNum, lines)
                )
                symbols.push(symbol)
            }

            const createViewMatch = line.match(createViewRegex)
            if (createViewMatch) {
                const symbol = this.createSymbolFallback(
                    document,
                    createViewMatch[2],
                    t('outline.view'),
                    vscode.SymbolKind.Interface,
                    lineNum,
                    this.findEndOfBlock(lineNum, lines)
                )
                symbols.push(symbol)
            }

            const createFunctionMatch = line.match(createFunctionRegex)
            if (createFunctionMatch) {
                const symbol = this.createSymbolFallback(
                    document,
                    createFunctionMatch[2],
                    t('outline.function'),
                    vscode.SymbolKind.Function,
                    lineNum,
                    this.findEndOfBlock(lineNum, lines)
                )
                symbols.push(symbol)
            }

            const createProcedureMatch = line.match(createProcedureRegex)
            if (createProcedureMatch) {
                const symbol = this.createSymbolFallback(
                    document,
                    createProcedureMatch[2],
                    t('outline.procedure'),
                    vscode.SymbolKind.Method,
                    lineNum,
                    this.findEndOfBlock(lineNum, lines)
                )
                symbols.push(symbol)
            }
        }

        // 处理文件末尾的 WITH 块
        if (inWithBlock && withStartLine >= 0 && cteSymbols.length > 0) {
            const withSymbol = this.createSymbolFallback(
                document,
                t('outline.withClause'),
                t('outline.cte'),
                vscode.SymbolKind.Namespace,
                withStartLine,
                lines.length - 1
            )
            withSymbol.children = cteSymbols
            symbols.push(withSymbol)
        }

        return symbols
    }

    private createSymbolFallback(
        document: vscode.TextDocument,
        name: string,
        detail: string,
        kind: vscode.SymbolKind,
        startLine: number,
        endLine: number
    ): vscode.DocumentSymbol {
        const startPos = new vscode.Position(startLine, 0)
        const endPos = new vscode.Position(endLine, document.lineAt(endLine).text.length)
        const range = new vscode.Range(startPos, endPos)

        return new vscode.DocumentSymbol(
            name,
            detail,
            kind,
            range,
            range
        )
    }

    private createQuerySymbolFallback(
        document: vscode.TextDocument,
        type: string,
        startLine: number,
        lines: string[]
    ): vscode.DocumentSymbol {
        let endLine = startLine
        let openParens = 0

        // 找到查询的结束（通常在下一个查询、CREATE 语句或文件末尾）
        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i]

            // 统计括号
            openParens += (line.match(/\(/g) || []).length
            openParens -= (line.match(/\)/g) || []).length

            // 检查是否是查询结束
            const isNewStatement = /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|MERGE)\b/i.test(line)
            const isEndWithSemicolon = line.includes(';')

            if (i > startLine && (isNewStatement || (isEndWithSemicolon && openParens <= 0))) {
                endLine = i
                if (isEndWithSemicolon && !isNewStatement) {
                    endLine = i
                } else {
                    endLine = i - 1
                }
                break
            }

            // 如果到文件末尾了
            if (i === lines.length - 1) {
                endLine = i
            }
        }

        // 尝试获取表名或更有意义的名称
        let name = type
        const firstLine = lines[startLine]
        const fromMatch = firstLine.match(/FROM\s+(\w+)/i)
        const intoMatch = firstLine.match(/INTO\s+(\w+)/i)

        if (fromMatch) {
            name = `${type} - ${fromMatch[1]}`
        } else if (intoMatch) {
            name = `${type} - ${intoMatch[1]}`
        }

        return this.createSymbolFallback(
            document,
            name,
            t('outline.query'),
            vscode.SymbolKind.Event,
            startLine,
            endLine
        )
    }

    private findEndOfBlock(startLine: number, lines: string[]): number {
        let openParens = 0
        let endLine = startLine

        for (let i = startLine; i < lines.length; i++) {
            const line = lines[i]

            openParens += (line.match(/\(/g) || []).length
            openParens -= (line.match(/\)/g) || []).length

            // 如果找到分号且括号平衡
            if (line.includes(';') && openParens <= 0) {
                endLine = i
                break
            }

            // 如果是新的语句开始
            if (i > startLine && /^\s*(CREATE|ALTER|DROP|SELECT|INSERT|UPDATE|DELETE)\b/i.test(line) && openParens <= 0) {
                endLine = i - 1
                break
            }

            endLine = i
        }

        return endLine
    }
}
