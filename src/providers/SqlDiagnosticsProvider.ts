import * as vscode from "vscode"
import { isSqlDocument } from "../core/sqlDialects"
import { toSqlDialect } from "../core/sqlDialects"
import { lineColFromIndex } from "../lexer/lineColFromIndex"
import { t } from "../i18n"
import { SqlLinter } from "./SqlLinter"
import { AstDiagnosticsProvider } from "./AstDiagnosticsProvider"
import { getDocumentAstCache } from "../parser/DocumentAstCache"
import { getConfigManager } from "../core/configManager"
import { getPerformanceMonitor } from '../core/performanceMonitor'

export class SqlDiagnosticsProvider {
    private diagnosticCollection: vscode.DiagnosticCollection
    private astDiagnosticsProvider = new AstDiagnosticsProvider()
    private linter: SqlLinter
    private configChangeDisposable: vscode.Disposable

    private debounceTimers = new Map<string, ReturnType<typeof setTimeout>>()
    private readonly DEBOUNCE_MS = 300
    private cancellationSources = new Map<string, vscode.CancellationTokenSource>()

    constructor() {
        this.diagnosticCollection =
            vscode.languages.createDiagnosticCollection("hive-formatter")
        this.linter = new SqlLinter()

        this.configChangeDisposable = getConfigManager().onConfigChange(() => {
            const configManager = getConfigManager()
            if (configManager.checkLinterConfigChanged()) {
                this.linter.resetConfig()
                const visibleUris = new Set(
                    vscode.window.visibleTextEditors
                        .filter(ed => isSqlDocument(ed.document))
                        .map(ed => ed.document.uri.toString())
                )
                vscode.workspace.textDocuments.forEach((doc) => {
                    if (isSqlDocument(doc) && visibleUris.has(doc.uri.toString())) {
                        this.provideDiagnostics(doc)
                    }
                })
            }
        })
    }

    public debouncedProvideDiagnostics(document: vscode.TextDocument): void {
        const key = document.uri.toString()

        const existingSource = this.cancellationSources.get(key)
        if (existingSource) {
            existingSource.cancel()
            existingSource.dispose()
            this.cancellationSources.delete(key)
        }

        const existingTimer = this.debounceTimers.get(key)
        if (existingTimer) {
            clearTimeout(existingTimer)
        }
        this.debounceTimers.set(key, setTimeout(() => {
            const source = new vscode.CancellationTokenSource()
            this.cancellationSources.set(key, source)
            this.provideDiagnostics(document, source.token)
            this.debounceTimers.delete(key)
        }, this.DEBOUNCE_MS))
    }

    public async provideDiagnostics(document: vscode.TextDocument, token?: vscode.CancellationToken): Promise<void> {
        await getPerformanceMonitor().measureAsync('SqlDiagnosticsProvider.provideDiagnostics', async () => {
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

            const key = document.uri.toString()
            const source = this.cancellationSources.get(key)
            if (source && source.token === token) {
                this.cancellationSources.delete(key)
            }
        })
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
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer)
        }
        this.debounceTimers.clear()
        for (const source of this.cancellationSources.values()) {
            source.cancel()
            source.dispose()
        }
        this.cancellationSources.clear()
        this.configChangeDisposable.dispose()
        this.diagnosticCollection.dispose()
    }
}
