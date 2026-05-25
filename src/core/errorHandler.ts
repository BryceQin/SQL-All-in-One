import * as vscode from 'vscode'
import { t } from '../i18n'

export enum ErrorCategory {
    CRITICAL = 'critical',
    FEATURE = 'feature',
    SUB_ITEM = 'sub_item',
}

export function handleError(error: unknown, context: string, category: ErrorCategory): void {
    const message = error instanceof Error ? error.message : String(error)

    switch (category) {
        case ErrorCategory.CRITICAL:
            console.error(`Hive Formatter [CRITICAL]: ${context} - ${message}`)
            vscode.window.showErrorMessage(t('notification.formatError', `${context}: ${message}`))
            break
        case ErrorCategory.FEATURE:
            console.error(`Hive Formatter [FEATURE]: ${context} - ${message}`)
            break
        case ErrorCategory.SUB_ITEM:
            console.warn(`Hive Formatter [SUB_ITEM]: ${context} - ${message}`)
            break
    }
}
