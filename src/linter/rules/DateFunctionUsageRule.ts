import * as vscode from 'vscode'
import { FunctionNameMatchRule } from './FunctionNameMatchRule'

export class DateFunctionUsageRule extends FunctionNameMatchRule {
    readonly id = 'date_function_usage'
    readonly applicableTypes = ['select']
    readonly name = 'linter.dateFunctionUsage.name'
    readonly description = 'linter.dateFunctionUsage.description'
    readonly category = 'best-practices'
    readonly defaultSeverity = vscode.DiagnosticSeverity.Information
    readonly defaultEnabled = true

    // Uses predicate-based findNodes walker (preserves pre-refactor behaviour).
    protected override readonly useStrictOfType = false
    protected override readonly functionNameSet = new Set(['date_add', 'date_sub', 'now', 'sysdate'])
    protected override readonly messageKey = 'enhanced.dateFunctionHint'

    protected override buildMessageArgs(name: string): string[] {
        return [name]
    }
}
