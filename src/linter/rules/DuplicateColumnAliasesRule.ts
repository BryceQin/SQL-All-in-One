import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode } from '../../parser/AstVisitor'
import { getNodeLocation, getColumnLoc, createDiagnostic } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'
import { t } from '../../i18n'

export class DuplicateColumnAliasesRule extends BaseRule {
    readonly id = 'duplicate_column_aliases'
    readonly applicableTypes = ['select']
    readonly name = 'Duplicate Column Aliases'
    readonly description = 'linter.duplicateAlias.description'
    readonly category = 'code-style'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Warning
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node

        // Check duplicate column aliases
        this.checkDuplicateColumnAliases(node, diagnostics)

        // Check duplicate table aliases (merged from AstEnhancedChecker)
        this.checkDuplicateTableAliases(node, diagnostics)

        return diagnostics
    }

    private checkDuplicateColumnAliases(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const columns = node.columns
        if (!Array.isArray(columns)) {
            return
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
    }

    private checkDuplicateTableAliases(node: AstNode, diagnostics: vscode.Diagnostic[]): void {
        const from = node.from
        if (!Array.isArray(from)) {
            return
        }

        const aliasMap = new Map<string, AstNode[]>()

        for (const entry of from) {
            if (!isAstNode(entry)) {
                continue
            }
            const fromEntry = entry as AstNode
            const as = fromEntry.as
            if (typeof as === 'string' && as.length > 0) {
                const lower = as.toLowerCase()
                if (!aliasMap.has(lower)) {
                    aliasMap.set(lower, [])
                }
                const existing = aliasMap.get(lower)
                if (existing) {
                    existing.push(fromEntry)
                }
            }
        }

        for (const [, entries] of aliasMap) {
            if (entries.length > 1) {
                for (let i = 1; i < entries.length; i++) {
                    const loc = getNodeLocation(entries[i])
                    if (loc) {
                        const alias = (entries[i].as as string).toLowerCase()
                        diagnostics.push(createDiagnostic(
                            loc, alias.length, 'DUPLICATE_ALIAS',
                            t('enhanced.duplicateAlias', String(loc.line), alias),
                            this.getSeverity(),
                            t('linter.source'),
                        ))
                    }
                }
            }
        }
    }
}
