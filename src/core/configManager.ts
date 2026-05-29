import * as vscode from 'vscode'
import { initI18n } from '../i18n'
import { getContainer, Tokens } from './diContainer'

type ConfigListener = () => void

export class ConfigManager {
    private cache = new Map<string, unknown>()
    private disposables: vscode.Disposable[] = []
    private listeners: ConfigListener[] = []
    private validators = new Map<string, (value: unknown) => boolean>()
    private lastConfigSnapshot: Map<string, unknown> = new Map()

    constructor() {
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('SQL-All-in-One')) {
                    this.cache.clear()
                    if (e.affectsConfiguration('SQL-All-in-One.displayLanguage')) {
                        try { initI18n() } catch { /* ignore */ }
                    }
                    for (const listener of this.listeners) {
                        listener()
                    }
                }
            }),
        )
    }

    registerValidator<T>(section: string, validator: (value: T) => boolean): void {
        this.validators.set(section, validator as (value: unknown) => boolean)
    }

    get<T>(section: string, defaultValue: T): T {
        const cached = this.cache.get(section)
        if (cached !== undefined) {
            return cached as T
        }
        const config = vscode.workspace.getConfiguration('SQL-All-in-One')
        let value = config.get<T>(section, defaultValue)
        
        const validator = this.validators.get(section)
        if (validator && !validator(value)) {
            console.warn(`Invalid value for ${section}, using default`)
            value = defaultValue
        }
        
        this.cache.set(section, value)
        return value
    }

    getSection<T extends Record<string, unknown>>(section: string, defaultValue: T): T {
        const cached = this.cache.get(section)
        if (cached !== undefined) {
            return cached as T
        }
        const config = vscode.workspace.getConfiguration('SQL-All-in-One')
        const value = config.get<T>(section, defaultValue)
        this.cache.set(section, value)
        return value
    }

    getSectionKeys<T extends Record<string, unknown>>(prefix: string, keys: string[], defaults: T): T {
        const cacheKey = `__sectionKeys::${prefix}::${keys.join(',')}`
        const cached = this.cache.get(cacheKey)
        if (cached !== undefined) {
            return cached as T
        }
        const config = vscode.workspace.getConfiguration('SQL-All-in-One')
        const result = {} as Record<string, unknown>
        for (const key of keys) {
            const section = prefix ? `${prefix}.${key}` : key
            result[key] = config.get(section, defaults[key])
        }
        this.cache.set(cacheKey, result)
        return result as T
    }

    onConfigChange(listener: ConfigListener): vscode.Disposable {
        this.listeners.push(listener)
        return {
            dispose: () => {
                const idx = this.listeners.indexOf(listener)
                if (idx >= 0) this.listeners.splice(idx, 1)
            },
        }
    }

    private getConfigSnapshot(): Map<string, unknown> {
        const snapshot = new Map<string, unknown>()
        const config = vscode.workspace.getConfiguration('SQL-All-in-One')
        const allKeys = [
            'enableLinter', 'showErrorLevel', 'showWarningLevel', 'showInfoLevel',
            'lint.avoid_select_star', 'lint.explicit_join_type', 'lint.limit_with_order_by',
            'lint.avoid_column_count_mismatch', 'lint.missing_primary_key',
            'lint.use_current_timestamp', 'lint.avoid_select_in_insert',
            'lint.duplicate_column_aliases', 'lint.uppercase_keywords',
            'lint.consistent_aliasing', 'lint.use_coalesce_over_isnull',
            'lint.explicit_column_aliasing', 'lint.avoid_correlated_subqueries',
            'lint.long_query_line', 'lint.missing_query_comment',
            'lint.missing_query_comment_threshold_line_count',
            'lint.missing_query_comment_threshold_join_count',
            'lint.missing_query_comment_threshold_subquery_count',
            'lint.missing_column_comment',
            'lint.missing_column_comment_aggregate',
            'lint.missing_column_comment_external_table_exempt',
            'lint.commented_out_code',
            'lint.commented_out_code_threshold_lines',
            'lint.expired_todo',
            'lint.expired_todo_grace_period_days',
            'lint.having_without_group_by',
            'lint.limit_invalid_value', 'lint.reserved_word_identifier',
            'lint.join_missing_on', 'lint.select_without_from',
            'lint.misplaced_distinct', 'lint.aggregate_in_where',
            'lint.subquery_without_alias', 'lint.suspicious_null_comparison',
            'lint.incomplete_case', 'lint.redundant_distinct',
            'lint.date_function_usage', 'lint.wildcard_in_update'
        ]
        for (const key of allKeys) {
            snapshot.set(key, config.get(key))
        }
        return snapshot
    }

    public checkLinterConfigChanged(): boolean {
        const newSnapshot = this.getConfigSnapshot()
        return this.isLinterConfigChanged(newSnapshot)
    }

    private isLinterConfigChanged(newSnapshot: Map<string, unknown>): boolean {
        if (this.lastConfigSnapshot.size === 0) {
            this.lastConfigSnapshot = newSnapshot
            return true
        }
        for (const [key, value] of newSnapshot) {
            if (key.startsWith('lint.') || key === 'enableLinter' || 
                key === 'showErrorLevel' || key === 'showWarningLevel' || 
                key === 'showInfoLevel') {
                const oldValue = this.lastConfigSnapshot.get(key)
                if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
                    this.lastConfigSnapshot = newSnapshot
                    return true
                }
            }
        }
        this.lastConfigSnapshot = newSnapshot
        return false
    }

    invalidate(): void {
        this.cache.clear()
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose())
        this.listeners.length = 0
    }
}

export function createConfigManager(): ConfigManager {
    return new ConfigManager()
}

let instance: ConfigManager | null = null

export function getConfigManager(): ConfigManager {
    const container = getContainer()
    if (container.has(Tokens.ConfigManager)) {
        return container.get<ConfigManager>(Tokens.ConfigManager)
    }
    if (!instance) {
        instance = new ConfigManager()
    }
    return instance
}
