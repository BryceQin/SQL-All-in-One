import * as vscode from "vscode"
import { lineColFromIndex } from "../lexer/lineColFromIndex"
import { t } from "../i18n"

export class EnhancedSqlChecker {
    public checkEnhancedIssues(text: string, document: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        
        // 新增的增强检查
        this.checkHavingWithoutGroupBy(text, document, diagnostics)
        this.checkLimitWithoutNumber(text, document, diagnostics)
        this.checkDuplicateTableAliases(text, document, diagnostics)
        this.checkReservedWordIdentifiers(text, document, diagnostics)
        this.checkEmptyJoin(text, document, diagnostics)
        this.checkSelectWithoutFrom(text, document, diagnostics)
        this.checkMisplacedDistinct(text, document, diagnostics)
        this.checkAggregateInWhere(text, document, diagnostics)
        this.checkWildcardInUpdate(text, document, diagnostics)
        this.checkInsertWithoutColumns(text, document, diagnostics)
        this.checkIncompleteCase(text, document, diagnostics)
        this.checkRedundantDistinct(text, document, diagnostics)
        this.checkSubqueryWithoutAlias(text, document, diagnostics)
        this.checkSuspiciousNullComparison(text, document, diagnostics)
        this.checkDateFunctionUsage(text, document, diagnostics)
        
        return diagnostics
    }

    // 1. 检查 HAVING 没有 GROUP BY
    private checkHavingWithoutGroupBy(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern = /\bhaving\b/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            const beforeHaving = text.substring(0, match.index)
            if (!/\bgroup\s+by\b/i.test(beforeHaving)) {
                const lineCol = lineColFromIndex(text, match.index)
                const lineNum = lineCol.line
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 6),
                    t('enhanced.havingWithoutGroupBy', String(lineNum)),
                    vscode.DiagnosticSeverity.Warning
                )
                diagnostic.source = "Hive Formatter"
                diagnostic.code = "HAVING_WITHOUT_GROUPBY"
                diagnostics.push(diagnostic)
            }
        }
    }

    // 2. 检查 LIMIT 没有数字
    private checkLimitWithoutNumber(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern = /\blimit\b\s*(?!\d|\?|:[$:?@]?\w+|ALL\b|OFFSET\b)/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            const lineCol = lineColFromIndex(text, match.index)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 5),
                t('enhanced.limitWithoutNumber', String(lineNum)),
                vscode.DiagnosticSeverity.Error
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "LIMIT_WITHOUT_NUMBER"
            diagnostics.push(diagnostic)
        }
    }

    // 3. 检查重复的表别名
    private checkDuplicateTableAliases(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const aliasPattern = /\bfrom\s+\w+\s+(\w+)\b|\bjoin\s+\w+\s+(\w+)\b/gi
        const aliases = new Map<string, number[]>()
        let match
        
        while ((match = aliasPattern.exec(text)) !== null) {
            const alias = (match[1] || match[2])?.toLowerCase()
            if (alias) {
                if (!aliases.has(alias)) {
                    aliases.set(alias, [])
                }
                const aliasPositions = aliases.get(alias)
                if (aliasPositions) {
                    aliasPositions.push(match.index)
                }
            }
        }
        
        for (const [alias, positions] of aliases) {
            if (positions.length > 1) {
                for (let i = 1; i < positions.length; i++) {
                    const lineCol = lineColFromIndex(text, positions[i])
                    const lineNum = lineCol.line
                    const diagnostic = new vscode.Diagnostic(
                        new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + alias.length),
                        t('enhanced.duplicateAlias', String(lineNum), alias),
                        vscode.DiagnosticSeverity.Warning
                    )
                    diagnostic.source = "Hive Formatter"
                    diagnostic.code = "DUPLICATE_ALIAS"
                    diagnostics.push(diagnostic)
                }
            }
        }
    }

    // 4. 检查使用保留字作为标识符
    private checkReservedWordIdentifiers(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const reservedWords = new Set([
            'select', 'from', 'where', 'group', 'by', 'having', 'order', 'limit',
            'insert', 'update', 'delete', 'create', 'drop', 'alter', 'table',
            'join', 'left', 'right', 'inner', 'outer', 'full', 'on', 'and', 'or',
            'not', 'in', 'is', 'null', 'like', 'between', 'distinct', 'as', 'count',
            'sum', 'avg', 'max', 'min', 'union', 'all', 'any', 'exists', 'case',
            'when', 'then', 'else', 'end', 'default', 'values', 'set'
        ])

        const aliasPattern = /\bas\s+(\w+)\b/gi
        let match
        while ((match = aliasPattern.exec(text)) !== null) {
            const alias = match[1].toLowerCase()
            if (reservedWords.has(alias)) {
                const lineCol = lineColFromIndex(text, match.index + 3)
                const lineNum = lineCol.line
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + match[1].length),
                    t('enhanced.reservedWordIdentifier', String(lineNum), match[1]),
                    vscode.DiagnosticSeverity.Warning
                )
                diagnostic.source = "Hive Formatter"
                diagnostic.code = "RESERVED_WORD_IDENTIFIER"
                diagnostics.push(diagnostic)
            }
        }
    }

    // 5. 检查空的 JOIN
    private checkEmptyJoin(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern = /\bjoin\b/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            const beforeJoin = text.substring(0, match.index)
            const joinTypeMatch = beforeJoin.match(/\b(cross|natural\s+(?:left|right|inner|full|outer)?\s*)$/i)
            if (joinTypeMatch) continue

            const afterJoin = text.substring(match.index + 4)
            const hasOnClause = /\bon\b/i.test(afterJoin.substring(0, 200))
            const hasUsingClause = /\busing\b/i.test(afterJoin.substring(0, 200))
            if (!hasOnClause && !hasUsingClause) {
                const lineCol = lineColFromIndex(text, match.index)
                const lineNum = lineCol.line
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 4),
                    t('enhanced.joinMissingOn', String(lineNum)),
                    vscode.DiagnosticSeverity.Warning
                )
                diagnostic.source = "Hive Formatter"
                diagnostic.code = "EMPTY_JOIN"
                diagnostics.push(diagnostic)
            }
        }
    }

    // 6. 检查 SELECT 没有 FROM（除了特定函数调用）
    private checkSelectWithoutFrom(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const selectPattern = /\bselect\b/gi
        let match
        while ((match = selectPattern.exec(text)) !== null) {
            // 在同一个查询范围内查找是否有 FROM
            const searchEnd = this.findQueryEnd(text, match.index)
            const queryText = text.substring(match.index, searchEnd)
            
            // 检查是否有 FROM
            const hasFrom = /\bfrom\b/i.test(queryText)
            
            // 检查是否有特定的函数调用（不需要 FROM）
            const hasNoFromFunctions = /\b(now|current_date|current_timestamp|sysdate|uuid|getdate|current_time)\s*\(/i.test(queryText)
            
            // 只有当没有 FROM 且没有特定函数时才显示警告
            if (!hasFrom && !hasNoFromFunctions) {
                const lineCol = lineColFromIndex(text, match.index)
                const lineNum = lineCol.line
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 6),
                    t('enhanced.selectWithoutFrom', String(lineNum)),
                    vscode.DiagnosticSeverity.Warning
                )
                diagnostic.source = "Hive Formatter"
                diagnostic.code = "SELECT_WITHOUT_FROM"
                diagnostics.push(diagnostic)
            }
        }
    }
    
    // 查找查询语句的结束位置
    private findQueryEnd(text: string, startIndex: number): number {
        let openParens = 0
        let endIndex = startIndex
        
        for (let i = startIndex; i < text.length; i++) {
            const char = text[i]
            
            if (char === '(') {
                openParens++
            } else if (char === ')') {
                if (openParens > 0) openParens--
            } else if (char === ';' && openParens === 0) {
                endIndex = i + 1
                break
            }
            
            // 检查是否是新的语句开始
            if (openParens === 0) {
                const nextWordMatch = text.substring(i).match(/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\b/i)
                if (nextWordMatch && i > startIndex) {
                    endIndex = i
                    break
                }
            }
            
            endIndex = i + 1
        }
        
        return endIndex
    }

    // 7. 检查 DISTINCT 位置错误
    private checkMisplacedDistinct(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern = /\bselect\b[^,]*,\s*\bdistinct\b/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            const lineCol = lineColFromIndex(text, match.index)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 8),
                t('enhanced.distinctMisplaced', String(lineNum)),
                vscode.DiagnosticSeverity.Error
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "MISPLACED_DISTINCT"
            diagnostics.push(diagnostic)
        }
    }

    // 8. 检查 WHERE 子句中使用聚合函数
    private checkAggregateInWhere(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const aggregates = ['count', 'sum', 'avg', 'max', 'min']
        const wherePattern = /\bwhere\b/gi
        let whereMatch
        while ((whereMatch = wherePattern.exec(text)) !== null) {
            const afterWhere = text.substring(whereMatch.index + 5)
            const clauseEnd = afterWhere.search(/\b(group\s+by|having|order\s+by|limit|union|;|$)/i)
            const whereClause = clauseEnd !== -1 ? afterWhere.substring(0, clauseEnd) : afterWhere

            const subqueryRanges: [number, number][] = []
            let parenDepth = 0
            let subqueryStart = -1
            for (let i = 0; i < whereClause.length; i++) {
                if (whereClause[i] === '(') {
                    parenDepth++
                    if (parenDepth === 1) {
                        const rest = whereClause.substring(i + 1).trimStart()
                        if (/^select\b/i.test(rest)) {
                            subqueryStart = i
                        }
                    }
                } else if (whereClause[i] === ')') {
                    if (parenDepth === 1 && subqueryStart !== -1) {
                        subqueryRanges.push([subqueryStart, i])
                        subqueryStart = -1
                    }
                    parenDepth--
                }
            }

            for (const agg of aggregates) {
                const aggPattern = new RegExp(`\\b${agg}\\s*\\(`, 'gi')
                let aggMatch
                while ((aggMatch = aggPattern.exec(whereClause)) !== null) {
                    const aggPos = aggMatch.index
                    const inSub = subqueryRanges.some(([start, end]) => aggPos >= start && aggPos <= end)
                    if (!inSub) {
                        const absIndex = whereMatch.index + 5 + aggMatch.index
                        const lineCol = lineColFromIndex(text, absIndex)
                        const lineNum = lineCol.line
                        const diagnostic = new vscode.Diagnostic(
                            new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + agg.length),
                            t('enhanced.aggregateInWhere', String(lineNum)),
                            vscode.DiagnosticSeverity.Error
                        )
                        diagnostic.source = "Hive Formatter"
                        diagnostic.code = "AGGREGATE_IN_WHERE"
                        diagnostics.push(diagnostic)
                    }
                }
            }
        }
    }

    // 9. 检查 UPDATE 中使用 *
    private checkWildcardInUpdate(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern = /\bupdate\b[^;]*\*\s*=/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            const lineCol = lineColFromIndex(text, match.index)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 6),
                t('enhanced.starInUpdate', String(lineNum)),
                vscode.DiagnosticSeverity.Error
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "WILDCARD_IN_UPDATE"
            diagnostics.push(diagnostic)
        }
    }

    // 10. 检查 INSERT 没有指定列名
    private checkInsertWithoutColumns(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern = /\binsert\s+into\s+\w+\s*\bvalues\b/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            const lineCol = lineColFromIndex(text, match.index)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 6),
                t('enhanced.insertWithoutColumns', String(lineNum)),
                vscode.DiagnosticSeverity.Warning
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "INSERT_WITHOUT_COLUMNS"
            diagnostics.push(diagnostic)
        }
    }

    // 11. 检查不完整的 CASE 语句
    private checkIncompleteCase(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const casePattern = /\bcase\b/gi
        let caseMatch
        while ((caseMatch = casePattern.exec(text)) !== null) {
            const afterCase = text.substring(caseMatch.index + 4)
            let depth = 1
            let hasEnd = false
            let i = 0
            while (i < afterCase.length && depth > 0) {
                const ch = afterCase[i].toLowerCase()
                if (ch === 'c' && afterCase.substring(i, i + 4).toLowerCase() === 'case' && (i === 0 || !/\w/.test(afterCase[i - 1])) && (i + 4 >= afterCase.length || !/\w/.test(afterCase[i + 4]))) {
                    depth++
                    i += 4
                } else if (ch === 'e' && afterCase.substring(i, i + 3).toLowerCase() === 'end' && (i === 0 || !/\w/.test(afterCase[i - 1])) && (i + 3 >= afterCase.length || !/\w/.test(afterCase[i + 3]))) {
                    depth--
                    if (depth === 0) hasEnd = true
                    i += 3
                } else {
                    i++
                }
            }
            if (!hasEnd) {
                const lineCol = lineColFromIndex(text, caseMatch.index)
                const lineNum = lineCol.line
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 4),
                    t('enhanced.caseMissingEnd', String(lineNum)),
                    vscode.DiagnosticSeverity.Error
                )
                diagnostic.source = "Hive Formatter"
                diagnostic.code = "INCOMPLETE_CASE"
                diagnostics.push(diagnostic)
            }
        }
    }

    // 12. 检查冗余的 DISTINCT（在 COUNT 中）
    private checkRedundantDistinct(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern = /\bcount\s*\(\s*\bdistinct\s*\*\s*\)/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            const lineCol = lineColFromIndex(text, match.index)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 5),
                t('enhanced.countDistinctStar', String(lineNum)),
                vscode.DiagnosticSeverity.Warning
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "REDUNDANT_DISTINCT"
            diagnostics.push(diagnostic)
        }
    }

    // 13. 检查子查询没有别名
    private checkSubqueryWithoutAlias(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const fromPattern = /\bfrom\s*\(/gi
        let fromMatch
        while ((fromMatch = fromPattern.exec(text)) !== null) {
            const openParenIndex = text.indexOf('(', fromMatch.index + 4)
            if (openParenIndex === -1) continue

            let depth = 1
            let closeParenIndex = openParenIndex + 1
            while (closeParenIndex < text.length && depth > 0) {
                if (text[closeParenIndex] === '(') depth++
                else if (text[closeParenIndex] === ')') depth--
                closeParenIndex++
            }

            const afterClose = text.substring(closeParenIndex).trimStart()
            const hasAlias = /^\w+/.test(afterClose) && !/^(where|group|having|order|limit|union|on|join|inner|left|right|full|cross|natural|set|;|\))/i.test(afterClose)
            if (!hasAlias) {
                const lineCol = lineColFromIndex(text, fromMatch.index)
                const lineNum = lineCol.line
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 4),
                    t('enhanced.subqueryMissingAlias', String(lineNum)),
                    vscode.DiagnosticSeverity.Warning
                )
                diagnostic.source = "Hive Formatter"
                diagnostic.code = "SUBQUERY_WITHOUT_ALIAS"
                diagnostics.push(diagnostic)
            }
        }
    }

    // 14. 检查可疑的 NULL 比较（= NULL 或 != NULL）
    private checkSuspiciousNullComparison(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern = /\b(\w+)\s*(=|!=|<>)\s*null\b/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            const lineCol = lineColFromIndex(text, match.index)
            const lineNum = lineCol.line
            const operator = match[2]
            const suggestion = operator === '=' ? 'IS NULL' : 'IS NOT NULL'
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + match[0].length),
                t('enhanced.nullComparison', String(lineNum), suggestion, operator),
                vscode.DiagnosticSeverity.Warning
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "SUSPICIOUS_NULL_COMPARISON"
            diagnostics.push(diagnostic)
        }
    }

    // 15. 检查日期函数使用（Hive vs MySQL 差异）
    private checkDateFunctionUsage(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        // 检查 MySQL 特有的日期函数
        const mysqlFunctions = ['date_add', 'date_sub', 'now', 'sysdate']
        
        for (const funcName of mysqlFunctions) {
            const pattern = new RegExp(`\\b${funcName}\\s*\\(`, 'gi')
            let match
            while ((match = pattern.exec(text)) !== null) {
                const lineCol = lineColFromIndex(text, match.index)
                const lineNum = lineCol.line
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + match[0].length),
                    t('enhanced.dateFunctionHint', funcName),
                    vscode.DiagnosticSeverity.Information
                )
                diagnostic.source = "Hive Formatter"
                diagnostic.code = "DATE_FUNCTION_HINT"
                diagnostics.push(diagnostic)
            }
        }
    }
}
