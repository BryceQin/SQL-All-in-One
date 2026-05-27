import * as vscode from 'vscode'
import type { LintRule, RuleContext } from './LintRule'
import type { LintRuleConfig } from '../lintRules'
import { createDiagnostic } from '../../parser/astUtils'
import { tAny, t } from '../../i18n'
import type { AstLocation } from '../../parser/astTypes'

export abstract class BaseRule implements LintRule {
    abstract readonly id: string
    abstract readonly applicableTypes: string[]
    abstract readonly name: string
    abstract readonly description: string
    abstract readonly category: string
    abstract readonly defaultSeverity: vscode.DiagnosticSeverity
    abstract readonly defaultEnabled: boolean

    protected config: LintRuleConfig

    constructor(config: LintRuleConfig) {
        this.config = config
    }

    isEnabled(): boolean {
        return this.config.enabled
    }

    getSeverity(): vscode.DiagnosticSeverity {
        return this.config.severity
    }

    protected addDiagnostic(
        loc: AstLocation,
        length: number,
        messageKey: string,
        ...messageArgs: string[]
    ): vscode.Diagnostic {
        const message = `【第 ${loc.line} 行】${tAny(messageKey, ...messageArgs)}`
        return createDiagnostic(loc, length, this.id, message, this.getSeverity(), t('linter.source'))
    }

    abstract check(context: RuleContext): vscode.Diagnostic[]
}
