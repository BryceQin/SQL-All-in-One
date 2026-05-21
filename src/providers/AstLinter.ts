import * as vscode from 'vscode'
import { getParserEngine } from '../parser/SqlParserEngine'
import type { SqlDialect } from '../parser/dialectMapper'
import { walkAst, findNodes, findNodesOfType, isAstNode } from '../parser/AstVisitor'
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

interface LintRule {
    id: string
    defaultSeverity: vscode.DiagnosticSeverity
    defaultEnabled: boolean
}

const BUILT_IN_RULES: LintRule[] = [
    { id: 'avoid_select_star', defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true },
    { id: 'explicit_join_type', defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: true },
    { id: 'limit_with_order_by', defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true },
    { id: 'avoid_column_count_mismatch', defaultSeverity: vscode.DiagnosticSeverity.Error, defaultEnabled: true },
    { id: 'missing_primary_key', defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true },
    { id: 'avoid_select_in_insert', defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true },
    { id: 'duplicate_column_aliases', defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true },
    { id: 'use_coalesce_over_isnull', defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: false },
    { id: 'use_current_timestamp', defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: true },
    { id: 'avoid_correlated_subqueries', defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: false },
    { id: 'explicit_column_aliasing', defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: false },
    { id: 'missing_query_comment', defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true },
    { id: 'missing_column_comment', defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true },
    { id: 'commented_out_code', defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: true },
    { id: 'expired_todo', defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: true },
]

const ISNULL_FUNCTION_NAMES = new Set(['ifnull', 'isnull'])

const CURRENT_TIMESTAMP_FUNCTION_NAMES = new Set(['now', 'sysdate', 'getdate', 'current_date'])

export class AstLinter {
    private config = new Map<string, { enabled: boolean; severity: vscode.DiagnosticSeverity }>()

    constructor() {
        this.loadConfig()
    }

    private loadConfig(): void {
        const cfg = vscode.workspace.getConfiguration('Hive-Formatter')
        for (const rule of BUILT_IN_RULES) {
            const ruleConfig = cfg.get<{ enabled?: boolean; severity?: string }>(`lint.${rule.id}`)
            const enabled = ruleConfig?.enabled ?? rule.defaultEnabled
            const severityStr = ruleConfig?.severity
            let severity = rule.defaultSeverity
            if (severityStr) {
                switch (severityStr.toLowerCase()) {
                    case 'error': severity = vscode.DiagnosticSeverity.Error; break
                    case 'warning': severity = vscode.DiagnosticSeverity.Warning; break
                    case 'information': severity = vscode.DiagnosticSeverity.Information; break
                    case 'hint': severity = vscode.DiagnosticSeverity.Hint; break
                }
            }
            this.config.set(rule.id, { enabled, severity })
        }
    }

    private isRuleEnabled(ruleId: string): boolean {
        return this.config.get(ruleId)?.enabled ?? false
    }

    private getRuleSeverity(ruleId: string): vscode.DiagnosticSeverity {
        return this.config.get(ruleId)?.severity ?? vscode.DiagnosticSeverity.Warning
    }

    lint(sql: string, dialect: SqlDialect, document?: vscode.TextDocument): vscode.Diagnostic[] {
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
        const self = this
        walkAst(root, {
            enter(child) {
                if (child !== root && isAstNode(child)) {
                    const childNode = child as AstNode
                    if (childNode.type === 'select') {
                        self.checkSelectRules(childNode, sql, diagnostics, document)
                    } else if (childNode.type === 'insert') {
                        self.checkInsertRules(childNode, diagnostics)
                    } else if (childNode.type === 'create') {
                        self.checkCreateRules(childNode, diagnostics)
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
            if (isAstNode(col)) {
                const colNode = col as AstNode
                if (colNode.type === 'column_ref' && colNode.column === '*') {
                    this.addDiagnosticFromNode(colNode, 1, t('linter.avoidSelectStar.description'), 'avoid_select_star', diagnostics)
                } else if (colNode.type === 'star') {
                    this.addDiagnosticFromNode(colNode, 1, t('linter.avoidSelectStar.description'), 'avoid_select_star', diagnostics)
                }
            }
        }

        const starNodes = findNodesOfType<AstNode>(node, 'star')
        for (const star of starNodes) {
            if (columns.includes(star as unknown)) {
                continue
            }
            this.addDiagnosticFromNode(star, 1, t('linter.avoidSelectStar.description'), 'avoid_select_star', diagnostics)
        }
    }

    private checkExplicitJoinType(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
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
            if (joinUpper === 'JOIN') {
                this.addDiagnosticFromNode(fromEntry, join.length, t('linter.explicitJoinType.description'), 'explicit_join_type', diagnostics)
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
            const loc = this.getNodeLocation(node)
            if (loc) {
                this.addDiagnostic(loc, 5, t('linter.limitWithoutOrderBy.description'), 'limit_with_order_by', diagnostics)
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
        if (!Array.isArray(values) || values.length === 0) {
            return
        }

        const firstValue = values[0]
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
            const loc = this.getNodeLocation(node)
            if (loc) {
                this.addDiagnostic(loc, 6, t('linter.columnCountMismatch.description', String(colCount), String(valCount)), 'avoid_column_count_mismatch', diagnostics)
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
            if (!isAstNode(def)) {
                continue
            }
            const defNode = def as AstNode

            if (defNode.resource === 'constraint') {
                const constraintType = defNode.constraint_type
                if (typeof constraintType === 'string' && constraintType.toLowerCase().includes('primary')) {
                    hasPrimaryKey = true
                    break
                }
            }

            if (defNode.primary_key === true) {
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
            const loc = this.getNodeLocation(node)
            if (loc) {
                this.addDiagnostic(loc, 12, t('linter.createTableWithoutPK.description'), 'missing_primary_key', diagnostics)
            }
        }
    }

    private checkSelectInInsert(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        if (node.type !== 'insert') {
            return
        }

        const selectProp = node.select
        if (!isAstNode(selectProp)) {
            return
        }
        const selectNode = selectProp as AstNode
        if (selectNode.type !== 'select') {
            return
        }

        const hasStar = this.selectHasStar(selectNode)
        if (hasStar) {
            const loc = this.getNodeLocation(selectNode)
            if (loc) {
                this.addDiagnostic(loc, 1, t('linter.insertWithoutColumns.description'), 'avoid_select_in_insert', diagnostics)
            }
        }
    }

    private selectHasStar(node: AstNode): boolean {
        const columns = node.columns
        if (!Array.isArray(columns)) {
            return false
        }
        for (const col of columns) {
            if (isAstNode(col)) {
                const colNode = col as AstNode
                if (colNode.type === 'column_ref' && colNode.column === '*') {
                    return true
                }
                if (colNode.type === 'star') {
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

        const aliasMap = new Map<string, AstNode[]>()

        for (const col of columns) {
            if (!isAstNode(col)) {
                continue
            }
            const colNode = col as AstNode
            const as = colNode.as
            if (typeof as === 'string' && as.length > 0) {
                const lower = as.toLowerCase()
                if (!aliasMap.has(lower)) {
                    aliasMap.set(lower, [])
                }
                aliasMap.get(lower)!.push(colNode)
            }
        }

        for (const [alias, nodes] of aliasMap) {
            if (nodes.length > 1) {
                for (let i = 1; i < nodes.length; i++) {
                    this.addDiagnosticFromNode(nodes[i], alias.length, t('linter.duplicateAlias.description', alias), 'duplicate_column_aliases', diagnostics)
                }
            }
        }
    }

    private checkUseCoalesceOverIsNull(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const funcNodes = findNodesOfType<AstNode>(node, 'function')

        for (const func of funcNodes) {
            const name = this.getFunctionName(func)
            if (name && ISNULL_FUNCTION_NAMES.has(name.toLowerCase())) {
                this.addDiagnosticFromNode(func, name.length, t('linter.useCoalesce.description'), 'use_coalesce_over_isnull', diagnostics)
            }
        }
    }

    private checkUseCurrentTimestamp(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const funcNodes = findNodesOfType<AstNode>(node, 'function')

        for (const func of funcNodes) {
            const name = this.getFunctionName(func)
            if (name && CURRENT_TIMESTAMP_FUNCTION_NAMES.has(name.toLowerCase())) {
                this.addDiagnosticFromNode(func, name.length, t('linter.useCurrentTimestamp.description'), 'use_current_timestamp', diagnostics)
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
                const loc = this.getNodeLocation(subSelect)
                if (loc) {
                    this.addDiagnostic(loc, 6, t('linter.subqueryPerformance.description'), 'avoid_correlated_subqueries', diagnostics)
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

        const loc = this.getNodeLocation(node)
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

        const endLoc = this.getStatementEndLocation(node)
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

        this.addDiagnostic(loc, 6, t('linter.complexQueryComment.description', details.join('/')), 'missing_query_comment', diagnostics)
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
            const loc = this.getNodeLocation(node)
            if (loc) {
                this.addDiagnostic(loc, 12, t('linter.createTableMissingComment.description', String(missingColumns.length)), 'missing_column_comment', diagnostics)
            }
        } else {
            for (const col of missingColumns) {
                this.addDiagnosticFromNode(col.node, col.name.length, t('linter.columnMissingComment.description', col.name), 'missing_column_comment', diagnostics)
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

    private checkCommentedOutCode(sql: string, diagnostics: vscode.Diagnostic[]): void {
        const cfg = vscode.workspace.getConfiguration('Hive-Formatter')
        const thresholdLines = cfg.get<number>('lint.commented_out_code_threshold_lines', 3)

        const blockCommentPattern = /\/\*([\s\S]*?)\*\//g
        let match
        while ((match = blockCommentPattern.exec(sql)) !== null) {
            const content = match[1]
            if (/sql-formatter-disable|sql-formatter-enable/i.test(content)) {
                continue
            }

            const lines = content.split('\n').filter(l => l.trim().length > 0)
            if (lines.length < thresholdLines) {
                continue
            }

            const sqlKeywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'GROUP BY', 'ORDER BY', 'HAVING', 'UNION']
            let keywordCount = 0
            for (const kw of sqlKeywords) {
                if (new RegExp(`\\b${kw}\\b`, 'i').test(content)) {
                    keywordCount++
                }
            }
            if (keywordCount < 3) {
                continue
            }

            const startLine = sql.substring(0, match.index).split('\n').length
            this.addDiagnostic(
                { line: startLine, column: 1 },
                2,
                t('linter.commentedOutCode.description', String(lines.length)),
                'commented_out_code',
                diagnostics,
            )
        }

        const lineCommentGroups = this.findConsecutiveLineComments(sql)
        for (const group of lineCommentGroups) {
            if (group.lineCount < thresholdLines) {
                continue
            }
            const content = group.text
            if (/sql-formatter-disable|sql-formatter-enable/i.test(content)) {
                continue
            }

            const sqlKeywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'GROUP BY', 'ORDER BY', 'HAVING', 'UNION']
            let keywordCount = 0
            for (const kw of sqlKeywords) {
                if (new RegExp(`\\b${kw}\\b`, 'i').test(content)) {
                    keywordCount++
                }
            }
            if (keywordCount < 3) {
                continue
            }

            const startLine = sql.substring(0, group.startIndex).split('\n').length
            this.addDiagnostic(
                { line: startLine, column: 1 },
                2,
                t('linter.commentedOutCode.description', String(group.lineCount)),
                'commented_out_code',
                diagnostics,
            )
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
                this.addDiagnostic(
                    { line: startLine, column: 1 },
                    match[0].length,
                    t('linter.expiredTodo.description', dateStr, String(diffDays)),
                    'expired_todo',
                    diagnostics,
                )
            }
        }
    }

    private addDiagnosticFromNode(node: AstNode, length: number, message: string, ruleId: string, diagnostics: vscode.Diagnostic[]): void {
        const loc = this.getNodeLocation(node)
        if (loc) {
            this.addDiagnostic(loc, length, message, ruleId, diagnostics)
        }
    }

    private addDiagnostic(loc: AstLocation, length: number, message: string, ruleId: string, diagnostics: vscode.Diagnostic[]): void {
        const severity = this.getRuleSeverity(ruleId)
        const diagnostic = new vscode.Diagnostic(
            new vscode.Range(loc.line - 1, loc.column - 1, loc.line - 1, loc.column - 1 + length),
            `【第 ${loc.line} 行】${message}`,
            severity,
        )
        diagnostic.source = t('linter.source')
        diagnostic.code = ruleId
        diagnostics.push(diagnostic)
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

    private getNodeLocation(node: AstNode): AstLocation | null {
        const loc = (node as Record<string, unknown>).loc as { start?: AstLocation; end?: AstLocation } | undefined
        if (loc?.start?.line !== undefined && loc?.start?.column !== undefined) {
            return {
                line: loc.start.line,
                column: loc.start.column,
            }
        }
        return null
    }

    private getStatementEndLocation(node: AstNode): AstLocation | null {
        const loc = (node as Record<string, unknown>).loc as { start?: AstLocation; end?: AstLocation } | undefined
        if (loc?.end?.line !== undefined && loc?.end?.column !== undefined) {
            return {
                line: loc.end.line,
                column: loc.end.column,
            }
        }
        return null
    }
}
