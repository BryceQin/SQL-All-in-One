import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import type { AstLocation } from '../../parser/astTypes'
import { getConfigManager } from '../../core/configManager'

const SQL_KEYWORDS_FOR_COMMENT_CHECK = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'DROP', 'ALTER', 'GROUP BY', 'ORDER BY', 'HAVING', 'UNION']
const SQL_KEYWORD_REGEXES = SQL_KEYWORDS_FOR_COMMENT_CHECK.map(kw => ({
    regex: new RegExp(`\\b${kw}\\b`, 'i'),
    keyword: kw,
}))

export class CommentedOutCodeRule extends BaseRule {
    readonly id = 'commented_out_code'
    readonly applicableTypes: string[] = []
    readonly name = 'Commented Out Code'
    readonly description = 'linter.commentedOutCode.description'
    readonly category = 'code-style'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const sql = context.sql
        const thresholdLines = getConfigManager().get<number>('lint.commented_out_code_threshold_lines', 3)

        const blockCommentPattern = /\/\*([\s\S]*?)\*\//g
        let match
        while ((match = blockCommentPattern.exec(sql)) !== null) {
            const content = match[1]
            if (!this.isCommentedOutCode(content, thresholdLines)) {
                continue
            }

            const lines = content.split('\n').filter(l => l.trim().length > 0)
            const startLine = sql.substring(0, match.index).split('\n').length
            const loc: AstLocation = { line: startLine, column: 1 }
            diagnostics.push(this.addDiagnostic(loc, 2, 'linter.commentedOutCode.description', String(lines.length)))
        }

        const lineCommentGroups = this.findConsecutiveLineComments(sql)
        for (const group of lineCommentGroups) {
            if (!this.isCommentedOutCode(group.text, thresholdLines)) {
                continue
            }

            const startLine = sql.substring(0, group.startIndex).split('\n').length
            const loc: AstLocation = { line: startLine, column: 1 }
            diagnostics.push(this.addDiagnostic(loc, 2, 'linter.commentedOutCode.description', String(group.lineCount)))
        }

        return diagnostics
    }

    private isCommentedOutCode(content: string, thresholdLines: number): boolean {
        if (/sql-formatter-disable|sql-formatter-enable/i.test(content)) {
            return false
        }

        const lines = content.split('\n').filter(l => l.trim().length > 0)
        if (lines.length < thresholdLines) {
            return false
        }

        let keywordCount = 0
        for (const { regex } of SQL_KEYWORD_REGEXES) {
            if (regex.test(content)) {
                keywordCount++
            }
        }
        if (keywordCount < 3) {
            return false
        }

        return true
    }

    private findConsecutiveLineComments(text: string): { startIndex: number; lineCount: number; text: string }[] {
        const groups: { startIndex: number; lineCount: number; text: string }[] = []
        const lines = text.split('\n')
        let groupStart = -1
        let groupText = ''
        let groupStartIndex = 0
        let offset = 0

        for (let i = 0; i < lines.length; i++) {
            const trimmed = lines[i].trim()
            if (trimmed.startsWith('--')) {
                if (groupStart === -1) {
                    groupStart = i
                    groupStartIndex = offset
                    groupText = trimmed
                } else {
                    groupText += '\n' + trimmed
                }
            } else if (trimmed.length > 0) {
                if (groupStart !== -1) {
                    groups.push({ startIndex: groupStartIndex, lineCount: i - groupStart, text: groupText })
                    groupStart = -1
                    groupText = ''
                }
            }
            offset += lines[i].length + 1
        }
        if (groupStart !== -1) {
            groups.push({ startIndex: groupStartIndex, lineCount: lines.length - groupStart, text: groupText })
        }
        return groups
    }
}
