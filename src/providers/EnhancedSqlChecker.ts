import * as vscode from "vscode"
import { lineColFromIndex } from "../lexer/lineColFromIndex"

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
        const pattern = /\bhaving\b(?!.*\bgroup\s+by\b)/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            const lineCol = lineColFromIndex(text, match.index)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 6),
                `【第 ${lineNum} 行】代码质量建议：HAVING 子句通常需要与 GROUP BY 一起使用`,
                vscode.DiagnosticSeverity.Warning
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "HAVING_WITHOUT_GROUPBY"
            diagnostics.push(diagnostic)
        }
    }

    // 2. 检查 LIMIT 没有数字
    private checkLimitWithoutNumber(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern = /\blimit\b\s*(?!\d)/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            const lineCol = lineColFromIndex(text, match.index)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 5),
                `【第 ${lineNum} 行】语法错误：LIMIT 后面需要指定数字`,
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
                        `【第 ${lineNum} 行】代码质量建议：表别名 "${alias}" 重复使用，可能造成混淆`,
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
        const reservedWords = [
            'select', 'from', 'where', 'group', 'by', 'having', 'order', 'limit',
            'insert', 'update', 'delete', 'create', 'drop', 'alter', 'table',
            'join', 'left', 'right', 'inner', 'outer', 'full', 'on', 'and', 'or',
            'not', 'in', 'is', 'null', 'like', 'between', 'distinct', 'as', 'count',
            'sum', 'avg', 'max', 'min', 'union', 'all', 'any', 'exists', 'case',
            'when', 'then', 'else', 'end', 'default', 'values', 'set'
        ]
        
        const pattern = /\b(\w+)\b(?!\s*\()/gi
        let match
        
        while ((match = pattern.exec(text)) !== null) {
            const word = match[1].toLowerCase()
            if (reservedWords.includes(word) && !this.isReservedWordUsedAsKeyword(text, match.index)) {
                const lineCol = lineColFromIndex(text, match.index)
                const lineNum = lineCol.line
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + word.length),
                    `【第 ${lineNum} 行】代码质量建议："${word}" 是保留字，建议避免用作标识符或添加反引号`,
                    vscode.DiagnosticSeverity.Warning
                )
                diagnostic.source = "Hive Formatter"
                diagnostic.code = "RESERVED_WORD_IDENTIFIER"
                diagnostics.push(diagnostic)
            }
        }
    }

    private isReservedWordUsedAsKeyword(text: string, index: number): boolean {
        const beforeText = text.substring(0, index).toLowerCase()
        
        const currentWord = text.substring(index).match(/^\w+/i)?.[0].toLowerCase()
        if (!currentWord) return false
        
        // 特殊处理：CREATE/DROP/ALTER TABLE/... 等
        if (currentWord === 'table' || currentWord === 'view' || currentWord === 'function' || 
            currentWord === 'procedure' || currentWord === 'index' || currentWord === 'database' ||
            currentWord === 'schema') {
            // 检查前面是否有 create/drop/alter
            if (/(create|drop|alter)\s*$/.test(beforeText)) {
                return true
            }
        }
        
        // 特殊处理：INTO 在 INSERT 后面
        if (currentWord === 'into' && /insert\s*$/.test(beforeText)) {
            return true
        }
        
        // 特殊处理：SET 在 UPDATE 后面
        if (currentWord === 'set' && /update\s*$/.test(beforeText)) {
            return true
        }
        
        // 特殊处理：VALUES 在 INSERT 后面
        if (currentWord === 'values' && /insert\s*.*\s*$/.test(beforeText)) {
            return true
        }
        
        // 特殊处理：JOIN 相关
        if ((currentWord === 'join' || currentWord === 'inner' || currentWord === 'left' || 
             currentWord === 'right' || currentWord === 'full' || currentWord === 'outer' ||
             currentWord === 'on' || currentWord === 'using') && 
            /(from|join)\s*$/.test(beforeText)) {
            return true
        }
        
        // 特殊处理：BY 在 GROUP/ORDER 后面
        if (currentWord === 'by' && /(group|order)\s*$/.test(beforeText)) {
            return true
        }
        
        // 特殊处理：DISTINCT 在 SELECT 后面
        if (currentWord === 'distinct' && /select\s*$/.test(beforeText)) {
            return true
        }
        
        // 特殊处理：AND/OR/NOT/IN/IS/NULL/LIKE/BETWEEN 在 WHERE/HAVING 后面
        if ((currentWord === 'and' || currentWord === 'or' || currentWord === 'not' ||
             currentWord === 'in' || currentWord === 'is' || currentWord === 'null' ||
             currentWord === 'like' || currentWord === 'between') &&
            /(where|having)\s*.*$/.test(beforeText)) {
            return true
        }
        
        // 特殊处理：CASE 相关
        if ((currentWord === 'when' && /case\s*$/.test(beforeText)) ||
            (currentWord === 'then' && /when\s*.*$/.test(beforeText)) ||
            (currentWord === 'else' && /(when|then)\s*.*$/.test(beforeText)) ||
            (currentWord === 'end' && /(else|when)\s*.*$/.test(beforeText))) {
            return true
        }
        
        // 检查是否被反引号或引号包裹
        let isQuoted = false
        for (let i = index - 1; i >= 0; i--) {
            if (text[i] === '`' || text[i] === "'" || text[i] === '"') {
                isQuoted = true
                break
            }
            if (/[a-z0-9_]/i.test(text[i])) {
                continue
            }
            break
        }
        if (isQuoted) {
            return true
        }
        
        // 检查是否紧跟在常见关键字后面（说明它是关键字的一部分）
        const standaloneKeywords = ['select', 'from', 'where', 'group', 'order', 'limit', 
                                     'join', 'and', 'or', 'insert', 'update', 'delete',
                                     'create', 'drop', 'alter', 'case', 'when', 'then', 
                                     'else', 'end', 'default', 'values', 'set', 'as',
                                     'union', 'all', 'any', 'exists']
        
        if (standaloneKeywords.includes(currentWord)) {
            const beforeChar = index > 0 ? text[index - 1] : ''
            const afterChar = text[index + currentWord.length] || ''
            
            if ((beforeChar === '' || /\s/.test(beforeChar)) && (afterChar === '' || /\s/.test(afterChar))) {
                return true
            }
        }
        
        return false
    }

    // 5. 检查空的 JOIN
    private checkEmptyJoin(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern = /\bjoin\b\s*(?![\w\s]+on)/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            const lineCol = lineColFromIndex(text, match.index)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 4),
                `【第 ${lineNum} 行】语法错误：JOIN 缺少 ON 子句`,
                vscode.DiagnosticSeverity.Error
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "EMPTY_JOIN"
            diagnostics.push(diagnostic)
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
                    `【第 ${lineNum} 行】代码质量建议：SELECT 语句通常需要 FROM 子句`,
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
                openParens--
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
                `【第 ${lineNum} 行】语法错误：DISTINCT 应该紧跟在 SELECT 后面，而不是在列中间`,
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
        const pattern = new RegExp(`\\bwhere\\b[^;]*\\b(${aggregates.join('|')})\\s*\\(`, 'gi')
        let match
        while ((match = pattern.exec(text)) !== null) {
            const lineCol = lineColFromIndex(text, match.index)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 5),
                `【第 ${lineNum} 行】语法错误：聚合函数不能在 WHERE 子句中使用，应该使用 HAVING`,
                vscode.DiagnosticSeverity.Error
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "AGGREGATE_IN_WHERE"
            diagnostics.push(diagnostic)
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
                `【第 ${lineNum} 行】语法错误：UPDATE 语句中不能使用 * 作为列名`,
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
                `【第 ${lineNum} 行】代码质量建议：INSERT 语句建议明确指定列名`,
                vscode.DiagnosticSeverity.Warning
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "INSERT_WITHOUT_COLUMNS"
            diagnostics.push(diagnostic)
        }
    }

    // 11. 检查不完整的 CASE 语句
    private checkIncompleteCase(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern = /\bcase\b(?!.*\bend\b)/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            const lineCol = lineColFromIndex(text, match.index)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 4),
                `【第 ${lineNum} 行】语法错误：CASE 语句缺少 END 关键字`,
                vscode.DiagnosticSeverity.Error
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "INCOMPLETE_CASE"
            diagnostics.push(diagnostic)
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
                `【第 ${lineNum} 行】代码质量建议：COUNT(DISTINCT *) 是冗余的，直接使用 COUNT(*) 即可`,
                vscode.DiagnosticSeverity.Warning
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "REDUNDANT_DISTINCT"
            diagnostics.push(diagnostic)
        }
    }

    // 13. 检查子查询没有别名
    private checkSubqueryWithoutAlias(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern = /\bfrom\s*\([^)]*\)(?!\s+\w+)/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            const lineCol = lineColFromIndex(text, match.index)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 4),
                `【第 ${lineNum} 行】代码质量建议：子查询应该指定别名`,
                vscode.DiagnosticSeverity.Warning
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "SUBQUERY_WITHOUT_ALIAS"
            diagnostics.push(diagnostic)
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
                `【第 ${lineNum} 行】代码质量建议：NULL 比较应该使用 ${suggestion} 而不是 ${operator} NULL`,
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
        const mysqlFunctions = [
            { func: 'date_add', hint: '在 Hive 中使用 date_add 也可以，但建议确认版本' },
            { func: 'date_sub', hint: '在 Hive 中使用 date_sub 也可以，但建议确认版本' },
            { func: 'now()', hint: '在 Hive 中可以使用 current_timestamp()' },
            { func: 'sysdate()', hint: '在 Hive 中可以使用 current_timestamp()' }
        ]
        
        for (const funcInfo of mysqlFunctions) {
            const pattern = new RegExp(`\\b${funcInfo.func}\\b`, 'gi')
            let match
            while ((match = pattern.exec(text)) !== null) {
                const lineCol = lineColFromIndex(text, match.index)
                const lineNum = lineCol.line
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + match[0].length),
                    `【第 ${lineNum} 行】方言提示：${funcInfo.hint}`,
                    vscode.DiagnosticSeverity.Information
                )
                diagnostic.source = "Hive Formatter"
                diagnostic.code = "DATE_FUNCTION_HINT"
                diagnostics.push(diagnostic)
            }
        }
    }
}
