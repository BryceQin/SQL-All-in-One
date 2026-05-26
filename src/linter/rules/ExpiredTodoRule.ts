import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import type { AstLocation } from '../../parser/astTypes'

export class ExpiredTodoRule extends BaseRule {
    readonly id = 'expired_todo'
    readonly applicableTypes: string[] = []

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const cfg = vscode.workspace.getConfiguration('SQL-All-in-One')
        const gracePeriod = cfg.get<number>('lint.expired_todo_grace_period_days', 7)

        const patterns = [
            /--\s*(TODO|FIXME)\s*\(\s*(\d{4}[-/]\d{2}[-/]\d{2})\s*\):?\s*.*/gi,
            /--\s*(TODO|FIXME)\s*\([^),]+,\s*(\d{4}[-/]\d{2}[-/]\d{2})\s*\):?\s*.*/gi,
            /--\s*(TODO|FIXME)[^\n]*@deadline\s+(\d{4}[-/]\d{2}[-/]\d{2})/gi,
        ]

        for (const pattern of patterns) {
            let match
            while ((match = pattern.exec(context.sql)) !== null) {
                const dateStr = match[2].replace(/\//g, '-')
                const todoDate = new Date(dateStr)
                const now = new Date()
                now.setHours(0, 0, 0, 0)

                if (isNaN(todoDate.getTime())) {
                    continue
                }

                const diffMs = now.getTime() - todoDate.getTime()
                const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

                if (diffDays <= gracePeriod) {
                    continue
                }

                const startLine = context.sql.substring(0, match.index).split('\n').length
                const loc: AstLocation = { line: startLine, column: 1 }
                diagnostics.push(this.addDiagnostic(loc, match[0].length, 'linter.expiredTodo.description', dateStr, String(diffDays)))
            }
        }

        return diagnostics
    }
}
