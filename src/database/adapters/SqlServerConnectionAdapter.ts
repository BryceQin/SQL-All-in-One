import type { ConnectionConfig, TestConnectionResult } from './IDatabaseAdapter';
import type { config as MssqlConfig, ConnectionPool } from 'mssql';
import type { SqlServerSharedContext } from './SqlServerSharedContext';
import { t } from '../../i18n/index';

/**
 * SQL Server connection pool operations.
 *
 * Uses the mssql npm package (which wraps the tedious TDS driver). The driver
 * is loaded via dynamic import so it stays in the esbuild `external` list and
 * is only required when a SQL Server connection is actually used.
 *
 * Used internally by SqlServerAdapter; common lifecycle logic lives in
 * BaseDatabaseAdapter.
 */
export class SqlServerConnectionAdapter {
    constructor(private shared: SqlServerSharedContext) {}

    async connect(config: ConnectionConfig): Promise<void> {
        const poolConfig = this.createPoolConfig(config);

        try {
            const mssql = await import('mssql');
            const pool = new mssql.ConnectionPool(poolConfig);
            await pool.connect();

            // Verify connectivity with a trivial query.
            const request = pool.request();
            await request.query('SELECT 1');

            this.shared.pool = pool;
            this.shared.totalConnectionCount = config.poolConfig?.minConnections ?? 1;
            this.shared.activeConnectionCount = 0;
            this.shared.lastActivityTime = Date.now();
        } catch (error: unknown) {
            this.shared.pool = null;
            throw this.formatConnectionError(error, config);
        }
    }

    async disconnect(): Promise<void> {
        if (this.shared.transaction) {
            try {
                await this.shared.transaction.rollback();
            } catch (e) {
                console.debug('[SQL All in One] SQL Server rollback error on disconnect:', e);
            }
            this.shared.transaction = null;
        }

        if (this.shared.pool) {
            await this.shared.pool.close();
            this.shared.pool = null;
        }
    }

    async testConnection(config: ConnectionConfig): Promise<TestConnectionResult> {
        const startTime = Date.now();
        let tempPool: ConnectionPool | null = null;

        try {
            const mssql = await import('mssql');
            tempPool = new mssql.ConnectionPool(this.createPoolConfig(config));
            await tempPool.connect();

            const request = tempPool.request();
            const result = await request.query('SELECT @@VERSION AS version');
            const endTime = Date.now();

            const versionRow = result.recordset[0] as Record<string, unknown> | undefined;
            const serverVersion = (versionRow?.version as string)?.split('\n')[0]?.trim() ?? 'SQL Server';

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
            if (tempPool) {
                try {
                    await tempPool.close();
                } catch (e) {
                    console.debug('[SQL All in One] SQL Server temp pool close error:', e);
                }
            }
        }
    }

    async checkConnectionHealth(): Promise<boolean> {
        if (!this.shared.pool) {
            return false;
        }

        try {
            const request = this.shared.pool.request();
            await request.query('SELECT 1');
            return true;
        } catch (e) {
            console.debug('[SQL All in One] SqlServerConnectionAdapter.checkConnectionHealth failed:', e);
            return false;
        }
    }

    /**
     * Reaps idle connections.
     * Called by SqlServerAdapter's reap timer callback.
     *
     * The mssql ConnectionPool manages its own idle connection eviction via the
     * `idleTimeoutMillis` pool option, so manual destruction is harmful. This
     * method is a no-op, retained for API compatibility with other adapters.
     */
    async reapIdleConnections(): Promise<void> {
        if (!this.shared.pool) return;
        this.shared.lastActivityTime = Date.now();
    }

    formatConnectionError(error: unknown, config: ConnectionConfig): Error {
        const msg = error instanceof Error ? error.message : String(error);
        const hostPort = `${config.host}:${config.port}`;

        // mssql/tedious error codes (MSSQLError.code)
        const code = (error as { code?: string })?.code;
        if (code === 'ELOGIN' || msg.includes('Login failed')) {
            return new Error(t('database.accessDenied', config.username, hostPort));
        }
        if (code === 'EINSTLOOKUP' || msg.includes('Server not found') || msg.includes('Cannot connect to server')) {
            return new Error(t('database.hostNotFound', config.host));
        }
        if (code === 'ETIMEOUT' || msg.includes('timeout') || msg.includes('Timeout')) {
            return new Error(t('database.connectionTimedOut', hostPort));
        }
        if (code === 'ESOCKET' || msg.includes('socket') || msg.includes('ECONNRESET')) {
            return new Error(t('database.connectionLost', hostPort));
        }
        if (msg.includes('self signed certificate') || msg.includes('certificate') || msg.includes('SSL')) {
            return new Error(t('database.sslError', hostPort));
        }

        // Common network errors (same patterns as BaseDatabaseAdapter)
        if (msg.includes('ECONNREFUSED')) {
            return new Error(t('database.connectionRefused', hostPort));
        }
        if (msg.includes('ETIMEDOUT') || msg.includes('connectTimeout')) {
            return new Error(t('database.connectionTimedOut', hostPort));
        }
        if (msg.includes('EHOSTUNREACH')) {
            return new Error(t('database.hostUnreachable', hostPort));
        }
        if (msg.includes('ENOTFOUND')) {
            return new Error(t('database.hostNotFound', config.host));
        }

        return error instanceof Error ? error : new Error(msg);
    }

    private createPoolConfig(config: ConnectionConfig): MssqlConfig {
        const poolConfig: MssqlConfig = {
            server: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            database: config.database,
            connectionTimeout: config.connectTimeout ?? 10000,
            requestTimeout: config.options?.requestTimeout as number | undefined,
            pool: {
                min: config.poolConfig?.minConnections ?? 1,
                max: config.poolConfig?.maxConnections ?? 5,
                idleTimeoutMillis: config.poolConfig?.idleTimeout ?? 30000,
            },
            options: {
                encrypt: config.ssl?.enabled ?? false,
                trustServerCertificate: config.ssl?.enabled ? (config.ssl.rejectUnauthorized === false) : true,
            },
        };

        // Allow dialect-specific options (e.g. appName, domain) to pass through.
        if (config.options) {
            const opts = config.options;
            if (typeof opts.appName === 'string') {
                (poolConfig.options as Record<string, unknown>).appName = opts.appName;
            }
            if (typeof opts.domain === 'string') {
                poolConfig.domain = opts.domain;
            }
            if (typeof opts.charset === 'string') {
                (poolConfig.options as Record<string, unknown>).collation = opts.charset;
            }
        }

        return poolConfig;
    }
}
