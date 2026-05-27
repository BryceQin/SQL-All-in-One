import * as vscode from 'vscode'
import { initI18n } from '../i18n'

type ConfigListener = () => void

export class ConfigManager {
    private cache = new Map<string, unknown>()
    private disposables: vscode.Disposable[] = []
    private listeners: ConfigListener[] = []
    private validators = new Map<string, (value: unknown) => boolean>()

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

    invalidate(): void {
        this.cache.clear()
    }

    dispose(): void {
        this.disposables.forEach(d => d.dispose())
        this.listeners.length = 0
    }
}

let instance: ConfigManager | null = null

export function getConfigManager(): ConfigManager {
    if (!instance) {
        instance = new ConfigManager()
    }
    return instance
}
