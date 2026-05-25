import { escapeRegExp } from "../lexer/regexUtil"

interface CommentSlot {
    id: string
    original: string
    isOnOwnLine: boolean
    isAfterSemicolon: boolean
    isTailComment: boolean
    anchor: string
}

export class CommentPreserver {
    private slots: CommentSlot[] = []
    private counter = 0

    extract(sql: string): string {
        this.slots = []
        this.counter = 0

        const comments = this.findAllComments(sql)

        if (comments.length === 0) return sql

        let result = sql
        for (let i = comments.length - 1; i >= 0; i--) {
            const c = comments[i]
            const id = `CMT_${this.counter++}`

            if (c.isOnOwnLine) {
                const lineStart = this.findLineStart(result, c.start)
                const lineEnd = this.findLineEnd(result, c.end)
                const anchor = this.findNextWord(result, lineEnd)

                this.slots.push({
                    id,
                    original: this.normalizeCommentText(c.text),
                    isOnOwnLine: true,
                    isAfterSemicolon: c.isAfterSemicolon,
                    isTailComment: false,
                    anchor,
                })

                result =
                    result.substring(0, lineStart) +
                    result.substring(lineEnd)
            } else if (c.isAfterSemicolon) {
                const anchor = this.findNextWord(result, c.end)

                this.slots.push({
                    id,
                    original: this.normalizeCommentText(c.text),
                    isOnOwnLine: false,
                    isAfterSemicolon: true,
                    isTailComment: false,
                    anchor,
                })

                result =
                    result.substring(0, c.start) +
                    result.substring(c.end)
            } else if (c.isTailComment) {
                const anchor = this.findPrevWord(sql, c.start)

                this.slots.push({
                    id,
                    original: this.normalizeCommentText(c.text),
                    isOnOwnLine: false,
                    isAfterSemicolon: false,
                    isTailComment: true,
                    anchor,
                })

                result =
                    result.substring(0, c.start) +
                    result.substring(c.end)
            } else {
                this.slots.push({
                    id,
                    original: this.normalizeCommentText(c.text),
                    isOnOwnLine: false,
                    isAfterSemicolon: false,
                    isTailComment: false,
                    anchor: '',
                })

                result =
                    result.substring(0, c.start) +
                    id +
                    result.substring(c.end)
            }
        }

        this.slots.reverse()

        return result
    }

    restore(formatted: string): string {
        let result = formatted

        for (const slot of this.slots) {
            if (slot.isOnOwnLine || slot.isAfterSemicolon || slot.isTailComment) {
                result = this.restoreStandalone(slot, result)
            } else {
                const escapedId = escapeRegExp(slot.id)
                result = this.restoreInline(slot.original, escapedId, result)
            }
        }

        return result
    }

    private normalizeCommentText(text: string): string {
        if (text.startsWith('--')) {
            const content = text.substring(2)
            const trimmed = content.trimStart()
            if (trimmed.length === 0) return text
            return '-- ' + trimmed
        }
        if (text.startsWith('/*') && text.endsWith('*/')) {
            const inner = text.substring(2, text.length - 2)
            const trimmed = inner.trim()
            if (trimmed.length === 0) return '/* */'
            return '/* ' + trimmed + ' */'
        }
        return text
    }

    private restoreStandalone(slot: CommentSlot, text: string): string {
        if (!slot.anchor) {
            const escapedId = escapeRegExp(slot.id)
            return this.restoreInline(slot.original, escapedId, text)
        }

        const lines = text.split('\n')
        let anchorIdx = -1

        for (let li = 0; li < lines.length; li++) {
            if (this.hasWord(lines[li], slot.anchor)) {
                anchorIdx = li
                break
            }
        }

        if (anchorIdx >= 0) {
            const anchorLine = lines[anchorIdx]
            const indentMatch = /^(\s*)/.exec(anchorLine)
            const indent = indentMatch ? indentMatch[1] : ''
            lines.splice(anchorIdx, 0, indent + slot.original)
            return lines.join('\n')
        }

        const escapedId = escapeRegExp(slot.id)
        return this.restoreInline(slot.original, escapedId, text)
    }

    private hasWord(line: string, word: string): boolean {
        const escaped = escapeRegExp(word)
        return new RegExp(`\\b${escaped}\\b`, 'i').test(line)
    }

    private restoreInline(
        original: string,
        escapedId: string,
        text: string,
    ): string {
        const patterns = [
            new RegExp(`\`?${escapedId}\`?`, 'gi'),
        ]

        for (const pattern of patterns) {
            const before = text
            text = text.replace(pattern, () => original)
            if (text !== before) break
        }

        return text
    }

    private findLineStart(sql: string, pos: number): number {
        let idx = pos
        while (idx > 0 && sql[idx - 1] !== '\n') {
            idx--
        }
        return idx
    }

    private findLineEnd(sql: string, pos: number): number {
        let idx = pos
        const len = sql.length
        while (idx < len && sql[idx] !== '\n') {
            idx++
        }
        if (idx < len && sql[idx] === '\n') {
            idx++
        }
        return idx
    }

    private findNextWord(sql: string, startPos: number): string {
        let i = startPos
        const len = sql.length

        while (i < len && (sql[i] === ' ' || sql[i] === '\t' || sql[i] === '\n' || sql[i] === '\r')) {
            i++
        }

        if (i >= len) return ''

        const wordStart = i
        while (i < len && /[\w`."]/.test(sql[i])) {
            i++
        }

        return sql.substring(wordStart, i)
    }

    private findPrevWord(sql: string, startPos: number): string {
        let i = startPos - 1

        while (i >= 0 && (sql[i] === ' ' || sql[i] === '\t')) {
            i--
        }

        if (i < 0) return ''

        const wordEnd = i + 1
        while (i >= 0 && /[\w`."]/.test(sql[i])) {
            i--
        }

        return sql.substring(i + 1, wordEnd)
    }

    private findAllComments(sql: string): {
        start: number
        end: number
        text: string
        isOnOwnLine: boolean
        isAfterSemicolon: boolean
        isTailComment: boolean
    }[] {
        const comments: {
            start: number
            end: number
            text: string
            isOnOwnLine: boolean
            isAfterSemicolon: boolean
            isTailComment: boolean
        }[] = []

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
                const isOnOwnLine = this.isStartOfLine(sql, start)
                const isAfterSemicolon = this.isAfterSemicolon(sql, start)

                i += 2
                while (i < len && sql[i] !== '\n') {
                    i++
                }

                const commentText = sql.substring(start, i)
                comments.push({
                    start,
                    end: i,
                    text: commentText,
                    isOnOwnLine,
                    isAfterSemicolon,
                    isTailComment: !isOnOwnLine && !isAfterSemicolon,
                })
                continue
            }

            if (ch === '/' && i + 1 < len && sql[i + 1] === '*') {
                const start = i
                const isOnOwnLine = this.isStartOfLine(sql, start)
                const isAfterSemicolon = this.isAfterSemicolon(sql, start)

                i += 2
                while (i < len) {
                    if (sql[i] === '*' && i + 1 < len && sql[i + 1] === '/') {
                        i += 2
                        break
                    }
                    i++
                }

                let isTailComment = false
                if (!isOnOwnLine && !isAfterSemicolon) {
                    let j = i
                    while (j < len && sql[j] !== '\n') {
                        if (sql[j] !== ' ' && sql[j] !== '\t') {
                            break
                        }
                        j++
                    }
                    if (j >= len || sql[j] === '\n') {
                        isTailComment = true
                    }
                }

                const commentText = sql.substring(start, i)
                comments.push({
                    start,
                    end: i,
                    text: commentText,
                    isOnOwnLine,
                    isAfterSemicolon,
                    isTailComment,
                })
                continue
            }

            i++
        }

        return comments
    }

    private isStartOfLine(sql: string, pos: number): boolean {
        let idx = pos - 1
        while (idx >= 0) {
            const ch = sql[idx]
            if (ch === '\n') return true
            if (ch === ' ' || ch === '\t') {
                idx--
                continue
            }
            return false
        }
        return true
    }

    private isAfterSemicolon(sql: string, pos: number): boolean {
        let idx = pos - 1
        while (idx >= 0) {
            const ch = sql[idx]
            if (ch === ';') return true
            if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
                idx--
                continue
            }
            return false
        }
        return false
    }
}