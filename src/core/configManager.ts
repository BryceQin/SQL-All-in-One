import * as vscode from 'vscode';
import { initI18n } from '../i18n';
import { getContainer, Tokens } from './diContainer';

type ConfigListener = () => void;

export class ConfigManager {
    private cache = new Map<string, unknown>();
    private disposables: vscode.Disposable[] = [];
    private listeners: ConfigListener[] = [];
    private validators = new Map<string, (value: unknown) => boolean>();
    private lastConfigSnapshot: Map<string, unknown> = new Map();
    private lintRuleKeys: string[] = [];

    /**
     * Register lint rule keys dynamically. Called by RuleRegistry during initialization
     * to avoid hardcoding lint config keys and to avoid circular dependencies
     * (ConfigManager in core/ should not import from linter/).
     */
    registerLintKeys(keys: string[]): void {
        this.lintRuleKeys = keys;
    }

    constructor() {
        this.disposables.push(
            vscode.workspace.onDidChangeConfiguration((e) => {
                if (e.affectsConfiguration('SQL-All-in-One')) {
                    this.cache.clear();
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
        const config = vscode.workspace.getConfiguration('SQL-All-in-One');
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
        const config = vscode.workspace.getConfiguration('SQL-All-in-One');
        const value = config.get<T>(section, defaultValue);
        this.cache.set(section, value);
        return value;
    }

    getSectionKeys<T extends Record<string, unknown>>(prefix: string, keys: string[], defaults: T): T {
        const cacheKey = `__sectionKeys::${prefix}::${keys.join(',')}`;
        const cached = this.cache.get(cacheKey);
        if (cached !== undefined) {
            return cached as T;
        }
        const config = vscode.workspace.getConfiguration('SQL-All-in-One');
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
            dispose: () => {
                const idx = this.listeners.indexOf(listener);
                if (idx >= 0) {
                    this.listeners.splice(idx, 1);
                }
            },
        };
    }

    private getConfigSnapshot(): Map<string, unknown> {
        const snapshot = new Map<string, unknown>();
        const config = vscode.workspace.getConfiguration('SQL-All-in-One');

        // Fixed non-rule lint keys
        const fixedKeys = [
            'enableLinter',
            'showErrorLevel',
            'showWarningLevel',
            'showInfoLevel',
            'lint.missing_query_comment_threshold_line_count',
            'lint.missing_query_comment_threshold_join_count',
            'lint.missing_query_comment_threshold_subquery_count',
            'lint.missing_column_comment_aggregate',
            'lint.missing_column_comment_external_table_exempt',
            'lint.commented_out_code_threshold_lines',
            'lint.expired_todo_grace_period_days',
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
                if (JSON.stringify(oldValue) !== JSON.stringify(value)) {
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
        this.disposables.forEach((d) => d.dispose());
        this.listeners.length = 0;
    }
}

export function createConfigManager(): ConfigManager {
    return new ConfigManager();
}

export function getConfigManager(): ConfigManager {
    return getContainer().get<ConfigManager>(Tokens.ConfigManager);
}
