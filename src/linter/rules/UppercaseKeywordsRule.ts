import * as vscode from "vscode";
import { BaseRule } from "./BaseRule";
import type { RuleContext } from "./LintRule";
import { precomputeLineStarts, lineFromOffset } from "../../utils/lineIndex";

const SQL_KEYWORDS = [
    "SELECT",
    "FROM",
    "WHERE",
    "JOIN",
    "LEFT",
    "RIGHT",
    "INNER",
    "OUTER",
    "CROSS",
    "FULL",
    "ON",
    "AND",
    "OR",
    "NOT",
    "IN",
    "IS",
    "NULL",
    "AS",
    "INSERT",
    "INTO",
    "VALUES",
    "UPDATE",
    "SET",
    "DELETE",
    "CREATE",
    "TABLE",
    "ALTER",
    "DROP",
    "INDEX",
    "GROUP",
    "BY",
    "ORDER",
    "ASC",
    "DESC",
    "HAVING",
    "LIMIT",
    "UNION",
    "ALL",
    "DISTINCT",
    "EXISTS",
    "BETWEEN",
    "LIKE",
    "CASE",
    "WHEN",
    "THEN",
    "ELSE",
    "END",
    "WITH",
    "OVER",
    "PARTITION",
    "WINDOW",
    "LATERAL",
    "VIEW",
    "USING",
    "NATURAL",
    "INTERSECT",
    "EXCEPT",
    "MINUS",
    "RECURSIVE",
    "IF",
    "ELSEIF",
    "UNIQUE",
    "PRIMARY",
    "KEY",
    "FOREIGN",
    "REFERENCES",
    "CHECK",
    "DEFAULT",
    "CONSTRAINT",
    "CASCADE",
    "RESTRICT",
    "GRANT",
    "REVOKE",
    "BEGIN",
    "COMMIT",
    "ROLLBACK",
    "TRUNCATE",
    "EXPLAIN",
    "ANALYZE",
    "SHOW",
    "DESCRIBE",
    "USE",
    "DISTRIBUTE",
    "CLUSTER",
    "SORT",
    "TABLESAMPLE",
    "UNNEST",
    "STRUCT",
    "MAP",
    "ARRAY",
    "TRUE",
    "FALSE",
    "UNKNOWN",
];

const KEYWORD_PATTERN = new RegExp("\\b(" + SQL_KEYWORDS.map((k) => k.toLowerCase()).join("|") + ")\\b", "gi");

export class UppercaseKeywordsRule extends BaseRule {
    readonly id = "uppercase_keywords";
    readonly applicableTypes: string[] = [];
    readonly name = "linter.uppercaseKeywords.name";
    readonly description = "linter.uppercaseKeywords.description";
    readonly category = "code-style";
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information;
    readonly defaultEnabled = false;

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = [];
        const sql = context.sql;
        const lineStarts = precomputeLineStarts(sql);

        KEYWORD_PATTERN.lastIndex = 0;
        let match: RegExpExecArray | null;
        while ((match = KEYWORD_PATTERN.exec(sql)) !== null) {
            const matched = match[1];
            if (matched !== matched.toUpperCase()) {
                const lineNum = lineFromOffset(lineStarts, match.index);
                const lineStart = lineStarts[lineNum - 1];
                const colNum = match.index - lineStart + 1;
                diagnostics.push(
                    new vscode.Diagnostic(
                        new vscode.Range(lineNum - 1, colNum - 1, lineNum - 1, colNum - 1 + matched.length),
                        `【第 ${lineNum} 行】Keyword "${matched}" should be uppercase: "${matched.toUpperCase()}"`,
                        this.getSeverity(),
                    ),
                );
                diagnostics[diagnostics.length - 1].source = "SQL All in One";
                diagnostics[diagnostics.length - 1].code = this.id;
            }
        }

        return diagnostics;
    }
}
