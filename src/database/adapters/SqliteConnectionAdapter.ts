import type { ConnectionConfig, TestConnectionResult } from './IDatabaseAdapter';
import type { SqliteSharedContext } from './SqliteSharedContext';
import { t } from '../../i18n/index';

export class SqliteConnectionAdapter {
    constructor(private shared: SqliteSharedContext) {}

    async connect(config: ConnectionConfig): Promise<void> {
        try {
            const Database = (await import('better-sqlite3')).default;
            this.shared.db = new Database(config.host, { readonly: false });
            this.shared.db.pragma('journal_mode = WAL');
            this.shared.totalConnectionCount = 1;
            this.shared.activeConnectionCount = 0;
            this.shared.lastActivityTime = Date.now();
        } catch (error: unknown) {
            this.shared.db = null;
            throw this.formatConnectionError(error, config);
        }
    }

    async disconnect(): Promise<void> {
        if (this.shared.db) {
            if (this.shared.inTransaction) {
                try {
                    this.shared.db.exec('ROLLBACK');
                } catch (e) {
                    console.debug('[SQL All in One] SQLite rollback on disconnect:', e);
                }
                this.shared.inTransaction = false;
            }
            this.shared.db.close();
            this.shared.db = null;
        }
    }

    async testConnection(config: ConnectionConfig): Promise<TestConnectionResult> {
        const startTime = Date.now();
        let tempDb: import('better-sqlite3').Database | null = null;

        try {
            const Database = (await import('better-sqlite3')).default;
            tempDb = new Database(config.host, { readonly: true });
            const version = tempDb.prepare('SELECT sqlite_version() AS version').get() as Record<string, unknown>;
            const endTime = Date.now();
            return {
                success: true,
                serverVersion: `SQLite ${version.version}`,
                latency: endTime - startTime,
            };
        } catch (error: unknown) {
            const formatted = this.formatConnectionError(error, config);
            return {
                success: false,
                error: formatted.message,
            };
        } finally {
            if (tempDb) {
                tempDb.close();
            }
        }
    }

    async checkConnectionHealth(): Promise<boolean> {
        if (!this.shared.db) {
            return false;
        }
        try {
            this.shared.db.prepare('SELECT 1').get();
            return true;
        } catch (e) {
            console.debug('[SQL All in One] SqliteConnectionAdapter.checkConnectionHealth failed:', e);
            return false;
        }
    }

    async reapIdleConnections(): Promise<void> {
        if (!this.shared.db) return;
        this.shared.lastActivityTime = Date.now();
    }

    formatConnectionError(error: unknown, config: ConnectionConfig): Error {
        const msg = error instanceof Error ? error.message : String(error);

        if (msg.includes('SQLITE_CANTOPEN') || msg.includes('unable to open database')) {
            return new Error(t('database.databaseNotExist', config.host, config.host));
        }
        if (msg.includes('SQLITE_READONLY')) {
            return new Error(`SQLite database is read-only: ${config.host}`);
        }

        return error instanceof Error ? error : new Error(msg);
    }
}
