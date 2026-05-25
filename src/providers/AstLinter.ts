import * as vscode from 'vscode'
import { walkAst, findNodes, findNodesOfType, isAstNode } from '../parser/AstVisitor'
import { t } from '../i18n'
import type { AstLocation, AstNode } from '../parser/astTypes'
import { getNodeLocation, getStatementEndLocation, getFunctionName, getColumnLoc, getLocFromAny, createDiagnostic, resolveAstList } from '../parser/astUtils'
import { loadRuleConfigs, type LintRuleConfig } from '../linter/lintRules'
import type { SqlDialect } from '../parser/dialectMapper'

const ISNULL_FUNCTION_NAMES = new Set(['ifnull', 'isnull'])

const CURRENT_TIMESTAMP_FUNCTION_NAMES = new Set(['now', 'sysdate', 'getdate', 'current_date'])

const SQL_KEYWORDS_FOR_COMMENT_CHECK = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'GROUP BY', 'ORDER BY', 'HAVING', 'UNION']
const SQL_KEYWORD_REGEXES = SQL_KEYWORDS_FOR_COMMENT_CHECK.map(kw => ({
    regex: new RegExp(`\\b${kw}\\b`, 'i'),
    keyword: kw,
}))

export class AstLinter {
    private config = new Map<string, LintRuleConfig>()

    constructor() {
        this.config = loadRuleConfigs()
    }

    private isRuleEnabled(ruleId: string): boolean {
        return this.config.get(ruleId)?.enabled ?? false
    }

    private getRuleSeverity(ruleId: string): vscode.DiagnosticSeverity {
        return this.config.get(ruleId)?.severity ?? vscode.DiagnosticSeverity.Warning
    }

    lint(sql: string, dialect: SqlDialect, document?: vscode.TextDocument, preParsedAst?: unknown[]): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const astList = resolveAstList(sql, dialect, preParsedAst)

        for (const ast of astList) {
            if (!isAstNode(ast)) {
                continue
            }
            const node = ast as AstNode
            this.processStatement(node, sql, diagnostics, document)
        }

        if (this.isRuleEnabled('commented_out_code')) {
            this.checkCommentedOutCode(sql, diagnostics)
        }
        if (this.isRuleEnabled('expired_todo')) {
            this.checkExpiredTodo(sql, diagnostics)
        }

        return diagnostics
    }

    private processStatement(node: AstNode, sql: string, diagnostics: vscode.Diagnostic[], document?: vscode.TextDocument): void {
        if (node.type === 'select') {
            this.processSelectChain(node, sql, diagnostics, document)
        } else if (node.type === 'insert') {
            this.checkInsertRules(node, diagnostics)
            this.walkForSubStatements(node, sql, diagnostics, document)
        } else if (node.type === 'create') {
            this.checkCreateRules(node, diagnostics)
            this.walkForSubStatements(node, sql, diagnostics, document)
        } else {
            this.walkForSubStatements(node, sql, diagnostics, document)
        }
    }

    private processSelectChain(node: AstNode, sql: string, diagnostics: vscode.Diagnostic[], document?: vscode.TextDocument): void {
        this.checkSelectRules(node, sql, diagnostics, document)
        this.walkForSubStatements(node, sql, diagnostics, document)

        if (isAstNode(node._next)) {
            const next = node._next as AstNode
            if (next.type === 'select') {
                this.processSelectChain(next, sql, diagnostics, document)
            }
        }
    }

    private checkSelectRules(node: AstNode, sql: string, diagnostics: vscode.Diagnostic[], document?: vscode.TextDocument): void {
        if (this.isRuleEnabled('avoid_select_star')) {
            this.checkAvoidSelectStar(node, diagnostics)
        }
        if (this.isRuleEnabled('explicit_join_type')) {
            this.checkExplicitJoinType(node, diagnostics)
        }
        if (this.isRuleEnabled('limit_with_order_by')) {
            this.checkLimitWithOrderBy(node, diagnostics)
        }
        if (this.isRuleEnabled('duplicate_column_aliases')) {
            this.checkDuplicateColumnAliases(node, diagnostics)
        }
        if (this.isRuleEnabled('use_coalesce_over_isnull')) {
            this.checkUseCoalesceOverIsNull(node, diagnostics)
        }
        if (this.isRuleEnabled('use_current_timestamp')) {
            this.checkUseCurrentTimestamp(node, diagnostics)
        }
        if (this.isRuleEnabled('avoid_correlated_subqueries')) {
            this.checkAvoidCorrelatedSubqueries(node, diagnostics)
        }
        if (this.isRuleEnabled('missing_query_comment')) {
            this.checkMissingQueryComment(node, sql, diagnostics, document)
        }
    }

    private checkInsertRules(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        if (this.isRuleEnabled('avoid_column_count_mismatch')) {
            this.checkColumnCountMismatch(node, diagnostics)
        }
        if (this.isRuleEnabled('avoid_select_in_insert')) {
            this.checkSelectInInsert(node, diagnostics)
        }
    }

    private checkCreateRules(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        if (this.isRuleEnabled('missing_primary_key')) {
            this.checkMissingPrimaryKey(node, diagnostics)
        }
        if (this.isRuleEnabled('missing_column_comment')) {
            this.checkMissingColumnComment(node, diagnostics)
        }
    }

    private walkForSubStatements(root: AstNode, sql: string, diagnostics: vscode.Diagnostic[], document?: vscode.TextDocument): void {
        walkAst(root, {
            enter: (child) => {
                if (child !== root && isAstNode(child)) {
                    const childNode = child as AstNode
                    if (childNode.type === 'select') {
                        this.checkSelectRules(childNode, sql, diagnostics, document)
                    } else if (childNode.type === 'insert') {
                        this.checkInsertRules(childNode, diagnostics)
                    } else if (childNode.type === 'create') {
                        this.checkCreateRules(childNode, diagnostics)
                    }
                }
            },
        })
    }

    private checkAvoidSelectStar(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const columns = node.columns
        if (!Array.isArray(columns)) {
            return
        }

        for (const col of columns) {
            if (col == null || typeof col !== 'object') {
                continue
            }
            const colObj = col as Record<string, unknown>

            if (isAstNode(col)) {
                const colNode = col as AstNode
                if (colNode.type === 'column_ref' && colNode.column === '*') {
                    const loc = getNodeLocation(colNode)
                    if (loc) {
                        const severity = this.getRuleSeverity('avoid_select_star')
                        diagnostics.push(createDiagnostic(loc, 1, 'avoid_select_star', `【第 ${loc.line} 行】${t('linter.avoidSelectStar.description')}`, severity, t('linter.source')))
                    }
                    continue
                }
                if (colNode.type === 'star') {
                    const loc = getNodeLocation(colNode)
                    if (loc) {
                        const severity = this.getRuleSeverity('avoid_select_star')
                        diagnostics.push(createDiagnostic(loc, 1, 'avoid_select_star', `【第 ${loc.line} 行】${t('linter.avoidSelectStar.description')}`, severity, t('linter.source')))
                    }
                    continue
                }
            }

            const expr = colObj.expr
            if (expr != null && typeof expr === 'object') {
                const exprObj = expr as Record<string, unknown>
                if (exprObj.type === 'column_ref' && exprObj.column === '*') {
                    const loc = getColumnLoc(colObj)
                    if (loc) {
                        const severity = this.getRuleSeverity('avoid_select_star')
                        diagnostics.push(createDiagnostic(loc, 1, 'avoid_select_star', `【第 ${loc.line} 行】${t('linter.avoidSelectStar.description')}`, severity, t('linter.source')))
                    }
                    continue
                }
                if (exprObj.type === 'star') {
                    const loc = getColumnLoc(colObj)
                    if (loc) {
                        const severity = this.getRuleSeverity('avoid_select_star')
                        diagnostics.push(createDiagnostic(loc, 1, 'avoid_select_star', `【第 ${loc.line} 行】${t('linter.avoidSelectStar.description')}`, severity, t('linter.source')))
                    }
                    continue
                }
            }
        }

        const starNodes = findNodesOfType<AstNode>(node, 'star')
        for (const star of starNodes) {
            if (columns.includes(star as unknown)) {
                continue
            }
            const loc = getNodeLocation(star)
            if (loc) {
                const severity = this.getRuleSeverity('avoid_select_star')
                diagnostics.push(createDiagnostic(loc, 1, 'avoid_select_star', `【第 ${loc.line} 行】${t('linter.avoidSelectStar.description')}`, severity, t('linter.source')))
            }
        }
    }

    private checkExplicitJoinType(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const from = node.from
        if (!Array.isArray(from)) {
            return
        }

        for (const entry of from) {
            if (entry == null || typeof entry !== 'object') {
                continue
            }
            const fromEntry = entry as Record<string, unknown>
            const join = fromEntry.join
            if (typeof join !== 'string') {
                continue
            }
            const joinUpper = join.toUpperCase()
            if (joinUpper === 'JOIN' || joinUpper === 'INNER JOIN') {
                const loc = getLocFromAny(fromEntry)
                if (loc) {
                    const severity = this.getRuleSeverity('explicit_join_type')
                    diagnostics.push(createDiagnostic(loc, 4, 'explicit_join_type', `【第 ${loc.line} 行】${t('linter.explicitJoinType.description')}`, severity, t('linter.source')))
                }
            }
        }
    }

    private checkLimitWithOrderBy(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const limit = node.limit
        if (limit == null) {
            return
        }
        const orderby = node.orderby
        if (orderby == null || (Array.isArray(orderby) && orderby.length === 0)) {
            const loc = getNodeLocation(node)
            if (loc) {
                const severity = this.getRuleSeverity('limit_with_order_by')
                diagnostics.push(createDiagnostic(loc, 5, 'limit_with_order_by', `【第 ${loc.line} 行】${t('linter.limitWithoutOrderBy.description')}`, severity, t('linter.source')))
            }
        }
    }

    private checkColumnCountMismatch(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        if (node.type !== 'insert') {
            return
        }

        const columns = node.columns
        const values = node.values

        if (!Array.isArray(columns) || columns.length === 0) {
            return
        }

        let valueRows: unknown[] = []
        if (Array.isArray(values)) {
            valueRows = values
        } else if (values != null && typeof values === 'object') {
            const valuesObj = values as Record<string, unknown>
            if (valuesObj.type === 'values' && Array.isArray(valuesObj.values)) {
                valueRows = valuesObj.values
            }
        }

        if (valueRows.length === 0) {
            return
        }

        const firstValue = valueRows[0]
        if (!isAstNode(firstValue)) {
            return
        }
        const valueNode = firstValue as AstNode
        if (valueNode.type !== 'expr_list' || !Array.isArray(valueNode.value)) {
            return
        }

        const colCount = columns.length
        const valCount = (valueNode.value as unknown[]).length

        if (colCount !== valCount) {
            const loc = getNodeLocation(node)
            if (loc) {
                const severity = this.getRuleSeverity('avoid_column_count_mismatch')
                diagnostics.push(createDiagnostic(loc, 6, 'avoid_column_count_mismatch', `【第 ${loc.line} 行】${t('linter.columnCountMismatch.description', String(colCount), String(valCount))}`, severity, t('linter.source')))
            }
        }
    }

    private checkMissingPrimaryKey(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        if (node.type !== 'create') {
            return
        }

        const keyword = node.keyword
        if (keyword !== 'table') {
            return
        }

        const createDefinitions = node.create_definitions
        if (!Array.isArray(createDefinitions)) {
            return
        }

        let hasPrimaryKey = false
        for (const def of createDefinitions) {
            if (def == null || typeof def !== 'object') {
                continue
            }
            const defNode = def as Record<string, unknown>

            if (defNode.resource === 'constraint') {
                const constraintType = defNode.constraint_type
                if (typeof constraintType === 'string' && constraintType.toLowerCase().includes('primary')) {
                    hasPrimaryKey = true
                    break
                }
            }

            if (defNode.primary_key === true || defNode.primary_key === 'primary key' || defNode.primary_key === 'key' || defNode.primary === 'key' || defNode.primary === 'primary key') {
                hasPrimaryKey = true
                break
            }

            const definition = defNode.definition
            if (Array.isArray(definition)) {
                for (const item of definition) {
                    if (isAstNode(item)) {
                        const itemNode = item as AstNode
                        if (itemNode.type === 'column_ref' && typeof itemNode.column === 'string' && itemNode.column.toLowerCase() === 'primary') {
                            hasPrimaryKey = true
                            break
                        }
                    }
                }
                if (hasPrimaryKey) break
            }
        }

        if (!hasPrimaryKey) {
            const loc = getNodeLocation(node)
            if (loc) {
                const severity = this.getRuleSeverity('missing_primary_key')
                diagnostics.push(createDiagnostic(loc, 12, 'missing_primary_key', `【第 ${loc.line} 行】${t('linter.createTableWithoutPK.description')}`, severity, t('linter.source')))
            } else {
                let fallbackLoc: AstLocation | null = null
                const table = node.table
                if (Array.isArray(table) && table.length > 0) {
                    const firstTable = table[0] as Record<string, unknown>
                    fallbackLoc = getLocFromAny(firstTable)
                }
                if (!fallbackLoc && Array.isArray(createDefinitions) && createDefinitions.length > 0) {
                    const firstDef = createDefinitions[0] as Record<string, unknown>
                    fallbackLoc = getLocFromAny(firstDef)
                    if (!fallbackLoc && firstDef.column != null && typeof firstDef.column === 'object') {
                        fallbackLoc = getLocFromAny(firstDef.column as Record<string, unknown>)
                    }
                }
                if (fallbackLoc) {
                    const severity = this.getRuleSeverity('missing_primary_key')
                    diagnostics.push(createDiagnostic(fallbackLoc, 12, 'missing_primary_key', `【第 ${fallbackLoc.line} 行】${t('linter.createTableWithoutPK.description')}`, severity, t('linter.source')))
                }
            }
        }
    }

    private checkSelectInInsert(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        if (node.type !== 'insert') {
            return
        }

        let selectNode: AstNode | null = null

        const selectProp = node.select
        if (isAstNode(selectProp)) {
            const sn = selectProp as AstNode
            if (sn.type === 'select') {
                selectNode = sn
            }
        }

        if (!selectNode) {
            const values = node.values
            if (values != null && typeof values === 'object' && !Array.isArray(values)) {
                const valuesObj = values as Record<string, unknown>
                if (isAstNode(valuesObj) && (valuesObj as AstNode).type === 'select') {
                    selectNode = valuesObj as AstNode
                }
            }
        }

        if (!selectNode) {
            return
        }

        const hasStar = this.selectHasStar(selectNode)
        if (hasStar) {
            const loc = getNodeLocation(selectNode)
            if (loc) {
                const severity = this.getRuleSeverity('avoid_select_in_insert')
                diagnostics.push(createDiagnostic(loc, 1, 'avoid_select_in_insert', `【第 ${loc.line} 行】${t('linter.insertWithoutColumns.description')}`, severity, t('linter.source')))
            }
        }
    }

    private selectHasStar(node: AstNode): boolean {
        const columns = node.columns
        if (!Array.isArray(columns)) {
            return false
        }
        for (const col of columns) {
            if (col == null || typeof col !== 'object') {
                continue
            }
            const colObj = col as Record<string, unknown>
            if (isAstNode(col)) {
                const colNode = col as AstNode
                if (colNode.type === 'column_ref' && colNode.column === '*') {
                    return true
                }
                if (colNode.type === 'star') {
                    return true
                }
            }
            const expr = colObj.expr
            if (expr != null && typeof expr === 'object') {
                const exprObj = expr as Record<string, unknown>
                if (exprObj.type === 'column_ref' && exprObj.column === '*') {
                    return true
                }
                if (exprObj.type === 'star') {
                    return true
                }
            }
        }
        return false
    }

    private checkDuplicateColumnAliases(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const columns = node.columns
        if (!Array.isArray(columns)) {
            return
        }

        const aliasMap = new Map<string, { node: Record<string, unknown>; alias: string }[]>()

        for (const col of columns) {
            if (col == null || typeof col !== 'object') {
                continue
            }
            const colObj = col as Record<string, unknown>
            const as = colObj.as
            let aliasStr: string | null = null
            if (typeof as === 'string' && as.length > 0) {
                aliasStr = as
            } else if (as != null && typeof as === 'object') {
                const asObj = as as Record<string, unknown>
                if (typeof asObj.value === 'string' && asObj.value.length > 0) {
                    aliasStr = asObj.value
                }
            }
            if (aliasStr) {
                const lower = aliasStr.toLowerCase()
                if (!aliasMap.has(lower)) {
                    aliasMap.set(lower, [])
                }
                const existing = aliasMap.get(lower)
                if (existing) {
                    existing.push({ node: colObj, alias: aliasStr })
                }
            }
        }

        for (const [alias, entries] of aliasMap) {
            if (entries.length > 1) {
                for (let i = 1; i < entries.length; i++) {
                    const loc = getColumnLoc(entries[i].node)
                    if (loc) {
                        const severity = this.getRuleSeverity('duplicate_column_aliases')
                        diagnostics.push(createDiagnostic(loc, alias.length, 'duplicate_column_aliases', `【第 ${loc.line} 行】${t('linter.duplicateAlias.description', alias)}`, severity, t('linter.source')))
                    }
                }
            }
        }
    }

    private checkUseCoalesceOverIsNull(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const funcNodes = findNodesOfType<AstNode>(node, 'function')

        for (const func of funcNodes) {
            const name = getFunctionName(func)
            if (name && ISNULL_FUNCTION_NAMES.has(name.toLowerCase())) {
                const loc = getNodeLocation(func)
                if (loc) {
                    const severity = this.getRuleSeverity('use_coalesce_over_isnull')
                    diagnostics.push(createDiagnostic(loc, name.length, 'use_coalesce_over_isnull', `【第 ${loc.line} 行】${t('linter.useCoalesce.description')}`, severity, t('linter.source')))
                }
            }
        }
    }

    private checkUseCurrentTimestamp(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const funcNodes = findNodesOfType<AstNode>(node, 'function')

        for (const func of funcNodes) {
            const name = getFunctionName(func)
            if (name && CURRENT_TIMESTAMP_FUNCTION_NAMES.has(name.toLowerCase())) {
                const loc = getNodeLocation(func)
                if (loc) {
                    const severity = this.getRuleSeverity('use_current_timestamp')
                    diagnostics.push(createDiagnostic(loc, name.length, 'use_current_timestamp', `【第 ${loc.line} 行】${t('linter.useCurrentTimestamp.description')}`, severity, t('linter.source')))
                }
            }
        }
    }

    private checkAvoidCorrelatedSubqueries(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const where = node.where
        if (where == null || !isAstNode(where)) {
            return
        }

        const outerTables = this.collectFromTables(node)

        const subquerySelects = findNodes(where, (n): n is AstNode => {
            return isAstNode(n) && (n as AstNode).type === 'select'
        })

        for (const subSelect of subquerySelects) {
            if (this.isCorrelatedSubquery(subSelect, outerTables)) {
                const loc = getNodeLocation(subSelect)
                if (loc) {
                    const severity = this.getRuleSeverity('avoid_correlated_subqueries')
                    diagnostics.push(createDiagnostic(loc, 6, 'avoid_correlated_subqueries', `【第 ${loc.line} 行】${t('linter.subqueryPerformance.description')}`, severity, t('linter.source')))
                }
            }
        }
    }

    private isCorrelatedSubquery(subSelect: AstNode, outerTables: Set<string>): boolean {
        let correlated = false
        walkAst(subSelect, {
            enter(child) {
                if (correlated) return
                if (isAstNode(child)) {
                    const childNode = child as AstNode
                    if (childNode.type === 'column_ref' && typeof childNode.table === 'string') {
                        if (outerTables.has(childNode.table.toLowerCase())) {
                            correlated = true
                        }
                    }
                }
            },
        })
        return correlated
    }

    private collectFromTables(node: AstNode): Set<string> {
        const tables = new Set<string>()
        const from = node.from
        if (!Array.isArray(from)) {
            return tables
        }

        for (const entry of from) {
            if (!isAstNode(entry)) {
                continue
            }
            const fromEntry = entry as AstNode
            const table = fromEntry.table
            if (typeof table === 'string') {
                tables.add(table.toLowerCase())
            }
            const as = fromEntry.as
            if (typeof as === 'string' && as.length > 0) {
                tables.add(as.toLowerCase())
            }
        }
        return tables
    }

    private checkMissingQueryComment(node: AstNode, sql: string, diagnostics: vscode.Diagnostic[], document?: vscode.TextDocument): void {
        if (!document) {
            return
        }

        const cfg = vscode.workspace.getConfiguration('Hive-Formatter')
        const thresholdLines = cfg.get<number>('lint.missing_query_comment_threshold_line_count', 20)
        const thresholdJoins = cfg.get<number>('lint.missing_query_comment_threshold_join_count', 3)
        const thresholdSubqueries = cfg.get<number>('lint.missing_query_comment_threshold_subquery_count', 2)

        const loc = getNodeLocation(node)
        if (!loc) {
            return
        }

        const selectStartLine = loc.line - 1

        const from = node.from
        const joinCount = Array.isArray(from)
            ? from.filter((e): e is AstNode => isAstNode(e) && typeof (e as AstNode).join === 'string').length
            : 0

        let subqueryCount = 0
        walkAst(node, {
            enter(child) {
                if (isAstNode(child) && child !== node) {
                    const childNode = child as AstNode
                    if (childNode.type === 'select') {
                        subqueryCount++
                    }
                }
            },
        })

        const endLoc = getStatementEndLocation(node)
        const statementEndLine = endLoc ? endLoc.line - 1 : selectStartLine
        const lineCount = statementEndLine - selectStartLine + 1

        const isComplex = lineCount >= thresholdLines || joinCount >= thresholdJoins || subqueryCount >= thresholdSubqueries
        if (!isComplex) {
            return
        }

        const hasCommentAbove = this.hasCommentAboveLine(document, selectStartLine)
        if (hasCommentAbove) {
            return
        }

        const details: string[] = []
        if (lineCount >= thresholdLines) details.push(`${lineCount}行`)
        if (joinCount >= thresholdJoins) details.push(`${joinCount}个JOIN`)
        if (subqueryCount >= thresholdSubqueries) details.push(`${subqueryCount}个子查询`)

        const severity = this.getRuleSeverity('missing_query_comment')
        diagnostics.push(createDiagnostic(loc, 6, 'missing_query_comment', `【第 ${loc.line} 行】${t('linter.complexQueryComment.description', details.join('/'))}`, severity, t('linter.source')))
    }

    private hasCommentAboveLine(document: vscode.TextDocument, line: number): boolean {
        for (let i = Math.max(0, line - 3); i < line; i++) {
            const lineText = document.lineAt(i).text.trim()
            if (lineText.startsWith('--') || lineText.startsWith('/*')) {
                return true
            }
        }
        return false
    }

    private checkMissingColumnComment(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        if (node.type !== 'create') {
            return
        }
        const keyword = node.keyword
        if (keyword !== 'table') {
            return
        }

        const createDefinitions = node.create_definitions
        if (!Array.isArray(createDefinitions)) {
            return
        }

        const missingColumns: { name: string; node: AstNode }[] = []

        for (const def of createDefinitions) {
            if (!isAstNode(def)) {
                continue
            }
            const defNode = def as AstNode

            if (defNode.resource === 'constraint') {
                continue
            }

            const columnName = this.getColumnNameFromDefinition(defNode)
            if (columnName == null) {
                continue
            }

            const hasComment = this.definitionHasComment(defNode)
            if (!hasComment) {
                missingColumns.push({ name: columnName, node: defNode })
            }
        }

        if (missingColumns.length === 0) {
            return
        }

        const cfg = vscode.workspace.getConfiguration('Hive-Formatter')
        const aggregate = cfg.get<boolean>('lint.missing_column_comment_aggregate', true)

        if (aggregate && missingColumns.length > 1) {
            const loc = getNodeLocation(node)
            if (loc) {
                const severity = this.getRuleSeverity('missing_column_comment')
                diagnostics.push(createDiagnostic(loc, 12, 'missing_column_comment', `【第 ${loc.line} 行】${t('linter.createTableMissingComment.description', String(missingColumns.length))}`, severity, t('linter.source')))
            }
        } else {
            for (const col of missingColumns) {
                const loc = getNodeLocation(col.node)
                if (loc) {
                    const severity = this.getRuleSeverity('missing_column_comment')
                    diagnostics.push(createDiagnostic(loc, col.name.length, 'missing_column_comment', `【第 ${loc.line} 行】${t('linter.columnMissingComment.description', col.name)}`, severity, t('linter.source')))
                }
            }
        }
    }

    private getColumnNameFromDefinition(defNode: AstNode): string | null {
        const column = defNode.column
        if (isAstNode(column)) {
            const colNode = column as AstNode
            if (typeof colNode.value === 'string') {
                return colNode.value
            }
        }
        if (typeof column === 'string') {
            return column
        }
        return null
    }

    private definitionHasComment(defNode: AstNode): boolean {
        if (typeof defNode.comment === 'string') {
            return true
        }

        const suffixes = defNode.suffixes
        if (Array.isArray(suffixes)) {
            for (const suffix of suffixes) {
                if (isAstNode(suffix)) {
                    const suffixNode = suffix as AstNode
                    if (suffixNode.type === 'comment') {
                        return true
                    }
                }
            }
        }

        return false
    }

    private isCommentedOutCode(content: string, thresholdLines: number): boolean {
        if (/sql-formatter-disable|sql-formatter-enable/i.test(content)) {
            return false
        }

        const lines = content.split('\n').filter(l => l.trim().length > 0)
        if (lines.length < thresholdLines) {
            return false
        }

        let keywordCount = 0
        for (const { regex } of SQL_KEYWORD_REGEXES) {
            if (regex.test(content)) {
                keywordCount++
            }
        }
        if (keywordCount < 3) {
            return false
        }

        return true
    }

    private checkCommentedOutCode(sql: string, diagnostics: vscode.Diagnostic[]): void {
        const cfg = vscode.workspace.getConfiguration('Hive-Formatter')
        const thresholdLines = cfg.get<number>('lint.commented_out_code_threshold_lines', 3)

        const blockCommentPattern = /\/\*([\s\S]*?)\*\//g
        let match
        while ((match = blockCommentPattern.exec(sql)) !== null) {
            const content = match[1]
            if (!this.isCommentedOutCode(content, thresholdLines)) {
                continue
            }

            const lines = content.split('\n').filter(l => l.trim().length > 0)
            const startLine = sql.substring(0, match.index).split('\n').length
            const loc: AstLocation = { line: startLine, column: 1 }
            const severity = this.getRuleSeverity('commented_out_code')
            diagnostics.push(createDiagnostic(loc, 2, 'commented_out_code', `【第 ${loc.line} 行】${t('linter.commentedOutCode.description', String(lines.length))}`, severity, t('linter.source')))
        }

        const lineCommentGroups = this.findConsecutiveLineComments(sql)
        for (const group of lineCommentGroups) {
            if (!this.isCommentedOutCode(group.text, thresholdLines)) {
                continue
            }

            const startLine = sql.substring(0, group.startIndex).split('\n').length
            const loc: AstLocation = { line: startLine, column: 1 }
            const severity = this.getRuleSeverity('commented_out_code')
            diagnostics.push(createDiagnostic(loc, 2, 'commented_out_code', `【第 ${loc.line} 行】${t('linter.commentedOutCode.description', String(group.lineCount))}`, severity, t('linter.source')))
        }
    }

    private findConsecutiveLineComments(text: string): { startIndex: number; lineCount: number; text: string }[] {
        const groups: { startIndex: number; lineCount: number; text: string }[] = []
        const lines = text.split('\n')
        let groupStart = -1
        let groupText = ''
        let groupStartIndex = 0
        let offset = 0

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim()
            if (trimmed.startsWith('--')) {
                if (groupStart === -1) {
                    groupStart = i
                    groupStartIndex = offset
                    groupText = trimmed
                } else {
                    groupText += '\n' + trimmed
                }
            } else if (trimmed.length > 0) {
                if (groupStart !== -1) {
                    groups.push({ startIndex: groupStartIndex, lineCount: i - groupStart, text: groupText })
                    groupStart = -1
                    groupText = ''
                }
            }
            offset += lines[i].length + 1
        }
        if (groupStart !== -1) {
            groups.push({ startIndex: groupStartIndex, lineCount: lines.length - groupStart, text: groupText })
        }
        return groups
    }

    private checkExpiredTodo(sql: string, diagnostics: vscode.Diagnostic[]): void {
        const cfg = vscode.workspace.getConfiguration('Hive-Formatter')
        const gracePeriod = cfg.get<number>('lint.expired_todo_grace_period_days', 7)

        const patterns = [
            /--\s*(TODO|FIXME)\s*\(\s*(\d{4}[-/]\d{2}[-/]\d{2})\s*\):?\s*.*/gi,
            /--\s*(TODO|FIXME)\s*\([^),]+,\s*(\d{4}[-/]\d{2}[-/]\d{2})\s*\):?\s*.*/gi,
            /--\s*(TODO|FIXME)[^\n]*@deadline\s+(\d{4}[-/]\d{2}[-/]\d{2})/gi,
        ]

        for (const pattern of patterns) {
            let match
            while ((match = pattern.exec(sql)) !== null) {
                const dateStr = match[2].replace(/\//g, '-')
                const todoDate = new Date(dateStr)
                const now = new Date()
                now.setHours(0, 0, 0, 0)

                if (isNaN(todoDate.getTime())) {
                    continue
                }

                const diffMs = now.getTime() - todoDate.getTime()
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

                if (diffDays <= gracePeriod) {
                    continue
                }

                const startLine = sql.substring(0, match.index).split('\n').length
                const loc: AstLocation = { line: startLine, column: 1 }
                const severity = this.getRuleSeverity('expired_todo')
                diagnostics.push(createDiagnostic(loc, match[0].length, 'expired_todo', `【第 ${loc.line} 行】${t('linter.expiredTodo.description', dateStr, String(diffDays))}`, severity, t('linter.source')))
            }
        }
    }
}
