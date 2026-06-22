import * as vscode from 'vscode';
import { initI18n } from '../i18n';
import { getContainer, Tokens } from './diContainer';
import { LRUCache } from '../utils/lruCache';

export class ConfigManager {
    private static readonly MAX_CACHE_SIZE = 500;
    private cache = new LRUCache<string, unknown>({ maxSize: ConfigManager.MAX_CACHE_SIZE });
    private disposables: vscode.Disposable[] = [];
    private _onDidChangeConfig = new vscode.EventEmitter<void>();
    private validators = new Map<string, (value: unknown) => boolean>();
    private lastConfigSnapshot = new Map<string, unknown>();
    private lintRuleKeys: string[] = [];
    private config: vscode.WorkspaceConfiguration | undefined;

    private getConfig(): vscode.WorkspaceConfiguration {
        if (!this.config) {
            this.config = vscode.workspace.getConfiguration('SQL-All-in-One');
        }
        return this.config;
    }

    private deepEqual(a: unknown, b: unknown, seen = new WeakSet()): boolean {
        if (a === b) return true;
        if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
        if (seen.has(a as object) || seen.has(b as object)) return a === b;
        seen.add(a as object);
        seen.add(b as object);
        const keysA = Object.keys(a as Record<string, unknown>);
        const keysB = new Set(Object.keys(b as Record<string, unknown>));
        if (keysA.length !== keysB.size) return false;
        for (const key of keysA) {
            if (!keysB.has(key)) return false;
            if (!this.deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], seen)) return false;
        }
        return true;
    }

    registerLintKeys(keys: string[]): void {
        this.lintRuleKeys = keys;
    }

    constructor() {
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('SQL-All-in-One')) {
                    // Selective per-key invalidation: only remove cache entries
                    // for config sections that actually changed.
                    const keysToDelete: string[] = [];
                    for (const [cacheKey] of this.cache.entries()) {
                        if (cacheKey.startsWith('__sectionKeys::')) {
                            // Parse: __sectionKeys::prefix::key1,key2,key3
                            const parts = cacheKey.split('::');
                            const prefix = parts[1];
                            const keys = parts[2].split(',');
                            const affected = keys.some(key => {
                                const section = prefix
                                    ? `SQL-All-in-One.${prefix}.${key}`
                                    : `SQL-All-in-One.${key}`;
                                return e.affectsConfiguration(section);
                            });
                            if (affected) {
                                keysToDelete.push(cacheKey);
                            }
                        } else {
                            // Regular cache key — check the section directly
                            if (e.affectsConfiguration(`SQL-All-in-One.${cacheKey}`)) {
                                keysToDelete.push(cacheKey);
                            }
                        }
                    }
                    for (const key of keysToDelete) {
                        this.cache.delete(key);
                    }

                    this.config = undefined;
                    if (e.affectsConfiguration('SQL-All-in-One.displayLanguage')) {
                        try {
                            initI18n();
                        } catch (e) {
                            // ignore: i18n reinit failure is non-fatal
                            console.debug('[SQL All in One] ConfigManager i18n reinit failed:', e)
                        }
                    }
                    this._onDidChangeConfig.fire();
                }
            })
        );
    }

    registerValidator<T>(section: string, validator: (value: T) => boolean): void {
        this.validators.set(section, validator as (value: unknown) => boolean);
    }

    get<T>(section: string, defaultValue: T): T {
        if (this.cache.has(section)) {
            return this.cache.get(section) as T;
        }
        const config = this.getConfig();
        let value = config.get<T>(section, defaultValue);

        const validator = this.validators.get(section);
        if (validator && !validator(value)) {
            console.warn(`Invalid value for ${section}, using default`);
            value = defaultValue;
        }

        this.cache.set(section, value);
        return value;
    }

    getSection<T extends Record<string, unknown>>(section: string, defaultValue: T): T {
        if (this.cache.has(section)) {
            return this.cache.get(section) as T;
        }
        const config = this.getConfig();
        const value = config.get<T>(section, defaultValue);
        this.cache.set(section, value);
        return value;
    }

    getSectionKeys<T extends Record<string, unknown>>(prefix: string, keys: string[], defaults: T): T {
        const cacheKey = `__sectionKeys::${prefix}::${keys.slice().sort().join(',')}`;
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey) as T;
        }
        const config = this.getConfig();
        const result = {} as Record<string, unknown>;
        for (const key of keys) {
            const section = prefix ? `${prefix}.${key}` : key;
            result[key] = config.get(section, defaults[key]);
        }
        this.cache.set(cacheKey, result);
        return result as T;
    }

    onConfigChange(listener: () => void): vscode.Disposable {
        return this._onDidChangeConfig.event(listener);
    }

    private getConfigSnapshot(): Map<string, unknown> {
        const snapshot = new Map<string, unknown>();
        const config = this.getConfig();

        const fixedKeys = [
            'enableLinter',
            'showErrorLevel',
            'showWarningLevel',
            'showInfoLevel',
        ];

        const allKeys = [...fixedKeys, ...this.lintRuleKeys];
        for (const key of allKeys) {
            snapshot.set(key, config.get(key));
        }
        return snapshot;
    }

    public checkLinterConfigChanged(): boolean {
        const newSnapshot = this.getConfigSnapshot();
        return this.isLinterConfigChanged(newSnapshot);
    }

    private isLinterConfigChanged(newSnapshot: Map<string, unknown>): boolean {
        if (this.lastConfigSnapshot.size === 0) {
            this.lastConfigSnapshot = newSnapshot;
            return true;
        }
        for (const [key, value] of newSnapshot) {
            if (
                key.startsWith('lint.') ||
                key === 'enableLinter' ||
                key === 'showErrorLevel' ||
                key === 'showWarningLevel' ||
                key === 'showInfoLevel'
            ) {
                const oldValue = this.lastConfigSnapshot.get(key);
                if (!this.deepEqual(oldValue, value)) {
                    this.lastConfigSnapshot = newSnapshot;
                    return true;
                }
            }
        }
        this.lastConfigSnapshot = newSnapshot;
        return false;
    }

    invalidate(): void {
        this.cache.clear();
    }

    dispose(): void {
        this.disposables.forEach((d) => { d.dispose(); });
        this._onDidChangeConfig.dispose();
    }
}

export function createConfigManager(): ConfigManager {
    return new ConfigManager();
}

export function getConfigManager(): ConfigManager {
    return getContainer().get<ConfigManager>(Tokens.ConfigManager);
}
