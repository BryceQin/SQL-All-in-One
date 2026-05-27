import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode } from '../../parser/AstVisitor'
import { getNodeLocation, createDiagnostic } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'
import { t } from '../../i18n'

const RESERVED_WORDS = new Set([
    'select', 'from', 'where', 'group', 'by', 'having', 'order', 'limit',
    'insert', 'update', 'delete', 'create', 'drop', 'alter', 'table',
    'join', 'left', 'right', 'inner', 'outer', 'full', 'on', 'and', 'or',
    'not', 'in', 'is', 'null', 'like', 'between', 'distinct', 'as', 'count',
    'sum', 'avg', 'max', 'min', 'union', 'all', 'any', 'exists', 'case',
    'when', 'then', 'else', 'end', 'default', 'values', 'set',
])

export class ReservedWordIdentifierRule extends BaseRule {
    readonly id = 'reserved_word_identifier'
    readonly applicableTypes = ['select']
    readonly name = 'Reserved Word Identifier'
    readonly description = 'enhanced.reservedWordIdentifier'
    readonly category = 'best-practices'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Warning
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node

        const columns = node.columns
        if (!Array.isArray(columns)) {
            return diagnostics
        }

        for (const col of columns) {
            if (!isAstNode(col)) {
                continue
            }
            const colNode = col as AstNode
            const as = colNode.as
            if (typeof as === 'string' && RESERVED_WORDS.has(as.toLowerCase())) {
                const loc = getNodeLocation(colNode)
                if (loc) {
                    diagnostics.push(createDiagnostic(
                        loc, as.length, 'RESERVED_WORD_IDENTIFIER',
                        t('enhanced.reservedWordIdentifier', String(loc.line), as),
                        this.getSeverity(),
                        t('linter.source'),
                    ))
                }
            }
        }

        return diagnostics
    }
}
