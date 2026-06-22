import * as vscode from 'vscode';
import { getParserEngine } from '../../parser/SqlParserEngine';
import { SafetyCheckResult, SafetyWarning, SafetyConfirmation, SafetyLevel } from './QueryResult';
import type { SqlDialect } from '../../parser/dialectMapper';
import { getConnectionManager } from '../connection/ConnectionManager';
import { t } from '../../i18n';
import { getConfigManager } from '../../core/configManager';

// 预编译的正则表达式常量，避免每次调用 analyzeWithRegex 时重复创建 RegExp 对象
const DELETE_PATTERN = /^\s*DELETE\s+/i;
const UPDATE_PATTERN = /^\s*UPDATE\s+/i;
const DROP_PATTERN = /^\s*DROP\s+/i;
const TRUNCATE_PATTERN = /^\s*TRUNCATE\s+/i;
const GRANT_PATTERN = /^\s*GRANT\s+/i;
const REVOKE_PATTERN = /^\s*REVOKE\s+/i;
const ALTER_PATTERN = /^\s*ALTER\s+/i;
const WHERE_PATTERN = /\bWHERE\b/i;

export class SafeQueryGuard {
    private getSafetyLevel(): SafetyLevel {
        return getConfigManager().get<SafetyLevel>('safetyGuard.level', 'moderate');
    }

    private inferDialect(): SqlDialect {
        try {
            const activeConn = getConnectionManager().getActiveConnection();
            if (activeConn?.dialect) {
                return activeConn.dialect as SqlDialect;
            }
        } catch (e) { console.warn('Failed to infer dialect:', e); }
        return 'sql';
    }

    async analyze(sql: string, overrideLevel?: SafetyLevel, dialect?: SqlDialect): Promise<SafetyCheckResult> {
        const level = overrideLevel ?? this.getSafetyLevel();

        if (level === 'off') {
            return { safe: true, warnings: [], confirmations: [] };
        }

        const warnings: SafetyWarning[] = [];
        const confirmations: SafetyConfirmation[] = [];

        const effectiveDialect = dialect ?? this.inferDialect();

        try {
            const parserEngine = getParserEngine();
            const result = parserEngine.tryAstify(sql, effectiveDialect);

            if (!result.success || !result.ast) {
                return this.analyzeWithRegex(sql, level, warnings, confirmations);
            }

            const astArray = Array.isArray(result.ast) ? result.ast : [result.ast];

            for (const node of astArray) {
                const astNode = node as unknown as Record<string, unknown>;
                const type = (astNode.type as string || '').toLowerCase();

                if (type === 'delete') {
                    if (!astNode.where) {
                        warnings.push({
                            rule: 'delete_without_where',
                            message: t('safety.deleteWithoutWhere'),
                            severity: 'warning',
                            sql,
                        });
                    }
                } else if (type === 'update') {
                    if (!astNode.where) {
                        warnings.push({
                            rule: 'update_without_where',
                            message: t('safety.updateWithoutWhere'),
                            severity: 'warning',
                            sql,
                        });
                    }
                } else if (type === 'drop') {
                    confirmations.push({
                        rule: 'drop_statement',
                        message: t('safety.dropStatement', this.extractObjectName(astNode)),
                        sql,
                    });
                } else if (type === 'truncate') {
                    confirmations.push({
                        rule: 'truncate_statement',
                        message: t('safety.truncateStatement', this.extractObjectName(astNode)),
                        sql,
                    });
                } else if (type === 'alter') {
                    if (this.hasDropColumn(astNode)) {
                        confirmations.push({
                            rule: 'alter_drop_column',
                            message: t('safety.alterDropColumn'),
                            sql,
                        });
                    }
                }
            }
        } catch (e) {
            console.warn('AST parsing failed, falling back to regex:', e);
            return this.analyzeWithRegex(sql, level, warnings, confirmations);
        }

        return this.buildResult(level, warnings, confirmations);
    }

    private analyzeWithRegex(
        sql: string,
        level: SafetyLevel,
        warnings: SafetyWarning[],
        confirmations: SafetyConfirmation[]
    ): SafetyCheckResult {
        if (DELETE_PATTERN.test(sql) && !WHERE_PATTERN.test(sql)) {
            warnings.push({
                rule: 'delete_without_where',
                message: t('safety.deleteWithoutWhere'),
                severity: 'warning',
                sql,
            });
        }

        if (UPDATE_PATTERN.test(sql) && !WHERE_PATTERN.test(sql)) {
            warnings.push({
                rule: 'update_without_where',
                message: t('safety.updateWithoutWhere'),
                severity: 'warning',
                sql,
            });
        }

        if (DROP_PATTERN.test(sql)) {
            confirmations.push({
                rule: 'drop_statement',
                message: t('safety.dropDetected'),
                sql,
            });
        }

        if (TRUNCATE_PATTERN.test(sql)) {
            confirmations.push({
                rule: 'truncate_statement',
                message: t('safety.truncateDetected'),
                sql,
            });
        }

        if (GRANT_PATTERN.test(sql)) {
            confirmations.push({
                rule: 'grant_statement',
                message: t('safety.grantStatement'),
                sql,
            });
        }

        if (REVOKE_PATTERN.test(sql)) {
            confirmations.push({
                rule: 'revoke_statement',
                message: t('safety.revokeStatement'),
                sql,
            });
        }

        if (ALTER_PATTERN.test(sql)) {
            confirmations.push({
                rule: 'alter_statement',
                message: t('safety.alterStatement'),
                sql,
            });
        }

        return this.buildResult(level, warnings, confirmations);
    }

    private buildResult(
        level: SafetyLevel,
        warnings: SafetyWarning[],
        confirmations: SafetyConfirmation[]
    ): SafetyCheckResult {
        const needsConfirmation =
            confirmations.length > 0 ||
            (level === 'strict' && warnings.length > 0);

        return {
            safe: !needsConfirmation,
            warnings,
            confirmations,
        };
    }

    private extractObjectName(astNode: Record<string, unknown>): string {
        const table = astNode.table;
        if (Array.isArray(table) && table.length > 0) {
            const first = table[0] as Record<string, unknown>;
            if (typeof first.table === 'string') return first.table;
            if (typeof first === 'string') return first;
        }
        if (typeof table === 'string') return table;
        if (table && typeof table === 'object') {
            const t = table as Record<string, unknown>;
            if (typeof t.table === 'string') return t.table;
        }
        return 'unknown object';
    }

    private hasDropColumn(astNode: Record<string, unknown>): boolean {
        const expr = astNode.expr;
        if (Array.isArray(expr)) {
            return expr.some(
                (e) =>
                    typeof e === 'object' &&
                    e !== null &&
                    (e as Record<string, unknown>).action === 'drop'
            );
        }
        return false;
    }

    async confirm(result: SafetyCheckResult): Promise<boolean> {
        const level = this.getSafetyLevel();

        if (level === 'off') return true;
        if (result.safe) return true;

        const items: SafetyConfirmation[] = [];

        if (level === 'strict') {
            items.push(
                ...result.warnings.map((w) => ({
                    rule: w.rule,
                    message: w.message,
                    sql: w.sql,
                })),
                ...result.confirmations
            );
        } else {
            items.push(...result.confirmations);
        }

        if (items.length === 0) return true;

        const message = items.map((c) => c.message).join('\n');
        const choice = await vscode.window.showWarningMessage(
            t('safety.dangerousOperation', message),
            { modal: true },
            t('safety.continue')
        );

        return choice === t('safety.continue');
    }
}
