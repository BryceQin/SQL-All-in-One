import { SqlTextScanner } from "../utils/sqlTextScanner";

const CREATE_TABLE_REGEX = /CREATE\s+TABLE/i;

export interface CreateTableInfo {
    before: string;
    content: string;
    tableComment: string;
    fullStatement: string;
    startIndex: number;
}

export class SqlParser {
    static findCreateTable(sql: string): CreateTableInfo | null {
        const createStart = sql.search(CREATE_TABLE_REGEX);
        if (createStart === -1) {
            return null;
        }

        const endIndex = SqlTextScanner.findStatementEnd(sql, createStart);
        const fullStatement = sql.substring(createStart, endIndex + (sql[endIndex] === ";" ? 1 : 0));
        const firstParen = fullStatement.indexOf("(");
        const lastParen = fullStatement.lastIndexOf(")");

        if (firstParen === -1 || lastParen === -1) {
            return null;
        }

        const before = fullStatement.substring(0, firstParen + 1);
        const content = fullStatement.substring(firstParen + 1, lastParen);
        const tableComment = this.extractTableComment(fullStatement, lastParen);

        return {
            before,
            content,
            tableComment,
            fullStatement,
            startIndex: createStart,
        };
    }

    private static extractTableComment(fullStatement: string, lastParen: number): string {
        const afterBracket = fullStatement.substring(lastParen);
        const match = afterBracket.match(/COMMENT\s*(?:=\s*)?'([^']*)'/i);
        return match ? match[1] : "";
    }

    static splitColumnDefinitions(content: string): string[] {
        const items: string[] = [];
        let current = "";
        let depth = 0;
        let inString = false;
        let stringChar = "";

        for (let i = 0; i < content.length; i++) {
            const char = content[i];

            if (inString) {
                current += char;
                if (char === stringChar) {
                    const nextChar = i + 1 < content.length ? content[i + 1] : "";
                    if (nextChar === stringChar) {
                        current += nextChar;
                        i++;
                    } else {
                        inString = false;
                    }
                }
                continue;
            }

            if (char === "'" || char === '"') {
                inString = true;
                stringChar = char;
                current += char;
            } else {
                if (char === "(") depth++;
                if (char === ")") depth--;

                if (char === "," && depth === 0) {
                    if (current.trim()) {
                        items.push(current.trim());
                    }
                    current = "";
                } else {
                    current += char;
                }
            }
        }

        if (current.trim()) {
            items.push(current.trim());
        }

        return items;
    }
}
