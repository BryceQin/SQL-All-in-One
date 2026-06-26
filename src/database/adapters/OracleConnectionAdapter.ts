import type { ConnectionConfig, TestConnectionResult } from './IDatabaseAdapter';
import type { PoolAttributes, Pool } from 'oracledb';
import type { OracleSharedContext } from './OracleSharedContext';
import { t } from '../../i18n/index';

/**
 * Oracle connection pool operations.
 *
 * Uses the oracledb npm package (6.x). By default the driver runs in thin mode
 * (pure JavaScript, no Instant Client required). Thick mode can be enabled via
 * `config.options.thickMode` together with an optional
 * `config.options.instantClientPath`; in that case `initOracleClient` is called
 * once per process (idempotently guarded).
 *
 * The driver is loaded via dynamic import so it stays in the esbuild `external`
 * list and is only required when an Oracle connection is actually used.
 *
 * Used internally by OracleAdapter; common lifecycle logic lives in
 * BaseDatabaseAdapter.
 */
export class OracleConnectionAdapter {
    constructor(private shared: OracleSharedContext) {}

    async connect(config: ConnectionConfig): Promise<void> {
        const poolAttrs = this.createPoolAttributes(config);

        try {
            // Initialise thick mode if requested. initOracleClient is global
            // and may only be called once per process; guard with a module
            // level flag so repeated connect() calls stay idempotent.
            await this.maybeInitThickMode(config);

            const oracledb = await import('oracledb');
            this.shared.pool = await oracledb.createPool(poolAttrs);

            // Verify connectivity with a trivial query.
            const conn = await this.shared.pool.getConnection();
            try {
                await conn.execute('SELECT 1 AS ONE FROM dual');
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
                console.debug('[SQL All in One] Oracle rollback error on disconnect:', e);
            }
            try {
                await this.shared.transactionConnection.close();
            } catch (e) {
                console.debug('[SQL All in One] Oracle close transaction connection error:', e);
            }
            this.shared.transactionConnection = null;
        }

        if (this.shared.pool) {
            try {
                await this.shared.pool.close();
            } catch (e) {
                console.debug('[SQL All in One] Oracle pool close error:', e);
            }
            this.shared.pool = null;
        }
    }

    async testConnection(config: ConnectionConfig): Promise<TestConnectionResult> {
        const startTime = Date.now();
        let tempPool: Pool | null = null;

        try {
            await this.maybeInitThickMode(config);

            const oracledb = await import('oracledb');
            tempPool = await oracledb.createPool(this.createPoolAttributes(config, 1));
            const conn = await tempPool.getConnection();
            try {
                const result = await conn.execute<{ BANNER: string }>(
                    'SELECT banner FROM v$version WHERE ROWNUM = 1'
                );
                const endTime = Date.now();
                const versionRow = result.rows?.[0];
                const serverVersion = (versionRow?.BANNER as string)?.split('\n')[0]?.trim() ?? 'Oracle';

                return {
                    success: true,
                    serverVersion,
                    latency: endTime - startTime,
                };
            } finally {
                await conn.close();
            }
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
                    console.debug('[SQL All in One] Oracle temp pool close error:', e);
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
            conn = await this.shared.pool.getConnection();
            try {
                await conn.ping();
                return true;
            } finally {
                await conn.close();
            }
        } catch (e) {
            console.debug('[SQL All in One] OracleConnectionAdapter.checkConnectionHealth failed:', e);
            return false;
        }
    }

    /**
     * Reaps idle connections.
     * Called by OracleAdapter's reap timer callback.
     *
     * The oracledb Pool manages its own idle connection eviction via the
     * `poolTimeout` pool option, so manual destruction is harmful. This method
     * is a no-op, retained for API compatibility with other adapters.
     */
    async reapIdleConnections(): Promise<void> {
        if (!this.shared.pool) return;
        this.shared.lastActivityTime = Date.now();
    }

    formatConnectionError(error: unknown, config: ConnectionConfig): Error {
        const msg = error instanceof Error ? error.message : String(error);
        const hostPort = `${config.host}:${config.port}`;

        // Oracle error numbers are surfaced as ORA-XXXXX or DPI-XXXX.
        const errorNum = (error as { errorNum?: number })?.errorNum;
        const oraCode = errorNum ? `ORA-${String(errorNum).padStart(5, '0')}` : '';

        if (oraCode === 'ORA-01017' || msg.includes('ORA-01017') || msg.includes('invalid username/password')) {
            return new Error(t('database.accessDenied', config.username, hostPort));
        }
        if (oraCode === 'ORA-12505' || msg.includes('ORA-12505') || msg.includes('TNS:listener does not currently know of SID')) {
            return new Error(t('database.databaseNotExist', config.database || '(none)', hostPort));
        }
        if (oraCode === 'ORA-12514' || msg.includes('ORA-12514') || msg.includes('TNS:listener does not currently know of service')) {
            return new Error(t('database.databaseNotExist', config.database || '(none)', hostPort));
        }
        if (oraCode === 'ORA-12541' || msg.includes('ORA-12541') || msg.includes('TNS:no listener')) {
            return new Error(t('database.connectionRefused', hostPort));
        }
        if (oraCode === 'ORA-12170' || msg.includes('ORA-12170') || msg.includes('TNS:Connect timeout occurred')) {
            return new Error(t('database.connectionTimedOut', hostPort));
        }
        if (oraCode === 'ORA-12545' || msg.includes('ORA-12545') || msg.includes('TNS:unable to resolve the connect identifier')) {
            return new Error(t('database.hostNotFound', config.host));
        }
        if (msg.includes('DPI-1080') || msg.includes('connection was closed')) {
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

        // Preserve the ORA- code in the message when available so callers can
        // surface dialect-specific diagnostics.
        if (oraCode && !msg.includes(oraCode)) {
            return new Error(`${oraCode}: ${msg}`);
        }

        return error instanceof Error ? error : new Error(msg);
    }

    /**
     * Builds the oracledb connect string from the host/port/database config.
     *
     * Supports two formats:
     *   - `host:port/service_name`  (default, EZ-connect style)
     *   - `host:port:sid`           (when `config.options.useSid` is true)
     *
     * If `config.options.connectString` is provided it is used verbatim,
     * taking precedence over the host/port/database derivation.
     */
    private buildConnectString(config: ConnectionConfig): string {
        const explicit = config.options?.connectString;
        if (typeof explicit === 'string' && explicit.length > 0) {
            return explicit;
        }

        const host = config.host;
        const port = String(config.port ?? 1521);
        const useSid = config.options?.useSid === true;
        const serviceOrSid = config.database ?? 'ORCL';

        if (useSid) {
            // host:port:sid  →  //(HOST:PORT)(SID=...)
            return `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${host})(PORT=${port}))(CONNECT_DATA=(SID=${serviceOrSid})))`;
        }

        // host:port/service_name  →  //(HOST:PORT)(SERVICE_NAME=...)
        return `(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST=${host})(PORT=${port}))(CONNECT_DATA=(SERVICE_NAME=${serviceOrSid})))`;
    }

    private createPoolAttributes(config: ConnectionConfig, maxConnectionsOverride?: number): PoolAttributes {
        const poolAttrs: PoolAttributes = {
            user: config.username,
            password: config.password,
            connectString: this.buildConnectString(config),
            poolMin: config.poolConfig?.minConnections ?? 1,
            poolMax: maxConnectionsOverride ?? config.poolConfig?.maxConnections ?? 5,
            poolIncrement: 1,
            poolTimeout: Math.floor((config.poolConfig?.idleTimeout ?? 30000) / 1000),
            poolPingInterval: Math.floor((config.poolConfig?.keepAliveInterval ?? 30000) / 1000),
            connectTimeout: config.connectTimeout ?? 10000,
            stmtCacheSize: 30,
        };

        // SSL/TLS support. oracledb thin mode supports TLS via the wallet /
        // sslServerCertDN options; thick mode uses the native wallet. We pass
        // through the relevant options when SSL is enabled.
        if (config.ssl?.enabled) {
            poolAttrs.ssl = true;
            if (typeof config.options?.sslServerCertDN === 'string') {
                poolAttrs.sslServerCertDN = config.options.sslServerCertDN as string;
            }
            // When rejectUnauthorized is false, allow weak DN matching so that
            // self-signed certificates do not need to match the host name.
            if (config.ssl.rejectUnauthorized === false) {
                poolAttrs.sslAllowWeakDNMatch = true;
                poolAttrs.sslServerCertDNMatch = false;
            }
        }

        return poolAttrs;
    }

    /**
     * Initialises the oracledb thick (native) mode if requested.
     *
     * `initOracleClient` is a global, one-shot call: invoking it twice in the
     * same process throws DPI-1074. We guard it with a module-level flag so
     * repeated connect()/testConnection() calls remain idempotent.
     */
    private static thickModeInitialised = false;

    private async maybeInitThickMode(config: ConnectionConfig): Promise<void> {
        const thickMode = config.options?.thickMode === true;
        if (!thickMode) {
            return;
        }

        if (OracleConnectionAdapter.thickModeInitialised) {
            return;
        }

        const oracledb = await import('oracledb');
        const initOptions: { libDir?: string; configDir?: string } = {};
        const instantClientPath = config.options?.instantClientPath;
        if (typeof instantClientPath === 'string' && instantClientPath.length > 0) {
            initOptions.libDir = instantClientPath;
        }
        const configDir = config.options?.configDir;
        if (typeof configDir === 'string' && configDir.length > 0) {
            initOptions.configDir = configDir;
        }

        try {
            oracledb.initOracleClient(initOptions);
            OracleConnectionAdapter.thickModeInitialised = true;
        } catch (e) {
            // If a previous call already initialised thick mode (e.g. from
            // another adapter instance), oracledb throws DPI-1074. Treat that
            // as success.
            const msg = e instanceof Error ? e.message : String(e);
            if (msg.includes('DPI-1074') || msg.includes('already initialized')) {
                OracleConnectionAdapter.thickModeInitialised = true;
                return;
            }
            throw e;
        }
    }
}
