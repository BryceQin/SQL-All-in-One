import * as vscode from "vscode"
import { lineColFromIndex } from "../lexer/lineColFromIndex"
import { t } from "../i18n"

export interface LintRule {
    id: string
    name: string
    description: string
    defaultSeverity: vscode.DiagnosticSeverity
    defaultEnabled: boolean
    category: string
}

export interface LintRuleConfig {
    enabled: boolean
    severity: vscode.DiagnosticSeverity
}

export class SqlLinter {
    private rules = new Map<string, LintRule>()
    private config = new Map<string, LintRuleConfig>()

    constructor() {
        this.registerBuiltInRules()
        this.loadConfig()
    }

    private registerBuiltInRules(): void {
        const builtInRules: LintRule[] = [
            { id: "avoid_select_star", name: t('linter.avoidSelectStar.name'), description: t('linter.avoidSelectStar.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: "code-style" },
            { id: "explicit_join_type", name: t('linter.explicitJoinType.name'), description: t('linter.explicitJoinType.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: true, category: "code-style" },
            { id: "uppercase_keywords", name: "关键字大写", description: "建议 SQL 关键字使用大写", defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: false, category: "code-style" },
            { id: "consistent_aliasing", name: "一致的别名", description: "建议使用有意义的表别名", defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: false, category: "code-style" },
            { id: "limit_with_order_by", name: t('linter.limitWithoutOrderBy.name'), description: t('linter.limitWithoutOrderBy.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: "best-practices" },
            { id: "avoid_column_count_mismatch", name: t('linter.columnCountMismatch.name'), description: t('linter.columnCountMismatch.description'), defaultSeverity: vscode.DiagnosticSeverity.Error, defaultEnabled: true, category: "error-check" },
            { id: "use_coalesce_over_isnull", name: t('linter.useCoalesce.name'), description: t('linter.useCoalesce.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: false, category: "best-practices" },
            { id: "explicit_column_aliasing", name: t('linter.missingAsKeyword.name'), description: t('linter.missingAsKeyword.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: false, category: "code-style" },
            { id: "avoid_correlated_subqueries", name: t('linter.subqueryPerformance.name'), description: t('linter.subqueryPerformance.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: false, category: "performance" },
            { id: "missing_primary_key", name: t('linter.createTableWithoutPK.name'), description: t('linter.createTableWithoutPK.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: "best-practices" },
            { id: "use_current_timestamp", name: t('linter.useCurrentTimestamp.name'), description: t('linter.useCurrentTimestamp.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: true, category: "best-practices" },
            { id: "avoid_select_in_insert", name: t('linter.insertWithoutColumns.name'), description: t('linter.insertWithoutColumns.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: "best-practices" },
            { id: "long_query_line", name: t('linter.longSingleLine.name'), description: t('linter.longSingleLine.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: false, category: "code-style" },
            { id: "duplicate_column_aliases", name: t('linter.duplicateAlias.name'), description: t('linter.duplicateAlias.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: "code-style" },
            { id: "missing_query_comment", name: t('linter.complexQueryComment.name'), description: t('linter.complexQueryComment.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: "best-practices" },
            { id: "missing_column_comment", name: t('linter.createTableMissingComment.name'), description: t('linter.createTableMissingComment.description'), defaultSeverity: vscode.DiagnosticSeverity.Warning, defaultEnabled: true, category: "best-practices" },
            { id: "commented_out_code", name: t('linter.commentedOutCode.name'), description: t('linter.commentedOutCode.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: true, category: "code-style" },
            { id: "expired_todo", name: t('linter.expiredTodo.name'), description: t('linter.expiredTodo.description'), defaultSeverity: vscode.DiagnosticSeverity.Information, defaultEnabled: true, category: "best-practices" },
        ]

        builtInRules.forEach(rule => {
            this.rules.set(rule.id, rule)
        })
    }

    private loadConfig(): void {
        const config = vscode.workspace.getConfiguration('Hive-Formatter')
        
        this.rules.forEach((rule, id) => {
            const ruleConfig = config.get<{ enabled?: boolean, severity?: string }>(`lint.${id}`)
            const enabled = ruleConfig?.enabled ?? rule.defaultEnabled
            const severityStr = ruleConfig?.severity
            let severity: vscode.DiagnosticSeverity = rule.defaultSeverity
            
            if (severityStr) {
                switch (severityStr.toLowerCase()) {
                    case 'error': severity = vscode.DiagnosticSeverity.Error; break
                    case 'warning': severity = vscode.DiagnosticSeverity.Warning; break
                    case 'information': severity = vscode.DiagnosticSeverity.Information; break
                    case 'hint': severity = vscode.DiagnosticSeverity.Hint; break
                }
            }

            this.config.set(id, { enabled, severity })
        })
    }

    public getRules(): LintRule[] {
        return Array.from(this.rules.values())
    }

    public isRuleEnabled(ruleId: string): boolean {
        return this.config.get(ruleId)?.enabled ?? false
    }

    public getRuleSeverity(ruleId: string): vscode.DiagnosticSeverity {
        return this.config.get(ruleId)?.severity ?? this.rules.get(ruleId)?.defaultSeverity ?? vscode.DiagnosticSeverity.Warning
    }

    public lint(text: string, document: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        
        if (this.isRuleEnabled('avoid_select_star')) {
            this.checkSelectStar(text, document, diagnostics)
        }
        if (this.isRuleEnabled('explicit_join_type')) {
            this.checkExplicitJoinType(text, document, diagnostics)
        }
        if (this.isRuleEnabled('limit_with_order_by')) {
            this.checkLimitWithOrderBy(text, document, diagnostics)
        }
        if (this.isRuleEnabled('avoid_column_count_mismatch')) {
            this.checkColumnCountMismatch(text, document, diagnostics)
        }
        if (this.isRuleEnabled('missing_primary_key')) {
            this.checkMissingPrimaryKey(text, document, diagnostics)
        }
        if (this.isRuleEnabled('avoid_select_in_insert')) {
            this.checkSelectInInsert(text, document, diagnostics)
        }
        if (this.isRuleEnabled('duplicate_column_aliases')) {
            this.checkDuplicateColumnAliases(text, document, diagnostics)
        }
        if (this.isRuleEnabled('use_coalesce_over_isnull')) {
            this.checkUseCoalesce(text, document, diagnostics)
        }
        if (this.isRuleEnabled('use_current_timestamp')) {
            this.checkUseCurrentTimestamp(text, document, diagnostics)
        }
        if (this.isRuleEnabled('avoid_correlated_subqueries')) {
            this.checkCorrelatedSubqueries(text, document, diagnostics)
        }
        if (this.isRuleEnabled('long_query_line')) {
            this.checkLongQueryLine(text, document, diagnostics)
        }
        if (this.isRuleEnabled('explicit_column_aliasing')) {
            this.checkExplicitColumnAliasing(text, document, diagnostics)
        }
        if (this.isRuleEnabled('missing_query_comment')) {
            this.checkMissingQueryComment(text, document, diagnostics)
        }
        if (this.isRuleEnabled('missing_column_comment')) {
            this.checkMissingColumnComment(text, document, diagnostics)
        }
        if (this.isRuleEnabled('commented_out_code')) {
            this.checkCommentedOutCode(text, document, diagnostics)
        }
        if (this.isRuleEnabled('expired_todo')) {
            this.checkExpiredTodo(text, document, diagnostics)
        }

        return diagnostics
    }

    private addDiagnostic(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[], matchIndex: number, length: number, message: string, ruleId: string): void {
        const severity = this.getRuleSeverity(ruleId)
        const lineCol = lineColFromIndex(text, matchIndex)
        const diagnostic = new vscode.Diagnostic(
            new vscode.Range(lineCol.line - 1, lineCol.col, lineCol.line - 1, lineCol.col + length),
            `【第 ${lineCol.line} 行】${message}`,
            severity
        )
        diagnostic.source = t('linter.source')
        diagnostic.code = ruleId
        diagnostics.push(diagnostic)
    }

    private checkSelectStar(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern = /\bselect\b\s*\*\s*(?:\bfrom\b|;|$)/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            const starIndex = match.index + match[0].indexOf('*')
            this.addDiagnostic(text, document, diagnostics, starIndex, 1, t('linter.avoidSelectStar.description'), "avoid_select_star")
        }
    }

    private checkExplicitJoinType(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const joinPattern = /\bjoin\b/gi
        let match
        while ((match = joinPattern.exec(text)) !== null) {
            const beforeJoin = text.substring(Math.max(0, match.index - 30), match.index)
            if (/\b(inner|left|right|full|outer|cross)\s*$/i.test(beforeJoin)) continue
            if (/\bnatural\s*$/i.test(beforeJoin)) continue

            this.addDiagnostic(text, document, diagnostics, match.index, 4, t('linter.explicitJoinType.description'), "explicit_join_type")
        }
    }

    private checkLimitWithOrderBy(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const limitPattern = /\blimit\b/gi
        let match
        while ((match = limitPattern.exec(text)) !== null) {
            const beforeLimit = text.substring(0, match.index)
            const selectMatch = /\bselect\b[^;]*$/i.exec(beforeLimit)
            if (selectMatch) {
                const selectToLimit = selectMatch[0]
                if (!/\border\s+by\b/i.test(selectToLimit)) {
                    this.addDiagnostic(text, document, diagnostics, match.index, 5, t('linter.limitWithoutOrderBy.description'), "limit_with_order_by")
                }
            }
        }
    }

    private checkColumnCountMismatch(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern = /\binsert\s+into\s+(\w+)\s*\(([^)]+)\)\s*values\s*\(([^)]+)\)/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            const columnsText = match[2]
            const valuesText = match[3]
            
            const columnCount = this.countCommaSeparated(columnsText)
            const valueCount = this.countCommaSeparated(valuesText)
            
            if (columnCount !== valueCount) {
                this.addDiagnostic(text, document, diagnostics, match.index, match[0].length, t('linter.columnCountMismatch.description', String(columnCount), String(valueCount)), "avoid_column_count_mismatch")
            }
        }
    }

    private countCommaSeparated(text: string): number {
        let count = 0
        let inString = false
        let stringChar = ''
        let inParen = 0

        for (let i = 0; i < text.length; i++) {
            const char = text[i]
            if (char === '"' || char === "'") {
                if (!inString) {
                    inString = true
                    stringChar = char
                } else if (char === stringChar) {
                    const nextCh = i + 1 < text.length ? text[i + 1] : ''
                    if (nextCh === stringChar) {
                        i++
                    } else {
                        inString = false
                    }
                }
            } else if (!inString) {
                if (char === '(') inParen++
                else if (char === ')') inParen--
                else if (char === ',' && inParen === 0) count++
            }
        }
        return count + 1
    }

    private checkMissingPrimaryKey(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern = /\bcreate\s+table\b/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            const afterCreate = text.substring(match.index)
            const semicolonMatch = /;/.exec(afterCreate)
            const statementText = semicolonMatch ? afterCreate.substring(0, semicolonMatch.index) : afterCreate
            if (!/\bprimary\s+key\b/i.test(statementText)) {
                const hasCommonIdFields = /\b(id|uuid|guid|_id|Id|ID|UUID|GUID)\b/i.test(statementText)
                if (!hasCommonIdFields) {
                    this.addDiagnostic(text, document, diagnostics, match.index, 12, t('linter.createTableWithoutPK.description'), "missing_primary_key")
                }
            }
        }
    }

    private checkSelectInInsert(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern = /\binsert\s+into\s+\w+\s*\bselect\s+\*\b/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            const starIndex = match[0].indexOf('*')
            this.addDiagnostic(text, document, diagnostics, match.index + starIndex, 1, t('linter.insertWithoutColumns.description'), "avoid_select_in_insert")
        }
    }

    private checkDuplicateColumnAliases(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const selectPattern = /\bselect\b/gi
        let selectMatch

        while ((selectMatch = selectPattern.exec(text)) !== null) {
            const afterSelect = text.substring(selectMatch.index + 6)
            let depth = 0
            let fromIndex = -1
            for (let i = 0; i < afterSelect.length; i++) {
                if (afterSelect[i] === '(') depth++
                else if (afterSelect[i] === ')') depth--
                else if (depth === 0 && afterSelect.substring(i, i + 4).toLowerCase() === 'from' && (i === 0 || !/\w/.test(afterSelect[i - 1])) && (i + 4 >= afterSelect.length || !/\w/.test(afterSelect[i + 4]))) {
                    fromIndex = i
                    break
                }
            }
            if (fromIndex === -1) continue

            const columnsPart = afterSelect.substring(0, fromIndex)
            const aliases = new Map<string, number[]>()

            const aliasPattern = /\bas\s+(\w+)\b/gi
            let aliasMatch

            while ((aliasMatch = aliasPattern.exec(columnsPart)) !== null) {
                const alias = aliasMatch[1].toLowerCase()
                if (!aliases.has(alias)) {
                    aliases.set(alias, [])
                }
                const aliasPositions = aliases.get(alias)
                if (aliasPositions) {
                    aliasPositions.push(selectMatch.index + 6 + aliasMatch.index)
                }
            }

            for (const [alias, positions] of aliases) {
                if (positions.length > 1) {
                    for (let i = 1; i < positions.length; i++) {
                        this.addDiagnostic(text, document, diagnostics, positions[i], alias.length, t('linter.duplicateAlias.description', alias), "duplicate_column_aliases")
                    }
                }
            }
        }
    }

    private checkUseCoalesce(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern = /\b(ifnull|isnull)\s*\(/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            this.addDiagnostic(text, document, diagnostics, match.index, match[1].length, t('linter.useCoalesce.description'), "use_coalesce_over_isnull")
        }
    }

    private checkUseCurrentTimestamp(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern = /\b(now|sysdate|getdate|current_date)\s*\(/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            this.addDiagnostic(text, document, diagnostics, match.index, match[1].length, t('linter.useCurrentTimestamp.description'), "use_current_timestamp")
        }
    }

    private checkCorrelatedSubqueries(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        // 暂时禁用此规则的检查，简化实现
        const pattern = /\bwhere\s+\w+\s*=\s*\(\s*select/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            this.addDiagnostic(text, document, diagnostics, match.index, match[0].length, t('linter.subqueryPerformance.description'), "avoid_correlated_subqueries")
        }
    }

    private checkLongQueryLine(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const lines = text.split('\n')
        let offset = 0
        for (const line of lines) {
            if (line.length > 120 && (line.toLowerCase().includes('select') || line.toLowerCase().includes('join') || line.toLowerCase().includes('where'))) {
                this.addDiagnostic(text, document, diagnostics, offset, Math.min(line.length, 120), t('linter.longSingleLine.description'), "long_query_line")
            }
            offset += line.length + 1
        }
    }

    private checkExplicitColumnAliasing(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const selectPattern = /\bselect\b(.*?)\bfrom\b/gi
        let selectMatch

        while ((selectMatch = selectPattern.exec(text)) !== null) {
            const columnsPart = selectMatch[1]
            const aliasWithoutAs = /\b(\w+)\s+(\w+)\s*(?:,|$)/gi
            let match

            while ((match = aliasWithoutAs.exec(columnsPart)) !== null) {
                if (!match[0].toLowerCase().includes('as')) {
                    this.addDiagnostic(text, document, diagnostics, selectMatch.index + match.index, match[0].length, t('linter.missingAsKeyword.description'), "explicit_column_aliasing")
                }
            }
        }
    }

    private checkMissingQueryComment(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const config = vscode.workspace.getConfiguration('Hive-Formatter')
        const thresholdLines = config.get<number>('lint.missing_query_comment_threshold_line_count', 20)
        const thresholdJoins = config.get<number>('lint.missing_query_comment_threshold_join_count', 3)
        const thresholdSubqueries = config.get<number>('lint.missing_query_comment_threshold_subquery_count', 2)

        if (document.lineCount < 20) return

        const selectPattern = /\bSELECT\b/gi
        let match
        while ((match = selectPattern.exec(text)) !== null) {
            const selectStartLine = document.positionAt(match.index).line
            const statementEnd = this.findStatementEnd(text, match.index)
            const statementEndLine = document.positionAt(statementEnd).line
            const lineCount = statementEndLine - selectStartLine + 1

            const statementText = text.substring(match.index, statementEnd)
            const joinCount = (statementText.match(/\bJOIN\b/gi) || []).length
            const subqueryCount = (statementText.match(/\(\s*SELECT\b/gi) || []).length

            const isComplex = lineCount >= thresholdLines || joinCount >= thresholdJoins || subqueryCount >= thresholdSubqueries
            if (!isComplex) continue

            const hasCommentAbove = this.hasCommentAboveLine(text, document, selectStartLine)
            if (hasCommentAbove) continue

            const details: string[] = []
            if (lineCount >= thresholdLines) details.push(`${lineCount}行`)
            if (joinCount >= thresholdJoins) details.push(`${joinCount}个JOIN`)
            if (subqueryCount >= thresholdSubqueries) details.push(`${subqueryCount}个子查询`)

            this.addDiagnostic(
                text, document, diagnostics,
                match.index, 6,
                t('linter.complexQueryComment.description', details.join('/')),
                "missing_query_comment"
            )
        }
    }

    private findStatementEnd(text: string, startIndex: number): number {
        let depth = 0
        let i = startIndex
        while (i < text.length) {
            if (text[i] === '(') depth++
            else if (text[i] === ')') depth--
            else if (text[i] === ';' && depth === 0) return i + 1
            i++
        }
        return text.length
    }

    private hasCommentAboveLine(text: string, document: vscode.TextDocument, line: number): boolean {
        for (let i = Math.max(0, line - 3); i < line; i++) {
            const lineText = document.lineAt(i).text.trim()
            if (lineText.startsWith('--') || lineText.startsWith('/*')) return true
        }
        return false
    }

    private checkMissingColumnComment(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const config = vscode.workspace.getConfiguration('Hive-Formatter')
        const aggregate = config.get<boolean>('lint.missing_column_comment_aggregate', true)
        const externalExempt = config.get<boolean>('lint.missing_column_comment_external_table_exempt', false)

        const createTablePattern = /\bCREATE\s+(?:EXTERNAL\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[\w.]+\s*\(/gi
        let ctMatch
        while ((ctMatch = createTablePattern.exec(text)) !== null) {
            const isExternal = /\bEXTERNAL\b/i.test(ctMatch[0])
            if (externalExempt && isExternal) continue

            const openParenIndex = ctMatch.index + ctMatch[0].length - 1
            const closeParenIndex = this.findMatchingParen(text, openParenIndex)
            if (closeParenIndex === -1) continue

            const columnsText = text.substring(openParenIndex + 1, closeParenIndex)
            const missingColumns: { name: string; index: number }[] = []

            const lines = columnsText.split('\n')
            let globalOffset = openParenIndex + 1
            for (const line of lines) {
                const trimmed = line.trim()
                if (!trimmed) { globalOffset += line.length + 1; continue }
                if (/^\s*(PRIMARY\s+KEY|CONSTRAINT|INDEX|KEY|UNIQUE|FOREIGN)/i.test(trimmed)) {
                    globalOffset += line.length + 1
                    continue
                }
                const colMatch = trimmed.match(/^(\w+)\s+\w+/)
                if (colMatch && !/COMMENT\s+'/.test(trimmed)) {
                    const colName = colMatch[1]
                    const colStartInLine = line.indexOf(colName)
                    missingColumns.push({
                        name: colName,
                        index: globalOffset + colStartInLine
                    })
                }
                globalOffset += line.length + 1
            }

            if (missingColumns.length === 0) continue

            if (aggregate && missingColumns.length > 1) {
                this.addDiagnostic(
                    text, document, diagnostics,
                    ctMatch.index, ctMatch[0].indexOf('('),
                    t('linter.createTableMissingComment.description', String(missingColumns.length)),
                    "missing_column_comment"
                )
            } else {
                for (const col of missingColumns) {
                    this.addDiagnostic(
                        text, document, diagnostics,
                        col.index, col.name.length,
                        t('linter.columnMissingComment.description', col.name),
                        "missing_column_comment"
                    )
                }
            }
        }
    }

    private findMatchingParen(text: string, openIndex: number): number {
        let depth = 0
        for (let i = openIndex; i < text.length; i++) {
            if (text[i] === '(') depth++
            else if (text[i] === ')') {
                depth--
                if (depth === 0) return i
            }
        }
        return -1
    }

    private checkCommentedOutCode(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const config = vscode.workspace.getConfiguration('Hive-Formatter')
        const thresholdLines = config.get<number>('lint.commented_out_code_threshold_lines', 3)

        const blockCommentPattern = /\/\*([\s\S]*?)\*\//g
        let match
        while ((match = blockCommentPattern.exec(text)) !== null) {
            const content = match[1]
            if (/sql-formatter-disable|sql-formatter-enable/i.test(content)) continue
            if (/^(?:\s*--\s*)?(?:示例|Example|说明|Description|Note|注意)/im.test(content)) continue

            const lines = content.split('\n').filter(l => l.trim().length > 0)
            if (lines.length < thresholdLines) continue

            const sqlKeywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'GROUP BY', 'ORDER BY', 'HAVING', 'UNION']
            let keywordCount = 0
            for (const kw of sqlKeywords) {
                if (new RegExp(`\\b${kw}\\b`, 'i').test(content)) keywordCount++
            }
            if (keywordCount < 3) continue

            this.addDiagnostic(
                text, document, diagnostics,
                match.index, 2,
                t('linter.commentedOutCode.description', String(lines.length)),
                "commented_out_code"
            )
        }

        const lineCommentGroups = this.findConsecutiveLineComments(text)
        for (const group of lineCommentGroups) {
            if (group.lineCount < thresholdLines) continue
            const content = group.text
            if (/sql-formatter-disable|sql-formatter-enable/i.test(content)) continue

            const sqlKeywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'GROUP BY', 'ORDER BY', 'HAVING', 'UNION']
            let keywordCount = 0
            for (const kw of sqlKeywords) {
                if (new RegExp(`\\b${kw}\\b`, 'i').test(content)) keywordCount++
            }
            if (keywordCount < 3) continue

            this.addDiagnostic(
                text, document, diagnostics,
                group.startIndex, 2,
                t('linter.commentedOutCode.description', String(group.lineCount)),
                "commented_out_code"
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

    private checkExpiredTodo(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const config = vscode.workspace.getConfiguration('Hive-Formatter')
        const gracePeriod = config.get<number>('lint.expired_todo_grace_period_days', 7)

        const todoPattern = /--\s*(TODO|FIXME)\s*\(\s*(\d{4}[-/]\d{2}[-/]\d{2})\s*\):?\s*.*/gi
        let match
        while ((match = todoPattern.exec(text)) !== null) {
            const dateStr = match[2].replace(/\//g, '-')
            const todoDate = new Date(dateStr)
            const now = new Date()
            now.setHours(0, 0, 0, 0)

            if (isNaN(todoDate.getTime())) continue

            const diffMs = now.getTime() - todoDate.getTime()
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

            if (diffDays <= gracePeriod) continue

            this.addDiagnostic(
                text, document, diagnostics,
                match.index, match[0].length,
                t('linter.expiredTodo.description', dateStr, String(diffDays)),
                "expired_todo"
            )
        }

        const todoUserPattern = /--\s*(TODO|FIXME)\s*\([^),]+,\s*(\d{4}[-/]\d{2}[-/]\d{2})\s*\):?\s*.*/gi
        while ((match = todoUserPattern.exec(text)) !== null) {
            const dateStr = match[2].replace(/\//g, '-')
            const todoDate = new Date(dateStr)
            const now = new Date()
            now.setHours(0, 0, 0, 0)

            if (isNaN(todoDate.getTime())) continue

            const diffMs = now.getTime() - todoDate.getTime()
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

            if (diffDays <= gracePeriod) continue

            this.addDiagnostic(
                text, document, diagnostics,
                match.index, match[0].length,
                t('linter.expiredTodo.description', dateStr, String(diffDays)),
                "expired_todo"
            )
        }

        const deadlinePattern = /--\s*(TODO|FIXME)[^\n]*@deadline\s+(\d{4}[-/]\d{2}[-/]\d{2})/gi
        while ((match = deadlinePattern.exec(text)) !== null) {
            const dateStr = match[2].replace(/\//g, '-')
            const todoDate = new Date(dateStr)
            const now = new Date()
            now.setHours(0, 0, 0, 0)

            if (isNaN(todoDate.getTime())) continue

            const diffMs = now.getTime() - todoDate.getTime()
            const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

            if (diffDays <= gracePeriod) continue

            this.addDiagnostic(
                text, document, diagnostics,
                match.index, match[0].length,
                t('linter.expiredTodo.description', dateStr, String(diffDays)),
                "expired_todo"
            )
        }
    }
}
