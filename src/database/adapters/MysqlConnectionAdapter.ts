import type { IConnectionAdapter, IPoolStatus, ConnectionConfig, TestConnectionResult } from './IDatabaseAdapter';
import type { PoolOptions, RowDataPacket } from 'mysql2/promise';
import type { MysqlSharedContext } from './MysqlSharedContext';
import { t } from '../../i18n/index';

export class MysqlConnectionAdapter implements IConnectionAdapter {
    constructor(private shared: MysqlSharedContext) {}

    getConnectionId(): string {
        return this.shared.connectionId;
    }

    isConnected(): boolean {
        return this.shared.pool !== null;
    }

    async connect(config: ConnectionConfig): Promise<void> {
        if (this.shared.pool) {
            await this.disconnect();
        }

        this.shared.config = config;

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
                    this.shared.pool!.getConnection().then(conn => conn.release()).catch((e) => { console.debug('[SQL All in One] Connection warmup failed:', e); })
                );
            }
            await Promise.all(warmupPromises);
            this.shared.totalConnectionCount = minConnections;
            this.shared.activeConnectionCount = 0;
            this.shared.lastActivityTime = Date.now();
            this.startReapTimer();
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
                console.debug('[SQL All in One] Rollback error on disconnect:', e);
            }
            this.shared.transactionConnection.release();
            this.shared.transactionConnection = null;
        }

        this.stopReapTimer();

        if (this.shared.pool) {
            await this.shared.pool.end();
            this.shared.pool = null;
        }

        this.shared.activeConnectionCount = 0;
        this.shared.totalConnectionCount = 0;
        this.shared.config = null;
    }

    async testConnection(config: ConnectionConfig): Promise<TestConnectionResult> {
        const startTime = Date.now();
        let tempConn: import('mysql2/promise').Connection | null = null;

        try {
            const mysql = await import('mysql2/promise');
            const connectOptions = this.createConnectionOptions(config);

            tempConn = await mysql.createConnection(connectOptions);
            const [rows] = await tempConn.query<RowDataPacket[]>('SELECT VERSION() AS version');
            const endTime = Date.now();
            return {
                success: true,
                serverVersion: (rows[0] as Record<string, unknown>)?.version as string ?? 'MySQL',
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
        } catch {
            return false;
        }
    }

    getPoolStatus(): IPoolStatus {
        if (!this.shared.pool) {
            return {
                totalConnections: 0,
                activeConnections: 0,
                idleConnections: 0,
                waitingRequests: 0,
                connectionLimit: this.shared.config?.poolConfig?.maxConnections ?? 5,
                acquireTimeout: this.shared.config?.poolConfig?.acquireTimeout ?? 60000,
            };
        }

        const { totalConnections, idleConnections, waitingRequests } = this.readPoolInternals();

        return {
            totalConnections,
            activeConnections: this.shared.activeConnectionCount,
            idleConnections,
            waitingRequests,
            connectionLimit: this.shared.config?.poolConfig?.maxConnections ?? 5,
            acquireTimeout: this.shared.config?.poolConfig?.acquireTimeout ?? 60000,
        };
    }

    private formatConnectionError(error: unknown, config: ConnectionConfig): Error {
        const msg = error instanceof Error ? error.message : String(error);
        const hostPort = `${config.host}:${config.port}`;

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

    private startReapTimer(): void {
        this.stopReapTimer();
        const reapInterval = this.shared.config?.poolConfig?.reapInterval ?? 60000;
        const idleTimeout = this.shared.config?.poolConfig?.idleTimeout ?? 300000;

        this.shared.reapTimer = setInterval(() => {
            this.reapIdleConnections(idleTimeout);
        }, reapInterval);
    }

    private stopReapTimer(): void {
        if (this.shared.reapTimer) {
            clearInterval(this.shared.reapTimer);
            this.shared.reapTimer = null;
        }
    }

    private async reapIdleConnections(idleTimeout: number): Promise<void> {
        if (!this.shared.pool) return;
        const now = Date.now();
        if (now - this.shared.lastActivityTime > idleTimeout) {
            const status = this.getPoolStatus();
            if (status.activeConnections === 0 && status.idleConnections > 0) {
                try {
                    const config = this.shared.config!;
                    await this.shared.pool.end();
                    const mysql = await import('mysql2/promise');
                    const poolOptions = this.createPoolOptions(config);
                    this.shared.pool = mysql.createPool(poolOptions);
                    this.shared.totalConnectionCount = 0;
                    this.shared.activeConnectionCount = 0;
                    this.shared.lastActivityTime = Date.now();
                } catch (e) {
                    console.debug('[SQL All in One] Reap idle connections error:', e);
                }
            }
        }
    }

    private readPoolInternals(): { totalConnections: number; idleConnections: number; waitingRequests: number } {
        return {
            totalConnections: this.shared.totalConnectionCount,
            idleConnections: Math.max(0, this.shared.totalConnectionCount - this.shared.activeConnectionCount),
            waitingRequests: 0, // We can't track this without internal access
        };
    }
}
