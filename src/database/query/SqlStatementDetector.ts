import * as vscode from 'vscode';
import { getParserEngine } from '../../parser/SqlParserEngine';
import { toSqlDialect, isSqlDocument } from '../../core/dialectRegistry';
import { DetectedStatement, StatementType } from './QueryResult';
import { handleError, ErrorCategory } from '../../core/errorHandler';

const statementTypeMap: Record<string, StatementType> = {
    SELECT: 'SELECT',
    INSERT: 'INSERT',
    UPDATE: 'UPDATE',
    DELETE: 'DELETE',
    CREATE: 'CREATE',
    ALTER: 'ALTER',
    DROP: 'DROP',
    TRUNCATE: 'TRUNCATE',
    RENAME: 'RENAME',
    GRANT: 'GRANT',
    REVOKE: 'REVOKE',
    SET: 'SET',
    SHOW: 'SHOW',
    USE: 'USE',
    CALL: 'CALL',
    EXPLAIN: 'EXPLAIN',
    WITH: 'SELECT',
    select: 'SELECT',
    insert: 'INSERT',
    update: 'UPDATE',
    delete: 'DELETE',
    create: 'CREATE',
    alter: 'ALTER',
    drop: 'DROP',
    truncate: 'TRUNCATE',
    rename: 'RENAME',
    grant: 'GRANT',
    revoke: 'REVOKE',
    set: 'SET',
    show: 'SHOW',
    use: 'USE',
    call: 'CALL',
    explain: 'EXPLAIN',
};

export class SqlStatementDetector {
    detectCurrentStatement(
        document: vscode.TextDocument,
        position: vscode.Position
    ): DetectedStatement {
        const allStatements = this.detectAllStatements(document);
        if (allStatements.length === 0) {
            return {
                sql: '',
                range: new vscode.Range(position, position),
                type: 'OTHER',
            };
        }

        for (const stmt of allStatements) {
            if (stmt.range.contains(position)) {
                return stmt;
            }
        }

        for (let i = allStatements.length - 1; i >= 0; i--) {
            if (allStatements[i].range.end.line <= position.line) {
                return allStatements[i];
            }
        }

        return allStatements[0];
    }

    detectSelectionOrCurrent(
        document: vscode.TextDocument,
        selection: vscode.Selection
    ): DetectedStatement {
        if (!selection.isEmpty) {
            const sql = document.getText(selection);
            return {
                sql: sql.trim(),
                range: selection,
                type: this.detectStatementType(sql.trim()),
            };
        }
        return this.detectCurrentStatement(document, selection.active);
    }

    detectAllStatements(document: vscode.TextDocument): DetectedStatement[] {
        const text = document.getText();
        if (!text.trim()) {
            return [];
        }

        const statements = this.parseWithAst(document, text);
        if (statements.length > 0) {
            return statements;
        }

        return this.parseWithSemicolons(document, text);
    }

    parseDelimiter(document: vscode.TextDocument): string {
        const text = document.getText();
        const delimiterMatch = text.match(/^\s*DELIMITER\s+(\S+)/im);
        return delimiterMatch ? delimiterMatch[1] : ';';
    }

    private parseWithAst(
        document: vscode.TextDocument,
        text: string
    ): DetectedStatement[] {
        try {
            const dialect = isSqlDocument(document)
                ? toSqlDialect(document.languageId)
                : 'sql';
            const parserEngine = getParserEngine();
            const result = parserEngine.tryAstify(text, dialect);

            if (!result.success || !result.ast) {
                return [];
            }

            const astArray = Array.isArray(result.ast) ? result.ast : [result.ast];
            const statements: DetectedStatement[] = [];

            for (const node of astArray) {
                const astNode = node as { type?: string; loc?: { start?: { line: number; column: number }; end?: { line: number; column: number } } };
                if (!astNode.loc?.start || !astNode.loc?.end) {
                    continue;
                }

                const startLine = Math.max(0, astNode.loc.start.line - 1);
                const startCol = Math.max(0, astNode.loc.start.column);
                const endLine = Math.max(0, astNode.loc.end.line - 1);
                const endCol = Math.max(0, astNode.loc.end.column);

                const range = new vscode.Range(
                    new vscode.Position(startLine, startCol),
                    new vscode.Position(endLine, endCol)
                );

                const sql = document.getText(range).trim();
                if (sql) {
                    statements.push({
                        sql,
                        range,
                        type: this.mapAstTypeToStatementType(astNode.type || 'OTHER'),
                    });
                }
            }

            return statements;
        } catch (e) {
            handleError(e, 'SqlStatementDetector.detectStatements', ErrorCategory.PARSE)
            return [];
        }
    }

    private parseWithSemicolons(
        document: vscode.TextDocument,
        text: string
    ): DetectedStatement[] {
        const statements: DetectedStatement[] = [];
        let inSingleQuote = false;
        let inDoubleQuote = false;
        const offsets: number[] = [0];

        for (let i = 0; i < text.length; i++) {
            const ch = text[i];

            if (inSingleQuote) {
                if (ch === "'") {
                    if (i + 1 < text.length && text[i + 1] === "'") {
                        i++;
                    } else {
                        inSingleQuote = false;
                    }
                } else if (ch === '\\') {
                    i++;
                }
            } else if (inDoubleQuote) {
                if (ch === '"') {
                    inDoubleQuote = false;
                } else if (ch === '\\') {
                    i++;
                }
            } else if (ch === "'") {
                inSingleQuote = true;
            } else if (ch === '"') {
                inDoubleQuote = true;
            } else if (ch === ';') {
                offsets.push(i + 1);
            }
        }

        offsets.push(text.length);

        for (let i = 0; i < offsets.length - 1; i++) {
            const startOffset = offsets[i];
            const endOffset = offsets[i + 1] - (i < offsets.length - 2 ? 1 : 0);
            const sql = text.substring(startOffset, endOffset).trim();

            if (sql) {
                const startPos = document.positionAt(startOffset);
                const endPos = document.positionAt(endOffset);
                statements.push({
                    sql,
                    range: new vscode.Range(startPos, endPos),
                    type: this.detectStatementType(sql),
                });
            }
        }

        return statements;
    }

    private detectStatementType(sql: string): StatementType {
        const keyword = sql.trim().split(/\s+/)[0];
        return statementTypeMap[keyword] || 'OTHER';
    }

    private mapAstTypeToStatementType(astType: string): StatementType {
        return statementTypeMap[astType] || 'OTHER';
    }
}
