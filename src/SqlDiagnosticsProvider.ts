import * as vscode from "vscode"
import { createParser } from "./parser/createParser"
import { sqlDialects } from "./sqlDialects"
import { createDialect } from "./languages/dialect"
import * as allDialects from "./languages/allDialects"
import { lineColFromIndex } from "./lexer/lineColFromIndex"

export class SqlDiagnosticsProvider {
    private diagnosticCollection: vscode.DiagnosticCollection

    constructor() {
        this.diagnosticCollection =
            vscode.languages.createDiagnosticCollection("hive-formatter")
    }

    /**
     * 提供语法诊断
     * @param document - 要检查的文档
     */
    public provideDiagnostics(document: vscode.TextDocument): void {
        const diagnostics: vscode.Diagnostic[] = []
        const text = document.getText()

        if (!text.trim()) {
            this.diagnosticCollection.set(document.uri, [])
            return
        }

        try {
            const vscodeLang = document.languageId
            const sqlDialectName =
                sqlDialects[vscodeLang as keyof typeof sqlDialects] || "hive"
            const dialect =
                allDialects[sqlDialectName as keyof typeof allDialects]

            const parser = createParser(createDialect(dialect).tokenizer)
            parser.parse(text, {})
            
            // 解析成功，现在做一些额外的语法检查
            const extraDiagnostics = this.checkForCommonErrors(text, document)
            diagnostics.push(...extraDiagnostics)
        } catch (error) {
            const diagnostic = this.createDiagnosticFromError(error, text, document)
            if (diagnostic) {
                diagnostics.push(diagnostic)
            }
        }

        this.diagnosticCollection.set(document.uri, diagnostics)
    }

    /**
     * 检查常见的 SQL 语法错误
     */
    private checkForCommonErrors(text: string, document: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        
        // 1. 检查：逗号后面没有列名的情况 (如 "select id, from ...")
        this.checkCommaFollowedByFrom(text, document, diagnostics)
        
        // 2. 检查：SELECT 后面没有列名
        this.checkSelectWithNoColumns(text, document, diagnostics)
        
        // 3. 检查：FROM 后面没有表名
        this.checkFromWithNoTable(text, document, diagnostics)
        
        // 4. 检查：不匹配的括号
        this.checkMismatchedParentheses(text, document, diagnostics)
        
        // 5. 检查：字符串没有正确闭合
        this.checkUnclosedStrings(text, document, diagnostics)
        
        // 6. 检查：ORDER BY 后面没有列名
        this.checkOrderByWithNoColumn(text, document, diagnostics)
        
        // 7. 检查：WHERE 后面没有条件
        this.checkWhereWithNoCondition(text, document, diagnostics)
        
        // 8. 检查：GROUP BY 后面没有列名
        this.checkGroupByWithNoColumn(text, document, diagnostics)
        
        // 9. 检查：多余的逗号
        this.checkExtraCommas(text, document, diagnostics)
        
        return diagnostics
    }

    /**
     * 检查逗号后面直接跟 FROM 的情况
     */
    private checkCommaFollowedByFrom(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        // 正则表达式：检查逗号后面紧跟着 FROM（忽略中间的空白和换行）
        // 但是要确保我们不会误报正常的情况
        const pattern = /,(\s*)\bfrom\b/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            // 检查逗号前面是否有列名，避免误报
            const beforeComma = text.substring(Math.max(0, match.index - 50), match.index)
            // 如果逗号前面是 SELECT 关键字，这可能是一个正常的单列表查询
            // 但是等等，我们原来的例子是 select id from，这里没有逗号，所以我们需要仔细分析
            const lineCol = lineColFromIndex(text, match.index)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 1),
                `【第 ${lineNum} 行】语法错误：逗号后面缺少列名或表达式`,
                vscode.DiagnosticSeverity.Error
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "COMMA_FROM"
            diagnostics.push(diagnostic)
        }
    }

    /**
     * 检查 SELECT 后面没有列名的情况
     */
    private checkSelectWithNoColumns(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        // 先找到所有的 SELECT 关键字
        const selectPattern = /\bselect\b/gi;
        let selectMatch: RegExpExecArray | null;
        
        while ((selectMatch = selectPattern.exec(text)) !== null) {
            const selectStart = selectMatch.index;
            const selectEnd = selectStart + 6; // 'select'.length = 6
            
            // 获取 SELECT 之后的所有内容
            const afterSelect = text.substring(selectEnd);
            
            // 寻找接下来的第一个 FROM 关键字
            const fromMatch = /\bfrom\b/i.exec(afterSelect);
            if (fromMatch) {
                const fromStartRelative = fromMatch.index;
                // 检查 SELECT 和 FROM 之间的内容
                const betweenText = afterSelect.substring(0, fromStartRelative).trim();
                
                // 如果中间没有任何内容，那就是语法错误
                if (betweenText === '') {
                    const lineCol = lineColFromIndex(text, selectStart);
                    const lineNum = lineCol.line;
                    const diagnostic = new vscode.Diagnostic(
                        new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 6),
                        `【第 ${lineNum} 行】语法错误：SELECT 关键字后面缺少要查询的列名`,
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostic.source = "Hive Formatter";
                    diagnostic.code = "SELECT_NO_COLUMNS";
                    diagnostics.push(diagnostic);
                }
            }
        }
    }

    /**
     * 检查 FROM 后面没有表名的情况
     */
    private checkFromWithNoTable(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        // 先找到所有的 FROM 关键字
        const fromPattern = /\bfrom\b/gi;
        let fromMatch: RegExpExecArray | null;
        
        while ((fromMatch = fromPattern.exec(text)) !== null) {
            const fromStart = fromMatch.index;
            const fromEnd = fromStart + 4; // 'from'.length = 4
            
            // 获取 FROM 之后的所有内容
            const afterFrom = text.substring(fromEnd);
            
            // 寻找 FROM 之后接下来的内容，直到遇到分号或结束
            const semicolonMatch = /[;$]/i.exec(afterFrom);
            const endPosition = semicolonMatch ? semicolonMatch.index : afterFrom.length;
            const afterFromText = afterFrom.substring(0, endPosition).trim();
            
            // 如果后面没有任何内容，那就是语法错误
            if (afterFromText === '') {
                const lineCol = lineColFromIndex(text, fromStart);
                const lineNum = lineCol.line;
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 4),
                    `【第 ${lineNum} 行】语法错误：FROM 关键字后面缺少表名`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.source = "Hive Formatter";
                diagnostic.code = "FROM_NO_TABLE";
                diagnostics.push(diagnostic);
            }
        }
    }

    /**
     * 检查不匹配的括号
     */
    private checkMismatchedParentheses(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        let openParens: number[] = []
        for (let i = 0; i < text.length; i++) {
            if (text[i] === '(') {
                openParens.push(i)
            } else if (text[i] === ')') {
                if (openParens.length === 0) {
                    // 多余的右括号
                    const lineCol = lineColFromIndex(text, i)
                    const lineNum = lineCol.line
                    const diagnostic = new vscode.Diagnostic(
                        new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 1),
                        `【第 ${lineNum} 行】语法错误：发现多余的右括号 ")"，没有对应的左括号 "("`,
                        vscode.DiagnosticSeverity.Error
                    )
                    diagnostic.source = "Hive Formatter"
                    diagnostic.code = "EXTRA_PAREN"
                    diagnostics.push(diagnostic)
                } else {
                    openParens.pop()
                }
            }
        }
        // 检查没有闭合的左括号
        for (const pos of openParens) {
            const lineCol = lineColFromIndex(text, pos)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 1),
                `【第 ${lineNum} 行】语法错误：左括号 "(" 没有被正确闭合，缺少对应的右括号 ")"`,
                vscode.DiagnosticSeverity.Error
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "UNclosed_PAREN"
            diagnostics.push(diagnostic)
        }
    }

    /**
     * 检查没有正确闭合的字符串
     */
    private checkUnclosedStrings(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        let inString = false
        let stringStartPos = -1
        let currentQuote = ''
        
        for (let i = 0; i < text.length; i++) {
            if (!inString && (text[i] === "'" || text[i] === '"')) {
                inString = true
                stringStartPos = i
                currentQuote = text[i]
            } else if (inString && text[i] === currentQuote) {
                inString = false
                stringStartPos = -1
            }
        }
        
        if (inString && stringStartPos !== -1) {
            const lineCol = lineColFromIndex(text, stringStartPos)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 1),
                `【第 ${lineNum} 行】语法错误：字符串没有正确闭合，缺少结束的 ${currentQuote}`,
                vscode.DiagnosticSeverity.Error
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "UNclosed_STRING"
            diagnostics.push(diagnostic)
        }
    }

    /**
     * 检查 ORDER BY 后面没有列名
     */
    private checkOrderByWithNoColumn(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        // 先找到所有的 ORDER BY 关键字
        const orderByPattern = /\border\s+by\b/gi;
        let orderByMatch: RegExpExecArray | null;
        
        while ((orderByMatch = orderByPattern.exec(text)) !== null) {
            const orderByStart = orderByMatch.index;
            const orderByEnd = orderByStart + orderByMatch[0].length;
            
            // 获取 ORDER BY 之后的所有内容
            const afterOrderBy = text.substring(orderByEnd);
            
            // 寻找接下来的可能表示结束的关键字或符号
            const endMatch = /(?:;|$|\bwhere\b|\bgroup\b|\bhaving\b|\blimit\b)/i.exec(afterOrderBy);
            const endPosition = endMatch ? endMatch.index : afterOrderBy.length;
            const afterOrderByText = afterOrderBy.substring(0, endPosition).trim();
            
            // 如果后面没有任何内容，那就是语法错误
            if (afterOrderByText === '') {
                const lineCol = lineColFromIndex(text, orderByStart);
                const lineNum = lineCol.line;
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 8),
                    `【第 ${lineNum} 行】语法错误：ORDER BY 后面缺少排序的列名`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.source = "Hive Formatter";
                diagnostic.code = "ORDERBY_NO_COL";
                diagnostics.push(diagnostic);
            }
        }
    }

    /**
     * 检查 WHERE 后面没有条件
     */
    private checkWhereWithNoCondition(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        // 先找到所有的 WHERE 关键字
        const wherePattern = /\bwhere\b/gi;
        let whereMatch: RegExpExecArray | null;
        
        while ((whereMatch = wherePattern.exec(text)) !== null) {
            const whereStart = whereMatch.index;
            const whereEnd = whereStart + 5; // 'where'.length = 5
            
            // 获取 WHERE 之后的所有内容
            const afterWhere = text.substring(whereEnd);
            
            // 寻找接下来的可能表示结束的关键字或符号
            const endMatch = /(?:;|$|\bgroup\b|\border\b|\blimit\b)/i.exec(afterWhere);
            const endPosition = endMatch ? endMatch.index : afterWhere.length;
            const afterWhereText = afterWhere.substring(0, endPosition).trim();
            
            // 如果后面没有任何内容，那就是语法错误
            if (afterWhereText === '') {
                const lineCol = lineColFromIndex(text, whereStart);
                const lineNum = lineCol.line;
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 5),
                    `【第 ${lineNum} 行】语法错误：WHERE 后面缺少查询条件`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.source = "Hive Formatter";
                diagnostic.code = "WHERE_NO_CONDITION";
                diagnostics.push(diagnostic);
            }
        }
    }

    /**
     * 检查 GROUP BY 后面没有列名
     */
    private checkGroupByWithNoColumn(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        // 先找到所有的 GROUP BY 关键字
        const groupByPattern = /\bgroup\s+by\b/gi;
        let groupByMatch: RegExpExecArray | null;
        
        while ((groupByMatch = groupByPattern.exec(text)) !== null) {
            const groupByStart = groupByMatch.index;
            const groupByEnd = groupByStart + groupByMatch[0].length;
            
            // 获取 GROUP BY 之后的所有内容
            const afterGroupBy = text.substring(groupByEnd);
            
            // 寻找接下来的可能表示结束的关键字或符号
            const endMatch = /(?:;|$|\bwhere\b|\bhaving\b|\border\b|\blimit\b)/i.exec(afterGroupBy);
            const endPosition = endMatch ? endMatch.index : afterGroupBy.length;
            const afterGroupByText = afterGroupBy.substring(0, endPosition).trim();
            
            // 如果后面没有任何内容，那就是语法错误
            if (afterGroupByText === '') {
                const lineCol = lineColFromIndex(text, groupByStart);
                const lineNum = lineCol.line;
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 8),
                    `【第 ${lineNum} 行】语法错误：GROUP BY 后面缺少分组的列名`,
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.source = "Hive Formatter";
                diagnostic.code = "GROUPBY_NO_COL";
                diagnostics.push(diagnostic);
            }
        }
    }

    /**
     * 检查多余的逗号
     */
    private checkExtraCommas(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        // 检查：逗号后面是右括号
        const pattern1 = /,(\s*)\)/g
        let match
        while ((match = pattern1.exec(text)) !== null) {
            const lineCol = lineColFromIndex(text, match.index)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 1),
                `【第 ${lineNum} 行】语法警告：在右括号前发现多余的逗号`,
                vscode.DiagnosticSeverity.Warning
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "EXTRA_COMMA_PAREN"
            diagnostics.push(diagnostic)
        }
        
        // 检查：逗号后面是分号
        const pattern2 = /,(\s*);/g
        while ((match = pattern2.exec(text)) !== null) {
            const lineCol = lineColFromIndex(text, match.index)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 1),
                `【第 ${lineNum} 行】语法警告：在语句结束前发现多余的逗号`,
                vscode.DiagnosticSeverity.Warning
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "EXTRA_COMMA_SEMI"
            diagnostics.push(diagnostic)
        }
    }

    /**
     * 从错误创建诊断信息
     */
    private createDiagnosticFromError(
        error: unknown,
        text: string,
        document: vscode.TextDocument,
    ): vscode.Diagnostic | undefined {
        let message = "SQL 语法错误"
        let line = 0
        let col = 0
        let endLine = 0
        let endCol = 1

        if (error instanceof Error) {
            message = this.formatErrorMessage(error.message)
            
            const positionMatch = error.message.match(/at position (\d+)/)
            if (positionMatch) {
                const position = parseInt(positionMatch[1], 10)
                const lineCol = lineColFromIndex(text, position)
                line = lineCol.line - 1
                col = lineCol.col - 1
                message = `【第 ${lineCol.line} 行】${message}`
                
                if (line < document.lineCount) {
                    const lineText = document.lineAt(line).text
                    endLine = line
                    endCol = Math.min(col + 1, lineText.length)
                }
            }
        }

        const range = new vscode.Range(line, col, endLine, endCol)
        const diagnostic = new vscode.Diagnostic(
            range,
            message,
            vscode.DiagnosticSeverity.Error,
        )
        diagnostic.source = "Hive Formatter"
        return diagnostic
    }

    /**
     * 格式化错误消息，移除位置信息（因为会单独显示）
     */
    private formatErrorMessage(message: string): string {
        return message.replace(/\s+at position \d+$/, "")
    }

    /**
     * 清除指定文档的诊断信息
     */
    public clearDiagnostics(uri: vscode.Uri): void {
        this.diagnosticCollection.delete(uri)
    }

    /**
     * 释放资源
     */
    public dispose(): void {
        this.diagnosticCollection.dispose()
    }
}
