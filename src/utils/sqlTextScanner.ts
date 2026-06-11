export interface CommentInfo {
    type: string
    start: number
    end: number
    text: string
}

export class SqlTextScanner {
    static findAllComments(sql: string): CommentInfo[] {
        const comments: CommentInfo[] = []
        let i = 0
        const len = sql.length
        let inSingleQuote = false
        let inDoubleQuote = false

        while (i < len) {
            const ch = sql[i]

            if (inSingleQuote) {
                if (ch === "'" && i + 1 < len && sql[i + 1] === "'") {
                    i += 2
                    continue
                }
                if (ch === "'") {
                    inSingleQuote = false
                }
                i++
                continue
            }

            if (inDoubleQuote) {
                if (ch === '"') {
                    inDoubleQuote = false
                }
                i++
                continue
            }

            if (ch === "'") {
                inSingleQuote = true
                i++
                continue
            }

            if (ch === '"') {
                inDoubleQuote = true
                i++
                continue
            }

            if (ch === '-' && i + 1 < len && sql[i + 1] === '-') {
                const start = i
                i += 2
                while (i < len && sql[i] !== '\n') {
                    i++
                }
                comments.push({
                    type: 'line',
                    start,
                    end: i,
                    text: sql.substring(start, i),
                })
                continue
            }

            if (ch === '/' && i + 1 < len && sql[i + 1] === '*') {
                const start = i
                i += 2
                while (i < len) {
                    if (sql[i] === '*' && i + 1 < len && sql[i + 1] === '/') {
                        i += 2
                        break
                    }
                    i++
                }
                comments.push({
                    type: 'block',
                    start,
                    end: i,
                    text: sql.substring(start, i),
                })
                continue
            }

            i++
        }

        return comments
    }

    static findStatementEnd(sql: string, startIndex: number): number {
        let depth = 0
        let inSingleQuote = false
        let inDoubleQuote = false
        let i = startIndex

        while (i < sql.length) {
            const ch = sql[i]

            if (inSingleQuote) {
                if (ch === "'" && i + 1 < sql.length && sql[i + 1] === "'") {
                    i += 2
                    continue
                }
                if (ch === "'") {
                    inSingleQuote = false
                }
                i++
                continue
            }

            if (inDoubleQuote) {
                if (ch === '"') {
                    inDoubleQuote = false
                }
                i++
                continue
            }

            if (ch === "'") {
                inSingleQuote = true
                i++
                continue
            }

            if (ch === '"') {
                inDoubleQuote = true
                i++
                continue
            }

            if (ch === '(') depth++
            if (ch === ')') depth--

            if (ch === ';' && depth <= 0) {
                return i
            }

            i++
        }

        return sql.length
    }

    static removeCommentsAndStrings(sql: string): string {
        let result = ''
        let i = 0
        const len = sql.length
        let inSingleQuote = false
        let inDoubleQuote = false

        while (i < len) {
            const ch = sql[i]

            if (inSingleQuote) {
                if (ch === "'" && i + 1 < len && sql[i + 1] === "'") {
                    i += 2
                    continue
                }
                if (ch === "'") {
                    inSingleQuote = false
                }
                i++
                continue
            }

            if (inDoubleQuote) {
                if (ch === '"') {
                    inDoubleQuote = false
                }
                i++
                continue
            }

            if (ch === "'") {
                inSingleQuote = true
                i++
                continue
            }

            if (ch === '"') {
                inDoubleQuote = true
                i++
                continue
            }

            if (ch === '-' && i + 1 < len && sql[i + 1] === '-') {
                i += 2
                while (i < len && sql[i] !== '\n') {
                    i++
                }
                continue
            }

            if (ch === '/' && i + 1 < len && sql[i + 1] === '*') {
                i += 2
                while (i < len) {
                    if (sql[i] === '*' && i + 1 < len && sql[i + 1] === '/') {
                        i += 2
                        break
                    }
                    i++
                }
                continue
            }

            result += ch
            i++
        }

        return result
    }
}
