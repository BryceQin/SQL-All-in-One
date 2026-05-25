import * as vscode from 'vscode'
import { initI18n } from '../i18n'
import { getContainer, Tokens } from './diContainer'

interface ConfigListener {
  (): void
}

export class ConfigManager {
    private cache = new Map<string, unknown>()
    private disposables: vscode.Disposable[] = []
    private listeners: ConfigListener[] = []
    private validators = new Map<string, (value: unknown) => boolean>()

    constructor() {
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('Hive-Formatter')) {
                    this.cache.clear()
                    if (e.affectsConfiguration('Hive-Formatter.displayLanguage')) {
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
        const config = vscode.workspace.getConfiguration('Hive-Formatter')
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
        const config = vscode.workspace.getConfiguration('Hive-Formatter')
        const value = config.get<T>(section, defaultValue)
        this.cache.set(section, value)
        return value
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

getContainer().registerFactory(Tokens.ConfigManager, getConfigManager)
