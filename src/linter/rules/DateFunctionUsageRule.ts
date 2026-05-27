import * as vscode from 'vscode'
import type { RuleContext } from './LintRule'
import { BaseRule } from './BaseRule'
import { isAstNode, findNodes } from '../../parser/AstVisitor'
import { getNodeLocation, getFunctionName, createDiagnostic } from '../../parser/astUtils'
import type { AstNode } from '../../parser/astTypes'
import { t } from '../../i18n'

const DATE_FUNCTION_NAMES = new Set(['date_add', 'date_sub', 'now', 'sysdate'])

export class DateFunctionUsageRule extends BaseRule {
    readonly id = 'date_function_usage'
    readonly applicableTypes = ['select']
    readonly name = 'Date Function Usage'
    readonly description = 'enhanced.dateFunctionHint'
    readonly category = 'best-practices'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information
    readonly defaultEnabled = true

    check(context: RuleContext): vscode.Diagnostic[] {
        const diagnostics: vscode.Diagnostic[] = []
        const node = context.node

        const funcNodes = findNodes(node, (n): n is AstNode => {
            return isAstNode(n) && (n as AstNode).type === 'function'
        })

        for (const func of funcNodes) {
            const name = getFunctionName(func)
            if (name && DATE_FUNCTION_NAMES.has(name.toLowerCase())) {
                const loc = getNodeLocation(func)
                if (loc) {
                    diagnostics.push(createDiagnostic(
                        loc, name.length, 'DATE_FUNCTION_HINT',
                        t('enhanced.dateFunctionHint', name),
                        this.getSeverity(),
                        t('linter.source'),
                    ))
                }
            }
        }

        return diagnostics
    }
}
