import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { getColumnLoc } from '../../parser/astUtils'

export class DuplicateColumnAliasesRule extends BaseRule {
    readonly id = 'duplicate_column_aliases'
    readonly applicableTypes = ['select']

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node
        const columns = node.columns
        if (!Array.isArray(columns)) {
            return diagnostics
        }

        const aliasMap = new Map<string, { node: Record<string, unknown>; alias: string }[]>()

        for (const col of columns) {
            if (col == null || typeof col !== 'object') {
                continue
            }
            const colObj = col as Record<string, unknown>
            const as = colObj.as
            let aliasStr: string | null = null
            if (typeof as === 'string' && as.length > 0) {
                aliasStr = as
            } else if (as != null && typeof as === 'object') {
                const asObj = as as Record<string, unknown>
                if (typeof asObj.value === 'string' && asObj.value.length > 0) {
                    aliasStr = asObj.value
                }
            }
            if (aliasStr) {
                const lower = aliasStr.toLowerCase()
                if (!aliasMap.has(lower)) {
                    aliasMap.set(lower, [])
                }
                const existing = aliasMap.get(lower)
                if (existing) {
                    existing.push({ node: colObj, alias: aliasStr })
                }
            }
        }

        for (const [alias, entries] of aliasMap) {
            if (entries.length > 1) {
                for (let i = 1; i < entries.length; i++) {
                    const loc = getColumnLoc(entries[i].node)
                    if (loc) {
                        diagnostics.push(this.addDiagnostic(loc, alias.length, 'linter.duplicateAlias.description', alias))
                    }
                }
            }
        }

        return diagnostics
    }
}
