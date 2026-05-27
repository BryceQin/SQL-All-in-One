import * as vscode from "vscode"
import { isSqlDocument } from "../core/sqlDialects"
import { toSqlDialect } from "../core/sqlDialects"
import { lineColFromIndex } from "../lexer/lineColFromIndex"
import { t } from "../i18n"
import { SqlLinter } from "./SqlLinter"
import { AstDiagnosticsProvider } from "./AstDiagnosticsProvider"
import { getDocumentAstCache } from "../parser/DocumentAstCache"
import { getConfigManager } from "../core/configManager"

export class SqlDiagnosticsProvider {
    private diagnosticCollection: vscode.DiagnosticCollection
    private astDiagnosticsProvider = new AstDiagnosticsProvider()
    private linter: SqlLinter
    private configChangeDisposable: vscode.Disposable

    private debounceTimer: ReturnType<typeof setTimeout> | null = null
    private readonly DEBOUNCE_MS = 300
    private currentCancellationSource: vscode.CancellationTokenSource | null = null

    constructor() {
        this.diagnosticCollection =
            vscode.languages.createDiagnosticCollection("sql-all-in-one")
        this.linter = new SqlLinter()

        this.configChangeDisposable = getConfigManager().onConfigChange(() => {
            this.linter.resetConfig()
            vscode.workspace.textDocuments.forEach((doc) => {
                if (isSqlDocument(doc)) {
                    this.provideDiagnostics(doc)
                }
            })
        })
    }

    public debouncedProvideDiagnostics(document: vscode.TextDocument): void {
        if (this.currentCancellationSource) {
            this.currentCancellationSource.cancel()
            this.currentCancellationSource.dispose()
            this.currentCancellationSource = null
        }

        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer)
        }
        this.debounceTimer = setTimeout(() => {
            const source = new vscode.CancellationTokenSource()
            this.currentCancellationSource = source
            this.provideDiagnostics(document, source.token)
            this.debounceTimer = null
        }, this.DEBOUNCE_MS)
    }

    public provideDiagnostics(document: vscode.TextDocument, token?: vscode.CancellationToken): void {
        const cfg = getConfigManager().getSectionKeys('', ['enableLinter', 'showErrorLevel', 'showWarningLevel', 'showInfoLevel'], {
            enableLinter: true,
            showErrorLevel: true,
            showWarningLevel: true,
            showInfoLevel: true,
        })
        const diagnostics: vscode.Diagnostic[] = []
        const text = document.getText()

        if (!text.trim()) {
            this.diagnosticCollection.set(document.uri, [])
            return
        }

        try {
            const sqlDialect = toSqlDialect(document.languageId)

            const parseResult = getDocumentAstCache().getOrParse(document, sqlDialect)
            const astList = (parseResult.success && parseResult.ast)
                ? (Array.isArray(parseResult.ast) ? parseResult.ast : [parseResult.ast])
                : []

            const astDiagnostics = this.astDiagnosticsProvider.check(text, sqlDialect, astList)
            diagnostics.push(...astDiagnostics)

            if (token?.isCancellationRequested) {
                return
            }

            if (cfg.enableLinter) {
                const lintDiagnostics = this.linter.lint(text, document, astList)
                const filteredLintDiagnostics = this.filterBySeverity(lintDiagnostics, cfg)
                diagnostics.push(...filteredLintDiagnostics)
            }
        } catch (error) {
            if (cfg.showErrorLevel) {
                const diagnostic = this.createDiagnosticFromError(error, text, document)
                if (diagnostic) {
                    diagnostics.push(diagnostic)
                }
            }
        }

        if (token?.isCancellationRequested) {
            return
        }

        this.diagnosticCollection.set(document.uri, diagnostics)
    }

    private filterBySeverity(diagnostics: vscode.Diagnostic[], cfg: Record<string, boolean>): vscode.Diagnostic[] {
        return diagnostics.filter(d => {
            if (d.severity === vscode.DiagnosticSeverity.Error && !cfg.showErrorLevel) return false
            if (d.severity === vscode.DiagnosticSeverity.Warning && !cfg.showWarningLevel) return false
            if (d.severity === vscode.DiagnosticSeverity.Information && !cfg.showInfoLevel) return false
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
        diagnostic.source = "SQL All in One"
        return diagnostic
    }

    private formatErrorMessage(message: string): string {
        return message.replace(/\s+at position \d+$/, "")
    }

    public clearDiagnostics(uri: vscode.Uri): void {
        this.diagnosticCollection.delete(uri)
    }

    public dispose(): void {
        if (this.debounceTimer) clearTimeout(this.debounceTimer)
        if (this.currentCancellationSource) {
            this.currentCancellationSource.cancel()
            this.currentCancellationSource.dispose()
            this.currentCancellationSource = null
        }
        this.configChangeDisposable.dispose()
        this.diagnosticCollection.dispose()
    }
}
