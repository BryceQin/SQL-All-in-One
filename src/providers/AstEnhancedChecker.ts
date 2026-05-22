import * as vscode from 'vscode'
import { getParserEngine } from '../parser/SqlParserEngine'
import type { SqlDialect } from '../parser/dialectMapper'
import { walkAst, findNodes, isAstNode } from '../parser/AstVisitor'
import { t } from '../i18n'

interface AstLocation {
    line: number
    column: number
}

interface AstNode {
    type: string
    loc?: {
        start?: AstLocation
        end?: AstLocation
    }
    [key: string]: unknown
}

const RESERVED_WORDS = new Set([
    'select', 'from', 'where', 'group', 'by', 'having', 'order', 'limit',
    'insert', 'update', 'delete', 'create', 'drop', 'alter', 'table',
    'join', 'left', 'right', 'inner', 'outer', 'full', 'on', 'and', 'or',
    'not', 'in', 'is', 'null', 'like', 'between', 'distinct', 'as', 'count',
    'sum', 'avg', 'max', 'min', 'union', 'all', 'any', 'exists', 'case',
    'when', 'then', 'else', 'end', 'default', 'values', 'set',
])

const NO_FROM_FUNCTIONS = new Set([
    'now', 'current_date', 'current_timestamp', 'sysdate', 'uuid', 'getdate', 'current_time',
])

const DATE_FUNCTION_NAMES = new Set(['date_add', 'date_sub', 'now', 'sysdate'])

export class AstEnhancedChecker {
    check(sql: string, dialect: SqlDialect): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []

        const result = getParserEngine().tryAstify(sql, dialect)
        if (!result.success || !result.ast) {
            return diagnostics
        }

        const astList = Array.isArray(result.ast) ? result.ast : [result.ast]

        for (const ast of astList) {
            if (!isAstNode(ast)) {
                continue
            }
            const node = ast as AstNode
            this.processStatement(node, diagnostics)
        }

        return diagnostics
    }

    private processStatement(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        if (node.type === 'select') {
            this.processSelectChain(node, diagnostics)
        } else if (node.type === 'insert') {
            this.checkInsertWithoutColumns(node, diagnostics)
            this.walkForSubStatements(node, diagnostics)
        } else if (node.type === 'update') {
            this.checkWildcardInUpdate(node, diagnostics)
            this.walkForSubStatements(node, diagnostics)
        } else {
            this.walkForSubStatements(node, diagnostics)
        }
    }

    private processSelectChain(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        this.checkSelectNode(node, diagnostics)
        this.walkForSubStatements(node, diagnostics)

        if (isAstNode(node._next)) {
            const next = node._next as AstNode
            if (next.type === 'select') {
                this.processSelectChain(next, diagnostics)
            }
        }
    }

    private checkSelectNode(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        this.checkHavingWithoutGroupBy(node, diagnostics)
        this.checkLimitInvalidValue(node, diagnostics)
        this.checkDuplicateTableAliases(node, diagnostics)
        this.checkReservedWordIdentifiers(node, diagnostics)
        this.checkJoinMissingOn(node, diagnostics)
        this.checkSelectWithoutFrom(node, diagnostics)
        this.checkMisplacedDistinct(node, diagnostics)
        this.checkAggregateInWhere(node, diagnostics)
        this.checkSubqueryWithoutAlias(node, diagnostics)
        this.checkSuspiciousNullComparison(node, diagnostics)
        this.checkIncompleteCase(node, diagnostics)
        this.checkRedundantDistinct(node, diagnostics)
        this.checkDateFunctionUsage(node, diagnostics)
    }

    private walkForSubStatements(root: AstNode, diagnostics: vscode.Diagnostic[]): void {
        walkAst(root, {
            enter: (child) => {
                if (child !== root && isAstNode(child)) {
                    const childNode = child as AstNode
                    if (childNode.type === 'select') {
                        this.checkSelectNode(childNode, diagnostics)
                    } else if (childNode.type === 'insert') {
                        this.checkInsertWithoutColumns(childNode, diagnostics)
                    } else if (childNode.type === 'update') {
                        this.checkWildcardInUpdate(childNode, diagnostics)
                    }
                }
            },
        })
    }

    private checkHavingWithoutGroupBy(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        if (node.having == null) {
            return
        }
        const groupby = node.groupby
        if (groupby == null || (Array.isArray(groupby) && groupby.length === 0)) {
            const loc = this.getNodeLocation(node.having as AstNode) ?? this.getNodeLocation(node)
            if (loc) {
                diagnostics.push(this.createDiagnostic(
                    loc, 6, 'HAVING_WITHOUT_GROUPBY',
                    t('enhanced.havingWithoutGroupBy', String(loc.line)),
                    vscode.DiagnosticSeverity.Warning,
                ))
            }
        }
    }

    private checkLimitInvalidValue(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const limit = node.limit
        if (!isAstNode(limit)) {
            return
        }
        const limitNode = limit as AstNode
        const value = limitNode.value
        if (typeof value === 'number' && value < 0) {
            const loc = this.getNodeLocation(limitNode) ?? this.getNodeLocation(node)
            if (loc) {
                diagnostics.push(this.createDiagnostic(
                    loc, 5, 'LIMIT_WITHOUT_NUMBER',
                    t('enhanced.limitWithoutNumber', String(loc.line)),
                    vscode.DiagnosticSeverity.Error,
                ))
            }
        }
    }

    private checkDuplicateTableAliases(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const from = node.from
        if (!Array.isArray(from)) {
            return
        }

        const aliasMap = new Map<string, AstNode[]>()

        for (const entry of from) {
            if (!isAstNode(entry)) {
                continue
            }
            const fromEntry = entry as AstNode
            const as = fromEntry.as
            if (typeof as === 'string' && as.length > 0) {
                const lower = as.toLowerCase()
                if (!aliasMap.has(lower)) {
                    aliasMap.set(lower, [])
                }
                const existing = aliasMap.get(lower)
                if (existing) {
                    existing.push(fromEntry)
                }
            }
        }

        for (const [, entries] of aliasMap) {
            if (entries.length > 1) {
                for (let i = 1; i < entries.length; i++) {
                    const loc = this.getNodeLocation(entries[i])
                    if (loc) {
                        const alias = (entries[i].as as string).toLowerCase()
                        diagnostics.push(this.createDiagnostic(
                            loc, alias.length, 'DUPLICATE_ALIAS',
                            t('enhanced.duplicateAlias', String(loc.line), alias),
                            vscode.DiagnosticSeverity.Warning,
                        ))
                    }
                }
            }
        }
    }

    private checkReservedWordIdentifiers(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const columns = node.columns
        if (!Array.isArray(columns)) {
            return
        }

        for (const col of columns) {
            if (!isAstNode(col)) {
                continue
            }
            const colNode = col as AstNode
            const as = colNode.as
            if (typeof as === 'string' && RESERVED_WORDS.has(as.toLowerCase())) {
                const loc = this.getNodeLocation(colNode)
                if (loc) {
                    diagnostics.push(this.createDiagnostic(
                        loc, as.length, 'RESERVED_WORD_IDENTIFIER',
                        t('enhanced.reservedWordIdentifier', String(loc.line), as),
                        vscode.DiagnosticSeverity.Warning,
                    ))
                }
            }
        }
    }

    private checkJoinMissingOn(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const from = node.from
        if (!Array.isArray(from)) {
            return
        }

        for (const entry of from) {
            if (!isAstNode(entry)) {
                continue
            }
            const fromEntry = entry as AstNode
            const join = fromEntry.join
            if (typeof join !== 'string') {
                continue
            }
            const joinUpper = join.toUpperCase()
            if (joinUpper.includes('CROSS') || joinUpper.includes('NATURAL')) {
                continue
            }
            if (fromEntry.on == null && fromEntry.using == null) {
                const loc = this.getNodeLocation(fromEntry)
                if (loc) {
                    diagnostics.push(this.createDiagnostic(
                        loc, join.length, 'EMPTY_JOIN',
                        t('enhanced.joinMissingOn', String(loc.line)),
                        vscode.DiagnosticSeverity.Warning,
                    ))
                }
            }
        }
    }

    private checkSelectWithoutFrom(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const from = node.from
        if (from != null && !(Array.isArray(from) && from.length === 0)) {
            return
        }

        if (this.hasNoFromFunction(node)) {
            return
        }

        const loc = this.getNodeLocation(node)
        if (loc) {
            diagnostics.push(this.createDiagnostic(
                loc, 6, 'SELECT_WITHOUT_FROM',
                t('enhanced.selectWithoutFrom', String(loc.line)),
                vscode.DiagnosticSeverity.Warning,
            ))
        }
    }

    private hasNoFromFunction(node: AstNode): boolean {
        const columns = node.columns
        if (!Array.isArray(columns)) {
            return false
        }

        for (const col of columns) {
            if (isAstNode(col)) {
                const colNode = col as AstNode
                if (this.nodeContainsNoFromFunction(colNode)) {
                    return true
                }
            }
        }
        return false
    }

    private nodeContainsNoFromFunction(node: AstNode): boolean {
        if (node.type === 'function') {
            const name = this.getFunctionName(node)
            if (name && NO_FROM_FUNCTIONS.has(name.toLowerCase())) {
                return true
            }
        }
        for (const [, value] of Object.entries(node)) {
            if (value === 'type' || value === 'loc') {
                continue
            }
            if (isAstNode(value) && this.nodeContainsNoFromFunction(value as AstNode)) {
                return true
            }
            if (Array.isArray(value)) {
                for (const item of value) {
                    if (isAstNode(item) && this.nodeContainsNoFromFunction(item as AstNode)) {
                        return true
                    }
                }
            }
        }
        return false
    }

    private getFunctionName(node: AstNode): string | null {
        const name = node.name
        if (typeof name === 'string') {
            return name
        }
        if (isAstNode(name)) {
            const nameNode = name as AstNode
            if (typeof nameNode.value === 'string') {
                return nameNode.value
            }
        }
        return null
    }

    private checkMisplacedDistinct(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const columns = node.columns
        if (!Array.isArray(columns) || columns.length < 2) {
            return
        }

        if (node.distinct != null && node.distinct !== false) {
            return
        }

        for (let i = 1; i < columns.length; i++) {
            const col = columns[i]
            if (!isAstNode(col)) {
                continue
            }
            const colNode = col as AstNode
            if (colNode.distinct === true) {
                const loc = this.getNodeLocation(colNode)
                if (loc) {
                    diagnostics.push(this.createDiagnostic(
                        loc, 8, 'MISPLACED_DISTINCT',
                        t('enhanced.distinctMisplaced', String(loc.line)),
                        vscode.DiagnosticSeverity.Error,
                    ))
                }
            }
        }
    }

    private checkAggregateInWhere(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const where = node.where
        if (where == null || !isAstNode(where)) {
            return
        }

        const aggrNodes = findNodes(where, (n): n is AstNode => {
            return isAstNode(n) && (n as AstNode).type === 'aggr_func'
        })

        for (const aggr of aggrNodes) {
            if (this.isInsideSubquery(aggr, where)) {
                continue
            }
            const loc = this.getNodeLocation(aggr)
            if (loc) {
                const name = typeof aggr.name === 'string' ? aggr.name : 'aggregate'
                diagnostics.push(this.createDiagnostic(
                    loc, name.length, 'AGGREGATE_IN_WHERE',
                    t('enhanced.aggregateInWhere', String(loc.line)),
                    vscode.DiagnosticSeverity.Error,
                ))
            }
        }
    }

    private isInsideSubquery(target: AstNode, root: unknown): boolean {
        const subquerySelects = findNodes(root, (n): n is AstNode => {
            return isAstNode(n) && (n as AstNode).type === 'select'
        })

        for (const subSelect of subquerySelects) {
            if (subSelect === target) {
                continue
            }
            if (this.isDescendantOf(target, subSelect)) {
                return true
            }
        }
        return false
    }

    private isDescendantOf(target: AstNode, ancestor: AstNode): boolean {
        let found = false
        walkAst(ancestor, {
            enter(child) {
                if (child === target) {
                    found = true
                }
            },
        })
        return found && target !== ancestor
    }

    private checkWildcardInUpdate(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        if (node.type !== 'update') {
            return
        }

        const set = node.set
        if (!Array.isArray(set)) {
            return
        }

        for (const item of set) {
            if (!isAstNode(item)) {
                continue
            }
            const setItem = item as AstNode
            if (typeof setItem.column === 'string' && setItem.column === '*') {
                const loc = this.getNodeLocation(setItem)
                if (loc) {
                    diagnostics.push(this.createDiagnostic(
                        loc, 1, 'WILDCARD_IN_UPDATE',
                        t('enhanced.starInUpdate', String(loc.line)),
                        vscode.DiagnosticSeverity.Error,
                    ))
                }
            }
            const value = setItem.value
            if (isAstNode(value)) {
                const starRefs = findNodes(value, (n): n is AstNode => {
                    return isAstNode(n) && (n as AstNode).type === 'column_ref' && (n as AstNode).column === '*'
                })
                for (const ref of starRefs) {
                    const loc = this.getNodeLocation(ref)
                    if (loc) {
                        diagnostics.push(this.createDiagnostic(
                            loc, 1, 'WILDCARD_IN_UPDATE',
                            t('enhanced.starInUpdate', String(loc.line)),
                            vscode.DiagnosticSeverity.Error,
                        ))
                    }
                }
            }
        }
    }

    private checkInsertWithoutColumns(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        if (node.type !== 'insert') {
            return
        }

        const columns = node.columns
        if (columns == null || (Array.isArray(columns) && columns.length === 0)) {
            const loc = this.getNodeLocation(node)
            if (loc) {
                diagnostics.push(this.createDiagnostic(
                    loc, 6, 'INSERT_WITHOUT_COLUMNS',
                    t('enhanced.insertWithoutColumns', String(loc.line)),
                    vscode.DiagnosticSeverity.Warning,
                ))
            }
        }
    }

    private checkIncompleteCase(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const caseNodes = findNodes(node, (n): n is AstNode => {
            return isAstNode(n) && (n as AstNode).type === 'case'
        })

        for (const caseNode of caseNodes) {
            const when = caseNode.when
            if (when == null || (Array.isArray(when) && when.length === 0)) {
                const loc = this.getNodeLocation(caseNode)
                if (loc) {
                    diagnostics.push(this.createDiagnostic(
                        loc, 4, 'INCOMPLETE_CASE',
                        t('enhanced.caseMissingEnd', String(loc.line)),
                        vscode.DiagnosticSeverity.Error,
                    ))
                }
            }
        }
    }

    private checkRedundantDistinct(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const aggrNodes = findNodes(node, (n): n is AstNode => {
            return isAstNode(n) && (n as AstNode).type === 'aggr_func'
        })

        for (const aggr of aggrNodes) {
            if (aggr.name !== 'count' || aggr.distinct !== true) {
                continue
            }
            const args = aggr.args
            if (this.argsContainStar(args)) {
                const loc = this.getNodeLocation(aggr)
                if (loc) {
                    diagnostics.push(this.createDiagnostic(
                        loc, 5, 'REDUNDANT_DISTINCT',
                        t('enhanced.countDistinctStar', String(loc.line)),
                        vscode.DiagnosticSeverity.Warning,
                    ))
                }
            }
        }
    }

    private argsContainStar(args: unknown): boolean {
        if (isAstNode(args)) {
            const argsNode = args as AstNode
            if (argsNode.type === 'column_ref' && argsNode.column === '*') {
                return true
            }
            if (argsNode.type === 'star' || argsNode.type === 'all_columns') {
                return true
            }
            for (const [, value] of Object.entries(argsNode)) {
                if (value === 'type' || value === 'loc') {
                    continue
                }
                if (isAstNode(value) && this.argsContainStar(value)) {
                    return true
                }
                if (Array.isArray(value)) {
                    for (const item of value) {
                        if (this.argsContainStar(item)) {
                            return true
                        }
                    }
                }
            }
        }
        if (Array.isArray(args)) {
            for (const item of args) {
                if (this.argsContainStar(item)) {
                    return true
                }
            }
        }
        return false
    }

    private checkSubqueryWithoutAlias(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const from = node.from
        if (!Array.isArray(from)) {
            return
        }

        for (const entry of from) {
            if (!isAstNode(entry)) {
                continue
            }
            const fromEntry = entry as AstNode
            const expr = fromEntry.expr
            if (isAstNode(expr) && (expr as AstNode).type === 'select') {
                const as = fromEntry.as
                if (as == null || (typeof as === 'string' && as.length === 0)) {
                    const loc = this.getNodeLocation(fromEntry)
                    if (loc) {
                        diagnostics.push(this.createDiagnostic(
                            loc, 4, 'SUBQUERY_WITHOUT_ALIAS',
                            t('enhanced.subqueryMissingAlias', String(loc.line)),
                            vscode.DiagnosticSeverity.Warning,
                        ))
                    }
                }
            }
        }
    }

    private checkSuspiciousNullComparison(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const binaryNodes = findNodes(node, (n): n is AstNode => {
            return isAstNode(n) && (n as AstNode).type === 'binary_expr'
        })

        for (const binary of binaryNodes) {
            const op = binary.operator
            if (op !== '=' && op !== '!=' && op !== '<>') {
                continue
            }
            const right = binary.right
            if (isAstNode(right) && (right as AstNode).type === 'null') {
                const loc = this.getNodeLocation(binary)
                if (loc) {
                    const suggestion = op === '=' ? 'IS NULL' : 'IS NOT NULL'
                    diagnostics.push(this.createDiagnostic(
                        loc, 4, 'SUSPICIOUS_NULL_COMPARISON',
                        t('enhanced.nullComparison', String(loc.line), suggestion, op),
                        vscode.DiagnosticSeverity.Warning,
                    ))
                }
            }
        }
    }

    private checkDateFunctionUsage(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const funcNodes = findNodes(node, (n): n is AstNode => {
            return isAstNode(n) && (n as AstNode).type === 'function'
        })

        for (const func of funcNodes) {
            const name = this.getFunctionName(func)
            if (name && DATE_FUNCTION_NAMES.has(name.toLowerCase())) {
                const loc = this.getNodeLocation(func)
                if (loc) {
                    diagnostics.push(this.createDiagnostic(
                        loc, name.length, 'DATE_FUNCTION_HINT',
                        t('enhanced.dateFunctionHint', name),
                        vscode.DiagnosticSeverity.Information,
                    ))
                }
            }
        }
    }

    private createDiagnostic(
        loc: AstLocation,
        length: number,
        code: string,
        message: string,
        severity: vscode.DiagnosticSeverity,
    ): vscode.Diagnostic {
        const diagnostic = new vscode.Diagnostic(
            new vscode.Range(loc.line - 1, loc.column - 1, loc.line - 1, loc.column - 1 + length),
            message,
            severity,
        )
        diagnostic.source = 'Hive Formatter'
        diagnostic.code = code
        return diagnostic
    }

    private getNodeLocation(node: AstNode): AstLocation | null {
        const loc = (node as any).loc
        if (loc?.start?.line !== undefined && loc?.start?.column !== undefined) {
            return {
                line: loc.start.line as number,
                column: loc.start.column as number,
            }
        }
        return null
    }
}
