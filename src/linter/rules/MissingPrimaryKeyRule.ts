import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode } from '../../parser/AstVisitor'
import { getNodeLocation, getLocFromAny } from '../../parser/astUtils'
import type { AstNode, AstLocation } from '../../parser/astTypes'

export class MissingPrimaryKeyRule extends BaseRule {
    readonly id = 'missing_primary_key'
    readonly applicableTypes = ['create']
    readonly name = 'Missing Primary Key'
    readonly description = 'linter.createTableWithoutPK.description'
    readonly category = 'best-practices'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Warning
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node

        if (node.keyword !== 'table') {
            return diagnostics
        }

        const createDefinitions = node.create_definitions
        if (!Array.isArray(createDefinitions)) {
            return diagnostics
        }

        let hasPrimaryKey = false
        for (const def of createDefinitions) {
            if (def == null || typeof def !== 'object') {
                continue
            }
            const defNode = def as Record<string, unknown>

            if (defNode.resource === 'constraint') {
                const constraintType = defNode.constraint_type
                if (typeof constraintType === 'string' && constraintType.toLowerCase().includes('primary')) {
                    hasPrimaryKey = true
                    break
                }
            }

            if (defNode.primary_key === true || defNode.primary_key === 'primary key' || defNode.primary_key === 'key' || defNode.primary === 'key' || defNode.primary === 'primary key') {
                hasPrimaryKey = true
                break
            }

            const definition = defNode.definition
            if (Array.isArray(definition)) {
                for (const item of definition) {
                    if (isAstNode(item)) {
                        const itemNode = item as AstNode
                        if (itemNode.type === 'column_ref' && typeof itemNode.column === 'string' && itemNode.column.toLowerCase() === 'primary') {
                            hasPrimaryKey = true
                            break
                        }
                    }
                }
                if (hasPrimaryKey) break
            }
        }

        if (!hasPrimaryKey) {
            const loc = getNodeLocation(node)
            if (loc) {
                diagnostics.push(this.addDiagnostic(loc, 12, 'linter.createTableWithoutPK.description'))
            } else {
                let fallbackLoc: AstLocation | null = null
                const table = node.table
                if (Array.isArray(table) && table.length > 0) {
                    const firstTable = table[0] as Record<string, unknown>
                    fallbackLoc = getLocFromAny(firstTable)
                }
                if (!fallbackLoc && Array.isArray(createDefinitions) && createDefinitions.length > 0) {
                    const firstDef = createDefinitions[0] as Record<string, unknown>
                    fallbackLoc = getLocFromAny(firstDef)
                    if (!fallbackLoc && firstDef.column != null && typeof firstDef.column === 'object') {
                        fallbackLoc = getLocFromAny(firstDef.column as Record<string, unknown>)
                    }
                }
                if (fallbackLoc) {
                    diagnostics.push(this.addDiagnostic(fallbackLoc, 12, 'linter.createTableWithoutPK.description'))
                }
            }
        }

        return diagnostics
    }
}
