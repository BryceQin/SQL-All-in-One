import type { ConnectionConfig, TestConnectionResult } from './IDatabaseAdapter';
import type { PoolConfig } from 'pg';
import type { PostgresSharedContext } from './PostgresSharedContext';
import { t } from '../../i18n/index';

export class PostgresConnectionAdapter {
    constructor(private shared: PostgresSharedContext) {}

    async connect(config: ConnectionConfig): Promise<void> {
        const poolConfig = this.createPoolConfig(config);

        try {
            const { Pool } = await import('pg');
            this.shared.pool = new Pool(poolConfig);

            const client = await this.shared.pool.connect();
            try {
                await client.query('SELECT 1');
            } finally {
                client.release();
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
        if (this.shared.transactionClient) {
            try {
                await this.shared.transactionClient.query('ROLLBACK');
            } catch (e) {
                console.debug('[SQL All in One] PG rollback error on disconnect:', e);
            }
            this.shared.transactionClient.release();
            this.shared.transactionClient = null;
        }

        if (this.shared.pool) {
            await this.shared.pool.end();
            this.shared.pool = null;
        }
    }

    async testConnection(config: ConnectionConfig): Promise<TestConnectionResult> {
        const startTime = Date.now();
        let tempPool: import('pg').Pool | null = null;

        try {
            const { Pool } = await import('pg');
            tempPool = new Pool(this.createPoolConfig(config));
            const client = await tempPool.connect();
            try {
                const result = await client.query('SELECT version() AS version');
                const endTime = Date.now();
                return {
                    success: true,
                    serverVersion: (result.rows[0] as Record<string, unknown>)?.version as string ?? 'PostgreSQL',
                    latency: endTime - startTime,
                };
            } finally {
                client.release();
            }
        } catch (error: unknown) {
            const formatted = this.formatConnectionError(error, config);
            return {
                success: false,
                error: formatted.message,
            };
        } finally {
            if (tempPool) {
                await tempPool.end();
            }
        }
    }

    async checkConnectionHealth(): Promise<boolean> {
        if (!this.shared.pool) {
            return false;
        }

        try {
            const client = await this.shared.pool.connect();
            try {
                await client.query('SELECT 1');
                return true;
            } finally {
                client.release();
            }
        } catch (e) {
            console.debug('[SQL All in One] PostgresConnectionAdapter.checkConnectionHealth failed:', e);
            return false;
        }
    }

    async reapIdleConnections(): Promise<void> {
        if (!this.shared.pool) return;
        this.shared.lastActivityTime = Date.now();
    }

    formatConnectionError(error: unknown, config: ConnectionConfig): Error {
        const msg = error instanceof Error ? error.message : String(error);
        const hostPort = `${config.host}:${config.port}`;

        if (msg.includes('password authentication failed') || msg.includes('28P01')) {
            return new Error(t('database.accessDenied', config.username, hostPort));
        }
        if (msg.includes('database') && msg.includes('does not exist')) {
            return new Error(t('database.databaseNotExist', config.database || '(none)', hostPort));
        }
        if (msg.includes('ECONNREFUSED')) {
            return new Error(t('database.connectionRefused', hostPort));
        }
        if (msg.includes('ETIMEDOUT') || msg.includes('connectTimeout')) {
            return new Error(t('database.connectionTimedOut', hostPort));
        }
        if (msg.includes('ENOTFOUND')) {
            return new Error(t('database.hostNotFound', config.host));
        }

        return error instanceof Error ? error : new Error(msg);
    }

    private createPoolConfig(config: ConnectionConfig): PoolConfig {
        const poolConfig: PoolConfig = {
            host: config.host,
            port: config.port,
            user: config.username,
            password: config.password,
            database: config.database,
            max: config.poolConfig?.maxConnections ?? 5,
            min: config.poolConfig?.minConnections ?? 1,
            connectionTimeoutMillis: config.connectTimeout ?? 10000,
            idleTimeoutMillis: config.poolConfig?.idleTimeout ?? 30000,
        };

        if (config.ssl?.enabled) {
            poolConfig.ssl = {
                rejectUnauthorized: config.ssl.rejectUnauthorized ?? true,
                ca: config.ssl.ca,
                cert: config.ssl.cert,
                key: config.ssl.key,
            };
        }

        return poolConfig;
    }
}
