import * as vscode from "vscode"
import { sqlDialects } from "../core/sqlDialects"
import { toSqlDialect } from "../core/sqlDialects"
import { lineColFromIndex } from "../lexer/lineColFromIndex"
import { t } from "../i18n"
import { EnhancedSqlChecker } from "./EnhancedSqlChecker"
import { SqlLinter } from "./SqlLinter"
import { AstDiagnosticsProvider } from "./AstDiagnosticsProvider"

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
            const sqlDialect = toSqlDialect(document.languageId)
            const astProvider = new AstDiagnosticsProvider()
            const astDiagnostics = astProvider.check(text, sqlDialect)
            diagnostics.push(...astDiagnostics)

            if (this.configCache.enableEnhancedChecks) {
                const enhancedDiagnostics = this.enhancedChecker.checkEnhancedIssues(text, document)
                const filteredDiagnostics = this.filterBySeverity(enhancedDiagnostics)
                diagnostics.push(...filteredDiagnostics)
            }

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
