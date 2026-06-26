import type { ConnectionConfig, TestConnectionResult } from './IDatabaseAdapter';
import type { PoolOptions, RowDataPacket } from 'mysql2/promise';
import type { StarrocksSharedContext } from './StarrocksSharedContext';
import { t } from '../../i18n/index';

/**
 * StarRocks connection pool operations.
 *
 * StarRocks is MySQL-protocol compatible, so we reuse the mysql2 driver.
 * Used internally by StarrocksAdapter; common lifecycle logic lives in
 * BaseDatabaseAdapter.
 */
export class StarrocksConnectionAdapter {
    constructor(private shared: StarrocksSharedContext) {}

    async connect(config: ConnectionConfig): Promise<void> {
        const poolOptions = this.createPoolOptions(config);

        try {
            const mysql = await import('mysql2/promise');
            this.shared.pool = mysql.createPool(poolOptions);

            const conn = await this.shared.pool.getConnection();
            try {
                await conn.query<RowDataPacket[]>('SELECT 1');
            } finally {
                conn.release();
            }

            const minConnections = config.poolConfig?.minConnections ?? 1;
            const warmupPromises: Promise<void>[] = [];
            for (let i = 0; i < minConnections; i++) {
                warmupPromises.push(
                    this.shared.pool!.getConnection().then(conn => conn.release()).catch((e) => { console.debug('[SQL All in One] StarRocks connection warmup failed:', e); })
                );
            }
            await Promise.all(warmupPromises);
            this.shared.totalConnectionCount = minConnections;
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
                console.debug('[SQL All in One] StarRocks rollback error on disconnect:', e);
            }
            this.shared.transactionConnection.release();
            this.shared.transactionConnection = null;
        }

        if (this.shared.pool) {
            await this.shared.pool.end();
            this.shared.pool = null;
        }
    }

    async testConnection(config: ConnectionConfig): Promise<TestConnectionResult> {
        const startTime = Date.now();
        let tempConn: import('mysql2/promise').Connection | null = null;

        try {
            const mysql = await import('mysql2/promise');
            const connectOptions = this.createConnectionOptions(config);

            tempConn = await mysql.createConnection(connectOptions);
            // StarRocks supports SELECT version() like MySQL
            const [rows] = await tempConn.query<RowDataPacket[]>('SELECT version() AS version');
            const endTime = Date.now();
            return {
                success: true,
                serverVersion: (rows[0] as Record<string, unknown>)?.version as string ?? 'StarRocks',
                latency: endTime - startTime,
            };
        } catch (error: unknown) {
            const formatted = this.formatConnectionError(error, config);
            return {
                success: false,
                error: formatted.message,
            };
        } finally {
            if (tempConn) {
                await tempConn.end();
            }
        }
    }

    async checkConnectionHealth(): Promise<boolean> {
        if (!this.shared.pool) {
            return false;
        }

        try {
            const conn = await this.shared.pool.getConnection();
            try {
                await conn.ping();
                return true;
            } finally {
                conn.release();
            }
        } catch (e) {
            console.debug('[SQL All in One] StarrocksConnectionAdapter.checkConnectionHealth failed:', e);
            return false;
        }
    }

    /**
     * Reaps idle connections by recreating the pool.
     * Called by StarrocksAdapter's reap timer callback.
     */
    async reapIdleConnections(): Promise<void> {
        // mysql2 with enableKeepAlive:true handles idle connection eviction
        // internally. Manual pool destruction is harmful: it kills active
        // queries and creates a brief unavailability window. This method
        // is now a no-op, retained for API compatibility.
        if (!this.shared.pool) return;
        this.shared.lastActivityTime = Date.now();
    }

    formatConnectionError(error: unknown, config: ConnectionConfig): Error {
        const msg = error instanceof Error ? error.message : String(error);
        const hostPort = `${config.host}:${config.port}`;

        // MySQL/StarRocks-compatible errors
        if (msg.includes('ER_ACCESS_DENIED_ERROR') || msg.includes('Access denied')) {
            return new Error(t('database.accessDenied', config.username, hostPort));
        }
        if (msg.includes('ER_DBACCESS_DENIED_ERROR') || msg.includes('denied to user')) {
            return new Error(t('database.databaseAccessDenied', config.username, config.database || '(none)'));
        }
        if (msg.includes('PROTOCOL_CONNECTION_LOST')) {
            return new Error(t('database.connectionLost', hostPort));
        }
        if (msg.includes('ER_CON_COUNT_ERROR') || msg.includes('Too many connections')) {
            return new Error(t('database.tooManyConnections', hostPort));
        }
        if (msg.includes('self signed certificate') || msg.includes('certificate') || msg.includes('SSL')) {
            return new Error(t('database.sslError', hostPort));
        }
        if (msg.includes('ER_BAD_DB_ERROR')) {
            return new Error(t('database.databaseNotExist', config.database || '(none)', hostPort));
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

    private createPoolOptions(config: ConnectionConfig, connectionLimitOverride?: number): PoolOptions {
        const poolOptions: PoolOptions = {
            host: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            database: config.database,
            connectionLimit: connectionLimitOverride ?? config.poolConfig?.maxConnections ?? 5,
            waitForConnections: true,
            queueLimit: 0,
            connectTimeout: config.connectTimeout ?? 10000,
            enableKeepAlive: config.poolConfig?.enableKeepAlive ?? true,
            keepAliveInitialDelay: config.poolConfig?.keepAliveInterval ?? 30000,
        };

        if (config.options?.charset) {
            poolOptions.charset = config.options.charset as string;
        }
        if (config.options?.timezone) {
            poolOptions.timezone = config.options.timezone as string;
        }

        if (config.ssl?.enabled) {
            poolOptions.ssl = {
                rejectUnauthorized: config.ssl.rejectUnauthorized ?? true,
                ca: config.ssl.ca,
                cert: config.ssl.cert,
                key: config.ssl.key,
            };
        }

        return poolOptions;
    }

    private createConnectionOptions(config: ConnectionConfig): Record<string, unknown> {
        const options: Record<string, unknown> = {
            host: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            database: config.database,
            connectTimeout: config.connectTimeout ?? 10000,
        };

        if (config.options?.charset) {
            options.charset = config.options.charset;
        }
        if (config.options?.timezone) {
            options.timezone = config.options.timezone;
        }

        if (config.ssl?.enabled) {
            options.ssl = {
                rejectUnauthorized: config.ssl.rejectUnauthorized ?? true,
                ca: config.ssl.ca,
                cert: config.ssl.cert,
                key: config.ssl.key,
            };
        }

        return options;
    }
}
