import * as vscode from "vscode"
import { createParser } from "../parser/createParser"
import { sqlDialects } from "../core/sqlDialects"
import { createDialect } from "../languages/dialect"
import type { DialectOptions } from "../languages/dialect"
import * as allDialects from "../languages/allDialects"
import { lineColFromIndex } from "../lexer/lineColFromIndex"
import { t } from "../i18n"
import { EnhancedSqlChecker } from "./EnhancedSqlChecker"
import { SqlLinter } from "./SqlLinter"

export class SqlDiagnosticsProvider {
    private diagnosticCollection: vscode.DiagnosticCollection
    private enhancedChecker: EnhancedSqlChecker
    private linter: SqlLinter
    private configCache: Record<string, boolean> = {}

    private configChangeListener: vscode.Disposable

    constructor() {
        this.diagnosticCollection =
            vscode.languages.createDiagnosticCollection("hive-formatter")
        this.enhancedChecker = new EnhancedSqlChecker()
        this.linter = new SqlLinter()
        this.loadConfig()
        
        this.configChangeListener = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('Hive-Formatter')) {
                this.loadConfig()
                this.linter = new SqlLinter()
                vscode.workspace.textDocuments.forEach((doc) => {
                    if (this.isSqlDocument(doc)) {
                        this.provideDiagnostics(doc)
                    }
                })
            }
        })
    }

    private loadConfig(): void {
        const config = vscode.workspace.getConfiguration('Hive-Formatter')
        this.configCache = {
            enableEnhancedChecks: config.get('enableEnhancedChecks', true),
            enableLinter: config.get('enableLinter', true),
            showErrorLevel: config.get('showErrorLevel', true),
            showWarningLevel: config.get('showWarningLevel', true),
            showInfoLevel: config.get('showInfoLevel', true),
        }
    }

    private isSqlDocument(document: vscode.TextDocument): boolean {
        const sqlLanguages = Object.keys(sqlDialects)
        return sqlLanguages.includes(document.languageId)
    }

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
                allDialects[sqlDialectName as keyof typeof allDialects] as DialectOptions

            const parser = createParser(createDialect(dialect).tokenizer)
            parser.parse(text, {})
            
            const extraDiagnostics = this.checkForCommonErrors(text, document)
            diagnostics.push(...extraDiagnostics)
            
            // 添加增强检查
            if (this.configCache.enableEnhancedChecks) {
                const enhancedDiagnostics = this.enhancedChecker.checkEnhancedIssues(text, document)
                const filteredDiagnostics = this.filterBySeverity(enhancedDiagnostics)
                diagnostics.push(...filteredDiagnostics)
            }

            // 添加 Lint 检查
            if (this.configCache.enableLinter) {
                const lintDiagnostics = this.linter.lint(text, document)
                const filteredLintDiagnostics = this.filterBySeverity(lintDiagnostics)
                diagnostics.push(...filteredLintDiagnostics)
            }
        } catch (error) {
            if (this.configCache.showErrorLevel) {
                const diagnostic = this.createDiagnosticFromError(error, text, document)
                if (diagnostic) {
                    diagnostics.push(diagnostic)
                }
            }
        }

        this.diagnosticCollection.set(document.uri, diagnostics)
    }

    private filterBySeverity(diagnostics: vscode.Diagnostic[]): vscode.Diagnostic[] {
        return diagnostics.filter(d => {
            if (d.severity === vscode.DiagnosticSeverity.Error && !this.configCache.showErrorLevel) return false
            if (d.severity === vscode.DiagnosticSeverity.Warning && !this.configCache.showWarningLevel) return false
            if (d.severity === vscode.DiagnosticSeverity.Information && !this.configCache.showInfoLevel) return false
            return true
        })
    }

    private checkForCommonErrors(text: string, document: vscode.TextDocument): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        
        this.checkCommaFollowedByFrom(text, document, diagnostics)
        this.checkSelectWithNoColumns(text, document, diagnostics)
        this.checkFromWithNoTable(text, document, diagnostics)
        this.checkMismatchedParentheses(text, document, diagnostics)
        this.checkUnclosedStrings(text, document, diagnostics)
        this.checkOrderByWithNoColumn(text, document, diagnostics)
        this.checkWhereWithNoCondition(text, document, diagnostics)
        this.checkGroupByWithNoColumn(text, document, diagnostics)
        this.checkExtraCommas(text, document, diagnostics)
        
        return diagnostics
    }

    private checkCommaFollowedByFrom(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern = /,(\s*)\bfrom\b/gi
        let match
        while ((match = pattern.exec(text)) !== null) {
            const lineCol = lineColFromIndex(text, match.index)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 1),
                t('diagnostic.missingColumnAfterComma', String(lineNum)),
                vscode.DiagnosticSeverity.Error
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "COMMA_FROM"
            diagnostics.push(diagnostic)
        }
    }

    private checkSelectWithNoColumns(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const selectPattern = /\bselect\b/gi;
        let selectMatch: RegExpExecArray | null;
        
        while ((selectMatch = selectPattern.exec(text)) !== null) {
            const selectStart = selectMatch.index;
            const selectEnd = selectStart + 6;
            
            const afterSelect = text.substring(selectEnd);
            let depth = 0
            let fromStartRelative = -1
            for (let i = 0; i < afterSelect.length; i++) {
                if (afterSelect[i] === '(') depth++
                else if (afterSelect[i] === ')') depth--
                else if (depth === 0 && afterSelect.substring(i, i + 4).toLowerCase() === 'from' && (i === 0 || !/\w/.test(afterSelect[i - 1])) && (i + 4 >= afterSelect.length || !/\w/.test(afterSelect[i + 4]))) {
                    fromStartRelative = i
                    break
                }
            }
            
            if (fromStartRelative !== -1) {
                const betweenText = afterSelect.substring(0, fromStartRelative).trim();
                
                if (betweenText === '') {
                    const lineCol = lineColFromIndex(text, selectStart);
                    const lineNum = lineCol.line;
                    const diagnostic = new vscode.Diagnostic(
                        new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 6),
                        t('diagnostic.missingColumnAfterSelect', String(lineNum)),
                        vscode.DiagnosticSeverity.Error
                    );
                    diagnostic.source = "Hive Formatter";
                    diagnostic.code = "SELECT_NO_COLUMNS";
                    diagnostics.push(diagnostic);
                }
            }
        }
    }

    private checkFromWithNoTable(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const fromPattern = /\bfrom\b/gi;
        let fromMatch: RegExpExecArray | null;
        
        while ((fromMatch = fromPattern.exec(text)) !== null) {
            const fromStart = fromMatch.index;
            const fromEnd = fromStart + 4;
            
            const afterFrom = text.substring(fromEnd);
            const clauseEndMatch = /(?:;|\bwhere\b|\bgroup\b|\bhaving\b|\border\b|\blimit\b|\bjoin\b|\binner\b|\bleft\b|\bright\b|\bfull\b|\bcross\b|\bnatural\b|\bunion\b|\bon\b)/i.exec(afterFrom);
            const endPosition = clauseEndMatch ? clauseEndMatch.index : afterFrom.length;
            const afterFromText = afterFrom.substring(0, endPosition).trim();
            
            if (afterFromText === '') {
                const lineCol = lineColFromIndex(text, fromStart);
                const lineNum = lineCol.line;
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 4),
                    t('diagnostic.missingTableAfterFrom', String(lineNum)),
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.source = "Hive Formatter";
                diagnostic.code = "FROM_NO_TABLE";
                diagnostics.push(diagnostic);
            }
        }
    }

    private checkMismatchedParentheses(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const openParens: number[] = []
        let inString = false
        let stringChar = ''
        let inLineComment = false
        let inBlockComment = false
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i]
            const nextChar = i + 1 < text.length ? text[i + 1] : ''
            
            if (inLineComment) {
                if (char === '\n') inLineComment = false
                continue
            }
            if (inBlockComment) {
                if (char === '*' && nextChar === '/') { inBlockComment = false; i++ }
                continue
            }
            if (inString) {
                if (char === stringChar) {
                    if (nextChar === stringChar) { i++ }
                    else { inString = false }
                }
                continue
            }
            
            if (char === "'" || char === '"') {
                inString = true
                stringChar = char
            } else if (char === '-' && nextChar === '-') {
                inLineComment = true
                i++
            } else if (char === '/' && nextChar === '*') {
                inBlockComment = true
                i++
            } else if (char === '(') {
                openParens.push(i)
            } else if (char === ')') {
                if (openParens.length === 0) {
                    const lineCol = lineColFromIndex(text, i)
                    const lineNum = lineCol.line
                    const diagnostic = new vscode.Diagnostic(
                        new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 1),
                        t('diagnostic.extraRightParen', String(lineNum)),
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
        for (const pos of openParens) {
            const lineCol = lineColFromIndex(text, pos)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 1),
                t('diagnostic.unclosedLeftParen', String(lineNum)),
                vscode.DiagnosticSeverity.Error
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "UNclosed_PAREN"
            diagnostics.push(diagnostic)
        }
    }

    private checkUnclosedStrings(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        let inString = false
        let stringStartPos = -1
        let currentQuote = ''
        let inLineComment = false
        let inBlockComment = false
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i]
            const nextChar = i + 1 < text.length ? text[i + 1] : ''
            
            if (inLineComment) {
                if (char === '\n') inLineComment = false
                continue
            }
            if (inBlockComment) {
                if (char === '*' && nextChar === '/') { inBlockComment = false; i++ }
                continue
            }
            
            if (inString) {
                if (char === currentQuote) {
                    if (nextChar === currentQuote) {
                        i++
                    } else {
                        inString = false
                        stringStartPos = -1
                    }
                }
            } else {
                if (char === "'" || char === '"') {
                    inString = true
                    stringStartPos = i
                    currentQuote = char
                } else if (char === '-' && nextChar === '-') {
                    inLineComment = true
                    i++
                } else if (char === '/' && nextChar === '*') {
                    inBlockComment = true
                    i++
                }
            }
        }
        
        if (inString && stringStartPos !== -1) {
            const lineCol = lineColFromIndex(text, stringStartPos)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 1),
                t('diagnostic.unclosedString', String(lineNum), currentQuote),
                vscode.DiagnosticSeverity.Error
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "UNclosed_STRING"
            diagnostics.push(diagnostic)
        }
    }

    private checkOrderByWithNoColumn(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const orderByPattern = /\border\s+by\b/gi;
        let orderByMatch: RegExpExecArray | null;
        
        while ((orderByMatch = orderByPattern.exec(text)) !== null) {
            const orderByStart = orderByMatch.index;
            const orderByEnd = orderByStart + orderByMatch[0].length;
            
            const afterOrderBy = text.substring(orderByEnd);
            const endMatch = /(?:;|$|\bwhere\b|\bgroup\b|\bhaving\b|\blimit\b)/i.exec(afterOrderBy);
            const endPosition = endMatch ? endMatch.index : afterOrderBy.length;
            const afterOrderByText = afterOrderBy.substring(0, endPosition).trim();
            
            if (afterOrderByText === '') {
                const lineCol = lineColFromIndex(text, orderByStart);
                const lineNum = lineCol.line;
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 8),
                    t('diagnostic.missingOrderByColumn', String(lineNum)),
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.source = "Hive Formatter";
                diagnostic.code = "ORDERBY_NO_COL";
                diagnostics.push(diagnostic);
            }
        }
    }

    private checkWhereWithNoCondition(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const wherePattern = /\bwhere\b/gi;
        let whereMatch: RegExpExecArray | null;
        
        while ((whereMatch = wherePattern.exec(text)) !== null) {
            const whereStart = whereMatch.index;
            const whereEnd = whereStart + 5;
            
            const afterWhere = text.substring(whereEnd);
            const endMatch = /(?:;|$|\bgroup\b|\border\b|\blimit\b)/i.exec(afterWhere);
            const endPosition = endMatch ? endMatch.index : afterWhere.length;
            const afterWhereText = afterWhere.substring(0, endPosition).trim();
            
            if (afterWhereText === '') {
                const lineCol = lineColFromIndex(text, whereStart);
                const lineNum = lineCol.line;
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 5),
                    t('diagnostic.missingWhereCondition', String(lineNum)),
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.source = "Hive Formatter";
                diagnostic.code = "WHERE_NO_CONDITION";
                diagnostics.push(diagnostic);
            }
        }
    }

    private checkGroupByWithNoColumn(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const groupByPattern = /\bgroup\s+by\b/gi;
        let groupByMatch: RegExpExecArray | null;
        
        while ((groupByMatch = groupByPattern.exec(text)) !== null) {
            const groupByStart = groupByMatch.index;
            const groupByEnd = groupByStart + groupByMatch[0].length;
            
            const afterGroupBy = text.substring(groupByEnd);
            const endMatch = /(?:;|$|\bwhere\b|\bhaving\b|\border\b|\blimit\b)/i.exec(afterGroupBy);
            const endPosition = endMatch ? endMatch.index : afterGroupBy.length;
            const afterGroupByText = afterGroupBy.substring(0, endPosition).trim();
            
            if (afterGroupByText === '') {
                const lineCol = lineColFromIndex(text, groupByStart);
                const lineNum = lineCol.line;
                const diagnostic = new vscode.Diagnostic(
                    new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 8),
                    t('diagnostic.missingGroupByColumn', String(lineNum)),
                    vscode.DiagnosticSeverity.Error
                );
                diagnostic.source = "Hive Formatter";
                diagnostic.code = "GROUPBY_NO_COL";
                diagnostics.push(diagnostic);
            }
        }
    }

    private checkExtraCommas(text: string, document: vscode.TextDocument, diagnostics: vscode.Diagnostic[]): void {
        const pattern1 = /,(\s*)\)/g
        let match
        while ((match = pattern1.exec(text)) !== null) {
            const lineCol = lineColFromIndex(text, match.index)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 1),
                t('diagnostic.trailingCommaBeforeParen', String(lineNum)),
                vscode.DiagnosticSeverity.Warning
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "EXTRA_COMMA_PAREN"
            diagnostics.push(diagnostic)
        }
        
        const pattern2 = /,(\s*);/g
        while ((match = pattern2.exec(text)) !== null) {
            const lineCol = lineColFromIndex(text, match.index)
            const lineNum = lineCol.line
            const diagnostic = new vscode.Diagnostic(
                new vscode.Range(lineNum - 1, lineCol.col, lineNum - 1, lineCol.col + 1),
                t('diagnostic.trailingCommaBeforeEnd', String(lineNum)),
                vscode.DiagnosticSeverity.Warning
            )
            diagnostic.source = "Hive Formatter"
            diagnostic.code = "EXTRA_COMMA_SEMI"
            diagnostics.push(diagnostic)
        }
    }

    private createDiagnosticFromError(
        error: unknown,
        text: string,
        document: vscode.TextDocument,
    ): vscode.Diagnostic | undefined {
        let message = t('diagnostic.sqlSyntaxError')
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

    private formatErrorMessage(message: string): string {
        return message.replace(/\s+at position \d+$/, "")
    }

    public clearDiagnostics(uri: vscode.Uri): void {
        this.diagnosticCollection.delete(uri)
    }

    public dispose(): void {
        this.configChangeListener.dispose()
        this.diagnosticCollection.dispose()
    }
}
