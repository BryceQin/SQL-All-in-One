import type { ConnectionConfig, TestConnectionResult } from './IDatabaseAdapter';
import type { Pool, PoolParameters } from 'odbc';
import type { DamengSharedContext } from './DamengSharedContext';
import { t } from '../../i18n/index';
import { BaseConnectionAdapter } from './BaseConnectionAdapter';

/**
 * Dameng (DM8) connection pool operations.
 *
 * Uses the `odbc` npm package (2.4.x) together with the Dameng DM8 ODBC
 * driver. The driver is loaded via dynamic import so it stays in the
 * esbuild `external` list and is only required when a Dameng connection is
 * actually used.
 *
 * The ODBC connection string format is:
 *   DRIVER={DM8 ODBC DRIVER};SERVER=host:port;UID=user;PWD=pwd;[SCHEMA=schema;][CHARSET=UTF-8;]
 *
 * Used internally by DamengAdapter; common lifecycle logic lives in
 * BaseDatabaseAdapter.
 */
export class DamengConnectionAdapter extends BaseConnectionAdapter {
    constructor(private shared: DamengSharedContext) {
        super();
    }

    async connect(config: ConnectionConfig): Promise<void> {
        const poolParams = this.createPoolParameters(config);

        try {
            const odbc = await import('odbc');
            this.shared.pool = await odbc.pool(poolParams);

            // Verify connectivity with a trivial query.
            const conn = await this.shared.pool.connect();
            try {
                await conn.query('SELECT 1 AS ONE FROM dual');
            } finally {
                await conn.close();
            }

            this.shared.totalConnectionCount = config.poolConfig?.minConnections ?? 1;
            this.shared.activeConnectionCount = 0;
            this.shared.lastActivityTime = Date.now();
        } catch (error: unknown) {
            this.shared.pool = null;
            throw this.formatConnectionError(error, config);
        }
    }

    async disconnect(): Promise<void> {
        if (this.shared.transactionConnection) {
            try {
                await this.shared.transactionConnection.rollback();
            } catch (e) {
                console.debug('[SQL All in One] Dameng rollback error on disconnect:', e);
            }
            try {
                await this.shared.transactionConnection.close();
            } catch (e) {
                console.debug('[SQL All in One] Dameng close transaction connection error:', e);
            }
            this.shared.transactionConnection = null;
        }

        // Close any leaked query connections before closing the pool.
        for (const conn of this.shared.activeQueryConnections.values()) {
            try {
                await conn.close();
            } catch (e) {
                console.debug('[SQL All in One] Dameng close leaked query connection error:', e);
            }
        }
        this.shared.activeQueryConnections.clear();

        if (this.shared.pool) {
            try {
                await this.shared.pool.close();
            } catch (e) {
                console.debug('[SQL All in One] Dameng pool close error:', e);
            }
            this.shared.pool = null;
        }
    }

    async testConnection(config: ConnectionConfig): Promise<TestConnectionResult> {
        const startTime = Date.now();
        let tempPool: Pool | null = null;
        let conn: import('odbc').Connection | null = null;

        try {
            const odbc = await import('odbc');
            tempPool = await odbc.pool(this.createPoolParameters(config, 1));
            conn = await tempPool.connect();
            // Dameng exposes version information through v$version, mirroring
            // Oracle's dynamic performance view.
            const result = await conn.query<{ BANNER: string }>(
                'SELECT banner FROM v$version WHERE ROWNUM = 1'
            );
            const endTime = Date.now();
            const versionRow = result[0];
            const serverVersion = (versionRow?.BANNER as string | undefined)
                ?.split('\n')[0]
                ?.trim() ?? 'Dameng DM';

            return {
                success: true,
                serverVersion,
                latency: endTime - startTime,
            };
        } catch (error: unknown) {
            const formatted = this.formatConnectionError(error, config);
            return {
                success: false,
                error: formatted.message,
            };
        } finally {
            if (conn) {
                try {
                    await conn.close();
                } catch (e) {
                    console.debug('[SQL All in One] Dameng test connection close error:', e);
                }
            }
            if (tempPool) {
                try {
                    await tempPool.close();
                } catch (e) {
                    console.debug('[SQL All in One] Dameng temp pool close error:', e);
                }
            }
        }
    }

    async checkConnectionHealth(): Promise<boolean> {
        if (!this.shared.pool) {
            return false;
        }

        let conn;
        try {
            conn = await this.shared.pool.connect();
            try {
                // ODBC connections do not expose a ping() method; run a
                // trivial SELECT to verify the connection is alive.
                await conn.query('SELECT 1 AS ONE FROM dual');
                return true;
            } finally {
                await conn.close();
            }
        } catch (e) {
            console.debug('[SQL All in One] DamengConnectionAdapter.checkConnectionHealth failed:', e);
            return false;
        }
    }

    /**
     * Reaps idle connections.
     *
     * The odbc Pool manages its own connection lifecycle (initialSize /
     * incrementSize / maxSize / shrink), so manual destruction is harmful.
     * This method is a no-op, retained for API compatibility with other
     * adapters.
     */
    override async reapIdleConnections(): Promise<void> {
        if (!this.shared.pool) return;
        this.shared.lastActivityTime = Date.now();
    }

    /**
     * Surfaces the ODBC SQLSTATE (or a `DM-XXXX` tag derived from the ODBC
     * error code when no SQLSTATE is present) so that
     * {@link BaseConnectionAdapter.formatConnectionError} can prepend it to
     * the raw error message when no localised mapping applied. This replaces
     * the previous per-dialect `formatConnectionError` override, which only
     * prepended the same tag and otherwise delegated to the base class.
     */
    protected override extractErrorCodeTag(error: unknown): string | null {
        const odbcErrors = (error as { odbcErrors?: Array<{ code?: number; state?: string; message?: string }> })?.odbcErrors ?? [];
        const firstError = odbcErrors[0];
        const state = firstError?.state ?? '';
        if (state) {
            return state;
        }
        const codeStr = firstError?.code !== undefined ? String(firstError.code) : '';
        return codeStr ? `DM-${codeStr}` : null;
    }

    protected override formatDriverSpecificError(error: unknown, config: ConnectionConfig): Error | undefined {
        const msg = error instanceof Error ? error.message : String(error);
        const hostPort = `${config.host}:${config.port}`;

        // ODBC errors surface a structured `odbcErrors` array whose entries
        // carry a numeric `code` and a 5-character SQLSTATE `state`. Dameng
        // reuses Oracle-style error codes (e.g. ORA-01017) for backward
        // compatibility, so we pattern-match on both the SQLSTATE and the
        // raw message text.
        const odbcErrors = (error as { odbcErrors?: Array<{ code?: number; state?: string; message?: string }> })?.odbcErrors ?? [];
        const firstError = odbcErrors[0];
        const state = firstError?.state ?? '';
        const codeStr = firstError?.code !== undefined ? String(firstError.code) : '';

        // Authentication failures.
        if (state === '28000' || codeStr === '1017' || msg.includes('ORA-01017') || msg.includes('invalid username/password') || msg.includes('authentication')) {
            return new Error(t('database.accessDenied', config.username, hostPort));
        }
        // Database / service not found.
        if (codeStr === '12505' || codeStr === '12514' || msg.includes('ORA-12505') || msg.includes('ORA-12514') || msg.includes('service') && msg.includes('not found')) {
            return new Error(t('database.databaseNotExist', config.database || '(none)', hostPort));
        }
        // No listener / connection refused.
        if (codeStr === '12541' || msg.includes('ORA-12541') || msg.includes('no listener')) {
            return new Error(t('database.connectionRefused', hostPort));
        }
        // Connect timeout.
        if (codeStr === '12170' || msg.includes('ORA-12170') || msg.includes('connect timeout') || state === 'HYT01') {
            return new Error(t('database.connectionTimedOut', hostPort));
        }
        // Host not found / unreachable.
        if (codeStr === '12545' || msg.includes('ORA-12545')) {
            return new Error(t('database.hostNotFound', config.host));
        }
        if (msg.includes('connection was closed') || msg.includes('connection lost')) {
            return new Error(t('database.connectionLost', hostPort));
        }

        // SSL/certificate and common network errors are handled by the base
        // class (BaseConnectionAdapter).
        return undefined;
    }

    /**
     * Builds the Dameng ODBC connection string from the host/port/database
     * config.
     *
     * Format:
     *   DRIVER={DM8 ODBC DRIVER};SERVER=host:port;UID=user;PWD=pwd;[SCHEMA=schema;][CHARSET=UTF-8;]
     *
     * If `config.options.connectString` is provided it is used verbatim,
     * taking precedence over the host/port/database derivation. The driver
     * name may be overridden via `config.options.driver` (e.g. for older
     * `DM7 ODBC DRIVER` installations).
     */
    private buildConnectionString(config: ConnectionConfig): string {
        const explicit = config.options?.connectString;
        if (typeof explicit === 'string' && explicit.length > 0) {
            return explicit;
        }

        const driver = (config.options?.driver as string | undefined) ?? 'DM8 ODBC DRIVER';
        const host = config.host;
        const port = String(config.port ?? 5236);
        const server = `${host}:${port}`;

        const parts: string[] = [];
        parts.push(`DRIVER={${driver}}`);
        parts.push(`SERVER=${server}`);
        parts.push(`UID=${config.username}`);
        if (config.password !== undefined && config.password !== null) {
            parts.push(`PWD=${config.password}`);
        }

        // The `database` field is used as the default SCHEMA on connect so
        // that unqualified object names resolve against it (Dameng mirrors
        // Oracle's schema-as-user model).
        const schema = (config.options?.schema as string | undefined) ?? config.database;
        if (typeof schema === 'string' && schema.length > 0) {
            parts.push(`SCHEMA=${schema}`);
        }

        const charset = config.options?.charset as string | undefined;
        if (typeof charset === 'string' && charset.length > 0) {
            parts.push(`CHARSET=${charset}`);
        }

        return parts.join(';') + ';';
    }

    private createPoolParameters(config: ConnectionConfig, maxSizeOverride?: number): PoolParameters {
        const params: PoolParameters = {
            connectionString: this.buildConnectionString(config),
            connectionTimeout: Math.floor((config.connectTimeout ?? 10000) / 1000),
            loginTimeout: Math.floor((config.connectTimeout ?? 10000) / 1000),
            initialSize: config.poolConfig?.minConnections ?? 1,
            incrementSize: 1,
            maxSize: maxSizeOverride ?? config.poolConfig?.maxConnections ?? 5,
            shrink: true,
        };

        return params;
    }
}
