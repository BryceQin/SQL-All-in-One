import * as vscode from "vscode"
import { SqlLanguage } from "../formatter/sqlFormatter"
import { sqlDialects } from "../core/sqlDialects"
import { createConfig } from "../core/config"
import { formatEditorText } from "../utils/formatEditorText"
import { handleError, ErrorCategory } from "../core/errorHandler"
import { getPerformanceMonitor } from '../core/performanceMonitor'

/**
 * Stateless document formatting provider.
 *
 * The SQL dialect is detected from each document's `languageId` at format time
 * (see {@link detectSqlLanguage}), so a single shared instance can serve all
 * registered SQL languages. The underlying `AstFormatter` instances are cached
 * per (dialect, options) inside `formatDialect`, so reusing one provider does
 * not sacrifice any formatting-level caching.
 */
export class SqlFormattingProvider
    implements vscode.DocumentFormattingEditProvider
{
    provideDocumentFormattingEdits(
        document: vscode.TextDocument,
        formattingOptions: vscode.FormattingOptions,
        token: vscode.CancellationToken,
    ): vscode.TextEdit[] {
        return getPerformanceMonitor().measure('SqlFormattingProvider.provideDocumentFormattingEdits', () => {
            try {
                if (token.isCancellationRequested) return [];
                const formatted = this.formatText(
                    document.getText(),
                    formattingOptions,
                    document.uri,
                    detectSqlLanguage(document.languageId),
                );
                if (token.isCancellationRequested) return [];
                return [
                    vscode.TextEdit.replace(
                        this.fullDocumentRange(document),
                        formatted,
                    ),
                ];
            } catch (e) {
                handleError(e, 'format document', ErrorCategory.CRITICAL);
                return [];
            }
        });
    }

    private fullDocumentRange(document: vscode.TextDocument): vscode.Range {
        return new vscode.Range(
            document.positionAt(0),
            document.lineAt(document.lineCount - 1).range.end,
        )
    }

    private formatText(
        text: string,
        formattingOptions: vscode.FormattingOptions,
        uri: vscode.Uri,
        language: SqlLanguage,
    ): string {
        const extensionSettings = vscode.workspace.getConfiguration(
            "SQL-All-in-One",
            uri,
        )
        const formatConfig = createConfig(
            extensionSettings,
            formattingOptions,
            language,
        )
        return formatEditorText(text, formatConfig)
    }
}

/**
 * Resolve the {@link SqlLanguage} for a given VS Code language id.
 * Falls back to `"sql"` for unknown ids, matching `formatSelectionCommand`.
 */
const detectSqlLanguage = (languageId: string): SqlLanguage =>
    sqlDialects[languageId] ?? "sql"
