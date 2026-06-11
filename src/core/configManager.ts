import * as vscode from 'vscode';
import { initI18n } from '../i18n';
import { getContainer, Tokens } from './diContainer';
import { LRUCache } from '../utils/lruCache';

type ConfigListener = () => void;

export class ConfigManager {
    private static readonly MAX_CACHE_SIZE = 500;
    private cache = new LRUCache<string, unknown>({ maxSize: ConfigManager.MAX_CACHE_SIZE });
    private disposables: vscode.Disposable[] = [];
    private listeners: ConfigListener[] = [];
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

    private deepEqual(a: unknown, b: unknown, seenA = new WeakSet(), seenB = new WeakSet()): boolean {
        if (a === b) return true;
        if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
        if (seenA.has(a as object) || seenB.has(b as object)) return false;
        seenA.add(a as object);
        seenB.add(b as object);
        const keysA = Object.keys(a as Record<string, unknown>);
        const keysB = new Set(Object.keys(b as Record<string, unknown>));
        if (keysA.length !== keysB.size) return false;
        for (const key of keysA) {
            if (!keysB.has(key)) return false;
            if (!this.deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key], seenA, seenB)) return false;
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
                    this.cache.clear();
                    this.config = undefined;
                    if (e.affectsConfiguration('SQL-All-in-One.displayLanguage')) {
                        try {
                            initI18n();
                        } catch {
                            // ignore
                        }
                    }
                    for (const listener of this.listeners) {
                        listener();
                    }
                }
            })
        );
    }

    registerValidator<T>(section: string, validator: (value: T) => boolean): void {
        this.validators.set(section, validator as (value: unknown) => boolean);
    }

    get<T>(section: string, defaultValue: T): T {
        const cached = this.cache.get(section);
        if (cached !== undefined) {
            return cached as T;
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
        const cached = this.cache.get(section);
        if (cached !== undefined) {
            return cached as T;
        }
        const config = this.getConfig();
        const value = config.get<T>(section, defaultValue);
        this.cache.set(section, value);
        return value;
    }

    getSectionKeys<T extends Record<string, unknown>>(prefix: string, keys: string[], defaults: T): T {
        const cacheKey = `__sectionKeys::${prefix}::${keys.slice().sort().join(',')}`;
        const cached = this.cache.get(cacheKey);
        if (cached !== undefined) {
            return cached as T;
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

    onConfigChange(listener: ConfigListener): vscode.Disposable {
        this.listeners.push(listener);
        return {
            dispose: (): void => {
                const idx = this.listeners.indexOf(listener);
                if (idx >= 0) {
                    this.listeners.splice(idx, 1);
                }
            },
        };
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
        this.listeners.length = 0;
    }
}

export function createConfigManager(): ConfigManager {
    return new ConfigManager();
}

export function getConfigManager(): ConfigManager {
    return getContainer().get<ConfigManager>(Tokens.ConfigManager);
}
